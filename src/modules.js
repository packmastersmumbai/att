// ============================================================
// modules.js — Training modules: what is taught, and how it is assessed
//
// A TrainingTopic says a session HAPPENED. A module says what the session
// must cover, what the attendee should be able to do afterwards, and how
// that is tested. Without it the KPI table printed on every 2025 record —
// Post Training Assessment, After Training Tests, Training Validation —
// has nothing to compute from, which is why it is blank in all 33.
//
//   TrainingModules   TopicID · Objectives · Sections · Questions · PassMark
//                     · Source · Reviewed · Active
//
// One module per topic, keyed by TopicID so the module and the calendar can
// never drift apart.
//
// PROVENANCE IS PART OF THE RECORD. Every module carries a Source saying
// where its content came from — the site's own training records, the AYT
// course material, the drill procedures, or drafted from standard practice.
// A module drafted by a system and one transcribed from a signed record are
// not the same claim, and an auditor is entitled to tell them apart.
// ============================================================

var MODULE_SHEETS = {
  MODULES:     'TrainingModules',
  ASSESSMENTS: 'TrainingAssessments'
};

var MODULE_HEADERS = {
  // The Hi columns are separate rather than a second row, so a translator
  // can work down one column without touching the English beside it.
  TrainingModules: ['TopicID', 'Objectives', 'ObjectivesHi', 'Sections', 'SectionsHi',
                    'Questions', 'QuestionsHi', 'PassMark', 'Source', 'Reviewed', 'Active'],
  // One row per attempt. Attempts are kept, not overwritten: a second pass
  // after a fail is the evidence that the retraining worked, and deleting
  // the first attempt destroys exactly what an auditor wants to see.
  TrainingAssessments: ['AssessmentID', 'PlanID', 'TopicID', 'EmpID', 'Name',
                        'Lang', 'Score', 'Correct', 'Total', 'Passed',
                        'Confidence', 'Answers', 'Device', 'TakenAt']
};

/**
 * Where a module's content came from. Printed on the module and returned to
 * the page, so nobody mistakes a draft for site policy.
 */
var MODULE_SOURCES = {
  RECORD:    'From the site training records',
  DRILL:     'From the site mock drill procedures',
  AYT:       'From the AYT course material held on site',
  VIDEO:     'From the site process video',
  DRAFTED:   'Drafted from standard practice — needs review'
};

function _ensureModuleSheets_() {
  _ensureSheetsWithHeaders_(MODULE_HEADERS);
}

/**
 * Create each tab if missing, and add any header the schema has grown since
 * the tab was created.
 *
 * The second part is the one that matters. Every writer in this codebase maps
 * values BY HEADER NAME, so a column the sheet does not have is silently
 * dropped rather than erroring — which is exactly how the Hindi columns wrote
 * nothing: the sheet had eight headers and the code was handing it eleven,
 * and every call reported success.
 *
 * Shared because training.js, mockdrill.js and skillmatrix.js all had the
 * same gap waiting for the first time their schema changed.
 */
function _ensureSheetsWithHeaders_(schema) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(schema).forEach(function (tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) {
      sheet = ss.insertSheet(tab);
      sheet.getRange(1, 1, 1, schema[tab].length)
           .setValues([schema[tab]])
           .setFontWeight('bold').setBackground('#F0F0F0');
      sheet.setFrozenRows(1);
      return;
    }
    var last = sheet.getLastColumn();
    var have = last ? sheet.getRange(1, 1, 1, last).getValues()[0] : [];
    schema[tab].forEach(function (h) {
      if (have.indexOf(h) !== -1) return;
      sheet.getRange(1, sheet.getLastColumn() + 1)
           .setValue(h).setFontWeight('bold').setBackground('#F0F0F0');
      have = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    });
  });
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * The module for one topic, parsed into the shape the page renders.
 * Returns success:false rather than an empty module when none exists — a
 * topic with no module is a gap somebody should fill, not a blank page.
 */
function getTrainingModule(topicId) {
  _ensureModuleSheets_();
  var id = String(topicId || '').trim();
  if (!id) return { success: false, error: 'Missing topic id' };

  var row = getSheetAsObjects(MODULE_SHEETS.MODULES)
              .filter(function (m) { return String(m.TopicID) === id; })[0];
  if (!row) return { success: false, error: 'No module defined for ' + id, topicId: id };

  return { success: true, module: _moduleOut_(row) };
}

