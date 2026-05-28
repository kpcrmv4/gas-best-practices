# Spreadsheet Operations

## Rule #1: อ่าน Sheet ครั้งเดียวด้วย `getDataRange().getValues()`

**Why:** ทุก `getValue()`/`getRange()` call คือ round-trip ไปยัง Google server — แค่ 1 sheet × 100 row × 10 col = 1,000 calls = หลุด quota timeout (6 min)

### ✗ Bad — N+1 calls

```javascript
for (let i = 2; i <= sheet.getLastRow(); i++) {
  const id = sheet.getRange(i, 1).getValue();  // round-trip
  const name = sheet.getRange(i, 2).getValue(); // round-trip
  // ...
}
```

### ✓ Good — bulk read

```javascript
function readSheet_(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues(); // 1 round-trip
  if (data.length <= 1) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = data[i][j];
    o.__rowIndex = i + 1; // 1-based sheet row สำหรับ update ทีหลัง
    rows.push(o);
  }
  return rows;
}
```

---

## Rule #2: ห้าม `range.setValues()` บน sheet ที่อาจมี merged cells

**Why:** `range.setValues(values)` จะ throw `Exception: ข้อผิดพลาดของบริการ: สเปรดชีต` (Spreadsheet service error) ถ้าใน range มี merged cells — เพราะ Sheets ไม่อนุญาต write หลายค่าทับ merge เดียว

นี่เป็น bug ที่เคยเจอบน **PDF template ที่ใช้ placeholder** (`{{PLACEHOLDER}}`) แทบทุก template มี header merge

### ✗ Bad

```javascript
const range = sheet.getDataRange();
const values = range.getValues();
// ...modify values...
range.setValues(values); // 💥 ถ้ามี merged cells
```

### ✓ Good — per-cell setValue เฉพาะที่เปลี่ยน

```javascript
const range = sheet.getDataRange();
const values = range.getValues();
for (let r = 0; r < values.length; r++) {
  for (let c = 0; c < values[r].length; c++) {
    const orig = values[r][c];
    // ...compute next...
    if (next !== orig) {
      try {
        sheet.getRange(r + 1, c + 1).setValue(next);
      } catch (e) {
        Logger.log('skip r=' + (r + 1) + ' c=' + (c + 1) + ': ' + e.message);
      }
    }
  }
}
```

---

## Rule #3: append row ตาม header order — ห้าม hardcode column index

**Why:** ถ้ามีคนเพิ่มคอลัมน์กลางตาราง position-based index จะเลื่อน → ข้อมูลพังเงียบ ๆ

### ✓ Good

```javascript
function appendRowByHeaders_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => obj[h] != null ? obj[h] : ''));
}

// Usage
appendRowByHeaders_(sh, {
  RecordID: 'REC001',
  Timestamp: new Date().toISOString(),
  Status: 'pending',
  // ไม่ครบทุก column ก็ได้ — ตัวที่ขาดจะเป็น ''
});
```

---

## Rule #4: column index lookup โดย header name

```javascript
function colIndex_(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx < 0) throw new Error('ไม่พบ column: ' + headerName);
  return idx + 1; // 1-based
}

// Update เฉพาะคอลัมน์เดียวของ row เฉพาะ
sheet.getRange(rowIndex, colIndex_(sheet, 'Status')).setValue('approved');
```

---

## Rule #5: `SpreadsheetApp.flush()` หลัง mutation ก่อนอ่านใหม่หรือ return

**Why:** Apps Script batch write — ถ้าไม่ flush แล้วอ่านทันที อาจได้ค่าเก่า

```javascript
sh.getRange(rowIndex, colIndex_(sh, 'Status')).setValue('approved');
SpreadsheetApp.flush();
// ตอนนี้อ่านได้ค่าใหม่แล้ว
```

---

## Rule #6: Date object handling — สามด่านที่ต้องระวัง

Date ใน GAS หลุดง่ายมากเพราะข้าม 3 boundary: **Sheet ↔ GAS server ↔ client browser** แต่ละ boundary มี gotcha คนละแบบ

### #6.1 — `google.script.run` ไม่ serialize `Date` object → ส่งกลับเป็น `{}`

```javascript
// ✗ Bad
function getRecord() {
  return { Timestamp: new Date() }; // client ได้ {} เปล่า
}

// ✓ Good — แปลงเป็น ISO string ก่อนส่ง client
function sanitizeForClient_(obj) {
  const out = {};
  for (const k in obj) {
    if (k === '__rowIndex') continue;
    const v = obj[k];
    if (v instanceof Date) out[k] = v.toISOString();
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = sanitizeForClient_(v);
    else out[k] = v;
  }
  return out;
}
```

### #6.2 — Sheet cell ที่เป็น Date type จะกลับมาเป็น Date object — ไม่ใช่ string

