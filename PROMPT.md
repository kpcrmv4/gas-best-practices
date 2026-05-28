# gas-best-practices — Bundled prompt (single file)

> All 16 rule files concatenated into one. Paste into ChatGPT custom instructions, GPT Project knowledge, or any AI that does not auto-load files.
> Source: https://github.com/kpcrmv4/gas-best-practices

---

# AGENTS.md — gas-best-practices

> Universal entry point for any AI coding assistant.
> Read this file first when working with Google Apps Script code.

## Trigger conditions

Apply these rules when you detect any of:
- Files with `.gs` extension
- `appsscript.json` in project root
- `.clasp.json` in project root
- User mentions "Google Apps Script", "GAS", or "clasp"
- Code uses `SpreadsheetApp`, `DriveApp`, `HtmlService`, `UrlFetchApp`, or other GAS services
- `google.script.run` calls in HTML files

## How to use

When working on GAS code, consult `rules/<topic>.md` based on the task:

| Task | Read |
|---|---|
| New project setup, file organization | `rules/project-structure.md` |
| Read/write Sheet, batch operations, merged cells | `rules/spreadsheet-ops.md` |
| Web app with `google.script.run` | `rules/web-app-rpc.md` |
| HTML head, viewport, partial includes | `rules/htmlservice-frontend.md` |
| External frontend (GitHub Pages) + GAS API | `rules/external-frontend.md` |
| PDF generation from template | `rules/pdf-generation.md` |
| Drive folders, file sharing, image preview | `rules/drive-ops.md` |
| Concurrent operations | `rules/lock-service.md` |
| Caching queries | `rules/cache-service.md` |
| Year/month/enum dropdowns | `rules/dynamic-dropdowns.md` |
| Auth, role check, OAuth scopes | `rules/security.md` |
| Adding tables/columns to live system | `rules/schema-migrations.md` |
| Error handling, Thai user messages | `rules/error-handling.md` |
| Custom Sheet menus | `rules/onopen-menu.md` |
| Debug, log, execution history | `rules/testing-debugging.md` |
| Log at RPC boundaries (client + server) | `rules/logging-boundaries.md` |

## Core principles (cross-cutting)

1. **Every server function callable from client returns a `Result<T>` envelope** — never throw to client
2. **Read sheets once with `getDataRange().getValues()`** — but **write cell-by-cell** if the sheet may have merged cells
3. **Lazy resource creation** — folder IDs, sheets, columns auto-create on startup, store in Config sheet
4. **Cache user lookups + computed results** via `CacheService.getScriptCache()` with explicit invalidation
5. **Wrap concurrent mutations in `LockService.getScriptLock()`** with `try/finally { releaseLock() }`
6. **Store folder IDs in Config sheet** — not in script properties — for easy admin override
7. **Thai user-facing error messages** + English `Logger.log` for developers
8. **Log every RPC boundary** — `console.log` in client, `Logger.log` in server (entry + exit)
9. **Force text format for numeric fields with leading zeros** — phone, ID card, postal code (`setNumberFormat('@')` + apostrophe prefix)
10. **Recompute critical values server-side** — never trust client-calculated percentages/totals

## Output format for the AI

When suggesting GAS code:
- Reference the rule number/file (e.g., "per `rules/spreadsheet-ops.md` Rule #2")
- Show `✗ Bad` and `✓ Good` patterns when correcting common mistakes
- Use Thai for user-facing error messages, English for log messages
- Default to `let`/`const`, ES6+ (V8 runtime is standard now)
- Suggest `LockService` for any function that mutates shared state

---


# 📁 rules/cache-service.md

# CacheService — Reduce Sheet Round-Trips

## Rule #1: cache query ที่อ่านบ่อย + เปลี่ยนน้อย

ตัวอย่าง: ดึง user profile จาก Users sheet ทุก RPC call — เปลือง 200ms per call

### ✓ Good

```javascript
function findUserById_(userId) {
  const cache = CacheService.getScriptCache();
  const ck = 'user_' + userId;
  const cached = cache.get(ck);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('Users');
  const user = readSheet_(sh).find(r => String(r.UserID) === String(userId));
  if (user) {
    try { cache.put(ck, JSON.stringify(user), 600); } catch (e) {} // 10 min
  }
  return user;
}
```

---

## Rule #2: invalidate cache ทุกครั้งที่ data เปลี่ยน

```javascript
function invalidateUserCache_(userId) {
  try { CacheService.getScriptCache().remove('user_' + userId); } catch (e) {}
}

function changeMyPassword(callerUserId, oldPwd, newPwd) {
  // ... update sheet ...
  invalidateUserCache_(callerUserId); // 💡
  return { ok: true };
}
```

**Pattern:** ทุก write ที่กระทบ row → remove cache key — ถ้าลืม จะเจอ "ทำไม UI ไม่อัพเดท" สอบ 30 นาที

---

## Rule #3: TTL ขึ้นกับลักษณะ data

| Type | TTL | เหตุผล |
|---|---|---|
| User profile, role | 600s (10 min) | เปลี่ยนน้อย, ทน stale ได้ |
| Config (folder ID, settings) | 3600s (1 hr) | แทบไม่เปลี่ยน |
| Aggregate count (ทั้งหมด, รอตรวจ) | 60s | ผู้ใช้คาดหวังเห็นเลขใหม่ |
| Sensitive (auth token) | 300s | ปลอดภัย + ลด query |

`CacheService.getScriptCache()` มี max TTL = 21600s (6 hr) — ใส่เกินไม่ error แต่ตัดเป็น 21600

---

## Rule #4: cache key มี prefix ป้องกันชน

```javascript
const CK = {
  user: (id) => 'user_' + id,
  config: (key) => 'cfg_' + key,
  recordCount: (folderId) => 'reccnt_' + folderId,
};
```

---

## Rule #5: ScriptCache มี size limit 100KB per key

ถ้า payload ใหญ่ → split หรือ cache แค่ ID list แล้วดึงตัวเต็มเป็น ๆ ทีเดียว

```javascript
// ✗ Bad — cache ทั้ง array ของ records ที่อาจหลายร้อย row
cache.put('all_records', JSON.stringify(allRecords)); // อาจเกิน 100KB

// ✓ Good — cache แค่ list ของ ID, ตัวเต็มอ่าน sheet ตอนใช้
cache.put('record_ids_pending', JSON.stringify(ids));
```

---

## Rule #6: try/catch รอบ `cache.put()` — fail ไม่ใช่ critical

```javascript
try {
  cache.put(ck, JSON.stringify(v), 600);
} catch (e) {
  // payload ใหญ่เกิน, quota เต็ม — ignore ไม่ใช่ critical path
}
```

---

## Rule #7: CacheService vs PropertiesService

| | CacheService | PropertiesService |
|---|---|---|
| TTL | มี (สูงสุด 6 ชม.) | ไม่มี (ถาวร) |
| ขนาด | 100KB/key, 24MB total | 9KB/key, 500KB total |
| ใช้กับ | query cache, อ่าน stale ได้ | flag, config ที่ต้องคงอยู่ |
| Performance | เร็ว (in-memory) | ช้ากว่า (persistent) |

**ห้ามใช้ PropertiesService เป็น cache** — มันคือ DB ไม่ใช่ cache TTL ไม่มี

---


# 📁 rules/drive-ops.md

# Drive Operations

## Rule #1: เก็บ folder ID ใน Config sheet — ไม่ใช่ hardcode

**Why:** ถ้า hardcode ใน script, redeploy ต้อง redeploy ใหม่ทุกครั้งที่ folder ย้าย — แก้ใน Config sheet ได้ทันที + คนใน wiki/admin sheet เห็นได้

### ✓ Good — Config sheet pattern

```
Config sheet:
| Key                  | Value                   |
| TEACHERS_FOLDER_ID   | 1AbC...XYZ              |
| SIGNATURES_FOLDER_ID | 1DeF...UVW              |
| PDF_TEMPLATE_GID     | 96558638                |
```

```javascript
function getConfig_(key) {
  const cache = CacheService.getScriptCache();
  const ck = 'cfg_' + key;
  const cached = cache.get(ck);
  if (cached) return cached;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const data = ss.getSheetByName('Config').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      const v = String(data[i][1]);
      try { cache.put(ck, v, 3600); } catch (e) {}
      return v;
    }
  }
  return '';
}
```

---

## Rule #2: lazy creation — สร้างโฟลเดอร์อัตโนมัติถ้ายังไม่มี

**Why:** new clone ของ project ไม่ต้องมี admin มา setup ด้วยมือ

```javascript
function ensureSchema() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet_(ss, 'Config', ['Key', 'Value']);
  ensureConfigEntry_(ss, 'TEACHERS_FOLDER_ID', () => createDriveFolderIfMissing_('TPM_Teachers'));
  ensureConfigEntry_(ss, 'SIGNATURES_FOLDER_ID', () => createDriveFolderIfMissing_('TPM_Signatures'));
}

function ensureConfigEntry_(ss, key, valueFn) {
  const sh = ss.getSheetByName('Config');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key && data[i][1] !== '' && data[i][1] != null) return data[i][1];
  }
  const v = valueFn();
  sh.appendRow([key, v]);
  SpreadsheetApp.flush();
  return v;
}

function createDriveFolderIfMissing_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next().getId();
  return DriveApp.createFolder(name).getId();
}
```

