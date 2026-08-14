/**
 * Records.js — CRUD ผ่าน RPC พร้อม Result envelope + Lock
 * Patterns: rules/web-app-rpc.md, rules/lock-service.md, rules/error-handling.md
 */

function listRecords(token) {
  try {
    const caller = requireSession_(token);
    let rows = readSheet_(getSs_().getSheetByName('Records'));
    if (caller.Role !== 'admin') {
      rows = rows.filter(r => String(r.OwnerUserID) === String(caller.UserID));
    }
    return { ok: true, data: rows.map(sanitizeForClient_) }; // Date → ISO ก่อนออกจาก server
  } catch (err) {
    Logger.log('[listRecords] EXCEPTION: ' + (err.stack || err));
    return { ok: false, message: err.message };
  }
}

function saveRecord(token, payload) {
  const lock = LockService.getScriptLock(); // mutation ที่ user ชนกันได้ — rules/lock-service.md
  try {
    if (!lock.tryLock(10000)) return { ok: false, message: 'ระบบกำลังประมวลผล กรุณาลองใหม่' };
    const caller = requireSession_(token);

    // validate ที่ boundary — rules/security.md Rule #5
    if (!payload || typeof payload !== 'object') throw new Error('ข้อมูลไม่ถูกต้อง');
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('กรุณากรอกชื่อรายการ');
    if (title.length > 200) throw new Error('ชื่อรายการยาวเกิน 200 ตัวอักษร');
    const phone = String(payload.phone || '').trim();
    if (phone && !/^0\d{8,9}$/.test(phone)) throw new Error('เบอร์โทรไม่ถูกต้อง');

    const sh = getSs_().getSheetByName('Records');
    appendRowByHeaders_(sh, {
      RecordID: 'REC' + Date.now(),
      Title: title,
      Phone: phone ? "'" + phone : '', // apostrophe กัน leading zero หาย — spreadsheet-ops #6.6
      OwnerUserID: caller.UserID,
      CreatedAt: new Date().toISOString(), // ISO string ไม่ใช่ Date object — spreadsheet-ops #6.4
    });
    SpreadsheetApp.flush();
    Logger.log('[saveRecord] OK user=' + caller.UserID + ' title=' + title);
    return { ok: true, message: 'บันทึกเรียบร้อยแล้ว' };
  } catch (err) {
    Logger.log('[saveRecord] EXCEPTION: ' + (err.stack || err));
    return { ok: false, message: err.message };
  } finally {
    lock.releaseLock(); // finally เสมอ — rules/lock-service.md Rule #4
  }
}
