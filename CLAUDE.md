# QR Att. — Pack Masters attendance, visitors and training

Apps Script web app. QR-based entry/exit tracking, visitor passes, gate passes,
and the HR records the rest of the estate depends on. Script id
`1GQqXMNT6g6-ZCHhmwWAOoYKuq6zDgAR-QG0DZzgnDuRJX9PMrqwQGrKA`.

Read `PRODUCT.md` for who this is for and `DESIGN.md` / `DESIGN.json` for the
visual system before changing any UI. The short version: gate staff scan under
time pressure on mobile and need instant, unambiguous feedback; admins need
density without cognitive load.

## Layout

```
src/           rootDir — ONLY this is pushed (no .claspignore; the folder is the filter)
  Code.js        doGet / doPost — the web app entry points
  triggers.js    installTriggers(): autoCheckoutAll, backupDailyLogs,
                 rebuildHoursSummarySheet, sendDailySummary
  scanner, qr, attendanceModal, kiosk pages    the scanning path
  employees, holidays, hoursSummary, reports   the records path
  training, skillmatrix, induction, mockdrill  the HR/ISO path
  authorisations.js                            IMS-01 step 7 + the two 45001
                                               registers (OH-REC-006, OHS-01)
  pages/assess.html                            phone-first competence
                                               assessment — IMS-01 step 2
  gatepass, visitors, materialMaster           movement in and out
  telegramBot, telegramCommands, notifications, AttNotify
  adminAuth, tokens                            access control
  AqrsIsoStamp.js                              the ISO binding (below)
  backNav.html, feedbackWidget.html, i18n.html, tokens.html, gatepassCard.html
                 shared fragments injected into every page by doGet — edit
                 these, not nineteen copies. backNav is a TEMPLATE (it needs
                 the page name and /exec URL from the server).
e2e-*.js       Playwright harness — Node, NOT pushed (outside src/)
_unused/       retired; do not revive without reading why it was retired
```

**There is no `.claspignore`.** `rootDir: "src"` is the only thing keeping the
e2e harness out of the project — those files use `require()`, and a single file
throwing at load breaks **every** function in the Apps Script global scope. Never
put a Node script inside `src/`.

## Two folders, one script id

A stale copy lives at `# Info\TBM\ClaudeProjects\QRAtt` — 10 files last touched
April, against 38 here. `clasp push` replaces the project's whole file list, so a
push from there would delete most of this app. Its `.clasp.json` is renamed to
`.clasp.json.disabled` and it carries a `DO-NOT-PUSH.md`. **This folder is
authoritative.** (That folder does still hold a `.claude/` with a `ui-design-system`
skill — the only thing there worth keeping.)

---

## The ISO contract — read this before writing any record

This app's records are audit evidence, and much of the estate's HR evidence comes
from here. A record that does not name the controlled document it was written
against is not evidence.

**Load the `pack-masters-iso` skill** before writing any form, register, report,
KPI, template, document code, revision, effective date or sign-off block.

The one rule: **never write a document code, revision or effective date as a
literal.** Resolve it at runtime, through this app's own map.

```js
isoStamp('attendance')   // "PM/FRM/HR-05 Rev 1.0, effective 01.04.2026" — print on the record
isoCheck()               // every mapped code resolves? run after any registry change
isoTriggerCheck()        // is the daily announce actually scheduled?
```

`AqrsIsoStamp.js` maps eleven record types — attendance, plan, effectiveness,
test, induction, matrix, personnel, gatepass, mockdrill, safetyCompetence
(PM/OH-REC-006), toolbox (PM/REG/OHS-01). **They are not interchangeable:**
citing the wrong document asserts the work was done against something that does
not describe it.

`_pageStamp_(kind)` is the wrapper for a page header: it returns the stamp, or
the code plus "— revision unresolved" when PMCore cannot resolve it. A blank
stamp on a controlled record would print a bare separator and read as a styling
bug rather than the failure it is.

PMCore is an Apps Script library, id
`1XrbNFnQWob8l5GuSCUyMT5u0tUX7netkqidSYEgqXpBV3nxE7KQunp9v`, **version 2**.
Outside the account: `https://packmastersmumbai.github.io/pmdigitaliso/register.json`.

**This app owns attendance, training, employees and skills, and publishes them.
It never writes another app's records.**

### Status — measured 2026-09-13 against deployment `AKfycbzkGp766l…` @330

Take these from the app, never from this file: every number below came from a
live call and will have moved. `getSkillMatrix`, `getEffectivenessGaps`,
`getAuthorisations`, `getToolboxTalks` and `getPendingAssessments` all read
without an admin token, so checking costs nothing.

