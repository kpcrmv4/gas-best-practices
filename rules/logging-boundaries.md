# Logging at Data Boundaries

## Rule #1: ทุก RPC boundary ต้องมี log ทั้ง 2 ฝั่ง — client + server

**Why:** เวลา bug "ส่งข้อมูลไป save แล้วผล error ที่ไม่รู้สาเหตุ" — ถ้าไม่มี log ที่ boundary จะไม่รู้ว่า:
- payload หน้าตายังไง ตอนออกจาก client
- payload มาถึง server แบบไหน (ขาดฟิลด์? type ผิด?)
- server return อะไรกลับมา
- client interpret return ถูกไหม

User report bug → ขอ "screenshot console" ได้ทันที (F12 → Console)

---

## Rule #2: Client — `console.log` ก่อนส่ง + หลังรับทุก RPC

### ✓ Good — wrap `rpc()` ให้ log อัตโนมัติ

```javascript
function rpc(name, ...args) {
  const t0 = Date.now();
  console.log('→ RPC', name, args);
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((res) => {
        console.log('← RPC', name, (Date.now() - t0) + 'ms', res);
        resolve(res);
      })
      .withFailureHandler((err) => {
        console.error('✗ RPC', name, (Date.now() - t0) + 'ms', err);
        reject(err);
      })
      [name](...args);
  });
}
```

ผลที่เห็นใน Console:

```
→ RPC saveRecord ["U002", {folderId: "...", totalStudents: 20, ...}]
← RPC saveRecord 312ms {ok: true, recordId: "REC1234..."}
```

ถ้า bug — เห็นทันทีว่า payload เพี้ยนตรงไหน หรือ server ตอบช้า

---

## Rule #3: Server — `Logger.log` entry + exit ทุก function ที่ client เรียก

```javascript
function saveRecord(callerUserId, payload) {
  Logger.log('[saveRecord] in caller=' + callerUserId + ' keys=' + Object.keys(payload || {}).join(','));
  try {
    const caller = requireUser_(callerUserId);
    // ... mutation ...
    Logger.log('[saveRecord] out ok recordId=' + recordId);
    return { ok: true, recordId: recordId };
  } catch (err) {
    Logger.log('[saveRecord] out ERR ' + (err.stack || err.message));
    return { ok: false, message: err.message };
  }
}
```

**Format มาตรฐาน:**
- `[FuncName] in <key params>` — เริ่ม
- `[FuncName] step:<name>` — ขั้นตอนสำคัญ (อ่าน DB, validate, write, external API)
- `[FuncName] out ok <key result>` — สำเร็จ
- `[FuncName] out ERR <message>` — error

---

## Rule #4: ห้าม log sensitive data — mask ก่อน

```javascript
// ✗ Bad
console.log('→ RPC login', username, password);
Logger.log('[login] password=' + password);

// ✓ Good — mask
console.log('→ RPC login', username, '***');
Logger.log('[login] passwordLen=' + (password || '').length);
```

ข้อมูลที่ต้อง mask:
- password, OTP, token, API key
- เลขบัตรประชาชน (เก็บ 4 หลักท้าย: `***-***1234`)
- เลขบัตรเครดิต
- email/เบอร์โทร ถ้าระบบ sensitive (PII)

---

## Rule #5: log payload size — ถ้าใหญ่จะรู้ก่อนชน quota

```javascript
function rpc(name, ...args) {
  const argSize = JSON.stringify(args).length;
  if (argSize > 100000) console.warn('⚠ RPC large payload', name, argSize, 'bytes');
  console.log('→ RPC', name, argSize + 'b', args);
  // ...
}
```

Server fallback:
```javascript
function saveLargePayload(callerUserId, payload) {
  const sz = JSON.stringify(payload || {}).length;
  Logger.log('[saveLargePayload] size=' + sz);
  if (sz > 5 * 1024 * 1024) throw new Error('payload เกิน 5MB');
  // ...
}
```

---

## Rule #6: log version + build identifier ตอน boot

ช่วยตอน user รายงาน bug — รู้ว่าใช้ version ไหน

### Client

```html
<!-- Index.html -->
<script>
  window.APP_VERSION = '2026.05.28-1';
  console.log('App boot', window.APP_VERSION, navigator.userAgent);
</script>
```

### Server

```javascript
const APP_VERSION = '2026.05.28-1';

function doGet() {
  Logger.log('[doGet] v=' + APP_VERSION + ' user=' + Session.getActiveUser().getEmail());
  return HtmlService.createHtmlOutputFromFile('Index');
}
```

ตอน user ส่ง screenshot console — บรรทัดแรกเห็นเลยว่าใช้ build ไหน

---