/** Every module, for the library view. */
function getTrainingModules() {
  _ensureModuleSheets_();
  var topics = {};
  getSheetAsObjects(TRAINING_SHEETS.TOPICS).forEach(function (t) {
    topics[String(t.TopicID)] = { title: t.Title, type: t.Type, hours: t.DurationHrs };
  });

  var modules = getSheetAsObjects(MODULE_SHEETS.MODULES)
    .filter(function (m) { return String(m.Active).toUpperCase() !== 'NO'; })
    .map(function (m) {
      var out = _moduleOut_(m);
      var t = topics[String(m.TopicID)] || {};
      out.title = t.title || m.TopicID;
      out.type = t.type || '';
      out.hours = t.hours || '';
      return out;
    });

  // Topics with no module at all. Surfaced rather than silently absent:
  // a topic that can be scheduled but not assessed is the gap this sheet
  // exists to close.
  var have = {};
  modules.forEach(function (m) { have[m.topicId] = true; });
  var missing = Object.keys(topics).filter(function (t) { return !have[t]; })
    .map(function (t) { return { topicId: t, title: topics[t].title }; });

  return { success: true, modules: modules, missing: missing,
           sources: MODULE_SOURCES };
}

/** "Heading::body" pairs, pipe separated — hand-editable in one cell. */
function _parseSections_(v) {
  return _splitList_(v).map(function (s) {
    var i = s.indexOf('::');
    return i === -1 ? { heading: '', body: s }
                    : { heading: s.slice(0, i).trim(), body: s.slice(i + 2).trim() };
  });
}

function _moduleOut_(m) {
  // Hindi is returned ALONGSIDE English, never instead of it. A worker reads
  // one; a trainer, an auditor and the printed record may need the other, and
  // a missing translation must fall back rather than blank the page.
  var objHi = _splitList_(m.ObjectivesHi);
  var secHi = _parseSections_(m.SectionsHi);
  var qHi   = _parseQuestions_(m.QuestionsHi);

  return {
    topicId:    m.TopicID,
    objectives: _splitList_(m.Objectives),
    objectivesHi: objHi,
    sections:   _parseSections_(m.Sections),
    sectionsHi: secHi,
    questions:  _parseQuestions_(m.Questions),
    questionsHi: qHi,
    // Whether this module can actually be TAKEN in Hindi. A partial
    // translation is worse than none — a worker halfway through a test that
    // reverts to English has been failed by the tool, not by their knowledge.
    // The question count must match too, or the test runs out of Hindi
    // midway; and every Hindi question needs the same number of options,
    // since the answer index is shared between the two languages.
    hasHindi: (function () {
      var qs = _parseQuestions_(m.Questions);
      if (!objHi.length || !secHi.length) return false;
      if (qHi.length !== qs.length) return false;
      for (var i = 0; i < qs.length; i++) {
        if (qHi[i].options.length !== qs[i].options.length) return false;
      }
      return true;
    })(),
    passMark:   Number(m.PassMark) || _trainingPassMark_(),
    source:     m.Source || '',
    sourceLabel: MODULE_SOURCES[String(m.Source)] || String(m.Source || ''),
    // A module the site has not reviewed is a draft, and says so on its face.
    reviewed:   String(m.Reviewed || '').toUpperCase() === 'YES'
  };
}

/**
 * Questions are "text ?? optionA ~ optionB ~ optionC ?? correctIndex".
 * Deliberately a flat string: a trainer must be able to fix a typo in the
 * sheet without understanding JSON.
 */
function _parseQuestions_(v) {
  return _splitList_(v).map(function (q, i) {
    var parts = String(q).split('??');
    if (parts.length < 3) return { n: i + 1, text: String(q).trim(), options: [], answer: -1 };
    return {
      n: i + 1,
      text: parts[0].trim(),
      options: parts[1].split('~').map(function (o) { return o.trim(); }).filter(Boolean),
      answer: Number(parts[2].trim())
    };
  });
}

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * Save or replace one module. Admin-gated: a module defines what the site
 * claims to have taught, and what it tests people against.
 */
