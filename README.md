# gas-best-practices

> Claude Code skill — Google Apps Script best practices distilled from real production bugs.
>
> Claude Code skill รวมแนวปฏิบัติที่ดีสำหรับ Google Apps Script — สังเคราะห์จาก bug จริงใน production

Use with [Claude Code](https://claude.com/claude-code) so that Claude follows production-tested patterns when writing or reviewing GAS code.

ใช้กับ [Claude Code](https://claude.com/claude-code) เพื่อให้ Claude แนะนำ/แก้ไขโค้ด GAS ตาม pattern ที่ผ่านการใช้งานจริงในระบบ production

---

## 📦 Installation / วิธีติดตั้ง

### English

#### Option 1 — Mac / Linux (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.sh | bash
```

#### Option 2 — Windows PowerShell (one-liner)

```powershell
iwr -useb https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.ps1 | iex
```

#### Option 3 — Manual git clone (any OS)

```bash
git clone https://github.com/kpcrmv4/gas-best-practices ~/.claude/skills/gas-best-practices
```

For Windows without `~`:

```powershell
git clone https://github.com/kpcrmv4/gas-best-practices "$HOME\.claude\skills\gas-best-practices"
```

#### Verify installation

```bash
ls ~/.claude/skills/gas-best-practices
# should show: SKILL.md, rules/, README.md, ...
```

Then **restart Claude Code**. The skill will auto-trigger when:
- Your project contains `.clasp.json` or `appsscript.json`
- You edit `.gs` or `.js` files in a clasp project
- You mention "Google Apps Script", "GAS", or "clasp" in a prompt

#### Check status

```bash
bash ~/.claude/skills/gas-best-practices/check.sh
```

Shows current version, rules count, and whether updates are available.

#### Update to latest

```bash
bash ~/.claude/skills/gas-best-practices/update.sh
```

Or manually:

```bash
cd ~/.claude/skills/gas-best-practices && git pull
```

#### Uninstall

```bash
rm -rf ~/.claude/skills/gas-best-practices
```

---

### ภาษาไทย

#### วิธีที่ 1 — Mac / Linux (คำสั่งเดียวจบ)

เปิด Terminal แล้ววาง:

```bash
curl -fsSL https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.sh | bash
```

#### วิธีที่ 2 — Windows PowerShell (คำสั่งเดียวจบ)

เปิด PowerShell (กด `Win + X` → Terminal/PowerShell) แล้ววาง:

```powershell
iwr -useb https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.ps1 | iex
```

#### วิธีที่ 3 — Manual ด้วย git clone (ทุก OS)

```bash
git clone https://github.com/kpcrmv4/gas-best-practices ~/.claude/skills/gas-best-practices
```

Windows ถ้าใช้ `~` ไม่ได้:

```powershell
git clone https://github.com/kpcrmv4/gas-best-practices "$HOME\.claude\skills\gas-best-practices"
```

#### ตรวจสอบว่าติดตั้งสำเร็จ

```bash
ls ~/.claude/skills/gas-best-practices
# ต้องเห็น: SKILL.md, rules/, README.md, ...
```

จากนั้น **ปิดและเปิด Claude Code ใหม่** เพื่อโหลด skill

Skill จะถูกเรียกใช้อัตโนมัติเมื่อ:
- โปรเจ็คที่เปิดอยู่มีไฟล์ `.clasp.json` หรือ `appsscript.json`
- คุณกำลังแก้ไฟล์ `.gs` หรือ `.js` ในโปรเจ็ค clasp
- คุณพิมพ์ prompt ที่มีคำว่า "Google Apps Script", "GAS", หรือ "clasp"

#### เช็คสถานะ + ดูว่ามีอัพเดทไหม

Mac / Linux:
```bash
bash ~/.claude/skills/gas-best-practices/check.sh
```

Windows PowerShell:
```powershell
& "$HOME\.claude\skills\gas-best-practices\check.ps1"
```

จะแสดง version ปัจจุบัน, จำนวน rules, และบอกถ้ามี commit ใหม่ใน GitHub

#### อัพเดตเป็นเวอร์ชันล่าสุด

Mac / Linux:
```bash
bash ~/.claude/skills/gas-best-practices/update.sh
```

Windows PowerShell:
```powershell
& "$HOME\.claude\skills\gas-best-practices\update.ps1"
```

หรือทำเองด้วย git:
```bash
cd ~/.claude/skills/gas-best-practices && git pull
```

หลังอัพเดต — **restart Claude Code** เพื่อโหลด skill เวอร์ชันใหม่

#### ถอนการติดตั้ง

Mac / Linux:
```bash
rm -rf ~/.claude/skills/gas-best-practices
```

Windows PowerShell:
```powershell
Remove-Item -Recurse -Force "$HOME\.claude\skills\gas-best-practices"
```

---

## 🔍 ทดสอบว่าใช้งานได้

หลัง install เสร็จ ลองเปิดโปรเจ็ค GAS แล้วถาม Claude:

> "ช่วยตรวจ Code.gs หน่อย"

Claude ควรอ้างถึง pattern จาก skill นี้ (เช่น แนะนำให้ใช้ `Result envelope`, `LockService`, `Logger.log` boundary)

---

## 🤖 ใช้กับ AI tool อื่น (ไม่ใช่แค่ Claude Code)

Skill นี้ออกแบบให้ทำงานกับ Claude Code โดยตรง — แต่ **เนื้อหา rule ใน `rules/` เป็น markdown ธรรมดา** ใช้กับ AI tool ตัวอื่นได้ทั้งหมด

### Cursor / Windsurf / Cline

Clone repo เข้าไปในโปรเจ็ค หรือ copy ไฟล์ `.cursorrules` / `.windsurfrules` / `.clinerules` จาก repo นี้ไปวางใน root ของโปรเจ็คคุณ:

```bash
curl -O https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/.cursorrules
```

แล้ว AI ของ tool นั้นจะอ่านอัตโนมัติเวลาคุณเปิดโปรเจ็ค (ต้อง clone repo ไว้ใกล้ ๆ เพื่อให้ AI access `rules/*.md` ได้)

### ChatGPT / Claude.ai web / Gemini

ใช้ไฟล์ **`PROMPT.md`** ที่รวมทุก rule ในไฟล์เดียว:

1. ดาวน์โหลด: <https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/PROMPT.md>
2. Copy เนื้อหาทั้งหมด
3. วางใน:
   - **ChatGPT Custom GPT** → Instructions field
   - **ChatGPT Project** → Project knowledge
   - **Claude.ai Project** → Project knowledge / custom instructions
   - **Gemini Gem** → Instructions

ขนาดประมาณ 4,000 บรรทัด (~95KB) — พอดีกับ context window ของ GPT-4o, Claude 3.5+, Gemini 1.5+

### Gemini Code Assist / OpenCode

อ่านไฟล์ **`AGENTS.md`** อัตโนมัติ — clone repo เข้าโปรเจ็คก็ใช้ได้

### GitHub Copilot

Copilot ไม่อ่าน external rule files แต่อ่าน `.github/copilot-instructions.md` ได้:

```bash
mkdir -p .github
curl -o .github/copilot-instructions.md \
  https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/AGENTS.md
```

### Aider

```bash
aider --read /path/to/gas-best-practices/AGENTS.md \
      --read /path/to/gas-best-practices/rules/spreadsheet-ops.md
```

### Continue.dev

ใน `.continue/config.json`:

```json
{
  "contextProviders": [
    {
      "name": "file",
      "params": {
        "filePath": "/path/to/gas-best-practices/PROMPT.md"
      }
    }
  ]
}
```

### สรุปไฟล์ที่ใช้กับแต่ละ AI

| AI tool | ไฟล์ที่ใช้ |
|---|---|
| **Claude Code** (recommended) | `SKILL.md` (auto-loaded จาก `~/.claude/skills/`) |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Gemini Code Assist / OpenCode | `AGENTS.md` |
| GitHub Copilot | copy `AGENTS.md` → `.github/copilot-instructions.md` |
| Aider | `--read AGENTS.md --read rules/*.md` |
| Continue.dev | `PROMPT.md` ใน config |
| ChatGPT / Claude.ai web / Gemini chat | `PROMPT.md` paste ใน custom instructions/project knowledge |

## เนื้อหา

| Rule file | สิ่งที่ครอบคลุม |
|---|---|
| [project-structure.md](rules/project-structure.md) | clasp, appsscript.json, file split, naming |
| [spreadsheet-ops.md](rules/spreadsheet-ops.md) | bulk read/write, merged cells gotcha, column index, % handling |
| [web-app-rpc.md](rules/web-app-rpc.md) | `google.script.run`, Result envelope, bundling, optimistic updates |
| [htmlservice-frontend.md](rules/htmlservice-frontend.md) | viewport meta, `createHtmlOutputFromFile`, partial include, template syntax, mobile debug |
| [external-frontend.md](rules/external-frontend.md) | GitHub Pages/Netlify + GAS API, camera capture, CORS workaround (text/plain), session token, PWA |
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
| [logging-boundaries.md](rules/logging-boundaries.md) | log ที่ RPC boundary (client+server), mask sensitive, copy-debug-info UX, version stamp |

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
- 🐛 **เบอร์โทร `0812345678` กลายเป็น `812345678`** เพราะ Sheets autoparse เป็น number — ต้อง `setNumberFormat('@')` หรือ prefix `'` → [spreadsheet-ops.md](rules/spreadsheet-ops.md) Rule #6.6
- 🐛 **Date object ส่งจาก server มา client แล้วเป็น `{}`** เพราะ `google.script.run` ไม่ serialize Date → [spreadsheet-ops.md](rules/spreadsheet-ops.md) Rule #6.1
- 🐛 **`getUserMedia` ใช้ไม่ได้ในเว็บแอป** เพราะ GAS iframe block — ต้องย้าย frontend ไป GitHub Pages → [external-frontend.md](rules/external-frontend.md)
- 🐛 **fetch GAS แล้ว CORS error** เพราะส่ง `Content-Type: application/json` (trigger preflight) — ต้องใช้ `text/plain` → [external-frontend.md](rules/external-frontend.md) Rule #1
- 🐛 **"ขออภัย ไม่สามารถเปิดไฟล์ได้ในเวลานี้"** เวลามี Google หลายบัญชีในเครื่อง — แก้ด้วย `?authuser=` หรือ `/u/<n>/` → [external-frontend.md](rules/external-frontend.md) Rule #8.1

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
