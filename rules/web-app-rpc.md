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
