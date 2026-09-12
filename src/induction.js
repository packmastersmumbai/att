/**
 * induction.js — the new-joiner induction programme (PM/FRM/HR-08).
 *
 * The app already had ONE half of this. TRN-IND is a self-taken, spoken,
 * bilingual test of the site rules, and it is the better half: a worker who
 * cannot read still gets inducted, and the score is evidence. What it cannot
 * do is evidence HR-08's actual control — nine sessions, each signed by the
 * department head who delivered it, on the day they delivered it. A test
 * proves the joiner understood the rules; it does not prove the organisation
 * delivered the programme.
 *
 * So this adds the second half and leaves the first alone:
 *   InductionRecord    one row per joiner  — the header of HR-08
 *   InductionSessions  nine rows per joiner — who delivered what, and when
 *
 * The nine sessions and the issued-items list are HR-08 verbatim. Nothing
 * here invents a session the form does not name.
 *
 * Clearance is the point of the form: "before any unsupervised work". So
 * clearInductionJoiner refuses while any session is unsigned, and records the
 * competence level assigned — which is HR-08's own last block.
 */

// PM/FRM/HR-08 governs this record. The CODE is stable; its revision and
// effective date are resolved at run time and never written as literals.
var INDUCTION_DOC_ = 'PM/FRM/HR-08';

var INDUCTION_SHEETS = {
  RECORD:   'InductionRecord',
  SESSIONS: 'InductionSessions'
};

var INDUCTION_HEADERS = {
  // Retention on HR-08 is "life of employment + 3 years", which is why this
  // is its own record and not a column on TrainingPlan: a plan row is pruned
  // with the training year, and this one outlives the person's employment.
  InductionRecord: ['EmpID', 'Name', 'Designation', 'Department', 'DateOfJoining',
                    'ReportingTo', 'Engagement', 'StartedAt', 'IssuedItems',
                    'OnJobBuddy', 'CompetenceLevel', 'RecordedInMatrixOn',
                    'NextAssessmentDue', 'ClearedAt', 'ClearedBy', 'DocStamp'],
  // One row per session per joiner. DeliveredBy is the person who signed, not
  // the department that owns the session — the form asks for a signature, and
  // a department cannot sign anything.
  InductionSessions: ['EmpID', 'SessionNo', 'Session', 'OwnerRole', 'DeliveredBy',
                      'DeliveredOn', 'DeliveredTime', 'SignedAt', 'Remarks']
};

/**
 * The nine sessions, verbatim from PM/FRM/HR-08 Rev 1.0.
 *
 * OwnerRole is the department the form names against each session. It is the
 * suggested signer, not a restriction — on a small site one person covers
 * several, and the record must say who ACTUALLY delivered it.
 */
function _inductionSessionSeed_() {
  return [
    [1, 'HR and admin — joining formalities, attendance, gate pass, leave rules, code of conduct, POSH policy', 'Office, HR & Purchase'],
    [2, 'Company profile, customers, IMS policy and the person\'s contribution to it', 'Plant In-charge'],
    [3, 'Site layout, emergency exits, assembly point, fire points, first aid box', 'Plant In-charge'],
    [4, 'Safety, HIRA of the work area, PPE issue and use, permit system', 'Maintenance / Safety Officer'],
    [5, '5S standard for the zone, red tag rule, cleaning schedule', 'Zone leader'],
    [6, 'Quality — inspection stages, non-conforming product, red bin, FIFO', 'Quality Assurance & Admin'],
    [7, 'Stores and dispatch — material identification, handling, documentation', 'Stores / Dispatch'],
    [8, 'Machine or work station — SOP, start-up check, abnormality reporting', 'Production & Operations'],
    [9, 'Environment — waste segregation, spill response, resource conservation', 'Plant In-charge']
  ];
}

