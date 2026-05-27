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
