# Changelog

## v1.2.0 — 2026-09-20

### เพิ่ม rule file ใหม่ (22 → 23 ไฟล์)

- `rules/data-integrity.md` — 6 rule จาก incident จริงในระบบจองบัตรที่ใช้ GAS เป็นฐานข้อมูลเงิน: บังคับส่ง `rev` ทุก write (ด่านที่ข้ามได้ด้วยการไม่ส่ง field ไม่ใช่ด่าน), circuit breaker กันลบยกชุด, งานหลังบันทึกต้องอยู่ใน try/catch, ห้าม payload จาก client ทับ field ที่ server เป็นเจ้าของ, reconcile ต้องอ่านทุกที่ที่เก็บค่าจริง, ยืนยันผลด้วย "ตัวตน" ไม่ใช่ "ยอดรวม"

### ปรับปรุงเนื้อหาเดิม

- `cache-service.md` Rule #8 (ใหม่) — cache key ต้องผูกกับ code version ไม่ใช่แค่ data revision ไม่งั้น deploy แล้ว payload เก่าถูกเสิร์ฟต่อจนหมด TTL
- `testing-debugging.md` Rule #11 (ใหม่) — `| grep` บัง exit code ของเทสในคำสั่ง deploy (เคย deploy ขึ้น production ทั้งที่เทสพัง 3 ตัว)
- `data-integrity.md` Rule #4 — แก้ตัวอย่าง `✓ Good` ที่ผูกการล็อกไว้กับธงที่ไม่เคยถูกเซต ทำให้ payload จาก client ทับ field ที่ server เป็นเจ้าของได้อยู่ดี ตอนนี้ล็อกจากค่าที่ server ถืออยู่จริง

## v1.1.0 — 2026-08-14

### เพิ่ม rule files ใหม่ 6 หัวข้อ (16 → 22 ไฟล์)

- `rules/triggers.md` — time-driven/installable triggers, กัน trigger ซ้ำ, `onFormSubmit` (`e.namedValues` ไม่ใช่ `e.values`), สิทธิ์ของ trigger
- `rules/urlfetch-external-api.md` — `muteHttpExceptions`, retry + backoff, `fetchAll`, LINE Messaging API, quota
- `rules/deployment-versioning.md` — `/dev` vs `/exec`, `clasp deploy -i`, rollback, `.claspignore`, version stamp
- `rules/long-running-jobs.md` — checkpoint + continuation trigger ทะลุ 6-minute limit, submit+poll pattern
- `rules/email-notifications.md` — MailApp vs GmailApp, quota, throttled admin error alert
- `rules/properties-service.md` — Script/User/Document properties, เกณฑ์เลือก Properties vs Config sheet

### ปรับปรุงเนื้อหาเดิม

- `project-structure.md` — template `appsscript.json` ใช้ scope แคบ (`drive.file`) สอดคล้อง `security.md` Rule #4
- `spreadsheet-ops.md` Rule #2 — เพิ่มทางเลือก `getMergedRanges()` + batch write เฉพาะโซนปลอดภัย (per-cell ช้ากับตารางใหญ่)
- `security.md` Rule #1 — ตัวอย่าง delete อ้างด้วย RecordID แทน row number + LockService กัน race condition
- `testing-debugging.md` Rule #5 — รวม RPC allow-list เข้าในตัวอย่าง `doPost` หลัก
- เพิ่มสารบัญในไฟล์ยาว: `spreadsheet-ops`, `pdf-generation`, `external-frontend`, `drive-ops`

### โครงสร้าง / เครื่องมือ

- `build.sh` — generate `PROMPT.md` + sync `.clinerules`/`.windsurfrules` จาก source เดียว (เลิก maintain มือ)
- GitHub Actions `check-drift.yml` — fail PR ถ้า generated files ไม่ sync
- `evals/evals.json` — test prompts 6 ข้อสำหรับวัดผล skill
- `examples/web-app-skeleton/` — ตัวอย่าง web app จริงตัวแรก (login + RPC + Lock)
- Sync core principles ให้ตรงกัน 10 ข้อทุก entry point (SKILL.md / AGENTS.md / .cursorrules / .clinerules / .windsurfrules)
- SKILL.md description — เพิ่ม trigger keywords ภาษาไทย + หัวข้อใหม่ (triggers, doGet/doPost, LINE, deployment)

## v0.2.0 — 2026-05-28

- ทำ skill เป็น portable: รองรับ Cursor / Windsurf / Cline / Copilot / ChatGPT / Gemini (`.cursorrules`, `AGENTS.md`, `PROMPT.md`)
- เพิ่ม `check.sh` / `update.sh` สำหรับเช็คสถานะและอัพเดท

## v0.1.0 — 2026-05-28

- เวอร์ชันแรก: 16 rule files สำหรับ Claude Code + คู่มือติดตั้งสองภาษา
