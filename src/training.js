// ============================================================
// training.js — Training calendar, topics and the annual plan
//
// Stage 1 of the training & competency system (see
// docs/superpowers/specs/2026-09-06-training-competency-design.md).
//
// Two sheets:
//   TrainingTopics — the library. What a session IS: agenda, method,
//                    duration, how long it stays valid.
//   TrainingPlan   — the calendar. One row per planned session, carrying
//                    BOTH the planned and the actual date so plan-vs-actual
//                    needs no reconciliation step and the grid renders
//                    straight from it.
//
// Mock drills are TrainingPlan rows with Type=DRILL against a DRL-* topic,
// so the drill calendar is the same grid filtered — not a second system.
// ============================================================

/** Sheet tab names. Kept here rather than in SHEETS so training stays optional. */
var TRAINING_SHEETS = {
  TOPICS:     'TrainingTopics',
  PLAN:       'TrainingPlan',
  ATTENDANCE: 'TrainingAttendance'
};

var TRAINING_HEADERS = {
  TrainingTopics: ['TopicID', 'Title', 'TitleHi', 'Type', 'Agenda', 'Method',
                   'DurationHrs', 'ValidityMonths', 'Active'],
  TrainingPlan:   ['PlanID', 'Year', 'TopicID', 'Type', 'PlannedDate', 'ActualDate',
                   'Status', 'Trainer', 'Content', 'Observations', 'PhotoURLs', 'Rating'],
  // One row per person per session. This is the table the skill matrix is
  // derived from, and the thing the 2025 paper records never captured.
  TrainingAttendance: ['PlanID', 'EmpID', 'Name', 'Present', 'Score', 'RecordedAt']
};

/**
 * Create the training tabs if they are missing. Idempotent — safe to call on
 * every request, which is how the page guarantees a usable sheet without a
 * separate setup step.
 */
function _ensureTrainingSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TRAINING_HEADERS).forEach(function (tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) {
      sheet = ss.insertSheet(tab);
      sheet.getRange(1, 1, 1, TRAINING_HEADERS[tab].length)
           .setValues([TRAINING_HEADERS[tab]])
           .setFontWeight('bold').setBackground('#F0F0F0');
      sheet.setFrozenRows(1);
    }
  });
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Everything the calendar page needs, in one call: the topic library and the
 * plan rows for one year. One round trip because GAS calls are slow and the
 * grid cannot render without both.
 */
function getTrainingCalendar(year) {
  _ensureTrainingSheets_();
  var y = String(year || new Date().getFullYear());
  var topics = getSheetAsObjects(TRAINING_SHEETS.TOPICS)
                 .filter(function (t) { return String(t.Active).toUpperCase() !== 'NO'; });
  var plan = getSheetAsObjects(TRAINING_SHEETS.PLAN)
               .filter(function (p) { return String(p.Year) === y; });

  return {
    success: true,
    year: y,
    topics: topics,
    plan: plan.map(function (p) {
      return {
        planId:      p.PlanID,
        topicId:     p.TopicID,
        type:        p.Type || 'TRAIN',
        plannedDate: _isoDate_(p.PlannedDate),
        actualDate:  _isoDate_(p.ActualDate),
        status:      _planStatus_(p),
        trainer:     p.Trainer || '',
        rating:      p.Rating || ''
      };
    }),
    years: _planYears_()
  };
}

/** Distinct years present in the plan, so the page can offer a year switcher. */
function _planYears_() {
  var seen = {};
  getSheetAsObjects(TRAINING_SHEETS.PLAN).forEach(function (p) {
    if (p.Year) seen[String(p.Year)] = true;
  });
  var years = Object.keys(seen).sort();
  return years.length ? years : [String(new Date().getFullYear())];
}

/**
 * Status of one planned session, derived — never stored. Storing it would go
 * stale the moment a date passes with nobody touching the row, which is
 * exactly when "overdue" needs to be true.
 */
function _planStatus_(p) {
  if (p.ActualDate) return 'DONE';
  var planned = _isoDate_(p.PlannedDate);
  if (!planned) return 'PLANNED';

  var today = _isoDate_(new Date());
  if (planned < today) return 'OVERDUE';
  // "Due" means this calendar month — the window a supervisor is acting in.
  if (planned.slice(0, 7) === today.slice(0, 7)) return 'DUE';
  return 'PLANNED';
}

/** Sheet dates arrive as Date objects or strings; normalise to YYYY-MM-DD. */
function _isoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (!s) return '';
  // dd/mm/yyyy — the format the 2025 records used.
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * Record that a planned session actually happened (or clear it again).
 * Stage 1 records the date, trainer and notes; attendance and scores arrive
 * in Stage 2.
 */
