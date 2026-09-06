// ============================================================
// skillmatrix.js — Competency levels, derived from attendance
//
// Stage 3 of the training & competency system (see
// docs/superpowers/specs/2026-09-06-training-competency-design.md §4.3, §5).
//
// The matrix is NOT a sheet. It is computed on read from
// TrainingAttendance joined to Skills.TopicIDs — 15 people × 14 skills is
// 210 cells, which is instant. Storing it would mean recompute-on-write,
// staleness, and a sync path to get wrong. The one thing not derivable is
// a supervisor's judgement, so that alone is stored:
//
//   Skills          SkillID · Name · NameHi · Group · TopicIDs · Active
//   SkillOverrides  EmpID · SkillID · Level · Reason · By · At
//
// The governing rule, from SOP-SM-001 §6.2: **attendance proposes, a
// supervisor confirms.** Attending sets a SUGGESTED level and flags the
// cell pending review; L3 and L4 are human judgements and are never
// reached automatically. An earlier draft computed all four levels from
// attendance, which contradicts the customer's own controlled document —
// an auditor comparing system to SOP would find the gap.
// ============================================================

var SKILL_SHEETS = {
  SKILLS:    'Skills',
  OVERRIDES: 'SkillOverrides'
};

var SKILL_HEADERS = {
  Skills:         ['SkillID', 'Name', 'NameHi', 'Group', 'TopicIDs', 'MinRequired', 'Active'],
  // One row per (EmpID, SkillID) a supervisor has ruled on. Reason/By/At
  // exist because an auditor's first question about a hand-set level is who
  // set it and on what basis.
  SkillOverrides: ['EmpID', 'SkillID', 'Level', 'Reason', 'By', 'At']
};

/** Levels, in order. Index is the rank; NA and '' sit outside the ladder. */
var SKILL_LEVELS = ['L1', 'L2', 'L3', 'L4'];

