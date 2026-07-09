# Phase 3 Report — India holidays in Config

## Files changed

| File | Change |
|---|---|
| `src/holidays.js` | Created. `getHolidayCatalog()`, `_nationalHolidayDates_()`, `getHolidays()`, `saveHolidays(dates, token)`, `isHoliday(dateStr)` — verbatim from the brief. |
| `src/Code.js` | Added `['Holidays', '']` to the `_bootstrapIfNeeded` defaults array (next to `TelegramLiveScans`). Added 3 dispatch lines in `_dispatchPost_` for `getHolidayCatalog`, `getHolidays`, `saveHolidays`. |
| `src/reports.js` | `_computeDashboardData_`: added `var holiday = isHoliday(todayStr);` right after `todayStr` is computed, and added `holiday: holiday` to the returned object (placed right after `date: todayStr`). Absent-counting logic untouched. |
| `src/pages/admin.html` | Added a new "India Holidays (2026)" `cfg-block` in the Config tab (after Scheduling, before the closing card). Added `getHolidayCatalog` / `getHolidays` / `saveHolidays` branches to the `post()` action-dispatch shim. Added `loadHolidays()`, `renderHolidayList()`, `saveHolidays()` client functions; `loadConfig()` now also calls `loadHolidays()`. Checkboxes use class `holiday-check`; national ones render `checked disabled`. |
| `tests/helpers/gas-mock.js` | Added `MOCK_HOLIDAYS` (pre-seeded with the 3 national dates) and three runner handlers: `getHolidayCatalog` (5-entry mini catalog, 3 national + 2 optional), `getHolidays` (returns current `MOCK_HOLIDAYS`), `saveHolidays` (requires truthy token, else returns `{success:false}`; otherwise replaces `MOCK_HOLIDAYS` and returns `{success:true}`). |
| `src/tests.js` | Added `_test_isHoliday_()` verbatim from the brief, in the same "manual editor-run check, not part of runAllTests" style as the existing `_test_configMemo_()`. |
| `e2e-sweep-3-admin.js` | Added 3 checks to suite 3c (Config tab): ≥3 disabled national checkboxes render, at least one tickable (non-national) checkbox exists, and ticking one + clicking Save shows a `#dsToast.show.toast-success` toast containing "saved". |

## How `getHolidays()` tolerates a missing `Holidays` config key

`_bootstrapIfNeeded` only runs once per spreadsheet, guarded by the `bootstrapped` Script Property — so on the already-bootstrapped live sheet, the new `['Holidays', '']` default row is never written. `getHolidays()` reads the raw value via `getConfigValue('Holidays')`, which returns `null` for a key that doesn't exist in the Config sheet. The code guards this explicitly:

```javascript
var raw = String(getConfigValue('Holidays') || '').trim();
```

`String(null || '')` → `String('')` → `''`, so `raw` is always a string, never `null`. The subsequent ternary (`raw ? raw.split(',')... : []`) then yields an empty `chosen` array, and `getHolidays()` still returns the 3 national holidays via `_nationalHolidayDates_()` concatenated with the (empty) chosen list. No missing-key crash is possible — verified by reading the function; not something that needed a code change beyond what the brief already specified.

## Tests