/** The issued-items checklist, verbatim from HR-08. */
function _inductionIssuedItems_() {
  return ['Job description', 'PPE set', 'Employee ID / QR badge',
          'Locker', 'Uniform', 'Emergency contact card'];
}

/**
 * The controlled document this record is written against, resolved at run time.
 *
 * Never a literal: revisions change, and a hardcoded one silently becomes a
 * lie — the record then carries a version that was never current when it was
 * written. PMCore reads the published registry.
 *
 * A degraded stamp keeps its "(registry unverified)" text: that is what tells
 * an auditor the record was written during a fallback window. If PMCore is not
 * attached at all we say so rather than printing a bare code, because a record
 * citing an unverifiable document is the finding this exists to prevent.
 */
function _inductionStamp_() {
  try {
    return PMCore.stamp(INDUCTION_DOC_);
  } catch (e) {
    return INDUCTION_DOC_ + ' (revision unresolved — PMCore unavailable)';
  }
}

function _ensureInductionSheets_() {
  _ensureSheetsWithHeaders_(INDUCTION_HEADERS);
}

/**
 * Open the induction for one joiner, creating the nine unsigned session rows.
 *
 * Idempotent by EmpID: re-opening returns what is already there rather than a
 * second set of rows, because a person is inducted once and a duplicate would
 * make the first set look unfinished forever.
 */
function startInduction(empId, token) {
  _requireAdmin_(token);
  _ensureInductionSheets_();

  var id = String(empId || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var emp = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function (e) {
    return String(e.EmpID) === id;
  })[0];
  if (!emp) return { success: false, error: 'Employee not found' };

  var rec = getSheet(INDUCTION_SHEETS.RECORD);
  if (findRowByValue(rec, 'EmpID', id) !== -1) return getInduction(id);

  var headers = rec.getRange(1, 1, 1, rec.getLastColumn()).getValues()[0];
  var values = {
    EmpID: id,
    Name: emp.Name || id,
    // Taken from the employee master rather than retyped: HR-08 asks for
    // designation, department and engagement, and the master is where the
    // site already maintains them.
    Designation: emp.JobRole || '',
    Department: emp.Department || '',
    Engagement: emp.Engagement || '',
    DateOfJoining: '[TO BE ENTERED]',
    ReportingTo: '',
    StartedAt: new Date().toISOString(),
    IssuedItems: '',
    OnJobBuddy: '',
    CompetenceLevel: '',
    RecordedInMatrixOn: '',
    NextAssessmentDue: '',
    ClearedAt: '',
    ClearedBy: '',
    DocStamp: ''
  };
  rec.appendRow(headers.map(function (h) {
    return values[h] !== undefined ? values[h] : '';
  }));

  var ss = getSheet(INDUCTION_SHEETS.SESSIONS);
  var sh = ss.getRange(1, 1, 1, ss.getLastColumn()).getValues()[0];
  _inductionSessionSeed_().forEach(function (s) {
    var row = { EmpID: id, SessionNo: s[0], Session: s[1], OwnerRole: s[2],
                DeliveredBy: '', DeliveredOn: '', DeliveredTime: '',
                SignedAt: '', Remarks: '' };
    ss.appendRow(sh.map(function (h) {
      return row[h] !== undefined ? row[h] : '';
    }));
  });

  return getInduction(id);
}

