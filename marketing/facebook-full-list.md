# คอนเทนต์เฟสบุ๊ก (ฉบับเต็ม) — รวมทุกกฎใน gas-best-practices

ลิสต์ครบทุกหมวด ทุกกฎ — เอาไปทำโพสต์ยาว, ร้อยเป็น thread, หรือทำ carousel ทีละหมวดก็ได้

> Claude Code skill รวมแนวปฏิบัติ Google Apps Script — สังเคราะห์จากบั๊กจริงใน production
> 16 หมวด · 130+ กฎ · ฟรี MIT · github.com/kpcrmv4/gas-best-practices

---

## 🧵 โพสต์เปิด (hook)

รวมทุกอย่างที่ผมเรียนรู้จากการทำเว็บแอป Google Apps Script ขึ้น production จริง
— ตกผลึกจากบั๊กที่เคยเจอเองล้วน ๆ — เป็น skill ให้ AI เขียนโค้ดให้ถูกตั้งแต่แรก 👇

16 หมวด มีกฎย่อยรวมกว่า 130 ข้อ นี่คือลิสต์ทั้งหมด:

---

## 1️⃣ Project Structure — วางโครงโปรเจกต์

- ใช้ clasp + แยกไฟล์ตาม domain ไม่ใช่ตาม type
- `.clasp.json` ต้อง gitignore ไฟล์ `*.json` ที่มี secret
- `appsscript.json` บังคับใส่ timezone + runtimeVersion: V8
- ห้าม commit `appsscript.json` ที่มี deploymentId / scriptId แปลก ๆ
- ตั้งชื่อไฟล์ให้สื่อ domain

## 2️⃣ Spreadsheet Operations — อ่าน/เขียนชีต

- อ่าน Sheet ครั้งเดียวด้วย `getDataRange().getValues()` (เลี่ยง N+1 call หลุด quota)
- ห้าม `range.setValues()` บนชีตที่อาจมี merged cells (เด้ง "ข้อผิดพลาดของบริการ: สเปรดชีต")
- append row ตาม header order — ห้าม hardcode column index
- หา column index จากชื่อ header
- `SpreadsheetApp.flush()` หลัง mutation ก่อนอ่านใหม่/return
- Date object — ระวัง 3 ด่าน (เก็บ/ส่ง/แสดง) เพราะ google.script.run ไม่ serialize Date
- ฟิลด์ตัวเลขที่ขึ้นต้นด้วย 0 ต้องบังคับเป็น text (กันเบอร์โทร 0 หน้าหาย)
- คอลัมน์ที่แสดงเป็น % เก็บเป็น string ไม่ใช่ number
- คำนวณซ้ำฝั่ง server — อย่าเชื่อค่าจาก client (กันบั๊ก PassPercent = 500%)

## 3️⃣ Web App RPC — เรียกผ่าน google.script.run

- ทุก server function คืน `Result<T>` envelope ห้าม throw ออกไปให้ client เห็น stack trace
- เขียน client wrapper promisify `google.script.run`
- ระบุตัวผู้เรียกผ่าน `callerUserId` parameter ไม่ใช่ `Session.getActiveUser()`
- กัน HTML payload ใหญ่เกิน RPC limit 50MB
- bundle initial load — เรียกฟังก์ชันเดียวได้ข้อมูลหลายอย่าง
- optimistic update — อย่ารอ server เพื่อแสดงผล
- loading overlay สำหรับ operation > 1 วินาที

## 4️⃣ HtmlService & Frontend

- `<meta viewport>` ต้องอยู่ใน `<head>` ของไฟล์ `.html` — ห้ามใส่ใน `.gs` (ไม่งั้นมือถือไม่ responsive)
- viewport ตั้งให้ครอบคลุมทุกกรณี
- ใช้ `HtmlService.createHtmlOutputFromFile()` ไม่ใช่ string concat
- แยก partial เป็นไฟล์ด้วย `<?!= include('partial') ?>`
- `<?= var ?>` escape อัตโนมัติ / `<?!= var ?>` ไม่ escape
- server function ที่ template เรียกตอน render ต้อง deterministic + เร็ว
- `setXFrameOptionsMode(ALLOWALL)` ถ้าต้อง embed ในเว็บอื่น
- ห้ามใช้ inline event handler เรียก server function ตรง ๆ
- tags ที่มักลืม
- ส่ง log warning จาก client → server (ดีบักบนมือถือ)

## 5️⃣ External Frontend (GitHub Pages / Netlify / Vercel) + GAS Backend

