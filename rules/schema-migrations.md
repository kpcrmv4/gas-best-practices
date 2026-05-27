# Schema Migrations — เพิ่มตาราง/คอลัมน์โดยไม่พังของเก่า

## Rule #1: idempotent `ensureSchema()` — รันกี่ครั้งก็ต้องปลอดภัย

**Why:** clone โปรเจ็คใหม่ → ต้องรัน setup; deploy ใหม่ → ต้องเพิ่ม column ใหม่; user เก่าเปิด → ต้องไม่ทำลายของเก่า

### ✓ Good — declarative schema + ensure helpers

```javascript
const SHEET_NAMES = {
  CONFIG: 'Config',
  USERS: 'Users',
  RECORDS: 'Records',
  FOLDERS: 'Folders',
  AUDIT: 'Audit',
};

const SCHEMA = {
  Config: ['Key', 'Value'],
  Users: ['UserID', 'Username', 'DisplayName', 'Role', 'PasswordHash', 'PasswordSalt', 'Active', 'SignatureFileId', 'CreatedAt'],
  Records: ['RecordID', 'Timestamp', 'FolderID', 'TeacherUserID', 'Term', 'Year', /* ... */],
  Folders: ['FolderID', 'TeacherName', 'Subject', 'ClassLevel', 'Timestamp', 'OwnerUserID'],
  Audit: ['Timestamp', 'Actor', 'Action', 'Target', 'Detail'],
};

function ensureSchema() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  for (const name in SCHEMA) {
    ensureSheet_(ss, name, SCHEMA[name]);
  }
  ensureConfigEntry_(ss, 'TEACHERS_FOLDER_ID', () => createDriveFolderIfMissing_('TPM_Teachers'));
  ensureConfigEntry_(ss, 'SIGNATURES_FOLDER_ID', () => createDriveFolderIfMissing_('TPM_Signatures'));
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#d81b60').setFontColor('white');
    sh.setFrozenRows(1);
  } else {
    // เพิ่ม column ที่ขาดท้ายตาราง
    for (const h of headers) ensureColumn_(sh, h);
  }
  return sh;
}

function ensureColumn_(sheet, headerName) {
  const lastCol = sheet.getLastColumn() || 1;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf(headerName) >= 0) return;
  sheet.getRange(1, lastCol + 1).setValue(headerName)
    .setFontWeight('bold').setBackground('#d81b60').setFontColor('white');
}
```

---

## Rule #2: cache `ensureSchema()` per execution — ห้ามรันซ้ำใน function เดียว

```javascript
let _schemaEnsured = false;

function ensureSchemaCached_() {
  if (_schemaEnsured) return;
  _schemaEnsured = true;
  ensureSchema();
}

// เรียกที่ entry point ทุก function ที่ touch sheet
function saveRecord(callerUserId, payload) {
  ensureSchemaCached_();
  // ...
}
```

**Why:** `ensureSchema()` อ่าน sheet หลายครั้ง — ถ้าทุก RPC call รัน 1 ครั้งก็เสีย ~500ms

---

## Rule #3: column ใหม่ — default value สำหรับ row เก่า

หลังเพิ่ม column ผ่าน `ensureColumn_` row เก่าจะมีค่าเป็น `''` (empty string)

ถ้าต้อง default ไม่ใช่ empty:

```javascript
function migrateActiveColumn_(sheet) {
  const col = colIndex_(sheet, 'Active');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, col, lastRow - 1, 1);
  const values = range.getValues();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] == null) {
      values[i][0] = true; // default Active = true
      changed = true;
    }
  }
  if (changed) range.setValues(values);
}
```

รันใน `ensureSchema()` ครั้งเดียวต่อ deploy (track ด้วย Config flag `MIGRATION_V2_DONE`)

---

## Rule #4: rename column ห้ามทำตรง ๆ — เพิ่มใหม่ + copy + ลบทีหลัง

```javascript
function migrateRenameUsernameToEmail_(sheet) {
  // Step 1 (deploy A): เพิ่ม Email column, copy จาก Username
  ensureColumn_(sheet, 'Email');
  const usernameCol = colIndex_(sheet, 'Username');
  const emailCol = colIndex_(sheet, 'Email');
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, usernameCol, lastRow - 1, 1).getValues();
    sheet.getRange(2, emailCol, lastRow - 1, 1).setValues(values);
  }
  // Step 2 (deploy B หลัง code ไม่อ่าน Username แล้ว): ลบ Username
  // ห้ามลบใน deploy เดียวกันกับ Step 1
}
```

---

## Rule #5: track migration version ใน Config sheet

```
Config:
| Key                | Value     |
| SCHEMA_VERSION     | 5         |
```

```javascript
function ensureSchema() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const current = Number(getConfig_('SCHEMA_VERSION') || '0');

  if (current < 1) { migrateV1_(ss); setConfig_('SCHEMA_VERSION', '1'); }
  if (current < 2) { migrateV2_(ss); setConfig_('SCHEMA_VERSION', '2'); }
  if (current < 3) { migrateV3_(ss); setConfig_('SCHEMA_VERSION', '3'); }
  // เพิ่ม migration ต่อท้าย — ห้ามแก้ของเก่า
}
```

---

## Rule #6: ไฟล์ template (PdfTemplate, sample, ฯลฯ) — สร้างจาก code ถ้าไม่มี

```javascript
function ensurePdfTemplate_(ss) {
  let tpl = ss.getSheetByName('PdfTemplate');
  if (tpl) return tpl;
  tpl = ss.insertSheet('PdfTemplate');
  tpl.getRange('A1').setValue('บันทึกหลังการสอน');
  tpl.getRange('A2').setValue('{{TERM_LABEL}}');
  // ...
  return tpl;
}
```

หรือ document ให้ admin import ผ่าน menu:

```javascript
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ Admin')
    .addItem('Import default PdfTemplate', 'importDefaultTemplate')
    .addToUi();
}
```

---

## Rule #7: log migration เป็น Audit row

```javascript
function migrateV2_(ss) {
  // ... do migration ...
  appendRowByHeaders_(ss.getSheetByName('Audit'), {
    Timestamp: new Date().toISOString(),
    Actor: 'system',
    Action: 'migrate',
    Target: 'v2',
    Detail: 'Added Active column to Users',
  });
}
```

ทำให้ debug หลัง deploy ง่าย — "ทำไม column นี้เกิดมาจากไหน"
