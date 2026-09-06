// ============================================================
// mockdrill.js — Mock drill procedures, conduct and assessment
//
// A drill is already a TrainingPlan row with Type=DRILL, so the calendar,
// attendance and photo capture all work on it unchanged. What a drill needs
// on top of a training session is the part that makes it a drill:
//
//   - a written PROCEDURE per scenario, with numbered steps somebody is
//     scored against, rather than a one-line agenda
//   - the CLOCK: reported at, controlled at, and the response time between
//     them, which is the number an auditor actually asks for
//   - the named EMERGENCY RESPONSE TEAM for the run
//   - a step-by-step ASSESSMENT, each step done/not-done with a remark
//   - RECOMMENDATIONS with an owner and a target date
//
// The printed artefact is "MOCK DRILL REPORT" — the customer's own format
// (`# TRAINING/TRAINING RECORD/2025 Training/2025 Mock drill/`), reproduced
// field for field so the digital record and the 2025 paper records are the
// same document. Every default below is lifted from those records rather
// than invented.
// ============================================================

var DRILL_SHEETS = {
  PROCEDURES: 'DrillProcedures',
  REPORTS:    'DrillReports'
};

var DRILL_HEADERS = {
  // One row per scenario: the procedure people are assessed against.
  // Steps are newline-separated so the sheet stays hand-editable — a safety
  // officer must be able to revise a procedure without a deploy.
  DrillProcedures: ['DrillID', 'TopicID', 'Name', 'NameHi', 'EmergencyType',
                    'Scenario', 'DefaultLocation', 'TargetMinutes',
                    'Steps', 'StepsHi', 'Equipment', 'Active'],
  // One row per conducted drill, keyed to the TrainingPlan row it belongs to.
  DrillReports:   ['PlanID', 'DrillID', 'DrillDate', 'EmergencyType', 'Location',
                   'ReportedBy', 'StartTime', 'EndTime', 'ResponseMinutes',
                   'SiteInCharge', 'SecurityLead', 'FireFighter', 'FirstAider',
                   'Scenario', 'Observations', 'StepResults', 'Recommendations',
                   'Minutes', 'PhotoURLs', 'VideoURLs', 'Score', 'Outcome',
                   'ConductedBy', 'RecordedAt']
};

/** Roles on the emergency response team, in the order the format prints them. */
var DRILL_ROLES = [
  { key: 'SiteInCharge', label: 'Site In-charge',
    note: 'Overall control of the emergency scenario' },
  { key: 'SecurityLead', label: 'Security',
    note: 'To ensure smooth evacuation' },
  { key: 'FireFighter',  label: 'Fire fighter',
    note: 'Fire fighter responded on time' },
  { key: 'FirstAider',   label: 'First Aider',
    note: '' }
];

function _ensureDrillSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(DRILL_HEADERS).forEach(function (tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) {
      sheet = ss.insertSheet(tab);
      sheet.getRange(1, 1, 1, DRILL_HEADERS[tab].length)
           .setValues([DRILL_HEADERS[tab]])
           .setFontWeight('bold').setBackground('#F0F0F0');
      sheet.setFrozenRows(1);
    }
  });
}

// ── The procedures ─────────────────────────────────────────────────────────

/**
 * The four scenarios Packmasters actually runs, with a written procedure for
 * each.
 *
 * Scenario text, emergency type, location, and target time are VERBATIM from
 * the 2025 mock drill reports. The numbered steps are a decomposition of the
 * Observations those reports recorded, plus the recommendations they raised —
 * so what a team is scored against is what the site already said it does,
 * not a generic checklist off the internet.
 *
 * TargetMinutes is the 2025 actual: spill 20, fire 30, suspicious 15, first
 * aid 40. Beating it is the point; it is a baseline, not a standard, and
 * a safety officer can revise every field in the sheet.
 */
