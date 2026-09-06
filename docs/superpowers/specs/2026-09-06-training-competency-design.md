# Training & Competency System — Design

**Date:** 2026-09-06
**Status:** Stages 1-3 built (2026-09-06)
**Where it lives:** Inside the existing QR Attendance Apps Script app

---

## 1. Why

Packmasters runs ~33 training sessions and 4 mock drills a year. Today that
produces a Word document per session, printed and signed by hand, then scanned
to PDF. The 2025 folder holds 33 `.doc` records and 36 scanned sheets.

Three things are broken, and they were established by reading the actual files,
not assumed:

1. **The skill matrix has never been filled in.** The `Training Identification`
   sheet in `Annual Training Calendar Rabale 2025.xlsx` has the grid — 15 people,
   5 job roles, 10 topics — and **0 of 160 cells contain a value.**
2. **Attendance was never digitised.** The attendance table is empty in **all 33**
   `.doc` records; names exist only as ink on the scanned PDFs. So the system can
   say "a session happened on 10 Jan" but cannot answer "is Sonali competent at
   labelling?" — which is the question ISO 9001 §7.2 actually asks.
3. **The KPI table is blank in every record.** Six KPIs are printed on the format;
   none has ever been computed, because the inputs (attendance, scores) were
   never captured as data.

The system exists to make the third column of that list computable.

## 2. What governs this

`SOP-SM-001 Skill Matrix Management` is Packmasters' own controlled document and
takes precedence over any design preference here. It dictates:

- **Four levels**, L1–L4 (§4), not a 0–3 scale
- **Human assessment** — department heads and supervisors evaluate; HR updates
  quarterly or after any major training (§6.2, §6.3)
- Review at Management Review Meetings (§6.4); training plans derive from gaps (§6.5)
- References ISO 9001:2015 §7.2 and ISO 45001:2018 §7.2 (Competence)

The AYT sample matrix (`Skill Matrix Sample Dec 2021- v2.xlsx`, format `F-HR-01`)
supplies the printed layout: employee photo, a `MINIMUM REQUIRED LEVEL` row,
`OVERALL` and `REMARKS` columns, an `N.A.` state, `Next Review On`, and
Prepared/Reviewed/Approved signature blocks.

**Design consequence.** An earlier draft had levels computed automatically from
attendance. That contradicts §6.2 and an auditor comparing system to SOP would
find the gap. The resolution:

> **Attendance proposes. A supervisor confirms.**
>
> Attending a session sets a *suggested* level and flags the cell pending review.
> The *confirmed* level — set by a supervisor — is what the matrix shows and
> prints. The system is automatic where it should be (detecting change, flagging
> gaps, computing coverage) and human where the SOP requires it.

This also makes the competency journey visible: suggested → confirmed → next
level, each with a date and a name against it.

## 3. Data model

Four new sheets. Everything keys off `EmpID` in the existing `Employees` sheet,
so there is no second roster to keep in sync.

```
Skills              SkillID · Name · NameHi · Group · TopicIDs · Active
TrainingTopics      TopicID · Title · TitleHi · Type(TRAIN|DRILL) · Agenda
                    · Method · DurationHrs · ValidityMonths · Active
TrainingPlan        PlanID · Year · TopicID · PlannedDate · ActualDate · Status
                    · Trainer · Content · Observations · PhotoURLs · Rating
TrainingAttendance  PlanID · EmpID · Present · Score
```

Plus: a `JobRole` column on `Employees`, and `PassMark`, `MinRequired`,
`LevelNames` in `Config`.

**`Skills.Group`** is the department (Packaging / Labelling / Security /
Engineering / Common). Client-specific processes are simply rows with their own
group — no separate client dimension until two clients' processes actually run
side by side.

**`Skills.TopicIDs`** is a comma-separated list: which topics credit this skill.
One topic builds several skills; one skill is built by several topics. This is a
column rather than a link table because at 10 topics × 14 skills the join buys
nothing.