function _ensureSkillSheets_() {
  // Adds any header the schema has grown since the tab was made;
  // writers map by header name, so a missing column writes nothing.
  _ensureSheetsWithHeaders_(SKILL_HEADERS);

  // The per-role minimum reads Employees.JobRole, and the bootstrap only
  // writes headers on a NEW sheet — so on every existing install the column
  // is simply absent and every role silently falls back to the skill default.
  // _ensureEmployeeColumns_ already adds missing columns on employee save;
  // calling it here means the matrix does not depend on somebody having
  // edited an employee first. A failure degrades to the skill defaults,
  // which is a working matrix, so it must not take the page down.
  try { _ensureEmployeeColumns_(getSheet(SHEETS.EMPLOYEES)); } catch (e) {}
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * The whole matrix in one call: skills (optionally one group), people, and
 * a computed cell for every intersection.
 *
 * One round trip, because the page cannot render a partial matrix and GAS
 * calls are slow. The join is done here rather than client-side so the
 * printed artefact and the screen can never disagree.
 */
function getSkillMatrix(group) {
  _ensureSkillSheets_();
  _ensureTrainingSheets_();

  var wanted = String(group || '').trim();
  var skills = getSheetAsObjects(SKILL_SHEETS.SKILLS)
    .filter(function (s) { return String(s.Active).toUpperCase() !== 'NO'; })
    .filter(function (s) { return !wanted || String(s.Group || '') === wanted; });

  var people = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function (e) { return String(e.Status || 'ACTIVE').toUpperCase() === 'ACTIVE'; });

  // Topic validity, needed to decide whether a competency claim has lapsed.
  var validity = {};
  getSheetAsObjects(TRAINING_SHEETS.TOPICS).forEach(function (t) {
    validity[String(t.TopicID)] = Number(t.ValidityMonths) || 12;
  });

  // planId -> { topicId, actualDate }. Only sessions that actually ran can
  // credit a skill: a planned session teaches nobody.
  var plans = {};
  getSheetAsObjects(TRAINING_SHEETS.PLAN).forEach(function (p) {
    var actual = _isoDate_(p.ActualDate);
    if (actual) plans[String(p.PlanID)] = { topicId: String(p.TopicID), actualDate: actual };
  });

  // empId -> topicId -> latest { date, score }
  var byPerson = {};
  getSheetAsObjects(TRAINING_SHEETS.ATTENDANCE).forEach(function (a) {
    if (String(a.Present).toUpperCase() !== 'YES') return;
    var plan = plans[String(a.PlanID)];
    if (!plan) return;
    var emp = String(a.EmpID);
    byPerson[emp] = byPerson[emp] || {};
    var prev = byPerson[emp][plan.topicId];
    if (prev && prev.date >= plan.actualDate) return;
    byPerson[emp][plan.topicId] = {
      date:  plan.actualDate,
      // '' is "not assessed", which is not the same claim as a zero.
      score: (a.Score === '' || a.Score == null) ? '' : Number(a.Score)
    };
  });

  var overrides = {};
  getSheetAsObjects(SKILL_SHEETS.OVERRIDES).forEach(function (o) {
    overrides[String(o.EmpID) + '|' + String(o.SkillID)] = o;
  });

  var pass  = _trainingPassMark_();
  var today = _isoDate_(new Date());
  var byRole = _minByRole_();

  var rows = people.map(function (e) {
    var role = String(e.JobRole || '').trim();
    var cells = skills.map(function (s) {
      return _skillCell_({
        empId:      String(e.EmpID),
        // The minimum is a property of the ROLE, not of the skill — a
        // security guard is not short of a filling competency they were
        // never meant to have. The skill's own MinRequired is the default
        // for roles nobody has set a line for.
        skill:      s,
        minRequired: _minFor_(byRole, role, String(s.SkillID), s.MinRequired),
        attendance: byPerson[String(e.EmpID)] || {},
        validity:   validity,
        override:   overrides[String(e.EmpID) + '|' + String(s.SkillID)],
        passMark:   pass,
        today:      today
      });
    });

    var required = cells.filter(function (c) { return c.level !== 'NA'; });
    var gaps     = required.filter(function (c) { return c.gap; });
    return {
      empId:    e.EmpID,
      name:     e.Name || e.EmpID,
      dept:     e.Department || '',
      jobRole:  e.JobRole || '',
      photoUrl: e.PhotoURL || '',
      cells:    cells,
      gaps:     gaps.length,
      // The OVERALL column on F-HR-01. "MEETS" is a claim about every
      // required skill, so it must be false if even one falls short.
      overall:  gaps.length === 0 ? 'MEETS' : (gaps.length + ' GAP' + (gaps.length === 1 ? '' : 'S'))
    };
  });

  return {
    success: true,
    group:  wanted,
    groups: _skillGroups_(),
    skills: skills.map(function (s) {
      return {
        skillId:     s.SkillID,
        name:        s.Name,
        nameHi:      s.NameHi || '',
        group:       s.Group || '',
        minRequired: _normLevel_(s.MinRequired)
      };
    }),
    people:   rows,
    // Whether the minimums on this matrix are anybody's policy or just the
    // seeded defaults. The page marks the printed row "draft" when nobody
    // has set MinRequired, because an unsigned level printed as though it
    // were policy is exactly what an auditor is entitled to object to.
    minSource: _isEmptyObject_(byRole) ? 'DEFAULT' : 'CONFIG',
    passMark: pass,
    levelNames: _levelNames_(),
    kpis:     _matrixKpis_(rows),
    nextReview: _nextReviewDate_(today)
  };
}

/**
 * Per-role minimum levels, from Config key `MinRequired`.
 *
 * Format, one role per line:
 *   Packaging Operator: SKL-01=L3, SKL-16=NA
 *
 * Config rather than a sheet because it is a short policy statement that
 * changes at a Management Review, not per-person data. A role with no line
 * falls back to the skill's own MinRequired, so the matrix works before
 * anybody writes this — and gets sharper as they do.
 */
function _minByRole_() {
  var out = {};
  var raw;
  try { raw = String(getConfigValue('MinRequired') || '').trim(); } catch (e) { raw = ''; }
  if (!raw) return out;

  raw.split(/[\n;]+/).forEach(function (line) {
    var i = line.indexOf(':');
    if (i === -1) return;
    var role = line.slice(0, i).trim();
    if (!role) return;
    out[role] = out[role] || {};
    line.slice(i + 1).split(',').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var lvl = _normLevel_(kv[1]);
      if (lvl) out[role][kv[0].trim()] = lvl;
    });
  });
  return out;
}

