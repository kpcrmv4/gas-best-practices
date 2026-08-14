# PropertiesService (Script / User / Document properties)

## Rule #1: เลือก store ให้ถูกชั้น — Script vs User vs Document

| Store | Scope | ใช้กับ |
|---|---|---|
| `getScriptProperties()` | ทุกคนที่ใช้ script เห็นค่าเดียวกัน | API key, config ระดับระบบ, job checkpoint |
| `getUserProperties()` | แยกค่าต่อ Google account | preference ส่วนตัว (ภาษา, มุมมอง default) |
| `getDocumentProperties()` | ผูกกับไฟล์ (สำหรับ add-on) | state ต่อ spreadsheet ใน add-on |

**Gotcha:** web app ที่ deploy `executeAs: USER_DEPLOYING` + user ไม่ login Google — `getUserProperties()` เป็นของ **owner** ไม่ใช่ user จริง → ระบบที่มี login ของตัวเอง (session token) ต้องเก็บ preference ใน Users sheet แทน

---

## Rule #2: เกณฑ์เลือกระหว่าง Properties กับ Config sheet

ทั้งคู่คือ key-value store — เลือกตามว่า**ใครต้องแก้ค่า**:

| เก็บใน | เมื่อ | ตัวอย่าง |
|---|---|---|
| **Script Properties** | ค่าลับ / ค่าที่ developer เท่านั้นแก้ | API token (LINE, OpenAI), salt, job cursor |
| **Config sheet** | ค่าที่ admin ฝั่ง user ต้องแก้ได้เองโดยไม่ต้องเข้า script editor | folder ID, admin email, ปีการศึกษาปัจจุบัน, ข้อความประกาศ |

**Why:** Config sheet แก้ได้จากหน้า Sheet ที่ admin คุ้นเคย (หลักการเดิมใน `rules/drive-ops.md` Rule #1) แต่**ห้ามเอา secret ไปใส่ Config sheet** — sheet ถูก share ให้คนอื่นเห็นได้ ส่วน Script Properties อ่านได้เฉพาะคนมีสิทธิ์แก้ script

```javascript
// secret → Script Properties
const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');

// admin-editable → Config sheet
const folderId = getConfig_('PDF_FOLDER_ID');
```

---

## Rule #3: รู้ limit — 9KB/ค่า, 500KB/store — อย่าเอาไว้เก็บ data

**Why:** Properties เป็น config store ไม่ใช่ database — เก็บ JSON ก้อนใหญ่ (รายการ record, cache ผล query) จะชน `Argument too large` แบบสุ่มเมื่อข้อมูลโต

- ข้อมูลจริง → Sheet
- cache ชั่วคราว → `CacheService` (100KB/key, มี TTL — ดู `rules/cache-service.md`)
- Properties → ค่า config สั้น ๆ + checkpoint

---

## Rule #4: อ่านหลายค่าใช้ `getProperties()` ครั้งเดียว — และ cache ไว้

**Why:** ทุก `getProperty()` คือ round-trip (ช้ากว่าตัวแปร ~หลักสิบ ms) — function ที่อ่าน 5 properties ทุกครั้งที่ถูกเรียกจะช้าโดยไม่จำเป็น

```javascript
let _propsCache = null;
function getProps_() {
  if (!_propsCache) _propsCache = PropertiesService.getScriptProperties().getProperties();
  return _propsCache; // cache ต่อ execution — execution ใหม่อ่านใหม่เสมอ
}
```

---

## Rule #5: ตั้งค่า secret ผ่าน UI หรือ setup function ที่ลบทิ้งหลังใช้ — ห้ามทิ้งค่าไว้ใน source

```javascript
// ✗ Bad — token ค้างอยู่ใน git history ตลอดกาล
function setup() {
  PropertiesService.getScriptProperties().setProperty('LINE_CHANNEL_TOKEN', 'AbCdEf123...');
}
```

**✓ Good — 2 ทาง:**
1. **UI:** Apps Script editor → Project Settings ⚙️ → Script properties → Add property (ไม่ผ่านโค้ดเลย)
2. **ชั่วคราว:** เขียน setup function → รัน 1 ครั้ง → **ลบโค้ดทิ้งก่อน commit** (เสี่ยงลืม — ทาง UI ปลอดภัยกว่า)

ถ้า token เคยหลุดเข้า git แล้ว — revoke แล้วออกใหม่เท่านั้น การลบ commit ไม่พอ