function saveTrainingSession(session) {
  _ensureTrainingSheets_();
  var id = String((session && session.planId) || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var row = findRowByValue(sheet, 'PlanID', id);
  if (row === -1) return { success: false, error: 'Planned session not found' };

  if (session.actualDate !== undefined) setCell(sheet, row, 'ActualDate', session.actualDate || '');
  if (session.trainer !== undefined)     setCell(sheet, row, 'Trainer', session.trainer || '');
  if (session.content !== undefined)     setCell(sheet, row, 'Content', session.content || '');
  if (session.observations !== undefined) setCell(sheet, row, 'Observations', session.observations || '');
  if (session.rating !== undefined)      setCell(sheet, row, 'Rating', session.rating || '');

  return { success: true, planId: id };
}

/** Add a session that was not on the plan — an unplanned or extra run. */
function addTrainingSession(session) {
  _ensureTrainingSheets_();
  var topicId = String((session && session.topicId) || '').trim();
  var planned = _isoDate_(session && session.plannedDate);
  if (!topicId) return { success: false, error: 'Pick a topic' };
  if (!planned) return { success: false, error: 'Pick a date' };

  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var year = planned.slice(0, 4);
  var id = 'PLN-' + year + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();

  var values = {
    PlanID: id, Year: year, TopicID: topicId,
    Type: session.type || 'TRAIN',
    PlannedDate: planned, ActualDate: session.actualDate || '',
    Status: '', Trainer: session.trainer || '', Content: '',
    Observations: '', PhotoURLs: '', Rating: ''
  };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));
  return { success: true, planId: id };
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * The 2025 topic library, taken verbatim from the 33 training records in
 * "# TRAINING/TRAINING RECORD/2025 Training". Agendas are the actual
 * TRAINING CONTENT lines, durations the actual recorded durations — not
 * invented, so an auditor comparing system to paper finds them identical.
 */
function _trainingTopicSeed_() {
  return [
    ['TRN-01', 'SOP, Product Safety', 'एसओपी, उत्पाद सुरक्षा', 'TRAIN',
     'Training for Filling, Packing, Calibration Activity|Standard Operating Procedure (SOP)|Importance of SOP and examples of SOP in daily life',
     'Classroom', 3.0, 12],
    ['TRN-02', "Quality Parameters, Do's & Don'ts", 'गुणवत्ता मानक', 'TRAIN',
     'Quality Parameters (Capping, Sealing, Name, Numbering, Quality & Cleaning)|Best practices for quality & checking',
     'Classroom + shop floor', 2.0, 12],
    ['TRN-03', 'Importance of Housekeeping, Waste Management', 'हाउसकीपिंग एवं अपशिष्ट प्रबंधन', 'TRAIN',
     'Importance of housekeeping|Waste & scrap handling|Waste & scrap management|Sorting and segregation',
     'Classroom + shop floor', 1.5, 12],
    ['TRN-04', 'SSOP, Best Practices, Cleanliness', 'एसएसओपी एवं स्वच्छता', 'TRAIN',
     'Training on SSOP, best practices, cleanliness|Handling of rejection and rework material|Dedicated area for respective processes|Number-based verification and validation of packaging material, bulk and FG|Line clearance, calibration and CLIT',
     'Classroom + shop floor', 1.5, 12],
    ['TRN-05', 'Electrical Safety', 'विद्युत सुरक्षा', 'TRAIN',
     'Electrical safety training|Procedure explained with regards to electrical safety|Compliance with regards to PPE and following PPE Matrix',
     'Classroom + demonstration', 1.0, 12],
    ['TRN-06', 'Incident Reporting', 'घटना रिपोर्टिंग', 'TRAIN',
     'Types of incidents|Reporting importance|Reporting method|Incident dashboard',
     'Classroom', 0.5, 12],
    ['TRN-07', 'Emergency Response, Fire Extinguisher, Hose', 'आपातकालीन प्रतिक्रिया एवं अग्निशमन', 'TRAIN',
     'Training on emergency response plan|Fire extinguisher and hose operation|PPE and PPE Matrix',
     'Classroom + drill', 1.0, 12],
    ['TRN-08', 'General Safety', 'सामान्य सुरक्षा', 'TRAIN',
     'General safety training|Procedure explained with regards to handling of general safety|Compliance with regards to PPE and following PPE Matrix',
     'Classroom', 1.0, 12],
    ['TRN-09', 'Suspicious Behaviour & Transaction', 'संदिग्ध व्यवहार एवं लेनदेन', 'TRAIN',
     'Impact and severity of suspicious behaviour and transactions|Methods to identify and report',
     'Classroom', 1.0, 12],
    ['TRN-10', 'Safety & PPE', 'सुरक्षा एवं पीपीई', 'TRAIN',
     'Safety awareness and importance|PPE compulsory use as per PPE Matrix|Importance of PPE and hierarchy of controls',
     'Classroom + demonstration', 1.0, 12],
    // Introduced in 2026 — the record is "01 TRAINING Product Stewardship &.doc",
    // dated 03/02/2026, 3 hrs. Not present in the 2025 library, so it carries
    // no historical cadence and is planned once a year.
    ['TRN-11', 'Product Stewardship', 'उत्पाद प्रबंधन', 'TRAIN',
     'Training for Filling, Packing|Standard Operating Procedure (SOP)|Importance of SOP and examples of SOP in daily life|Products safe, compliant, sustainable and reliable',
     'Classroom', 3.0, 12],
    // Mock drill scenarios — same library, Type=DRILL.
    ['DRL-01', 'Mock Drill — First Aid', 'मॉक ड्रिल — प्राथमिक चिकित्सा', 'DRILL',
     'Casualty identification|First aid response|Escalation and medical support', 'Drill', 0.5, 12],
    ['DRL-02', 'Mock Drill — Suspicious Transaction', 'मॉक ड्रिल — संदिग्ध लेनदेन', 'DRILL',
     'Scenario identification|Reporting chain|Containment', 'Drill', 0.5, 12],
    ['DRL-03', 'Mock Drill — Fire Safety', 'मॉक ड्रिल — अग्नि सुरक्षा', 'DRILL',
     'Alarm and evacuation|Assembly point roll call|Extinguisher and hose deployment', 'Drill', 0.5, 12],
    ['DRL-04', 'Mock Drill — Spill Control', 'मॉक ड्रिल — रिसाव नियंत्रण', 'DRILL',
     'Spill identification|Spill kit deployment|Containment and disposal as per MSDS', 'Drill', 0.5, 12],
    // Run in 2024 (15/10, inside the factory) but not in 2025. Kept in the
    // library because the scenario is real and the site has a written
    // procedure for it — a drill the site can run should not disappear from
    // the calendar just because it was skipped one year.
    ['DRL-05', 'Mock Drill — Earthquake', 'मॉक ड्रिल — भूकंप', 'DRILL',
     'Alarm signal and drop, cover, hold|Orderly single-file evacuation|Assembly point roll call', 'Drill', 0.5, 12]
  ].concat(_libraryTopicSeed_());
}

