# PDF Generation

แนวทางสร้าง PDF จาก Google Sheet template — เทคนิคจริงที่ใช้ใน production

## Rule #1: ใช้ placeholder pattern `{{KEY}}` ใน template sheet

**Why:** สามารถสร้าง template ผ่าน UI ของ Sheets (formatting, font, alignment) ได้สบาย ไม่ต้องเขียน layout ด้วย code

```javascript
const FIELD_TO_PLACEHOLDER = {
  TeacherName: 'TEACHER_NAME',
  SubjectName: 'SUBJECT_NAME',
  // ...
};

function fillPlaceholders_(tempSheet, mapping) {
  const range = tempSheet.getDataRange();
  const values = range.getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const orig = values[r][c];
      if (typeof orig !== 'string' || orig.indexOf('{{') < 0) continue;
      let next = orig;
      for (const k in mapping) {
        if (next.indexOf('{{' + k + '}}') >= 0) {
          next = next.split('{{' + k + '}}').join(String(mapping[k] == null ? '' : mapping[k]));
        }
      }
      if (next !== orig) {
        try {
          tempSheet.getRange(r + 1, c + 1).setValue(next);
        } catch (e) {
          Logger.log('skip r=' + (r + 1) + ' c=' + (c + 1) + ': ' + e.message);
        }
      }
    }
  }
}
```