/** GAS runs ES5 — no Object.keys().length shortcut worth reading. */
function _isEmptyObject_(o) {
  for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) return false; }
  return true;
}

/** The role's line if it has one, otherwise the skill's own default. */
function _minFor_(byRole, role, skillId, fallback) {
  var forRole = byRole[role];
  if (forRole && forRole[skillId]) return forRole[skillId];
  return fallback;
}

/** Distinct skill groups, so the page can offer a department filter. */
function _skillGroups_() {
  var seen = {};
  getSheetAsObjects(SKILL_SHEETS.SKILLS).forEach(function (s) {
    if (String(s.Active).toUpperCase() === 'NO') return;
    if (s.Group) seen[String(s.Group)] = true;
  });
  return Object.keys(seen).sort();
}

/**
 * One (person, skill) cell. This is §5 of the spec, in order — the order
 * matters, because an override must beat a computation and N.A. must beat
 * both (a skill outside someone's role is not a gap, it is not a question).
 */
function _skillCell_(o) {
  var skillId = String(o.skill.SkillID);
  var min     = _normLevel_(o.minRequired !== undefined ? o.minRequired : o.skill.MinRequired);

  var base = { skillId: skillId, level: '', source: '', flag: '', min: min, gap: false };

  // Not applicable to this role. Excluded from BOTH sides of coverage — a
  // skill nobody needs must not inflate the percentage either way.
  if (min === 'NA') {
    base.level = 'NA'; base.source = 'NA';
    return base;
  }

  if (o.override && _normLevel_(o.override.Level)) {
    base.level  = _normLevel_(o.override.Level);
    base.source = 'OVERRIDE';
    base.by     = o.override.By || '';
    base.reason = o.override.Reason || '';
    base.at     = _isoDate_(o.override.At);
    base.gap    = _below_(base.level, min);
    return base;
  }

  // Which topics credit this skill. One topic builds several skills and one
  // skill is built by several topics, so this is a list, not a key.
  var topicIds = String(o.skill.TopicIDs || '').split(',')
    .map(function (t) { return t.trim(); }).filter(Boolean);

  var latest = null, latestTopic = '';
  topicIds.forEach(function (tid) {
    var a = o.attendance[tid];
    if (!a) return;
    if (!latest || a.date > latest.date) { latest = a; latestTopic = tid; }
  });

  // Never trained. Deliberately NOT L1: L1 means the person sat the training
  // and has not yet demonstrated competence. Collapsing the two would make an
  // untrained worker indistinguishable from a trained one on the printed
  // matrix — the exact claim an auditor checks.
  if (!latest) {
    base.level = ''; base.source = 'NONE'; base.flag = 'NEVER_TRAINED'; base.gap = true;
    return base;
  }

  var level = (latest.score !== '' && Number(latest.score) >= o.passMark) ? 'L2' : 'L1';
  base.lastTrained = latest.date;
  base.lastScore   = latest.score;
  base.source      = 'COMPUTED';

  // A competency claim expires with the training behind it. Drop one level
  // rather than blanking it — the person did attend, and the record stands.
  var months = Number(o.validity[latestTopic] || 12);
  if (_monthsBetween_(latest.date, o.today) > months) {
    level = SKILL_LEVELS[Math.max(0, SKILL_LEVELS.indexOf(level) - 1)];
    base.flag = 'EXPIRED';
  } else {
    // Suggested, not confirmed. Per SOP §6.2 a level is a human assessment;
    // the system's job is to propose one and say so visibly.
    base.flag = 'PENDING';
  }

  base.level = level;
  base.gap   = _below_(level, min);
  return base;
}

/** Is `level` short of `min`? A blank level (never trained) always is. */
function _below_(level, min) {
  if (min === 'NA' || !min) return false;
  if (!level) return true;
  return SKILL_LEVELS.indexOf(level) < SKILL_LEVELS.indexOf(min);
}

/** Accept 'l3', 'L3', 3, 'NA', 'N.A.' — reject anything else as blank. */
function _normLevel_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase().replace(/\./g, '');
  if (!s) return '';
  if (s === 'NA') return 'NA';
  if (/^[1-4]$/.test(s)) return 'L' + s;
  return SKILL_LEVELS.indexOf(s) !== -1 ? s : '';
}

