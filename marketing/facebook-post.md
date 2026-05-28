# คอนเทนต์เฟสบุ๊ก — gas-best-practices

ร่างโพสต์สำหรับโปรโมต Claude Code skill นี้ — เลือกใช้ตามโทนเพจ/กลุ่มเป้าหมาย

---

## เวอร์ชัน 1 — โพสต์หลัก (เล่าจาก pain point)

เคยเขียน Google Apps Script แล้วเจอบั๊กแปลก ๆ พวกนี้ไหม? 🙃

🐛 `setValues()` แล้วเด้ง "ข้อผิดพลาดของบริการ: สเปรดชีต" เพราะ template มี merged cells
🐛 เบอร์โทร `0812345678` กลายเป็น `812345678` เพราะ Sheets แปลงเป็นตัวเลข เลข 0 หน้าหาย
🐛 dropdown ปีที่ hardcode ไว้ พอขึ้นปีใหม่ก็หมดอายุ
🐛 Lock ค้าง 6 นาที เพราะลืม `finally { releaseLock() }`
🐛 ลายเซ็นใน PDF ทับแถวอื่น / รูป preview พังเพราะใช้ Drive URL ตรง ๆ ไม่แปลงเป็น base64

ผมรวมแนวปฏิบัติที่ "สังเคราะห์จากบั๊กจริงใน production" มาเป็น **skill สำหรับ Claude Code** ชื่อ `gas-best-practices` 🎯

ติดตั้งครั้งเดียว → เวลาให้ AI ช่วยเขียน/แก้โค้ด GAS มันจะทำตาม pattern ที่ผ่านการใช้งานจริงให้อัตโนมัติ (return Result envelope, ใช้ LockService, bulk read sheet, ฯลฯ) ไม่ต้องมานั่งสอนใหม่ทุกครั้ง

ครอบคลุม 16 หัวข้อ เช่น:
✅ Spreadsheet bulk read/write + กับดัก merged cells
✅ Web app RPC ผ่าน google.script.run + error message ภาษาไทย
✅ สร้าง PDF จาก template + placeholder + ลายเซ็น
✅ Drive / Lock / Cache / OAuth scope / schema migration
✅ กล้อง + PWA (frontend แยกไป GitHub Pages เลี่ยง iframe block)

ฟรี + open source (MIT) ใช้ได้กับ Claude Code, Cursor, Windsurf, Cline, ChatGPT, Gemini

ติดตั้ง (Mac/Linux):
curl -fsSL https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.sh | bash

โหลด / ดูเพิ่มเติม 👉 github.com/kpcrmv4/gas-best-practices

#GoogleAppsScript #GAS #ClaudeCode #AICoding #ClaspCLI #เขียนโปรแกรม

---

## เวอร์ชัน 2 — สั้น กระชับ (สาย dev)

ทำเว็บแอป Google Apps Script แล้วอยากให้ AI เขียนโค้ดได้ถูก pattern ตั้งแต่แรก?

`gas-best-practices` — Claude Code skill ที่รวม 16 กฎจากบั๊กจริงใน production
อ่านครั้งเดียวอัตโนมัติ ไม่ต้องสอน AI ใหม่ทุกครั้ง

• bulk read/write Sheet + กับดัก merged cells
• Result envelope + ข้อความ error ภาษาไทย
• LockService, CacheService, OAuth scope
• PDF จาก template + ลายเซ็น
• กล้อง/PWA แยก frontend ไป GitHub Pages

ฟรี MIT · ใช้กับ Cursor / Windsurf / ChatGPT ได้
👉 github.com/kpcrmv4/gas-best-practices

#GoogleAppsScript #ClaudeCode #AICoding

---

## เวอร์ชัน 3 — สายครู/บุคลากร (ทำระบบงานเอกสาร)

ทำระบบออกเอกสาร/ใบประกาศ/PDF ด้วย Google Apps Script เองอยู่ใช่ไหม? 📄

รวมเคล็ดลับ + กับดักที่คนทำระบบโรงเรียน/หน่วยงานเจอบ่อย:
• ลายเซ็นทับแถวอื่นใน PDF / รูปไม่ขึ้น
• "Permission denied: DriveApp" เพราะ domain policy บล็อกแชร์ลิงก์
• เปิดไฟล์ไม่ได้เพราะล็อกอิน Google หลายบัญชี
• เบอร์โทรเลข 0 หน้าหาย

ทั้งหมดสรุปเป็น skill ให้ AI (Claude Code) เขียนโค้ดให้ถูกตั้งแต่แรก — ฟรี
👉 github.com/kpcrmv4/gas-best-practices

#GoogleAppsScript #งานเอกสาร #ClaudeCode

---

## หมายเหตุการใช้งาน

- เฟสบุ๊กไม่ทำลิงก์ในโพสต์ให้เด่นเท่าไหร่ → แนะนำวางลิงก์ตัวเต็มในคอมเมนต์แรกด้วย
- โค้ดติดตั้ง (`curl ... | bash`) บางทีเฟสบุ๊กตัดบรรทัด → อาจย้ายไปคอมเมนต์
- ใส่รูป/วิดีโอสั้นตัวอย่าง before/after จะเพิ่ม reach ได้มาก
