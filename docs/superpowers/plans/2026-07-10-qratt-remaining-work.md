# PackMastersQrAtt — Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the six outstanding features/fixes on the QR-attendance app — bilingual (English / simple Hindi) toggle, India holidays in Config, Chrome-mobile stability, performance polish, iframe-portal restore — and bring the e2e suite back in sync with the current server contract.

**Architecture:** Google Apps Script web app. `doGet` serves each page as a standalone HTML document via `HtmlService.createTemplateFromFile('pages/' + page)`; `doPost` is a JSON REST surface; pages also call server functions directly through `google.script.run`. The GitHub Pages `index.html` is a launcher in front of the GAS `/exec` URL. e2e runs Playwright against local page HTML with a mocked `google.script.run` (`tests/helpers/gas-mock.js`), NOT against the live deployment.

**Tech Stack:** Google Apps Script (V8 `.gs`/`.js`, `.html` templates), `clasp` for push/deploy, Playwright for e2e, vanilla JS on the client (no framework, no build step).

## Global Constraints

- Server JS is Apps Script V8: `var`/`function` style, no ES modules, no `import`/`export`. Match the existing code.
- No client-side build step or bundler. Pages are hand-written HTML with inline `<script>`. No npm packages ship to the client.
- Every page is a **standalone** HTML document (`<html><head>…`). `src/shared/*.html` and `src/pages/shell.html` are legacy and NOT served — do not rely on them; do not delete them in this plan.
- Free-tier GAS quota is 90 min script-runtime/day shared across the account. Any change that adds sheet reads on a polled path must be justified against this.
- The web app runs as the owner with `ANYONE_ANONYMOUS` access. Any new server function that mutates data MUST call `_requireAdmin_(token)` as its first statement (see `src/adminAuth.js`).
- Secrets (`AdminPIN`, `TelegramBotToken`, `TelegramChatID`, `CallMeBotKey`) are redacted from `getConfig` for non-admins and are listed in `CONFIG_SECRET_KEYS` in `src/adminAuth.js`.
- Deploy command (single live deployment): `clasp push --force` then `clasp deploy --deploymentId AKfycbzkGp766lCPYqhitkbYsv0jQGPtBE_dLzpc3CiwuXIWmm7CbFps4XMTb5kmxLAryR0CMQ`.
- e2e command: `node e2e-all.js` (must stay at 149/149 or higher; adding tests raises the count).
- Windows shell is Git Bash; run Python as `PYTHONUTF8=1 python script.py`.
- Commit style: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf). One phase = one or more commits; never mix phases in a commit.

---

## Phase ordering and rationale

Phases are independent and each ends green. Recommended order and why:

1. **Phase 1 — e2e revision.** The suite is stale (missing actions, doesn't model the new admin token). Fixing it first gives every later phase a working safety net. Do this before touching feature code.
2. **Phase 2 — Performance polish.** Pure server-side; small, well-scoped; de-risks quota before the i18n work inflates page size.
3. **Phase 3 — India holidays in Config.** Self-contained server + admin-UI feature; no interaction with i18n.
4. **Phase 4 — Chrome-mobile stability.** Diagnose-first; likely a cache-busting/versioning fix that also benefits every other phase's deploys.
5. **Phase 5 — Bilingual toggle.** The largest phase; touches every page. Done after the app is otherwise stable so translation churn sits on a clean base.
6. **Phase 6 — Restore the iframe portal.** Requires a manual GAS-UI step the agent cannot perform; sequenced last and gated on a human action.

---

## Phase 1 — Revise the e2e suite to match the current server contract

**Why:** `tests/helpers/gas-mock.js` is out of sync with the real server in concrete ways:
- Mock defines action `addToBlacklist`/`removeFromBlacklist`; the real `doPost` dispatches `addBlacklist`/`removeBlacklist`. (The mock keys are the *function* names, not the *action* names.)
- Mock lacks `lookupVisitorByPhone`, `importGenderBloodGroup`, `processAndStoreScan`, `getPendingResult` — all live actions.
- Mock's `verifyPIN` was corrected during the security work to return `{success, token}`; confirm no other mock handler assumes the old shape.
- `getHoursSummary` / `getHoursKpis` are called by `reports.html` via `google.script.run` but are absent from both `doPost` and the mock, so the reports Hours tab is unmodelled.

**Files:**
- Modify: `tests/helpers/gas-mock.js`
- Modify: `e2e-sweep-5-reports.js` (add Hours-tab coverage)
- Modify: `e2e-sweep-4-visitors.js` (add lookup-by-phone coverage)
- Reference (read only): `src/Code.js` (doPost action list), `src/pages/reports.html`, `src/pages/visitors.html`

**Interfaces:**
- Consumes: `GAS_MOCK_SCRIPT` string exported from `tests/helpers/gas-mock.js`; the `makeRunner`/`openPage` helpers in `e2e-lib.js`.
- Produces: an updated mock whose action set matches `src/Code.js` doPost + the `google.script.run`-only functions the pages call.

- [ ] **Step 1: Enumerate the real contract**

Run:
```bash
cd "c:/Users/Appex/My Drive (packmasters.mumbai@gmail.com)/PackMastersQrAtt"
echo "doPost actions:"; grep -oE "action === '[a-zA-Z]+'" src/Code.js | sed "s/.*'\(.*\)'/\1/" | sort
echo "google.script.run.* called from pages:"; grep -rhoE "runner\.[a-zA-Z]+|r\.[a-zA-Z]+\(|google\.script\.run[^;]*\.[a-zA-Z]+\(" src/pages/*.html src/shared/_scripts.html | grep -oE "[a-zA-Z]+\(" | sed 's/($//;s/(//' | sort -u
```
Expected: a definitive list. `addBlacklist`/`removeBlacklist` appear as doPost actions; `getHoursSummary`/`getHoursKpis`/`lookupVisitorByPhone` appear as runner calls.

- [ ] **Step 2: Add the missing mock handlers**

In `tests/helpers/gas-mock.js`, inside the runner object (alongside the existing handlers), add:

```javascript
      lookupVisitorByPhone: function(phone) {
        // Return a deterministic hit for a known test number, miss otherwise.
        if (String(phone).replace(/\D/g,'').slice(-4) === '9999') {
          respond({ success: true, visitorId: 'VIS-20260710-TESTPASS0000001',
                    name: 'Test Visitor', company: 'Acme', checkedIn: false });
        } else {
          respond({ success: false, error: 'No visitor found for this number. Please register.' });
        }
      },
      importGenderBloodGroup: function(token) {
        respond(token ? { success: true, updated: 0 } : { success: false, error: 'Unauthorized: admin sign-in required' });
      },
      processAndStoreScan: function(qrCode, gate, sid) { respond({ success: true }); },
      getPendingResult: function(sid) { respond({ success: true, result: null }); },
      getHoursSummary: function(opts) {
        respond({ success: true, rows: [
          { EmpID:'EMP001', Name:'Owner',  Department:'Management', DaysWorked:20, PresentDays:20, LateDays:1, TotalHours:160, OvertimeHours:4 },
          { EmpID:'EMP002', Name:'Khushi', Department:'Ops',        DaysWorked:18, PresentDays:18, LateDays:0, TotalHours:144, OvertimeHours:0 }
        ] });
      },
      getHoursKpis: function() {
        respond({ success: true, totalHours: 304, avgPerDay: 8, lateDays: 1, overtimeHours: 4 });
      },
```

- [ ] **Step 3: Align blacklist action names**

Confirm which name the pages send. Run:
```bash
grep -rn "action: *'addBlacklist'\|action:'addBlacklist'\|action: *'removeBlacklist'" src/pages/*.html
```
If pages send `addBlacklist`/`removeBlacklist` (they do — matches `doPost`), rename the mock handlers `addToBlacklist`→`addBlacklist` and `removeFromBlacklist`→`removeBlacklist` so the mock's `post()` dispatch resolves them. If the admin page's inline `post()` shim maps `addBlacklist`→`r.addToBlacklist(...)`, keep BOTH mock keys as aliases pointing at one implementation:

```javascript
      addBlacklist:   function(entry) { respond({ success: true }); },
      addToBlacklist: function(entry) { respond({ success: true }); },
      removeBlacklist:   function(qr) { respond({ success: true }); },
      removeFromBlacklist: function(qr){ respond({ success: true }); },
```

- [ ] **Step 4: Run the existing suite to confirm no regression**

Run: `node e2e-all.js`
Expected: `149/149 passed`. If any suite now crashes on a newly-referenced handler, fix the handler shape until green.

- [ ] **Step 5: Add a Hours-tab test to reports sweep**

In `e2e-sweep-5-reports.js`, add a `R.check` block that switches to the Hours tab and asserts a summary row renders. Use the existing tab-switch selector pattern already in that file (read it first to match the exact locator names). Example shape:

```javascript
await R.check('Hours tab shows summary rows', async () => {
  await page.click('[data-tab="hours"]');   // match the real selector in reports.html
  await settle(page);
  const rows = await page.locator('.hours-row, #hoursTable tr, [data-hours-row]').count();
  if (rows < 1) throw new Error('no hours rows rendered');
});
```

- [ ] **Step 6: Add a lookup-by-phone test to visitors sweep**

In `e2e-sweep-4-visitors.js`, add a check that enters the known test number (last-4 `9999`) into the fast-path field and asserts the returning-visitor path is taken. Match the real input id from `visitors.html`/`vreg.html`.

- [ ] **Step 7: Run full suite**

Run: `node e2e-all.js`
Expected: count is now `≥ 151` and all pass.

- [ ] **Step 8: Commit**

```bash
git add tests/helpers/gas-mock.js e2e-sweep-4-visitors.js e2e-sweep-5-reports.js
git commit -m "test: resync e2e mock with server contract; cover hours + phone lookup"
```

> Note: `tests/` is gitignored. Confirm with `git check-ignore tests/helpers/gas-mock.js`. If ignored, either `git add -f` the mock or move the plan's mock edits somewhere tracked — decide with the user. The e2e sweep files at repo root are tracked.

---

## Phase 2 — Performance polish (bounded reads, memoized Config)

**Why:** Review found several full-history `Logs` reads and per-call Config re-reads. None are on the hot dashboard path (already cached), but they scale with history and add avoidable runtime.

**Files:**
- Modify: `src/utils.js` (memoize `getConfigValue` per execution)
- Modify: `src/reports.js` (`_computeDashboardData_`, `getLogs`, `getAnalyticsData`, `getMonthlyAttendance` — bound Logs reads to a date window where the caller is date-scoped)
- Modify: `src/hoursSummary.js` (`getHoursKpis` reads Logs then calls `getHoursSummary` which reads again — share one dataset)
- Reference: `src/scanner.js` (`_findOpenLogRow` already does one wide read — leave it)

**Interfaces:**
- Consumes: existing `getSheetAsObjects`, `getSheet`, `today()`, `formatDate`.
- Produces: `getConfigValue(key)` unchanged signature but backed by a per-execution memo; no behavioural change visible to callers.

- [ ] **Step 1: Write a test proving Config memoization returns consistent values**

Because there is no server-side unit harness, assert via a temporary editor-run function. Add to `src/tests.js`:

```javascript
function _test_configMemo_() {
  var a = getConfigValue('OrgName');
  var b = getConfigValue('OrgName');
  Logger.log('memo consistent: ' + (a === b) + '  value=' + a);
  return a === b;
}
```

- [ ] **Step 2: Memoize `getConfigValue` per execution**

In `src/utils.js`, replace the body of `getConfigValue` so the whole Config sheet is read once per execution into an object and cached on a module-level var (reset implicitly each execution since GAS re-evaluates globals per invocation):

```javascript
var _CONFIG_MEMO = null;
function getConfigValue(key) {
  if (_CONFIG_MEMO === null) {
    _CONFIG_MEMO = {};
    getSheetAsObjects(SHEETS.CONFIG).forEach(function(r) {
      _CONFIG_MEMO[String(r.Key).trim()] = r.Value;
    });
  }
  return _CONFIG_MEMO.hasOwnProperty(key) ? _CONFIG_MEMO[key] : null;
}
```

Add an invalidation call inside `saveConfig` (in `src/reports.js`), after the write loop, so a config change within the same execution is seen: `_CONFIG_MEMO = null;`.

- [ ] **Step 3: Verify memoization by editor run**

In the Apps Script editor, run `_test_configMemo_`. Check the execution log shows `memo consistent: true`.

- [ ] **Step 4: Bound the Logs read in `getMonthlyAttendance`**

`getMonthlyAttendance(year, month)` currently reads all Logs then filters. Filter the in-memory rows by `Date` prefix `YYYY-MM` immediately after the read so downstream work iterates only that month. Show the exact change:

```javascript
var ym = year + '-' + ('0' + month).slice(-2);
var logs = getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
  return String(r.Date).slice(0, 7) === ym;
});
```

(Reads are still full-sheet — GAS has no server-side range filter on header objects — but the heavy per-row computation now runs on a bounded slice. Note this limitation in a code comment; a true fix is a per-month sheet, out of scope here.)

- [ ] **Step 5: Share one dataset between `getHoursKpis` and `getHoursSummary`**

In `src/hoursSummary.js`, refactor so `getHoursKpis` computes from the same rows `getHoursSummary` already produced rather than re-reading Logs. Extract a private `_computeHours_(opts)` returning the row array; both public functions call it. Show the extraction with real code (read the current bodies first and reproduce them under the new private function).

- [ ] **Step 6: Run e2e**

Run: `node e2e-all.js`
Expected: unchanged pass count (perf changes are behaviour-preserving; the mock covers the reports/hours path added in Phase 1).

- [ ] **Step 7: Deploy and smoke-test live**

Run: `clasp push --force && clasp deploy --deploymentId AKfycbzkGp766lCPYqhitkbYsv0jQGPtBE_dLzpc3CiwuXIWmm7CbFps4XMTb5kmxLAryR0CMQ`
Then verify dashboard still returns via a POST to `/exec` `{"action":"getDashboardData"}` and the response has `present`/`absent` counts.

- [ ] **Step 8: Commit**

```bash
git add src/utils.js src/reports.js src/hoursSummary.js src/tests.js
git commit -m "perf: memoize Config per execution; bound monthly/hours Logs work"
```

---

## Phase 3 — India national holidays in Config

**Why:** User wants to pick from India's national holidays and have the app be holiday-aware (so a holiday is not counted as mass-absence).

**Decision (confirm with user before Task):** "National holidays" for India = the 3 gazetted national holidays (Republic Day 26 Jan, Independence Day 15 Aug, Gandhi Jayanti 2 Oct) PLUS the common restricted/gazetted set most workplaces observe. This plan ships the **3 gazetted national holidays as always-on** and a **curated pick-list of ~15 common 2026 holidays** the admin ticks. Dates are hardcoded for 2026 (Hindu/Muslim festival dates shift yearly; a future year needs a refreshed list — note this in the UI).

**Files:**
- Modify: `src/Code.js` (`_bootstrapIfNeeded` default Config: add `Holidays` key; add `Holidays` to schema comment)
- Create: `src/holidays.js` (`getHolidayCatalog()`, `isHoliday(dateStr)`, `getHolidays()`, `saveHolidays(list, token)`)
- Modify: `src/Code.js` doPost (dispatch `getHolidayCatalog`, `getHolidays`, `saveHolidays`)
- Modify: `src/pages/admin.html` (Config tab: a holidays multi-select UI)
- Modify: `src/reports.js` `_computeDashboardData_` (annotate today as a holiday; don't flag everyone absent)
- Modify: `tests/helpers/gas-mock.js` (mock the three new actions)
- Test: `e2e-sweep-3-admin.js` (holiday picker renders + persists)

**Interfaces:**
- Consumes: `getConfigValue`, `saveConfig`, `_requireAdmin_`, `today()`.
- Produces:
  - `getHolidayCatalog()` → `{ success:true, catalog:[{date:'2026-01-26', name:'Republic Day', national:true}, …] }`
  - `getHolidays()` → `{ success:true, dates:['2026-01-26', …] }` (selected, stored in Config key `Holidays` as a comma-joined ISO list)
  - `saveHolidays(dates, token)` → `{ success:true }` (admin-guarded; writes Config `Holidays`)
  - `isHoliday(dateStr)` → boolean (used server-side)

- [ ] **Step 1: Write the failing test for `isHoliday`**

Add to `src/tests.js`:

```javascript
function _test_isHoliday_() {
  saveHolidays(['2026-01-26','2026-08-15'], _issueAdminToken_());
  var a = isHoliday('2026-01-26');      // true
  var b = isHoliday('2026-03-03');      // false
  Logger.log('isHoliday 26Jan=' + a + ' 03Mar=' + b);
  return a === true && b === false;
}
```

- [ ] **Step 2: Run it (editor) to see it fail**

In the editor, run `_test_isHoliday_`. Expected: error `isHoliday is not defined` / `saveHolidays is not defined`.

- [ ] **Step 3: Create `src/holidays.js`**

```javascript
// ============================================================
// holidays.gs — India holiday catalog + selection (Config-backed)
// Festival dates are lunar/solar and shift yearly; this catalog is 2026.
// ============================================================

function getHolidayCatalog() {
  return { success: true, catalog: [
    { date: '2026-01-26', name: 'Republic Day',        national: true },
    { date: '2026-08-15', name: 'Independence Day',    national: true },
    { date: '2026-10-02', name: 'Gandhi Jayanti',      national: true },
    { date: '2026-03-04', name: 'Holi',                national: false },
    { date: '2026-03-21', name: 'Eid-ul-Fitr',         national: false },
    { date: '2026-04-14', name: 'Dr Ambedkar Jayanti', national: false },
    { date: '2026-05-01', name: 'Maharashtra Day',     national: false },
    { date: '2026-05-27', name: 'Eid-ul-Adha (Bakri)', national: false },
    { date: '2026-08-28', name: 'Raksha Bandhan',      national: false },
    { date: '2026-09-04', name: 'Janmashtami',         national: false },
    { date: '2026-09-14', name: 'Ganesh Chaturthi',    national: false },
    { date: '2026-10-20', name: 'Dussehra',            national: false },
    { date: '2026-11-08', name: 'Diwali',              national: false },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti',  national: false },
    { date: '2026-12-25', name: 'Christmas',           national: false }
  ] };
}

function _nationalHolidayDates_() {
  return getHolidayCatalog().catalog.filter(function(h){ return h.national; })
    .map(function(h){ return h.date; });
}

function getHolidays() {
  var raw = String(getConfigValue('Holidays') || '').trim();
  var chosen = raw ? raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
  // National holidays are always observed, even if never explicitly ticked.
  var all = _nationalHolidayDates_().concat(chosen);
  var uniq = all.filter(function(d, i){ return all.indexOf(d) === i; });
  return { success: true, dates: uniq };
}

function saveHolidays(dates, token) {
  _requireAdmin_(token);
  var clean = (dates || []).map(function(s){ return String(s).trim(); })
    .filter(function(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s); });
  saveConfig([{ Key: 'Holidays', Value: clean.join(',') }], token);
  return { success: true };
}

function isHoliday(dateStr) {
  return getHolidays().dates.indexOf(String(dateStr)) !== -1;
}
```

- [ ] **Step 4: Add `Holidays` to Config defaults**

In `src/Code.js` `_bootstrapIfNeeded`, add `['Holidays', '']` to the `defaults` array (near `TelegramLiveScans`).

- [ ] **Step 5: Wire doPost dispatch**

In `src/Code.js` `_dispatchPost_`, add:

```javascript
  if (action === 'getHolidayCatalog') return jsonResponse(getHolidayCatalog());
  if (action === 'getHolidays')       return jsonResponse(getHolidays());
  if (action === 'saveHolidays')      return jsonResponse(saveHolidays(params.dates, params.token));
```

- [ ] **Step 6: Run the editor test to green**

Run `_test_isHoliday_` in the editor. Expected log: `isHoliday 26Jan=true 03Mar=false`, returns true.

- [ ] **Step 7: Make the dashboard holiday-aware**

In `_computeDashboardData_` (`src/reports.js`), after computing `todayStr`, add `var holiday = isHoliday(todayStr);` and include `holiday: holiday` in the returned object. Do NOT suppress absent counting — just surface the flag so the UI can show a "Holiday" banner instead of alarming on absences. (Behavioural change is additive; existing fields unchanged.)

- [ ] **Step 8: Add the admin holiday picker UI**

In `src/pages/admin.html` Config tab, add a section that on load calls `post({action:'getHolidayCatalog'})` and `post({action:'getHolidays'})`, renders a checkbox per catalog entry (national ones checked+disabled), and a Save button calling `post({action:'saveHolidays', dates:[…], token: ADMIN_TOKEN})`. Reuse the existing `post`/`ADMIN_TOKEN` machinery. Show the full block of JS + HTML (author it against the real element ids in that file).

- [ ] **Step 9: Mock the new actions**

In `tests/helpers/gas-mock.js` add `getHolidayCatalog`, `getHolidays`, `saveHolidays` handlers returning the shapes above (saveHolidays requires a truthy token).

- [ ] **Step 10: e2e — picker renders and persists**

Add to `e2e-sweep-3-admin.js` a check that opens Config, sees ≥3 disabled national checkboxes + tickable others, ticks one, clicks Save, and asserts a success toast/state.

- [ ] **Step 11: Run full suite + deploy**

Run: `node e2e-all.js` (expect all pass, higher count), then `clasp push --force && clasp deploy --deploymentId …`.

- [ ] **Step 12: Commit**

```bash
git add src/holidays.js src/Code.js src/reports.js src/pages/admin.html tests/helpers/gas-mock.js src/tests.js e2e-sweep-3-admin.js
git commit -m "feat: India holidays catalog in Config with admin picker + holiday-aware dashboard"
```

---

## Phase 4 — Chrome-mobile stability ("needs to clear cache & history frequently")

**Why:** Users report having to clear Chrome-mobile cache/history to get a working/fresh app. Root cause is almost certainly aggressive HTML caching of the GAS `/exec` response plus a stale `&v=` cache-buster, not a code bug. **Diagnose before fixing.**

**Files (likely, pending diagnosis):**
- Modify: `index.html` (GitHub Pages launcher — the `&v=100` constant is stale; make it derive from a deploy version)
- Modify: `src/Code.js` `doGet` (send a no-store cache hint where possible; note GAS limits)
- Reference: session notes — GAS caches hard; a full tab close is needed to see a new deploy.

- [ ] **Step 1: Reproduce and capture the mechanism**

Run (adjust to your own device debugging, or use the context-mode fetch to compare headers):
```bash
# Compare what /exec sends for cache headers today
```
Use `mcp__plugin_context-mode_context-mode__ctx_execute` to fetch the `/exec?page=kiosk` URL and log `cache-control`, `expires`, `etag`, and the launcher's `&v=` value. Write findings into this plan's Step 2 before changing code. Expected: identify whether the stale asset is the launcher, the iframe/app URL, or a service worker (there is none today — confirm no `serviceWorker.register` exists: `grep -rn serviceWorker src/`).

- [ ] **Step 2: Record the diagnosis**

Fill in: the exact caching mechanism found. (Placeholder to be replaced by real findings — do not implement a fix until this is written.)

- [ ] **Step 3: Make the launcher cache-buster non-stale**

In `index.html`, replace the hardcoded `&v=100` with a value that changes each deploy — e.g. a build timestamp injected at Pages-deploy time, or `Date.now()` rounded to the hour (`'&v=' + Math.floor(Date.now()/3600000)`) so a new hour always fetches fresh without busting on every load. Choose based on Step 2. Show the exact diff.

- [ ] **Step 4: Add explicit meta no-cache to volatile pages**

In each page `<head>` that must always be fresh (kiosk, dashboard, scanner), confirm/add:
```html
<meta http-equiv="Cache-Control" content="no-store, max-age=0">
```
(Note: GAS may strip/override; verify effect in Step 6. This is belt-and-suspenders alongside the `&v` buster.)

- [ ] **Step 5: Confirm no service worker is silently caching**

Run: `grep -rn "serviceWorker\|caches\.\|workbox" src/ index.html`
Expected: no matches. If any exist, that is the real cause — handle it instead of Steps 3–4.

- [ ] **Step 6: Deploy and verify on a real Chrome-mobile session**

Deploy Pages (`git push origin main`) and GAS. On Chrome mobile, load the app twice across a deploy and confirm the second load reflects the new deploy WITHOUT manual cache clearing. Record the result.

- [ ] **Step 7: Commit**

```bash
git add index.html src/pages/kiosk.html src/pages/dashboard.html src/pages/scanner.html
git commit -m "fix: stop Chrome-mobile serving stale app; rotate launcher cache-buster"
```

---

## Phase 5 — Bilingual English / simple-Hindi toggle (site-wide, session-scoped)

**Why:** Guards/visitors on phones need Hindi; user wants a tap-to-select language picker on the landing page that applies for the session, across every page.

**Architecture decision:** No framework and each page is standalone, so i18n is a small shared vanilla-JS layer injected into every page:
- One dictionary file `src/i18n.js` exposed to the client via a templated `<script>` include (through the existing `include()` mechanism used by `idcards`/`vpass` for injected JSON — or inline per page). Keys map to `{en, hi}` strings.
- Markup opts in with `data-i18n="key"` (textContent) and `data-i18n-ph="key"` (placeholder). A tiny runtime reads a session-scoped choice from `sessionStorage.qratt_lang` (default `en`), swaps all `[data-i18n]` nodes on load, and re-swaps on toggle.
- The landing launcher (`index.html`) shows a first-run **EN / हिंदी** tap choice, stores it in `sessionStorage`, and every GAS page reads the same key. Because `index.html` (github.io) and `/exec` (script.google.com) are different origins, `sessionStorage` does NOT cross them — so the launcher must pass the choice through the URL (`&lang=hi`), and each page persists it into its own `sessionStorage` on load.

**Scope:** Full coverage, all pages, per the user's choice. Because that is ~11k lines, this phase is split into **one sub-task per page** so each is independently reviewable and testable.

**Files:**
- Create: `src/i18n.js` (dictionary + runtime, served to client)
- Modify: `src/Code.js` `doGet` (inject the i18n script + read `?lang=`)
- Modify: `index.html` (language tap-picker, pass `&lang=` to the app)
- Modify: each of `src/pages/{kiosk,dashboard,scanner,reports,visitors,admin,idcards,vreg,vpass,login}.html` (add `data-i18n` attributes + a header toggle)
- Modify: `tests/helpers/gas-mock.js` if any i18n needs a server round-trip (it should not — dictionary is client-side)
- Test: new `e2e-sweep-8-i18n.js`

**Interfaces:**
- Produces (client globals):
  - `QRATT_I18N` — the `{ key: {en, hi} }` dictionary object.
  - `qrattSetLang(code)` — sets `sessionStorage.qratt_lang`, re-renders all `[data-i18n]`, returns nothing.
  - `qrattT(key)` — returns the string for the current language (for JS-built strings).
  - `qrattApplyLang()` — walks the DOM and applies current language; called on `DOMContentLoaded`.

- [ ] **Step 1: Create the i18n runtime + seed dictionary**

Create `src/i18n.js`:

```javascript
// Served to the client. Dictionary is client-side (no server round-trip),
// language choice is session-scoped (sessionStorage), and the launcher passes
// the initial choice via ?lang= because github.io and script.google.com are
// different origins and do not share sessionStorage.
var QRATT_I18N = {
  nav_kiosk:     { en: 'Kiosk',      hi: 'कियोस्क' },
  nav_dashboard: { en: 'Dashboard',  hi: 'डैशबोर्ड' },
  nav_reports:   { en: 'Reports',    hi: 'रिपोर्ट' },
  nav_visitors:  { en: 'Visitors',   hi: 'विज़िटर' },
  nav_admin:     { en: 'Admin',      hi: 'एडमिन' }
  // …seeded per page in later steps
};
(function(){
  function lang() { return sessionStorage.getItem('qratt_lang') || 'en'; }
  window.qrattT = function(key) {
    var e = QRATT_I18N[key]; if (!e) return key;
    return e[lang()] != null ? e[lang()] : e.en;
  };
  window.qrattApplyLang = function() {
    document.querySelectorAll('[data-i18n]').forEach(function(n){
      n.textContent = qrattT(n.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(n){
      n.setAttribute('placeholder', qrattT(n.getAttribute('data-i18n-ph')));
    });
    document.documentElement.setAttribute('lang', lang());
  };
  window.qrattSetLang = function(code) {
    sessionStorage.setItem('qratt_lang', code === 'hi' ? 'hi' : 'en');
    qrattApplyLang();
  };
  document.addEventListener('DOMContentLoaded', function(){
    var url = new URLSearchParams(location.search).get('lang');
    if (url === 'hi' || url === 'en') sessionStorage.setItem('qratt_lang', url);
    qrattApplyLang();
  });
})();
```

- [ ] **Step 2: Inject the i18n script into every served page**

In `src/Code.js` `doGet`, after `template.appUrl = …`, add the dictionary via include. Simplest: append `<script><?!= include('i18n') ?></script>` to a shared spot. Since pages are standalone, add the include line to each page `<head>` OR (preferred, DRY) inject in `doGet` by string-appending before `</head>`:

```javascript
var out = template.evaluate();
var html = out.getContent().replace('</head>',
  '<script>' + HtmlService.createHtmlOutputFromFile('i18n').getContent() + '</script></head>');
return HtmlService.createHtmlOutput(html)
  .setTitle('QR Attendance System')
  .addMetaTag('viewport', 'width=device-width, initial-scale=1')
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```
(Rename `i18n.js` → also create `i18n.html` if `include()` requires `.html`; confirm — `include` uses `createHtmlOutputFromFile` which needs an HTML file. So the dictionary must live in an `.html` file wrapping the JS in `<script>`, or be pushed as `i18n.html`. Decide and make it consistent.)

- [ ] **Step 3: Language picker on the launcher**

In `index.html`, before opening the app, render a two-button EN / हिंदी choice (large tap targets, ≥44px). On tap, set `localStorage.qratt_lang` for the launcher's own next visit AND append `&lang=<code>` to the app URL it opens. Show the full block.

- [ ] **Step 4: Add a header toggle partial and per-page seed — kiosk**

Add to `kiosk.html`: a small EN|हिं toggle in the header calling `qrattSetLang(...)`; add `data-i18n` to every static label; extend `QRATT_I18N` with kiosk keys. Then:
Run: `node e2e-all.js` (kiosk render suite still green).

- [ ] **Steps 5–13: Repeat Step 4 per page** — dashboard, scanner, reports, visitors, admin, idcards, vreg, vpass, login. One page per step; each ends with `node e2e-all.js` green and a commit:
```bash
git add src/pages/<page>.html src/i18n.html
git commit -m "feat(i18n): Hindi coverage for <page>"
```

- [ ] **Step 14: New e2e sweep for language switching**

Create `e2e-sweep-8-i18n.js`: load a page with `?lang=hi` mocked (set `sessionStorage` before load via `page.addInitScript`), assert a known `[data-i18n]` node shows the Hindi string; toggle to EN, assert it flips. Register the suite in `e2e-all.js` `SUITES`.

- [ ] **Step 15: Full suite + deploy**

Run: `node e2e-all.js` (all pass, count up by the i18n suite), then deploy GAS + push Pages.

- [ ] **Step 16: Final i18n commit**

```bash
git add e2e-all.js e2e-sweep-8-i18n.js
git commit -m "test: add i18n language-switch e2e sweep"
```

---

## Phase 6 — Restore the iframe portal (pretty github.io URL)

**Why:** User chose "fix the deployment so the iframe works again" over a Cloudflare proxy. The blocker (from prior session): att's `/exec` sends `X-Frame-Options: SAMEORIGIN` while sibling project 5S's does not, despite identical code/manifest. The difference is in the GAS **deployment record** (a UI setting `clasp` cannot read/set), not in pushed code.

**This phase requires a human step the agent cannot perform** (opening the Apps Script UI). Structure it as: human action → agent verification → agent restore.

- [ ] **Step 1 (HUMAN): Compare deployment access settings**

In the Apps Script UI for **att** and **5S**: Deploy → Manage deployments → edit → "Who has access". Note both. Hypothesis: att is "Anyone with Google account" and 5S is "Anyone" — the former forces an auth interstitial that sends `SAMEORIGIN`.

- [ ] **Step 2 (HUMAN): Create a new att deployment matching 5S**

If settings differ, create a NEW deployment for att with access = "Anyone", execute as = owner. Capture the new `/exec` URL and deployment id.

- [ ] **Step 3 (AGENT): Verify X-Frame-Options is gone**

Use `mcp__plugin_context-mode_context-mode__ctx_execute` to fetch the NEW `/exec?page=kiosk` with an iPhone UA and log the `x-frame-options` header.
Expected: header absent (or `ALLOWALL`), not `SAMEORIGIN`.

- [ ] **Step 4 (AGENT): If clean, restore the iframe portal**

In `index.html`, revert to loading the app in the `<iframe>` (the markup still exists, lines ~84–89), point `app.src`/`base` at the new deployment URL, remove the launcher-only short-circuit, keep the "Open the app" panel strictly as a fallback behind a working iframe (do NOT let the dead iframe capture pointer events — the prior bug). Update `base` constant to the new URL. Show the full diff.

- [ ] **Step 5 (AGENT): Update the live deployment id references**

If a new deployment id replaces the current one, update the deploy command in this plan's Global Constraints, `.clasp` deployment usage, and any hardcoded URL in `index.html` and `src/pages/*` (`SCANNER_URL` in kiosk points at `packmastersmumbai.github.io/att/scanner_popup.html` — unaffected, but audit).

- [ ] **Step 6: e2e + deploy + verify on phone**

Run `node e2e-all.js`, push Pages, and confirm on Chrome mobile that the portal now renders the app inline at the github.io URL with no visible `script.google.com`.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "fix: restore inline iframe portal on new framable deployment"
```

> If Step 3 shows `SAMEORIGIN` persists even on a fresh "Anyone" deployment, STOP and fall back to the Cloudflare Worker option (offer to the user). Do not thrash on detection hacks — a blocked cross-origin iframe is undetectable from the parent (established last session).

---

## Self-Review

**Spec coverage:**
- English/Hindi toggle, tap-select on landing, session-wide, all pages → Phase 5. ✅
- Telegram digest shows all present (no truncation) → **already done this session** (commit pending in current branch: `_splitTelegramMessage_` + cap removal). Not repeated here; verify it's committed before closing.
- Holidays in Config + India national holidays pick-list → Phase 3. ✅
- Chrome-mobile cache issues → Phase 4 (diagnose-first). ✅
- Code review + polish + load fast → Phase 2 (+ the review already delivered this session). ✅
- Fix deployment / iframe portal → Phase 6. ✅
- Revise stale e2e → Phase 1. ✅

**Placeholder scan:** Phase 4 Step 2 is an intentional diagnosis placeholder (fill before implementing) — flagged as such, not a code placeholder. All code steps show real code.

**Type consistency:** i18n globals (`qrattT`, `qrattApplyLang`, `qrattSetLang`, `QRATT_I18N`) named consistently across Phase 5. Holiday functions (`getHolidayCatalog`, `getHolidays`, `saveHolidays`, `isHoliday`) consistent across Phase 3 and its mock. `_requireAdmin_`/`_issueAdminToken_` match `src/adminAuth.js`.

**Decisions (confirmed 2026-07-10):**
1. Phase 3: **3 gazetted national holidays always-on + ~15 common 2026 festivals as a pick-list** (no state-specific set). Ship as planned.
2. Phase 5: **Claude authors simple spoken Hindi (Devanagari)** for all strings; user reviews after.
3. Phase 1: **Force-add the mock to git** (`git add -f tests/helpers/gas-mock.js`) so e2e is reproducible from a clean clone.