---

## Rule #3: เก็บรูป signature/avatar เป็น base64 dataURL คืน client — อย่าใช้ Drive thumbnail URL

**Bug จริง:** signature preview ในเว็บแอปแสดงไม่ขึ้น (broken image icon)

**สาเหตุ:** Drive URL (`drive.google.com/uc?id=...` หรือ `lh3.googleusercontent.com/...`) ต้องการ OAuth cookie — เปิดใน `<img>` ของ web app ที่ deploy `executeAs: USER_DEPLOYING` จะถูก block CORS หรือคืน 403 (เพราะ end-user ไม่ได้ login Google ในแท็บนั้น หรือไม่มีสิทธิ์เข้า Drive)

### ✗ Bad — ให้ client load URL ตรง

```javascript
// Server
return { ok: true, signatureUrl: 'https://drive.google.com/uc?id=' + fileId };

// Client
<img src="https://drive.google.com/uc?id=..."> // 💥 broken
```

### ✓ Good — server fetch blob แล้วคืน dataURL

```javascript
// Server
function getMySignatureDataUrl(callerUserId) {
  try {
    const caller = requireUser_(callerUserId);
    if (!caller.SignatureFileId) return { ok: true, dataUrl: '' };
    const file = DriveApp.getFileById(caller.SignatureFileId);
    const blob = file.getBlob();
    const mime = blob.getContentType() || 'image/png';
    const b64 = Utilities.base64Encode(blob.getBytes());
    return { ok: true, dataUrl: 'data:' + mime + ';base64,' + b64 };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Client
const res = await rpc('getMySignatureDataUrl', this.user.userId);
if (res.ok && res.dataUrl) {
  this.sigCurrentUrl = res.dataUrl; // ใช้กับ <img :src="sigCurrentUrl">
}
```

**ข้อดี:**
- ไม่ติด CORS — dataURL ฝังในหน้าเลย
- ไม่ต้อง share file (file ยัง private อยู่)
- ทำงานบน web app ทุก deployment mode

**ข้อเสีย:**
- base64 ขนาดใหญ่กว่า binary ~33% — เหมาะกับรูปเล็ก (signature, avatar, logo) ไม่เหมาะกับรูปหลาย MB
- ถ้าต้องโชว์รูปหลายร้อยรูปพร้อมกัน → cache dataURL ฝั่ง client หรือใช้ approach ต่อไป

---

## Rule #4: สำหรับรูปใหญ่/หลายรูป — share ANYONE_WITH_LINK + ใช้ direct URL

```javascript
// Server — set sharing หลังสร้าง
const file = folder.createFile(blob);
try {
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
} catch (e) {
  // domain policy block — ไฟล์ยังเซฟได้ แค่ public link ไม่ได้
  Logger.log('[saveImage] setSharing failed (likely domain policy): ' + e.message);
}

// คืน thumbnail URL
return {
  ok: true,
  thumbUrl: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w400',
  // หรือ full URL
  viewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
};
```

**Trade-off:** anyone-with-link = ไม่ secret อีกแล้ว — ใช้ได้กับ user-generated content ที่ไม่ sensitive (รูปสินค้า, รูป cover) อย่าใช้กับเอกสารส่วนตัว

---

## Rule #4.1: `setSharing(ANYONE_WITH_LINK)` แตกบน Google Workspace ของหน่วยงาน/โรงเรียน

**Bug จริง (case study):** โค้ดเดิมรัน OK บน Gmail ส่วนตัว → deploy ให้ครู deploy account `@school.ac.th` แล้วเด้ง:

```
Exception: ไม่ได้รับอนุญาต (Permission denied): DriveApp
```

**สาเหตุ:** Google Workspace admin ของ org (โรงเรียน, หน่วยงานรัฐ, บริษัทใหญ่) ตั้ง policy "**Block external sharing**" หรือ "**Restrict to domain only**" — `ANYONE_WITH_LINK` คือ external = ถูกบล็อก → DriveApp throw ทันที

User เห็น error ตอนกดบันทึก แอปพังทั้งระบบเพราะ exception bubble up ออก function

### ✗ Bad — assume sharing ทำได้ + throw บล็อกทั้งฟังก์ชัน

```javascript
function uploadImageAndSave(...) {
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // 💥 throw
  saveRowToSheet(file.getId(), file.getUrl()); // ไม่ถึงตรงนี้
}
```

### ✓ Good — wrap `setSharing` ใน try/catch + degrade gracefully

```javascript
function uploadImageAndSave(callerUserId, base64, meta) {
  try {
    const file = folder.createFile(blob);

    // ลอง public share — fail ก็ไม่เป็นไร ไฟล์ยังอยู่
    let publicUrl = '';
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      publicUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w400';
    } catch (sharingErr) {
      Logger.log('[upload] setSharing blocked by domain policy: ' + sharingErr.message);
      // fallback: คืน file ID แล้วให้ client ดึงผ่าน base64 RPC แทน
    }

    saveRowToSheet(file.getId(), publicUrl);
    return { ok: true, fileId: file.getId(), publicUrl: publicUrl };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
```

### ✓ Better — รู้ตั้งแต่ deploy ว่า domain block public sharing → ออกแบบไม่ใช้เลย

