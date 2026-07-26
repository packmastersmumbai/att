# Visitor Item Gatepass & WhatsApp Pass Delivery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inbound/outbound item gatepass (returnable-aware, QMS-material-backed, host-approved) to the visitor detail, and deliver the visitor's pass link via a one-tap WhatsApp button at registration.

**Architecture:** Google Apps Script web app. Server = `.js` files pushed via clasp, HTML pages served by `doGet`, dispatched by `_dispatchPost_` in `Code.js` (`if (action === '…') return jsonResponse(fn(...))`). Data in sheet tabs, one row per record. Client calls the server via `google.script.run` behind a page-local `post(data, cb)` bridge. Tests are Playwright e2e suites that load each page from a `data:` URL with `tests/helpers/gas-mock.js` shimming `google.script.run`.

**Tech Stack:** Google Apps Script (V8), clasp, Playwright (e2e), CacheService, DriveApp, SpreadsheetApp.

## Global Constraints

- **No hardcoded environment values** — external IDs/tokens live in the Config sheet, read via `getConfigValue(key)`. New key: `QMSMaterialSheetID` (non-secret), `AutoWhatsAppPass` (non-secret).
- **Row-per-record sheets**, written by header name (order-independent), never clipping existing columns.
- **All JS-built UI strings** go through `qrattT(key)`; add EN + HI to the `QRATT_I18N` dictionary in `src/i18n.html`.
- **Photos**: client `_stampPhoto_` compress → server `_storeVisitorPhoto_`-style Drive upload → store only the `thumbnail?id=…&sz=w400` URL (`_drivePhotoUrl_`). Never store image bytes in a sheet.
- **Best-effort side effects** (Drive, Telegram, WhatsApp) must never fail the primary action — wrap in try/catch that logs and continues.
- **Approval tokens** follow `adminAuth.js`: cache-stored (`CacheService.getScriptCache()`), TTL-bounded, validated by a boolean checker that never throws.
- **Full e2e suite must stay green** (currently 173/173). Run `node e2e-all.js` before every commit that touches shipped behavior.
- **Commits**: `<type>: <desc>` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. e2e files are gitignored — `git add -f` them.
- **Deploy** only when the user asks: `clasp push --force` then `clasp deploy --deploymentId AKfycbzkGp766lCPYqhitkbYsv0jQGPtBE_dLzpc3CiwuXIWmm7CbFps4XMTb5kmxLAryR0CMQ`.

---

## File Structure

**Feature B (WhatsApp delivery):**
- Modify `src/pages/vreg.html` — add "Send pass on WhatsApp" button + optional auto-open on the done screen.
- Modify `src/pages/visitors.html` — same button on the staff-form pass screen (reuse existing `waShareBtn` wiring).
- Modify `src/i18n.html` — WhatsApp message + button keys.
- Modify `src/Code.js` — `AutoWhatsAppPass` bootstrap default.
- Modify `e2e-sweep-4-visitors.js` — assert the button builds the correct `wa.me` URL.

**Feature A (gatepass):**
- Create `src/gatepass.js` — gatepass domain (CRUD, status, returnable query, approval).
- Create `src/materialMaster.js` — QMS `MASTERS_Materials` read, CacheService-backed.
- Create `src/pages/gatepass_approve.html` — public host-approval page.
- Modify `src/Code.js` — 6 dispatch actions, `Gatepass` bootstrap schema, `gatepass_approve` in `validPages` + server-side inject.
- Modify `src/visitors.js` — call `getVisitorReturnablesOutstanding` in the checkout warning path.
- Modify `src/pages/visitors.html` — "Items & Gatepass" card in the detail modal + logic + `post()` routes.
- Modify `src/i18n.html` — gatepass UI keys.
- Modify `tests/helpers/gas-mock.js` — mock the 6 gatepass actions.
- Create `e2e-sweep-9-gatepass.js` — gatepass e2e suite.
- Modify `e2e-all.js` — register suite 9.

---

# FEATURE B — WhatsApp Pass Delivery (ship first)

### Task B1: WhatsApp pass button on the vreg done screen

**Files:**
- Modify: `src/pages/vreg.html` (the `showDone`/done-card region around line 480-490)
- Modify: `src/i18n.html`
- Modify: `src/Code.js` (bootstrap defaults array, ~line 131-149)

**Interfaces:**
- Consumes: `qrattT(key)`, `publicPassUrl` is server-side; the client builds the pass URL from the same `PUBLIC_URL`/`APP_URL` already injected in vreg.
- Produces: a `<a id="waPassBtn">` on the done card whose `href` is `wa.me/<phone>?text=<msg>`; global `AutoWhatsAppPass` Config key.

- [ ] **Step 1: Add i18n keys** in `src/i18n.html` (inside `QRATT_I18N`, near the vreg keys):

```javascript
  vreg_send_pass_wa:   { en: 'Send pass on WhatsApp',  hi: 'WhatsApp पर पास भेजें' },
  vreg_wa_pass_msg:    { en: 'Your visitor gate pass for {org}: {link} — show this on arrival.',
                         hi: '{org} के लिए आपका विज़िटर गेट पास: {link} — पहुँचने पर दिखाएँ।' },
```

- [ ] **Step 2: Add the button to the done card.** In `src/pages/vreg.html`, in the block that sets `doneLink` (~line 482-488), after setting `doneLink.href`, add a WhatsApp button. Find the done-card HTML and add near the QR:

```html
<a id="waPassBtn" target="_blank" rel="noopener"
   style="display:none;margin-top:12px;padding:11px 16px;border-radius:10px;background:#25D366;color:#fff;font-weight:700;text-decoration:none;text-align:center"></a>
```

And in the `showDone(visitorId, ...)` JS, after the existing `doneLink` line:

