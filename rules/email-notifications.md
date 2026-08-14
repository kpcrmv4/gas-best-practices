# Email & Notifications

## Rule #1: ใช้ `MailApp` สำหรับส่งอย่างเดียว — `GmailApp` เฉพาะเมื่อต้องอ่าน/จัดการ inbox

**Why:** `GmailApp` ขอ scope `.../auth/gmail` (อ่าน-เขียน-ลบเมลทั้งกล่อง) — หน้า authorize น่ากลัวและ audit ยาก ส่วน `MailApp` ขอแค่ `.../auth/script.send_mail` (ส่งอย่างเดียว)

```javascript
// ✓ ส่งแจ้งเตือน — MailApp พอ
MailApp.sendEmail({
  to: 'admin@school.ac.th',
  subject: '[ระบบบันทึกผล] มีคำขอรออนุมัติ 3 รายการ',
  htmlBody: '<p>เข้าไปตรวจสอบได้ที่ <a href="' + APP_URL + '">ระบบบันทึกผล</a></p>',
});
```

---

## Rule #2: เช็ค quota ก่อนส่ง batch — consumer ได้แค่ 100 ฉบับ/วัน

| Account | Email/day |
|---|---|
| gmail.com | 100 |
| Google Workspace | 1,500 |

**Why:** ระบบที่ส่งเมลต่อ 1 record จะชน quota ตั้งแต่ user ยังไม่ถึงร้อยคน — เกิน quota แล้ว `sendEmail` throw และงานที่เหลือตายทั้งชุด

```javascript
function sendBatchNotify_(recipients, subject, htmlBody) {
  const remaining = MailApp.getRemainingDailyQuota();
  if (recipients.length > remaining) {
    Logger.log('[mail] quota not enough: need ' + recipients.length + ' have ' + remaining);
    return { ok: false, message: 'โควต้าอีเมลวันนี้ไม่พอ (เหลือ ' + remaining + ' ฉบับ)' };
  }
  // รวมผู้รับใน bcc ฉบับเดียว = นับ quota ครั้งเดียว
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), bcc: recipients.join(','), subject: subject, htmlBody: htmlBody });
  return { ok: true };
}
```

**Trick ประหยัด quota:** ผู้รับหลายคนเนื้อหาเดียวกัน → ใส่ `bcc` รวมฉบับเดียว / เนื้อหาต่างกันจริง ๆ ค่อยส่งแยก

---

## Rule #3: เนื้อหาเมลภาษาไทย — ตั้ง subject สั้น มี prefix ระบบ + htmlBody อ่านบนมือถือได้

**Why:** ผู้รับส่วนใหญ่เปิดบนมือถือ และเมลจากระบบอัตโนมัติโดนมองข้ามง่าย — prefix `[ชื่อระบบ]` ทำให้ filter/ค้นหาได้

```javascript
function notifyRecordApproved_(user, record) {
  MailApp.sendEmail({
    to: user.Email,
    subject: '[ระบบบันทึกผล] อนุมัติแล้ว — ' + record.RecordID,
    htmlBody:
      '<div style="font-family:sans-serif;max-width:480px">' +
      '<p>เรียน ' + escapeHtml_(user.DisplayName) + '</p>' +
      '<p>รายการ <b>' + escapeHtml_(record.RecordID) + '</b> ได้รับการอนุมัติแล้ว</p>' +
      '<p><a href="' + APP_URL + '?record=' + encodeURIComponent(record.RecordID) + '">เปิดดูรายการ</a></p>' +
      '<hr><p style="color:#888;font-size:12px">อีเมลอัตโนมัติ — ไม่ต้องตอบกลับ</p>' +
      '</div>',
  });
}
```

ค่าจาก user/sheet ที่แทรกใน htmlBody ต้อง escape (กัน HTML injection — หลักเดียวกับ `rules/security.md` Rule #6)

---

## Rule #4: error notification ต้อง throttle — กันเมลถล่ม admin

**Why:** trigger ที่รันทุก 5 นาทีแล้วพังตลอด = เมลแจ้ง error 288 ฉบับ/วัน — quota หมดและ admin เลิกอ่าน (แจ้งเตือนที่ถูกเมิน = ไม่มีแจ้งเตือน)

### ✓ Good — แจ้งซ้ำเรื่องเดิมไม่เกิน 1 ครั้ง/ชั่วโมง ผ่าน cache

```javascript
function notifyAdminOnce_(jobName, err) {
  const cache = CacheService.getScriptCache();
  const key = 'errnotify_' + jobName;
  if (cache.get(key)) return; // แจ้งไปแล้วในชั่วโมงนี้
  cache.put(key, '1', 3600);
  try {
    MailApp.sendEmail({
      to: getConfig_('ADMIN_EMAIL'),
      subject: '[ระบบบันทึกผล] ⚠️ ' + jobName + ' ล้มเหลว',
      body: 'Error: ' + (err && err.message) + '\n\nStack:\n' + (err && err.stack) +
            '\n\nดู log: Apps Script editor → Executions',
    });
  } catch (mailErr) {
    Logger.log('[notifyAdminOnce] cannot send mail: ' + mailErr.message);
  }
}
```

- admin email เก็บใน Config sheet (`ADMIN_EMAIL`) — เปลี่ยนคนดูแลไม่ต้องแก้โค้ด
- การส่งเมลแจ้ง error ต้อง try/catch ของตัวเอง — อย่าให้การแจ้งเตือนพังทับงานหลัก

---

## Rule #5: อยากส่งจากชื่อระบบ ไม่ใช่ชื่อคน — ใช้ `name` option (alias ต้องตั้งใน Gmail ก่อน)

```javascript
MailApp.sendEmail({
  to: user.Email,
  subject: '...',
  htmlBody: '...',
  name: 'ระบบบันทึกผลการเรียน',   // แสดงชื่อผู้ส่งเป็นชื่อระบบ (address ยังเป็นของคน deploy)
  noReply: true,                    // Workspace เท่านั้น — ส่งจาก no-reply@domain
});
```

**ข้อจำกัด:** email จะออกจาก account ของคนที่ install trigger / deploy เสมอ (ดู `rules/triggers.md` Rule #2) — ระบบขององค์กรควร deploy ด้วย account กลาง ไม่ใช่ account ส่วนตัวของ developer
