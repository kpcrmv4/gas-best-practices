# HtmlService & Frontend

## Rule #1: `<meta viewport>` ต้องอยู่ใน `<head>` ของไฟล์ `.html` — ห้ามใส่ใน `.gs`

**Bug ที่ AI ชอบทำ:** บาง AI ที่ generate GAS web app ใส่ viewport meta tag เป็น string ในไฟล์ `.gs`:

### ✗ Bad — ใส่ใน .gs ไม่ทำงาน

```javascript
// Code.gs
function doGet() {
  const html = '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
               '<div>...</div>';
  return HtmlService.createHtmlOutput(html);
}
```

หรือพยายาม inject ผ่าน function:

```javascript
function getViewport() {
  return '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
}
```

**ทำไมไม่ทำงาน:**
- `HtmlService` wrap HTML ของเราใน iframe (`googleusercontent.com/...`) — meta tag ที่อยู่ใน `<body>` หรือ inject runtime จะไม่ effective เพราะ browser parse viewport ตอน initial HTML render เท่านั้น
- string concat ใน `.gs` มัก escape ผิด ทำให้ tag เพี้ยน
- iframe parent คือ Google Apps Script wrapper — เราไม่มีสิทธิ์แก้ viewport ของ parent

ผลที่เห็น: เปิดเว็บแอปบนมือถือแล้วหน้าเล็กจิ๋ว ต้อง pinch-zoom ทุกครั้ง

### ✓ Good — อยู่ใน `<head>` ของไฟล์ `.html`

```html
<!-- Index.html -->
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My GAS Web App</title>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

```javascript
// รหัส.js / Code.gs
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('My GAS Web App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0'); // optional reinforcement
}
```

**ใช้ `addMetaTag()`** ของ `HtmlOutput` — Google จะ inject เข้า `<head>` ของ iframe wrapper ด้วย (defense in depth)

---

## Rule #2: viewport ที่ครอบคลุมทุกกรณี

```html
<!-- ทั่วไป -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- ห้าม user zoom เพื่อกัน UI พังตอน focus input บน iOS -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<!-- PWA-style: ครอบคลุม notch บน iPhone -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Caveat ของ `maximum-scale=1.0`:** บล็อก accessibility (user สายตาไม่ดี zoom ไม่ได้) — ใช้เฉพาะเมื่อจำเป็นจริง

---

## Rule #3: ใช้ `HtmlService.createHtmlOutputFromFile()` ไม่ใช่ string concat

### ✗ Bad

```javascript
function doGet() {
  return HtmlService.createHtmlOutput('<html><head>...</head><body>...</body></html>');
}
```

### ✓ Good

```javascript
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('My App')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

แยก HTML ออกเป็นไฟล์เดี่ยว → syntax highlighting, format, version control ใช้ได้

---

## Rule #4: `<?!= include('partial') ?>` — แยก partial เป็นไฟล์

```javascript
// Code.gs
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

```html
<!-- Index.html -->
<!DOCTYPE html>
<html>
<head>
  <?!= include('styles') ?>
</head>
<body>
  <?!= include('header') ?>
  <main><!-- ... --></main>
  <?!= include('scripts') ?>
</body>
</html>
```

```html
<!-- styles.html -->
<style>
  body { font-family: 'Sarabun', sans-serif; }
</style>
```

```html
<!-- scripts.html -->
<script>
  // Alpine / Vue / vanilla JS
</script>
```

**Caveat ในไฟล์ partial:** ห้ามมี `<!DOCTYPE>` หรือ `<html>` — แค่ snippet — เพราะมันจะถูก inline เข้าหน้าเต็ม

---

## Rule #5: `<?= var ?>` escape อัตโนมัติ — `<?!= var ?>` ห้าม escape

| Tag | Behavior | ใช้กับ |
|---|---|---|
| `<?= ... ?>` | HTML-escape อัตโนมัติ | user-supplied data (กัน XSS) |
| `<?!= ... ?>` | raw output, ไม่ escape | partial include, trusted HTML |
| `<? ... ?>` | execute, ไม่ output | loop, if-else |

```html
<!-- Safe -->
<div>Hello, <?= userName ?></div>

<!-- Dangerous if userName มี HTML -->
<div>Hello, <?!= userName ?></div>
```

---

## Rule #6: server function ที่ template เรียกตอน render — ต้อง deterministic + fast

```javascript
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.userName = Session.getActiveUser().getEmail();
  t.items = readSheet_(sheet); // ระวัง — ถ้า sheet ใหญ่ render ช้า
  return t.evaluate().setTitle('App');
}
```

**Trade-off:** server-render = SEO + first paint เร็ว แต่ผูกกับ session + ไม่ cache
**Alternative:** ส่ง HTML shell ออกไปก่อน แล้ว fetch data ผ่าน `google.script.run` ใน client-side (SPA pattern)

---

## Rule #7: `setXFrameOptionsMode(ALLOWALL)` ถ้าต้อง embed ในเว็บอื่น

```javascript
HtmlService.createHtmlOutputFromFile('Index')
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

default คือ `DEFAULT` — block embed → web app เปิดได้ผ่าน URL ตรงเท่านั้น ถ้าต้อง embed ใน Sites/iframe ต้อง ALLOWALL

---

## Rule #8: ห้ามใช้ inline event handler ที่เรียก server function ตรง ๆ

### ✗ Bad

```html
<button onclick="google.script.run.saveData('hello')">Save</button>
```

### ✓ Good — wrap ผ่าน rpc + handle response

```html
<button onclick="doSave()">Save</button>
<script>
  async function doSave() {
    const res = await rpc('saveData', 'hello');
    if (res.ok) Swal.fire('สำเร็จ');
    else Swal.fire('ผิดพลาด', res.message, 'error');
  }
</script>
```

ดู `rules/web-app-rpc.md` Rule #2 สำหรับ `rpc()` wrapper

---

## Rule #9: tags ที่มักลืม

```html
<head>
  <meta charset="UTF-8">                                  <!-- 1. ครั้งแรกเสมอ -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">  <!-- 2. responsive -->
  <meta name="theme-color" content="#d81b60">             <!-- 3. PWA bar color บน mobile -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'>...">  <!-- 4. favicon (data URI กัน 404) -->
  <title>App Name</title>                                 <!-- 5. tab title -->
</head>
```

GAS iframe ไม่ส่ง favicon → ใส่ data URI กัน 404 ใน Network tab

---

## Rule #10: log warning จาก client → server (debug บน mobile)

มือถือไม่มี DevTools — ส่ง error กลับ server log:

```javascript
// Client
window.addEventListener('error', (e) => {
  google.script.run.logClientError({
    message: e.message,
    source: e.filename,
    line: e.lineno,
    userAgent: navigator.userAgent,
  });
});

// Server
function logClientError(payload) {
  Logger.log('[client error] ' + JSON.stringify(payload));
  // หรือ append เข้า Logs sheet
}
```

ช่วย debug bug ที่เกิดบน iPhone Safari แต่ไม่เกิดบน desktop Chrome