`getDataRange().getValues()` คืน cell type ตามที่ Sheet เก็บ — ถ้า user พิมพ์ `28/5/2026` ลงไป **Sheets แปลงเป็น Date object** (ไม่ใช่ "28/5/2026" string)

```javascript
// ✗ Bad — assume string เสมอ
const ts = row.Timestamp;
console.log(ts.indexOf('2026')); // 💥 ถ้า ts เป็น Date — .indexOf is not a function

// ✓ Good — normalize ทุกครั้ง
function toIsoOrEmpty_(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}
```

### #6.3 — Timezone trap: GAS server vs spreadsheet vs client

3 timezone ที่ต่างกันได้:
- **Script timezone** — set ใน `appsscript.json` (`"timeZone": "Asia/Bangkok"`)
- **Spreadsheet timezone** — File → Settings → Time zone (อาจคนละค่ากับ script!)
- **Client browser** — TZ ของผู้ใช้

```javascript
// ✗ Bad — toLocaleDateString() ใช้ TZ ของ server (ไม่ใช่ user)
const display = new Date().toLocaleDateString('th-TH');

// ✓ Good — บังคับ TZ ที่ต้องการ
const display = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
// → "28/05/2026 14:30"

// ✓ Good — ส่ง ISO ให้ client แล้ว client format เอง (ตาม locale)
return { ts: new Date().toISOString() }; // ISO = UTC
```

### #6.4 — เก็บ timestamp เป็น ISO string ใน Sheet ไม่ใช่ Date type

**Why:** Date type ใน Sheet ถูกแปลงตาม **spreadsheet timezone** + display format ของ cell — ถ้า admin เปลี่ยน TZ ของ spreadsheet ค่าจะเลื่อน

```javascript
// ✗ Risky — เก็บ Date object
appendRowByHeaders_(sh, { Timestamp: new Date() });
// Sheet แสดงตาม spreadsheet TZ — เปลี่ยน TZ → ค่าเลื่อน

// ✓ Robust — เก็บ ISO string (TZ-aware, ไม่เลื่อน)
appendRowByHeaders_(sh, { Timestamp: new Date().toISOString() });
// "2026-05-28T07:30:00.000Z" — ค่าคงที่ ไม่ขึ้นกับ TZ ของ sheet
```

แต่ต้องตั้ง **column format เป็น Plain text** ก่อน — ไม่งั้น Sheets อาจ auto-parse ISO เป็น Date

### #6.5 — Parse user input ที่อาจเป็นวันที่หลายรูปแบบ

```javascript
function parseThaiDate_(input) {
  if (input instanceof Date) return input;
  const s = String(input || '').trim();
  if (!s) return null;

  // ISO: 2026-05-28T... or 2026-05-28
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);

  // dd/MM/yyyy or dd/MM/yy (พ.ศ. ก็ได้)
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    y = parseInt(y);
    if (y > 2400) y -= 543;          // พ.ศ. → ค.ศ.
    else if (y < 100) y += 2000;     // 2-digit year
    return new Date(y, parseInt(mo) - 1, parseInt(d));
  }
  return null;
}
```

---

## Rule #6.6: บังคับฟิลด์ตัวเลขที่ขึ้นต้นด้วย 0 ให้เป็น text — กันเลขนำหน้าหาย

**Bug จริง:** เก็บเบอร์โทร `0812345678` ลง Sheet → กลายเป็น `812345678` (เลข 0 หาย) เพราะ Sheets autoparse เป็น number

ฟิลด์ที่ต้องระวัง:
- เบอร์โทรไทย (`08x-xxx-xxxx`)
- เลขบัตรประชาชน 13 หลัก (อาจขึ้นต้น 0 ในบางกรณี)
- รหัสไปรษณีย์ (`10110` OK แต่ `01234` → `1234`)
- account number ของธนาคาร
- เลข PO / invoice ที่มี prefix (`PO0001`, `INV0042`)
- รหัสครู/นักเรียน (`T0001`, `S0042`)
- รหัส RecordID ที่เป็น number (เคยเจอ `0001` กลายเป็น `1`)

### Approach 1: ตั้ง column format = Plain text ก่อน (recommended)

```javascript
function ensureTextColumn_(sheet, headerName) {
  const col = colIndex_(sheet, headerName);
  const lastRow = Math.max(sheet.getMaxRows(), 1000);
  sheet.getRange(1, col, lastRow, 1).setNumberFormat('@');
}

// เรียกใน ensureSchema()
function ensureSchema() {
  const sh = ss.getSheetByName('Users');
  ensureColumn_(sh, 'Phone');
  ensureColumn_(sh, 'NationalId');
  ensureColumn_(sh, 'EmployeeCode');

  ensureTextColumn_(sh, 'Phone');         // 📌
  ensureTextColumn_(sh, 'NationalId');    // 📌
  ensureTextColumn_(sh, 'EmployeeCode');  // 📌
}
```

