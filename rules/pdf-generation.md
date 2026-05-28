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

---

## Rule #9: Thai date formatting (พ.ศ.) — ใช้ helper เดียวกันทุกที่

**Why:** date ใน Sheet เก็บเป็น `Date` object หรือ ISO string — ฝัง template ตรง ๆ จะออก `Mon May 28 2026 12:34:56 GMT+0700` ที่ user อ่านไม่เข้าใจ

### ✓ Good — helper เดียว ใช้ทุก placeholder ที่เป็นวันที่

```javascript
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                     'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                          'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function formatThaiDate_(input, opts) {
  if (!input) return '';
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = (opts && opts.full) ? THAI_MONTHS_FULL[d.getMonth()] : THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543; // ค.ศ. → พ.ศ.
  return day + ' ' + month + ' ' + year;
}

function formatThaiDateTime_(input) {
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return formatThaiDate_(d) + ' ' + hh + ':' + mm + ' น.';
}

// Usage ใน mapping
mapping['TEACHER_DATE']  = formatThaiDate_(record.Timestamp);             // "28 พ.ค. 2569"
mapping['ACADEMIC_DATE'] = formatThaiDate_(record.AcademicApprovedAt);
mapping['CREATED_AT']    = formatThaiDateTime_(record.Timestamp);         // "28 พ.ค. 2569 14:30 น."
```

**Edge case:** ถ้าฟิลด์ใน Sheet เป็น "ที่ยังไม่ approve" (ค่าว่าง) → helper return `''` ไม่ throw — placeholder ใน PDF จะเป็น blank string ดูสะอาด

**Caveat:** อย่าใช้ `Utilities.formatDate(date, 'Asia/Bangkok', 'd MMM yyyy')` — locale string ของ Apps Script ออกชื่อเดือนเป็นภาษาอังกฤษ ("May" ไม่ใช่ "พ.ค.")

---

## Rule #10: cache PDF — get-or-generate pattern แยก endpoint

**Why:** generate PDF ใช้เวลา 3-5 วินาที — user ที่กดดู record เดิมซ้ำไม่ควรรอ regenerate ทุกครั้ง

### ✓ Good — 2 endpoints แยกกัน

```javascript
// Endpoint #1: ดู PDF (ใช้ cache ถ้ามี)
function getRecordPdfInfo(callerUserId, rowIndex) {
  try {
    const caller = requireUser_(callerUserId);
    const record = readRecord_(rowIndex);
    if (!record) throw new Error('ไม่พบ record');
    if (caller.Role === 'teacher' && String(record.TeacherUserID) !== String(caller.UserID)) {
      throw new Error('ไม่มีสิทธิ์');
    }

    // ⚡ cache hit — return ทันที (no lock, no generation)
    if (record.PdfFileId) {
      return {
        ok: true,
        pdfFileId: record.PdfFileId,
        pdfUrl: record.PdfUrl,
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + record.PdfFileId,
      };
    }

    // guard ก่อน fallback
    if (record.AcademicStatus !== 'ผ่าน' || record.DirectorStatus !== 'ผ่าน') {
      throw new Error('ต้องผ่านการตรวจจากทุกฝ่ายก่อน จึงจะสร้าง PDF ได้');
    }

    // cache miss — generate ใหม่ (slow path)
    return generatePdfForRecord(callerUserId, rowIndex);
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Endpoint #2: บังคับสร้างใหม่ (regenerate — user กดปุ่ม "สร้างใหม่")
// → ใช้ generatePdfForRecord() ตรง ๆ
//   ฟังก์ชันนี้จะ trash ไฟล์เก่าก่อน (Rule #7) แล้วสร้างใหม่
```

### ✓ Client-side pattern

```javascript
// "เปิด PDF" — fast path, ถ้ามี cache โหลดทันที
async doOpenPdf() {
  const rec = this.modal.record;
  if (rec.PdfUrl) { window.open(rec.PdfUrl); return; }  // shortcut ฝั่ง client ด้วย
  const res = await rpc('getRecordPdfInfo', this.user.userId, rec.rowIndex);
  if (res.ok) window.open(res.pdfUrl);
}

// "สร้างใหม่" — slow path, ลบของเก่าแล้วสร้างใหม่
async doRegeneratePdf() {
  const confirm = await Swal.fire({ title: 'สร้างใหม่?', showCancelButton: true });
  if (!confirm.isConfirmed) return;
  const res = await rpc('generatePdfForRecord', this.user.userId, rowIndex);
  if (res.ok) window.open(res.pdfUrl);
}
```

**Trade-off:** PDF cache อาจ stale ถ้าข้อมูล record ถูกแก้หลัง approve — แก้ด้วยการ invalidate (clear `PdfFileId` ใน sheet) ตอน mutation สำคัญ หรือให้ user กด "สร้างใหม่" เอง

---

## Rule #11: PDF export URL parameters — reference table

ทุก param ของ `/export?format=pdf` มีผลกับ layout PDF ที่ออกมา ไม่ได้เอกสารตรงไหนใน Google docs ครบ — list ที่ใช้บ่อย:

| param | ค่าที่ใช้บ่อย | หมายเหตุ |
|---|---|---|
| `format` | `pdf` | บังคับ |
| `gid` | sheet ID (จาก `getSheetId()`) | บังคับ — ถ้าไม่ใส่จะ export ทุก sheet ใน spreadsheet |
| `size` | `A4`, `letter`, `legal`, `0`-`9` | กระดาษ |
| `portrait` | `true` / `false` | portrait หรือ landscape |
| `fitw` | `true` / `false` | fit ความกว้าง — แนะนำ `true` กัน column ถูกตัด |
| `scale` | `1`-`4` | ทดแทน `fitw` — 1=normal, 4=fit ทั้งหน้า |
| `gridlines` | `true` / `false` | เส้น grid (default true — มักไม่ต้องการใน PDF) |
| `printtitle` | `true` / `false` | ชื่อ spreadsheet ที่หัวกระดาษ |
| `sheetnames` | `true` / `false` | ชื่อ sheet ที่หัวกระดาษ |
| `pagenumbers` | `true` / `false` | เลขหน้า |
| `top_margin`, `bottom_margin`, `left_margin`, `right_margin` | inches (`0.5`) | margin |
| `horizontal_alignment` | `LEFT`/`CENTER`/`RIGHT` | จัดเนื้อหา PDF |
| `vertical_alignment` | `TOP`/`MIDDLE`/`BOTTOM` | |
| `range` | `A1:E20` | export เฉพาะ range (ถ้าไม่ใส่ = ทั้ง sheet) |
| `r1`, `c1`, `r2`, `c2` | row/col indices (0-based) | ทางเลือกของ `range` |
| `ir` | `false` | hide rows ที่ frozen ในการ print |
| `ic` | `false` | hide columns ที่ frozen |
| `fzr` | `true` / `false` | repeat frozen rows ทุกหน้า |
| `fzc` | `true` / `false` | repeat frozen columns ทุกหน้า |
| `attachment` | `true` / `false` | response เป็น attachment หรือ inline |

### ✓ Recipe ที่ใช้บ่อย

```javascript
// บันทึกหลังการสอน 1 หน้า A4 portrait fit-width
function exportRecord_(ssId, gid, filename) {
  const params = {
    format: 'pdf',
    gid: gid,
    size: 'A4',
    portrait: true,
    fitw: true,
    gridlines: false,
    printtitle: false,
    sheetnames: false,
    pagenumbers: false,
    top_margin: 0.5,
    bottom_margin: 0.5,
    left_margin: 0.5,
    right_margin: 0.5,
  };
  return exportWithParams_(ssId, params, filename);
}

// Statement landscape A4
function exportStatement_(ssId, gid, filename) {
  return exportWithParams_(ssId, {
    format: 'pdf', gid: gid, size: 'A4',
    portrait: false, fitw: true,
    gridlines: false, sheetnames: false, pagenumbers: true,
    top_margin: 0.4, bottom_margin: 0.4, left_margin: 0.4, right_margin: 0.4,
  }, filename);
}

function exportWithParams_(ssId, params, filename) {
  const qs = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?' + qs;
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export PDF ล้มเหลว: HTTP ' + resp.getResponseCode() + ' ' + resp.getContentText().substring(0, 200));
  }
  return resp.getBlob().setName(filename + '.pdf');
}
```

---

## Rule #12: folder structure — เก็บ PDF แยกตาม owner

**Why:** PDF กองรวมในโฟลเดอร์เดียวกัน → 10,000 ไฟล์ใน folder เดียวทำให้ Drive UI ช้า + แชร์ folder รายบุคคลกับ accountant/HR ไม่ได้

### ✓ Good — โครงสร้าง 2 ระดับ

```
PDF_ROOT/
├── teacher1@school.ac.th/
│   ├── ภาษาไทย-ป.1/         ← folder ของแต่ละวิชา/ชั้น
│   │   ├── REC1779902539479.pdf
│   │   └── REC1779812345678.pdf
│   └── คณิตศาสตร์-ป.1/
└── teacher2@school.ac.th/
    └── ...
```

```javascript
function getOrCreateRecordFolder_(teacherUser, record) {
  // Layer 1: folder ของครู (= username/email)
  const parentId = ensureTeacherParentFolder_(teacherUser.Username);

  // Layer 2: folder ของวิชา-ชั้น (เก็บใน record.FolderID ที่ user สร้างไว้ตอน "สร้างโฟลเดอร์")
  if (record.FolderID) {
    try { return DriveApp.getFolderById(record.FolderID).getId(); } catch (e) {}
  }
  return parentId; // fallback — ใส่ใน parent folder ตรง ๆ
}

function ensureTeacherParentFolder_(username) {
  const rootId = getConfig_('PDF_ROOT_FOLDER_ID');
  const root = DriveApp.getFolderById(rootId);
  const existing = root.getFoldersByName(username);
  if (existing.hasNext()) return existing.next().getId();
  return root.createFolder(username).getId();
}
```

**Cross-ref:** ดู `rules/drive-ops.md` Rule #1, #2 สำหรับ Config sheet + lazy folder creation

---

## Rule #13: PDF filename — ใช้ RecordID ไม่ใช่ display name

### ✗ Bad

```javascript
file.setName(record.SubjectName + '-' + record.ClassLevel + '-' + record.Topic + '.pdf');
// ไฟล์ชื่อซ้ำ ถ้าสอน "ภาษาไทย-ป.1-แผน 1" 2 ครั้ง
// + character พิเศษใน Topic อาจ break URL/path
```

### ✓ Good

```javascript
file.setName(record.RecordID + '.pdf'); // "REC1779902539479.pdf"
file.setDescription(record.SubjectName + ' • ' + record.ClassLevel + ' • ' + record.Topic);
// metadata อยู่ใน description — search ได้ใน Drive แต่ filename ไม่ชน
```

**Why:**
- RecordID unique → ไม่ชน → ไม่ต้องเติม `(1)`, `(2)`
- programmatic — script ลบ/หาไฟล์ตาม ID ได้
- backward compatible ถ้า user ภายหลังเปลี่ยน Topic — filename เดิมยังหาเจอ

ถ้าอยากให้ user friendly เห็นชื่อสวย ๆ → ใช้ `file.setName(record.RecordID + ' - ' + safeFilename_(record.Topic) + '.pdf')`:

```javascript
function safeFilename_(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '')  // ห้ามใน Drive
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}
```