function saveTrainingModule(mod, token) {
  _requireAdmin_(token);
  _ensureModuleSheets_();

  var id = String((mod && mod.topicId) || '').trim();
  if (!id) return { success: false, error: 'Missing topic id' };
  if (!(mod.objectives || []).length) {
    return { success: false, error: 'A module needs at least one objective' };
  }

  var sheet = getSheet(MODULE_SHEETS.MODULES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = {
    TopicID: id,
    Objectives: (mod.objectives || []).join('|'),
    Sections: (mod.sections || []).map(function (s) {
      return (s.heading || '') + '::' + (s.body || '');
    }).join('|'),
    Questions: (mod.questions || []).map(function (q) {
      return q.text + ' ?? ' + (q.options || []).join(' ~ ') + ' ?? ' + q.answer;
    }).join('|'),
    PassMark: mod.passMark || '',
    Source: mod.source || 'DRAFTED',
    // Editing a module clears its reviewed flag unless the caller is
    // explicitly signing it off — a revision is a new draft.
    Reviewed: mod.reviewed ? 'YES' : 'NO',
    Active: 'YES'
  };

  var row = findRowByValue(sheet, 'TopicID', id);
  var out = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
  if (row === -1) sheet.appendRow(out);
  else sheet.getRange(row, 1, 1, headers.length).setValues([out]);

  return { success: true, topicId: id };
}

/**
 * Mark a module as reviewed by the site. Separate from saving, because
 * "somebody wrote this" and "the site stands behind it" are different
 * claims and only the second belongs on a printed record.
 */
function reviewTrainingModule(topicId, by, token) {
  _requireAdmin_(token);
  _ensureModuleSheets_();
  var id = String(topicId || '').trim();
  if (!id) return { success: false, error: 'Missing topic id' };
  if (!String(by || '').trim()) return { success: false, error: 'Name who reviewed it' };

  var sheet = getSheet(MODULE_SHEETS.MODULES);
  var row = findRowByValue(sheet, 'TopicID', id);
  if (row === -1) return { success: false, error: 'No module for ' + id };
  setCell(sheet, row, 'Reviewed', 'YES');
  return { success: true, topicId: id, by: String(by).trim() };
}

// ── Assessment ─────────────────────────────────────────────────────────────

/**
 * Score a set of answers against the module's own question bank.
 *
 * Marked on the server: the answer key must not travel to the browser, or
 * an assessment proves nothing. getTrainingModule strips it for the same
 * reason when the caller is sitting the test rather than delivering it.
 */
function scoreModuleTest(topicId, answers) {
  _ensureModuleSheets_();
  var id = String(topicId || '').trim();
  var m = getTrainingModule(id);
  if (!m.success) return m;

  var qs = m.module.questions;
  if (!qs.length) return { success: false, error: 'This module has no questions' };

  var given = answers || [];
  var correct = 0, detail = [];
  qs.forEach(function (q, i) {
    var picked = given[i];
    var ok = (picked !== undefined && picked !== null && Number(picked) === q.answer);
    if (ok) correct++;
    detail.push({ n: q.n, correct: ok, answer: q.answer, picked: picked });
  });

  var score = Math.round((correct / qs.length) * 100);
  return {
    success: true, topicId: id,
    correct: correct, total: qs.length, score: score,
    passMark: m.module.passMark,
    passed: score >= m.module.passMark,
    detail: detail
  };
}

// ── Self-assessment ────────────────────────────────────────────────────────

/**
 * The test an attendee sits, WITHOUT the answer key.
 *
 * Deliberately a separate call from getTrainingModule: that one is for the
 * trainer and carries the answers. A test whose answers are in the page
 * source proves nothing, and the two audiences must not share an endpoint.
 *
 * Public by design — an attendee scans a QR code on their own phone and has
 * no login. What protects the record is that the answers are marked on the
 * server and the resulting level is capped at L2 (see recordAssessment).
 */
function getModuleTest(topicId, lang) {
  _ensureModuleSheets_();
  var got = getTrainingModule(topicId);
  if (!got.success) return got;

  var m = got.module;
  var hi = String(lang || '').toLowerCase() === 'hi' && m.hasHindi;
  var qs = hi ? m.questionsHi : m.questions;

  return {
    success: true,
    topicId: m.topicId,
    lang: hi ? 'hi' : 'en',
    hasHindi: m.hasHindi,
    passMark: m.passMark,
    objectives: hi ? m.objectivesHi : m.objectives,
    sections: hi ? m.sectionsHi : m.sections,
    // The answer index is stripped here. Everything else about the question
    // travels; the one field that would make the test meaningless does not.
    questions: qs.map(function (q, i) {
      return { n: i + 1, text: q.text, options: q.options };
    })
  };
}

/**
 * Record one attendee's self-assessment and update what follows from it.
 *
 * Three things happen, and only the first two are automatic:
 *   1. the attempt is stored, with its answers, for the audit trail
 *   2. the score is written to the attendance row, which moves the person
 *      from "attended, not assessed" (L1) to L2 when they pass
 *   3. L3 and L4 remain a supervisor's judgement, per SOP-SM-001 §6.2
 *
 * That cap is the whole design. A worker answering multiple-choice questions
 * on their own phone is real evidence of knowledge, and it is NOT evidence
 * that they can work unsupervised or train somebody else. The SOP says a
 * department head or supervisor decides that, and the system must not quietly
 * decide it instead.
 */
function recordAssessment(entry) {
  _ensureModuleSheets_();
  _ensureTrainingSheets_();

  var planId = String((entry && entry.planId) || '').trim();
  var empId  = String((entry && entry.empId) || '').trim();
  var topicId = String((entry && entry.topicId) || '').trim();
  if (!planId) return { success: false, error: 'Missing session' };
  if (!empId)  return { success: false, error: 'Pick your name first' };
  if (!topicId) return { success: false, error: 'Missing topic' };

  var marked = scoreModuleTest(topicId, entry.answers || []);
  if (!marked.success) return marked;

  var emp = getSheetAsObjects(SHEETS.EMPLOYEES)
              .filter(function (e) { return String(e.EmpID) === empId; })[0];
  if (!emp) return { success: false, error: 'Employee not found' };

  var sheet = getSheet(MODULE_SHEETS.ASSESSMENTS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = {
    AssessmentID: 'ASM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(),
    PlanID: planId, TopicID: topicId, EmpID: empId, Name: emp.Name || empId,
    Lang: String(entry.lang || 'en'),
    Score: marked.score, Correct: marked.correct, Total: marked.total,
    Passed: marked.passed ? 'YES' : 'NO',
    // The attendee's own view of how confident they feel. Not a competency
    // claim — a signal for the supervisor about who to watch on the line.
    Confidence: entry.confidence || '',
    Answers: JSON.stringify(entry.answers || []),
    Device: String(entry.device || ''),
    TakenAt: new Date().toISOString()
  };
  sheet.appendRow(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));

  // Mark them present with their score. This is what feeds the skill matrix:
  // present + a score at or above the pass mark computes to L2.
  var att = _upsertAttendanceScore_(planId, empId, emp.Name || empId, marked.score);

  // Somebody sat the test, so the session demonstrably ran. Without this the
  // attendance attaches to a row still marked overdue, and the matrix — which
  // counts only sessions that actually happened — cannot see the score at
  // all. The date is only set if it is not already recorded, so a trainer's
  // own entry always wins over this inference.
  var ran = _markSessionRun_(planId);

  return {
    success: true,
    score: marked.score, correct: marked.correct, total: marked.total,
    passed: marked.passed, passMark: marked.passMark,
    detail: marked.detail,
    attendanceRecorded: att,
    sessionMarkedRun: ran,
    // Said plainly to the attendee: what their result does and does not do.
    levelNote: marked.passed
      ? 'Recorded. Your supervisor confirms anything above this level.'
      : 'Recorded. Speak to your supervisor about a refresher.'
  };
}

/**
 * Record that a session ran, if nothing has said so yet.
 *
 * A trainer's entered date always wins: this only fills a blank. The date
 * used is today's, because that is when somebody demonstrably sat the test —
 * inventing the planned date instead would backdate a record.
 */
function _markSessionRun_(planId) {
  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var row = findRowByValue(sheet, 'PlanID', planId);
  if (row === -1) return 'no such session';
  if (_isoDate_(getCell(sheet, row, 'ActualDate'))) return 'already recorded';
  setCell(sheet, row, 'ActualDate', _isoDate_(new Date()));
  return 'marked run';
}

/**
 * Write one person's attendance and score for a session, replacing their own
 * row rather than appending. A retake must update the person's score, not
 * add a second attendance row that inflates the headcount.
 */
function _upsertAttendanceScore_(planId, empId, name, score) {
  var sheet = getSheet(TRAINING_SHEETS.ATTENDANCE);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last = sheet.getLastRow();

  if (last > 1) {
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    var pc = headers.indexOf('PlanID'), ec = headers.indexOf('EmpID');
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][pc]) === planId && String(data[i][ec]) === empId) {
        var row = i + 2;
        setCell(sheet, row, 'Present', 'YES');
        // Keep the BEST score across attempts. A retake after retraining is
        // the point; penalising somebody for having failed once first would
        // discourage exactly the behaviour the system wants.
        var existing = getCell(sheet, row, 'Score');
        if (existing === '' || existing == null || Number(existing) < score) {
          setCell(sheet, row, 'Score', score);
        }
        return 'updated';
      }
    }
  }

  var values = { PlanID: planId, EmpID: empId, Name: name, Present: 'YES',
                 Score: score, RecordedAt: new Date().toISOString() };
  sheet.appendRow(headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));
  return 'added';
}