`setNumberFormat('@')` = `@` คือ text format code — ตัวเลขจะถูกเก็บเป็น string ตรง ๆ ไม่ parse

### Approach 2: prefix `'` (apostrophe) ก่อนค่า

```javascript
// ✗ Bad
sh.getRange(row, col).setValue('0812345678'); // ยังโดน autoparse → 812345678

// ✓ Good — apostrophe นำหน้า บังคับ Sheet เก็บเป็น text
sh.getRange(row, col).setValue("'" + phone);  // เก็บ "0812345678" ถูก
// Sheet ไม่แสดง apostrophe (ตัวมันเป็น escape character)
```

**Caveat:** ถ้าใช้ `appendRow([...])` หรือ `setValues([[...]])` หลายค่าพร้อมกัน — ต้องใส่ apostrophe ทุก cell ที่ต้องการ text

### Approach 3: helper สำหรับ append ที่บังคับ text ฟิลด์ที่กำหนด

```javascript
const TEXT_FIELDS = ['Phone', 'NationalId', 'EmployeeCode', 'StudentId', 'PostalCode'];

function appendRowSafe_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    const v = obj[h];
    if (v == null) return '';
    // เก็บ field ตัวเลขที่อาจมี leading zero เป็น text
    if (TEXT_FIELDS.includes(h) && /^\d/.test(String(v))) {
      return "'" + String(v);
    }
    return v;
  });
  sheet.appendRow(row);
}
```

### ✓ Defense in depth — ใช้ทั้ง column format + apostrophe

```javascript
// 1. ensureSchema set column format = '@'
ensureTextColumn_(sh, 'Phone');

// 2. helper เติม apostrophe ตอน write
appendRowSafe_(sh, { Phone: payload.phone });

// 3. validate input ฝั่ง server
if (!/^0\d{8,9}$/.test(payload.phone)) throw new Error('เบอร์โทรไม่ถูกต้อง');
```

### ⚠️ Pitfall: format ที่ตั้งแล้วไม่ apply ย้อนหลัง

ถ้า sheet มีข้อมูลอยู่แล้วและ format เป็น `Automatic` — เลข `0812345678` ถูก parse เป็น `812345678` ไปแล้ว
ตั้ง `setNumberFormat('@')` ภายหลังจะ**ไม่กู้ leading zero กลับมา** — ค่าใน cell เป็น number 812345678 แล้ว

**ทำ:**
```javascript
// migration: เติม 0 กลับให้ phone ที่หายไป
function migratePhoneFormat_(sh) {
  ensureTextColumn_(sh, 'Phone');
  const col = colIndex_(sh, 'Phone');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const range = sh.getRange(2, col, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    if (typeof v === 'number' || /^\d+$/.test(String(v))) {
      const s = String(v);
      if (s.length === 9) { // 9 หลัก = น่าจะหาย leading 0
        values[i][0] = "'0" + s;
        changed = true;
      }
    }
  }
  if (changed) range.setValues(values);
}
```

### ⚠️ Pitfall: setValues จาก array ก็โดน autoparse

```javascript
// ✗ Bad — "0812345678" ใน array ก็โดน parse เป็น 812345678 ก่อน write
sh.getRange(2, 1, 1, 2).setValues([['0812345678', '0123456789012']]);

// ✓ Good — apostrophe ทุก cell
sh.getRange(2, 1, 1, 2).setValues([["'0812345678", "'0123456789012"]]);
```

---

## Rule #7: numeric columns ที่ display เป็น % — เก็บเป็น string ไม่ใช่ number

**Why:** ถ้าคอลัมน์ format = `0%` แล้วเขียนตัวเลข `100` ลงไป Sheets แปลงเป็น `10000%`
ถ้า format = `0"%"` (text suffix) เขียน `100` ได้ `100%`

**ทางที่ปลอดภัย:** เขียน string `"100.00"` ลงไป + ตั้ง column format เป็น `Plain text` หรือ `0.00"%"`

---

## Rule #8: คำนวณซ้ำฝั่ง server — อย่าเชื่อค่าจาก client

**Bug จริงที่เคยเจอ:** client คำนวณ `(pass/total)*100 = 500%` (เพราะ total เปลี่ยนระหว่างกรอก) ส่งมา server บันทึกตรง ๆ

### ✓ Good

```javascript
function saveRecord(callerUserId, payload) {
  const total = parseInt(payload.totalStudents) || 0;
  let pass = parseInt(payload.passCount) || 0;
  if (pass > total) pass = total; // clamp
  const fail = Math.max(0, total - pass);
  const passPct = total > 0 ? ((pass / total) * 100).toFixed(2) : '0.00';
  // ใช้ค่าที่ recompute แล้ว ไม่ใช่ payload.passPercent
}
```
