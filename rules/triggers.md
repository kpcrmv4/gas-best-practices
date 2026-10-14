# Triggers (Time-driven / Installable)

## Rule #1: install trigger ต้องลบตัวเก่าก่อน — กัน trigger ซ้ำ

**Why:** เรียก `ScriptApp.newTrigger(...).create()` ซ้ำ (เช่น รัน setup สองรอบ) จะได้ trigger **ซ้อนกันหลายตัว** — งานเดียวรัน 2-3 รอบพร้อมกัน ข้อมูลซ้ำ / อีเมลส่งซ้ำ และ debug ยากมากเพราะมองไม่เห็นจาก log ว่ามาจาก trigger คนละตัว

### ✗ Bad

```javascript
function setup() {
  ScriptApp.newTrigger('dailyReport').timeBased().everyDays(1).atHour(6).create();
  // รัน setup 3 ครั้ง = ได้ 3 triggers = ส่ง report 3 ฉบับ
}
```

### ✓ Good — idempotent: ลบของเก่าที่ชี้ function เดียวกันก่อน

```javascript
function ensureTrigger_(handlerName, builderFn) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerName)
    .forEach(t => ScriptApp.deleteTrigger(t));
  builderFn();
}

function setup() {
  ensureTrigger_('dailyReport', () =>
    ScriptApp.newTrigger('dailyReport').timeBased().everyDays(1).atHour(6).create()
  );
}
```

**Limit:** สูงสุด 20 installable triggers ต่อ script ต่อ user — ถ้าเกินจะ throw ตอน `create()`

---

## Rule #2: trigger รันด้วยสิทธิ์ของ "คนติดตั้ง trigger" — ไม่ใช่คนแก้ sheet

**Why:** `onEdit` (installable) หรือ time-driven trigger รันเป็น account ของคน install → `Session.getActiveUser()` อาจไม่ใช่คนที่กดแก้ cell และ quota (เช่น email/day) หักจาก account คนติดตั้ง

- ต้องการรู้ว่าใครแก้ → ใช้ `e.user` (ได้เฉพาะ domain เดียวกันใน Workspace) หรือเก็บ audit column แยก
- อย่าให้หลายคน install trigger เดียวกัน — เลือก account กลาง (service account style) หนึ่งตัวเป็นคนติดตั้ง

---

## Rule #3: simple trigger (`onEdit`, `onOpen`) ทำงานจำกัด — ห้ามคาดหวัง service ที่ต้อง auth

**Why:** simple trigger รันแบบ unauthorized — เรียก `UrlFetchApp`, `MailApp`, `DriveApp` ไม่ได้ (throw permission error เงียบ ๆ ใน log)

| ต้องการ | ใช้ |
|---|---|
| จัด format / validate cell ทันทีที่แก้ | simple `onEdit(e)` |
| ส่งอีเมล / เรียก API / เขียนไฟล์ Drive เมื่อมีการแก้ | **installable** onEdit trigger |
| งานตามเวลา (รายวัน/รายชั่วโมง) | time-driven trigger |

```javascript
// ✓ ติดตั้ง installable onEdit
ScriptApp.newTrigger('onEditInstalled')
  .forSpreadsheet(SpreadsheetApp.getActive())
  .onEdit()
  .create();
```

---

## Rule #4: `onFormSubmit` — ใช้ `e.namedValues` ไม่ใช่ `e.values`

