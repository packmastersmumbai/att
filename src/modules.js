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

var MODULE_SHEETS = { MODULES: 'TrainingModules' };

var MODULE_HEADERS = {
  TrainingModules: ['TopicID', 'Objectives', 'Sections', 'Questions',
                    'PassMark', 'Source', 'Reviewed', 'Active']
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(MODULE_HEADERS).forEach(function (tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) {
      sheet = ss.insertSheet(tab);
      sheet.getRange(1, 1, 1, MODULE_HEADERS[tab].length)
           .setValues([MODULE_HEADERS[tab]])
           .setFontWeight('bold').setBackground('#F0F0F0');
      sheet.setFrozenRows(1);
    }
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

function _moduleOut_(m) {
  return {
    topicId:    m.TopicID,
    objectives: _splitList_(m.Objectives),
    // "Heading::body text" per section, pipe separated — one cell stays
    // hand-editable, which a JSON blob in a spreadsheet does not.
    sections:   _splitList_(m.Sections).map(function (s) {
      var i = s.indexOf('::');
      return i === -1 ? { heading: '', body: s }
                      : { heading: s.slice(0, i).trim(), body: s.slice(i + 2).trim() };
    }),
    questions:  _parseQuestions_(m.Questions),
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
      Questions: m.Questions, PassMark: m.PassMark || '', Source: m.Source,
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