/**
 * Training that EXISTS but has not been scheduled — the QA course modules
 * and the process videos in "# TRAINING".
 *
 * Deliberately NOT in _trainingDateSeed_, so none of these appear on the
 * annual calendar or count towards adherence. Scheduling training nobody has
 * committed to running would make every one of them overdue on day one and
 * turn the adherence figure into noise.
 *
 * They are here so that when somebody IS trained on one, the session can be
 * recorded against a real topic and credit a real skill. Type VIDEO and
 * COURSE keep them off the TRAIN/DRILL calendar views while leaving them
 * available everywhere a topic is chosen.
 *
 * Durations are estimates, marked as such: none of these has a delivery
 * record to take an actual duration from.
 */
function _libraryTopicSeed_() {
  return [
    // ── Process videos (# TRAINING/Videos) ────────────────────────────────
    // These are the only training the site holds that is specific to the
    // Packaging and Labelling process skills, which otherwise have no
    // evidence source at all.
    ['VID-01', 'Ribbon Printer Roll Change', 'रिबन प्रिंटर रोल परिवर्तन', 'VIDEO',
     'Ribbon printer roll change procedure', 'Video', 0.25, 12],
    ['VID-02', 'Henkel Filling Line Nozzle', 'हेंकेल फिलिंग लाइन नोज़ल', 'VIDEO',
     'Filling line nozzle operation and change', 'Video', 0.25, 12],
    ['VID-03', 'Winder Rewinder Roll Change', 'वाइंडर रीवाइंडर रोल परिवर्तन', 'VIDEO',
     'Winder and rewinder roll change procedure', 'Video', 0.25, 12],
    ['VID-04', 'Sachet Packing — Pack of 5', 'सैशे पैकिंग — 5 का पैक', 'VIDEO',
     'Packing sachets in a pack of five', 'Video', 0.25, 12],
    ['VID-05', 'QR Labelling', 'क्यूआर लेबलिंग', 'VIDEO',
     'Applying and verifying QR labels', 'Video', 0.25, 12],
    ['VID-06', 'Weight and QR Stamp', 'वज़न एवं क्यूआर स्टाम्प', 'VIDEO',
     'Weight check and QR stamping', 'Video', 0.25, 12],
    ['VID-07', 'Henkel Label Printing', 'हेंकेल लेबल प्रिंटिंग', 'VIDEO',
     'Printing labels on the Henkel line', 'Video', 0.25, 12],
    ['VID-08', 'Leakage Testing', 'रिसाव परीक्षण', 'VIDEO',
     'Leakage testing procedure', 'Video', 0.25, 12],
    ['VID-09', 'Wrap-around Labelling Setting', 'रैप-अराउंड लेबलिंग सेटिंग', 'VIDEO',
     'Setting up the wrap-around labelling machine', 'Video', 0.25, 12],
    ['VID-10', 'Bottle Filling and Capping', 'बोतल भराई एवं कैपिंग', 'VIDEO',
     'Bottle filling and capping on the Yara line', 'Video', 0.25, 12],
    ['VID-11', 'Fire Training', 'अग्नि प्रशिक्षण', 'VIDEO',
     'Fire safety training video', 'Video', 0.5, 12],
    ['VID-12', 'Superprocure', 'सुपरप्रोक्योर', 'VIDEO',
     'Superprocure system walkthrough', 'Video', 0.5, 12],

    // ── QA course modules (# TRAINING/QA Course) ──────────────────────────
    // AYT India course material. Quality and management technique rather
    // than shop-floor process; relevant to supervisors and QA.
    ['QAC-01', 'Daily Rejection & Rework, COPQ', 'दैनिक अस्वीकृति एवं पुनःकार्य, COPQ', 'COURSE',
     'Daily rejection and rework report|PPM and graphs|Red bin analysis|Cost of poor quality',
     'Classroom', 2.0, 24],
    ['QAC-02', 'Skill Matrix', 'कौशल मैट्रिक्स', 'COURSE',
     'How to create a skill matrix|Skill matrix formats', 'Classroom', 1.0, 24],
    ['QAC-03', 'Office Filing & Storage System', 'कार्यालय फाइलिंग एवं भंडारण', 'COURSE',
     'Office filing and storage system', 'Classroom', 1.0, 24],
    ['QAC-04', '4M Change Management', '4M परिवर्तन प्रबंधन', 'COURSE',
     'Man, machine, material, method change management', 'Classroom', 1.5, 24],
    ['QAC-06', 'Cause & Effect (Fishbone) Diagram', 'कारण एवं प्रभाव आरेख', 'COURSE',
     'Cause and effect analysis|Fishbone diagram', 'Classroom', 1.5, 24],
    ['QAC-07', 'Quality & NPD Department', 'गुणवत्ता एवं एनपीडी विभाग', 'COURSE',
     'Quality and new product development department', 'Classroom', 1.0, 24],
    ['QAC-08', 'PPM, DPU and DPMO', 'PPM, DPU एवं DPMO', 'COURSE',
     'How to calculate PPM, DPU and DPMO', 'Classroom', 1.5, 24],
    ['QAC-09', '5S Champion Course', '5S चैंपियन कोर्स', 'COURSE',
     '5S for managers and supervisors|5S audit check sheet|Red tag and liquidation plan|Zone leaders',
     'Classroom', 3.0, 24],
    ['QAC-10', 'SOP, PCS, OPS and PCQT Formats', 'एसओपी, पीसीएस, ओपीएस एवं पीसीक्यूटी प्रारूप', 'COURSE',
     'Ready-to-use formats for SOP, PCS, OPS and PCQT', 'Classroom', 1.5, 24],
    ['QAC-11', 'Poison Test', 'पॉइज़न टेस्ट', 'COURSE',
     'Poison test in quality|Checking the effectiveness of quality inspection|8D CAPA',
     'Classroom', 1.5, 24],
    ['QAC-12', 'Pareto Analysis', 'पैरेटो विश्लेषण', 'COURSE',
     'Pareto analysis technique', 'Classroom', 1.0, 24]
  ];
}