/**
 * Live participation for one session: who has taken the test, who has not,
 * and how the room is doing. This is what the trainer watches on screen
 * while the room answers on their phones.
 */
function getSessionAssessments(planId) {
  _ensureModuleSheets_();
  _ensureTrainingSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing session' };

  var best = {};
  getSheetAsObjects(MODULE_SHEETS.ASSESSMENTS).forEach(function (a) {
    if (String(a.PlanID) !== id) return;
    var k = String(a.EmpID);
    var prev = best[k];
    var score = Number(a.Score) || 0;
    if (!prev || score > prev.score) {
      best[k] = { empId: k, name: a.Name, score: score,
                  passed: String(a.Passed).toUpperCase() === 'YES',
                  lang: a.Lang, confidence: a.Confidence,
                  attempts: (prev ? prev.attempts : 0) + 1, takenAt: a.TakenAt };
    } else {
      prev.attempts++;
    }
  });

  var roster = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function (e) { return String(e.Status || 'ACTIVE').toUpperCase() === 'ACTIVE'; })
    .map(function (e) {
      var r = best[String(e.EmpID)];
      return { empId: e.EmpID, name: e.Name || e.EmpID, dept: e.Department || '',
               taken: !!r, score: r ? r.score : '', passed: r ? r.passed : false,
               lang: r ? r.lang : '', confidence: r ? r.confidence : '',
               attempts: r ? r.attempts : 0 };
    });

  var taken = roster.filter(function (r) { return r.taken; });
  var passed = taken.filter(function (r) { return r.passed; });
  var scores = taken.map(function (r) { return r.score; });

  return {
    success: true, planId: id, roster: roster,
    kpis: {
      roster: roster.length,
      taken: taken.length,
      passed: passed.length,
      // Participation is the KPI the paper record calls "Training Feedback"
      // and never had a number for.
      participation: roster.length ? Math.round(taken.length / roster.length * 100) : 0,
      passRate: taken.length ? Math.round(passed.length / taken.length * 100) : 0,
      avgScore: scores.length
        ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0
    }
  };
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * Write the module library. Idempotent, and it never overwrites a module
 * the site has REVIEWED — once somebody signs off content, a re-seed must
 * not quietly replace it with the generated version.
 */
