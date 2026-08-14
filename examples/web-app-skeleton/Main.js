/**
 * Main.js — bootstrap + schema + shared utilities
 * Patterns: rules/project-structure.md, rules/spreadsheet-ops.md, rules/schema-migrations.md
 */

const APP_VERSION = 'v1-example';
const SPREADSHEET_ID = ''; // ใส่ ID ของ spreadsheet — หรือปล่อยว่างถ้า bind กับ sheet

function getSs_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActive();
}

// ── Web app entry ─────────────────────────────────────────────
function doGet() {
  ensureSchema();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ตัวอย่างระบบบันทึกข้อมูล')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1'); // viewport ใส่ที่ .gs ผ่าน addMetaTag หรือใน .html — ดู rules/htmlservice-frontend.md
}

// ── Schema (idempotent — รันซ้ำได้ไม่พัง) ──────────────────────
function ensureSchema() {
  ensureSheet_('Users', ['UserID', 'Username', 'DisplayName', 'Role', 'PasswordHash', 'PasswordSalt', 'Active']);
  ensureSheet_('Sessions', ['Token', 'UserID', 'ExpiresAt', 'CreatedAt']);
  const records = ensureSheet_('Records', ['RecordID', 'Title', 'Phone', 'OwnerUserID', 'CreatedAt']);
  ensureTextColumn_(records, 'Phone'); // กันเลข 0 นำหน้าหาย — rules/spreadsheet-ops.md Rule #6.6
  ensureSheet_('Config', ['Key', 'Value']);
}

function ensureSheet_(name, headers) {
  const ss = getSs_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  headers.forEach(h => {
    if (existing.indexOf(h) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(h);
  });
  return sh;
}

function ensureTextColumn_(sheet, headerName) {
  const col = colIndex_(sheet, headerName);
  sheet.getRange(1, col, Math.max(sheet.getMaxRows(), 1000), 1).setNumberFormat('@');
}

// ── Sheet helpers (rules/spreadsheet-ops.md) ──────────────────
function readSheet_(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues(); // อ่านครั้งเดียว — Rule #1
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map((row, i) => {
    const o = {};
    headers.forEach((h, j) => (o[h] = row[j]));
    o.__rowIndex = i + 2;
    return o;
  });
}

function appendRowByHeaders_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => (obj[h] != null ? obj[h] : ''))); // ตาม header ไม่ hardcode index — Rule #3
}

function colIndex_(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  if (idx < 0) throw new Error('ไม่พบ column: ' + headerName);
  return idx + 1;
}

function getConfig_(key) {
  const row = readSheet_(getSs_().getSheetByName('Config')).find(r => r.Key === key);
  return row ? String(row.Value) : '';
}

// Date → ISO string ก่อนส่ง client — google.script.run ไม่ serialize Date (Rule #6.1)
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
