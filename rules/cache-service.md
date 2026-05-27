# CacheService — Reduce Sheet Round-Trips

## Rule #1: cache query ที่อ่านบ่อย + เปลี่ยนน้อย

ตัวอย่าง: ดึง user profile จาก Users sheet ทุก RPC call — เปลือง 200ms per call

### ✓ Good

```javascript
function findUserById_(userId) {
  const cache = CacheService.getScriptCache();
  const ck = 'user_' + userId;
  const cached = cache.get(ck);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('Users');
  const user = readSheet_(sh).find(r => String(r.UserID) === String(userId));
  if (user) {
    try { cache.put(ck, JSON.stringify(user), 600); } catch (e) {} // 10 min
  }
  return user;
}
```

---

## Rule #2: invalidate cache ทุกครั้งที่ data เปลี่ยน

```javascript
function invalidateUserCache_(userId) {
  try { CacheService.getScriptCache().remove('user_' + userId); } catch (e) {}
}

function changeMyPassword(callerUserId, oldPwd, newPwd) {
  // ... update sheet ...
  invalidateUserCache_(callerUserId); // 💡
  return { ok: true };
}
```

**Pattern:** ทุก write ที่กระทบ row → remove cache key — ถ้าลืม จะเจอ "ทำไม UI ไม่อัพเดท" สอบ 30 นาที

---

## Rule #3: TTL ขึ้นกับลักษณะ data

| Type | TTL | เหตุผล |
|---|---|---|
| User profile, role | 600s (10 min) | เปลี่ยนน้อย, ทน stale ได้ |
| Config (folder ID, settings) | 3600s (1 hr) | แทบไม่เปลี่ยน |
| Aggregate count (ทั้งหมด, รอตรวจ) | 60s | ผู้ใช้คาดหวังเห็นเลขใหม่ |
| Sensitive (auth token) | 300s | ปลอดภัย + ลด query |

`CacheService.getScriptCache()` มี max TTL = 21600s (6 hr) — ใส่เกินไม่ error แต่ตัดเป็น 21600

---

## Rule #4: cache key มี prefix ป้องกันชน

```javascript
const CK = {
  user: (id) => 'user_' + id,
  config: (key) => 'cfg_' + key,
  recordCount: (folderId) => 'reccnt_' + folderId,
};
```

---

## Rule #5: ScriptCache มี size limit 100KB per key

ถ้า payload ใหญ่ → split หรือ cache แค่ ID list แล้วดึงตัวเต็มเป็น ๆ ทีเดียว

```javascript
// ✗ Bad — cache ทั้ง array ของ records ที่อาจหลายร้อย row
cache.put('all_records', JSON.stringify(allRecords)); // อาจเกิน 100KB

// ✓ Good — cache แค่ list ของ ID, ตัวเต็มอ่าน sheet ตอนใช้
cache.put('record_ids_pending', JSON.stringify(ids));
```

---

## Rule #6: try/catch รอบ `cache.put()` — fail ไม่ใช่ critical

```javascript
try {
  cache.put(ck, JSON.stringify(v), 600);
} catch (e) {
  // payload ใหญ่เกิน, quota เต็ม — ignore ไม่ใช่ critical path
}
```

---

## Rule #7: CacheService vs PropertiesService

| | CacheService | PropertiesService |
|---|---|---|
| TTL | มี (สูงสุด 6 ชม.) | ไม่มี (ถาวร) |
| ขนาด | 100KB/key, 24MB total | 9KB/key, 500KB total |
| ใช้กับ | query cache, อ่าน stale ได้ | flag, config ที่ต้องคงอยู่ |
| Performance | เร็ว (in-memory) | ช้ากว่า (persistent) |

**ห้ามใช้ PropertiesService เป็น cache** — มันคือ DB ไม่ใช่ cache TTL ไม่มี
