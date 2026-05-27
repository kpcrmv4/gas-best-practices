# Dynamic Dropdowns (ค่าตัวเลือกที่ไม่ควรฟิกตายตัว)

## Rule: dropdown ที่เกี่ยวกับวันที่/ปี — ห้าม hardcode ใน HTML

**Why:** โค้ดที่ hardcode `<option value="2024">2024</option>` จะ "ล้าสมัย" ทันทีที่เวลาผ่านไป — user ปี 2027 เปิดมาเห็นปีเก่า งงทันที

### ✗ Bad — fixed list

```html
<select x-model="recordForm.year">
  <option value="2567">2567</option>
  <option value="2568">2568</option>
  <option value="2569">2569</option>
</select>
```

### ✓ Good — generate จากปีปัจจุบัน + กรองค่าที่มีใน sheet

```javascript
// ใน Alpine data() / state
get yearOptions() {
  // ปีปัจจุบัน + 2 ปีก่อนหน้า + 2 ปีถัดไป (พ.ศ.)
  const currentBE = new Date().getFullYear() + 543;
  const generated = [];
  for (let y = currentBE - 2; y <= currentBE + 2; y++) generated.push(y);

  // รวมกับปีที่เคยมีใน records (กรณีมี record เก่ากว่า -2 ปี)
  const fromData = [...new Set(this.records.map(r => Number(r.Year)).filter(Boolean))];

  // merge + sort desc (ปีใหม่ก่อน) + unique
  return [...new Set([...generated, ...fromData])].sort((a, b) => b - a);
}
```

```html
<select x-model="recordForm.year">
  <template x-for="y in yearOptions" :key="y">
    <option :value="y" x-text="y"></option>
  </template>
</select>
```

---

## Rule: default value = ปีปัจจุบัน

```javascript
// ตอน init form
recordForm: {
  year: new Date().getFullYear() + 543, // พ.ศ.
  term: this.guessCurrentTerm(),
  // ...
},

guessCurrentTerm() {
  const m = new Date().getMonth() + 1; // 1-12
  // ภาคเรียนที่ 1: พ.ค.-ก.ย. (5-9), ภาคเรียนที่ 2: ต.ค.-มี.ค.
  return (m >= 5 && m <= 9) ? 1 : 2;
}
```

---

## Rule: dropdown ที่เป็น enum จาก data จริง — pull จาก sheet

ตัวอย่าง: dropdown "ชั้น" (ป.1, ป.2, ม.3, ฯลฯ) — ดึงจาก records ที่มีอยู่จริง + เพิ่ม "ค่าที่ยังไม่มี" เป็น input field

```javascript
get classLevelOptions() {
  const fromData = [...new Set(this.records.map(r => r.ClassLevel).filter(Boolean))];
  const defaults = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  return [...new Set([...defaults, ...fromData])].sort();
}
```

หรือถ้าต้องการ flexible สุด — ใช้ `<input list="...">` (datalist) แทน select:

```html
<input list="classLevels" x-model="recordForm.classLevel" placeholder="เช่น ป.1">
<datalist id="classLevels">
  <template x-for="c in classLevelOptions" :key="c">
    <option :value="c"></option>
  </template>
</datalist>
```

User พิมพ์ค่าใหม่ก็ได้ + เห็น autocomplete ของค่าที่เคยมี

---

## Rule: เดือน — ใช้ Intl.DateTimeFormat ไม่ hardcode

```javascript
get monthOptions() {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(2000, m, 1);
    months.push({
      value: m + 1,
      label: d.toLocaleString('th-TH', { month: 'long' }) // 'มกราคม', 'กุมภาพันธ์'
    });
  }
  return months;
}
```

---

## Rule: time slot — generate ตาม step

```javascript
get timeSlots() {
  const slots = [];
  for (let h = 8; h <= 17; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}
```

---

## Rule: dropdown ที่ขึ้นกับ user role — กรองฝั่ง client + double-check server

```javascript
get folderOptions() {
  if (this.user.role === 'admin') return this.folders;
  return this.folders.filter(f => f.OwnerUserID === this.user.userId);
}
```

**Server ก็ต้อง enforce — อย่าเชื่อ client filter** (ดู `rules/security.md`)

---

## Rule: refresh option list หลัง create row ใหม่

```javascript
async doCreateRecord() {
  const res = await rpc('saveRecord', this.user.userId, this.recordForm);
  if (res.ok) {
    this.records.push(res.record);
    // computed property yearOptions/classLevelOptions จะ recompute เอง — ไม่ต้องสั่ง
  }
}
```

ใช้ Vue/Alpine computed → reactive อัตโนมัติ
