# Testing & Debugging

## Rule #1: `Logger.log` ทุก critical path + execution boundary

**Why:** GAS ไม่มี breakpoint debugger ที่ดี — log คือ source of truth

### ✓ Good — entry + exit log

```javascript
function generatePdfForRecord(callerUserId, rowIndex) {
  Logger.log('[PDF] start callerUserId=' + callerUserId + ' rowIndex=' + rowIndex);
  try {
    const record = readRecord_(rowIndex);
    Logger.log('[PDF] record=' + record.RecordID + ' status=' + record.AcademicStatus);
    // ...
    const pdfBlob = exportSheetAsPdf_(...);
    Logger.log('[PDF] export OK size=' + pdfBlob.getBytes().length);
    // ...
    Logger.log('[PDF] saved fileId=' + fileId);
    return { ok: true, /* ... */ };
  } catch (err) {
    Logger.log('[PDF] EXCEPTION: ' + (err.stack || err));
    return { ok: false, message: err.message };
  }
}
```

ดู log: **Apps Script Editor → Executions** (left sidebar)

---

## Rule #2: log มี prefix `[FunctionName]` เสมอ

ตอน debug execution log มีหลายร้อยบรรทัด — กรองด้วย prefix:

```
[PDF] start callerUserId=U002
[PDF] record found: REC1779902539479
[saveRecord] payload total=20 pass=20
[PDF] EXCEPTION: ...
```

---

## Rule #3: log structured data — ไม่ใช่ string concat ทั้งก้อน

### ✗ Bad

```javascript
Logger.log(JSON.stringify(hugeObject));  // อ่านยาก, ตัด stack trace
```

### ✓ Good

```javascript
Logger.log('[saveRecord] user=' + caller.UserID + ' role=' + caller.Role + ' folderId=' + payload.folderId);
```

หรือถ้าต้องการ inspect object เต็ม:

```javascript
console.log('record=', record); // V8 runtime support console.log + object
```

---

## Rule #4: test function manual — ใช้ Apps Script editor

สร้าง test function ไม่ commit prod:

```javascript
function _test_generatePdf() {
  const result = generatePdfForRecord('U002', 2);
  Logger.log(JSON.stringify(result, null, 2));
}
```

วิธีรัน: Apps Script editor → เลือกชื่อ function จาก dropdown → Run

**Prefix `_test_`** — บอกตัวเองว่า ห้ามให้ client เรียก + grep หาง่ายตอน cleanup

---

## Rule #5: e2e test ผ่าน fetch / curl

ถ้า web app deploy แล้ว — สมมุติ endpoint:

```bash
# .env.test
WEB_APP_URL=https://script.google.com/macros/s/<id>/exec
TEST_USER_TOKEN=U002
```

```javascript
// scripts/e2e-pdf.mjs (Node)
import 'dotenv/config';

async function test_generatePdf() {
  const res = await fetch(process.env.WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: 'generatePdfForRecord',
      args: [process.env.TEST_USER_TOKEN, 2],
    }),
  });
  const data = await res.json();
  console.assert(data.ok === true, 'expected ok=true, got:', data);
  console.log('✓ generatePdf returns', data.pdfFileId);
}

test_generatePdf().catch(e => { console.error(e); process.exit(1); });
```

ต้อง implement `doPost(e)` ที่ dispatch ฟังก์ชันตามชื่อ:

```javascript
function doPost(e) {
  try {
    const { function: name, args } = JSON.parse(e.postData.contents);
    const result = globalThis[name](...args); // ⚠️ ระวัง — ไม่ปลอดภัยใน production
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Security:** restrict `globalThis[name]` ด้วย allow-list:

```javascript
const RPC_ALLOWED = ['login', 'saveRecord', 'generatePdfForRecord', /* ... */];
if (!RPC_ALLOWED.includes(name)) throw new Error('forbidden');
```

---

## Rule #6: clasp run — เรียก function จาก CLI

```bash
clasp run 'generatePdfForRecord' --params '["U002", 2]'
```

ต้อง enable Apps Script API + setup OAuth: <https://script.google.com/home/usersettings>

---

## Rule #7: cleanup state ระหว่าง test

```javascript
function _test_setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // ลบ records test เก่า
  const sh = ss.getSheetByName('Records');
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).startsWith('TEST_')) sh.deleteRow(i + 1);
  }
}
```

---

## Rule #8: Stackdriver / Cloud Logging — สำหรับ production

ใน `appsscript.json`:
```json
{ "exceptionLogging": "STACKDRIVER" }
```

Exception ทุก function จะถูก log ใน Google Cloud Logging — ดูที่ Apps Script editor → Executions (filter "ผิดพลาด" / Failed)

---

## Rule #9: timing log — หา bottleneck

```javascript
function generatePdfForRecord(callerUserId, rowIndex) {
  const t0 = Date.now();
  // ...step 1
  Logger.log('[PDF] read ' + (Date.now() - t0) + 'ms');
  const t1 = Date.now();
  // ...step 2
  Logger.log('[PDF] fill placeholders ' + (Date.now() - t1) + 'ms');
  const t2 = Date.now();
  // ...step 3
  Logger.log('[PDF] export ' + (Date.now() - t2) + 'ms');
  Logger.log('[PDF] total ' + (Date.now() - t0) + 'ms');
}
```

GAS execution quota = 6 นาที — รู้ว่า step ไหนช้าจะได้ optimize ก่อนถึง limit

---

## Rule #10: rate limit — ระวัง quota daily

| Service | Limit (Consumer) | Limit (Workspace) |
|---|---|---|
| URL Fetch | 20,000/day | 100,000/day |
| Email send | 100/day | 1,500/day |
| Triggers per script | 20 | 20 |
| Script execution time | 6 min | 6 min |
| Custom function exec | 30 s | 30 s |

ทำ counter ใน Config sheet ถ้า near quota — ส่ง alert ก่อนพัง
