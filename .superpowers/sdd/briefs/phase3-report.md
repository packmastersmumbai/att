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
