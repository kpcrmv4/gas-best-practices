# Data Integrity — กันเขียนทับ, กันลบยกชุด, ตรวจหลังแก้

ไฟล์นี้ว่าด้วย GAS ที่ทำหน้าที่เป็น **ฐานข้อมูลจริงของงานที่แก้ไม่ได้** (ยอดเงิน, สต๊อก, ทะเบียนเลขที่) — บักในหมวดนี้ไม่ทำให้โปรแกรม error แต่ทำให้ **ข้อมูลผิดเงียบ ๆ**

| # | Rule |
|---|---|
| 1 | บังคับให้ client ส่ง `rev` ทุกครั้งที่เขียนทับทั้งชุด — ไม่ส่ง = ปฏิเสธ |
| 2 | circuit breaker กันลบยกชุด |
| 3 | งานหลังบันทึกต้องอยู่ใน try/catch — ห้ามทำให้ save ที่สำเร็จแล้วกลายเป็น error |
| 4 | field ที่ server เป็นเจ้าของ ห้ามให้ payload จาก client ทับ |
| 5 | reconcile ต้องอ่านจาก **ทุกที่** ที่เก็บค่าจริง |
| 6 | ยืนยันผลด้วย "ตัวตน" ไม่ใช่ "ยอดรวม" |

---

## Rule #1: บังคับให้ client ส่ง `rev` ทุกครั้งที่เขียนทับทั้งชุด — ไม่ส่ง = ปฏิเสธ

**Why:** production จริง — แท็บเบราว์เซอร์ที่ค้างไว้ 3 สัปดาห์ถูกเปิดขึ้นมาใหม่ แล้ว sync state เก่าใน `localStorage` ขึ้นทับ ลบการจอง 179 รายการในวินาทีเดียว โค้ดมีด่านเช็ค `rev` อยู่แล้ว แต่เขียนเป็น "ถ้า*มี* `rev` แล้วค่อยเทียบ" — client เก่าที่ไม่รู้จัก field นี้เลยผ่านฉลุย

ด่าน optimistic lock ที่ข้ามได้ด้วยการ**ไม่ส่ง field** ไม่ใช่ด่าน

### ✗ Bad

```javascript
// ผ่านได้ถ้า body.rev เป็น undefined / '' / ไม่ส่งมาเลย
if (body.rev !== undefined && body.rev !== null && body.rev !== '' &&
    !isNaN(Number(body.rev)) && Number(body.rev) !== curRev) {
  return json_({ ok: false, conflict: true, rev: curRev, state: readState_() });
}
writeState_(body.state);
```

### ✓ Good

```javascript
var curRev = rev_();
var sentRev = Number(body.rev);

// ไม่ส่ง rev = client เก่า / ไม่รู้ว่าข้อมูลตัวเองเก่าแค่ไหน → ปฏิเสธ
if (body.rev === undefined || body.rev === null || body.rev === '' || isNaN(sentRev)) {
  return json_({
    ok: false, conflict: true, rev: curRev, state: readState_(),
    error: 'คำขอบันทึกไม่ได้ระบุเวอร์ชันข้อมูล — ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาลองบันทึกใหม่'
  });
}
if (sentRev !== curRev) {
  return json_({ ok: false, conflict: true, rev: curRev, state: readState_(),
                 error: 'มีคนอื่นบันทึกไปก่อน — โหลดข้อมูลล่าสุดให้แล้ว' });
}
```

**Edge case:** ตอบ conflict ให้แนบ `state` ล่าสุดกลับไปด้วยเสมอ — client จะได้ merge ต่อได้ทันที ไม่ต้องยิงอีกรอบ (ซึ่งบน GAS = เข้าคิวอีกรอบ)

---

## Rule #2: circuit breaker กันลบยกชุด

**Why:** `rev` กันได้เฉพาะ "ข้อมูลเก่าเขียนทับข้อมูลใหม่" แต่ **ไม่กัน bug ฝั่ง client ที่ส่ง state พังมาพร้อม rev ที่ถูกต้อง** — เช่น state ว่างเปล่าเพราะ parse ล้มเหลว ถ้าไม่มีเพดาน การบันทึกครั้งเดียวลบทั้งฐานข้อมูลได้

ขีดจำกัดควรตั้งจาก "พฤติกรรมปกติของคนใช้งาน" (คนกดลบทีละ 1-2 รายการ) ไม่ใช่จากขนาดข้อมูล

### ✓ Good

```javascript
var MAX_DELETES_PER_SAVE = 5;

var deletes = pendingChanges.filter(function (c) { return c.action === 'ลบการจอง'; });
if (deletes.length > MAX_DELETES_PER_SAVE && body.confirmBulkDelete !== true) {
  return json_({
    ok: false, bulkDeleteBlocked: true, rev: curRev, state: readState_(),
    deleteCount: deletes.length,
    deleteNames: deletes.slice(0, 10).map(function (c) { return c.name; }),
    error: 'คำขอนี้จะลบ ' + deletes.length + ' รายการพร้อมกัน — ระบบระงับไว้ก่อน'
  });
}
```