**`TrainingPlan` is plan *and* actual on one row.** `PlannedDate` + `ActualDate`
together — no reconciliation step, and the grid renders straight from it. Mock
drills are the same rows with `Type=DRILL`, so the drill calendar is the same
screen filtered.

**The skill matrix is not a sheet.** It is computed on read from attendance —
15 people × 14 skills = 210 cells, which is instant. Storing it would mean
recompute-on-write, staleness, and a sync path to get wrong. Only supervisor
overrides are stored, because an override is the one thing not derivable:

```
SkillOverrides      EmpID · SkillID · Level · Reason · By · At
```

## 4. Screens

Two pages, plus a slide-over. Both print to A4 landscape as the audit artefact.
Reuses `--qr-*` tokens, Public Sans / Roboto Mono, navy `#000666`. Colour carries
status only, never decoration.

### 4.1 Training Calendar — `?page=training`

Topics as rows, 12 months as columns, matching the 2025 spreadsheet an auditor
already recognises. Each cell shows the day number of the session.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Annual Training Calendar 2026          [2025|2026] [Training|Drill]  │
│ Format F-TR-01 · Rev 00                          [Print] [+ Session] │
├──────────────────────────────────────────────────────────────────────┤
│ Plan adherence 82%  ·  Sessions 27/33  ·  Overdue 2  ·  Coverage 74% │
├────────────────────────────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬─────┤
│ Topic                      │JAN│FEB│MAR│APR│MAY│JUN│JUL│AUG│SEP│ ... │
├────────────────────────────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼─────┤
│ 1 SOP, Product Safety      │▓10│   │   │▓10│   │   │   │▓01│   │     │
│ 2 Quality Params, Do's     │▓25│   │   │   │▓10│   │   │   │▒02│     │
│ 5 Electrical Safety        │   │   │▓07│   │   │   │▓30│   │   │     │
├────────────────────────────┴───┴───┴───┴───┴───┴───┴───┴───┴───┴─────┤
│ ▓ Completed  ▒ Due this month  ░ Overdue  · Planned  □ Not planned   │
└──────────────────────────────────────────────────────────────────────┘
```

Where planned and actual differ, the cell shows the actual and a print footnote
carries both. Clicking a cell opens the session panel.

### 4.2 Session panel — slide-over on the calendar

Not a separate page: a session is an edit of one `TrainingPlan` row.

```
┌────────────────────────────────────────┐
│ Electrical Safety · 07 Mar 2026     [×]│
├────────────────────────────────────────┤
│ AGENDA          (from topic library)   │
│ • Electrical Safety Training           │
│ • Compliance with PPE Matrix           │
│ Method: Classroom + demo · 1.0 hrs     │
├────────────────────────────────────────┤
│ Trainer  [Anuj Pathak         ▾]       │
│ Actual   [07/03/2026]  Duration [1.0]  │
├────────────────────────────────────────┤
│ ATTENDEES                  12 / 15     │
│ ☑ Dilip Nishad    Packaging   [ 80 ]   │
│ ☑ Kripasankar     Packaging   [ 65 ]   │
│ ☐ Sonali          Labelling   [    ]   │
│              [Select all] [Scan badge] │
├────────────────────────────────────────┤
│ Observations  [                     ]  │
│ Photos        [Capture] [2 added]      │
│ Session rating ○1 ○2 ○3 ●4 ○5          │
│                    [Save session]      │
└────────────────────────────────────────┘
```

The score box sits on the attendee row — one pass down the list, no second
screen. A score below `PassMark` shows amber inline. "Scan badge" reuses the
existing kiosk scan path. Photos reuse `_storeVisitorPhoto_`'s pattern
(`_dataUrlToBlob_` → DriveApp folder → `ANYONE_WITH_LINK`).

### 4.3 Skill Matrix — `?page=skillmatrix`, prints as F-HR-01

```
┌───────────────────────────────────────────────────────────────────────┐
│ SKILL MATRIX 2026 · Format F-HR-01 · Rev 00                           │
│ Dept [Packaging ▾]   Next review: 31 Mar 2026        [Print] [Review] │
├──────────────┬────┬────┬────┬────┬────┬─────────┬─────────────────────┤
│ Employee     │FILL│CAPP│SEAL│ PPE│FIRE│ OVERALL │ REMARKS             │
├──────────────┼────┼────┼────┼────┼────┼─────────┼─────────────────────┤
│ MIN REQUIRED │ L3 │ L3 │ L3 │ L2 │ L2 │         │                     │
├──────────────┼────┼────┼────┼────┼────┼─────────┼─────────────────────┤
│ [photo] Dilip│ L3 │ L3 │ L3 │ L2 │ L2 │  MEETS  │                     │
│ [photo] Kripa│ L3 │ L2!│ L3 │ L1!│ L2 │  2 GAPS │ Refresher due       │
│ [photo] Rajesh│ NA │ NA │ NA │ L2 │•L2 │  MEETS  │ Security            │
├──────────────┴────┴────┴────┴────┴────┴─────────┴─────────────────────┤
│ L1 Beginner · L2 Under supervision · L3 Independent · L4 Can train    │
│ NA Not applicable   ! Below minimum   • Pending supervisor review     │
│ Prepared ________  Reviewed ________  Approved ________               │
└───────────────────────────────────────────────────────────────────────┘
```

Every element is from the two governing documents. Skills are grouped by
department; the filter selects which group's columns show. Clicking a cell opens
that person's history on that skill plus confirm/override with a reason.

## 5. Competency logic

**Levels** (from SOP §4, wording is the SOP's, not the AYT sample's):

| Level | Meaning | Set by |
|---|---|---|
| N.A. | Not applicable to this role | `MinRequired` = NA |
| — | Never trained | no attendance on any crediting topic |
| L1 | Beginner — needs training | attended, no passing score |
| L2 | Intermediate — works under supervision | attended + score ≥ PassMark |
| L3 | Competent — works independently | supervisor confirmation |
| L4 | Expert — can train others | supervisor nomination only |

"Never trained" is a distinct state from L1, not a synonym. L1 means the person
sat the training and has not yet demonstrated competence; blank means they have
never attended. Collapsing the two would make an untrained worker indistinguishable
from a trained one on the printed matrix — the exact claim an auditor checks.

**Computation** for one `(EmpID, SkillID)` on read:

```
if MinRequired[JobRole][SkillID] == NA        → N.A.
if override on file                            → override level (Source=OVERRIDE)
sessions = attendance rows where Present
           and TrainingPlan.TopicID ∈ Skills.TopicIDs