- `node --check` passed clean on every touched `.js` file (`src/holidays.js`, `src/Code.js`, `src/reports.js`, `src/tests.js`, `e2e-sweep-3-admin.js`) and on the `GAS_MOCK_SCRIPT` template-literal body (parsed via `new Function(...)` since it's a string, not top-level JS `node --check` can see).
- `node e2e-all.js` final line: **`Total: 157/157 passed (0 failed) 97.2s`** — up from the prior baseline (was 154, brief said ≥155; suite 3c alone grew from 4 → 7 checks with the 3 new holiday-picker assertions).
- Editor test `_test_isHoliday_` was added exactly as specified in the brief; per instructions I did not execute GAS locally — the user will run it in the Apps Script editor.

## Concerns

- Did not run `clasp push`/`clasp deploy` — brief said do not deploy.
- `tests/helpers/gas-mock.js` was not actually gitignored in this repo (git status showed it as a normal tracked modification, not `??`), so no `git add -f` was needed — plain `git add` covers it.
- The holiday catalog is hardcoded for calendar year 2026 per the brief's explicit decision; the UI's "India Holidays (2026)" heading and inline hint call this out so a future admin knows to expect a refresh for 2027+.
- Did not touch `src/Code.js`'s Config schema *comment* — I searched for one near the defaults array and found none exists (the defaults array itself is the only place Config keys are enumerated), so there was nothing separate to update.

## Phase 3 follow-up — Holiday banner in dashboard UI + mock/e2e fixes

`_computeDashboardData_` already returned `holiday` (see above), but nothing in the UI consumed it — dashboards looked alarming ("everyone absent") on holidays with no explanation. Fixed two review findings.

### FINDING 1 — Holiday banner (`src/pages/dashboard.html`)

- Desktop: `<div class="card holiday-banner" id="holidayBanner" style="display:none;...">` inserted as the first child of `.page-content`, right before the `.kpi-grid-6` block. Uses the existing `.card` class (surface/shadow/radius) plus a warning-tinted left border/background so it visually matches the app's amber warning tokens, not a new design language.
- Mobile: `<div class="mob-updates holiday-banner" id="mobHolidayBanner" style="display:none;...">` inserted as the first child of `.mob-body`, reusing the existing `.mob-updates` card style so it renders correctly in the separate mobile layout block.
- Both banners contain the same copy: title `🎉 Holiday today`, subline `Low attendance is expected — today is a configured holiday.`
- Show/hide logic lives in `loadDashboard()`'s success handler (added right before the present/absent KPI computation, without touching any of that logic): `var isHoliday = data.holiday === true;` then each banner's `style.display` is toggled `'block'`/`'none'` accordingly.

### FINDING 2 — Mock holiday behavior (`tests/helpers/gas-mock.js`)

- Renamed the pre-seeded `MOCK_HOLIDAYS` array to a new constant `NATIONAL_HOLIDAYS` (`['2026-01-26','2026-08-15','2026-10-02']`) and reset `MOCK_HOLIDAYS` (the "saved/ticked" list) to start empty — mirrors production `src/holidays.js`, where `saveHolidays()` stores only the admin's picks and the 3 national dates are merged in on every `getHolidays()` read, never persisted.
- `getHolidays()` mock now returns `NATIONAL_HOLIDAYS.concat(MOCK_HOLIDAYS)` deduped via the same `indexOf`-filter idiom production uses, instead of just echoing back whatever was last saved.
- `saveHolidays()` mock is unchanged (still just replaces `MOCK_HOLIDAYS` with the admin's picks after the token check) — this already matched production's save-only-the-picks behavior; the merge-on-read behavior was the only thing missing.
- Added `holiday: false` to `MOCK_DASHBOARD` so `getDashboardData()` returns a shape matching production's `_computeDashboardData_` (which always includes `holiday`).
- Kept ES5 style (var/function) to match the rest of the file.
- File is gitignored; force-staged with `git add -f tests/helpers/gas-mock.js`.

### E2E test added (`e2e-sweep-6-dashboard.js`)

- Added a local helper `openDashboardWithHoliday(browser, flag)` that mirrors `e2e-lib.js`'s `openPage()` html-injection pattern (strip GAS template expressions, inject the mock script into `<head>`, load via base64 data URL) since `openPage()` itself has no hook for overriding mock data — the file's previously-defined `ANALYTICS_PATCH` constant was dead code, never actually applied anywhere, so no working override convention existed to reuse. The new helper string-replaces `'holiday: false,'` → `'holiday: <flag>,'` in `GAS_MOCK_SCRIPT` before injecting.
- New suite `6g · Dashboard — Holiday banner` with 2 checks:
  - `holiday banner is visible when data.holiday=true` — opens the dashboard with the mock forced to `holiday:true`, asserts `#holidayBanner` is visible.
  - `holiday banner is hidden when data.holiday=false` — opens the dashboard with the mock's default (`holiday:false`), asserts `#holidayBanner` is NOT visible.

### Tests

- `node --check` passed clean on `src/reports.js`, `src/holidays.js`, `tests/helpers/gas-mock.js`, `e2e-sweep-6-dashboard.js`, and on the extracted inline `<script>` blocks from `src/pages/dashboard.html` (6 blocks concatenated and checked via `node --check`).
- `node e2e-all.js` final line: **`Total: 159/159 passed (0 failed) 86.2s`** — up from the prior 157/157 baseline; new suite `6g` contributes 2/2 passing checks, no regressions anywhere else.
- Did not run `clasp push`/`clasp deploy` per instructions.