ถ้ารู้ว่า target user ทั้งหมดอยู่ใน domain เดียวกัน (โรงเรียน, บริษัท) → **ห้ามใช้ `ANYONE_WITH_LINK` ตั้งแต่แรก** ใช้ base64 dataURL ผ่าน RPC (Rule #3) หรือ share ภายใน domain เท่านั้น:

```javascript
// Share เฉพาะคนใน domain — policy อนุญาตปกติ
file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
```

หรือ share เป็น user-specific:

```javascript
file.addViewer('supervisor@school.ac.th');
```

### Decision tree

```
ต้องโชว์รูปในเว็บแอป?
├── ใช่ + user ทุกคนอยู่ใน domain เดียวกัน
│   └── ใช้ base64 dataURL ผ่าน RPC (Rule #3) — ไม่ต้อง share เลย
├── ใช่ + user หลายโดเมน / external + รูปไม่ sensitive
│   └── ลอง ANYONE_WITH_LINK + try/catch fallback
├── ใช่ + รูป sensitive
│   └── base64 dataURL + ตรวจสิทธิ์ทุก RPC call
└── ไม่ — แค่เก็บใน Drive
    └── createFile แล้วจบ — ไม่ต้อง setSharing
```

### วิธี detect policy ก่อน
ไม่มี GAS API ที่ query policy ตรง ๆ — practical:
1. **Deploy แล้วลองด้วย test account ใน domain target** ดูว่า `setSharing` throw ไหม
2. **เก็บ flag ใน Config sheet** `ALLOW_PUBLIC_SHARING = true/false` — ให้ admin toggle ตามจริง
3. **try/catch + memoize** — ลองครั้งแรก fail ก็จำไว้ใน CacheService ทั้งวัน ไม่ต้องลองซ้ำ

```javascript
function canPublicShare_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('can_public_share');
  if (cached !== null) return cached === '1';

  try {
    // ทดสอบกับไฟล์ dummy
    const testFile = DriveApp.createFile('___test_share___', '');
    testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    testFile.setTrashed(true);
    cache.put('can_public_share', '1', 86400); // 24 hr
    return true;
  } catch (e) {
    cache.put('can_public_share', '0', 86400);
    return false;
  }
}
```

---

## Rule #5: ลบไฟล์เก่าก่อน upload ใหม่ — กัน Drive รก

```javascript
function saveMySignature(callerUserId, base64DataUrl) {
  const caller = requireUser_(callerUserId);
  // ... validate ...

  // ลบของเก่าก่อน
  if (caller.SignatureFileId) {
    try {
      DriveApp.getFileById(caller.SignatureFileId).setTrashed(true);
    } catch (e) {}
  }

  // สร้างใหม่
  const folder = DriveApp.getFolderById(getConfig_('SIGNATURES_FOLDER_ID'));
  const file = folder.createFile(blob);
  // อัพเดท ID ใน sheet
  sheet.getRange(rowIndex, sigCol).setValue(file.getId());
}
```

**ใช้ `setTrashed(true)` ไม่ใช่ `.setTrashed(true).getId()` chain แล้วลืม** — bug เคยเจอ เพราะ method คืน File ไม่ใช่ void

---

## Rule #6: validate dataURL ฝั่ง server ก่อนถอด base64

```javascript
function saveImage_(base64DataUrl, folderId, filename) {
  if (!base64DataUrl || base64DataUrl.indexOf('data:image/') !== 0) {
    throw new Error('ข้อมูลรูปไม่ถูกต้อง');
  }
  const m = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) throw new Error('รูปแบบ base64 ผิด');
  const mime = m[1];
  const bytes = Utilities.base64Decode(m[2]);

  // ขนาดสูงสุด 5MB
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error('รูปใหญ่เกิน 5MB');
  }

  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'bin';
  const blob = Utilities.newBlob(bytes, mime, filename + '.' + ext);
  return DriveApp.getFolderById(folderId).createFile(blob);
}
```

---

## Rule #7: folder ของ user เก็บแยก — ไม่ใช่กองรวม

ใน TEACHERS folder:
```
TEACHERS/
├── teacher1@email.com/
│   ├── REC001.pdf
│   └── ภาษาไทย-ป.1/
│       └── ...
└── teacher2@email.com/
    └── ...
```

```javascript
function ensureTeacherParentFolder_(username) {
  const parentId = getConfig_('TEACHERS_FOLDER_ID');
  const parent = DriveApp.getFolderById(parentId);
  const existing = parent.getFoldersByName(username);
  if (existing.hasNext()) return existing.next().getId();
  return parent.createFolder(username).getId();
}
```

ผลดี: ดู Drive แล้วเข้าใจทันที + แชร์ folder รายบุคคลกับ accountant/HR ได้

---


# 📁 rules/dynamic-dropdowns.md

# Dynamic Dropdowns (ค่าตัวเลือกที่ไม่ควรฟิกตายตัว)

## Rule: dropdown ที่เกี่ยวกับวันที่/ปี — ห้าม hardcode ใน HTML

**Why:** โค้ดที่ hardcode `<option value="2024">2024</option>` จะ "ล้าสมัย" ทันทีที่เวลาผ่านไป — user ปี 2027 เปิดมาเห็นปีเก่า งงทันที

### ✗ Bad — fixed list

```html
<select x-model="recordForm.year">
  <option value="2567">2567</option>
  <option value="2568">2568</option>
  <option value="2569">2569</option>
</select>
```

### ✓ Good — generate จากปีปัจจุบัน + กรองค่าที่มีใน sheet

```javascript
// ใน Alpine data() / state
get yearOptions() {
  // ปีปัจจุบัน + 2 ปีก่อนหน้า + 2 ปีถัดไป (พ.ศ.)
  const currentBE = new Date().getFullYear() + 543;
  const generated = [];
  for (let y = currentBE - 2; y <= currentBE + 2; y++) generated.push(y);

  // รวมกับปีที่เคยมีใน records (กรณีมี record เก่ากว่า -2 ปี)
  const fromData = [...new Set(this.records.map(r => Number(r.Year)).filter(Boolean))];

  // merge + sort desc (ปีใหม่ก่อน) + unique
  return [...new Set([...generated, ...fromData])].sort((a, b) => b - a);
}
```

```html
<select x-model="recordForm.year">
  <template x-for="y in yearOptions" :key="y">
    <option :value="y" x-text="y"></option>
  </template>
</select>
```

---

## Rule: default value = ปีปัจจุบัน

```javascript
// ตอน init form
recordForm: {
  year: new Date().getFullYear() + 543, // พ.ศ.
  term: this.guessCurrentTerm(),
  // ...
},

guessCurrentTerm() {
  const m = new Date().getMonth() + 1; // 1-12
  // ภาคเรียนที่ 1: พ.ค.-ก.ย. (5-9), ภาคเรียนที่ 2: ต.ค.-มี.ค.
  return (m >= 5 && m <= 9) ? 1 : 2;
}
```

---

## Rule: dropdown ที่เป็น enum จาก data จริง — pull จาก sheet

ตัวอย่าง: dropdown "ชั้น" (ป.1, ป.2, ม.3, ฯลฯ) — ดึงจาก records ที่มีอยู่จริง + เพิ่ม "ค่าที่ยังไม่มี" เป็น input field

```javascript
get classLevelOptions() {
  const fromData = [...new Set(this.records.map(r => r.ClassLevel).filter(Boolean))];
  const defaults = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  return [...new Set([...defaults, ...fromData])].sort();
}
```

หรือถ้าต้องการ flexible สุด — ใช้ `<input list="...">` (datalist) แทน select:

```html
<input list="classLevels" x-model="recordForm.classLevel" placeholder="เช่น ป.1">
<datalist id="classLevels">
  <template x-for="c in classLevelOptions" :key="c">
    <option :value="c"></option>
  </template>
</datalist>
```

User พิมพ์ค่าใหม่ก็ได้ + เห็น autocomplete ของค่าที่เคยมี

---

## Rule: เดือน — ใช้ Intl.DateTimeFormat ไม่ hardcode

```javascript
get monthOptions() {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(2000, m, 1);
    months.push({
      value: m + 1,
      label: d.toLocaleString('th-TH', { month: 'long' }) // 'มกราคม', 'กุมภาพันธ์'
    });
  }
  return months;
}
```

---

## Rule: time slot — generate ตาม step

```javascript
get timeSlots() {
  const slots = [];
  for (let h = 8; h <= 17; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}
```

---

## Rule: dropdown ที่ขึ้นกับ user role — กรองฝั่ง client + double-check server

```javascript
get folderOptions() {
  if (this.user.role === 'admin') return this.folders;
  return this.folders.filter(f => f.OwnerUserID === this.user.userId);
}
```

**Server ก็ต้อง enforce — อย่าเชื่อ client filter** (ดู `rules/security.md`)

---

## Rule: refresh option list หลัง create row ใหม่

```javascript
async doCreateRecord() {
  const res = await rpc('saveRecord', this.user.userId, this.recordForm);
  if (res.ok) {
    this.records.push(res.record);
    // computed property yearOptions/classLevelOptions จะ recompute เอง — ไม่ต้องสั่ง
  }
}
```

ใช้ Vue/Alpine computed → reactive อัตโนมัติ

---


# 📁 rules/error-handling.md

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

---


# 📁 rules/external-frontend.md

# External Frontend (GitHub Pages / Netlify / Vercel) + GAS Backend

## Context: ทำไมต้องแยก frontend ออกจาก GAS

GAS web app รันใน sandbox iframe ของ `*.googleusercontent.com` — Google จำกัด API หลายตัวที่ web ทั่วไปทำได้:

| API | สถานะใน GAS iframe |
|---|---|
| `getUserMedia()` (กล้อง/ไมค์) | ❌ block (Permissions Policy block) |
| `navigator.geolocation` | ⚠️ ขอ permission แล้วบางครั้งไม่ผ่าน |
| `navigator.clipboard.writeText` | ⚠️ ต้อง user-gesture, บางครั้ง fail |
| `IndexedDB`, `localStorage` | ⚠️ มี แต่ scope = iframe origin (ไม่ persist ระหว่าง deploy) |
| `Notification API` (push) | ❌ block |
| `Service Worker` (PWA, offline) | ❌ block |
| File System Access API | ❌ block |
| WebRTC | ❌ block |
| Custom domain | ❌ ไม่ได้ |
| Service Workers / PWA installable | ❌ ไม่ได้ |
| Open Graph / SEO ที่ดี | ❌ (iframe wrapper เห็นน้อย) |

**ทางออก:** ย้าย frontend ไป **GitHub Pages / Netlify / Vercel** ที่เป็น origin ปกติ — capabilities ครบเหมือนเว็บทั่วไป + เรียก GAS เป็น API backend ผ่าน `fetch`

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  GitHub Pages           │         │  GAS Web App             │
│  https://user.github.io │  fetch  │  /macros/s/<id>/exec     │
│                         │ ──────► │                          │
│  - index.html           │         │  doGet() / doPost()      │
│  - camera capture ✓     │  JSON   │  → Sheet / Drive / etc.  │
│  - PWA / SW ✓           │ ◄────── │                          │
│  - full Web APIs ✓      │         │                          │
└─────────────────────────┘         └──────────────────────────┘
```

---

## Rule #1: GAS endpoint — รับ POST `text/plain` หลีกเลี่ยง CORS preflight

**สำคัญ:** GAS **ไม่ตอบ `OPTIONS` preflight** — ถ้า client ส่ง `Content-Type: application/json` browser จะส่ง preflight ก่อน → fail

### ✓ Good — ใช้ `text/plain` (simple request, ไม่ trigger preflight)

```javascript
// Server (Code.gs)
const RPC_ALLOWED = ['login', 'saveRecord', 'uploadImage', 'getRecords'];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const { fn, args } = payload;
    if (!RPC_ALLOWED.includes(fn)) {
      return jsonOut_({ ok: false, message: 'forbidden function: ' + fn });
    }
    const result = globalThis[fn].apply(null, args || []);
    return jsonOut_(result);
  } catch (err) {
    Logger.log('[doPost] EXCEPTION ' + (err.stack || err));
    return jsonOut_({ ok: false, message: err.message });
  }
}