**ห้าม `range.setValues()`** — template ส่วนใหญ่มี merged cells (ดู `rules/spreadsheet-ops.md` Rule #2)

---

## Rule #2: copy template → temp sheet → export → delete temp

**Why:** อย่าแก้ template โดยตรง (กระทบ user อื่น) — copy ก่อนเสมอ

```javascript
function generatePdfForRecord(callerUserId, rowIndex) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังสร้าง PDF อื่น กรุณาลองใหม่');
  let tempSheet = null;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tpl = ss.getSheetByName('PdfTemplate');
    if (!tpl) throw new Error('ไม่พบ template sheet');
    tempSheet = tpl.copyTo(ss);
    tempSheet.setName('__pdf_temp_' + Date.now());
    tempSheet.showSheet();

    fillPlaceholders_(tempSheet, mapping);
    SpreadsheetApp.flush();

    const pdfBlob = exportSheetAsPdf_(ss.getId(), tempSheet.getSheetId(), 'output');
    // ... save blob to Drive ...
    return { ok: true, pdfFileId: file.getId(), pdfUrl: file.getUrl() };
  } catch (err) {
    Logger.log('[PDF] ' + (err.stack || err));
    return { ok: false, message: err.message };
  } finally {
    if (tempSheet) {
      try { SpreadsheetApp.openById(SPREADSHEET_ID).deleteSheet(tempSheet); } catch (e) {}
    }
    lock.releaseLock();
  }
}
```

---

## Rule #3: export PDF ผ่าน UrlFetch + OAuth token (ไม่ใช่ DriveApp)

`SpreadsheetApp` ไม่มี `exportAsPdf()` — ต้อง fetch URL `/export?format=pdf`

```javascript
function exportSheetAsPdf_(ssId, gid, filename) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?' + [
    'format=pdf',
    'gid=' + gid,
    'portrait=true',
    'fitw=true',           // fit ความกว้างให้พอดี
    'size=A4',
    'gridlines=false',
    'printtitle=false',
    'sheetnames=false',
    'pagenumbers=false',
    'top_margin=0.5',
    'bottom_margin=0.5',
    'left_margin=0.5',
    'right_margin=0.5',
  ].join('&');
  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export PDF ล้มเหลว: HTTP ' + resp.getResponseCode());
  }
  return resp.getBlob().setName(filename + '.pdf');
}
```

**Required scope** (ใน `appsscript.json`):
```json
"oauthScopes": [
  "https://www.googleapis.com/auth/script.external_request"
]
```

---

## Rule #4: insertImage anchor = บนซ้ายเสมอ — alignment ของ cell ไม่มีผล

**Bug จริง:** ตั้ง horizontal align = right ใน cell ที่มี placeholder รูป → รูปยังชิดซ้าย เพราะ anchor อยู่บนซ้ายของเซลล์

### ✓ Good — คำนวณ offset เอง

```javascript
function insertSignatureAtPlaceholder_(sheet, placeholder, signatureBlob) {
  const pos = findCellByExact_(sheet, placeholder);
  if (!pos) return;

  const cell = sheet.getRange(pos.row, pos.col);
  const hAlign = String(cell.getHorizontalAlignment() || 'left').toLowerCase();
  const vAlign = String(cell.getVerticalAlignment() || 'top').toLowerCase();
  cell.setValue('');

  const img = sheet.insertImage(signatureBlob, pos.col, pos.row);
  const w0 = img.getWidth(), h0 = img.getHeight();
  const MAX = { width: 120, height: 40 };
  const ratio = Math.min(MAX.width / w0, MAX.height / h0, 1);
  const w = Math.round(w0 * ratio);
  const h = Math.round(h0 * ratio);
  img.setWidth(w).setHeight(h);

  const colW = sheet.getColumnWidth(pos.col);
  const rowH = sheet.getRowHeight(pos.row);
  let xOff = 0, yOff = 0;
  if (hAlign === 'right')        xOff = Math.max(0, colW - w);
  else if (hAlign === 'center')  xOff = Math.max(0, Math.round((colW - w) / 2));
  if (vAlign === 'bottom')       yOff = Math.max(0, rowH - h);
  else if (vAlign === 'middle')  yOff = Math.max(0, Math.round((rowH - h) / 2));
  img.setAnchorCellXOffset(xOff).setAnchorCellYOffset(yOff);
}

function findCellByExact_(sheet, needle) {
  const values = sheet.getDataRange().getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c]).trim() === needle) return { row: r + 1, col: c + 1 };
    }
  }
  return null;
}
```

---

## Rule #5: รักษาอัตราส่วนของรูป — ห้าม stretch

**Why:** signature ที่ stretch จากสี่เหลี่ยมจัตุรัสเป็นแนวนอนยาว ๆ จะดูบิดเบี้ยว

```javascript
// ✗ Bad
img.setWidth(180).setHeight(50); // stretch fixed

// ✓ Good — fit ใน max box โดยรักษา ratio
const ratio = Math.min(MAX.width / w0, MAX.height / h0, 1);
img.setWidth(Math.round(w0 * ratio)).setHeight(Math.round(h0 * ratio));
```

---

## Rule #6: ตัดขอบขาวของรูปก่อน upload (signature canvas)

**Why:** ถ้า user วาด signature ในมุมล่างซ้ายของ canvas 600×200 แต่ upload ทั้ง canvas — รูปกินพื้นที่ส่วนใหญ่เป็น whitespace ทำให้แทรกใน PDF แล้วทับแถวอื่น

### ✓ Good — crop ก่อนส่ง

```javascript
function trimCanvasToInk(srcCanvas, padding = 8) {
  const ctx = srcCanvas.getContext('2d');
  const img = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
  let minX = srcCanvas.width, minY = srcCanvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      if (img[(y * srcCanvas.width + x) * 4 + 3] > 0) { // alpha > 0
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // canvas ว่าง
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(srcCanvas.width - 1, maxX + padding);
  maxY = Math.min(srcCanvas.height - 1, maxY + padding);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.fillStyle = 'white';
  octx.fillRect(0, 0, w, h);
  octx.drawImage(srcCanvas, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}
```

---

## Rule #7: cache PDF — ลบไฟล์เดิมก่อนสร้างใหม่

```javascript
// ก่อนสร้าง PDF ใหม่ ทิ้งไฟล์เก่า
if (record.PdfFileId) {
  try { DriveApp.getFileById(record.PdfFileId).setTrashed(true); } catch (e) {}
}
```

ใน UI ให้มีปุ่ม "สร้างใหม่" ที่ confirm ก่อน — เผื่อ template เปลี่ยน หรือข้อมูล record อัพเดทหลังจาก approve

---

## Rule #8: business rule guard ก่อน generate

```javascript
if (record.AcademicStatus !== 'ผ่าน' || record.DirectorStatus !== 'ผ่าน') {
  throw new Error('ต้องผ่านการตรวจจากทุกฝ่ายก่อน จึงจะสร้าง PDF ได้');
}
```

Guard ทั้งสองชั้น — server (authoritative) + client (UX ดี ซ่อนปุ่มเลย ไม่ให้ user กดผิด)
