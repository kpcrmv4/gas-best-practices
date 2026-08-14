# Long-running Jobs (ทะลุ 6-minute limit)

## Rule #1: งานเกิน ~5 นาที ต้องออกแบบเป็น batch + resume — ไม่ใช่หวังว่าจะรันทัน

**Why:** GAS ตัด execution ที่ 6 นาที (30 วินาทีสำหรับ custom function) แบบไม่มี warning — งาน process 10,000 แถวที่ "เคยรันทัน" จะพังทันทีที่ข้อมูลโตขึ้น และพังกลางคัน = ข้อมูลค้างครึ่ง ๆ กลาง ๆ

**หลักออกแบบ:** ทุก iteration ต้อง idempotent (รันซ้ำแถวเดิมแล้วไม่เสียหาย) + เก็บ checkpoint ว่าทำถึงไหน

---

## Rule #2: checkpoint pattern — เก็บตำแหน่งใน Script Properties + ตั้ง continuation trigger

### ✓ Good — โครงหลักที่ใช้ได้กับทุกงาน batch

```javascript
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // เผื่อ margin จาก limit 6 นาที

function processAllRecords() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();
  let cursor = parseInt(props.getProperty('JOB_CURSOR') || '2'); // แถวแรกของ data

  const sh = SpreadsheetApp.openById(getConfig_('SPREADSHEET_ID')).getSheetByName('Records');
  const lastRow = sh.getLastRow();
  Logger.log('[job] resume at row ' + cursor + ' / ' + lastRow);

  while (cursor <= lastRow) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      props.setProperty('JOB_CURSOR', String(cursor));
      scheduleContinuation_('processAllRecords');
      Logger.log('[job] checkpoint at row ' + cursor + ' — continuing in next run');
      return;
    }
    processOneRow_(sh, cursor); // ต้อง idempotent
    cursor++;
  }

  // จบงาน — ล้าง state + trigger
  props.deleteProperty('JOB_CURSOR');
  clearContinuation_('processAllRecords');
  Logger.log('[job] done ' + (lastRow - 1) + ' rows');
}

function scheduleContinuation_(handlerName) {
  clearContinuation_(handlerName); // กัน trigger ซ้อน (ดู rules/triggers.md Rule #1)
  ScriptApp.newTrigger(handlerName).timeBased().after(60 * 1000).create();
}

function clearContinuation_(handlerName) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerName)
    .forEach(t => ScriptApp.deleteTrigger(t));
}
```

**จุดตาย 3 จุดที่ห้ามพลาด:**
1. **เผื่อ margin** — ตัดที่ 4.5 นาที ไม่ใช่ 5.9 (การเขียน checkpoint + สร้าง trigger ก็กินเวลา)
2. **ลบ trigger เมื่อจบ** — ไม่งั้น trigger ค้างรันเปล่า ๆ ทุกนาทีจนเต็ม quota
3. **iteration ต้อง idempotent** — script อาจตายหลัง process แถวแล้วแต่ก่อนเขียน checkpoint → แถวนั้นจะถูกรันซ้ำ

---

## Rule #3: อย่า process ใน RPC ที่ user รอ — คืน "รับงานแล้ว" แล้วทำใน background

**Why:** `google.script.run` ก็โดน limit 6 นาทีเหมือนกัน และ user ไม่ควรจ้องหน้าจอหมุน 5 นาที

### ✓ Good — submit + poll status

```javascript
// RPC: รับคำสั่ง ตอบทันที
function startExportJob(callerUserId) {
  const caller = requireUser_(callerUserId);
  PropertiesService.getScriptProperties().setProperties({
    'EXPORT_STATUS': 'running',
    'EXPORT_PROGRESS': '0',
  });
  scheduleContinuation_('runExportJob'); // เริ่มภายใน ~1 นาที
  return { ok: true, message: 'เริ่มประมวลผลแล้ว ระบบจะแจ้งเมื่อเสร็จ' };
}

// RPC: client poll ทุก 5 วิ
function getExportStatus(callerUserId) {
  const p = PropertiesService.getScriptProperties();
  return {
    ok: true,
    status: p.getProperty('EXPORT_STATUS') || 'idle',
    progress: parseInt(p.getProperty('EXPORT_PROGRESS') || '0'),
    fileUrl: p.getProperty('EXPORT_FILE_URL') || null,
  };
}
```

งานที่จบแล้วควรแจ้งช่องทางอื่นด้วย (อีเมล/LINE — ดู `rules/email-notifications.md`) เผื่อ user ปิดหน้าเว็บไปแล้ว

---

## Rule #4: ลด work ต่อ iteration ก่อนคิดเรื่อง batch

**Why:** งานส่วนใหญ่ที่ "เกิน 6 นาที" จริง ๆ คือ N+1 round-trip — แก้ตาม `rules/spreadsheet-ops.md` Rule #1 (bulk read) + เขียนแบบ batch แล้วมักเหลือไม่ถึงนาที

Checklist ก่อนทำ continuation pattern:
- [ ] อ่าน sheet ครั้งเดียวด้วย `getDataRange().getValues()` แล้วหรือยัง
- [ ] เขียนกลับเป็น batch (`setValues` ช่วงที่ไม่มี merge) แทน per-cell ได้ไหม
- [ ] fetch ภายนอกใช้ `fetchAll` แล้วหรือยัง (`rules/urlfetch-external-api.md` Rule #3)
- [ ] มี timing log บอกว่า step ไหนกินเวลา (`rules/testing-debugging.md` Rule #9)
