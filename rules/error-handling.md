# Error Handling

## Rule #1: Result envelope ทุก server function — ไม่ throw

ดู `rules/web-app-rpc.md` Rule #1 — สรุปอีกที:

```javascript
function anyServerFunction(...args) {
  try {
    // ...
    return { ok: true, data: ... };
  } catch (err) {
    Logger.log('[funcName] ' + (err.stack || err));
    return { ok: false, message: err.message || String(err) };
  }
}
```

---

## Rule #2: user-facing message ภาษาไทย — developer log ภาษาอังกฤษ

```javascript
function checkIn(callerUserId, visitId, lat, lng) {
  try {
    const visit = readVisit_(visitId);
    if (!visit) {
      Logger.log('[checkIn] visit not found: ' + visitId);
      throw new Error('ไม่พบนัดหมาย กรุณารีเฟรชหน้าจอ');
    }
    const distance = haversine_(lat, lng, visit.HouseLat, visit.HouseLng);
    if (distance > 1000) {
      Logger.log('[checkIn] too far: ' + distance + 'm');
      throw new Error('คุณอยู่ห่างจากบ้านผู้ป่วยเกิน 1 กม. (วัดได้ ' + Math.round(distance) + ' ม.)');
    }
    // ...
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
```

**Pattern:** Logger.log สำหรับ context (technical) — `err.message` สำหรับ user (actionable Thai)

---

## Rule #3: catch + rethrow — เพิ่ม context

```javascript
try {
  generatePdfForRecord(...);
} catch (err) {
  throw new Error('สร้าง PDF ของ record ' + recordId + ' ล้มเหลว: ' + err.message);
}
```

---

## Rule #4: ห้าม swallow error เงียบ ๆ

```javascript
// ✗ Bad — error หาย ไม่รู้ว่าพังตรงไหน
try {
  doStuff();
} catch (e) {}

// ✓ Good — log อย่างน้อยที่สุด
try {
  doStuff();
} catch (e) {
  Logger.log('[doStuff] silenced: ' + (e.stack || e));
}

// ✓ Good — ระบุชัดว่าทำไม OK ที่ผ่าน
try {
  DriveApp.getFileById(oldId).setTrashed(true);
} catch (e) {
  // ไฟล์ถูกลบไปแล้ว — OK ไม่ใช่ error
}
```

---

## Rule #5: error message ที่ user actionable — ไม่ใช่ "Error"

### ✗ Bad

```javascript
throw new Error('Error');
throw new Error('Invalid input');
throw new Error('Failed');
```

### ✓ Good

```javascript
throw new Error('กรุณากรอกชื่อวิชา');
throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
throw new Error('คุณไม่มีสิทธิ์ลบ record ของคนอื่น');
```

แต่ละ message ตอบ 2 คำถาม:
1. **อะไรพัง?** (ผู้ใช้ทำอะไรผิด หรือระบบเจออะไร)
2. **ทำอะไรต่อ?** (กรอกใหม่, ติดต่อ admin, รอลองใหม่)

---

## Rule #6: GAS error messages ที่ต้องแปล (พบบ่อย)

| GAS native | แปลให้ user |
|---|---|
| `ข้อผิดพลาดของบริการ: สเปรดชีต` | "ระบบ Sheet ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" + log จริง |
| `Service Spreadsheets failed while accessing document` | "เปิดเอกสารไม่ได้ — ตรวจสอบสิทธิ์" |
| `Exception: Address unavailable` | "เชื่อมต่อ API ภายนอกไม่ได้ กรุณาลองใหม่" |
| `Lock wait timeout` | "ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่ในอีกสักครู่" |
| `Exceeded maximum execution time` | "ประมวลผลใช้เวลานานเกินกำหนด — กรุณาแบ่งงานเป็นชุดเล็ก" |

```javascript
function translateError_(err) {
  const msg = String(err.message || err);
  if (msg.includes('ข้อผิดพลาดของบริการ')) {
    return 'ระบบ Sheet ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
  }
  if (msg.includes('Lock')) {
    return 'ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่ในอีกสักครู่';
  }
  if (msg.includes('execution time')) {
    return 'ประมวลผลใช้เวลานานเกินกำหนด กรุณาลองใหม่';
  }
  return msg;
}
```

---

## Rule #7: client แสดง error เป็น modal ไม่ใช่ console

```javascript
// ✗ Bad
console.error(res.message);

// ✓ Good
Swal.fire('ผิดพลาด', res.message, 'error');
```

ระดับความรุนแรง:
- `error` (สีแดง) — ทำต่อไม่ได้ ต้องแก้
- `warning` (สีเหลือง) — มีปัญหา แต่ทำงานต่อได้
- `info` (สีฟ้า) — แค่แจ้งข่าว

---

## Rule #8: retry pattern สำหรับ transient error

```javascript
async function rpcWithRetry(name, ...args) {
  const maxAttempts = 3;
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await rpc(name, ...args);
      if (res.ok) return res;
      // ถ้า error เป็น lock/transient — retry
      if (/lock|busy|timeout|service/i.test(res.message)) {
        await sleep(1000 * (i + 1));
        continue;
      }
      return res; // permanent error — ไม่ retry
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  return { ok: false, message: 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่ภายหลัง' };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
```
