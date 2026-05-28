#!/usr/bin/env python3
"""Generate a 16:9 infographic (SVG + PNG) of all 16 gas-best-practices topics."""
import html
import cairosvg

W, H = 1920, 1080
FONT = "Sarabun, 'Noto Sans Thai', sans-serif"

topics = [
    ("01", "โครงสร้างโปรเจกต์", "Project Structure",
     ["clasp · แยกไฟล์ตาม domain", "gitignore ไฟล์ secret"], "#38bdf8"),
    ("02", "งานสเปรดชีต", "Spreadsheet Ops",
     ["bulk read · flush()", "merged cells · กันเลข 0 หาย"], "#34d399"),
    ("03", "Web App RPC", "google.script.run",
     ["Result envelope ไม่ throw", "promisify · payload 50MB"], "#f472b6"),
    ("04", "HtmlService", "Frontend / viewport",
     ["viewport ใน .html · escape", "include partial · log มือถือ"], "#fbbf24"),
    ("05", "External Frontend", "GitHub Pages + GAS",
     ["POST text/plain เลี่ยง CORS", "กล้อง · auth token · PWA"], "#a78bfa"),
    ("06", "สร้าง PDF", "PDF Generation",
     ["placeholder {{KEY}} · OAuth export", "ลายเซ็น · ตัดขอบขาว · พ.ศ."], "#fb7185"),
    ("07", "งาน Drive", "Drive Operations",
     ["folder ID ใน Config · base64", "ระวัง domain policy แชร์ลิงก์"], "#4ade80"),
    ("08", "LockService", "Concurrency",
     ["กัน concurrent · finally release", "ห้าม lock รอบ UrlFetch"], "#22d3ee"),
    ("09", "CacheService", "Caching",
     ["cache อ่านบ่อยเปลี่ยนน้อย", "TTL · invalidate · 100KB/key"], "#c084fc"),
    ("10", "Dropdown ไดนามิก", "Dynamic Dropdowns",
     ["ปี/วันที่ ไม่ hardcode", "enum ดึงจากชีต · default ปีนี้"], "#f59e0b"),
    ("11", "ความปลอดภัย", "Security",
     ["requireUser/Role · PBKDF2", "oauthScopes · validate input"], "#f87171"),
    ("12", "Schema Migrations", "Migrations",
     ["ensureSchema idempotent", "default ให้ row เก่า · version"], "#60a5fa"),
    ("13", "จัดการ Error", "Error Handling",
     ["Result envelope · ข้อความไทย", "actionable · modal · retry"], "#fdba74"),
    ("14", "เมนู onOpen", "Sheets Menu",
     ["onOpen simple trigger", "confirm destructive · แยก role"], "#2dd4bf"),
    ("15", "ทดสอบ & ดีบัก", "Testing & Debugging",
     ["Logger prefix · test มือ · e2e", "timing · ระวัง quota รายวัน"], "#e879f9"),
    ("16", "Logging Boundaries", "Boundary Logging",
     ["log client+server · mask", "payload size · __DEBUG__ · version"], "#93c5fd"),
]

def esc(s):
    return html.escape(s, quote=True)

CARD_W, CARD_H = 442, 184
GX, GY = 40, 178
GAP_X, GAP_Y = 26, 24

parts = []
parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
parts.append('<defs>')
parts.append('<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#0b1220"/>'
             '<stop offset="1" stop-color="#161f38"/></linearGradient>')
parts.append('<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">'
             '<stop offset="0" stop-color="#38bdf8"/>'
             '<stop offset="1" stop-color="#a78bfa"/></linearGradient>')
parts.append('</defs>')
parts.append(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')

# Header
parts.append(f'<text x="{GX}" y="74" font-family="{FONT}" font-size="50" font-weight="800" '
             f'fill="#f8fafc">Google Apps Script — Best Practices</text>')
parts.append(f'<text x="{GX}" y="118" font-family="{FONT}" font-size="27" font-weight="500" '
             f'fill="#94a3b8">แนวปฏิบัติจากบั๊กจริงใน production — Claude Code skill</text>')
# Badge top-right
bx, bw = W - 40 - 300, 300
parts.append(f'<rect x="{bx}" y="38" width="{bw}" height="74" rx="16" fill="url(#accent)"/>')
parts.append(f'<text x="{bx + bw/2:.0f}" y="74" font-family="{FONT}" font-size="34" font-weight="800" '
             f'fill="#0b1220" text-anchor="middle">16 หมวด</text>')
parts.append(f'<text x="{bx + bw/2:.0f}" y="100" font-family="{FONT}" font-size="19" font-weight="700" '
             f'fill="#0b1220" text-anchor="middle">130+ กฎ · ฟรี MIT</text>')

# Cards 4x4
for i, (num, th, en, hints, color) in enumerate(topics):
    col, row = i % 4, i // 4
    x = GX + col * (CARD_W + GAP_X)
    y = GY + row * (CARD_H + GAP_Y)
    parts.append(f'<rect x="{x}" y="{y}" width="{CARD_W}" height="{CARD_H}" rx="18" '
                 f'fill="#15233f" stroke="#27395c" stroke-width="1.5"/>')
    parts.append(f'<rect x="{x}" y="{y}" width="6" height="{CARD_H}" rx="3" fill="{color}"/>')
    # number badge
    cx, cy, r = x + 56, y + 56, 28
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>')
    parts.append(f'<text x="{cx}" y="{cy + 9}" font-family="{FONT}" font-size="28" font-weight="800" '
                 f'fill="#0b1220" text-anchor="middle">{num}</text>')
    # titles
    parts.append(f'<text x="{x + 100}" y="{y + 50}" font-family="{FONT}" font-size="26" '
                 f'font-weight="800" fill="#f1f5f9">{esc(th)}</text>')
    parts.append(f'<text x="{x + 100}" y="{y + 78}" font-family="{FONT}" font-size="18" '
                 f'font-weight="600" fill="{color}">{esc(en)}</text>')
    # hints
    hy = y + 124
    for line in hints:
        parts.append(f'<text x="{x + 28}" y="{hy}" font-family="{FONT}" font-size="18" '
                     f'fill="#9fb0c9">{esc(line)}</text>')
        hy += 28

# Footer
fy = H - 34
parts.append(f'<text x="{GX}" y="{fy}" font-family="{FONT}" font-size="24" font-weight="700" '
             f'fill="#cbd5e1">github.com/kpcrmv4/gas-best-practices</text>')
parts.append(f'<text x="{W - 40}" y="{fy}" font-family="{FONT}" font-size="22" font-weight="500" '
             f'fill="#7f8ea8" text-anchor="end">ใช้กับ Claude Code · Cursor · Windsurf · Cline · ChatGPT · Gemini</text>')

parts.append('</svg>')
svg = "\n".join(parts)

with open("marketing/topics-16x9.svg", "w", encoding="utf-8") as f:
    f.write(svg)

cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                 write_to="marketing/topics-16x9.png",
                 output_width=W, output_height=H)
print("wrote marketing/topics-16x9.svg and marketing/topics-16x9.png")