/** Whole months between two YYYY-MM-DD dates. */
function _monthsBetween_(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  var a = fromIso.split('-').map(Number), b = toIso.split('-').map(Number);
  var months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) months -= 1;   // the day of the month has not come round yet
  return months;
}

/** Level display names, overridable from Config without a deploy. */
function _levelNames_() {
  var d = { L1: 'Beginner', L2: 'Under supervision', L3: 'Independent', L4: 'Can train others' };
  try {
    var raw = String(getConfigValue('LevelNames') || '').trim();
    if (!raw) return d;
    // "Beginner|Under supervision|Independent|Can train others"
    var parts = raw.split('|');
    SKILL_LEVELS.forEach(function (l, i) { if (parts[i]) d[l] = parts[i].trim(); });
  } catch (e) {}
  return d;
}

/**
 * Coverage and gaps across the whole visible matrix.
 *
 * N.A. cells are excluded from numerator AND denominator. Counting them as
 * met would flatter every department that simply needs fewer skills.
 */
function _matrixKpis_(rows) {
  var required = 0, met = 0, gaps = 0, never = 0, expiring = 0, pending = 0;
  rows.forEach(function (r) {
    r.cells.forEach(function (c) {
      if (c.level === 'NA') return;
      required++;
      if (!c.gap) met++; else gaps++;
      if (c.flag === 'NEVER_TRAINED') never++;
      if (c.flag === 'EXPIRED') expiring++;
      if (c.flag === 'PENDING') pending++;
    });
  });
  return {
    people:   rows.length,
    required: required,
    coverage: required ? Math.round((met / required) * 100) : 0,
    gaps:     gaps,
    never:    never,
    expired:  expiring,
    pending:  pending
  };
}