| | |
| --- | --- |
| Cells computed from training | **115** of 434 (313 never trained, 6 NA) |
| People with training evidence | **12** of 31 |
| People with a **confirmed** level | **0** |
| Sessions held / with attendance / rated | **64 / 32 / 22** |
| Effectiveness verdicts | **0** of 181 attended — 179 due, 2 too early |
| Assessments overdue | **68** of 70 pending |
| Authorisations | 0 live (3 withdrawn test rows — see below) |

**What is wired and working:** PMCore v2, all eleven codes resolving. The
skill-matrix and training page headers print a resolved stamp; six functions
stamp their records. The admin gate covers `saveSessionAttendance`,
`saveTrainingSession`, `recordEffectiveness`, `saveAssessment`,
`grantAuthorisation`, `withdrawAuthorisation`, `saveToolboxTalk`.

**Still unverified:** `isoAnnounce()` rides `sendDailySummary` in
`installTriggers()`. Whether that trigger exists in the live project is unknown —
this project returns `NOT_FOUND` over the API for every function, so run
`isoTriggerCheck()` in the editor, or look for `aqrs` in
`https://packmastersmumbai.github.io/pmdigitaliso/consumers.json`; absence is
the answer.

**Deployments:** 18 of them, each pinned to a version. `AKfycbzkGp766l…` is the
one this work has been deployed to and it is at **@330** — a cut version, not
HEAD, so it is live for anyone using that link. The other 17 still serve older
versions and will not see any of it.

### Known open — do not report these as new findings

On `SYSREV/2026-09` with an owner each. **Software is no longer the blocker on
any of them** — the app can record all of it; nobody has yet.

* **0 effectiveness verdicts against 179 due**, averaging 400+ days late.
  IMS-01 step 6 is CRITICAL and its own callout is the point: *"Attendance is
  not evidence of competence."* The 179 attendance rows are necessary and not
  sufficient.
* **No assessment has ever been run.** IMS-01 step 2 is half-yearly, April and
  October; both 2026 windows passed. Until someone assesses, nobody rises above
  L1, so coverage reads 0% and all 428 cells are gaps — a true statement about
  the records, not the workforce.
* **Zero authorisations recorded** — nobody is formally cleared for forklift,
  permit work, first aid or fire warden.
* **~16 people signed 2025 training sheets but are not on the employee master**
  (Azad, Suraj Prakash, Ashok Patole, Riddhi Mestry, Atul Waghmare, Satendra
  Yadav, Kripasankar, Avinash Vasant, Pooja, Rajni, and the 01/08 worker group).
  Roughly 40% of every signature. They need adding as INACTIVE, or confirming as
  leavers — from an HR file, not a guess.
* **The paper attendance form is IMS-11 Rev 00**; IMS-01 step 5 names
  **PM/FRM/HR-05 Rev 1.0**, which has an **Employee ID column**. That missing
  column is exactly why the ~16 above cannot be resolved. Document-control fix,
  not a code one.
* **Mock drills have no participant table at all**, so DRL-01…05 cannot evidence
  anyone's emergency-response competence. A gap in the form.
* **`SOP-SM-001`** is cited by `skillmatrix.js` but is **not in the 224-document
  register**. Either register it or correct the citation.
* **Test rows are live** in `Authorisations` (EmpID 687 ×3, all WITHDRAWN) and
  `ToolboxTalks` (TBT-20260910-2), each labelled "TEST ROW". Clear them with
  `purgeVerificationRows()` — editor-run and deliberately unrouted, because a
  safety record must not be deletable over the API.
* 21 of 31 active people are still recorded as "Worker", and `MinRequired` has
  no line for Plant In-charge or Proprietor, so the matrix asserts the
  Proprietor needs all 14 shop-floor competencies.

### Traps this app has already sprung

* **Sheets stores EmpID "004" as the number 4.** Compare with `_sameEmpId_` /
  `_normEmpId_`, never `===`. This silently cost the Plant In-charge and the
  Proprietor their entire training credit, and separately made every one of
  their matrix cells a dead button.
* **The Apps Script sandbox is cross-origin from `/exec`.** `history.back()`
  does nothing, `window.top.history` and `window.top.location` both throw
  SecurityError, and the iframe URL carries no `?page=`. Navigate with
  `window.open(url, '_top')`; take the page name from the server.
* **`getSkillMatrix` returns the roster as `people`, not `rows`** — reading
  `rows` returns zero silently.
* **Bash heredocs containing apostrophes break.** Use the Write tool for prose.
* **Syntax-check an edited HTML page before pushing.** A broken comment block
  shipped to production twice in one session.

Registry source: `My Drive\Pack Masters Digital ISO\qms_app\sources\SHARE.md`
