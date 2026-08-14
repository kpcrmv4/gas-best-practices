/**
 * Users.js — login + session + guards
 * Patterns: rules/security.md Rules #1-#3
 */

// ── Login: ออก session token — ไม่เชื่อ userId ที่ client ถือ (Rule #2)
function login(username, password) {
  try {
    Logger.log('[login] username=' + username);
    const user = readSheet_(getSs_().getSheetByName('Users'))
      .find(u => String(u.Username) === String(username));
    if (!user) return { ok: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    if (user.Active === false || user.Active === 'false') {
      return { ok: false, message: 'บัญชีถูกปิดใช้งาน' };
    }

    const expected = hashPassword_(password, String(user.PasswordSalt));
    if (expected !== String(user.PasswordHash)) {
      return { ok: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }

    const token = Utilities.getUuid();
    appendRowByHeaders_(getSs_().getSheetByName('Sessions'), {
      Token: token,
      UserID: user.UserID,
      ExpiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 ชั่วโมง
      CreatedAt: new Date().toISOString(),
    });
    Logger.log('[login] OK userId=' + user.UserID);
    return { ok: true, token: token, displayName: user.DisplayName, role: user.Role };
  } catch (err) {
    Logger.log('[login] EXCEPTION: ' + (err.stack || err));
    return { ok: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

// ── Guards — เรียกต้นทางทุก RPC (Rule #1)
function requireSession_(token) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
  const s = readSheet_(getSs_().getSheetByName('Sessions')).find(r => String(r.Token) === String(token));
  if (!s || Number(s.ExpiresAt) < Date.now()) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const user = readSheet_(getSs_().getSheetByName('Users')).find(u => String(u.UserID) === String(s.UserID));
  if (!user) throw new Error('ไม่พบผู้ใช้');
  return user;
}

function requireRole_(user, allowedRoles) {
  if (!Array.isArray(allowedRoles)) allowedRoles = [allowedRoles];
  if (!allowedRoles.includes(user.Role)) throw new Error('ไม่มีสิทธิ์ดำเนินการ');
}

// ── Password hashing — PBKDF2 แบบ GAS (Rule #3)
function hashPassword_(password, salt) {
  let bytes = Utilities.newBlob(password).getBytes();
  const saltBytes = Utilities.newBlob(salt).getBytes();
  for (let i = 0; i < 10000; i++) {
    bytes = Utilities.computeHmacSha256Signature(bytes, saltBytes);
  }
  return Utilities.base64Encode(bytes);
}

// รันครั้งเดียวจาก editor เพื่อสร้าง admin คนแรก แล้วเปลี่ยนรหัสทันที
function _setup_createAdmin() {
  ensureSchema();
  const salt = Utilities.getUuid();
  appendRowByHeaders_(getSs_().getSheetByName('Users'), {
    UserID: 'U001',
    Username: 'admin',
    DisplayName: 'ผู้ดูแลระบบ',
    Role: 'admin',
    PasswordHash: hashPassword_('changeme', salt),
    PasswordSalt: salt,
    Active: 'true',
  });
}