/** End of the quarter — SOP §6.3 puts the review on a quarterly cadence. */
function _nextReviewDate_(todayIso) {
  var parts = String(todayIso).split('-').map(Number);
  var q     = Math.floor((parts[1] - 1) / 3);
  var endMonth = (q + 1) * 3;              // 3, 6, 9 or 12
  var last = new Date(parts[0], endMonth, 0);
  return Utilities.formatDate(last, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ── One person, one skill: the history behind a cell ────────────────────────

/**
 * Every session that credits this skill and whether the person was there.
 * This is what a supervisor reads before confirming or overriding a level —
 * the cell alone is a conclusion without its evidence.
 */
function getSkillHistory(empId, skillId) {
  _ensureSkillSheets_();
  _ensureTrainingSheets_();
  var emp = String(empId || '').trim();
  var sk  = String(skillId || '').trim();
  if (!emp || !sk) return { success: false, error: 'Missing employee or skill' };

  var skill = getSheetAsObjects(SKILL_SHEETS.SKILLS)
                .filter(function (s) { return String(s.SkillID) === sk; })[0];
  if (!skill) return { success: false, error: 'Skill not found' };

  var topicIds = String(skill.TopicIDs || '').split(',')
    .map(function (t) { return t.trim(); }).filter(Boolean);

  var titles = {};
  getSheetAsObjects(TRAINING_SHEETS.TOPICS).forEach(function (t) {
    titles[String(t.TopicID)] = t.Title || t.TopicID;
  });

  var attended = {};
  getSheetAsObjects(TRAINING_SHEETS.ATTENDANCE).forEach(function (a) {
    if (String(a.EmpID) === emp && String(a.Present).toUpperCase() === 'YES') {
      attended[String(a.PlanID)] = (a.Score === '' || a.Score == null) ? '' : String(a.Score);
    }
  });

  var sessions = getSheetAsObjects(TRAINING_SHEETS.PLAN)
    .filter(function (p) { return topicIds.indexOf(String(p.TopicID)) !== -1 && _isoDate_(p.ActualDate); })
    .map(function (p) {
      var present = Object.prototype.hasOwnProperty.call(attended, String(p.PlanID));
      return {
        planId:  p.PlanID,
        topicId: p.TopicID,
        title:   titles[String(p.TopicID)] || p.TopicID,
        date:    _isoDate_(p.ActualDate),
        trainer: p.Trainer || '',
        present: present,
        score:   present ? attended[String(p.PlanID)] : ''
      };
    })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var override = getSheetAsObjects(SKILL_SHEETS.OVERRIDES)
    .filter(function (o) { return String(o.EmpID) === emp && String(o.SkillID) === sk; })[0] || null;

  // The minimum belongs to this person's ROLE, not to the skill. Reporting
  // the skill's default here would have the panel tell a supervisor the
  // person must reach L3 when their role does not ask it of them.
  var person = getSheetAsObjects(SHEETS.EMPLOYEES)
                 .filter(function (e) { return String(e.EmpID) === emp; })[0] || {};
  var min = _minFor_(_minByRole_(), String(person.JobRole || '').trim(), sk, skill.MinRequired);

  return {
    success: true, empId: emp, skillId: sk,
    skillName: skill.Name || sk,
    minRequired: _normLevel_(min),
    passMark: _trainingPassMark_(),
    levelNames: _levelNames_(),
    sessions: sessions,
    override: override ? {
      level: _normLevel_(override.Level), reason: override.Reason || '',
      by: override.By || '', at: _isoDate_(override.At)
    } : null
  };
}

// ── Writing: the supervisor's judgement ────────────────────────────────────

/**
 * Confirm or override one person's level on one skill.
 *
 * Admin-gated, because this is the assertion an auditor holds the company
 * to. Setting a blank level clears the override and returns the cell to the
 * computed value, which is how a mistake is undone without a second concept.
 */
function setSkillLevel(entry, token) {
  _requireAdmin_(token);
  _ensureSkillSheets_();

  var emp = String((entry && entry.empId) || '').trim();
  var sk  = String((entry && entry.skillId) || '').trim();
  if (!emp || !sk) return { success: false, error: 'Missing employee or skill' };

  var level = _normLevel_(entry.level);
  if (entry.level && !level) return { success: false, error: 'Level must be L1–L4 or NA' };

  // A hand-set level without a stated basis is exactly what an audit finding
  // looks like, so the reason is required whenever a level is being asserted.
  var reason = String(entry.reason || '').trim();
  if (level && !reason) return { success: false, error: 'Give a reason for the level' };

  var sheet   = getSheet(SKILL_SHEETS.OVERRIDES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last    = sheet.getLastRow();
  var empCol  = headers.indexOf('EmpID'), skCol = headers.indexOf('SkillID');

  var found = -1;
  if (last > 1) {
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][empCol]) === emp && String(data[i][skCol]) === sk) { found = i + 2; break; }
    }
  }

  if (!level) {
    if (found !== -1) sheet.deleteRow(found);
    return { success: true, empId: emp, skillId: sk, level: '', cleared: true };
  }

  var values = {
    EmpID: emp, SkillID: sk, Level: level, Reason: reason,
    // Who signed off. The client passes the signed-in admin's name; there is
    // no server-side identity to fall back on, so record the role rather than
    // inventing a person.
    By: String(entry.by || '').trim() || 'Supervisor',
    At: new Date().toISOString()
  };
  var row = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });

  if (found !== -1) sheet.getRange(found, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);

  return { success: true, empId: emp, skillId: sk, level: level };
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * The skill library, derived from the content of the 2025 training records
 * and mapped to the topics that credit each one.
 *
 * MinRequired here is a DRAFT. Whoever owns SOP-SM-001 must sign both the
 * skill list and these levels off before this is shown to a client as
 * policy — an auditor's first question about a minimum level is who set it.
 */
