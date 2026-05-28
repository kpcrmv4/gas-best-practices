# Prompt สำหรับสั่ง AI สร้างภาพ infographic 16:9

เอาไปวางใน image/design AI ได้เลย (Midjourney, DALL·E / GPT-4o image, Ideogram, Adobe Firefly, Canva AI ฯลฯ)

> ⚠️ หมายเหตุสำคัญ: AI สร้างภาพส่วนใหญ่ "สะกดข้อความ (โดยเฉพาะภาษาไทย) ผิด" — แนะนำ 2 ทาง
> 1. ใช้ตัวที่เก่งเรื่องตัวอักษร เช่น **Ideogram** หรือ **GPT-4o image** และยังต้องตรวจคำซ้ำ
> 2. หรือให้ AI สร้าง "พื้นหลัง + เลย์เอาต์การ์ดเปล่า" สวย ๆ แล้วเอาไปพิมพ์ข้อความเองใน **Canva / Figma** (ชัวร์สุด ข้อความไม่เพี้ยน)

---

## ⭐ Prompt ก้อนเดียวจบ — มี 16 การ์ดครบเหมือนรูปตัวอย่าง (แนะนำ)

```
Create a clean modern 16:9 infographic poster, 1920x1080, dark theme, flat design,
sleek developer/SaaS landing-page aesthetic. Deep navy gradient background
(#0b1220 top to #161f38 bottom). Crisp geometric sans-serif font that supports Thai
(Sarabun / IBM Plex Sans Thai). Pixel-perfect alignment, generous spacing, no photos, no 3D.

HEADER (top-left): bold white title "Google Apps Script — Best Practices",
with a smaller grey subtitle below it "แนวปฏิบัติจากบั๊กจริงใน production".
TOP-RIGHT: a rounded badge with a sky-blue→violet gradient reading "16 หมวด · 130+ กฎ".

MAIN AREA: a perfectly aligned 4-column x 4-row grid of 16 rounded glassmorphism cards
(frosted glass, thin 1px border #27395c, fill #15233f, soft glow). Each card has:
a small colored circular number badge (top-left) with a white number, a BOLD Thai title,
a smaller English subtitle in the card's accent color, and two short muted hint lines (#9fb0c9).
Each card has a different accent color (in order): sky, emerald, pink, amber, violet, rose,
green, cyan, purple, orange, red, blue, orange, teal, fuchsia, light-blue.

Cards in reading order (left→right, top→bottom):

Row 1:
[01] "โครงสร้างโปรเจกต์" — Project Structure — "clasp · แยกไฟล์ตาม domain" / "gitignore ไฟล์ secret"
[02] "งานสเปรดชีต" — Spreadsheet Ops — "bulk read · flush()" / "merged cells · กันเลข 0 หาย"
[03] "Web App RPC" — google.script.run — "Result envelope ไม่ throw" / "promisify · payload 50MB"
[04] "HtmlService" — Frontend / viewport — "viewport ใน .html · escape" / "include partial · log มือถือ"

Row 2:
[05] "External Frontend" — GitHub Pages + GAS — "POST text/plain เลี่ยง CORS" / "กล้อง · auth token · PWA"
[06] "สร้าง PDF" — PDF Generation — "placeholder {{KEY}} · OAuth export" / "ลายเซ็น · ตัดขอบขาว · พ.ศ."
[07] "งาน Drive" — Drive Operations — "folder ID ใน Config · base64" / "ระวัง domain policy แชร์ลิงก์"
[08] "LockService" — Concurrency — "กัน concurrent · finally release" / "ห้าม lock รอบ UrlFetch"

Row 3:
[09] "CacheService" — Caching — "cache อ่านบ่อยเปลี่ยนน้อย" / "TTL · invalidate · 100KB/key"
[10] "Dropdown ไดนามิก" — Dynamic Dropdowns — "ปี/วันที่ ไม่ hardcode" / "enum ดึงจากชีต · default ปีนี้"
[11] "ความปลอดภัย" — Security — "requireUser/Role · PBKDF2" / "oauthScopes · validate input"
[12] "Schema Migrations" — Migrations — "ensureSchema idempotent" / "default ให้ row เก่า · version"

Row 4:
[13] "จัดการ Error" — Error Handling — "Result envelope · ข้อความไทย" / "actionable · modal · retry"
[14] "เมนู onOpen" — Sheets Menu — "onOpen simple trigger" / "confirm destructive · แยก role"
[15] "ทดสอบ & ดีบัก" — Testing & Debugging — "Logger prefix · test มือ · e2e" / "timing · ระวัง quota รายวัน"
[16] "Logging Boundaries" — Boundary Logging — "log client+server · mask" / "payload size · __DEBUG__ · version"

FOOTER (bottom-left): small text "github.com/kpcrmv4/gas-best-practices".
FOOTER (bottom-right): "ใช้กับ Claude Code · Cursor · Windsurf · ChatGPT · Gemini".

--ar 16:9 --style raw
```

---

## 🅰️ Prompt หลัก (ก๊อปทั้งก้อน)

