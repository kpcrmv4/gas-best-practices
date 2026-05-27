# onOpen Menu — Custom Menu ใน Sheets

## Rule #1: ใช้ `onOpen()` เป็น simple trigger — ไม่ต้องสร้าง installable trigger

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎓 Admin')
    .addItem('▶ Setup โปรเจ็ค', 'setupSandbox')
    .addItem('📝 ดู Config', 'showConfig')
    .addSeparator()
    .addItem('🧹 ล้าง Output sheet', 'clearOutput')
    .addItem('🧹 ล้าง Logs sheet', 'clearLogs')
    .addSeparator()
    .addItem('⚙ Re-setup (reset ทุก sheet)', 'setupSandbox')
    .addToUi();
}
```

**Limit ของ simple trigger:** ห้ามใช้ service ที่ต้อง authorization (UrlFetch, Drive ของ user อื่น, MailApp)
ถ้าต้องใช้ → ทำเป็น installable trigger ที่ user authorize ครั้งแรก

---

## Rule #2: เมนูควรมีหมวด (separator) — กลุ่มฟังก์ชันที่เกี่ยวข้อง

```javascript
ui.createMenu('🎓 Sandbox')
  .addItem('▶ Hello World', 'helloWorld')          // เริ่มต้น
  .addItem('📝 Show Config', 'showConfig')         // อ่านอย่างเดียว
  .addSeparator()
  .addItem('🧹 Clear Output', 'clearOutput')       // ลบ — มีผลข้างเคียง
  .addItem('🧹 Clear Logs', 'clearLogs')
  .addSeparator()
  .addItem('⚙ Re-setup', 'setupSandbox')           // destructive
  .addToUi();
```

ลำดับ: **ใช้บ่อย → ใช้น้อย → ลบ/รีเซ็ต**

---

## Rule #3: destructive action — confirm ก่อนรัน

```javascript
function setupSandbox() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    'Re-setup โปรเจ็ค',
    'ข้อมูลใน sheet Output และ Logs จะถูกลบทั้งหมด ยืนยันหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  // ... do setup ...
}
```

---

## Rule #4: alert ที่ user ต้องรู้เท่านั้น — ห้าม alert ทุกขั้นตอน

### ✗ Bad

```javascript
function doStuff() {
  ui.alert('เริ่มต้น...');     // ไม่จำเป็น
  step1();
  ui.alert('Step 1 เสร็จ');     // รบกวน
  step2();
  ui.alert('เสร็จแล้ว!');
}
```

### ✓ Good — alert เฉพาะตอนจบ + ใช้ toast สำหรับสถานะ

```javascript
function doStuff() {
  const ss = SpreadsheetApp.getActive();
  ss.toast('กำลังประมวลผล...', '⏳');
  step1();
  step2();
  ss.toast('เสร็จแล้ว', '✅', 3);
  // ใช้ alert เฉพาะถ้า user ต้องตัดสินใจอะไรต่อ
}
```

`ss.toast(message, title, seconds)` — มุมขวาล่าง ไม่ block UI

---

## Rule #5: ถ้า function ที่เรียกอาจไม่มี UI context — wrap alert ใน try/catch

```javascript
function setupSandbox() {
  // ... setup ...
  try {
    SpreadsheetApp.getUi().alert('✅ Setup สำเร็จ!');
  } catch (e) {
    // ถ้ารันผ่าน trigger / clasp run / ไม่มี UI → ข้าม alert
    Logger.log('Setup done (no UI).');
  }
}
```

---

## Rule #6: เมนูแยกตาม role — ใช้ user email ตรวจ

```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const email = Session.getActiveUser().getEmail();
  const isAdmin = ADMIN_EMAILS.includes(email);

  const menu = ui.createMenu('🎓 Sandbox');
  menu.addItem('▶ Hello World', 'helloWorld');

  if (isAdmin) {
    menu.addSeparator();
    menu.addItem('⚙ Re-setup', 'setupSandbox');
    menu.addItem('🗑 Delete all data', 'deleteAll');
  }

  menu.addToUi();
}
```

**Caveat:** simple trigger `onOpen` รันด้วยสิทธิ์ของ user ที่เปิด — `Session.getActiveUser().getEmail()` ได้ email user

---

## Rule #7: sub-menu สำหรับเมนูที่ลึก

```javascript
ui.createMenu('🎓 Admin')
  .addItem('🏠 Dashboard', 'showDashboard')
  .addSubMenu(
    ui.createMenu('📊 Reports')
      .addItem('Daily', 'reportDaily')
      .addItem('Weekly', 'reportWeekly')
      .addItem('Monthly', 'reportMonthly')
  )
  .addSubMenu(
    ui.createMenu('⚙ Settings')
      .addItem('Edit config', 'editConfig')
      .addItem('Manage users', 'manageUsers')
  )
  .addToUi();
```

---

## Rule #8: เมนูชื่อสั้น — emoji + คำเดียว

- ✅ `🎓 Sandbox`, `📊 Reports`, `⚙ Settings`
- ❌ `🎓 Sandbox Management Console`, `📊 View All Reports for This Project`

GAS menu bar แคบ — ชื่อยาวเปลือง space + อ่านยาก