/**
 * 2025 actual session dates, extracted from the record documents. Held as
 * dd/mm so the 2026 plan can be derived from the same table.
 *
 * One 2025 record (SOP Product Safety, file 17) carries no date in the
 * document, so 32 dated sessions are seeded rather than 33.
 */
function _trainingDateSeed_() {
  return {
    'TRN-01': ['10/01', '10/04', '01/08', '11/11'],
    'TRN-02': ['25/01', '10/05', '02/09', '05/12'],
    'TRN-03': ['17/01', '10/06', '04/10'],
    'TRN-04': ['10/02', '15/04', '15/07', '06/11'],
    'TRN-05': ['07/03', '30/07', '14/10', '17/12'],
    'TRN-06': ['20/04', '14/09'],
    'TRN-07': ['15/03', '18/06', '24/10'],
    'TRN-08': ['25/02', '10/08', '29/12'],
    'TRN-09': ['25/05', '24/09'],
    'TRN-10': ['24/03', '23/06', '18/11'],
    // No 2025 cadence — the topic was introduced in 2026, where the record
    // dates it 03/02. Carried forward as an annual session on that date.
    'TRN-11': ['03/02'],
    'DRL-01': ['04/02'],
    'DRL-02': ['16/05'],
    'DRL-03': ['09/08'],
    'DRL-04': ['24/11'],
    // From the 2024 drill (15/10). Not run in 2025, so 2025 seeds it as a
    // planned-but-missed session, which is what the record shows.
    'DRL-05': ['15/10']
  };
}

/**
 * Sessions that actually ran on a date OTHER than the derived one.
 *
 * The plan for a later year is derived from 2025's cadence, but a real
 * session happens when it happens. Where a record exists, the actual date
 * wins over the derivation — otherwise the calendar shows a session as
 * overdue on a date it was never held, and the one it WAS held on is absent.
 *
 * Keyed year -> topic -> [derived date, actual date].
 */