- GAS endpoint รับ POST `text/plain` เพื่อหลีกเลี่ยง CORS preflight
- deploy แบบ Execute as: Me + Anyone (even anonymous)
- ทุก request ต้องส่ง auth token ใน payload
- pattern การถ่ายรูปจากกล้อง (เลี่ยง iframe block ของ GAS)
- บีบรูปก่อนส่ง — RPC limit ~50MB แต่เน็ตช้า
- ห้ามใส่ secret / API key ใน frontend
- จัดการ redirect ของ GAS URL ครั้งแรก
- รูปแบบ deploy URL ที่ใช้กับ fetch ได้
- multi-account login — เติม `/u/0/` หรือ `?authuser=` กัน "ไม่สามารถเปิดไฟล์ได้ในเวลานี้"
- ตั้งค่า GitHub Pages
- ทำ PWA ติดตั้งได้ + offline cache
- error handling รวม CORS / network error
- เทียบ: เมื่อไหร่ใช้ GAS HtmlService vs external frontend
- log ฝั่ง GAS เวลารับ request เป็น string

## 6️⃣ PDF Generation — สร้าง PDF จาก template

- ใช้ placeholder `{{KEY}}` ใน template sheet
- copy template → temp sheet → export → delete temp
- export PDF ผ่าน UrlFetch + OAuth token (ไม่ใช่ DriveApp)
- insertImage anchor อยู่บนซ้ายเสมอ — alignment ของ cell ไม่มีผล
- รักษาอัตราส่วนรูป ห้าม stretch
- ตัดขอบขาวของรูปก่อน upload (เคสลายเซ็นจาก canvas)
- cache PDF — ลบไฟล์เดิมก่อนสร้างใหม่
- business rule guard ก่อน generate
- จัดวันที่ไทย (พ.ศ.) ด้วย helper เดียวกันทุกที่
- get-or-generate pattern แยก endpoint
- ตารางอ้างอิง PDF export URL parameters
- เก็บ PDF แยกตาม owner
- ตั้งชื่อไฟล์ PDF ด้วย RecordID ไม่ใช่ display name

## 7️⃣ Drive Operations

- เก็บ folder ID ใน Config sheet — ไม่ hardcode (แก้ง่ายไม่ต้อง redeploy)
- lazy creation — สร้างโฟลเดอร์อัตโนมัติถ้ายังไม่มี
- เก็บรูป signature/avatar เป็น base64 dataURL คืน client — อย่าใช้ Drive thumbnail URL
- รูปใหญ่/หลายรูป — share ANYONE_WITH_LINK + ใช้ direct URL
- `setSharing(ANYONE_WITH_LINK)` แตกบน Google Workspace ของหน่วยงาน/โรงเรียน (โดน domain policy บล็อก)
- ลบไฟล์เก่าก่อน upload ใหม่ — กัน Drive รก
- validate dataURL ฝั่ง server ก่อนถอด base64
- เก็บโฟลเดอร์ของ user แยก ไม่กองรวม

## 8️⃣ LockService — กันชนกัน (concurrency)

- ใช้ `LockService.getScriptLock()` รอบ mutation ที่ user หลายคนชนกันได้
- เลือก scope ของ lock ให้ถูก
- tryLock timeout ให้สมเหตุสมผล (อย่า 0 หรือใหญ่เกิน)
- `finally { lock.releaseLock(); }` เสมอ แม้ error (กัน lock ค้าง 6 นาที)
- ห้าม lock รอบ `UrlFetchApp` หรือ trigger ที่ใช้เวลานาน
- ใช้ชื่อ temp resource ที่ unique แม้มี lock แล้ว (defense in depth)

## 9️⃣ CacheService — ลด round-trip ไปชีต

- cache query ที่อ่านบ่อย + เปลี่ยนน้อย
- invalidate cache ทุกครั้งที่ data เปลี่ยน
- TTL ขึ้นกับลักษณะ data
- cache key มี prefix กันชน
- ScriptCache มี size limit 100KB ต่อ key
- try/catch รอบ `cache.put()` — fail ไม่ใช่เรื่องคอขาดบาดตาย
- เทียบ CacheService vs PropertiesService

## 🔟 Dynamic Dropdowns — ตัวเลือกที่ไม่ควรฟิกตาย

- dropdown วันที่/ปี ห้าม hardcode ใน HTML (กันหมดอายุปีหน้า)
- default value = ปีปัจจุบัน
- dropdown ที่เป็น enum จาก data จริง — ดึงจากชีต
- เดือน — ใช้ Intl.DateTimeFormat ไม่ hardcode
- time slot — generate ตาม step
- dropdown ตาม role — กรองฝั่ง client + ตรวจซ้ำฝั่ง server
- refresh option list หลังสร้าง row ใหม่

## 1️⃣1️⃣ Security