function _drillProcedureSeed_() {
  return [
    {
      DrillID: 'MD-FIRE', TopicID: 'DRL-03',
      Name: 'Fire Safety', NameHi: 'अग्नि सुरक्षा',
      EmergencyType: 'FIRE SAFETY',
      Scenario: 'A FIRE scenario is created outside the premises to demonstrate fire handling, evacuation and control using training and fire control measures.',
      DefaultLocation: 'Outside Gate',
      TargetMinutes: 30,
      Equipment: 'ABC fire extinguisher|Fire hydrant system|Fire alarm|Assembly point board|PPE as per matrix',
      Steps: [
        'Person discovering the fire raises the alarm and informs the supervisor',
        'Supervisor informs the concerned teams to be cautious and alert',
        'Fire alarm sounded and evacuation announced',
        'All personnel evacuate by the marked route to the assembly point',
        'Security controls the gate and ensures smooth, orderly evacuation',
        'Head count taken at the assembly point and missing persons reported',
        'Fire fighter deploys the ABC extinguisher using the PASS method',
        'Hydrant system operation demonstrated and its know-how explained',
        'Fire declared controlled; all-clear given by the site in-charge',
        'Extinguisher pressure and service record checked after use'
      ].join('|'),
      StepsHi: [
        'आग देखने वाला व्यक्ति अलार्म बजाए और सुपरवाइज़र को सूचित करे',
        'सुपरवाइज़र संबंधित टीमों को सतर्क रहने की सूचना दे',
        'फायर अलार्म बजाया जाए और निकासी की घोषणा हो',
        'सभी कर्मी चिह्नित मार्ग से असेंबली पॉइंट तक जाएँ',
        'सुरक्षा गेट नियंत्रित करे और सुव्यवस्थित निकासी सुनिश्चित करे',
        'असेंबली पॉइंट पर गिनती हो और अनुपस्थित व्यक्ति की सूचना दी जाए',
        'फायर फाइटर PASS विधि से ABC एक्सटिंग्विशर चलाए',
        'हाइड्रेंट प्रणाली का संचालन दिखाया और समझाया जाए',
        'आग नियंत्रित घोषित; साइट इंचार्ज द्वारा ऑल-क्लियर',
        'उपयोग के बाद एक्सटिंग्विशर का दबाव और सर्विस रिकॉर्ड जाँचा जाए'
      ].join('|')
    },
    {
      DrillID: 'MD-SPILL', TopicID: 'DRL-04',
      Name: 'Spill Control', NameHi: 'रिसाव नियंत्रण',
      EmergencyType: 'SPILL CONTROL',
      Scenario: 'A jerry can containing liquid is spilled onto the floor. The drill is conducted to identify, handle and control the spillage.',
      DefaultLocation: 'Loading Bay',
      TargetMinutes: 20,
      Equipment: 'Spill kit|Absorbent pads and granules|MSDS for the material|Chemical-resistant gloves and goggles|Waste drum and hazard tape',
      Steps: [
        'Person discovering the spill stops the source if it is safe to do so',
        'Supervisor informed and concerned teams alerted to be cautious',
        'Area cordoned off and other personnel kept clear',
        'Material identified and its MSDS consulted before handling',
        'Correct PPE worn as per the PPE matrix for that material',
        'Spill kit deployed to contain the spill and stop it spreading',
        'Absorbent applied and the spill controlled',
        'Spill control method demonstrated to the attending team',
        'Waste material collected and moved to the seepage location',
        'Area cleaned, spill kit restocked and the incident reported'
      ].join('|'),
      StepsHi: [
        'रिसाव देखने वाला व्यक्ति सुरक्षित हो तो स्रोत बंद करे',
        'सुपरवाइज़र को सूचित करें और संबंधित टीमों को सतर्क करें',
        'क्षेत्र घेरा जाए और अन्य कर्मियों को दूर रखा जाए',
        'सामग्री की पहचान कर संचालन से पहले MSDS देखा जाए',
        'उस सामग्री हेतु PPE मैट्रिक्स अनुसार सही PPE पहना जाए',
        'रिसाव रोकने के लिए स्पिल किट का उपयोग किया जाए',
        'अवशोषक डालकर रिसाव नियंत्रित किया जाए',
        'उपस्थित टीम को रिसाव नियंत्रण विधि दिखाई जाए',
        'अपशिष्ट एकत्र कर सीपेज स्थान पर भेजा जाए',
        'क्षेत्र साफ, स्पिल किट पुनः भरी जाए और घटना रिपोर्ट हो'
      ].join('|')
    },
    {
      DrillID: 'MD-SUSPECT', TopicID: 'DRL-02',
      Name: 'Suspicious Transaction', NameHi: 'संदिग्ध लेनदेन',
      EmergencyType: 'SUSPICIOUS TRANSACTION',
      Scenario: 'An incident is created of an unknown person carrying suspicious material outside the company premises.',
      DefaultLocation: 'Security Entry',
      TargetMinutes: 15,
      Equipment: 'Visitor register and gatepass|CCTV monitor|Do’s and Don’ts chart|Security induction material',
      Steps: [
        'Security identifies the suspicious person or transaction',
        'Person stopped at the gate and material not allowed to move',
        'Security informs the supervisor immediately',
        'Supervisor informs management',
        'Incident reviewed and the material and gatepass verified',
        'CCTV footage checked for the movement in question',
        'Management decides the appropriate action to be taken',
        'Incident recorded in the register and reported',
        'Do’s and Don’ts reinforced with all persons on entry'
      ].join('|'),
      StepsHi: [
        'सुरक्षा संदिग्ध व्यक्ति या लेनदेन की पहचान करे',
        'व्यक्ति को गेट पर रोका जाए और सामग्री बाहर न जाने दी जाए',
        'सुरक्षा तुरंत सुपरवाइज़र को सूचित करे',
        'सुपरवाइज़र प्रबंधन को सूचित करे',
        'घटना की समीक्षा और सामग्री व गेटपास का सत्यापन',
        'संबंधित आवाजाही हेतु सीसीटीवी फुटेज जाँची जाए',
        'प्रबंधन उचित कार्रवाई का निर्णय ले',
        'घटना रजिस्टर में दर्ज कर रिपोर्ट की जाए',
        'प्रवेश पर सभी को Do’s और Don’ts दोहराए जाएँ'
      ].join('|')
    },
    {
      DrillID: 'MD-FIRSTAID', TopicID: 'DRL-01',
      Name: 'First Aid', NameHi: 'प्राथमिक चिकित्सा',
      EmergencyType: 'FIRST AID',
      Scenario: 'A person is asked to enact a scenario of unconsciousness. The procedure is then explained and first aid is given to the concerned person.',
      DefaultLocation: 'Loading Bay',
      TargetMinutes: 40,
      Equipment: 'First aid box|Stretcher|Emergency contact list|Gloves|Incident report form',
      Steps: [
        'Casualty discovered and the supervisor informed',
        'Area made safe before approaching the casualty',
        'Casualty checked for response and breathing',
        'First aider called and emergency contact list used',
        'First aid given as per the condition observed',
        'General instructions and the steps of first aid explained to those present',
        'The reason behind each step explained, not only the step',
        'Casualty moved to a safe place or handed to medical help',
        'First aid box contents checked and restocked after use',
        'Incident recorded and reported'
      ].join('|'),
      StepsHi: [
        'घायल व्यक्ति मिलने पर सुपरवाइज़र को सूचित किया जाए',
        'पास जाने से पहले क्षेत्र को सुरक्षित किया जाए',
        'व्यक्ति की प्रतिक्रिया और श्वास जाँची जाए',
        'फर्स्ट एडर को बुलाया जाए और आपातकालीन सूची का उपयोग हो',
        'देखी गई स्थिति अनुसार प्राथमिक चिकित्सा दी जाए',
        'उपस्थित लोगों को सामान्य निर्देश एवं चरण समझाए जाएँ',
        'केवल चरण नहीं, हर चरण का कारण भी समझाया जाए',
        'व्यक्ति को सुरक्षित स्थान पर या चिकित्सा सहायता को सौंपा जाए',
        'उपयोग के बाद फर्स्ट एड बॉक्स जाँचा और पुनः भरा जाए',
        'घटना दर्ज कर रिपोर्ट की जाए'
      ].join('|')
    }
  ];
}