if none                                        → blank, flag NEVER TRAINED
latest = most recent such session
suggested = (latest.Score >= PassMark) ? L2 : L1
if age(latest.ActualDate) > ValidityMonths     → drop one level, min L1, flag EXPIRED
show suggested, flagged PENDING until a supervisor confirms
```

L3 and L4 are never automatic — per SOP §6.2 they are a human judgement.
Re-testing without attending does not raise a level: a competency claim stays
tied to a training record.

**Configurable, no deploy:** `PassMark` (default 70), `ValidityMonths` per topic,
`MinRequired` per role × skill, level names.

## 6. KPIs

All formulas over the two data sheets — no engine, no dashboard page. Rendered as
the strip on the calendar and the OVERALL column on the matrix.

| KPI | Formula |
|---|---|
| Plan adherence | sessions with `ActualDate` on time ÷ planned |
| Coverage % | cells meeting `MinRequired` ÷ cells required |
| Gap count | cells below `MinRequired` |
| Expiring soon | cells whose validity lapses within 60 days |
| Score trend | mean `Score` per topic per run, over time |
| Satisfaction | mean `Rating` |

Four of the six KPIs printed blank on every 2025 record become computable.
Satisfaction comes from the new rating field. "Training Feedback" still needs a
question asked of attendees — out of scope here.

## 7. Seeding

From the real 2025 material, all extracted rather than invented:

- **10 topics** with their actual agendas and durations, mined from the 33 records
- **33 sessions** with their real dates, e.g. Electrical Safety on 07/03, 30/07,
  14/10, 17/12; SOP Product Safety on 10/01, 10/04, 01/08, 11/11
- **2026 plan** generated on the same cadence and frequency per topic
- **4 mock drills** — 2025 actual (First Aid Feb, Suspicious Transaction May,
  Fire Aug, Spill Control Nov) and 2026 planned
- **15 people** with job roles from the `Training Identification` sheet
- **~14 process skills** derived from the training content: Filling, Packing,
  Calibration, Capping, Sealing, Coding/Numbering, Visual Inspection, Rejection
  & Rework, Material Verification, Line Clearance/CLIT, Waste Segregation, PPE
  Compliance, Fire Response, Storage & Handling, Incident Reporting, Security
  Awareness

**2025 attendance is NOT seeded automatically.** It exists only as ink on 36
scanned PDFs. Stage 2 includes a bulk-tick grid (15 people × 33 sessions) to
capture it in one sitting. Inventing who was in the room would poison exactly
the audit this system exists to satisfy.

## 8. Stages

| Stage | Contents | Outcome |
|---|---|---|
| 1 | Topics + Skills + Plan sheets, calendar grid, 2025/2026 seed | Auditor-ready calendar |
| 2 | Session panel, attendance, photos, scores, bulk-tick backfill | Records leave Word |
| 3 | Matrix, level computation, overrides, review screen | The competency journey |

Each stage is independently shippable and demonstrable.

**All three stages are built.** Stage 3 lives in `src/skillmatrix.js` and
`src/pages/skillmatrix.html`, covered by suite 15 (38 assertions).

Two details settled during implementation, both departures worth recording:

- **`MinRequired` is per job role, held in Config**, not a sheet — one line
  per role (`Packaging Operator: SKL-01=L3, SKL-16=NA`), with each skill's own
  `MinRequired` as the fallback for any role without a line. It is a short
  policy statement revised at a Management Review, not per-person data, and
  the matrix works before anyone writes it.
- **The printed MIN REQUIRED row prints `by role` where roles disagree** on a
  skill. A single number there would be a claim the matrix does not hold
  anybody to; the per-cell minimum remains exact.

## 9. Testing

Follows the existing e2e harness (`e2e-lib.js`, suites registered in
`e2e-all.js`). New suite 14. The assertions that matter:

- A topic with no session shows as unplanned, not as completed
- An overdue session (planned date past, no actual) colours red
- Attendance writes exactly one row per attendee per session
- A score at the pass mark boundary (exactly 70) counts as passed
- A person with no attendance shows NEVER TRAINED, distinct from L1
- A lapsed L2 drops to L1 and flags EXPIRED
- An override wins over the computed level and records who and why
- `MinRequired = NA` renders N.A. and never counts as a gap
- Coverage % excludes N.A. cells from both numerator and denominator

## 10. Deliberately not built

- **Question bank / self-serve tests.** Scores are entered by the trainer. Add
  when someone wants workers taking quizzes on a phone.
- **KPI dashboard page.** Every number is a formula over two sheets; the reports
  page already exists.
- **Separate mock drill screen.** Four rows a year with the same shape as
  training. Same grid, `Type=DRILL`.
- **Stored skill matrix sheet.** Derived on read; only overrides persist.
- **Client dimension on skills.** A client-specific process is a skill row with
  its own group. Add when two clients' processes genuinely run side by side.

## 11. Risks and open items

- **The skill list is derived, not given.** It comes from reading the 2025
  training content. Whoever owns `SOP-SM-001` must sign it off before it is
  presented to a client as policy.
- **The `MinRequired` matrix is a draft.** An auditor will ask who set those
  levels. It needs the same sign-off.
- **Hindi strings for new UI are machine-produced**, consistent with the rest of
  the app, and should be reviewed by a native speaker before a client sees them.
- **2025 attendance depends on manual backfill.** Until that happens the matrix
  shows a year of sessions with no attendees, and coverage reads 0%.