function doGet(e) {
  // health check / handshake
  return jsonOut_({ ok: true, service: 'TPM API', version: APP_VERSION });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

```javascript
// Client (GitHub Pages)
const GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';

async function rpc(fn, ...args) {
  const t0 = Date.now();
  console.log('→ RPC', fn, args);
  const res = await fetch(GAS_URL, {
    method: 'POST',
    // ⚠️ ห้ามใส่ application/json — จะ trigger preflight
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn, args }),
    redirect: 'follow', // GAS redirect ครั้งแรก
  });
  const data = await res.json();
  console.log('← RPC', fn, (Date.now() - t0) + 'ms', data);
  return data;
}
```

---

## Rule #2: deploy `Execute as: Me` + `Anyone (even anonymous)`

ไม่งั้น browser fetch จะเจอ HTML login page ของ Google แทน JSON

**Deploy settings:**
- **Execute the app as:** Me (`your@gmail.com`)
- **Who has access:** Anyone

**Security implication:** ทุก request รันด้วยสิทธิ์ของ owner → ทุก mutation ต้อง guard ด้วย token/role check ใน server function (ดู `rules/security.md`)

---

## Rule #3: ทุก request ต้องส่ง auth token ใน payload

GAS endpoint public → ใครยิงก็ได้ → **ต้อง verify session ทุก call**

```javascript
// Client — เก็บ token หลัง login
let SESSION_TOKEN = localStorage.getItem('token') || '';

async function rpc(fn, ...args) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn, args, token: SESSION_TOKEN }),
  });
  return res.json();
}

async function login(username, password) {
  const res = await rpc('login', username, password);
  if (res.ok) {
    SESSION_TOKEN = res.token;
    localStorage.setItem('token', res.token);
  }
  return res;
}
```

```javascript
// Server — verify ทุก function ยกเว้น login
function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  const { fn, args, token } = payload;

  const PUBLIC_FNS = ['login'];
  let caller = null;
  if (!PUBLIC_FNS.includes(fn)) {
    caller = requireSession_(token); // throw ถ้า token ผิด/หมดอายุ
  }

  // pass caller เป็น arg แรกแทน userId
  const result = globalThis[fn].apply(null, caller ? [caller, ...args] : args);
  return jsonOut_(result);
}
```

---

## Rule #4: camera capture pattern (use case ที่ตอบโจทย์เคสนี้)

### Client — GitHub Pages

```html
<!-- ใช้ <input type="file" capture> — เปิดกล้องของ OS โดยไม่ต้อง getUserMedia -->
<input type="file" accept="image/*" capture="environment" id="camera">

<!-- หรือ getUserMedia ก็ใช้ได้แล้วใน origin ปกติ -->
<video id="preview" autoplay playsinline></video>
<button onclick="capture()">📷 ถ่าย</button>
<canvas id="canvas" hidden></canvas>
```

```javascript
// Option A: getUserMedia (กล้องในเว็บ ไม่ต้องออกจากแอป)
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }, // กล้องหลัง
    audio: false,
  });
  document.getElementById('preview').srcObject = stream;
}

async function capture() {
  const video = document.getElementById('preview');
  const canvas = document.getElementById('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // ส่งไป GAS
  const res = await rpc('uploadImage', dataUrl, { caption: 'หน้าบ้าน' });
  if (res.ok) alert('อัพโหลดสำเร็จ');
}

// Option B: <input type="file" capture> — ง่ายกว่า ใช้กล้อง OS
document.getElementById('camera').onchange = async (e) => {
  const file = e.target.files[0];
  const dataUrl = await fileToDataUrl(file);
  // compress ก่อนส่ง (Rule #5)
  const compressed = await compressImage(dataUrl, 1280);
  await rpc('uploadImage', compressed, { caption: 'หน้าบ้าน' });
};

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}
```

### Server — รับ base64 บันทึก Drive

```javascript
function uploadImage(caller, dataUrl, meta) {
  Logger.log('[uploadImage] in user=' + caller.UserID + ' size=' + (dataUrl || '').length);
  try {
    if (!dataUrl || dataUrl.indexOf('data:image/') !== 0) throw new Error('รูปไม่ถูกต้อง');
    const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('รูปแบบ base64 ผิด');
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > 5 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 5MB');

    const blob = Utilities.newBlob(bytes, m[1], 'photo_' + Date.now() + '.jpg');
    const folder = DriveApp.getFolderById(getConfig_('UPLOADS_FOLDER_ID'));
    const file = folder.createFile(blob);
    // ห้ามใช้ ANYONE_WITH_LINK บน Workspace policy strict (rule drive-ops #4.1)
    Logger.log('[uploadImage] out ok fileId=' + file.getId());
    return { ok: true, fileId: file.getId() };
  } catch (err) {
    Logger.log('[uploadImage] out ERR ' + err.message);
    return { ok: false, message: err.message };
  }
}
```

---

## Rule #5: บีบรูปก่อนส่ง — RPC payload limit ~50MB แต่ network ช้า

```javascript
async function compressImage(dataUrl, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}
```

ขนาดทั่วไป: รูปกล้อง iPhone 12MP ~3-5MB → compress 1280px จะเหลือ 200-400KB

---

## Rule #6: ห้ามใส่ secret/API key ใน frontend code

**Why:** GitHub Pages = repo public → ทุกคนเห็น source

```javascript
// ✗ Bad — leak
const API_KEY = 'AIzaSyB...';

// ✓ Good — secret อยู่ใน GAS (ScriptProperties)
async function callExternal() {
  // GAS เป็น proxy — เรียก external API ด้วย key ของมัน
  return await rpc('proxyToLineApi', { to: userId, message: 'hi' });
}
```

---

## Rule #7: handle redirect — GAS URL redirect ครั้งแรก

GAS แรกครั้งจะ 302 redirect ไปยัง `script.googleusercontent.com/...` — `fetch` ต้อง `redirect: 'follow'` (default ใน browser แต่ระบุไว้ชัดเจน)

```javascript
const res = await fetch(GAS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload),
  redirect: 'follow', // ระบุชัดเจน
});
```

ปัญหา: บาง CORS proxy (ถ้าใช้) ไม่ follow redirect → ต้อง deploy GAS ผ่าน new deployment URL (ที่ลงท้าย `/exec`) ไม่ใช่ test URL (`/dev`)

---

## Rule #8: deploy URL format ที่ใช้กับ fetch ได้

| URL | ใช้กับ fetch จาก external origin? |
|---|---|
| `/macros/s/<id>/exec` | ✅ ใช้ได้ (production deployment) |
| `/macros/s/<id>/dev` | ❌ ต้อง login Google + ไม่ stable |

**Tip:** ทุกครั้งที่แก้โค้ดต้อง **redeploy เป็นเวอร์ชันใหม่** (เมนู Deploy → Manage deployments → Edit → New version) — ไม่งั้น URL `/exec` ยังเรียกโค้ดเก่า

---

## Rule #8.1: multi-account login — append `/u/0/` หรือ `?authuser=` กัน "ไม่สามารถเปิดไฟล์ได้ในเวลานี้"

**Bug จริง:** user ที่ login Google หลายบัญชีในเครื่องเดียว (เช่น ส่วนตัว + งาน + โรงเรียน) เปิดลิงก์ GAS แล้วเจอ:

> **ขออภัย ไม่สามารถเปิดไฟล์ได้ในเวลานี้**
> โปรดตรวจสอบที่อยู่และลองอีกครั้ง

**สาเหตุ:** Google ไม่รู้ว่าควรใช้บัญชีไหนเปิด — บัญชีแรก (default `/u/0/`) อาจไม่ใช่บัญชีที่มีสิทธิ์เข้า web app (ถ้า deploy `Anyone within domain` หรือ `Anyone with Google account`)

### ✓ Fix สำหรับ user

ต่อท้าย URL `/exec`:

| รูปแบบ | ใช้เมื่อ |
|---|---|
| `.../exec/usp=sharing` | ทั่วไป — Google เลือกบัญชีให้ |
| `.../exec?authuser=0` | บังคับใช้บัญชี default (login ตัวแรก) |
| `.../exec?authuser=1` | บัญชีที่ 2 |
| `.../exec?authuser=user@gmail.com` | ระบุ email ตรง ๆ — ชัดเจนสุด |
| `https://script.google.com/u/1/macros/s/<id>/exec` | inline `/u/<index>/` ในพาธ |

**แนะนำ:** ส่งลิงก์แบบ `?authuser=<email>` ให้ user ที่จดทะเบียนไว้

```
https://script.google.com/macros/s/AKfycb.../exec?authuser=teacher@school.ac.th
```

### ✓ Fix สำหรับ developer — generate ลิงก์ที่ embed authuser

ถ้าระบบของคุณรู้ email ของ user (login แล้ว) — สร้างลิงก์ที่แนบ authuser ทุกครั้งที่ส่ง:

```javascript
// Server (GAS)
function getDeployedUrl_(forUserEmail) {
  const base = ScriptApp.getService().getUrl(); // .../exec
  if (forUserEmail) {
    return base + '?authuser=' + encodeURIComponent(forUserEmail);
  }
  return base;
}

// ใช้ใน notification ที่ส่งให้ user
function sendApprovalNotification_(email, recordId) {
  const url = getDeployedUrl_(email) + '&action=approve&id=' + recordId;
  MailApp.sendEmail({
    to: email,
    subject: 'มีคำขอรออนุมัติ',
    htmlBody: `<a href="${url}">เปิดเพื่ออนุมัติ</a>`,
  });
}
```

### ✓ Fix สำหรับ user ที่เจอ error แล้ว

ถ้าตอนนี้ click ลิงก์ใน LINE/email แล้วเจอ error:

1. **วิธีง่ายสุด** — copy URL → เปิดหน้าใหม่ในโหมด Incognito → login บัญชีเป้าหมาย → paste
2. **บนเดียวกัน** — `chrome://settings/people` หรือ icon profile บนขวา → switch ไปบัญชีเป้าหมายเป็น default → retry
3. **เพิ่ม `/u/<index>/`** ใน URL — index 0 = บัญชีแรกที่ login, 1 = ที่สอง, ...
4. **ระบุ `?authuser=<email>`** ต่อท้าย URL — ชัวร์สุดเพราะระบุ email ตรง

### Page UX hint — แสดงคำแนะนำตอน user เจอ error

ถ้า user copy URL ผิดมาเปิด → server ส่ง HTML guide แทน blank error:

```html
<!-- error-account.html (GitHub Pages frontend) -->
<div>
  <h2>ไม่สามารถเปิดได้</h2>
  <p>ลองวิธีต่อไปนี้:</p>
  <ol>
    <li>กดที่ <a id="link-authuser">ลิงก์นี้</a> (จะแนบบัญชีอัตโนมัติ)</li>
    <li>หรือเปิด <kbd>Ctrl+Shift+N</kbd> (Incognito) แล้วเปิด URL ใหม่</li>
    <li>หรือสลับเป็นบัญชี <em>your@school.ac.th</em> ในมุมขวาบนของ Google</li>
  </ol>
</div>
<script>
  const userEmail = prompt('Email ที่ใช้งานในระบบ:');
  if (userEmail) {
    document.getElementById('link-authuser').href = APP_GAS_URL + '?authuser=' + encodeURIComponent(userEmail);
  }
</script>
```

---

## Rule #9: GitHub Pages setup

```
your-repo/
├── index.html
├── css/
├── js/
├── manifest.json     ← PWA manifest ใช้ได้แล้ว
└── sw.js             ← Service Worker ใช้ได้แล้ว
```

Settings → Pages → Source: `main` branch / `(root)` หรือ `/docs`

URL จะเป็น `https://<user>.github.io/<repo>/`

**Custom domain:** ใส่ CNAME file + DNS → ได้ `https://yourdomain.com/`

---

## Rule #10: PWA installable + offline cache (bonus ที่ทำได้แล้ว)

```javascript
// sw.js
const CACHE = 'app-v1';
const STATIC = ['/', '/index.html', '/css/app.css', '/js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('fetch', (e) => {
  // ห้าม cache GAS API calls
  if (e.request.url.includes('script.google.com')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

```html
<!-- index.html -->
<link rel="manifest" href="/manifest.json">
<script>
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
</script>
```

ผู้ใช้กด "Add to Home Screen" → แอปอยู่บนหน้าจอเหมือน native app

---

## Rule #11: error handling รวม CORS / network errors

```javascript
async function rpc(fn, ...args) {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn, args, token: SESSION_TOKEN }),
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) {
      // ได้ HTML กลับมา = GAS login page = deploy ผิด setting
      throw new Error('GAS endpoint ตั้งค่าผิด (กลับมาเป็น HTML ไม่ใช่ JSON) — ตรวจ Execute as / Who has access');
    }
    return JSON.parse(text);
  } catch (err) {
    console.error('✗ RPC', fn, err);
    // network error / parse error / CORS
    return { ok: false, message: 'เชื่อมต่อ server ไม่สำเร็จ: ' + err.message };
  }
}
```

---

## Rule #12: comparison — เมื่อไหร่ใช้ GAS HtmlService vs external frontend

| ต้องการ | HtmlService (built-in) | GitHub Pages + GAS API |
|---|---|---|
| Quick prototype | ✅ ง่ายมาก | ❌ setup เยอะ |
| ใช้กล้อง / mic | ❌ block | ✅ |
| Service Worker / PWA | ❌ | ✅ |
| Custom domain | ❌ | ✅ |
| SEO / Open Graph | ❌ | ✅ |
| ไม่ต้อง host แยก | ✅ | ❌ |
| ไม่ต้อง CORS | ✅ (in-iframe) | ⚠️ ต้อง text/plain trick |
| auth ผ่าน Google native | ✅ | ❌ ต้องทำเอง (token) |
| Free tier limit | GAS quota | GH Pages 100GB/mo bandwidth |

**Heuristic:** internal tool ของทีม 10 คน → HtmlService; ใช้กล้อง/scale → external frontend

---

## Rule #13: log GAS-side รับ request ก็เป็น string mismatch

ใน `doPost(e)` `e.postData.contents` คือ string ที่ client ส่งมา — log แล้วเช็คก่อน

```javascript
function doPost(e) {
  Logger.log('[doPost] in size=' + (e.postData?.contents || '').length +
             ' type=' + (e.postData?.type || 'none'));
  // ...
}
```

ถ้า `type` คือ `application/x-www-form-urlencoded` แทน `text/plain` — แสดงว่า client ส่งผิดวิธี (อาจใช้ FormData)

---


# 📁 rules/htmlservice-frontend.md

# HtmlService & Frontend

## Rule #1: `<meta viewport>` ต้องอยู่ใน `<head>` ของไฟล์ `.html` — ห้ามใส่ใน `.gs`

**Bug ที่ AI ชอบทำ:** บาง AI ที่ generate GAS web app ใส่ viewport meta tag เป็น string ในไฟล์ `.gs`:

### ✗ Bad — ใส่ใน .gs ไม่ทำงาน

```javascript
// Code.gs
function doGet() {
  const html = '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
               '<div>...</div>';
  return HtmlService.createHtmlOutput(html);
}
```

หรือพยายาม inject ผ่าน function:

```javascript
function getViewport() {
  return '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
}
```

**ทำไมไม่ทำงาน:**
- `HtmlService` wrap HTML ของเราใน iframe (`googleusercontent.com/...`) — meta tag ที่อยู่ใน `<body>` หรือ inject runtime จะไม่ effective เพราะ browser parse viewport ตอน initial HTML render เท่านั้น
- string concat ใน `.gs` มัก escape ผิด ทำให้ tag เพี้ยน
- iframe parent คือ Google Apps Script wrapper — เราไม่มีสิทธิ์แก้ viewport ของ parent

ผลที่เห็น: เปิดเว็บแอปบนมือถือแล้วหน้าเล็กจิ๋ว ต้อง pinch-zoom ทุกครั้ง

### ✓ Good — อยู่ใน `<head>` ของไฟล์ `.html`

```html
<!-- Index.html -->
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My GAS Web App</title>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

