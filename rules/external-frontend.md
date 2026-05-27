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