- ทุก server function ที่ client เรียกได้ ต้อง `requireUser_` + `requireRole_`
- ยอมรับว่า `callerUserId` ปลอมได้ — งาน stake สูงต้องใช้ session token
- เก็บ password เป็น hash (PBKDF2) ไม่ใช่ plain text
- `oauthScopes` ใน appsscript.json ขอเฉพาะที่ใช้จริง
- validate input ที่ boundary — อย่าเชื่อ payload
- ห้าม echo input กลับ HTML โดยไม่ escape
- ห้าม commit OAuth token / API key ใน source
- log access ของ sensitive operation

## 1️⃣2️⃣ Schema Migrations — เพิ่มตาราง/คอลัมน์โดยไม่พังของเก่า

- `ensureSchema()` ต้อง idempotent รันกี่ครั้งก็ปลอดภัย
- cache `ensureSchema()` ต่อ execution อย่ารันซ้ำใน function เดียว
- column ใหม่ต้องมี default value ให้ row เก่า
- rename column ห้ามทำตรง ๆ — เพิ่มใหม่ + copy + ลบทีหลัง
- track migration version ใน Config sheet
- ไฟล์ template สร้างจาก code ถ้าไม่มี
- log migration เป็น Audit row

## 1️⃣3️⃣ Error Handling

- Result envelope ทุก server function — ไม่ throw
- ข้อความถึง user เป็นภาษาไทย / log สำหรับ developer เป็นอังกฤษ
- catch + rethrow แบบเพิ่ม context
- ห้าม swallow error เงียบ ๆ
- error message ต้อง actionable ไม่ใช่แค่ "Error"
- ตารางแปล GAS error messages ที่พบบ่อย
- client แสดง error เป็น modal ไม่ใช่ console
- retry pattern สำหรับ transient error

## 1️⃣4️⃣ onOpen Menu — เมนูใน Sheets

- ใช้ `onOpen()` เป็น simple trigger ไม่ต้องสร้าง installable trigger
- เมนูควรมีหมวด (separator) จัดกลุ่มฟังก์ชัน
- destructive action ต้อง confirm ก่อนรัน
- alert เฉพาะที่ user ต้องรู้ ห้าม alert ทุกขั้นตอน
- ถ้า function อาจไม่มี UI context — wrap alert ใน try/catch
- เมนูแยกตาม role — ใช้ user email ตรวจ
- sub-menu สำหรับเมนูที่ลึก
- ชื่อเมนูสั้น — emoji + คำเดียว

## 1️⃣5️⃣ Testing & Debugging

- `Logger.log` ทุก critical path + execution boundary
- log มี prefix `[FunctionName]` เสมอ
- log structured data ไม่ใช่ string concat ทั้งก้อน
- เขียน test function ไว้รันมือใน Apps Script editor
- e2e test ผ่าน fetch / curl
- `clasp run` เรียก function จาก CLI
- cleanup state ระหว่าง test
- Stackdriver / Cloud Logging สำหรับ production
- timing log หา bottleneck
- ระวัง rate limit / quota รายวัน

## 1️⃣6️⃣ Logging at Data Boundaries

- ทุก RPC boundary ต้อง log ทั้ง 2 ฝั่ง — client + server
- Client: `console.log` ก่อนส่ง + หลังรับทุก RPC
- Server: `Logger.log` entry + exit ทุก function ที่ client เรียก
- ห้าม log sensitive data — mask ก่อน
- log payload size รู้ก่อนชน quota
- log version + build identifier ตอน boot
- group log สำหรับ flow ที่ซับซ้อน
- production toggle ด้วย `__DEBUG__` flag
- log ฝั่ง server สำหรับ external call (UrlFetch, MailApp)
- client log ที่ user เห็น สอนให้ user copy ได้
- บอก user ว่าดู server execution log ที่ไหน
- log retention — GAS เก็บ execution log แค่ ~7 วัน

---

## 🏁 โพสต์ปิด (CTA)

ทั้งหมดนี้รวมเป็น skill เดียว ติดตั้งครั้งเดียวจบ — แล้วให้ Claude Code (หรือ Cursor / Windsurf / ChatGPT / Gemini) เขียนโค้ด GAS ตาม pattern เหล่านี้ให้อัตโนมัติ

ฟรี + open source (MIT)

ติดตั้ง (Mac/Linux):
curl -fsSL https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.sh | bash

ดูทั้งหมด / ดาวน์โหลด 👉 github.com/kpcrmv4/gas-best-practices

#GoogleAppsScript #GAS #ClaudeCode #AICoding #ClaspCLI #เขียนโปรแกรม

---

## 💡 ทิปการโพสต์

- ลิสต์นี้ยาว → ทำเป็น **carousel** ทีละหมวด (16 สไลด์) หรือ **thread** ก็เวิร์ก
- ลิงก์ + คำสั่งติดตั้ง วางในคอมเมนต์แรก กัน reach ตก
- หยิบบั๊กเด็ด ๆ (merged cells / เบอร์โทร 0 หาย / dropdown ปีหมดอายุ) ขึ้นเป็นภาพปก