```javascript
// รหัส.js / Code.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('My GAS Web App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0'); // optional reinforcement
}
```

**ใช้ `addMetaTag()`** ของ `HtmlOutput` — Google จะ inject เข้า `<head>` ของ iframe wrapper ด้วย (defense in depth)

---

## Rule #2: viewport ที่ครอบคลุมทุกกรณี

```html
<!-- ทั่วไป -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- ห้าม user zoom เพื่อกัน UI พังตอน focus input บน iOS -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<!-- PWA-style: ครอบคลุม notch บน iPhone -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Caveat ของ `maximum-scale=1.0`:** บล็อก accessibility (user สายตาไม่ดี zoom ไม่ได้) — ใช้เฉพาะเมื่อจำเป็นจริง

---

## Rule #3: ใช้ `HtmlService.createHtmlOutputFromFile()` ไม่ใช่ string concat

### ✗ Bad

```javascript
function doGet() {
  return HtmlService.createHtmlOutput('<html><head>...</head><body>...</body></html>');
}
```

### ✓ Good

```javascript
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('My App')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

แยก HTML ออกเป็นไฟล์เดี่ยว → syntax highlighting, format, version control ใช้ได้

---

## Rule #4: `<?!= include('partial') ?>` — แยก partial เป็นไฟล์

```javascript
// Code.gs
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

```html
<!-- Index.html -->
<!DOCTYPE html>
<html>
<head>
  <?!= include('styles') ?>
</head>
<body>
  <?!= include('header') ?>
  <main><!-- ... --></main>
  <?!= include('scripts') ?>
</body>
</html>
```

```html
<!-- styles.html -->
<style>
  body { font-family: 'Sarabun', sans-serif; }
</style>
```

```html
<!-- scripts.html -->
<script>
  // Alpine / Vue / vanilla JS
</script>
```

**Caveat ในไฟล์ partial:** ห้ามมี `<!DOCTYPE>` หรือ `<html>` — แค่ snippet — เพราะมันจะถูก inline เข้าหน้าเต็ม

---

## Rule #5: `<?= var ?>` escape อัตโนมัติ — `<?!= var ?>` ห้าม escape

| Tag | Behavior | ใช้กับ |
|---|---|---|
| `<?= ... ?>` | HTML-escape อัตโนมัติ | user-supplied data (กัน XSS) |
| `<?!= ... ?>` | raw output, ไม่ escape | partial include, trusted HTML |
| `<? ... ?>` | execute, ไม่ output | loop, if-else |

```html
<!-- Safe -->
<div>Hello, <?= userName ?></div>