/** One joiner's whole induction: the header, the nine sessions, and where it stands. */
function getInduction(empId) {
  _ensureInductionSheets_();
  var id = String(empId || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var rec = getSheetAsObjects(INDUCTION_SHEETS.RECORD).filter(function (r) {
    return String(r.EmpID) === id;
  })[0];
  if (!rec) return { success: true, started: false, empId: id, sessions: [] };

  var sessions = getSheetAsObjects(INDUCTION_SHEETS.SESSIONS)
    .filter(function (s) { return String(s.EmpID) === id; })
    .sort(function (a, b) { return Number(a.SessionNo) - Number(b.SessionNo); })
    .map(function (s) {
      return {
        sessionNo: Number(s.SessionNo),
        session: s.Session,
        ownerRole: s.OwnerRole,
        deliveredBy: s.DeliveredBy || '',
        deliveredOn: _isoDate_(s.DeliveredOn),
        deliveredTime: s.DeliveredTime || '',
        signed: !!String(s.SignedAt || '').trim(),
        remarks: s.Remarks || ''
      };
    });

  var signed = sessions.filter(function (s) { return s.signed; }).length;

  // The rules test is the OTHER half of the induction and already exists.
  // Reported here so one screen answers "is this person inducted", rather
  // than a supervisor checking two places and guessing.
  var test = _inductionTestResult_(id);

  return {
    success: true,
    started: true,
    empId: id,
    name: rec.Name || id,
    designation: rec.Designation || '',
    department: rec.Department || '',
    engagement: rec.Engagement || '',
    dateOfJoining: rec.DateOfJoining || '',
    reportingTo: rec.ReportingTo || '',
    issuedItems: String(rec.IssuedItems || '').split(',').filter(Boolean),
    allIssuedItems: _inductionIssuedItems_(),
    onJobBuddy: rec.OnJobBuddy || '',
    competenceLevel: rec.CompetenceLevel || '',
    recordedInMatrixOn: _isoDate_(rec.RecordedInMatrixOn),
    nextAssessmentDue: _isoDate_(rec.NextAssessmentDue),
    clearedAt: rec.ClearedAt || '',
    clearedBy: rec.ClearedBy || '',
    docStamp: rec.DocStamp || '',
    sessions: sessions,
    signedCount: signed,
    totalSessions: sessions.length,
    rulesTest: test,
    // Cleared means every session signed AND the rules test passed. Either
    // alone is a partial claim, and HR-08 clears on the whole programme.
    readyToClear: signed === sessions.length && sessions.length > 0 && test.passed
  };
}

/** Did this person pass the spoken rules test (TRN-IND)? Latest attempt wins. */
function _inductionTestResult_(empId) {
  var out = { taken: false, passed: false, score: '', takenAt: '' };
  try {
    var rows = getSheetAsObjects(MODULE_SHEETS.ASSESSMENTS).filter(function (a) {
      return String(a.EmpID) === String(empId) && String(a.TopicID) === 'TRN-IND';
    });
    if (!rows.length) return out;
    rows.sort(function (a, b) {
      return String(a.TakenAt) < String(b.TakenAt) ? 1 : -1;
    });
    var latest = rows[0];
    out.taken = true;
    out.passed = String(latest.Passed).toUpperCase() === 'YES';
    out.score = latest.Score;
    out.takenAt = String(latest.TakenAt || '').slice(0, 10);
  } catch (e) { /* no assessments sheet yet is not an error */ }
  return out;
}

/**
 * Sign off one session.
 *
 * Admin-gated because this is a signature: it asserts that a named person
 * delivered a named session on a named day, and an unauthenticated caller
 * could otherwise sign the whole programme for somebody who was never
 * inducted. That is the one claim on this form an auditor tests.
 */
function signInductionSession(entry, token) {
  _requireAdmin_(token);
  _ensureInductionSheets_();

  var id = String((entry && entry.empId) || '').trim();
  var no = Number((entry && entry.sessionNo) || 0);
  var by = String((entry && entry.deliveredBy) || '').trim();
  if (!id || !no) return { success: false, error: 'Missing employee or session' };
  if (!by) return { success: false, error: 'Who delivered it must be recorded' };

  var sheet = getSheet(INDUCTION_SHEETS.SESSIONS);
  var last = sheet.getLastRow();
  if (last < 2) return { success: false, error: 'Induction not started' };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var empCol = headers.indexOf('EmpID'), noCol = headers.indexOf('SessionNo');

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][empCol]) !== id) continue;
    if (Number(data[i][noCol]) !== no) continue;
    var row = i + 2;
    setCell(sheet, row, 'DeliveredBy', by);
    // The form says "on the day they delivered it", so the date defaults to
    // today rather than being free text — a signature dated later than the
    // session is the thing this field exists to prevent.
    setCell(sheet, row, 'DeliveredOn', entry.deliveredOn || _isoDate_(new Date()));
    setCell(sheet, row, 'DeliveredTime', entry.deliveredTime || '');
    setCell(sheet, row, 'SignedAt', new Date().toISOString());
    if (entry.remarks !== undefined) setCell(sheet, row, 'Remarks', entry.remarks);
    return getInduction(id);
  }
  return { success: false, error: 'Session not found for this person' };
}

