# Contributing

ขอบคุณที่สนใจ contribute! กฎใหม่ ๆ ที่ดีที่สุดมาจากบักจริง — ถ้าคุณเคย debug GAS แล้วใช้เวลามากเกินที่ควร นั่นแหละคือเนื้อหากฎที่ดี

## วิธีเพิ่ม rule ใหม่

1. สร้างไฟล์ใหม่ใน `rules/<หมวด>.md` หรือเพิ่ม rule ใน file ที่มีอยู่
2. ทำตามแม่แบบนี้:

```markdown
## Rule #N: <กฎสั้น ๆ ประโยคเดียว>

**Why:** <เหตุผล — bug จริง / pitfall / quota limit>

### ✗ Bad

\`\`\`javascript
// โค้ดที่ทำให้พัง พร้อม comment ระบุว่าตรงไหนพัง
\`\`\`

### ✓ Good

\`\`\`javascript
// pattern ที่ใช้ได้จริง
\`\`\`

**Edge case:** <ข้อยกเว้น / trade-off / when not to apply — ถ้ามี>
```

3. update `README.md` table + `SKILL.md` mapping ถ้าเพิ่ม file ใหม่
4. ส่ง PR พร้อมระบุ:
   - บริบทที่เจอบัก (production / dev / ขนาดงาน)
   - error message ตัวจริง (ถ้ามี)
   - ลิงก์ docs ของ Google ที่เกี่ยวข้อง

## หลักการเขียน rule

- **เฉพาะเจาะจง > ทั่วไป** — "ห้าม setValues บน sheet ที่มี merged cells" ดีกว่า "ระวัง setValues"
- **มีเหตุผล** — ทำไม ไม่ใช่แค่ทำไง
- **มีโค้ดทั้ง bad + good** — copy-paste ใช้ได้เลย
- **trigger keyword ใน description** ของ SKILL.md frontmatter เพื่อให้ Claude ค้นเจอ

## กฎที่ "ไม่ควรเพิ่ม"

- กฎทั่วไปของ JavaScript (ห้าม `var`, ใช้ `===`) — ไม่เฉพาะ GAS
- กฎที่ขัดกับ official docs ของ Google โดยไม่มีหลักฐาน
- กฎที่ตั้งจากความชอบส่วนตัว — ต้องมีเหตุผลเชิงเทคนิคหรือ user-facing

## License

PR ที่ merge จะอยู่ภายใต้ MIT license เดียวกับ repo