```
A clean, modern 16:9 tech infographic poster (1920x1080), dark theme.
Title at top-left: "Google Apps Script — Best Practices".
Small subtitle under it: "แนวปฏิบัติจากบั๊กจริงใน production".
A rounded badge at top-right with gradient (sky-blue to violet) reading "16 หมวด · 130+ กฎ".

Below the header: a neat 4 x 4 grid of 16 rounded glassmorphism cards
(subtle frosted glass, soft inner glow, thin 1px border, generous padding,
consistent spacing). Each card has: a small colored circular number badge
(01–16) in the top-left, a bold Thai title, a smaller English subtitle in the
card's accent color, and two short muted hint lines.

Footer: left side small text "github.com/kpcrmv4/gas-best-practices".

Style: sleek developer / SaaS landing-page aesthetic, deep navy background
(#0b1220 to #161f38 gradient), vibrant but tasteful accent colors per card
(sky, emerald, pink, amber, violet, rose, green, cyan, purple, orange, red,
blue, teal, fuchsia), high contrast, lots of negative space, crisp typography,
flat design, no clutter, no photos, no 3D, pixel-perfect alignment.
Font: a clean geometric sans that supports Thai (like Sarabun / IBM Plex Sans Thai).
--ar 16:9 --style raw
```

---

## 🅱️ ข้อความที่ต้องอยู่ในการ์ด (ก๊อปไปวางให้ AI ใช้ตรง ๆ กันสะกดผิด)

ลำดับ: เลข — ชื่อไทย (หัวข้อใหญ่) — ชื่ออังกฤษ (subtitle) — 2 บรรทัดคีย์เวิร์ด

```
01  โครงสร้างโปรเจกต์   Project Structure
    clasp · แยกไฟล์ตาม domain
    gitignore ไฟล์ secret

02  งานสเปรดชีต         Spreadsheet Ops
    bulk read · flush()
    merged cells · กันเลข 0 หาย

03  Web App RPC          google.script.run
    Result envelope ไม่ throw
    promisify · payload 50MB

04  HtmlService          Frontend / viewport
    viewport ใน .html · escape
    include partial · log มือถือ

05  External Frontend    GitHub Pages + GAS
    POST text/plain เลี่ยง CORS
    กล้อง · auth token · PWA

06  สร้าง PDF            PDF Generation
    placeholder {{KEY}} · OAuth export
    ลายเซ็น · ตัดขอบขาว · พ.ศ.

07  งาน Drive            Drive Operations
    folder ID ใน Config · base64
    ระวัง domain policy แชร์ลิงก์

08  LockService          Concurrency
    กัน concurrent · finally release
    ห้าม lock รอบ UrlFetch

09  CacheService         Caching
    cache อ่านบ่อยเปลี่ยนน้อย
    TTL · invalidate · 100KB/key

10  Dropdown ไดนามิก     Dynamic Dropdowns
    ปี/วันที่ ไม่ hardcode
    enum ดึงจากชีต · default ปีนี้

11  ความปลอดภัย         Security
    requireUser/Role · PBKDF2
    oauthScopes · validate input

12  Schema Migrations    Migrations
    ensureSchema idempotent
    default ให้ row เก่า · version

13  จัดการ Error         Error Handling
    Result envelope · ข้อความไทย
    actionable · modal · retry

14  เมนู onOpen          Sheets Menu
    onOpen simple trigger
    confirm destructive · แยก role

15  ทดสอบ & ดีบัก        Testing & Debugging
    Logger prefix · test มือ · e2e
    timing · ระวัง quota รายวัน

16  Logging Boundaries   Boundary Logging
    log client+server · mask
    payload size · __DEBUG__ · version
```

---

## 🎨 พาเลตสี (บอก AI หรือใช้ตอนทำเองใน Canva/Figma)

- พื้นหลัง: ไล่เฉด navy `#0b1220` → `#161f38`
- การ์ด: `#15233f` ขอบ `#27395c`
- ตัวอักษรหลัก: `#f1f5f9` · รอง/คีย์เวิร์ด: `#9fb0c9`
- accent ต่อการ์ด (16 สี): `#38bdf8 #34d399 #f472b6 #fbbf24 #a78bfa #fb7185 #4ade80 #22d3ee #c084fc #f59e0b #f87171 #60a5fa #fdba74 #2dd4bf #e879f9 #93c5fd`
- badge หัวมุม: ไล่เฉด `#38bdf8` → `#a78bfa`

---

## 🅲️ เวอร์ชันสั้น (Midjourney / Ideogram one-liner)

```
16:9 dark modern tech infographic, "Google Apps Script — Best Practices",
4x4 grid of 16 glassmorphism cards with numbered badges and colorful accents,
deep navy gradient background, clean geometric sans-serif, flat design,
SaaS landing page style, crisp, minimal, high contrast --ar 16:9 --style raw
```

---

## 🅳️ สัดส่วนอื่น (เปลี่ยนแค่ aspect ratio + เลย์เอาต์)

- จัตุรัส 1:1 (ฟีด IG/FB): grid 4x4 เหมือนเดิม → `--ar 1:1`
- สตอรี่/รีล 9:16: เปลี่ยนเป็น grid 2 คอลัมน์ × 8 แถว → `--ar 9:16`
- Carousel: หมวดละสไลด์ 1:1 รวม 16 ใบ (ดูกฎย่อยทั้งหมดใน `facebook-full-list.md`)