<!-- Dangerous if userName มี HTML -->
<div>Hello, <?!= userName ?></div>
```

---

## Rule #6: server function ที่ template เรียกตอน render — ต้อง deterministic + fast

```javascript
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.userName = Session.getActiveUser().getEmail();
  t.items = readSheet_(sheet); // ระวัง — ถ้า sheet ใหญ่ render ช้า
  return t.evaluate().setTitle('App');
}
```

**Trade-off:** server-render = SEO + first paint เร็ว แต่ผูกกับ session + ไม่ cache
**Alternative:** ส่ง HTML shell ออกไปก่อน แล้ว fetch data ผ่าน `google.script.run` ใน client-side (SPA pattern)

---

## Rule #7: `setXFrameOptionsMode(ALLOWALL)` ถ้าต้อง embed ในเว็บอื่น

```javascript
HtmlService.createHtmlOutputFromFile('Index')
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

default คือ `DEFAULT` — block embed → web app เปิดได้ผ่าน URL ตรงเท่านั้น ถ้าต้อง embed ใน Sites/iframe ต้อง ALLOWALL

---

## Rule #8: ห้ามใช้ inline event handler ที่เรียก server function ตรง ๆ

### ✗ Bad

```html
<button onclick="google.script.run.saveData('hello')">Save</button>
```

### ✓ Good — wrap ผ่าน rpc + handle response

```html
<button onclick="doSave()">Save</button>
<script>
  async function doSave() {
    const res = await rpc('saveData', 'hello');
    if (res.ok) Swal.fire('สำเร็จ');
    else Swal.fire('ผิดพลาด', res.message, 'error');
  }
</script>
```

ดู `rules/web-app-rpc.md` Rule #2 สำหรับ `rpc()` wrapper

---

## Rule #9: tags ที่มักลืม

```html
<head>
  <meta charset="UTF-8">                                  <!-- 1. ครั้งแรกเสมอ -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">  <!-- 2. responsive -->
  <meta name="theme-color" content="#d81b60">             <!-- 3. PWA bar color บน mobile -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'>...">  <!-- 4. favicon (data URI กัน 404) -->
  <title>App Name</title>                                 <!-- 5. tab title -->
</head>
```

GAS iframe ไม่ส่ง favicon → ใส่ data URI กัน 404 ใน Network tab

---

## Rule #10: log warning จาก client → server (debug บน mobile)

มือถือไม่มี DevTools — ส่ง error กลับ server log:

```javascript
// Client
window.addEventListener('error', (e) => {
  google.script.run.logClientError({
    message: e.message,
    source: e.filename,
    line: e.lineno,
    userAgent: navigator.userAgent,
  });
});

// Server
function logClientError(payload) {
  Logger.log('[client error] ' + JSON.stringify(payload));
  // หรือ append เข้า Logs sheet
}
```

ช่วย debug bug ที่เกิดบน iPhone Safari แต่ไม่เกิดบน desktop Chrome

---


# 📁 rules/lock-service.md

# LockService — Concurrency Control

## Rule #1: ใช้ `LockService.getScriptLock()` รอบ mutation ที่ user หลายคนอาจชนกัน

**Why:** GAS รัน function ใน parallel — 2 คนกด "สร้าง PDF" พร้อมกัน อาจ:
- สร้าง temp sheet ชื่อซ้ำ
- เขียน row เดียวกันทับกัน
- export PDF ที่ template ยังไม่ flush

### ✓ Good

```javascript
function generatePdfForRecord(callerUserId, rowIndex) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่ในอีกสักครู่');
  }
  try {
    // ... mutation ที่ต้อง atomic ...
    return { ok: true, /* ... */ };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    lock.releaseLock(); // **บังคับใส่ใน finally**
  }
}
```

---

## Rule #2: เลือก scope ของ lock ให้ถูก

| Lock | Scope | ใช้เมื่อ |
|---|---|---|
| `getScriptLock()` | ทั้ง script (cross-user) | mutation ที่ต้อง atomic ทั้งระบบ (PDF gen, transaction) |
| `getDocumentLock()` | เฉพาะ container document | bound script ที่ปรับ active doc |
| `getUserLock()` | เฉพาะ user คนเดียว | กัน user spam click ปุ่มเดียวกันรัว ๆ |

ส่วนใหญ่ใช้ `getScriptLock()` — เลือก `getUserLock()` ก็ต่อเมื่อ rate-limit รายคนพอ ไม่ต้องป้องกัน race condition ระหว่างคน

---

## Rule #3: tryLock timeout ต้องสมเหตุสมผล — อย่าใช้ 0 หรือใหญ่เกิน

- **0ms** — fail ทันทีถ้าใครถืออยู่ → user เจอ error บ่อย UX แย่
- **30000ms (30s)** — รอนานพอ แต่ไม่ถึงกับให้ user รู้สึกค้าง
- **> 5 นาที** — เกินครึ่ง quota execution (6 min) ถ้าเปิดทิ้งไว้นาน script crash หมด

### ✓ ค่ามาตรฐาน

```javascript
const TIMEOUT_PDF = 30000;       // PDF gen 30s
const TIMEOUT_QUICK_WRITE = 5000;  // append row 5s
const TIMEOUT_RARE_BATCH = 60000;  // import 100 rows 1 min
```

---

## Rule #4: `finally { lock.releaseLock(); }` เสมอ — แม้ error

**Bug จริง:** ถ้า throw ก่อน releaseLock + ไม่มี finally — lock ค้าง 6 นาทีจนกว่า script timeout — ทุก request หลังจากนี้ tryLock fail

```javascript
// ✗ Bad
const lock = LockService.getScriptLock();
lock.waitLock(30000);
doStuff(); // ถ้า throw → lock ค้าง!
lock.releaseLock();

// ✓ Good
const lock = LockService.getScriptLock();
if (!lock.tryLock(30000)) throw new Error('busy');
try {
  doStuff();
} finally {
  lock.releaseLock();
}
```

---

## Rule #5: **ห้าม** lock รอบ `UrlFetchApp` หรือ trigger ที่ใช้เวลานาน

**Why:** ทุก millisecond ใน lock = block user อื่น

### ✗ Bad

```javascript
const lock = LockService.getScriptLock();
lock.waitLock(30000);
try {
  const data = UrlFetchApp.fetch('https://slow-api.com/...'); // 10 วินาที
  saveToSheet(data); // เร็ว
} finally { lock.releaseLock(); }
```

### ✓ Good — fetch นอก lock

```javascript
const data = UrlFetchApp.fetch('https://slow-api.com/...'); // 10 วินาที (ไม่ lock)
const lock = LockService.getScriptLock();
if (!lock.tryLock(5000)) throw new Error('busy');
try {
  saveToSheet(data); // เร็ว lock แค่นี้
} finally { lock.releaseLock(); }
```

---

## Rule #6: ใช้ unique temp resource name แม้มี lock แล้ว — defense in depth

```javascript
// แม้ lock อยู่ก็ใช้ timestamp + random
const tempName = '__pdf_temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
```

เผื่อกรณี lock ค้าง (rare แต่เกิดได้) + script ลืม cleanup temp sheet จากครั้งก่อน

---


# 📁 rules/logging-boundaries.md

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

---


# 📁 rules/onopen-menu.md

# onOpen Menu — Custom Menu ใน Sheets

## Rule #1: ใช้ `onOpen()` เป็น simple trigger — ไม่ต้องสร้าง installable trigger

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎓 Admin')
    .addItem('▶ Setup โปรเจ็ค', 'setupSandbox')
    .addItem('📝 ดู Config', 'showConfig')
    .addSeparator()
    .addItem('🧹 ล้าง Output sheet', 'clearOutput')
    .addItem('🧹 ล้าง Logs sheet', 'clearLogs')
    .addSeparator()
    .addItem('⚙ Re-setup (reset ทุก sheet)', 'setupSandbox')
    .addToUi();
}
```

**Limit ของ simple trigger:** ห้ามใช้ service ที่ต้อง authorization (UrlFetch, Drive ของ user อื่น, MailApp)
ถ้าต้องใช้ → ทำเป็น installable trigger ที่ user authorize ครั้งแรก

---

## Rule #2: เมนูควรมีหมวด (separator) — กลุ่มฟังก์ชันที่เกี่ยวข้อง

```javascript
ui.createMenu('🎓 Sandbox')
  .addItem('▶ Hello World', 'helloWorld')          // เริ่มต้น
  .addItem('📝 Show Config', 'showConfig')         // อ่านอย่างเดียว
  .addSeparator()
  .addItem('🧹 Clear Output', 'clearOutput')       // ลบ — มีผลข้างเคียง
  .addItem('🧹 Clear Logs', 'clearLogs')
  .addSeparator()
  .addItem('⚙ Re-setup', 'setupSandbox')           // destructive
  .addToUi();
