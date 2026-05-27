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
} catch (e) {}

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