/** Record the header details and the issued-items checklist. */
function saveInductionDetails(entry, token) {
  _requireAdmin_(token);
  _ensureInductionSheets_();

  var id = String((entry && entry.empId) || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var sheet = getSheet(INDUCTION_SHEETS.RECORD);
  var row = findRowByValue(sheet, 'EmpID', id);
  if (row === -1) return { success: false, error: 'Induction not started' };

  if (entry.dateOfJoining !== undefined) setCell(sheet, row, 'DateOfJoining', entry.dateOfJoining);
  if (entry.reportingTo !== undefined)   setCell(sheet, row, 'ReportingTo', entry.reportingTo);
  if (entry.onJobBuddy !== undefined)    setCell(sheet, row, 'OnJobBuddy', entry.onJobBuddy);
  if (entry.issuedItems !== undefined) {
    var items = entry.issuedItems;
    setCell(sheet, row, 'IssuedItems', (items instanceof Array) ? items.join(',') : String(items));
  }
  return getInduction(id);
}

/**
 * Clear the joiner to work unsupervised.
 *
 * HR-08's instruction is "before any unsupervised work", so this refuses
 * while anything is outstanding rather than warning. A clearance that can be
 * given over an unsigned session is not a control, and this is the field an
 * auditor reads first after an incident involving a new joiner.
 *
 * The competence level is written here AND left for the matrix to hold: the
 * matrix computes a level from the training, this records what a human
 * assigned on the day, and HR-08 asks for both.
 */
function clearInductionJoiner(entry, token) {
  _requireAdmin_(token);
  _ensureInductionSheets_();

  var id = String((entry && entry.empId) || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var state = getInduction(id);
  if (!state.started) return { success: false, error: 'Induction not started' };

  if (state.signedCount < state.totalSessions) {
    return { success: false,
             error: 'Not cleared: ' + (state.totalSessions - state.signedCount) +
                    ' of ' + state.totalSessions + ' sessions unsigned' };
  }
  if (!state.rulesTest.passed) {
    return { success: false,
             error: state.rulesTest.taken
                      ? 'Not cleared: the rules test was not passed'
                      : 'Not cleared: the rules test has not been taken' };
  }

  var level = _normLevel_(entry.competenceLevel);
  if (!level || level === 'NA') {
    return { success: false, error: 'A competence level (L1-L4) must be assigned' };
  }
  var by = String(entry.clearedBy || '').trim();
  if (!by) return { success: false, error: 'Who cleared them must be recorded' };

  var sheet = getSheet(INDUCTION_SHEETS.RECORD);
  var row = findRowByValue(sheet, 'EmpID', id);
  var today = _isoDate_(new Date());

  setCell(sheet, row, 'CompetenceLevel', level);
  setCell(sheet, row, 'RecordedInMatrixOn', today);
  // HR-08 asks when the next assessment is due. The matrix already expires a
  // competency on the topic's ValidityMonths, so this follows the same clock
  // rather than inventing a second one.
  setCell(sheet, row, 'NextAssessmentDue', _inductionNextDue_(today));
  setCell(sheet, row, 'ClearedAt', new Date().toISOString());
  setCell(sheet, row, 'ClearedBy', by);
  // Stamped at clearance, not at start: this is the moment the record makes
  // a claim, so it must say which issue of HR-08 that claim was made under.
  setCell(sheet, row, 'DocStamp', _inductionStamp_());

  return getInduction(id);
}

/** Twelve months on, matching TRN-IND's ValidityMonths. */
function _inductionNextDue_(fromIso) {
  var months = 12;
  try {
    var t = getSheetAsObjects(TRAINING_SHEETS.TOPICS).filter(function (x) {
      return String(x.TopicID) === 'TRN-IND';
    })[0];
    if (t && Number(t.ValidityMonths)) months = Number(t.ValidityMonths);
  } catch (e) { /* fall back to 12 */ }
  var d = new Date(fromIso);
  d.setMonth(d.getMonth() + months);
  return _isoDate_(d);
}

/**
 * Delete one person's induction entirely — the record and its nine sessions.
 *
 * Exists because an induction opened against the wrong person is otherwise
 * permanent, and a wrong clearance is worse than none: it asserts somebody
 * was cleared to work unsupervised when nobody checked. Admin-gated, and it
 * says what it removed so the deletion is itself auditable.
 */
function deleteInduction(empId, token) {
  _requireAdmin_(token);
  _ensureInductionSheets_();

  var id = String(empId || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var removed = { record: 0, sessions: 0 };
  [INDUCTION_SHEETS.SESSIONS, INDUCTION_SHEETS.RECORD].forEach(function (tab) {
    var sheet = getSheet(tab);
    var last = sheet.getLastRow();
    if (last < 2) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = headers.indexOf('EmpID');
    if (col === -1) return;
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    // Bottom-up so the remaining row numbers stay valid as rows go.
    for (var i = data.length - 1; i >= 0; i--) {
      if (String(data[i][col]) !== id) continue;
      sheet.deleteRow(i + 2);
      if (tab === INDUCTION_SHEETS.RECORD) removed.record++;
      else removed.sessions++;
    }
  });
  return { success: true, empId: id, removed: removed };
}

/**
 * Everyone who needs an induction, and where each one stands.
 *
 * "Needs" is every ACTIVE employee: HR-08 covers "permanent, contract or
 * agency-supplied", so engagement does not exempt anybody.
 */
function getInductionRegister() {
  _ensureInductionSheets_();

  var started = {};
  getSheetAsObjects(INDUCTION_SHEETS.RECORD).forEach(function (r) {
    started[String(r.EmpID)] = r;
  });

  var signedBy = {};
  getSheetAsObjects(INDUCTION_SHEETS.SESSIONS).forEach(function (s) {
    if (!String(s.SignedAt || '').trim()) return;
    var k = String(s.EmpID);
    signedBy[k] = (signedBy[k] || 0) + 1;
  });

  var rows = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function (e) { return String(e.Status || '').toUpperCase() === 'ACTIVE'; })
    .map(function (e) {
      var id = String(e.EmpID);
      var rec = started[id];
      var test = _inductionTestResult_(id);
      return {
        empId: id,
        name: e.Name || id,
        department: e.Department || '',
        jobRole: e.JobRole || '',
        engagement: e.Engagement || '',
        started: !!rec,
        signedCount: signedBy[id] || 0,
        totalSessions: 9,
        rulesTestPassed: test.passed,
        cleared: !!(rec && String(rec.ClearedAt || '').trim()),
        competenceLevel: rec ? (rec.CompetenceLevel || '') : ''
      };
    });

  var cleared = rows.filter(function (r) { return r.cleared; }).length;
  return {
    success: true,
    rows: rows,
    kpis: {
      people: rows.length,
      started: rows.filter(function (r) { return r.started; }).length,
      cleared: cleared,
      // The number that matters: people working who were never cleared to.
      uncleared: rows.length - cleared
    }
  };
}