**Why:** `e.values` เป็น array เรียงตาม **ตำแหน่งคอลัมน์** — เมื่อไหร่ที่แก้ฟอร์ม (เพิ่ม/ลบ/ย้ายคำถาม) index จะเลื่อน → อ่านค่าผิดช่องแบบเงียบ ๆ (bug ตระกูลเดียวกับ hardcode column index ใน `rules/spreadsheet-ops.md` Rule #3)

### ✗ Bad

```javascript
function onFormSubmit(e) {
  const name = e.values[1];   // พังทันทีที่มีคนสลับลำดับคำถามในฟอร์ม
  const phone = e.values[2];
}
```

### ✓ Good

```javascript
function onFormSubmit(e) {
  const name = (e.namedValues['ชื่อ-นามสกุล'] || [''])[0];
  const phone = (e.namedValues['เบอร์โทร'] || [''])[0];
  if (!name) { Logger.log('[onFormSubmit] missing name — form changed?'); return; }
  // ...
}
```

**Gotcha:** `e.namedValues` แต่ละ key เป็น **array** (คำถาม checkbox ตอบได้หลายค่า) — ต้อง `[0]` หรือ `join(', ')` เอง

---

## Rule #5: trigger handler ต้อง try/catch ทั้งก้อน + แจ้งเตือนเมื่อพัง

**Why:** trigger รันตอนไม่มีใครดูหน้าจอ — exception จะเงียบหายไปใน Executions log จนกว่าจะมีคนสงสัยว่า "ทำไม report ไม่มา 2 อาทิตย์แล้ว"

### ✓ Good

```javascript
function dailyReport() {
  try {
    Logger.log('[dailyReport] start');
    // ...งานจริง...
    Logger.log('[dailyReport] done');
  } catch (err) {
    Logger.log('[dailyReport] EXCEPTION: ' + (err.stack || err));
    notifyAdminOnce_('dailyReport', err); // ดู rules/email-notifications.md Rule #4
  }
}
```

---

## Rule #6: งานใน trigger ที่แตะ data ร่วมกับ user — ต้องอยู่ใน LockService เหมือนกัน

**Why:** time-driven trigger กับ user ที่กดปุ่มในเว็บแอปอาจ mutate sheet เดียวกันพร้อมกัน — trigger ไม่ได้รับข้อยกเว้นเรื่อง race condition ใช้ pattern เดียวกับ `rules/lock-service.md`

---

## Rule #7: เวลาใน time-driven trigger เป็นช่วง ไม่ใช่เวลาเป๊ะ

**Why:** `atHour(6)` = รันช่วง 06:00–07:00 (Google กระจาย load) — อย่าออกแบบงานที่ต้องรัน 06:00 ตรง

- ต้องแม่นระดับนาที → สร้าง trigger `everyMinutes(5)` แล้วเช็คเวลาเองในโค้ด หรือใช้ external cron เรียก `doGet`
- timezone ของ `atHour` = timezone ใน `appsscript.json` — ตั้ง `"timeZone": "Asia/Bangkok"` ก่อน ไม่งั้นได้เวลา UTC

---

## Rule #8: แอปติดตั้ง trigger ให้ตัวเองตอนตั้งค่าครั้งแรก — ห้ามให้ผู้ใช้เปิด editor ไปรันฟังก์ชัน

**Why:** คำแนะนำแบบ "เปิด Apps Script editor แล้วรัน `installTriggers()` หนึ่งครั้ง" ใช้ไม่ได้กับคนที่ไม่ใช่โปรแกรมเมอร์ (ไม่รู้ว่า editor อยู่ไหน เลือกฟังก์ชันตรงไหน) — ระบบจึง "ไม่เคยเตือน" ทั้งที่โค้ดถูก ให้แอปติดตั้ง trigger ให้ตัวเองในจังหวะที่เจ้าของใช้แอปอยู่แล้ว

### ✓ Good — idempotent + flag + try/catch แยก เรียกจากเส้นทางตั้งค่าของแอป

```javascript
// เรียกได้หลายครั้งโดยไม่มี trigger ซ้ำ (Rule #1) และจำไว้ว่าทำแล้ว
function ensureTriggers_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TRIGGERS_V') === '1') return { ok: true, already: true };
  ensureTrigger_('dailyReminder', () =>
    ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(7).create()
  );
  props.setProperty('TRIGGERS_V', '1');            // เปลี่ยนเป็น '2' เมื่อชุด trigger เปลี่ยน
  return { ok: true, already: false };
}

// 1) ตอนตั้งค่าครั้งแรก: หลังสร้างชีต/ข้อมูลเสร็จ (เส้นทาง setup ที่เจ้าของกดเอง หรือ lazily ครั้งแรกที่เจ้าของเปิดแอป)
function setupFirstRun() {
  const ss = getDataSpreadsheet_();
  // ...สร้างแท็บ/หัวตาราง...
  try {                                            // try/catch ของตัวเอง — ล้มแล้วหน้าแอปยังต้องเปิดได้
    ensureTriggers_();
  } catch (err) {
    Logger.log('[setup] triggers: ' + err);        // เช่นเจ้าของยังไม่ได้อนุญาต scope script.scriptapp
  }
}

// 2) ปุ่ม/สถานะในหน้าตั้งค่าของแอป — ให้ผู้ใช้เห็นว่าเปิดอยู่ และกดซ่อมได้เองเมื่อข้อ 1 ล้ม
function getTriggerStatus() {
  const on = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyReminder');
  return { on, text: on ? 'เปิดอยู่ — ตรวจทุกเช้าราว 07:00' : 'ปิดอยู่' };
}
function enableTriggers() {                        // ปุ่ม "เปิดการแจ้งเตือนอัตโนมัติ" ใน UI
  try {
    ensureTriggers_();
    return getTriggerStatus();
  } catch (err) {
    throw new Error('เปิดไม่สำเร็จ: ' + err.message);   // UI แสดงข้อความนี้ ไม่ใช่เงียบ
  }
}
```

- ประกาศ `https://www.googleapis.com/auth/script.scriptapp` ใน `appsscript.json` ตั้งแต่แรก — จะได้ขอสิทธิ์พร้อมกันตอนเจ้าของเปิดครั้งแรก ไม่ใช่พังทีหลัง (ดู `rules/security.md` Rule #4)
- trigger รันเป็น account ของคนที่ติดตั้ง (Rule #2) — ใน web app ที่รันเป็นเจ้าของ (`executeAs: USER_DEPLOYING`) คนที่กดปุ่มคือใครก็ได้ แต่ trigger จะเป็นของเจ้าของเสมอ ถูกต้องแล้ว
- ห้ามเรียก `ensureTriggers_()` บนเส้นทางหลักของ `doGet` โดยไม่มี try/catch — scope ที่ยังไม่ได้อนุญาตจะทำให้ทั้งหน้าพัง