```

ลำดับ: **ใช้บ่อย → ใช้น้อย → ลบ/รีเซ็ต**

---

## Rule #3: destructive action — confirm ก่อนรัน

```javascript
function setupSandbox() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Re-setup โปรเจ็ค',
    'ข้อมูลใน sheet Output และ Logs จะถูกลบทั้งหมด ยืนยันหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  // ... do setup ...
}
```

---

## Rule #4: alert ที่ user ต้องรู้เท่านั้น — ห้าม alert ทุกขั้นตอน

### ✗ Bad

```javascript
function doStuff() {
  ui.alert('เริ่มต้น...');     // ไม่จำเป็น
  step1();
  ui.alert('Step 1 เสร็จ');     // รบกวน
  step2();
  ui.alert('เสร็จแล้ว!');
}
```

### ✓ Good — alert เฉพาะตอนจบ + ใช้ toast สำหรับสถานะ

```javascript
function doStuff() {
  const ss = SpreadsheetApp.getActive();
  ss.toast('กำลังประมวลผล...', '⏳');
  step1();
  step2();
  ss.toast('เสร็จแล้ว', '✅', 3);
  // ใช้ alert เฉพาะถ้า user ต้องตัดสินใจอะไรต่อ
}
```

`ss.toast(message, title, seconds)` — มุมขวาล่าง ไม่ block UI

---

## Rule #5: ถ้า function ที่เรียกอาจไม่มี UI context — wrap alert ใน try/catch

```javascript
function setupSandbox() {
  // ... setup ...
  try {
    SpreadsheetApp.getUi().alert('✅ Setup สำเร็จ!');
  } catch (e) {
    // ถ้ารันผ่าน trigger / clasp run / ไม่มี UI → ข้าม alert
    Logger.log('Setup done (no UI).');
  }
}
```

---

## Rule #6: เมนูแยกตาม role — ใช้ user email ตรวจ

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const email = Session.getActiveUser().getEmail();
  const isAdmin = ADMIN_EMAILS.includes(email);

  const menu = ui.createMenu('🎓 Sandbox');
  menu.addItem('▶ Hello World', 'helloWorld');

  if (isAdmin) {
    menu.addSeparator();
    menu.addItem('⚙ Re-setup', 'setupSandbox');
    menu.addItem('🗑 Delete all data', 'deleteAll');
  }

  menu.addToUi();
}
```

**Caveat:** simple trigger `onOpen` รันด้วยสิทธิ์ของ user ที่เปิด — `Session.getActiveUser().getEmail()` ได้ email user

---

## Rule #7: sub-menu สำหรับเมนูที่ลึก

```javascript
ui.createMenu('🎓 Admin')
  .addItem('🏠 Dashboard', 'showDashboard')
  .addSubMenu(
    ui.createMenu('📊 Reports')
      .addItem('Daily', 'reportDaily')
      .addItem('Weekly', 'reportWeekly')
      .addItem('Monthly', 'reportMonthly')
  )
  .addSubMenu(
    ui.createMenu('⚙ Settings')
      .addItem('Edit config', 'editConfig')
      .addItem('Manage users', 'manageUsers')
  )
  .addToUi();
```

---

## Rule #8: เมนูชื่อสั้น — emoji + คำเดียว

- ✅ `🎓 Sandbox`, `📊 Reports`, `⚙ Settings`
- ❌ `🎓 Sandbox Management Console`, `📊 View All Reports for This Project`

GAS menu bar แคบ — ชื่อยาวเปลือง space + อ่านยาก

---


# 📁 rules/pdf-generation.md

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

---


# 📁 rules/project-structure.md

# Project Structure

## Rule: ใช้ clasp + แยกไฟล์ตาม domain ไม่ใช่ตาม type

**Why:** Apps Script editor บนเว็บแสดงทุกไฟล์เป็น flat list — ถ้าตั้งชื่อไฟล์ตาม domain (`Users.js`, `Records.js`, `PdfGen.js`) จะหาง่ายกว่า `models.js` / `controllers.js`

### ✗ Bad — ทุกอย่างใน Code.gs ไฟล์เดียว

```
Code.gs   (2000 บรรทัด)
```

### ✓ Good — split ตาม domain

```
project/
├── .clasp.json
├── appsscript.json
├── รหัส.js           ← bootstrap + schema + getConfig_ + utility ที่ใช้ทั่ว
├── Users.js           ← login, requireUser_, requireRole_, password
├── Records.js         ← CRUD record/folder
├── Signature.js       ← signature upload/delete
├── PdfGen.js          ← PDF template + export
└── Index.html         ← single-page web app
```

## Rule: .clasp.json ต้อง gitignore `*.json` ที่มี secret

`.clasp.json` มี `scriptId` (ไม่ secret) — commit ได้
`.clasprc.json` ในโฮม dir มี OAuth token — **อย่า commit เด็ดขาด**

```
# .gitignore
node_modules/
.clasprc.json
```

## Rule: appsscript.json บังคับใส่ timezone + runtimeVersion: V8