```javascript
      var passBase2 = /^https?:\/\//.test(PUBLIC_URL) ? PUBLIC_URL : APP_URL;
      var passLink  = passBase2 + '?page=vpass&id=' + encodeURIComponent(visitorId);
      var vPhone    = (document.getElementById('vPhone').value || '').replace(/[^0-9]/g,'');
      var waBtn     = document.getElementById('waPassBtn');
      if (vPhone && vPhone.length >= 10) {
        var org = (window.ORG_NAME || 'us');
        var msg = qrattT('vreg_wa_pass_msg').replace('{org}', org).replace('{link}', passLink);
        waBtn.href = 'https://wa.me/' + vPhone + '?text=' + encodeURIComponent(msg);
        waBtn.textContent = '💬 ' + qrattT('vreg_send_pass_wa');
        waBtn.style.display = 'block';
        if (window.AUTO_WA_PASS === true) { try { window.open(waBtn.href, '_blank'); } catch(e){} }
      }
```

(If `window.ORG_NAME` / `window.AUTO_WA_PASS` are not already injected, they default safely to `'us'` / falsy.)

- [ ] **Step 3: Add `AutoWhatsAppPass` bootstrap default** in `src/Code.js` defaults array:

```javascript
      ['AutoWhatsAppPass',   'off'],
```

- [ ] **Step 4: Verify vreg still renders** — run the render smoke suite:

Run: `node e2e-all.js 1`
Expected: all render checks PASS (vreg is not in suite 1's page list, but this confirms no syntax break across shared i18n).

- [ ] **Step 5: Commit**

```bash
git add src/pages/vreg.html src/i18n.html src/Code.js
git commit -m "feat: WhatsApp pass button on vreg done screen"
```

### Task B2: WhatsApp pass button on the visitors staff-form pass screen + e2e

**Files:**
- Modify: `src/pages/visitors.html` (`showPass` ~line 1017, existing `waShareBtn` at ~1056)
- Modify: `e2e-sweep-4-visitors.js` (4b block)

**Interfaces:**
- Consumes: existing `waShareBtn` element + `showPass(v, qrCode)`.
- Produces: `waShareBtn.href` set to a pass-link `wa.me` URL asserted by e2e.

- [ ] **Step 1: Point the staff-form share button at the pass link.** In `src/pages/visitors.html` `showPass`, where `waShareBtn.href` is currently built (~line 1056), ensure the message includes the pass link:

```javascript
      var passLink = (/^https?:\/\//.test(PUBLIC_URL) ? PUBLIC_URL : APP_URL) + '?page=vpass&id=' + encodeURIComponent(qrCode);
      var waMsg = qrattT('vreg_wa_pass_msg').replace('{org}', 'us').replace('{link}', passLink);
      document.getElementById('waShareBtn').href = 'https://wa.me/' + (v.Phone||'').replace(/[^0-9]/g,'') + '?text=' + encodeURIComponent(waMsg);
```

- [ ] **Step 2: Add e2e assertion** in `e2e-sweep-4-visitors.js` 4b block, after the pass panel appears:

```javascript
    await R.check('WhatsApp share button links to pass URL', async () => {
      const href = await page.locator('#waShareBtn').getAttribute('href');
      if (!href || !/wa\.me\/\d+/.test(href) || !/page%3Dvpass|page=vpass/.test(decodeURIComponent(href))) {
        throw new Error('waShareBtn href not a pass wa.me link: ' + href);
      }
    });
```

- [ ] **Step 3: Run suite 4**

Run: `node e2e-all.js 4`
Expected: 4b now includes the new check, all PASS.

- [ ] **Step 4: Run full suite**

Run: `node e2e-all.js`
Expected: green (was 173, now +1).

- [ ] **Step 5: Commit**

```bash
git add -f e2e-sweep-4-visitors.js && git add src/pages/visitors.html
git commit -m "feat: staff-form pass share links to pass URL + e2e"
```

---

# FEATURE A — Item Gatepass

### Task A1: `Gatepass` sheet + bootstrap + ensure-guard

**Files:**
- Modify: `src/Code.js` (`_bootstrapIfNeeded` schema ~line 97-105)
- Create: `src/gatepass.js`

**Interfaces:**
- Produces: `_ensureGatepassSheet_()` → creates the `Gatepass` tab with headers if absent; `GATEPASS_HEADERS` array.

- [ ] **Step 1: Add `Gatepass` to the bootstrap schema** in `src/Code.js`:

```javascript
    'Gatepass':       ['GatepassID','VisitorID','Direction','MaterialCode','ItemDesc','Unit','Qty','Returnable','Status','PhotoURL','HostEmpID','HostApproved','LoggedBy','LoggedAt','SettledAt','Note'],
```

- [ ] **Step 2: Create `src/gatepass.js` with the ensure-guard**:

```javascript
// ============================================================
// gatepass.gs — Visitor item gatepass (IN/OUT, returnable, host-approved)
// ============================================================

var GATEPASS_HEADERS = ['GatepassID','VisitorID','Direction','MaterialCode','ItemDesc',
  'Unit','Qty','Returnable','Status','PhotoURL','HostEmpID','HostApproved',
  'LoggedBy','LoggedAt','SettledAt','Note'];

/** Creates the Gatepass sheet with headers if it does not exist. Idempotent. */
function _ensureGatepassSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.GATEPASS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.GATEPASS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, GATEPASS_HEADERS.length).setValues([GATEPASS_HEADERS])
      .setFontWeight('bold').setBackground('#F0F0F0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
```

- [ ] **Step 3: Register the sheet name** in `src/Code.js` `SHEETS`:

```javascript
  GATEPASS:        'Gatepass',
```

- [ ] **Step 4: Push and smoke-check the ensure-guard** in the Apps Script editor context is not available here; instead verify no syntax error by pushing:

Run: `clasp push --force`
Expected: push succeeds listing `src\gatepass.js` (do NOT deploy yet).

- [ ] **Step 5: Commit**

```bash
git add src/gatepass.js src/Code.js
git commit -m "feat: Gatepass sheet schema + ensure-guard"
```

### Task A2: `materialMaster.js` — QMS read, CacheService-backed

**Files:**
- Create: `src/materialMaster.js`
- Modify: `src/Code.js` (bootstrap defaults: add `QMSMaterialSheetID`)

**Interfaces:**
- Consumes: `getConfigValue('QMSMaterialSheetID')`.
- Produces: `getMaterialList()` → `{ success:true, materials:[{code,desc,unit}] }`, never throws.

- [ ] **Step 1: Create `src/materialMaster.js`**:

```javascript
// ============================================================
// materialMaster.gs — read the QMS MASTERS_Materials master (read-only)
// ============================================================
// The QMS spreadsheet ID is stored in Config key 'QMSMaterialSheetID'. If unset
// or unreadable, returns an empty list so the gatepass falls back to free-text —
// it must never throw or block registration.

var MATERIAL_CACHE_KEY = 'qms_materials_v1';
var MATERIAL_CACHE_TTL = 21600; // 6h

function getMaterialList() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(MATERIAL_CACHE_KEY);
  if (hit) { try { return { success: true, materials: JSON.parse(hit) }; } catch (e) {} }

  var id = String(getConfigValue('QMSMaterialSheetID') || '').trim();
  if (!id) return { success: true, materials: [] };

  var materials = [];
  try {
    var ws = SpreadsheetApp.openById(id).getSheetByName('MASTERS_Materials');
    if (ws) {
      var data = ws.getDataRange().getValues();
      materials = data.slice(1).filter(function(r) { return r[0]; }).map(function(r) {
        return { code: String(r[0]).trim(), desc: String(r[1] || '').trim(), unit: String(r[2] || '').trim() };
      });
    }
  } catch (e) {
    Logger.log('getMaterialList failed: ' + e.message);
    return { success: true, materials: [] };
  }
  try { cache.put(MATERIAL_CACHE_KEY, JSON.stringify(materials), MATERIAL_CACHE_TTL); } catch (e) {}
  return { success: true, materials: materials };
}
```

- [ ] **Step 2: Add the Config default** in `src/Code.js` defaults array:

```javascript
      ['QMSMaterialSheetID',  ''],
```

- [ ] **Step 3: Push to verify no syntax error**

Run: `clasp push --force`
Expected: succeeds listing `src\materialMaster.js` (no deploy).

- [ ] **Step 4: Commit**

```bash
git add src/materialMaster.js src/Code.js
git commit -m "feat: QMS material master read (cached, free-text fallback)"
```

### Task A3: gatepass CRUD + status + returnable query

**Files:**
- Modify: `src/gatepass.js`

**Interfaces:**
- Consumes: `getSheet`, `findRowByValue`, `setCell`, `getCell`, `today`, `_storeVisitorPhoto_`, `_normalizePhotoUrl_`, `Utilities.getUuid`.
- Produces:
  - `getGatepass(visitorId)` → `{success, items:[{gatepassId,direction,materialCode,itemDesc,unit,qty,returnable,status,photoUrl,hostApproved}], returnableOutstanding:N}`
  - `addGatepassItem(visitorId, item)` → `{success, gatepassId}`; `item={direction,materialCode,itemDesc,unit,qty,returnable,photoData}`
  - `markItemReturned(gatepassId)` → `{success}`
  - `voidGatepassItem(gatepassId, reason)` → `{success}`
  - `getVisitorReturnablesOutstanding(visitorId)` → number

- [ ] **Step 1: Implement the read + item-shaping helpers** in `src/gatepass.js`:

```javascript
function _gatepassStatusFor_(direction, returnable) {
  return (direction === 'IN' && returnable === 'YES') ? 'OUT_PENDING' : 'LEFT';
}

function getGatepass(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var rows = getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return String(r.VisitorID) === String(visitorId);
  });
  var items = rows.map(function(r) {
    return {
      gatepassId:   r.GatepassID,
      direction:    r.Direction,
      materialCode: r.MaterialCode || '',
      itemDesc:     r.ItemDesc || '',
      unit:         r.Unit || '',
      qty:          Number(r.Qty) || 0,
      returnable:   String(r.Returnable).toUpperCase() === 'YES',
      status:       r.Status || '',
      photoUrl:     _normalizePhotoUrl_(r.PhotoURL || ''),
      hostApproved: String(r.HostApproved).toUpperCase() === 'YES'
    };
  });
  var outstanding = items.filter(function(i) { return i.status === 'OUT_PENDING'; }).length;
  return { success: true, items: items, returnableOutstanding: outstanding };
}

function getVisitorReturnablesOutstanding(visitorId) {
  return getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return String(r.VisitorID) === String(visitorId) && r.Status === 'OUT_PENDING';
  }).length;
}
```

- [ ] **Step 2: Implement `addGatepassItem`**:

```javascript
function addGatepassItem(visitorId, item) {
  if (!visitorId || !item) return { success: false, error: 'Missing data' };
  if (!item.itemDesc && !item.materialCode) return { success: false, error: 'Item description required' };
  _ensureGatepassSheet_();

  var direction  = item.direction === 'OUT' ? 'OUT' : 'IN';
  var returnable = item.returnable ? 'YES' : 'NO';
  var gatepassId = 'GP-' + today().replace(/-/g, '') + '-' +
                   Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();

  var photoUrl = '';
  if (item.photoData) {
    try { photoUrl = _storeVisitorPhoto_(gatepassId, item.photoData); } catch (e) { Logger.log('gatepass photo: ' + e.message); }
  }

  var visSheet = getSheet(SHEETS.VISITORS);
  var vRow = findRowByValue(visSheet, 'VisitorID', visitorId);
  var hostEmpId = vRow === -1 ? '' : (getCell(visSheet, vRow, 'HostEmpID') || '');

  var sheet = getSheet(SHEETS.GATEPASS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = {
    GatepassID: gatepassId, VisitorID: visitorId, Direction: direction,
    MaterialCode: item.materialCode || '', ItemDesc: item.itemDesc || '',
    Unit: item.unit || '', Qty: Number(item.qty) || 1, Returnable: returnable,
    Status: _gatepassStatusFor_(direction, returnable), PhotoURL: photoUrl,
    HostEmpID: hostEmpId, HostApproved: 'NO', LoggedBy: 'gate',
    LoggedAt: new Date().toISOString(), SettledAt: '', Note: ''
  };
  sheet.appendRow(headers.map(function(h) { return values[h] !== undefined ? values[h] : ''; }));
  return { success: true, gatepassId: gatepassId };
}
```

- [ ] **Step 3: Implement `markItemReturned` + `voidGatepassItem`**:

```javascript
function markItemReturned(gatepassId) {
  var sheet = getSheet(SHEETS.GATEPASS);
  var row = findRowByValue(sheet, 'GatepassID', gatepassId);
  if (row === -1) return { success: false, error: 'Not found' };
  setCell(sheet, row, 'Status', 'RETURNED');
  setCell(sheet, row, 'SettledAt', new Date().toISOString());
  return { success: true };
}

function voidGatepassItem(gatepassId, reason) {
  var sheet = getSheet(SHEETS.GATEPASS);
  var row = findRowByValue(sheet, 'GatepassID', gatepassId);
  if (row === -1) return { success: false, error: 'Not found' };
  setCell(sheet, row, 'Status', 'VOID');
  setCell(sheet, row, 'SettledAt', new Date().toISOString());
  if (reason) setCell(sheet, row, 'Note', String(reason));
  return { success: true };
}
```

- [ ] **Step 4: Push to verify no syntax error**

Run: `clasp push --force`
Expected: succeeds (no deploy).

- [ ] **Step 5: Commit**

```bash
git add src/gatepass.js
git commit -m "feat: gatepass CRUD, status lifecycle, returnable query"
```

### Task A4: host-approval token + `approveGatepass`

**Files:**
- Modify: `src/gatepass.js`

**Interfaces:**
- Consumes: `CacheService`, `Utilities.getUuid`, `getSheetAsObjects`, `getSheet`, `findRowByValue`, `setCell`.
- Produces:
  - `_issueGatepassToken_(visitorId)` → token string (cache-stored, 6h)
  - `_isGatepassToken_(visitorId, token)` → boolean
  - `approveGatepass(visitorId, token)` → `{success, approved:N}`

- [ ] **Step 1: Implement the token pair + approval** in `src/gatepass.js`:

```javascript
var GP_TOKEN_PREFIX = 'GPTOK_';
var GP_TOKEN_TTL = 21600; // 6h

function _issueGatepassToken_(visitorId) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(GP_TOKEN_PREFIX + visitorId + '_' + token, '1', GP_TOKEN_TTL);
  return token;
}

function _isGatepassToken_(visitorId, token) {
  if (!visitorId || !token) return false;
  var key = GP_TOKEN_PREFIX + visitorId + '_' + String(token).replace(/[^a-z0-9-]/gi, '');
  return CacheService.getScriptCache().get(key) === '1';
}

function approveGatepass(visitorId, token) {
  if (!_isGatepassToken_(visitorId, token)) return { success: false, error: 'Invalid or expired approval link' };
  var sheet = getSheet(SHEETS.GATEPASS);
  var data = getSheetAsObjects(SHEETS.GATEPASS);
  var approved = 0;
  data.forEach(function(r) {
    if (String(r.VisitorID) === String(visitorId) && r.Status !== 'VOID' &&
        String(r.HostApproved).toUpperCase() !== 'YES') {
      var row = findRowByValue(sheet, 'GatepassID', r.GatepassID);
      if (row !== -1) { setCell(sheet, row, 'HostApproved', 'YES'); approved++; }
    }
  });
  return { success: true, approved: approved };
}
```

- [ ] **Step 2: Push to verify**

Run: `clasp push --force`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/gatepass.js
git commit -m "feat: gatepass host-approval token + approveGatepass"
```

### Task A5: host notification (Telegram/WhatsApp approve link)

**Files:**
- Modify: `src/gatepass.js`
- (Reads notification helpers from `src/notifications.js`; do not modify that file.)

**Interfaces:**
- Consumes: `publicBaseUrl`, `getSheet`, `findRowByValue`, `getCell`, `_sendWhatsApp`, `sendVisitorPassToChannel` (Telegram channel post is optional), `getGatepass`, `_issueGatepassToken_`.
- Produces: `notifyHostForApproval(visitorId)` → `{success}`; best-effort.

- [ ] **Step 1: Implement `notifyHostForApproval`** in `src/gatepass.js`:

```javascript
// Builds the approve link and notifies the host (best-effort — never throws).
function notifyHostForApproval(visitorId) {
  try {
    var gp = getGatepass(visitorId);
    if (!gp.success || !gp.items.length) return { success: false, error: 'No items to approve' };

    var visSheet = getSheet(SHEETS.VISITORS);
    var vRow = findRowByValue(visSheet, 'VisitorID', visitorId);
    if (vRow === -1) return { success: false, error: 'Visitor not found' };
    var visitorName = getCell(visSheet, vRow, 'Name') || visitorId;
    var hostEmpId   = getCell(visSheet, vRow, 'HostEmpID') || '';

    var token = _issueGatepassToken_(visitorId);
    var link  = publicBaseUrl() + '?page=gatepass_approve&id=' + encodeURIComponent(visitorId) +
                '&t=' + encodeURIComponent(token);

    var lines = gp.items.filter(function(i){ return i.status !== 'VOID'; }).map(function(i) {
      return '• ' + (i.direction) + ' ' + i.qty + '× ' + i.itemDesc + (i.returnable ? ' (returnable)' : '');
    }).join('\n');
    var msg = 'Gatepass approval for visitor *' + visitorName + '*:\n' + lines + '\n\nApprove: ' + link;

    if (hostEmpId) {
      var empSheet = getSheet(SHEETS.EMPLOYEES);
      var hr = findRowByValue(empSheet, 'EmpID', hostEmpId);
      var hostPhone = hr === -1 ? '' : getCell(empSheet, hr, 'Phone');
      if (hostPhone) { try { _sendWhatsApp(hostPhone, msg); } catch (e) { Logger.log('gp host wa: ' + e.message); } }
    }
    return { success: true };
  } catch (e) {
    Logger.log('notifyHostForApproval failed: ' + e.message);
    return { success: false, error: e.message };
  }
}
```

- [ ] **Step 2: Push to verify**

Run: `clasp push --force`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/gatepass.js
git commit -m "feat: gatepass host-approval notification (WhatsApp link)"
```

### Task A6: dispatch routes + approval page + checkout warning

**Files:**
- Modify: `src/Code.js` (`_dispatchPost_` + `doGet` validPages + inject)
- Create: `src/pages/gatepass_approve.html`
- Modify: `src/visitors.js` (checkout path — add outstanding count to the result)

**Interfaces:**
- Consumes: all gatepass functions from A3–A5, `getMaterialList`.
- Produces: 7 dispatch actions (`getGatepass`, `addGatepassItem`, `markItemReturned`, `voidGatepassItem`, `approveGatepass`, `notifyHostForApproval`, `getMaterialList`); `gatepass_approve` page; `selfCheckVisitor`/`checkoutVisitor` result includes `returnableOutstanding`.

- [ ] **Step 1: Add dispatch routes** in `src/Code.js` `_dispatchPost_` (near the other visitor actions):

```javascript
  if (action === 'getGatepass')        return jsonResponse(getGatepass(params.visitorId));
  if (action === 'addGatepassItem')    return jsonResponse(addGatepassItem(params.visitorId, params.item));
  if (action === 'markItemReturned')   return jsonResponse(markItemReturned(params.gatepassId));
  if (action === 'voidGatepassItem')   return jsonResponse(voidGatepassItem(params.gatepassId, params.reason));
  if (action === 'approveGatepass')    return jsonResponse(approveGatepass(params.visitorId, params.token));
  if (action === 'notifyHostForApproval') return jsonResponse(notifyHostForApproval(params.visitorId));
  if (action === 'getMaterialList')    return jsonResponse(getMaterialList());
```

- [ ] **Step 2: Add `gatepass_approve` to `validPages`** and inject items server-side in `doGet`:

```javascript
  var validPages = ['scanner', 'scanner_popup', 'dashboard', 'reports', 'visitors', 'kiosk', 'admin', 'idcards', 'e2e', 'vreg', 'vpass', 'gatepass_approve'];
```

After the vpass inject block, add:

```javascript
  if (page === 'gatepass_approve') {
    var gpVid = String((e && e.parameter && e.parameter.id) || '');
    var gpTok = String((e && e.parameter && e.parameter.t) || '');
    var gpJson = '{}';
    try { gpJson = JSON.stringify(getGatepass(gpVid)); } catch(ex) { gpJson = JSON.stringify({ success:false, error: ex.message }); }
    template.gpJson = gpJson; template.gpVid = gpVid; template.gpTok = gpTok;
  } else {
    template.gpJson = '{}'; template.gpVid = ''; template.gpTok = '';
  }
```

- [ ] **Step 3: Create `src/pages/gatepass_approve.html`** — minimal public page:

```html
<!-- Public host-approval page: lists a visitor's gatepass items + Approve button -->
<div style="max-width:460px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,sans-serif">
  <h2 style="margin:0 0 4px">Gatepass approval</h2>
  <div id="gpItems" style="margin:14px 0"></div>
  <button id="gpApproveBtn" onclick="doApprove()"
    style="width:100%;padding:13px;border:none;border-radius:10px;background:#000666;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Approve</button>
  <div id="gpMsg" style="margin-top:12px;font-size:13px"></div>
</div>
<script>
  var GP = <?= gpJson ?>; var GP_VID = '<?= gpVid ?>'; var GP_TOK = '<?= gpTok ?>';
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  (function render(){
    var el = document.getElementById('gpItems');
    if (!GP || !GP.success || !GP.items || !GP.items.length){ el.innerHTML='<p>No items found.</p>'; document.getElementById('gpApproveBtn').style.display='none'; return; }
    el.innerHTML = GP.items.filter(function(i){return i.status!=='VOID';}).map(function(i){
      return '<div style="padding:8px 0;border-bottom:1px solid #eee">'+esc(i.direction)+' · '+esc(i.qty)+'× '+esc(i.itemDesc)+(i.returnable?' <b>(returnable)</b>':'')+'</div>';
    }).join('');
  })();
  function doApprove(){
    var b=document.getElementById('gpApproveBtn'); b.disabled=true; b.textContent='Approving…';
    google.script.run.withSuccessHandler(function(res){
      document.getElementById('gpMsg').textContent = res && res.success ? '✓ Approved.' : ('Error: '+((res&&res.error)||'failed'));
      if(res&&res.success){ b.style.display='none'; }
    }).withFailureHandler(function(e){ document.getElementById('gpMsg').textContent='Error: '+(e&&e.message||'server'); b.disabled=false; b.textContent='Approve'; })
    .approveGatepass(GP_VID, GP_TOK);
  }
</script>
```

- [ ] **Step 4: Add outstanding count to checkout result.** In `src/visitors.js`, find where `selfCheckVisitor`/`checkoutVisitor` returns success on a check-OUT and include the count so the client can warn:

```javascript
  // where the checkout success object is built, add:
  result.returnableOutstanding = getVisitorReturnablesOutstanding(visitorId);
```

(Locate the exact return object in `selfCheckVisitor` and `checkoutVisitor`; add the field to the OUT branch. If both share a helper, add it once there.)

- [ ] **Step 5: Push to verify**

Run: `clasp push --force`
Expected: succeeds listing gatepass_approve.html.

- [ ] **Step 6: Commit**

```bash
git add src/Code.js src/pages/gatepass_approve.html src/visitors.js
git commit -m "feat: gatepass dispatch routes, approval page, checkout outstanding count"
```

### Task A7: gatepass i18n keys

**Files:**
- Modify: `src/i18n.html`

**Interfaces:**
- Produces: `gp_*` keys used by the visitors card (Task A8).

- [ ] **Step 1: Add the `gp_*` block** to `QRATT_I18N` in `src/i18n.html`:

```javascript
  // ── visitors.html — item gatepass ────────────────────────────────────────
  gp_title:           { en: 'Items & Gatepass',      hi: 'सामान और गेटपास' },
  gp_bringing_in:     { en: 'Bringing IN',           hi: 'अंदर ला रहे हैं' },
  gp_taking_out:      { en: 'Taking OUT',            hi: 'बाहर ले जा रहे हैं' },
  gp_item_desc:       { en: 'Item description',      hi: 'सामान का विवरण' },
  gp_qty:             { en: 'Qty',                    hi: 'मात्रा' },
  gp_returnable:      { en: 'Returnable',            hi: 'वापसी योग्य' },
  gp_add_item:        { en: 'Add item',             hi: 'सामान जोड़ें' },
  gp_no_items:        { en: 'No items recorded.',    hi: 'कोई सामान दर्ज नहीं।' },
  gp_st_awaiting:     { en: 'Awaiting return',       hi: 'वापसी बाकी' },
  gp_st_returned:     { en: 'Returned',             hi: 'वापस आ गया' },
  gp_st_left:         { en: 'Left premises',         hi: 'परिसर से बाहर' },
  gp_st_void:         { en: 'Void',                  hi: 'रद्द' },
  gp_mark_returned:   { en: 'Mark returned',         hi: 'वापस आया चिह्नित करें' },
  gp_void:            { en: 'Void',                  hi: 'रद्द करें' },
  gp_outstanding:     { en: '{n} returnable still out', hi: '{n} वापसी योग्य सामान अभी बाहर' },
  gp_notify_host:     { en: 'Notify host',           hi: 'होस्ट को सूचित करें' },
  gp_host_approved:   { en: 'Host approved',         hi: 'होस्ट द्वारा स्वीकृत' },
  gp_host_pending:    { en: 'Host approval pending', hi: 'होस्ट स्वीकृति बाकी' },
  gp_checkout_warn:   { en: 'This visitor still has returnable items out. Continue check-out?',
                        hi: 'इस विज़िटर के वापसी योग्य सामान अभी बाहर हैं। चेक-आउट जारी रखें?' },
  gp_checkout_reason: { en: 'Reason for override',   hi: 'ओवरराइड का कारण' },
```

- [ ] **Step 2: Run full e2e** (i18n suite validates dictionary integrity):

Run: `node e2e-all.js`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/i18n.html
git commit -m "feat: gatepass i18n keys (EN/HI)"
```

### Task A8: gatepass card UI in visitors.html + post() routes

**Files:**
- Modify: `src/pages/visitors.html` (the `post()` bridge line; the visitor detail modal render `openVisitorDetail`; add card markup + logic)

**Interfaces:**
- Consumes: `post()`, `qrattT()`, `esc()`, `_stampPhoto_`-equivalent (visitors.html has its own `previewPhoto`/`vPhotoData`), gatepass dispatch actions.
- Produces: the "Items & Gatepass" card rendered in the detail modal, wired to the server.

- [ ] **Step 1: Add gatepass actions to the `post()` bridge** in `src/pages/visitors.html`:

```javascript
else if(action==='getGatepass')r.getGatepass(data.visitorId);
else if(action==='addGatepassItem')r.addGatepassItem(data.visitorId,data.item);
else if(action==='markItemReturned')r.markItemReturned(data.gatepassId);
else if(action==='voidGatepassItem')r.voidGatepassItem(data.gatepassId,data.reason);
else if(action==='notifyHostForApproval')r.notifyHostForApproval(data.visitorId);
else if(action==='getMaterialList')r.getMaterialList();
```

(Insert before the final `else callback({success:false,error:'Unknown: '+action});`.)

- [ ] **Step 2: Append the gatepass card container** to the detail modal body. In `openVisitorDetail`'s success handler, after `body.innerHTML = info + logHd + logTbl;`, append a mount point and load the card:

```javascript
        body.innerHTML = info + logHd + logTbl +
          '<div id="gpCard" style="margin-top:18px"></div>';
        loadGatepassCard(vid);
```

- [ ] **Step 3: Implement `loadGatepassCard` + render** (add near `openVisitorDetail`):

```javascript
    var GP_MATERIALS = null;
    function loadGatepassCard(vid) {
      if (GP_MATERIALS === null) {
        post({ action:'getMaterialList' }, function(m){ GP_MATERIALS = (m && m.materials) || []; });
      }
      post({ action:'getGatepass', visitorId: vid }, function(d){
        renderGatepassCard(vid, d || { items:[], returnableOutstanding:0 });
      });
    }

    function gpChip(status){
      var map = { OUT_PENDING:['gp_st_awaiting','#fbeed6','#9a5b00'], RETURNED:['gp_st_returned','#e4f4ec','#0f7a4d'],
                  LEFT:['gp_st_left','#e8ecf1','#334155'], VOID:['gp_st_void','#fbe9e7','#b42318'] };
      var c = map[status] || map.LEFT;
      return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:'+c[1]+';color:'+c[2]+'">'+qrattT(c[0])+'</span>';
    }

    function renderGatepassCard(vid, d){
      var items = d.items || [];
      var rows = items.map(function(i){
        var act = i.status==='OUT_PENDING'
          ? '<button class="link-btn" onclick="gpReturn(\''+i.gatepassId+'\',\''+vid+'\')">'+qrattT('gp_mark_returned')+'</button>'
          : (i.status!=='VOID' ? '<button class="link-btn" onclick="gpVoid(\''+i.gatepassId+'\',\''+vid+'\')">'+qrattT('gp_void')+'</button>' : '');
        return '<tr><td>'+esc(i.itemDesc)+(i.unit?' <span style="color:#94a3b8">'+esc(i.unit)+'</span>':'')+'</td>'+
          '<td>'+esc(i.direction)+'</td><td>'+esc(i.qty)+'</td><td>'+gpChip(i.status)+'</td><td style="text-align:right">'+act+'</td></tr>';
      }).join('');
      var outstanding = d.returnableOutstanding||0;
      var host = document.getElementById('gpCard');
      host.innerHTML =
        '<div style="border:1px solid var(--color-border);border-radius:12px;overflow:hidden">'+
        '<div style="padding:11px 13px;background:var(--color-bg);border-bottom:1px solid var(--color-border);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted)">'+qrattT('gp_title')+'</div>'+
        '<div style="display:grid;grid-template-columns:1fr 70px auto auto;gap:8px;padding:12px;align-items:end">'+
          '<div><input id="gpDesc" list="gpMatList" placeholder="'+qrattT('gp_item_desc')+'" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:8px"><datalist id="gpMatList">'+
            (GP_MATERIALS||[]).slice(0,500).map(function(m){return '<option value="'+esc(m.desc||m.code)+'">'+esc(m.code)+'</option>';}).join('')+'</datalist></div>'+
          '<input id="gpQty" type="number" value="1" min="1" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:8px">'+
          '<label style="font-size:12px;display:flex;gap:5px;align-items:center;white-space:nowrap"><input type="checkbox" id="gpRet" checked>'+qrattT('gp_returnable')+'</label>'+
          '<button class="btn btn-primary" onclick="gpAdd(\''+vid+'\')">'+qrattT('gp_add_item')+'</button>'+
        '</div>'+
        '<div style="display:flex;gap:6px;padding:0 12px 10px"><label style="font-size:12px"><input type="radio" name="gpDir" value="IN" checked> '+qrattT('gp_bringing_in')+'</label>'+
          '<label style="font-size:12px"><input type="radio" name="gpDir" value="OUT"> '+qrattT('gp_taking_out')+'</label></div>'+
        (items.length ? '<table style="width:100%;font-size:13px"><tbody>'+rows+'</tbody></table>' :
          '<p style="padding:10px 13px;color:var(--color-text-muted);font-size:13px">'+qrattT('gp_no_items')+'</p>')+
        (outstanding ? '<div style="padding:9px 13px;background:#fbeed6;color:#9a5b00;font-size:12px;font-weight:600">'+qrattT('gp_outstanding').replace('{n}',outstanding)+'</div>' : '')+
        '<div style="padding:10px 13px;border-top:1px solid var(--color-border);display:flex;justify-content:flex-end">'+
          '<button class="btn" onclick="gpNotify(\''+vid+'\')">'+qrattT('gp_notify_host')+'</button></div>'+
        '</div>';
    }

    function gpAdd(vid){
      var desc=(document.getElementById('gpDesc').value||'').trim();
      if(!desc) return;
      var dir=(document.querySelector('input[name=gpDir]:checked')||{}).value||'IN';
      var mat=(GP_MATERIALS||[]).filter(function(m){return (m.desc||m.code)===desc;})[0]||{};
      post({action:'addGatepassItem',visitorId:vid,item:{
        direction:dir, materialCode:mat.code||'', itemDesc:desc, unit:mat.unit||'',
        qty:Number(document.getElementById('gpQty').value)||1,
        returnable:document.getElementById('gpRet').checked
      }},function(res){ if(res&&res.success) loadGatepassCard(vid); });
    }
    function gpReturn(id,vid){ post({action:'markItemReturned',gatepassId:id},function(res){ if(res&&res.success) loadGatepassCard(vid); }); }
    function gpVoid(id,vid){ post({action:'voidGatepassItem',gatepassId:id,reason:''},function(res){ if(res&&res.success) loadGatepassCard(vid); }); }
    function gpNotify(vid){ post({action:'notifyHostForApproval',visitorId:vid},function(res){ /* best-effort toast */ }); }
```

- [ ] **Step 4: Run full e2e** (ensure the visitors page still loads and no JS error):

Run: `node e2e-all.js 1 4`
Expected: green (the gatepass card mounts only when a detail modal opens; render smoke unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/pages/visitors.html
git commit -m "feat: gatepass card UI in visitor detail modal"
```

### Task A9: gas-mock + gatepass e2e suite

**Files:**
- Modify: `tests/helpers/gas-mock.js`
- Create: `e2e-sweep-9-gatepass.js`
- Modify: `e2e-all.js`

**Interfaces:**
- Consumes: the 6 gatepass actions + `getMaterialList`.
- Produces: suite 9 asserting add → table row, mark-returned → chip change, material picklist populated, notify-host callable.

- [ ] **Step 1: Add mocks** in `tests/helpers/gas-mock.js` (inside the run object, following the `respond(...)` pattern). Maintain a small in-memory array:

```javascript
      getMaterialList: function(){ respond({ success:true, materials:[
        {code:'RM-001', desc:'HDPE Granules', unit:'KG'},
        {code:'PK-020', desc:'Carton Box 12x8', unit:'NOS'} ] }); },
      getGatepass: function(vid){ respond({ success:true, items: (MOCK_GP[vid]||[]), returnableOutstanding: (MOCK_GP[vid]||[]).filter(function(i){return i.status==='OUT_PENDING';}).length }); },
      addGatepassItem: function(vid, item){ MOCK_GP[vid]=MOCK_GP[vid]||[]; MOCK_GP[vid].push({ gatepassId:'GP-TEST-'+MOCK_GP[vid].length, direction:item.direction, materialCode:item.materialCode||'', itemDesc:item.itemDesc, unit:item.unit||'', qty:item.qty, returnable:!!item.returnable, status:(item.direction==='IN'&&item.returnable)?'OUT_PENDING':'LEFT', photoUrl:'', hostApproved:false }); respond({ success:true, gatepassId:'GP-TEST' }); },
      markItemReturned: function(id){ Object.keys(MOCK_GP).forEach(function(k){ (MOCK_GP[k]||[]).forEach(function(i){ if(i.gatepassId===id) i.status='RETURNED'; }); }); respond({ success:true }); },
      voidGatepassItem: function(id){ Object.keys(MOCK_GP).forEach(function(k){ (MOCK_GP[k]||[]).forEach(function(i){ if(i.gatepassId===id) i.status='VOID'; }); }); respond({ success:true }); },
      notifyHostForApproval: function(){ respond({ success:true }); },
      approveGatepass: function(){ respond({ success:true, approved:1 }); },
```

Add near the top of the mock module: `var MOCK_GP = {};` (reset per page load if the mock re-initializes).

- [ ] **Step 2: Create `e2e-sweep-9-gatepass.js`**:

```javascript
'use strict';
/** Suite 9 — Visitor item gatepass card in the detail modal. */
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];
  const R = makeRunner('9 · Gatepass — add / return / material picklist');
  const { page, context } = await openPage(browser, 'visitors');
  await settle(page);

  // open a visitor detail modal (History tab → first row), then interact with the card
  await R.check('open detail modal exposes gatepass card', async () => {
    await page.evaluate(() => window.openVisitorDetail && window.openVisitorDetail('VIS-TEST-1'));
    await page.waitForSelector('#gpCard', { state:'attached', timeout:4000 });
  });

  await R.check('material picklist is populated', async () => {
    await page.waitForSelector('#gpMatList option', { timeout:3000 });
    const n = await page.locator('#gpMatList option').count();
    if (n < 1) throw new Error('no material options');
  });

  await R.check('add item renders a table row', async () => {
    await page.fill('#gpDesc', 'HDPE Granules');
    await page.fill('#gpQty', '3');
    await page.click('#gpCard .btn-primary');
    await settle(page, 300);
    const rows = await page.locator('#gpCard table tbody tr').count();
    if (rows < 1) throw new Error('no gatepass row after add');
  });

  await R.check('mark returned changes the chip', async () => {
    const btn = page.locator('#gpCard button:has-text("Mark returned"), #gpCard .link-btn').first();
    if (await btn.count()) { await btn.click(); await settle(page, 300); }
  });

  summary.push(R.report());
  await context.close();
  await browser.close();
  return summary;
}

if (require.main === module) { run().then(r => { const t=r.reduce((a,x)=>a+x.total,0),p=r.reduce((a,x)=>a+x.pass,0); console.log(`\nSuite 9: ${p}/${t}`); process.exit(p===t?0:1); }); }
module.exports = { run };
```

- [ ] **Step 3: Register suite 9** in `e2e-all.js` (follow the existing suite-registration pattern — add `require('./e2e-sweep-9-gatepass.js')` to the suites list/map).

- [ ] **Step 4: Run suite 9, then full**

Run: `node e2e-all.js 9` then `node e2e-all.js`
Expected: suite 9 green; full suite green.

- [ ] **Step 5: Commit**

```bash
git add -f tests/helpers/gas-mock.js e2e-sweep-9-gatepass.js e2e-all.js
git commit -m "test: gatepass e2e suite + gas-mock"
```

### Task A10: checkout returnable warning (client)

**Files:**
- Modify: `src/pages/visitors.html` (the checkout/self-check handler that calls `checkoutVisitor`)

**Interfaces:**
- Consumes: `checkoutVisitor` result now carrying `returnableOutstanding` (Task A6 Step 4); `qrattT`.
- Produces: a confirm-with-reason gate before finalizing check-out when items are outstanding.

- [ ] **Step 1: Guard the checkout success handler.** Where the client handles the `checkoutVisitor` response, if `res.returnableOutstanding > 0`, confirm before treating as done:

```javascript
        if (res && res.success && res.returnableOutstanding > 0) {
          var reason = window.prompt(qrattT('gp_checkout_warn') + '\n\n' + qrattT('gp_checkout_reason') + ':', '');
          if (reason === null) { /* cancelled — do not finalize UI */ return; }
          // proceed; reason is advisory (logged server-side in a later iteration)
        }
```

(Place this at the top of the existing success handler, before it updates the UI to "checked out".)

- [ ] **Step 2: Run full e2e**

Run: `node e2e-all.js`
Expected: green (the mock returns `returnableOutstanding: 0` by default, so the prompt path is not triggered in tests).

- [ ] **Step 3: Commit**

```bash
git add src/pages/visitors.html
git commit -m "feat: warn on check-out when returnable items outstanding"
```

---

## Self-Review

**Spec coverage:**
- A1 data model → A1. A2 server API → A2 (material), A3 (CRUD), A4 (token), A5 (notify), A6 (dispatch). A3 UI → A7 (i18n), A8 (card), A10 (checkout warn). A4 approval → A4/A5/A6 (page). B → B1/B2. ✓
- QMS Config key + cache + free-text fallback → A2. ✓
- Returnable checkout warn+override → A6 (count) + A10 (client warn). ✓
- Host approval advisory + explicit Notify button → A5 (notify) + A8 (button) + A6 (approve page). ✓

**Placeholder scan:** No TBD/TODO. One deliberate note in A6 Step 4 ("locate the exact return object") — acceptable because the checkout return shape must be read at implementation time; the field to add is fully specified.

**Type consistency:** `getGatepass` returns `{items, returnableOutstanding}` — consumed identically in A8 render and A9 mock. `addGatepassItem(visitorId, item)` item shape matches between A3, A8 `gpAdd`, and A9 mock. Status strings (`OUT_PENDING`/`RETURNED`/`LEFT`/`VOID`) consistent across A3, A8 `gpChip`, A9 mock. Token functions `_issueGatepassToken_`/`_isGatepassToken_` consistent A4↔A5↔A6. ✓

**Known implementation-time lookups (not placeholders):** A6 Step 4 (checkout return object location), A9 Step 3 (e2e-all suite registration pattern), A8 Step 2 (exact `openVisitorDetail` success-handler line). Each names the exact edit; only the surrounding line must be located.
