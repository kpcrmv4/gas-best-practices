# web-app-skeleton

Single-page web app ขนาดเล็กที่ใช้ pattern หลักของ skill ครบ: login (hash + session token), RPC ผ่าน `google.script.run` แบบ Result envelope, LockService, leading-zero protection, Date serialization

## ไฟล์

| ไฟล์ | ใช้ pattern จาก |
|---|---|
| `appsscript.json` | `rules/project-structure.md` — V8, timezone, scope แคบ (`drive.file`) |
| `Main.js` | schema idempotent, `readSheet_`, `appendRowByHeaders_`, `sanitizeForClient_` |
| `Users.js` | `rules/security.md` — hash+salt, session token, `requireSession_`/`requireRole_` |
| `Records.js` | `rules/web-app-rpc.md`, `rules/lock-service.md` — Result envelope, validate boundary, Lock+finally |
| `Index.html` | `rules/htmlservice-frontend.md`, `rules/logging-boundaries.md` — viewport, rpc wrapper, log boundary |

## วิธีใช้

```bash
mkdir my-app && cd my-app
clasp create --type webapp --title "my-app"
cp <skill-path>/examples/web-app-skeleton/* .
clasp push
```

1. เปิด Apps Script editor → รัน `_setup_createAdmin` หนึ่งครั้ง (สร้าง user `admin` / `changeme`)
2. Deploy → New deployment → Web app
3. เปิด URL → login → บันทึกรายการ
4. **เปลี่ยนรหัส admin ทันที** และลบ `_setup_createAdmin` ออกก่อนใช้จริง

## หมายเหตุ

- ตัวอย่างย่อเพื่อให้อ่านจบใน 5 นาที — ระบบจริงควรเพิ่ม: ล้าง session หมดอายุด้วย trigger, cache user lookup (`rules/cache-service.md`), audit log (`rules/security.md` Rule #8)