function _skillSeed_() {
  return [
    // SkillID, Name, NameHi, Group, TopicIDs, MinRequired
    ['SKL-01', 'Filling',                 'भराई',                  'Packaging',   'TRN-01,TRN-04,VID-02,VID-10', 'L3'],
    ['SKL-02', 'Packing',                 'पैकिंग',                 'Packaging',   'TRN-01,TRN-02,VID-04', 'L3'],
    ['SKL-03', 'Calibration',             'अंशांकन',                'Packaging',   'TRN-01,TRN-04,VID-06', 'L2'],
    ['SKL-04', 'Capping',                 'कैपिंग',                 'Packaging',   'TRN-02,VID-10', 'L3'],
    ['SKL-05', 'Sealing',                 'सीलिंग',                 'Packaging',   'TRN-02,VID-08',        'L3'],
    ['SKL-06', 'Coding & Numbering',      'कोडिंग एवं नंबरिंग',      'Labelling',   'TRN-02,TRN-04,VID-01,VID-05,VID-06,VID-07', 'L3'],
    ['SKL-07', 'Visual Inspection',       'दृश्य निरीक्षण',          'Labelling',   'TRN-02,VID-08,QAC-11',        'L3'],
    ['SKL-08', 'Rejection & Rework',      'अस्वीकृति एवं पुनःकार्य',  'Labelling',   'TRN-04,QAC-01',        'L2'],
    ['SKL-09', 'Material Verification',   'सामग्री सत्यापन',         'Labelling',   'TRN-04,VID-05,VID-09',        'L2'],
    ['SKL-10', 'Line Clearance & CLIT',   'लाइन क्लीयरेंस एवं CLIT', 'Packaging',   'TRN-04,VID-03,QAC-04',        'L2'],
    // ── Site-wide competencies ────────────────────────────────────────────
    //
    // These four replaced eleven narrower ones (Waste Segregation, PPE
    // Compliance, Fire Response, Storage & Handling, Incident Reporting,
    // Security Awareness, First Aid Response, Spill Control, Electrical
    // Safety, Product Stewardship, Emergency Evacuation).
    //
    // The narrower set had two problems. "Common", "Security" and
    // "Engineering" had become buckets rather than departments — Common held
    // 8 of 21 skills and filtered nothing, while Security held one. And a
    // matrix of 21 columns asks a supervisor to make 21 judgements per person
    // where the site talks about four areas of responsibility.
    //
    // The trade is deliberate and worth stating: the matrix can no longer say
    // who specifically can deploy a spill kit, only who is competent in
    // emergency response. The DRILL record still holds the specific evidence —
    // who attended the spill drill and how they performed — so the detail is
    // not lost, it moves to where it is actually assessed.
    // All four sit in one group. Naming each group after its single skill
    // would repeat the bucket-of-one problem this change exists to fix —
    // Group exists to filter the matrix by department, and a group per skill
    // filters nothing. These four apply to every role on site, which is
    // exactly what makes them a department-independent set.
    ['SKL-11', 'Emergency Response',      'आपातकालीन प्रतिक्रिया',    'Site-wide',
     'TRN-07,DRL-01,DRL-02,DRL-03,DRL-04,DRL-05,VID-11', 'L2'],
    ['SKL-12', 'Safety & Security',       'सुरक्षा एवं संरक्षा',      'Site-wide',
     'TRN-IND,TRN-05,TRN-08,TRN-09,TRN-10,DRL-02', 'L2'],
    ['SKL-13', 'Waste Handling',          'अपशिष्ट प्रबंधन',          'Site-wide',
     'TRN-03,TRN-04,QAC-09,QAC-03', 'L2'],
    // Reporting and Responsibility are one skill rather than two: both are
    // about owning what you produce and saying so when it goes wrong.
    ['SKL-14', 'Reporting & Responsibility', 'रिपोर्टिंग एवं उत्तरदायित्व', 'Site-wide',
     'TRN-01,TRN-06,TRN-11,QAC-01,QAC-02,QAC-06,QAC-07,QAC-08,QAC-10,QAC-12,VID-12', 'L2']
  ];
}

/**
 * Bring the whole training module up in one action: the topic library, the
 * historical 2025 calendar, the derived plan for the current and next year,
 * and the skill library.
 *
 * One call rather than four because every one of them is idempotent and the
 * useful state is "all of it present" — asking a supervisor to run four
 * separate setup steps in the right order is how a module ends up half
 * seeded, which reads exactly like a bug.
 *
 * Years: 2025 is history (sessions carry their actual date, because the
 * records exist), and every later year is a plan derived from 2025's months
 * and frequencies.
 */