**Edge case:** ทางปลดล็อกต้องเป็นสิ่งที่ "จงใจส่ง" (`confirmBulkDelete: true`) และ **ห้ามมีปุ่มยืนยันในหน้าเว็บ** ที่คนกดพลาดได้ — ให้ลบจริงผ่าน custom menu ในชีทแทน ([onopen-menu.md](onopen-menu.md))

---

## Rule #3: งานหลังบันทึกต้องอยู่ใน try/catch — ห้ามทำให้ save ที่สำเร็จแล้วกลายเป็น error

**Why:** `writeState_()` เขียนลงชีทไปแล้ว = commit แล้ว ถ้า `refreshSummaries_()` ที่ตามมา throw ผู้ใช้จะเห็น "บันทึกไม่สำเร็จ" ทั้งที่ข้อมูลเข้าเรียบร้อย → กดซ้ำ → ข้อมูลซ้ำ

### ✗ Bad

```javascript
writeState_(body.state);
refreshSummaries_();      // throw ที่นี่ = ผู้ใช้เห็นว่า save fail
return json_({ ok: true, rev: bumpRev_() });
```

### ✓ Good

```javascript
writeState_(body.state);
var newRev = bumpRev_();

// derived data ซ่อมทีหลังได้ แต่ "บอกผู้ใช้ผิด" ซ่อมไม่ได้
var summaryError = null;
try {
  refreshSummaries_();
} catch (e) {
  summaryError = String(e && e.message || e);
  Logger.log('[doPost] refreshSummaries_ failed after commit: ' + summaryError);
}
return json_({ ok: true, rev: newRev, summaryError: summaryError });
```

**Edge case:** ใช้หลักนี้กับ **ทุกอย่างที่อยู่หลังจุด commit** — ส่งเมล, เขียน audit log, ล้าง cache, เรียก API ภายนอก

---

## Rule #4: field ที่ server เป็นเจ้าของ ห้ามให้ payload จาก client ทับ

**Why:** frontend รู้จักข้อมูลแค่บางส่วน ถ้า `writeState_` เขียนทั้งแถวจาก object ที่ client ส่งมา ค่าที่ client ไม่มี (ยอดเงินที่บันทึกจากอีกหน้าจอ, สถานะที่ระบบคำนวณเอง) จะถูกล้างเป็นค่าว่าง — เงียบสนิท ไม่มี error

### ✗ Bad

```javascript
rows.push([b.id, b.name, b.kind, b.phone,
           Number(b.paidAmount) || '',           // client ไม่รู้ยอดนี้ → ล้างเป็นว่าง
           ST_TH[b.status] || 'ยังไม่ชำระ']);    // สถานะที่ซ่อมไว้แล้ว ถูกตีกลับ
```

### ✓ Good

```javascript
// 1) อ่านค่าที่ server เป็นเจ้าของไว้ก่อน — เก็บเฉพาะแถวที่ "มีค่าอยู่จริง"
//    แถวที่ยังว่างไม่ต้องเก็บ ปล่อยให้ client เขียนค่าแรกเข้ามาได้
var keepPaid = {}, keepStatus = {};
existingRows.forEach(function (r) {
  var id = r['รหัส'];
  if (r['ยอดที่รับจริง'] !== '' && r['ยอดที่รับจริง'] != null) keepPaid[id] = r['ยอดที่รับจริง'];
  if (r['สถานะ']) keepStatus[id] = r['สถานะ'];
});

// 2) แถวไหนที่ระบบมีค่าของตัวเองอยู่แล้ว = ล็อก ไม่ให้ payload จาก client ทับ
var hasOwn = Object.prototype.hasOwnProperty;
var rows = body.state.bookings.map(function (b) {
  return [b.id, b.name, b.kind, b.phone,
          hasOwn.call(keepPaid, b.id)   ? keepPaid[b.id]   : (Number(b.paidAmount) || ''),
          hasOwn.call(keepStatus, b.id) ? keepStatus[b.id] : (ST_TH[b.status] || 'ยังไม่ชำระ')];
});
```

**Edge case:** ตรวจว่า "ล็อก" ผูกกับค่าที่ server มีอยู่จริง ไม่ใช่ flag ที่ประกาศไว้เฉย ๆ — ธง `locked` ที่ไม่เคยถูกเซตเป็น `true` จะเงียบสนิทและทำตัวเหมือนไม่มีด่านเลย

**Edge case 2:** ทางที่สะอาดกว่าคือ **อย่าให้ client ส่ง field พวกนี้มาเลย** — ให้แก้ผ่าน endpoint เฉพาะทาง (`action=recordPayment`) ที่ตรวจสิทธิ์และคำนวณเองฝั่ง server ([web-app-rpc.md](web-app-rpc.md) Rule: คำนวณค่าสำคัญซ้ำฝั่ง server)