```json
{
  "timeZone": "Asia/Bangkok",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

**Why V8:** รองรับ ES6+ (const/let, arrow, template literals, spread) — Rhino runtime (เก่า) ไม่รองรับ

**`executeAs: USER_DEPLOYING`** = web app รันด้วยสิทธิ์ของคนที่ deploy → user ที่เปิดเว็บไม่ต้อง grant access เอง — แต่ทุก mutation ต้อง guard role เอง (ดู `rules/security.md`)

## Rule: ห้าม commit `appsscript.json` ที่มี `webapp.deploymentId` หรือ `scriptId` แปลก ๆ

ใช้ template เปล่า ๆ — ค่า deployment-specific อยู่ใน clasp deploy output

## Rule: file naming

- bootstrap/main → `รหัส.js` (default name ของ Apps Script ภาษาไทย) หรือ `Main.js`
- ตาม domain → PascalCase `Users.js`, `Records.js`
- ตัวช่วย global → `Utils.js`
- ห้ามขึ้นต้นเลข, ห้ามมีช่องว่าง (clasp pull/push จะเพี้ยน)

---


# 📁 rules/schema-migrations.md

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

---


# 📁 rules/security.md

# Security

## Rule #1: ทุก server function ที่ client เรียกได้ ต้อง `requireUser_` + `requireRole_`

**Why:** web app ที่ deploy `executeAs: USER_DEPLOYING` รันด้วยสิทธิ์ owner — ไม่มี per-request auth จาก Google ฝั่ง user

### ✓ Good — guard ทุก function

```javascript
function deleteRecord(callerUserId, rowIndex) {
  try {
    const caller = requireUser_(callerUserId);
    const record = readRecord_(rowIndex);
    if (!record) throw new Error('ไม่พบ record');

    // teacher ลบได้แค่ของตัวเอง
    if (caller.Role === 'teacher' && String(record.TeacherUserID) !== String(caller.UserID)) {
      throw new Error('ไม่มีสิทธิ์ลบ');
    }
    // admin/supervisor ลบได้หมด

    sheet.deleteRow(Number(rowIndex));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

function requireUser_(callerUserId) {
  if (!callerUserId) throw new Error('ไม่ได้ login');
  const user = findUserById_(callerUserId);
  if (!user) throw new Error('ไม่พบผู้ใช้');
  if (user.Active === false || user.Active === 'false') throw new Error('บัญชีถูกปิดใช้งาน');
  return user;
}

function requireRole_(user, allowedRoles) {
  if (!Array.isArray(allowedRoles)) allowedRoles = [allowedRoles];
  if (!allowedRoles.includes(user.Role)) throw new Error('ไม่มีสิทธิ์');
}
```

---

## Rule #2: ยอมรับว่า `callerUserId` ปลอมได้ — สำหรับ stake สูงต้องใช้ session token

**Limit ของ pattern token-as-userId:** client เก็บ userId ใน localStorage — ใครก็แก้ใส่ userId ของ admin ได้

### สำหรับงาน internal / low-stake → OK

### สำหรับงาน sensitive → ใช้ session token + expiry

```javascript
// Login: server สร้าง token, เก็บใน Session sheet พร้อม userId + expiry
function login(username, password) {
  const user = verifyPassword_(username, password);
  if (!user) return { ok: false, message: 'username/password ผิด' };

  const token = Utilities.getUuid();
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hr
  appendRowByHeaders_(getSessionSheet_(), {
    Token: token,
    UserID: user.UserID,
    ExpiresAt: expiresAt,
    CreatedAt: new Date().toISOString(),
  });
  return { ok: true, token: token, userId: user.UserID, role: user.Role };
}

// ทุก server function รับ token แทน userId
function requireSession_(token) {
  if (!token) throw new Error('ไม่ได้ login');
  const sessions = readSheet_(getSessionSheet_());
  const s = sessions.find(r => r.Token === token);
  if (!s) throw new Error('session หมดอายุ');
  if (Number(s.ExpiresAt) < Date.now()) throw new Error('session หมดอายุ');
  return findUserById_(s.UserID);
}
```

Trade-off: เพิ่ม sheet write ทุก login + ต้องล้าง expired session ผ่าน trigger

---

## Rule #3: เก็บ password เป็น hash (PBKDF2) ไม่ใช่ plain text

```javascript
function hashPassword_(password, salt) {
  // ใน GAS ไม่มี crypto.subtle — ใช้ Utilities.computeHmacSha256Signature ซ้ำ ๆ
  let bytes = Utilities.newBlob(password).getBytes();
  const saltBytes = Utilities.newBlob(salt).getBytes();
  for (let i = 0; i < 10000; i++) {
    bytes = Utilities.computeHmacSha256Signature(bytes, saltBytes);
  }
  return Utilities.base64Encode(bytes);
}

function generateSalt_() {
  return Utilities.getUuid();
}

// On create user
const salt = generateSalt_();
const hash = hashPassword_(password, salt);
// store: PasswordHash, PasswordSalt

// On login
const expected = hashPassword_(inputPassword, user.PasswordSalt);
if (expected !== user.PasswordHash) throw new Error('password ผิด');
```

---

## Rule #4: oauthScopes ใน appsscript.json — ขออันที่ใช้จริง

**Why:** ขอเกินจำเป็น → user เห็นแจ้งเตือนน่ากลัวตอน authorize + audit fail ใน enterprise

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",          // อ่าน/เขียน Sheet
    "https://www.googleapis.com/auth/drive.file",            // เฉพาะไฟล์ที่ script สร้างเอง — ดีกว่า /drive
    "https://www.googleapis.com/auth/script.external_request",  // UrlFetch
    "https://www.googleapis.com/auth/userinfo.email"         // ดู email user
  ]
}
```

**Scope hierarchy (จาก narrow → broad):**
- `drive.file` — เฉพาะไฟล์ที่ script สร้าง / user เลือกผ่าน picker ← **ใช้ตัวนี้ถ้าได้**
- `drive.readonly` — อ่านทั้ง Drive
- `drive` — full access — **หลีกเลี่ยง**

---

## Rule #5: validate input ที่ boundary — อย่าเชื่อ payload

```javascript
function saveRecord(callerUserId, payload) {
  // type + presence checks
  if (!payload || typeof payload !== 'object') throw new Error('payload ผิด');
  if (!payload.folderId || typeof payload.folderId !== 'string') throw new Error('ไม่มี folderId');
  const total = parseInt(payload.totalStudents);
  if (isNaN(total) || total < 0 || total > 1000) throw new Error('จำนวนนักเรียนไม่ถูกต้อง');

  // string length cap (กัน 1MB string)
  if (String(payload.topic || '').length > 500) throw new Error('หัวข้อยาวเกิน 500 ตัวอักษร');

  // ... mutation ...
}
```

---

## Rule #6: ห้าม echo input กลับ HTML ไม่ escape

ถ้าใช้ `HtmlService.createTemplate()`:

### ✗ Bad

```html
<div><?= unsafeUserInput ?></div>  <!-- XSS -->
```

### ✓ Good

```html
<div><?!= encodeHtml(safeValue) ?></div>
```

หรือ render ทุกอย่างใน client (Alpine/Vue) แล้ว server คืน JSON เท่านั้น — XSS ขึ้นกับ framework ฝั่ง client (Alpine `x-text` escape อัตโนมัติ)

---

## Rule #7: ห้าม commit OAuth token / API key ใน source

`.clasprc.json` — ในโฮม dir, gitignore แล้ว แต่บางคน export มาวางใน repo
API key (LINE, OpenAI, ฯลฯ) → ใส่ใน **PropertiesService.getScriptProperties()** หรือ Config sheet ที่ไม่ถูก share

```javascript
function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
}
```

ตั้งค่าผ่าน Apps Script editor: **Project Settings → Script properties → Add property**

---

## Rule #8: log access ของ sensitive operation

```javascript
function deleteUser(callerUserId, targetUserId) {
  const caller = requireUser_(callerUserId);
  requireRole_(caller, ['admin']);
  // ...
  appendRowByHeaders_(getAuditSheet_(), {
    Timestamp: new Date().toISOString(),
    Actor: caller.UserID,
    Action: 'deleteUser',
    Target: targetUserId,
    IP: '-', // GAS ไม่มี request IP
  });
}
```

---


# 📁 rules/spreadsheet-ops.md

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

---


# 📁 rules/testing-debugging.md

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

---


# 📁 rules/web-app-rpc.md

# Web App RPC Pattern

GAS web app เรียก server function จาก client ผ่าน `google.script.run` — ต่อไปนี้คือ pattern ที่ scale ได้

## Rule #1: ทุก server function คืน `Result<T>` envelope ห้าม throw

**Why:** ถ้า throw ใน server, client ได้แค่ `error.message` แบบ raw — ถ้า error เกิดในชั้นลึก message อาจเป็น "Exception: ข้อผิดพลาดของบริการ: สเปรดชีต" (user งง)

### ✓ Good — envelope pattern

```javascript
function saveRecord(callerUserId, payload) {
  try {
    const caller = requireUser_(callerUserId);
    requireRole_(caller, ['teacher']);
    // ... mutation ...
    return { ok: true, recordId: recordId, message: 'บันทึกสำเร็จ' };
  } catch (err) {
    Logger.log('[saveRecord] ' + (err.stack || err));
    return { ok: false, message: err.message || String(err) };
  }
}
```

---

## Rule #2: client wrapper — promisify `google.script.run`

```javascript
function rpc(name, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [name](...args);
  });
}

// Usage
const res = await rpc('saveRecord', this.user.userId, payload);
if (res.ok) {
  Swal.fire('สำเร็จ', res.message, 'success');
} else {
  Swal.fire('ผิดพลาด', res.message, 'error');
}
```

---

## Rule #3: identify caller ผ่าน `callerUserId` parameter ไม่ใช่ Session.getActiveUser()

**Why:** ถ้า web app `executeAs: USER_DEPLOYING` ทุก request `Session.getActiveUser()` = owner ของ deployment — ไม่ใช่ user ที่กดปุ่ม

### ✓ Good — token-based caller

```javascript
// Client เก็บ userId หลัง login (ใน localStorage ก็ได้ ถ้า low-stakes)
const res = await rpc('saveRecord', this.user.userId, payload);

// Server: validate callerUserId ทุก function
function requireUser_(callerUserId) {
  if (!callerUserId) throw new Error('ไม่ได้ login');
  const user = findUserById_(callerUserId);
  if (!user) throw new Error('ไม่พบผู้ใช้');
  if (user.Active === false || user.Active === 'false') throw new Error('บัญชีถูกปิด');
  return user;
}

function requireRole_(user, allowedRoles) {
  if (!allowedRoles.includes(user.Role)) throw new Error('ไม่มีสิทธิ์');
}
```

**ข้อจำกัด:** `callerUserId` พอใส่ใน client ก็ปลอม userId ของคนอื่นได้ — สำหรับงานที่ต้องการ security จริง ๆ ต้องเก็บ session token + verify (ดู `rules/security.md`)

---

## Rule #4: ป้องกัน HTML payload ใหญ่เกินไป — RPC limit 50MB

ถ้าต้อง upload รูป/ไฟล์ใหญ่:
- รูป → base64 dataURL ขนาด ≤ 5MB ปกติพอ
- ไฟล์ใหญ่ → ให้ upload เข้า Drive ก่อน แล้วส่งแค่ `fileId` มา server

### ✓ Good

```javascript
// Client: บีบรูปก่อนส่ง
function compressImage(dataUrl, maxWidth = 1200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}
```

---

## Rule #5: bundle initial load — เรียก 1 ฟังก์ชันได้หลายอย่าง

**Why:** ทุก RPC = round-trip ~300ms — 5 calls ตอน boot = 1.5s

### ✗ Bad

```javascript
const me = await rpc('getMe', uid);
const folders = await rpc('listFolders', uid);
const records = await rpc('listRecords', uid);
const users = await rpc('listUsers', uid);
```

### ✓ Good

```javascript
// Server
function loadInitialBundle(callerUserId) {
  try {
    const caller = requireUser_(callerUserId);
    return {
      ok: true,
      me: sanitizeForClient_(caller),
      folders: listFolders_(caller),
      records: listRecords_(caller),
      users: caller.Role === 'admin' ? listUsers_() : [],
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Client
const bundle = await rpc('loadInitialBundle', this.user.userId);
```

---

## Rule #6: optimistic update — อย่ารอ server เพื่อแสดงผล

```javascript
async doSaveReview() {
  const optimisticStatus = this.modal.reviewStatus;
  this.modal.record.AcademicStatus = optimisticStatus; // อัพเดท UI ทันที
  try {
    const res = await rpc('updateRecordStatus', uid, rowIndex, optimisticStatus, comment);
    if (!res.ok) {
      // rollback
      Swal.fire('ผิดพลาด', res.message, 'error');
      this.refresh(false);
    }
  } catch (e) {
    this.refresh(false);
  }
}
```

---

## Rule #7: loading overlay สำหรับ operation > 1 วินาที

ใช้ SweetAlert2 หรือ overlay element:

```javascript
async doGeneratePdf() {
  Swal.fire({
    title: 'กำลังสร้าง PDF...',
    html: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });
  try {
    const res = await rpc('generatePdfForRecord', uid, rowIndex);
    if (res.ok) {
      Swal.close();
      window.open(res.pdfUrl, '_blank');
    } else {
      Swal.fire('ผิดพลาด', res.message, 'error');
    }
  } catch (e) {
    Swal.fire('Error', 'สร้าง PDF ไม่สำเร็จ', 'error');
  }
}
```

---