function setupTraining(token, years) {
  _requireAdmin_(token);

  var wanted = (years && years.length) ? years : _defaultSeedYears_();
  var out = { success: true, years: [], skillsAdded: 0, sessionsAdded: 0, topicsAdded: 0 };

  wanted.forEach(function (y) {
    var r = seedTrainingYear(y, token);
    if (!r.success) { out.success = false; out.error = r.error; return; }
    out.years.push({ year: r.year, sessionsAdded: r.sessionsAdded, note: r.note || '' });
    out.sessionsAdded += r.sessionsAdded || 0;
    out.topicsAdded   += r.topicsAdded || 0;
  });

  var s = seedSkills(token);
  if (s.success) out.skillsAdded = s.skillsAdded;

  // Drill procedures come up with everything else. A drill on the calendar
  // with no procedure behind it is a date nobody can be assessed against.
  try {
    var d = seedDrillProcedures(token);
    if (d.success) out.proceduresAdded = d.proceduresAdded;
  } catch (e) {
    out.proceduresAdded = 0;
  }

  // The 2025 history the documents actually recorded: the attendance typed
  // into seven of the 33 training records, and the four completed mock drill
  // reports. Both must run AFTER the plan and procedures exist, because they
  // attach to plan rows by date.
  try {
    var a = seedTrainingAttendance(token);
    if (a.success) {
      out.attendanceRows = a.rows;
      out.attendanceSessions = a.sessions;
      // Credited under a different name than the record used. Reported so a
      // substitution is visible rather than looking like a direct match.
      out.attendanceAliased = a.aliased;
      // Who the records name that the system could not identify. Surfaced
      // rather than swallowed: these are people whose training is on paper
      // but cannot be credited to anyone.
      out.unmatchedAttendees = a.unmatched;
    }
  } catch (e) {
    out.attendanceRows = 0;
  }

  try {
    var r = seedDrillReports(token);
    if (r.success) out.drillReportsAdded = r.reportsAdded;
  } catch (e) {
    out.drillReportsAdded = 0;
  }

  return out;
}

/**
 * 2025 (the year the paper records cover) plus this year and next, so the
 * calendar is never empty and next year's plan exists before it is needed.
 */
function _defaultSeedYears_() {
  var now = new Date().getFullYear();
  var years = [2025];
  [now, now + 1].forEach(function (y) {
    if (years.indexOf(y) === -1) years.push(y);
  });
  return years.sort();
}

/**
 * Seed the skill library. Idempotent — an existing SkillID is left alone,
 * so this never overwrites a level someone has since adjusted by hand.
 */
function seedSkills(token) {
  _requireAdmin_(token);
  _ensureSkillSheets_();

  var sheet = getSheet(SKILL_SHEETS.SKILLS);
  var seed = _skillSeed_();
  var wanted = {};
  seed.forEach(function (s) { wanted[s[0]] = true; });

  var have = {};
  getSheetAsObjects(SKILL_SHEETS.SKILLS).forEach(function (s) { have[String(s.SkillID)] = s; });

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var added = 0, updated = 0;

  seed.forEach(function (s) {
    var existing = have[s[0]];
    if (!existing) { sheet.appendRow(s.concat(['YES'])); added++; return; }
    // An id that has been REDEFINED — a narrow skill replaced by a broader
    // one under the same id — must be rewritten, not skipped. Skipping is
    // what a plain idempotency guard does, and it would leave the sheet
    // holding a name and a binding the code no longer knows about.
    if (String(existing.Name) === s[1] && String(existing.TopicIDs) === s[4]) return;
    var row = findRowByValue(sheet, 'SkillID', s[0]);
    if (row === -1) return;
    var values = { SkillID: s[0], Name: s[1], NameHi: s[2], Group: s[3],
                   TopicIDs: s[4], MinRequired: s[5], Active: 'YES' };
    // MinRequired is NOT overwritten once somebody has set it: that is
    // policy, and the seed's value is only a draft.
    if (existing.MinRequired) values.MinRequired = existing.MinRequired;
    sheet.getRange(row, 1, 1, headers.length)
         .setValues([headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; })]);
    updated++;
  });

  // Skills the seed no longer defines are RETIRED, not deleted. Deleting
  // would orphan any supervisor override recorded against them and destroy
  // the record that the competency was once assessed; Active=NO drops them
  // off the matrix while leaving the history intact.
  var retired = 0;
  Object.keys(have).forEach(function (id) {
    if (wanted[id]) return;
    if (String(have[id].Active).toUpperCase() === 'NO') return;
    var row = findRowByValue(sheet, 'SkillID', id);
    if (row !== -1) { setCell(sheet, row, 'Active', 'NO'); retired++; }
  });

  return { success: true, skillsAdded: added, skillsUpdated: updated,
           skillsRetired: retired, total: seed.length };
}
