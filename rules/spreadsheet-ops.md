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

## Rule #6: serialize Date เป็น ISO string ก่อนส่ง client

**Why:** `google.script.run` ไม่ serialize `Date` object — กลายเป็น `{}` ที่ฝั่ง client

### ✓ Good

```javascript
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
