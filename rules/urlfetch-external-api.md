# UrlFetch & External API (LINE, webhook, REST)

## Rule #1: `muteHttpExceptions: true` เสมอ + เช็ค response code เอง

**Why:** default ของ `UrlFetchApp.fetch()` คือ **throw ทันที** เมื่อ HTTP status ≥ 400 — คุณจะไม่ได้เห็น response body ที่บอกสาเหตุ (เช่น error message จาก LINE API) และ throw นั้นหลุดไปถึง client เป็น stack trace

### ✗ Bad

```javascript
const res = UrlFetchApp.fetch(url, opts); // 401 → throw, ไม่รู้ว่า token หมดอายุ
```

### ✓ Good

```javascript
function fetchJson_(url, opts) {
  opts = opts || {};
  opts.muteHttpExceptions = true;
  const res = UrlFetchApp.fetch(url, opts);
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    Logger.log('[fetchJson] ' + url + ' → HTTP ' + code + ' body=' + body.slice(0, 500));
    throw new Error('HTTP ' + code);
  }
  return body ? JSON.parse(body) : null;
}
```

---

## Rule #2: retry + exponential backoff สำหรับ error ชั่วคราว (429/5xx)

**Why:** Google/LINE/API ภายนอก คืน 429 (rate limit) หรือ 500/503 เป็นครั้งคราว — fail ครั้งเดียวแล้วยอมแพ้ทำให้งาน batch ล่มทั้งชุดโดยไม่จำเป็น แต่**ห้าม retry 4xx อื่น** (400/401/403 = ยิงซ้ำก็ผิดเหมือนเดิม)

### ✓ Good

```javascript
function fetchWithRetry_(url, opts, maxRetries) {
  maxRetries = maxRetries || 3;
  for (let attempt = 0; ; attempt++) {
    const res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opts));
    const code = res.getResponseCode();
    const retryable = code === 429 || code >= 500;
    if (!retryable || attempt >= maxRetries) return res;
    Utilities.sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
    Logger.log('[fetchWithRetry] retry ' + (attempt + 1) + ' after HTTP ' + code);
  }
}
```

**ระวัง:** `Utilities.sleep` กินเวลา execution (limit 6 นาที) — batch ใหญ่ที่ retry บ่อยให้ดู `rules/long-running-jobs.md`

---

## Rule #3: ยิงหลาย request ใช้ `fetchAll` — ไม่ใช่ loop fetch ทีละอัน

**Why:** `fetch()` ใน loop = serial round-trip; `fetchAll()` ยิง parallel ในครั้งเดียว เร็วกว่าหลายเท่าและนับ quota เท่ากัน

```javascript
const requests = userIds.map(id => ({
  url: 'https://api.example.com/users/' + encodeURIComponent(id),
  muteHttpExceptions: true,
}));
const responses = UrlFetchApp.fetchAll(requests);
responses.forEach((res, i) => {
  if (res.getResponseCode() !== 200) Logger.log('[sync] fail id=' + userIds[i]);
});
```

---

## Rule #4: API key/token เก็บใน Script Properties — ห้าม hardcode ใน source

**Why:** source ถูก commit / share / clasp pull ไปเครื่องอื่น — token ที่ hardcode หลุดง่ายมาก (ดู `rules/security.md` Rule #7 และเกณฑ์เลือกที่เก็บใน `rules/properties-service.md`)

```javascript
function getLineToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_TOKEN ใน Script properties');
  return token;
}
```

---

## Rule #5: LINE Messaging API — pattern ที่ใช้ซ้ำได้

```javascript
function pushLineMessage_(to, messages) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getLineToken_() },
    payload: JSON.stringify({ to: to, messages: messages }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    // LINE คืน JSON บอกสาเหตุ เช่น invalid user id / message เกิน 5 ก้อน
    Logger.log('[LINE] push fail HTTP ' + code + ' ' + res.getContentText());
    return { ok: false, message: 'ส่งข้อความ LINE ไม่สำเร็จ' };
  }
  return { ok: true };
}

// Usage
pushLineMessage_(userId, [{ type: 'text', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' }]);
```

**Gotcha ที่เจอบ่อย:**
- `messages` ต้องเป็น array สูงสุด 5 ก้อน/ครั้ง
- ส่งหาหลายคนใช้ `/multicast` (ประหยัด quota กว่า loop push)
- LINE Notify ปิดบริการแล้ว (มี.ค. 2025) — งานใหม่ใช้ Messaging API เท่านั้น

---

## Rule #6: ระวัง quota — URL Fetch 20,000 ครั้ง/วัน (consumer)

| Account | URL Fetch calls/day |
|---|---|
| gmail.com | 20,000 |
| Google Workspace | 100,000 |

- งาน sync ที่ยิง API ต่อ 1 row → 5,000 rows ก็กิน 1 ใน 4 ของ quota แล้ว — รวม request (batch endpoint ของ API ปลายทาง) หรือ cache ผลไว้ (`rules/cache-service.md`)
- โดน quota แล้ว `fetch` จะ throw `Service invoked too many times` — จับ error นี้แล้วแจ้ง admin แทนที่จะปล่อยงานตายเงียบ

---

## Rule #7: timeout ของ UrlFetch คงที่ ~60 วินาที — ปรับไม่ได้

**Why:** GAS ไม่มี option ตั้ง timeout — API ปลายทางที่ช้ากว่านั้นจะ throw `Timeout` เสมอ

- endpoint ช้า (generate report ฝั่งปลายทาง) → เปลี่ยนเป็น pattern async: ยิงสั่งงาน → ปลายทาง callback มาที่ `doPost` ของเรา หรือ poll สถานะเป็นรอบ ๆ
- อย่าเอางาน fetch ช้าไปไว้ใน RPC ที่ user รอหน้าเว็บ — user เห็นหมุนค้าง 60 วิ แล้ว fail
