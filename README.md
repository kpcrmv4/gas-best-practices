# gas-best-practices

> Claude Code skill รวมแนวปฏิบัติที่ดีสำหรับ Google Apps Script — distilled จาก production bug จริง

ใช้กับ Claude Code เพื่อให้ Claude แนะนำ/แก้ไขโค้ด GAS ตาม pattern ที่ผ่านการทดสอบในระบบจริง

## Quick install

### Mac / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/<YOUR_USER>/gas-best-practices/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/<YOUR_USER>/gas-best-practices/main/install.ps1 | iex
```

### Manual

```bash
git clone https://github.com/<YOUR_USER>/gas-best-practices ~/.claude/skills/gas-best-practices
```

restart Claude Code → skill จะ trigger อัตโนมัติเมื่อเปิดโปรเจ็ค GAS

## เนื้อหา

| Rule file | สิ่งที่ครอบคลุม |
|---|---|
| [project-structure.md](rules/project-structure.md) | clasp, appsscript.json, file split, naming |
| [spreadsheet-ops.md](rules/spreadsheet-ops.md) | bulk read/write, merged cells gotcha, column index, % handling |
| [web-app-rpc.md](rules/web-app-rpc.md) | `google.script.run`, Result envelope, bundling, optimistic updates |
| [htmlservice-frontend.md](rules/htmlservice-frontend.md) | viewport meta, `createHtmlOutputFromFile`, partial include, template syntax, mobile debug |
| [pdf-generation.md](rules/pdf-generation.md) | template placeholders, signature anchor, image trim, business guard |
| [drive-ops.md](rules/drive-ops.md) | Config sheet, lazy folder creation, **signature preview via base64**, sharing |
| [lock-service.md](rules/lock-service.md) | concurrency control, timeout choice, finally release |
| [cache-service.md](rules/cache-service.md) | TTL strategy, invalidation, size limits |
| [dynamic-dropdowns.md](rules/dynamic-dropdowns.md) | ปี/เดือน/ค่า enum ที่ไม่ฟิกตายตัว, datalist pattern |
| [security.md](rules/security.md) | requireUser/Role, session tokens, password hashing, OAuth scope |
| [schema-migrations.md](rules/schema-migrations.md) | idempotent ensureSchema, column add, version tracking |
| [error-handling.md](rules/error-handling.md) | Result envelope, Thai user msg, translate GAS errors, retry |
| [onopen-menu.md](rules/onopen-menu.md) | custom menu, separators, toast vs alert, sub-menu |
| [testing-debugging.md](rules/testing-debugging.md) | Logger.log pattern, e2e via doPost, timing, quota |

## Bugs จริงที่กฎเหล่านี้ป้องกัน

- 🐛 **"ข้อผิดพลาดของบริการ: สเปรดชีต"** ตอน `range.setValues()` บน template ที่มี merged cells → [spreadsheet-ops.md](rules/spreadsheet-ops.md)
- 🐛 **PassPercent = 500%** เพราะ client คำนวณผิด server เชื่อตรง ๆ → [spreadsheet-ops.md](rules/spreadsheet-ops.md) Rule #8
- 🐛 **Signature preview broken image** เพราะใช้ Drive URL ตรง ไม่ได้แปลงเป็น base64 → [drive-ops.md](rules/drive-ops.md) Rule #3
- 🐛 **Signature ทับแถวอื่นใน PDF** เพราะรูปยังมี whitespace + ไม่ตั้ง anchor offset → [pdf-generation.md](rules/pdf-generation.md) Rule #4, #6
- 🐛 **ปี dropdown หมดอายุปี 2026** เพราะ hardcode 2024-2026 → [dynamic-dropdowns.md](rules/dynamic-dropdowns.md)
- 🐛 **Lock ค้าง 6 นาที** เพราะลืม `finally { releaseLock() }` → [lock-service.md](rules/lock-service.md) Rule #4
- 🐛 **PDF gen ของ 2 คนพร้อมกัน → temp sheet ชื่อชน** → [lock-service.md](rules/lock-service.md)
- 🐛 **"ไม่ได้รับอนุญาต (Permission denied): DriveApp"** บน Google Workspace ของโรงเรียน/หน่วยงาน เพราะ `setSharing(ANYONE_WITH_LINK)` ถูก domain policy block → [drive-ops.md](rules/drive-ops.md) Rule #4.1
- 🐛 **เว็บแอปบนมือถือไม่ responsive** เพราะ AI ใส่ viewport meta tag ใน `.gs` แทน `.html` → [htmlservice-frontend.md](rules/htmlservice-frontend.md) Rule #1

## โครงสร้าง repo

```
gas-best-practices/
├── SKILL.md             # entry point ที่ Claude อ่าน (มี frontmatter)
├── README.md            # หน้าแรก GitHub
├── LICENSE              # MIT
├── install.sh           # one-liner setup
├── install.ps1
├── rules/               # กฎแยกตามหัวข้อ — แต่ละไฟล์ standalone
│   ├── project-structure.md
│   ├── spreadsheet-ops.md
│   └── ...
└── examples/            # โค้ดตัวอย่างที่ใช้ rule จริง
    └── README.md
```

## Contributing

PR ยินดีรับ! แต่ละ rule ทำตามแม่แบบ:

```markdown
# <หมวด>

## Rule #N: <กฎสั้น ๆ ประโยคเดียว>

**Why:** <เหตุผล — bug จริงที่เคยเจอยิ่งดี>

### ✗ Bad
\`\`\`javascript
// โค้ดที่ทำให้พัง
\`\`\`

### ✓ Good
\`\`\`javascript
// แม่แบบที่ถูก
\`\`\`

**Edge case:** <ข้อยกเว้น ถ้ามี>
```

## License

MIT