## Rule #7: group log สำหรับ flow ที่ซับซ้อน

```javascript
async function doSaveAndOpenPdf() {
  console.group('🎯 doSaveAndOpenPdf');
  try {
    console.log('1. validate form');
    const valid = validateForm();
    if (!valid) { console.warn('   form invalid'); return; }

    console.log('2. save record');
    const saveRes = await rpc('saveRecord', this.user.userId, this.form);

    console.log('3. generate PDF');
    const pdfRes = await rpc('generatePdf', this.user.userId, saveRes.recordId);

    console.log('4. open URL', pdfRes.url);
    window.open(pdfRes.url);
  } catch (e) {
    console.error('flow failed', e);
  } finally {
    console.groupEnd();
  }
}
```

Browser DevTools collapse ได้ — ไม่รก console เมื่อไม่ debug

---

## Rule #8: production toggle — `__DEBUG__` flag

```javascript
// Index.html
<script>
  window.__DEBUG__ = (new URLSearchParams(location.search)).get('debug') === '1';
</script>
```

```javascript
function dlog(...args) {
  if (window.__DEBUG__) console.log(...args);
}

// แทน console.log ตรง ๆ
dlog('→ RPC', name, args);
```

User report bug → "เปิดด้วย `?debug=1`" → ได้ verbose log ทันที โดยไม่ต้อง redeploy

ส่วน `console.error` / `console.warn` — **ห้าม gate** กับ debug flag ปล่อยให้ออกตลอด (เป็นสัญญาณว่ามีปัญหาจริง)

---

## Rule #9: Server log สำหรับ external call (UrlFetch, MailApp)

ทุก outbound call ต้องมี:
- request log ก่อนยิง (URL, method, body keys)
- response log หลังรับ (status, body length, time)

```javascript
function callLineApi_(payload) {
  const t0 = Date.now();
  Logger.log('[LINE] → ' + payload.to + ' type=' + payload.messages[0].type);
  const resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + getApiKey_('LINE_TOKEN'), 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  Logger.log('[LINE] ← ' + code + ' ' + (Date.now() - t0) + 'ms ' + (code >= 400 ? body : 'OK'));
  if (code >= 400) throw new Error('LINE API failed: ' + code + ' ' + body);
  return JSON.parse(body || '{}');
}
```

---

## Rule #10: client logs ที่ user เห็น — สอนให้ user copy ได้

ใส่ปุ่ม "Copy debug info" สำหรับ low-tech user:

```html
<button @click="copyDebugInfo()">📋 คัดลอกข้อมูล debug</button>
<script>
  async function copyDebugInfo() {
    const info = {
      version: window.APP_VERSION,
      url: location.href,
      userAgent: navigator.userAgent,
      time: new Date().toISOString(),
      user: window.app?.user?.userId,
      lastError: window.__lastError,
    };
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    alert('คัดลอกแล้ว — วางใน LINE/Email ส่งให้ admin');
  }

  // dump last error
  window.addEventListener('error', (e) => {
    window.__lastError = { message: e.message, source: e.filename, line: e.lineno };
  });
</script>
```

User ไม่ต้องเปิด F12 เป็น — กดปุ่มเดียวได้ context ครบ

---

## Rule #11: server execution log — บอก user ว่าหาดูที่ไหน

ในเอกสารสำหรับ admin/dev:

> ดู server log: เปิด Apps Script editor → กดเมนู **Executions** (icon ดู ⏱ ทางซ้าย) → คลิก execution ของ function ที่สนใจ → จะเห็น `Logger.log` ทั้งหมด + timestamp + duration

```javascript
// ทำให้ filter ง่าย — prefix ที่ unique ต่อ feature
Logger.log('[PDF.gen] start...');
Logger.log('[Auth.login] ...');
Logger.log('[Record.save] ...');
```

filter ใน Executions: พิมพ์ `PDF` → เห็นเฉพาะ log ของ PDF feature

---

## Rule #12: log retention — GAS เก็บ execution log แค่ ~7 วัน

ถ้าต้อง audit ยาวกว่านั้น → append เข้า Logs sheet:

```javascript
function audit_(category, action, detail) {
  try {
    const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Audit');
    sh.appendRow([
      new Date().toISOString(),
      Session.getActiveUser().getEmail(),
      category,
      action,
      JSON.stringify(detail || {}),
    ]);
  } catch (e) {
    Logger.log('[audit] failed: ' + e.message);
  }
}

// Usage
audit_('Record', 'delete', { recordId: rec.RecordID, by: caller.UserID });
```

**อย่า log ทุก call เข้า sheet** — แค่ mutation/security event (login, delete, approve, payment)
ทุก call ใช้ `Logger.log` ก็พอ