function _actualDateOverrides_() {
  return {
    '2026': {
      // "01 TRAINING RECORD 2026 PM SOP PRODUCT SAFETY TRAINING.doc",
      // dated 02/01/2026 — the derivation put it on 10/01.
      'TRN-01': [['2026-01-10', '2026-01-02']],
      // "01 TRAINING Product Stewardship &.doc", dated 03/02/2026.
      'TRN-11': [['2026-02-03', '2026-02-03']]
    }
  };
}

/**
 * Move a date into the target year, off the weekly off and off a holiday.
 *
 * Sunday is the only non-working day of the week — 2nd and 4th Saturdays are
 * half days but still worked, so only Sunday shifts. Holidays shift too: the
 * app already knows which dates those are, and scheduling training on
 * Republic Day is the kind of thing nobody notices until the day itself.
 *
 * Deliberately mechanical: next year's plan should be defensibly derived
 * from the last one rather than re-invented, and anything a human wants
 * moved, they move in the app.
 *
 * `holidays` is passed in rather than read here so seeding 36 sessions costs
 * one Config read instead of 36.
 */
function _planDateFor_(ddmm, year, holidays) {
  var parts = ddmm.split('/');
  var day = Number(parts[0]), month = Number(parts[1]);
  var off = holidays || {};

  // Step back off a day that does not exist in the target year (29 Feb).
  var d = new Date(year, month - 1, day);
  while (d.getMonth() !== month - 1) {
    day -= 1;
    d = new Date(year, month - 1, day);
  }

  // Walk forward to the next working day. Bounded at 10 so a pathological
  // holiday list cannot spin here — a fortnight of consecutive non-working
  // days is not a real calendar, and hanging the seeder would be worse than
  // scheduling one session badly.
  for (var i = 0; i < 10; i++) {
    var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (d.getDay() !== 0 && !off[iso]) return iso;
    d.setDate(d.getDate() + 1);
  }
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Holiday dates as a lookup, read once per seed rather than per session. */
function _holidayLookup_() {
  var map = {};
  try {
    getHolidays().dates.forEach(function (d) { map[d] = true; });
  } catch (e) {}
  return map;
}

/**
 * Seed the topic library and one year's plan.
 *
 * `year` 2025 writes the historical calendar with ActualDate set (those
 * sessions demonstrably happened — the records exist). Any later year writes
 * a plan with ActualDate blank, carrying each topic's 2025 month and
 * frequency forward.
 *
 * Idempotent: a year already present is skipped rather than duplicated, so
 * this can be wired to page load without a guard flag.
 */
function seedTrainingYear(year, token) {
  _requireAdmin_(token);
  _ensureTrainingSheets_();

  var y = Number(year);
  if (!y || y < 2000 || y > 2100) return { success: false, error: 'Bad year' };

  // Topics first — the plan references them.
  var topicSheet = getSheet(TRAINING_SHEETS.TOPICS);
  var haveTopics = {};
  getSheetAsObjects(TRAINING_SHEETS.TOPICS).forEach(function (t) { haveTopics[t.TopicID] = true; });
  var addedTopics = 0;
  _trainingTopicSeed_().forEach(function (t) {
    if (haveTopics[t[0]]) return;
    topicSheet.appendRow(t.concat(['YES']));
    addedTopics++;
  });

  var planSheet = getSheet(TRAINING_SHEETS.PLAN);
  var existing = getSheetAsObjects(TRAINING_SHEETS.PLAN)
                   .filter(function (p) { return String(p.Year) === String(y); });

  // A year already seeded is TOPPED UP, not skipped and not rewritten. A
  // topic added to the library later — Product Stewardship, the Earthquake
  // drill — would otherwise never reach a calendar that already exists, and
  // rewriting the year would destroy attendance and drill reports already
  // attached to its rows.
  var havePlanned = {};
  existing.forEach(function (p) {
    havePlanned[String(p.TopicID) + '|' + _isoDate_(p.PlannedDate)] = true;
  });

  var dates = _trainingDateSeed_();
  var headers = planSheet.getRange(1, 1, 1, planSheet.getLastColumn()).getValues()[0];
  var isHistory = (y === 2025);
  // Read once for the whole year rather than once per session.
  var holidays = _holidayLookup_();
  // Continue the numbering past whatever is already there, so a top-up
  // cannot mint a PlanID that already exists.
  var n = existing.length, rows = [], skippedExisting = 0;
  var overrides = (_actualDateOverrides_()[String(y)] || {});

  Object.keys(dates).forEach(function (topicId) {
    dates[topicId].forEach(function (ddmm) {
      var planned = _planDateFor_(ddmm, y, holidays);
      if (havePlanned[topicId + '|' + planned]) { skippedExisting++; return; }
      n++;

      // A record exists for this session on a date the derivation did not
      // predict. The actual date wins: otherwise the calendar shows the
      // session overdue on a day it was never held, and absent on the day
      // it was.
      var actual = isHistory ? planned : '';
      (overrides[topicId] || []).forEach(function (pair) {
        if (pair[0] === planned) actual = pair[1];
      });

      var values = {
        PlanID: 'PLN-' + y + '-' + ('00' + n).slice(-3),
        Year: y,
        TopicID: topicId,
        Type: topicId.indexOf('DRL') === 0 ? 'DRILL' : 'TRAIN',
        PlannedDate: planned,
        // 2025 is history: the session happened on the date in the record.
        ActualDate: actual,
        Status: '', Trainer: '', Content: '', Observations: '', PhotoURLs: '', Rating: ''
      };
      rows.push(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));
    });
  });

  if (rows.length) {
    planSheet.getRange(planSheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  // Correct the actual date on rows that already exist, where a record shows
  // the session ran on a different day than the derivation predicted. Done
  // in place so attendance and drill reports keep pointing at the same row.
  var corrected = 0;
  Object.keys(overrides).forEach(function (topicId) {
    overrides[topicId].forEach(function (pair) {
      existing.forEach(function (p) {
        if (String(p.TopicID) !== topicId) return;
        if (_isoDate_(p.PlannedDate) !== pair[0]) return;
        if (_isoDate_(p.ActualDate) === pair[1]) return;
        var row = findRowByValue(planSheet, 'PlanID', p.PlanID);
        if (row === -1) return;
        setCell(planSheet, row, 'ActualDate', pair[1]);
        corrected++;
      });
    });
  });

  return {
    success: true, year: y, topicsAdded: addedTopics, sessionsAdded: rows.length,
    alreadyPresent: skippedExisting, datesCorrected: corrected
  };
}

// ── Seeding 2025 attendance ────────────────────────────────────────────────

/**
 * The attendance that WAS typed into the 2025 records.
 *
 * Seven of the 33 Word documents carry a filled-in attendance table — the
 * other 26 are blank and exist only as ink on the scans. These 57 rows are
 * transcribed from those seven, keyed by the session date so they attach to
 * whichever plan row holds that date.
 *
 * Names are as written in the documents. They are matched to Employees by
 * name at seed time and anything that does not match is REPORTED, never
 * guessed: crediting the wrong person with safety training is precisely the
 * failure an audit is looking for. Six of these fourteen people are not on
 * the employee sheet at all, and 'RAJNI' is ambiguous.
 */
function _attendanceSeed_() {
  return [
    ['2025-03-07', ['ANUJ PATHAK', 'SATENDRA YADAV', 'ATUL WAGHMARE', 'TARUN MISHRA',
                    'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'KRIPASANKAR', 'AVINASH VASANT']],
    ['2025-03-15', ['TARUN MISHRA', 'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'KRIPASANKAR',
                    'AVINASH VASANT', 'ANUJ PATHAK', 'ATUL WAGHMARE', 'SATENDRA YADAV']],
    ['2025-06-18', ['TARUN MISHRA', 'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'ANUJ PATHAK',
                    'ATUL WAGHMARE', 'RIDDHI MESTRY', 'SANTOSH MAURYA', 'HARISH SINGH']],
    ['2025-07-30', ['ANUJ PATHAK', 'SATENDRA YADAV', 'ATUL WAGHMARE', 'TARUN MISHRA',
                    'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'KRIPASANKAR', 'AVINASH VASANT']],
    ['2025-10-14', ['ANUJ PATHAK', 'SATENDRA YADAV', 'ATUL WAGHMARE', 'TARUN MISHRA',
                    'ANITA RAJBHAR', 'SUMAN RAJBHAR']],
    ['2025-10-24', ['TARUN MISHRA', 'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'ANUJ PATHAK',
                    'ATUL WAGHMARE', 'RIDDHI MESTRY', 'SANTOSH MAURYA', 'HARISH SINGH']],
    ['2025-12-17', ['ANUJ PATHAK', 'HARISH SINGH', 'ATUL WAGHMARE', 'RAJNI', 'TARUN MISHRA',
                    'ANITA RAJBHAR', 'SUMAN RAJBHAR', 'RIDDHI MESTRY', 'ASHOK PATOLE',
                    'DILIP MAHALE', 'SANTOSH MAURYA']]
  ];
}

/**
 * Names in the 2025 records that correspond to somebody on the current
 * employee sheet under a different name.
 *
 * Supplied BY THE CUSTOMER, not inferred — the system has no way to know that
 * the person written as "Atul Waghmare" in a 2025 record is Shikha Kumar
 * today. Every entry here is a person the customer identified; a name absent
 * from this table stays unmatched and is reported rather than guessed.
 *
 * Held in Config key `NameAliases` when set, so a correction is a settings
 * change rather than a deploy. The values below are the defaults confirmed
 * on 2026-09-06.
 */
function _nameAliasDefaults_() {
  return {
    // Transposed spelling: the same person, written 'PATOLE' on the record
    // and 'POTALE' on the sheet.
    'ASHOK PATOLE':   'ASHOK POTALE',
    // Substitutions the customer supplied.
    'ATUL WAGHMARE':  'SHIKHA KUMAR',
    'SATENDRA YADAV': 'HARISH SINGH',
    'AVINASH VASANT': 'DILIP MAHALE',
    'KRIPASANKAR':    'DEEPAK NISHAD',
    'RIDDHI MESTRY':  'KHUSHI PASWAN'
  };
}

/**
 * Alias table: defaults above, overridden by Config `NameAliases` when set.
 * Format, one per line: `Name in the record = Name on the sheet`.
 */
function _nameAliases_() {
  var map = _nameAliasDefaults_();
  var raw;
  try { raw = String(getConfigValue('NameAliases') || '').trim(); } catch (e) { raw = ''; }
  if (!raw) return map;

  raw.split(/[\n;]+/).forEach(function (line) {
    var i = line.indexOf('=');
    if (i === -1) return;
    var from = line.slice(0, i).trim(), to = line.slice(i + 1).trim();
    // A blank right-hand side deliberately CLEARS an alias, so a wrong
    // default can be undone from settings rather than needing a deploy.
    if (from) map[from.toUpperCase()] = to;
  });
  return map;
}

/**
 * Write the 2025 attendance that the documents actually recorded.
 *
 * Exact name match only, after normalising case and spacing, plus the alias
 * table above. A near miss is NEVER accepted on its own: 'RAJNI' in the
 * records fuzzy-matches 'DHRUV RAJ NISHAD' on the employee sheet, which is a
 * different person — and a matrix that says the wrong worker is trained is
 * worse than one that admits it does not know.
 *
 * Unmatched names come back in `unmatched` so they can be aliased or added to
 * Employees, and the seed re-run. Idempotent: a session that already has rows
 * is left alone.
 */
function seedTrainingAttendance(token) {
  _requireAdmin_(token);
  _ensureTrainingSheets_();

  var byName = {};
  getSheetAsObjects(SHEETS.EMPLOYEES).forEach(function (e) {
    var k = _normName_(e.Name);
    // First writer wins; a duplicate name is reported rather than resolved.
    if (k && !byName[k]) byName[k] = e;
  });

  var planByDate = {};
  getSheetAsObjects(TRAINING_SHEETS.PLAN).forEach(function (p) {
    var d = _isoDate_(p.ActualDate) || _isoDate_(p.PlannedDate);
    if (d && !planByDate[d]) planByDate[d] = p;
  });

  var already = {};
  getSheetAsObjects(TRAINING_SHEETS.ATTENDANCE).forEach(function (a) {
    already[String(a.PlanID)] = true;
  });

  var sheet = getSheet(TRAINING_SHEETS.ATTENDANCE);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date().toISOString();
  var aliases = _nameAliases_();

  var rows = [], unmatched = {}, sessions = 0, skipped = 0, noPlan = [];
  var aliased = 0, merged = 0;

  _attendanceSeed_().forEach(function (entry) {
    var date = entry[0], names = entry[1];
    var plan = planByDate[date];
    if (!plan) { noPlan.push(date); return; }
    if (already[String(plan.PlanID)]) { skipped++; return; }

    var wrote = 0;
    // Two names in one session can now resolve to the same employee — Harish
    // Singh attends under his own name AND as the alias for Satendra Yadav.
    // One person cannot attend one session twice, and a duplicate row would
    // inflate every count downstream.
    var seen = {};
    names.forEach(function (n) {
      var alias = aliases[String(n).toUpperCase()];
      var emp = byName[_normName_(alias || n)];
      if (!emp && alias) {
        // An alias that points at nobody is a settings error, not a missing
        // person. Report the ORIGINAL name so it is recognisable on the page.
        unmatched[n + ' (aliased to ' + alias + ', who is not on the sheet)'] = true;
        return;
      }
      if (!emp) { unmatched[n] = true; return; }
      if (alias) aliased++;

      if (seen[String(emp.EmpID)]) { merged++; return; }
      seen[String(emp.EmpID)] = true;

      var values = {
        PlanID: plan.PlanID, EmpID: emp.EmpID, Name: emp.Name,
        Present: 'YES',
        // No score was recorded on paper. Blank means "not assessed", which
        // is the truth; a zero would read as a failed test on the matrix.
        Score: '',
        RecordedAt: now
      };
      rows.push(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));
      wrote++;
    });
    if (wrote) sessions++;
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return {
    success: true,
    sessions: sessions,
    rows: rows.length,
    skipped: skipped,
    datesWithNoPlan: noPlan,
    // Rows credited through the alias table rather than a direct name match.
    aliased: aliased,
    // Rows dropped because the alias resolved to somebody already present in
    // that session — reported rather than silently swallowed, since it means
    // the headcount on paper is higher than the headcount recorded.
    merged: merged,
    // The honest half of the result: who the documents name that the system
    // could not identify. Nothing was guessed for these.
    unmatched: Object.keys(unmatched).sort()
  };
}

/** Case- and space-insensitive name key. Deliberately NOT fuzzy. */
function _normName_(v) {
  return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '');
}

// ── Attendance (Stage 2) ───────────────────────────────────────────────────

/**
 * The roster for one session: every active employee, with whoever is already
 * marked present and their score.
 *
 * Driven off the existing Employees sheet rather than a second roster, so a
 * new joiner appears in training the same day they appear at the gate.
 */
function getSessionAttendance(planId) {
  _ensureTrainingSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  var marked = {};
  getSheetAsObjects(TRAINING_SHEETS.ATTENDANCE).forEach(function (a) {
    if (String(a.PlanID) === id) {
      marked[String(a.EmpID)] = {
        present: String(a.Present).toUpperCase() === 'YES',
        score:   a.Score === '' || a.Score == null ? '' : String(a.Score)
      };
    }
  });

  var roster = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function (e) { return String(e.Status || 'ACTIVE').toUpperCase() === 'ACTIVE'; })
    .map(function (e) {
      var m = marked[String(e.EmpID)] || { present: false, score: '' };
      return {
        empId: e.EmpID, name: e.Name || e.EmpID,
        dept: e.Department || '', jobRole: e.JobRole || '',
        present: m.present, score: m.score
      };
    });

  var plan = getSheetAsObjects(TRAINING_SHEETS.PLAN)
               .filter(function (p) { return String(p.PlanID) === id; })[0] || {};

  return {
    success: true, planId: id, roster: roster,
    passMark: _trainingPassMark_(),
    session: {
      observations: plan.Observations || '',
      photoURLs:    String(plan.PhotoURLs || '').split(',').filter(Boolean)
    }
  };
}

/** The score at or above which a person counts as assessed. Config-driven. */
function _trainingPassMark_() {
  try {
    var v = Number(getConfigValue('PassMark'));
    if (!isNaN(v) && v > 0) return v;
  } catch (e) {}
  return 70;
}

/**
 * Record who attended a session and what they scored.
 *
 * Rewrites this session's rows rather than appending, so saving twice cannot
 * double-count a person — the panel is edited repeatedly as a trainer works
 * down the list, and an append-only table would silently inflate every
 * downstream count.
 */
function saveSessionAttendance(planId, rows) {
  _ensureTrainingSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };
  if (!rows || !rows.length) rows = [];

  var sheet = getSheet(TRAINING_SHEETS.ATTENDANCE);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last = sheet.getLastRow();

  // Drop this session's existing rows, bottom-up so the indices stay valid.
  if (last > 1) {
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    var planCol = headers.indexOf('PlanID');
    for (var i = data.length - 1; i >= 0; i--) {
      if (String(data[i][planCol]) === id) sheet.deleteRow(i + 2);
    }
  }

  var now = new Date().toISOString();
  var out = rows.filter(function (r) { return r && r.empId && r.present; })
    .map(function (r) {
      var values = {
        PlanID: id, EmpID: r.empId, Name: r.name || '',
        Present: 'YES',
        // A blank score is not a zero — it means "not assessed", and storing
        // it as 0 would read as a failed test on the matrix.
        Score: (r.score === '' || r.score == null) ? '' : Number(r.score),
        RecordedAt: now
      };
      return headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
    });

  if (out.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, out.length, headers.length).setValues(out);
  }

  var pass = _trainingPassMark_();
  var scored = out.filter(function (r) { return r[headers.indexOf('Score')] !== ''; });
  return {
    success: true, planId: id,
    present: out.length,
    scored: scored.length,
    passed: scored.filter(function (r) { return Number(r[headers.indexOf('Score')]) >= pass; }).length
  };
}

/**
 * Store a session photo on Drive and append it to the plan row.
 *
 * Mirrors _storeVisitorPhoto_: same blob helper, same link-sharing, so
 * evidence photos behave like every other image the app stores.
 */
function addSessionPhoto(planId, dataUrl) {
  _ensureTrainingSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  try {
    var blob = _dataUrlToBlob_(dataUrl, id + '-' + Date.now());
    if (!blob) return { success: false, error: 'No image supplied' };

    var folders = DriveApp.getFoldersByName('TrainingPhotos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('TrainingPhotos');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = _drivePhotoUrl_(file.getId());

    var sheet = getSheet(TRAINING_SHEETS.PLAN);
    var row = findRowByValue(sheet, 'PlanID', id);
    if (row === -1) return { success: false, error: 'Session not found' };
    var existing = String(getCell(sheet, row, 'PhotoURLs') || '').split(',').filter(Boolean);
    existing.push(url);
    setCell(sheet, row, 'PhotoURLs', existing.join(','));

    return { success: true, url: url, count: existing.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