---

## Rule #5: reconcile ต้องอ่านจาก **ทุกที่** ที่เก็บค่าจริง

**Why:** เขียน job ซ่อมสถานะ "ใครจ่ายแล้วแต่ยังขึ้นว่าค้าง" โดยอ่านจากคอลัมน์ยอดเงินในตารางหลักอย่างเดียว → รันแล้วซ่อมได้ 0 รายการ เพราะแถวที่พังคือแถวที่เงินถูกบันทึกไว้ใน **ตารางรับเงินอีกใบ** ไม่ใช่ในคอลัมน์นั้น

ก่อนเขียน reconcile ให้ไล่ก่อนว่าค่าเดียวกันนี้ถูกบันทึกได้จากกี่ทาง

### ✓ Good

```javascript
function reconcilePaidStatus_(bookingRows, paymentRows) {
  var logPaid = {};
  paymentRows.forEach(function (p) {
    logPaid[p['รหัสผู้จอง']] = (logPaid[p['รหัสผู้จอง']] || 0) + (Number(p['ยอดที่รับ']) || 0);
  });

  var fixed = 0;
  bookingRows.forEach(function (b) {
    // เงินอยู่ได้ 2 ที่ → เอาค่าที่มี ไม่ใช่บวกกัน (บวก = นับซ้ำ)
    var paid = Number(b['ยอดที่รับจริง']) || logPaid[b['รหัส']] || 0;
    if (paid >= Number(b['ยอดที่ต้องชำระ']) && b['สถานะ'] !== 'ชำระแล้ว') {
      sh.getRange(b._row, ST_COL).setValue('ชำระแล้ว');  // upgrade ทางเดียว
      fixed++;
    }
  });
  return fixed;
}
```

**Edge case:** job ซ่อมข้อมูลควร **ขึ้นทางเดียว** (ยังไม่จ่าย → จ่ายแล้ว) ห้าม downgrade อัตโนมัติ — ถ้าลอจิกผิด upgrade ผิดยัง audit ย้อนได้ แต่ downgrade ผิดจะไปลบสถานะที่คนกรอกมือไว้

**Edge case 2:** หลังรัน reconcile ต้อง `bumpRev_()` + invalidate cache ด้วย ไม่งั้นหน้าเว็บยังเสิร์ฟค่าเดิมจาก cache จนดูเหมือน job ไม่ทำงาน ([cache-service.md](cache-service.md) Rule #2)

---

## Rule #6: ยืนยันผลด้วย "ตัวตน" ไม่ใช่ "ยอดรวม"

**Why:** ย้ายเล่มบัตรให้หน่วยงานหนึ่ง แล้วตรวจว่า "280 ใบ · 63,500 บาท · คงเหลือ 0" — ผ่านทุกข้อ **แต่เป็นคนละเล่มกับของจริงที่ส่งถึงมือคนไปแล้ว** จำนวนถูก ตัวตนผิด และ checksum แบบยอดรวมจับไม่ได้เลย

ข้อมูลที่มี "ตัวตน" (เลขที่เอกสาร, เลขบัตร, serial, เลขที่นั่ง) ต้องเทียบ**ตัวเลขจริงทีละตัว**

### ✓ Good — endpoint ตรวจรายรายการ เรียกได้ทั้งก่อนและหลังแก้

```javascript
function crossCheckOne_(code) {
  var actual = readAssignedNumbers_(code);      // ที่ระบบถืออยู่จริง
  var expect = readRegistryNumbers_(code);      // ที่ทะเบียนต้นทางบอก

  return {
    code: code,
    countMatch: actual.length === expect.length,
    missing: expect.filter(function (n) { return actual.indexOf(n) < 0; }),
    extra:   actual.filter(function (n) { return expect.indexOf(n) < 0; }),
    actual: fmtRuns_(actual),                   // "261-262, 280-289"
    expect: fmtRuns_(expect)
  };
}
```

ผลที่ยอมรับได้มีแบบเดียว: `missing` และ `extra` **ว่างทั้งคู่** — `countMatch: true` เฉย ๆ ไม่นับ

**Edge case:** เอาต์พุตบีบเป็นช่วง (`261-262, 280-289`) ให้คนอ่านจับผิดได้ด้วยตา — รายการเลข 280 ตัวเรียงกันคนไม่อ่าน

**Edge case 2:** เครื่องมือตรวจที่สร้างไว้แล้วแต่ไม่ได้หยิบมาใช้ = ไม่มี ถ้ามี endpoint แบบนี้ ให้รัน **ก่อนแก้และหลังแก้** ทุกครั้ง แล้วแปะผลทั้งสองรอบให้ผู้ใช้เทียบ
