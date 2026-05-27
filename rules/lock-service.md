# LockService — Concurrency Control

## Rule #1: ใช้ `LockService.getScriptLock()` รอบ mutation ที่ user หลายคนอาจชนกัน

**Why:** GAS รัน function ใน parallel — 2 คนกด "สร้าง PDF" พร้อมกัน อาจ:
- สร้าง temp sheet ชื่อซ้ำ
- เขียน row เดียวกันทับกัน
- export PDF ที่ template ยังไม่ flush

### ✓ Good

```javascript
function generatePdfForRecord(callerUserId, rowIndex) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่ในอีกสักครู่');
  }
  try {
    // ... mutation ที่ต้อง atomic ...
    return { ok: true, /* ... */ };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    lock.releaseLock(); // **บังคับใส่ใน finally**
  }
}
```

---

## Rule #2: เลือก scope ของ lock ให้ถูก

| Lock | Scope | ใช้เมื่อ |
|---|---|---|
| `getScriptLock()` | ทั้ง script (cross-user) | mutation ที่ต้อง atomic ทั้งระบบ (PDF gen, transaction) |
| `getDocumentLock()` | เฉพาะ container document | bound script ที่ปรับ active doc |
| `getUserLock()` | เฉพาะ user คนเดียว | กัน user spam click ปุ่มเดียวกันรัว ๆ |

ส่วนใหญ่ใช้ `getScriptLock()` — เลือก `getUserLock()` ก็ต่อเมื่อ rate-limit รายคนพอ ไม่ต้องป้องกัน race condition ระหว่างคน

---

## Rule #3: tryLock timeout ต้องสมเหตุสมผล — อย่าใช้ 0 หรือใหญ่เกิน

- **0ms** — fail ทันทีถ้าใครถืออยู่ → user เจอ error บ่อย UX แย่
- **30000ms (30s)** — รอนานพอ แต่ไม่ถึงกับให้ user รู้สึกค้าง
- **> 5 นาที** — เกินครึ่ง quota execution (6 min) ถ้าเปิดทิ้งไว้นาน script crash หมด

### ✓ ค่ามาตรฐาน

```javascript
const TIMEOUT_PDF = 30000;       // PDF gen 30s
const TIMEOUT_QUICK_WRITE = 5000;  // append row 5s
const TIMEOUT_RARE_BATCH = 60000;  // import 100 rows 1 min
```

---

## Rule #4: `finally { lock.releaseLock(); }` เสมอ — แม้ error

**Bug จริง:** ถ้า throw ก่อน releaseLock + ไม่มี finally — lock ค้าง 6 นาทีจนกว่า script timeout — ทุก request หลังจากนี้ tryLock fail

```javascript
// ✗ Bad
const lock = LockService.getScriptLock();
lock.waitLock(30000);
doStuff(); // ถ้า throw → lock ค้าง!
lock.releaseLock();

// ✓ Good
const lock = LockService.getScriptLock();
if (!lock.tryLock(30000)) throw new Error('busy');
try {
  doStuff();
} finally {
  lock.releaseLock();
}
```

---

## Rule #5: **ห้าม** lock รอบ `UrlFetchApp` หรือ trigger ที่ใช้เวลานาน

**Why:** ทุก millisecond ใน lock = block user อื่น

### ✗ Bad

```javascript
const lock = LockService.getScriptLock();
lock.waitLock(30000);
try {
  const data = UrlFetchApp.fetch('https://slow-api.com/...'); // 10 วินาที
  saveToSheet(data); // เร็ว
} finally { lock.releaseLock(); }
```

### ✓ Good — fetch นอก lock

```javascript
const data = UrlFetchApp.fetch('https://slow-api.com/...'); // 10 วินาที (ไม่ lock)
const lock = LockService.getScriptLock();
if (!lock.tryLock(5000)) throw new Error('busy');
try {
  saveToSheet(data); // เร็ว lock แค่นี้
} finally { lock.releaseLock(); }
```

---

## Rule #6: ใช้ unique temp resource name แม้มี lock แล้ว — defense in depth

```javascript
// แม้ lock อยู่ก็ใช้ timestamp + random
const tempName = '__pdf_temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
```

เผื่อกรณี lock ค้าง (rare แต่เกิดได้) + script ลืม cleanup temp sheet จากครั้งก่อน
