# Deployment & Versioning (clasp)

## Rule #1: `clasp push` ไม่ทำให้เว็บ production เปลี่ยน — ต้องสร้าง version ใหม่ของ deployment

**Why:** bug คลาสสิกอันดับหนึ่งของมือใหม่ GAS — push โค้ดแล้วเปิดเว็บ `/exec` ไม่เห็นของใหม่ เพราะ deployment แบบ versioned จะ**ตรึงโค้ด ณ version ที่ deploy** ไว้

| URL | รันโค้ดจาก | ใครเข้าได้ |
|---|---|---|
| `.../dev` | **HEAD** (โค้ดล่าสุดที่ push) | เฉพาะคนมีสิทธิ์แก้ script |
| `.../exec` | **version ที่ deploy ไว้** | ตาม `webapp.access` |

### ✓ Flow ที่ถูก

```bash
clasp push                      # อัพโค้ดขึ้น HEAD
# ทดสอบผ่าน /dev URL ก่อน
clasp deploy -i <deploymentId> -d "v12 fix pdf margin"   # อัพเดท deployment เดิม → /exec เปลี่ยน
```

---

## Rule #2: อัพเดท deployment **เดิม** (`-i <deploymentId>`) — ห้าม `clasp deploy` เปล่า ๆ ซ้ำ

**Why:** `clasp deploy` โดยไม่ระบุ `-i` จะสร้าง deployment **ใหม่** พร้อม **URL ใหม่** — ลิงก์ที่แจก user ไปแล้ว/ฝังใน LINE rich menu/QR code จะยังชี้ deployment เก่าที่รันโค้ดเก่าตลอดไป

```bash
# ดู deployment ที่มีอยู่
clasp deployments
# - AKfycb...XYZ @12 - production

# ✓ deploy ทับตัวเดิม — URL ไม่เปลี่ยน
clasp deploy -i AKfycb...XYZ -d "v13 add export excel"
```

ใน Apps Script editor: **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy** (ผลเหมือนกัน)

---

## Rule #3: ใช้ 2 deployments — `dev` กับ `production`

**Why:** ทดสอบบน URL เดียวกับที่ user ใช้จริง = user เจอ bug ก่อนคุณ

```
Deployment "production"  → URL แจก user จริง — อัพเดทเฉพาะเมื่อทดสอบผ่านแล้ว
Deployment "staging"     → URL สำหรับทีมทดสอบ — อัพเดทบ่อยได้
HEAD (/dev)              → developer เท่านั้น — เปลี่ยนทุกครั้งที่ push
```

เก็บ deployment ID ทั้งสองไว้ใน README ของโปรเจ็ค — กันสับสนว่าอันไหนเป็นอันไหน

---

## Rule #4: จด version + วันที่ + สรุปการเปลี่ยนแปลงใน description ทุกครั้ง

**Why:** ตอนของพังใน production คำถามแรกคือ "version ล่าสุดเปลี่ยนอะไร แล้ว rollback ไป version ไหนดี" — description ว่าง ๆ ตอบไม่ได้

```bash
clasp deploy -i <id> -d "2026-08-14 v14: fix leading zero phone (spreadsheet-ops #6.6)"
```

**Rollback:** Manage deployments → edit → เลือก version เก่า → Deploy (URL เดิม โค้ดถอยกลับ)

---

## Rule #5: ฝัง version string ในโค้ด — ให้เช็คได้ว่า user รันตัวไหนอยู่

**Why:** เวลา user รายงาน bug คำถามคือ "คุณใช้เวอร์ชันไหน" — browser cache ทำให้ frontend กับ backend คนละ version ได้ (ดู `rules/logging-boundaries.md` เรื่อง version stamp)

```javascript
const APP_VERSION = 'v14-2026-08-14';

function getAppInfo() {
  return { ok: true, version: APP_VERSION };
}
```

แสดง version ที่ footer ของหน้าเว็บ + log ทุกครั้งที่ RPC สำคัญถูกเรียก

---

## Rule #6: `.claspignore` — อย่า push ไฟล์ที่ไม่ใช่ source ขึ้น Apps Script

**Why:** clasp push ทุกไฟล์ในโฟลเดอร์ default — README, ไฟล์ test, `.env` ตัวอย่าง จะโผล่ใน Apps Script editor (และไฟล์ `.js` ทุกตัวกลายเป็น server code ที่รันได้)

```
# .claspignore
**/**
!*.js
!*.html
!appsscript.json
```

(pattern แบบ allowlist — ระบุเฉพาะที่ต้องการ push)

---

## Rule #7: เปลี่ยน `webapp.access` / `executeAs` แล้วต้อง deploy version ใหม่เสมอ

**Why:** ค่าใน `appsscript.json` มีผลตอน deploy — แก้ไฟล์เฉย ๆ แล้ว push ไม่พอ และการเปลี่ยน `executeAs` อาจทำให้ Google ขอ re-authorize ใหม่ทั้ง scope — แจ้ง user ก่อน ไม่งั้นเจอหน้า permission ตกใจกันทั้งหน่วยงาน
