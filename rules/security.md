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
