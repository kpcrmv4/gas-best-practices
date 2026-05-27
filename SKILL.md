---
name: gas-best-practices
description: Google Apps Script best practices for production web apps and automation — project layout with clasp, Spreadsheet/Drive ops, LockService for concurrency, ScriptCache, web app RPC pattern with Thai error messages, PDF generation with placeholders, schema migrations, OAuth scopes. Use when working with .gs/.js files in clasp projects, when appsscript.json or .clasp.json exists, or when the user mentions Google Apps Script / GAS / clasp.
---

# Google Apps Script — Best Practices

ใช้กฎเหล่านี้เมื่อทำงานกับ Google Apps Script (ตรวจสอบจาก `.clasp.json`, `appsscript.json`, ไฟล์ `.gs`, หรือผู้ใช้พูดถึง "Apps Script" / "clasp")

## วิธีอ่าน

แต่ละไฟล์ใน `rules/` มีโครงสร้าง:
- **Rule** — กฎข้อเดียวสั้น ๆ
- **Why** — ทำไม (มักเป็น bug จริงที่เคยเจอ)
- **✗ Bad** — โค้ดที่ทำให้พัง
- **✓ Good** — แม่แบบที่ถูก
- **Edge cases** — ข้อยกเว้น ถ้ามี

## เมื่อ trigger

ใช้ rule ตามบริบทของ task:

| ผู้ใช้กำลังทำ | อ่านกฎเหล่านี้ |
|---|---|
| Setup โปรเจ็คใหม่, จัดไฟล์ | `rules/project-structure.md` |
| Read/write Sheet, batch update | `rules/spreadsheet-ops.md` |
| ทำ web app ที่เรียกผ่าน `google.script.run` | `rules/web-app-rpc.md` |
| HTML head, viewport, partial include, template syntax | `rules/htmlservice-frontend.md` |
| สร้าง PDF จาก template | `rules/pdf-generation.md` |
| จัดการ folder/file ใน Drive | `rules/drive-ops.md` |
| operation ที่ user หลายคนอาจชนกัน | `rules/lock-service.md` |
| query ที่ซ้ำบ่อย | `rules/cache-service.md` |
| custom menu ใน Sheet | `rules/onopen-menu.md` |
| dropdown ปี/เดือน/enum ที่ไม่ฟิกตายตัว | `rules/dynamic-dropdowns.md` |
| auth, role check, OAuth scope | `rules/security.md` |
| เพิ่มตาราง/คอลัมน์ใหม่ในระบบที่ ship แล้ว | `rules/schema-migrations.md` |
| handle error + user-facing message | `rules/error-handling.md` |
| debug, log, execution history | `rules/testing-debugging.md` |

## หลักการรวม

1. **ทุก server function ที่ client เรียกได้ ต้องคืน `Result<T>` envelope** — ไม่ throw ออกไป client เห็น stack trace
2. **Sheet อ่านครั้งเดียวด้วย `getDataRange().getValues()`** — แต่ **เขียนทีละเซลล์** ถ้าตารางมี merged cells
3. **Lazy resource creation** — folder ID, sheet, column สร้างให้อัตโนมัติตอน startup เก็บไว้ใน Config sheet
4. **Cache `auth.uid()`-equivalent + ผลคำนวณซ้ำ** ผ่าน `CacheService.getScriptCache()` พร้อม invalidate
5. **LockService รอบ mutation ที่ชนได้** เช่น generate PDF, append row ที่มี side-effect
6. **เก็บ folder ID ใน Config sheet** ไม่ใช่ใน script property — แก้ง่ายไม่ต้อง redeploy
7. **Error message ภาษาไทยที่ user เข้าใจ** + Logger.log ภาษาอังกฤษสำหรับ developer