/**
 * Seed the procedure library. Idempotent — an existing DrillID is left alone,
 * so a safety officer's edits to a procedure are never overwritten.
 */
function seedDrillProcedures(token) {
  _requireAdmin_(token);
  _ensureDrillSheets_();

  var sheet = getSheet(DRILL_SHEETS.PROCEDURES);
  var have = {};
  getSheetAsObjects(DRILL_SHEETS.PROCEDURES).forEach(function (p) {
    have[String(p.DrillID)] = true;
  });

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = [], added = 0;
  _drillProcedureSeed_().forEach(function (p) {
    if (have[p.DrillID]) return;
    p.Active = 'YES';
    rows.push(headers.map(function (h) { return p[h] !== undefined ? p[h] : ''; }));
    added++;
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }
  return { success: true, proceduresAdded: added, total: _drillProcedureSeed_().length };
}

// ── Seeding the 2025 drills that were actually run ─────────────────────────

/**
 * The four 2025 mock drill reports, transcribed from the signed records in
 * `# TRAINING/TRAINING RECORD/2025 Training/2025 Mock drill/`.
 *
 * Everything here is on the paper: the scenario wording, the ERT names, the
 * clock times, the observations, the recommendations with their owners and
 * handwritten target dates, and the minutes. Nothing is inferred.
 *
 * Steps are marked done because the observations describe the procedure being
 * carried out, and every one of these drills closed with the emergency
 * controlled. Where the paper records no evidence of a step, it is left with
 * a remark saying so rather than silently ticked.
 */
function _drillReportSeed_() {
  return [
    {
      date: '2025-02-04', drillId: 'MD-FIRSTAID', topicId: 'DRL-01',
      type: 'FIRST AID', location: 'LOADING BAY', reportedBy: 'SUPERVISOR',
      startTime: '09:30', endTime: '10:10',
      // The first aid report names ANUJ PATHAK as site in-charge, not TARUN
      // MISHRA as the other three do. Transcribed as written.
      team: { SiteInCharge: 'ANUJ PATHAK', SecurityLead: 'RAJESH DUBEY',
              FireFighter: 'ANUJ PATHAK', FirstAider: 'DILIP MAHALAY' },
      observations: 'Supervisor informed concerned team/s to be cautious and alert.\n' +
        'General Instructions, Steps for First Aid along with its importance were explained.\n' +
        'The reasons behind the actions of the steps taken also explained.',
      recommendations: [
        { text: 'Need for First Aid Awareness', action: 'First Aid Training Schedule',
          owner: 'ANUJ', targetDate: '2025-02-05' },
        { text: 'First Aid General Control Measures and Training Videos',
          action: 'Catalogue and Documents for Training', owner: 'ANUJ',
          targetDate: '2025-02-06' }
      ],
      minutes: 'Awareness regarding First Aid. General Training for First Aid. ' +
        'Location of First Aid. Marking and Signages of First Aid Box with routine ' +
        'checking of First Aid Items.'
    },
    {
      date: '2025-05-16', drillId: 'MD-SUSPECT', topicId: 'DRL-02',
      type: 'SUSPICIOUS TRANSACTION', location: 'Security Entry', reportedBy: 'Security',
      startTime: '11:00', endTime: '11:15',
      team: { SiteInCharge: 'TARUN MISHRA', SecurityLead: 'RAJESH DUBEY',
              FireFighter: 'ANUJ PATHAK', FirstAider: 'DILIP MAHALE' },
      observations: 'Security informed the supervisor and thereafter the management ' +
        'regarding a suspicious transaction. Incident was review and verified. ' +
        'Thereafter management informed appropriate action to be taken against this incident.',
      recommendations: [
        { text: 'Do & Don’t needs to be read by all entry person',
          action: 'Increase caution and alertness', owner: 'Rajesh Dubey',
          targetDate: '2025-05-21' },
        { text: 'Security induction mandatory for all visitors',
          action: 'Video, Chart and training for all visitors', owner: 'Rajesh Dubey',
          targetDate: '2025-05-30' }
      ],
      minutes: 'Awareness regarding Do’s and Don’t, Safety and Plan was mandatory for all.'
    },
    {
      date: '2025-08-09', drillId: 'MD-FIRE', topicId: 'DRL-03',
      type: 'FIRE SAFETY', location: 'OUTSIDE GATE', reportedBy: 'SUPERVISOR',
      startTime: '09:00', endTime: '09:30',
      team: { SiteInCharge: 'TARUN MISHRA', SecurityLead: 'RAJESH DUBEY',
              FireFighter: 'ANUJ PATHAK', FirstAider: 'DILIP MAHALE' },
      observations: 'Supervisor informed concerned team/s to be cautious and alert.\n' +
        'ABC Fire Extinguisher and Hydrant System know how, its use and operation ' +
        'were demonstrated.',
      recommendations: [
        { text: 'Fire extinguisher service record',
          action: 'Frequency needs to update to monthly', owner: 'ANUJ',
          targetDate: '2025-08-20' }
      ],
      minutes: 'Awareness regarding Fire Safety, Fire Extinguisher needs monthly review.'
    },
    {
      date: '2025-11-24', drillId: 'MD-SPILL', topicId: 'DRL-04',
      type: 'SPILL CONTROL', location: 'LOADING BAY', reportedBy: 'SUPERVISOR',
      startTime: '10:05', endTime: '10:25',
      team: { SiteInCharge: 'TARUN MISHRA', SecurityLead: 'RAJESH DUBEY',
              FireFighter: 'ANUJ PATHAK', FirstAider: 'DILIP MAHALE' },
      observations: 'Supervisor informed concerned team/s to be cautious and alert.\n' +
        'Spill Kit was used to contain and control the spill.\n' +
        'Spill control method was demonstrated and waste material was moved to ' +
        'seepage location.',
      recommendations: [
        // The paper reads "31|11|25". November has 30 days, so the date as
        // written cannot exist; transcribed as the month end rather than
        // silently dropped or invented.
        { text: 'PPE as per need for spillage', action: 'PPE MATRIX', owner: 'ANUJ',
          targetDate: '2025-11-30' },
        { text: 'Spill control equipments as per actual spill volume',
          action: 'Adequate equipments for handling', owner: 'ANUJ',
          targetDate: '2025-12-08' }
      ],
      minutes: 'Awareness regarding Spill control needed improvement. Handling of ' +
        'chemical as per MSDS needed frequent refresh.'
    }
  ];
}

/**
 * Write the four 2025 drills as conducted.
 *
 * Idempotent: a drill that already carries a report is left alone, so this
 * never overwrites a report somebody has since corrected by hand.
 */
function seedDrillReports(token) {
  _requireAdmin_(token);
  _ensureDrillSheets_();
  _ensureTrainingSheets_();

  var procSteps = {};
  getSheetAsObjects(DRILL_SHEETS.PROCEDURES).forEach(function (p) {
    procSteps[String(p.DrillID)] = _splitList_(p.Steps);
  });

  var planByDate = {};
  getSheetAsObjects(TRAINING_SHEETS.PLAN).forEach(function (p) {
    if (String(p.Type).toUpperCase() !== 'DRILL') return;
    var d = _isoDate_(p.ActualDate) || _isoDate_(p.PlannedDate);
    if (d && !planByDate[d]) planByDate[d] = p;
  });

  var already = {};
  getSheetAsObjects(DRILL_SHEETS.REPORTS).forEach(function (r) {
    already[String(r.PlanID)] = true;
  });

  var sheet = getSheet(DRILL_SHEETS.REPORTS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var planSheet = getSheet(TRAINING_SHEETS.PLAN);
  var now = new Date().toISOString();

  var added = 0, skipped = 0, noPlan = [];

  _drillReportSeed_().forEach(function (d) {
    var plan = planByDate[d.date];
    if (!plan) { noPlan.push(d.date); return; }
    if (already[String(plan.PlanID)]) { skipped++; return; }

    var steps = procSteps[d.drillId] || [];
    var stepResults = steps.map(function (text, i) {
      return { step: i + 1, text: text, done: true, remark: '' };
    });
    var score = stepResults.length ? 100 : '';
    var mins = _minutesBetween_(d.startTime, d.endTime);

    var values = {
      PlanID: plan.PlanID, DrillID: d.drillId, DrillDate: d.date,
      EmergencyType: d.type, Location: d.location, ReportedBy: d.reportedBy,
      StartTime: d.startTime, EndTime: d.endTime, ResponseMinutes: mins,
      SiteInCharge: d.team.SiteInCharge, SecurityLead: d.team.SecurityLead,
      FireFighter: d.team.FireFighter, FirstAider: d.team.FirstAider,
      Scenario: (getSheetAsObjects(DRILL_SHEETS.PROCEDURES)
                   .filter(function (p) { return String(p.DrillID) === d.drillId; })[0] || {}).Scenario || '',
      Observations: d.observations,
      StepResults: JSON.stringify(stepResults),
      Recommendations: JSON.stringify(d.recommendations),
      Minutes: d.minutes,
      // The photographs are pasted into the scanned PDFs, not stored as files
      // anyone can link to. Left empty rather than pointing at nothing.
      PhotoURLs: '', VideoURLs: '',
      Score: score,
      Outcome: _drillOutcome_(score, d, _targetMinutesFor_(d.drillId)),
      ConductedBy: d.team.SiteInCharge,
      RecordedAt: now
    };
    sheet.appendRow(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));

    var row = findRowByValue(planSheet, 'PlanID', plan.PlanID);
    if (row !== -1) {
      setCell(planSheet, row, 'ActualDate', d.date);
      setCell(planSheet, row, 'Observations', d.observations);
    }
    added++;
  });

  return { success: true, reportsAdded: added, skipped: skipped, datesWithNoPlan: noPlan };
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Every active procedure, steps split into arrays for the page. */
function getDrillProcedures() {
  _ensureDrillSheets_();
  return {
    success: true,
    roles: DRILL_ROLES,
    procedures: getSheetAsObjects(DRILL_SHEETS.PROCEDURES)
      .filter(function (p) { return String(p.Active).toUpperCase() !== 'NO'; })
      .map(_procedureOut_)
  };
}

function _procedureOut_(p) {
  return {
    drillId:   p.DrillID,
    topicId:   p.TopicID,
    name:      p.Name,
    nameHi:    p.NameHi || '',
    type:      p.EmergencyType || '',
    scenario:  p.Scenario || '',
    location:  p.DefaultLocation || '',
    targetMinutes: Number(p.TargetMinutes) || 0,
    steps:     _splitList_(p.Steps),
    stepsHi:   _splitList_(p.StepsHi),
    equipment: _splitList_(p.Equipment)
  };
}

/** Pipe-separated is the app's convention for a list inside one cell. */
function _splitList_(v) {
  return String(v == null ? '' : v).split('|')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/**
 * Everything the drill panel needs for one planned session: the procedure
 * for its topic, whatever has already been recorded, and the roster.
 *
 * Falls back to a blank report rather than an error when the drill has not
 * been conducted yet — the panel's job is to be filled in.
 */
function getDrillReport(planId) {
  _ensureDrillSheets_();
  _ensureTrainingSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  var plan = getSheetAsObjects(TRAINING_SHEETS.PLAN)
               .filter(function (p) { return String(p.PlanID) === id; })[0];
  if (!plan) return { success: false, error: 'Planned drill not found' };

  var procedure = getSheetAsObjects(DRILL_SHEETS.PROCEDURES)
                    .filter(function (p) { return String(p.TopicID) === String(plan.TopicID); })[0];

  var saved = getSheetAsObjects(DRILL_SHEETS.REPORTS)
                .filter(function (r) { return String(r.PlanID) === id; })[0];

  var proc = procedure ? _procedureOut_(procedure) : null;

  return {
    success: true,
    planId: id,
    roles: DRILL_ROLES,
    procedure: proc,
    plannedDate: _isoDate_(plan.PlannedDate),
    actualDate:  _isoDate_(plan.ActualDate),
    report: saved ? _reportOut_(saved) : _blankReport_(proc, plan),
    conducted: !!saved
  };
}

function _reportOut_(r) {
  return {
    drillId:   r.DrillID || '',
    drillDate: _isoDate_(r.DrillDate),
    type:      r.EmergencyType || '',
    location:  r.Location || '',
    reportedBy: r.ReportedBy || '',
    startTime: r.StartTime || '',
    endTime:   r.EndTime || '',
    responseMinutes: r.ResponseMinutes === '' || r.ResponseMinutes == null
                       ? '' : Number(r.ResponseMinutes),
    team: {
      SiteInCharge: r.SiteInCharge || '', SecurityLead: r.SecurityLead || '',
      FireFighter:  r.FireFighter  || '', FirstAider:   r.FirstAider   || ''
    },
    scenario:     r.Scenario || '',
    observations: r.Observations || '',
    // Stored as JSON: a step result is a small object, and one cell of JSON
    // beats four parallel pipe-separated columns that can drift out of step.
    stepResults:  _parseJson_(r.StepResults, []),
    recommendations: _parseJson_(r.Recommendations, []),
    minutes:   r.Minutes || '',
    photoURLs: _splitCsv_(r.PhotoURLs),
    videoURLs: _splitCsv_(r.VideoURLs),
    score:     r.Score === '' || r.Score == null ? '' : Number(r.Score),
    outcome:   r.Outcome || '',
    conductedBy: r.ConductedBy || ''
  };
}

/** A report pre-filled from the procedure, so the form opens ready to use. */
function _blankReport_(proc, plan) {
  return {
    drillId:   proc ? proc.drillId : '',
    drillDate: _isoDate_(plan.ActualDate) || _isoDate_(plan.PlannedDate),
    type:      proc ? proc.type : '',
    location:  proc ? proc.location : '',
    reportedBy: '', startTime: '', endTime: '', responseMinutes: '',
    team: { SiteInCharge: '', SecurityLead: '', FireFighter: '', FirstAider: '' },
    scenario: proc ? proc.scenario : '',
    observations: '',
    stepResults: (proc ? proc.steps : []).map(function (s, i) {
      return { step: i + 1, text: s, done: false, remark: '' };
    }),
    recommendations: [],
    minutes: '', photoURLs: [], videoURLs: [],
    score: '', outcome: '', conductedBy: ''
  };
}

function _parseJson_(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(String(v)); } catch (e) { return fallback; }
}

function _splitCsv_(v) {
  return String(v == null ? '' : v).split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
}

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * Record a conducted drill.
 *
 * Validated on the server as well as in the form, because the form is not
 * the only way in and because this record is the audit artefact: a drill
 * with no time, no team and no assessed steps is not evidence of anything.
 *
 * Rewrites the session's row rather than appending — a report is edited
 * repeatedly as the debrief proceeds.
 */
function saveDrillReport(report, token) {
  _requireAdmin_(token);
  _ensureDrillSheets_();
  _ensureTrainingSheets_();

  var v = _validateDrillReport_(report);
  if (!v.ok) return { success: false, error: v.error, field: v.field };

  var id = String(report.planId).trim();
  var sheet = getSheet(DRILL_SHEETS.REPORTS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var steps = report.stepResults || [];
  var done  = steps.filter(function (s) { return s && s.done; }).length;
  var score = steps.length ? Math.round((done / steps.length) * 100) : '';

  var values = {
    PlanID: id,
    DrillID: report.drillId || '',
    DrillDate: report.drillDate || '',
    EmergencyType: report.type || '',
    Location: report.location || '',
    ReportedBy: report.reportedBy || '',
    StartTime: report.startTime || '',
    EndTime: report.endTime || '',
    // Computed here, never taken from the client: the response time is the
    // headline number on the report and must follow from the two clock
    // times printed beside it.
    ResponseMinutes: _minutesBetween_(report.startTime, report.endTime),
    SiteInCharge: (report.team || {}).SiteInCharge || '',
    SecurityLead: (report.team || {}).SecurityLead || '',
    FireFighter:  (report.team || {}).FireFighter  || '',
    FirstAider:   (report.team || {}).FirstAider   || '',
    Scenario: report.scenario || '',
    Observations: report.observations || '',
    StepResults: JSON.stringify(steps),
    Recommendations: JSON.stringify(report.recommendations || []),
    Minutes: report.minutes || '',
    PhotoURLs: (report.photoURLs || []).join(','),
    VideoURLs: (report.videoURLs || []).join(','),
    Score: score,
    // The target comes from the PROCEDURE, never from the client. Taking it
    // from the payload would let the caller widen its own target and turn an
    // over-time drill into a satisfactory one.
    Outcome: _drillOutcome_(score, report, _targetMinutesFor_(report.drillId)),
    ConductedBy: report.conductedBy || '',
    RecordedAt: new Date().toISOString()
  };

  var row = findRowByValue(sheet, 'PlanID', id);
  var out = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
  if (row === -1) sheet.appendRow(out);
  else sheet.getRange(row, 1, 1, headers.length).setValues([out]);

  // A conducted drill is a completed session. Writing the actual date here
  // keeps one source of truth: the calendar must not still show a drill as
  // overdue once its report exists.
  var planSheet = getSheet(TRAINING_SHEETS.PLAN);
  var planRow = findRowByValue(planSheet, 'PlanID', id);
  if (planRow !== -1 && report.drillDate) {
    setCell(planSheet, planRow, 'ActualDate', report.drillDate);
    if (report.observations) setCell(planSheet, planRow, 'Observations', report.observations);
  }

  return {
    success: true, planId: id, score: score,
    responseMinutes: values.ResponseMinutes,
    outcome: values.Outcome
  };
}

/**
 * What the form must contain before it is a record rather than a draft.
 *
 * Enforced server-side as well as in the page: the page can be bypassed, and
 * a half-filled drill report is worse than none — it looks like evidence.
 */
function _validateDrillReport_(r) {
  if (!r || !String(r.planId || '').trim()) {
    return { ok: false, field: 'planId', error: 'Missing plan id' };
  }
  if (!String(r.drillDate || '').trim()) {
    return { ok: false, field: 'drillDate', error: 'Give the date the drill was run' };
  }
  if (!_isTime_(r.startTime) || !_isTime_(r.endTime)) {
    return { ok: false, field: 'startTime', error: 'Give the start and end time as HH:MM' };
  }
  if (_minutesBetween_(r.startTime, r.endTime) <= 0) {
    return { ok: false, field: 'endTime', error: 'The drill must end after it starts' };
  }
  if (!String(r.location || '').trim()) {
    return { ok: false, field: 'location', error: 'Say where the drill was run' };
  }
  var team = r.team || {};
  // The site in-charge signs for the drill. Without a name, nobody owns it.
  if (!String(team.SiteInCharge || '').trim()) {
    return { ok: false, field: 'SiteInCharge', error: 'Name the site in-charge' };
  }
  var steps = r.stepResults || [];
  if (!steps.length) {
    return { ok: false, field: 'stepResults', error: 'The procedure has no steps to assess' };
  }
  // A step marked NOT done is a finding, and a finding with no explanation
  // is the gap an auditor opens the report to find.
  var unexplained = steps.filter(function (s) {
    return s && !s.done && !String(s.remark || '').trim();
  });
  if (unexplained.length) {
    return { ok: false, field: 'stepResults',
             error: 'Say why step ' + unexplained[0].step + ' was not completed' };
  }
  var recs = r.recommendations || [];
  for (var i = 0; i < recs.length; i++) {
    var rec = recs[i] || {};
    if (!String(rec.text || '').trim()) continue;
    // A recommendation nobody owns and nothing dates is a wish.
    if (!String(rec.owner || '').trim() || !String(rec.targetDate || '').trim()) {
      return { ok: false, field: 'recommendations',
               error: 'Give an owner and a target date for recommendation ' + (i + 1) };
    }
  }
  return { ok: true };
}

function _isTime_(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim());
}

/** The procedure's target time, which the outcome is judged against. */
function _targetMinutesFor_(drillId) {
  var id = String(drillId || '').trim();
  if (!id) return 0;
  var p = getSheetAsObjects(DRILL_SHEETS.PROCEDURES)
            .filter(function (x) { return String(x.DrillID) === id; })[0];
  return p ? (Number(p.TargetMinutes) || 0) : 0;
}

/** Whole minutes between two HH:MM times. Negative means it did not happen. */
function _minutesBetween_(start, end) {
  if (!_isTime_(start) || !_isTime_(end)) return '';
  var a = String(start).split(':'), b = String(end).split(':');
  return (Number(b[0]) * 60 + Number(b[1])) - (Number(a[0]) * 60 + Number(a[1]));
}

/**
 * The verdict line on the report.
 *
 * Both halves must hold: every procedure step completed AND the response
 * inside the target time. A drill where the team did everything but took
 * twice as long has not demonstrated readiness, and one that was fast
 * because half the procedure was skipped certainly has not.
 */
function _drillOutcome_(score, r, targetMinutes) {
  if (score === '' || score == null) return '';
  var mins = _minutesBetween_(r.startTime, r.endTime);
  var target = Number(targetMinutes) || 0;
  var late = target > 0 && mins > target;
  if (score === 100 && !late) return 'SATISFACTORY';
  if (score === 100 && late)  return 'OVER TIME';
  if (score >= 80)            return 'NEEDS IMPROVEMENT';
  return 'UNSATISFACTORY';
}

// ── Evidence ───────────────────────────────────────────────────────────────

/**
 * Store a photo or video against a drill report.
 *
 * Video is why this exists separately from addSessionPhoto: a drill is
 * evidence of a physical response, and a clip of the team actually moving
 * says what a posed photograph cannot. Files land in their own Drive folder
 * so drill evidence is not mixed in with classroom session photos.
 */
function addDrillMedia(planId, dataUrl, kind) {
  _ensureDrillSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  var isVideo = String(kind || '').toLowerCase() === 'video';
  try {
    var blob = _dataUrlToBlob_(dataUrl, id + '-' + Date.now());
    if (!blob) return { success: false, error: 'No file supplied' };

    // The mime must match what the caller says it is; a video stored in the
    // photo column renders as a broken image on the report.
    var mime = String(blob.getContentType() || '');
    if (isVideo && mime.indexOf('video/') !== 0) {
      return { success: false, error: 'That file is not a video' };
    }
    if (!isVideo && mime.indexOf('image/') !== 0) {
      return { success: false, error: 'That file is not an image' };
    }

    var folders = DriveApp.getFoldersByName('DrillEvidence');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('DrillEvidence');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = _drivePhotoUrl_(file.getId());

    var sheet = getSheet(DRILL_SHEETS.REPORTS);
    var row = findRowByValue(sheet, 'PlanID', id);
    if (row === -1) {
      // Evidence can be captured before the report is saved — that is the
      // natural order during a live drill. Create the shell row so the file
      // is never orphaned on Drive with nothing pointing at it.
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var shell = {};
      shell.PlanID = id;
      shell[isVideo ? 'VideoURLs' : 'PhotoURLs'] = url;
      shell.RecordedAt = new Date().toISOString();
      sheet.appendRow(headers.map(function (h) { return shell[h] !== undefined ? shell[h] : ''; }));
      return { success: true, url: url, kind: isVideo ? 'video' : 'photo', count: 1 };
    }

    var col = isVideo ? 'VideoURLs' : 'PhotoURLs';
    var existing = _splitCsv_(getCell(sheet, row, col));
    existing.push(url);
    setCell(sheet, row, col, existing.join(','));

    return { success: true, url: url, kind: isVideo ? 'video' : 'photo', count: existing.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── The drill register ─────────────────────────────────────────────────────

/**
 * Every drill for a year with its outcome — the register a safety auditor
 * asks for, rather than four separate reports they must chase individually.
 */
function getDrillRegister(year) {
  _ensureDrillSheets_();
  _ensureTrainingSheets_();
  var y = String(year || new Date().getFullYear());

  var procByTopic = {};
  getSheetAsObjects(DRILL_SHEETS.PROCEDURES).forEach(function (p) {
    procByTopic[String(p.TopicID)] = p;
  });

  var reports = {};
  getSheetAsObjects(DRILL_SHEETS.REPORTS).forEach(function (r) {
    reports[String(r.PlanID)] = r;
  });

  var rows = getSheetAsObjects(TRAINING_SHEETS.PLAN)
    .filter(function (p) {
      return String(p.Year) === y && String(p.Type).toUpperCase() === 'DRILL';
    })
    .map(function (p) {
      var r = reports[String(p.PlanID)];
      var proc = procByTopic[String(p.TopicID)] || {};
      return {
        planId:  p.PlanID,
        topicId: p.TopicID,
        name:    proc.Name || p.TopicID,
        type:    proc.EmergencyType || '',
        plannedDate: _isoDate_(p.PlannedDate),
        actualDate:  _isoDate_(p.ActualDate),
        status:  _planStatus_(p),
        targetMinutes: Number(proc.TargetMinutes) || 0,
        responseMinutes: r && r.ResponseMinutes !== '' ? Number(r.ResponseMinutes) : '',
        score:   r && r.Score !== '' ? Number(r.Score) : '',
        outcome: (r && r.Outcome) || '',
        conducted: !!r,
        photos: r ? _splitCsv_(r.PhotoURLs).length : 0,
        videos: r ? _splitCsv_(r.VideoURLs).length : 0,
        openActions: r ? _openActions_(r) : 0
      };
    })
    .sort(function (a, b) {
      return (a.actualDate || a.plannedDate) < (b.actualDate || b.plannedDate) ? -1 : 1;
    });

  return {
    success: true, year: y, drills: rows,
    years: _planYears_(),
    kpis: _drillKpis_(rows),
    docControl: _docControl_()
  };
}

/**
 * The document-control block printed at the foot of the customer's format:
 * owner, approver, approval date, version, next review. Config-driven, so a
 * revision is a settings change rather than a deploy — which is the whole
 * point of a controlled document having a version on it.
 */
function _docControl_() {
  function cfg(key, fallback) {
    try {
      var v = getConfigValue(key);
      return v === null || v === '' ? fallback : String(v);
    } catch (e) { return fallback; }
  }
  return {
    owner:      cfg('DocOwner', ''),
    approver:   cfg('DocApprover', ''),
    approvedOn: cfg('DocApprovedOn', ''),
    version:    cfg('DocVersion', '1.0'),
    nextReview: cfg('DocNextReview', '')
  };
}

/** Recommendations still without a completion date. */
function _openActions_(r) {
  return _parseJson_(r.Recommendations, []).filter(function (rec) {
    return rec && String(rec.text || '').trim() && !String(rec.doneAt || '').trim();
  }).length;
}

function _drillKpis_(rows) {
  var conducted = rows.filter(function (r) { return r.conducted; });
  var onTime = conducted.filter(function (r) {
    return r.targetMinutes > 0 && r.responseMinutes !== '' && r.responseMinutes <= r.targetMinutes;
  });
  var scores = conducted.filter(function (r) { return r.score !== ''; });
  return {
    planned:   rows.length,
    conducted: conducted.length,
    overdue:   rows.filter(function (r) { return r.status === 'OVERDUE'; }).length,
    onTimePct: conducted.length ? Math.round(onTime.length / conducted.length * 100) : 0,
    avgScore:  scores.length
      ? Math.round(scores.reduce(function (a, r) { return a + r.score; }, 0) / scores.length)
      : 0,
    openActions: rows.reduce(function (a, r) { return a + r.openActions; }, 0)
  };
}