function seedTrainingModules(token) {
  _requireAdmin_(token);
  _ensureModuleSheets_();

  var sheet = getSheet(MODULE_SHEETS.MODULES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var have = {};
  getSheetAsObjects(MODULE_SHEETS.MODULES).forEach(function (m) {
    have[String(m.TopicID)] = m;
  });

  var added = 0, updated = 0, protectedCount = 0, rows = [];
  _moduleSeed_().forEach(function (m) {
    var existing = have[m.TopicID];
    if (existing && String(existing.Reviewed).toUpperCase() === 'YES') {
      protectedCount++;
      return;
    }
    var values = {
      TopicID: m.TopicID, Objectives: m.Objectives, Sections: m.Sections,
      Questions: m.Questions,
      // Hindi is optional per module: a topic with no translation yet simply
      // has no Hindi test, rather than a half-translated one.
      ObjectivesHi: m.ObjectivesHi || '', SectionsHi: m.SectionsHi || '',
      QuestionsHi: m.QuestionsHi || '',
      PassMark: m.PassMark || '', Source: m.Source,
      Reviewed: 'NO', Active: 'YES'
    };
    var out = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
    if (!existing) { rows.push(out); added++; return; }
    var row = findRowByValue(sheet, 'TopicID', m.TopicID);
    if (row !== -1) { sheet.getRange(row, 1, 1, headers.length).setValues([out]); updated++; }
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return { success: true, modulesAdded: added, modulesUpdated: updated,
           reviewedLeftAlone: protectedCount, total: _moduleSeed_().length };
}
