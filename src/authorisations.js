// ============================================================
// authorisations.js — PM/QSP/IMS-01 step 7, and the two safety registers
//
// Step 7 is CRITICAL and had no implementation at all:
//
//   "Record what each person is authorised to do - machine, permit class,
//    forklift, chemical handling, first aid, fire warden - together with the
//    next refresher due date. Authorisation lapses automatically when the
//    refresher date passes and must be reinstated by re-assessment, not by
//    attendance alone."
//
// The sentence that shapes this file is the last one. An authorisation is not
// a flag somebody turns off: it EXPIRES on a date, and the only way back is a
// recorded re-assessment. So the state is computed from the due date on every
// read and never stored — a stored flag goes stale the moment a date passes
// with nobody looking, which is exactly when "lapsed" must be true.
//
// Records: PM/OH-REC-006 Safety Competency & Training Register
//          PM/REG/OHS-01 Toolbox Talk & Safety Training Register
// ============================================================

var AUTH_SHEETS = {
  AUTH:    'Authorisations',
  TOOLBOX: 'ToolboxTalks'
};

var AUTH_HEADERS = {
  // Columns follow PM/OH-REC-006 so the register prints from the sheet rather
  // than being transcribed into it.
  Authorisations: ['EmpID', 'Name', 'Authorisation', 'Basis', 'AssessedOn',
                   'AssessedBy', 'AssessedByEmpID', 'Method', 'RefresherDue',
                   'WithdrawnOn', 'WithdrawnBy', 'Remarks', 'RecordedAt'],
  // PM/REG/OHS-01. A toolbox talk is deliberately NOT a TrainingPlan row:
  // IMS-01 step 5 says "Toolbox talks are recorded on the toolbox-talk
  // register, not as classroom training", and mixing them would let a
  // five-minute talk credit a skill the way a three-hour session does.
  ToolboxTalks:   ['TalkID', 'Date', 'Topic', 'Type', 'Area', 'ConductedBy',
                   'DurationMin', 'Attended', 'AttendanceRef', 'KeyPoints',
                   'FeedbackAction', 'VerifiedBy', 'RecordedAt']
};

/** The authorisations IMS-01 step 7 names, plus the two the HIRA implies. */
function _authTypes_() {
  return ['Machine operation', 'Permit to work', 'Forklift', 'Chemical handling',
          'First aid', 'Fire warden', 'Electrical work', 'Working at height'];
}

function _ensureAuthSheets_() {
  _ensureSheetsWithHeaders_(AUTH_HEADERS);
}

// ── Authorisations — PM/OH-REC-006 ─────────────────────────────────────────

/**
 * Is this authorisation live today?
 *
 * Computed, never stored. Five states rather than a boolean because "expires
 * next week" and "expired last year" call for different action, and a flag
 * hides the difference until it is too late to act on it.
 */
function _authState_(row, todayIso) {
  if (String(row.WithdrawnOn || '').trim()) return 'WITHDRAWN';
  var due = _isoDate_(row.RefresherDue);
  if (!due) return 'NO_EXPIRY_SET';
  if (due < todayIso) return 'LAPSED';
  return _daysBetween_(todayIso, due) <= 30 ? 'EXPIRING' : 'VALID';
}

/**
 * Every authorisation with its live state.
 *
 * Read-open like the rest of the module: a supervisor checking whether someone
 * may drive the forklift must not need the admin PIN to find out.
 */
function getAuthorisations(empId) {
  _ensureAuthSheets_();
  var today = _isoDate_(new Date());
  var want  = String(empId || '').trim();

  var rows = getSheetAsObjects(AUTH_SHEETS.AUTH)
    .filter(function (r) { return !want || _sameEmpId_(r.EmpID, want); })
    .map(function (r) {
      var state = _authState_(r, today);
      var due   = _isoDate_(r.RefresherDue);
      return {
        empId: String(r.EmpID), name: r.Name || '',
        authorisation: r.Authorisation || '', basis: r.Basis || '',
        assessedOn: _isoDate_(r.AssessedOn), assessedBy: r.AssessedBy || '',
        method: r.Method || '', refresherDue: due,
        withdrawnOn: _isoDate_(r.WithdrawnOn), remarks: r.Remarks || '',
        state: state,
        // Negative once past due — the number a supervisor acts on.
        daysToExpiry: due ? (due < today ? -_daysBetween_(due, today) : _daysBetween_(today, due)) : null
      };
    });

  var counts = { valid: 0, expiring: 0, lapsed: 0, withdrawn: 0, noExpirySet: 0 };
  rows.forEach(function (r) {
    if (r.state === 'VALID')          counts.valid++;
    else if (r.state === 'EXPIRING')  counts.expiring++;
    else if (r.state === 'LAPSED')    counts.lapsed++;
    else if (r.state === 'WITHDRAWN') counts.withdrawn++;
    else counts.noExpirySet++;
  });

  // Lapsed first: step 8 reports "any authorisation allowed to lapse", and a
  // list that buries them under the valid ones does not answer that question.
  var order = { LAPSED: 0, EXPIRING: 1, NO_EXPIRY_SET: 2, VALID: 3, WITHDRAWN: 4 };
  rows.sort(function (a, b) {
    return (order[a.state] - order[b.state]) || ((a.daysToExpiry || 0) - (b.daysToExpiry || 0));
  });

  return {
    success: true, stamp: isoStamp('safetyCompetence'),
    types: _authTypes_(), counts: counts, rows: rows
  };
}

/**
 * Grant or renew one authorisation.
 *
 * Admin-gated and assessor-checked for the same reason setSkillLevel is: this
 * says a named person may do a thing that can hurt them. IMS-01 step 7 is
 * explicit that reinstatement is "by re-assessment, not by attendance alone",
 * so an assessment method and a refresher date are required, not optional.
 */
function grantAuthorisation(entry, token) {
  _requireAdmin_(token);
  _ensureAuthSheets_();

  var emp  = String((entry && entry.empId) || '').trim();
  var auth = String((entry && entry.authorisation) || '').trim();
  if (!emp || !auth) return { success: false, error: 'Missing employee or authorisation' };

  var person = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function (e) { return _sameEmpId_(e.EmpID, emp); })[0];
  if (!person) return { success: false, error: 'No employee ' + emp + ' on the master' };

  var method = String((entry && entry.method) || '').trim();
  if (!method) return { success: false, error: 'State how competence was assessed' };

  var due = _isoDate_(entry && entry.refresherDue);
  if (!due) {
    return { success: false, error: 'Set the refresher due date — an authorisation with no expiry never lapses' };
  }

  // Reuses the matrix rule rather than restating it: the assessor must be
  // named and must not be the person being authorised.
  var by = _assessorFor_({ by: entry.by, byEmpId: entry.byEmpId }, emp, 'L1');
  if (by.error) return { success: false, error: by.error };

  var sheet   = getSheet(AUTH_SHEETS.AUTH);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last    = sheet.getLastRow();
  var ec = headers.indexOf('EmpID'), ac = headers.indexOf('Authorisation');

  // One live row per (person, authorisation): renewing replaces rather than
  // appends, so a lapsed row cannot sit beside a current one saying different
  // things about the same permission.
  var row = -1;
  if (last > 1) {
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (_sameEmpId_(data[i][ec], emp) &&
          String(data[i][ac]).trim().toLowerCase() === auth.toLowerCase()) { row = i + 2; break; }
    }
  }

  var values = {
    EmpID: emp, Name: person.Name || '', Authorisation: auth,
    Basis: String((entry && entry.basis) || ''),
    AssessedOn: _isoDate_(entry && entry.assessedOn) || _isoDate_(new Date()),
    AssessedBy: by.name, AssessedByEmpID: by.empId, Method: method,
    RefresherDue: due, WithdrawnOn: '', WithdrawnBy: '',
    Remarks: String((entry && entry.remarks) || ''), RecordedAt: new Date().toISOString()
  };
  var out = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });

  if (row !== -1) sheet.getRange(row, 1, 1, headers.length).setValues([out]);
  else sheet.appendRow(out);

  return {
    success: true, empId: emp, authorisation: auth, refresherDue: due,
    state: _authState_(values, _isoDate_(new Date())), stamp: isoStamp('safetyCompetence')
  };
}

/**
 * Withdraw an authorisation before its refresher falls due.
 *
 * Separate from granting because withdrawal is what step 6 requires when a
 * verdict is Not Effective on a critical task — "withdrawal of the
 * authorisation until the gap is closed". A reason is required: an
 * authorisation removed without one cannot be reviewed.
 */
function withdrawAuthorisation(entry, token) {
  _requireAdmin_(token);
  _ensureAuthSheets_();

  var emp  = String((entry && entry.empId) || '').trim();
  var auth = String((entry && entry.authorisation) || '').trim();
  var why  = String((entry && entry.reason) || '').trim();
  if (!emp || !auth) return { success: false, error: 'Missing employee or authorisation' };
  if (!why) return { success: false, error: 'Give the reason for withdrawal' };

  var sheet   = getSheet(AUTH_SHEETS.AUTH);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last    = sheet.getLastRow();
  if (last < 2) return { success: false, error: 'No authorisations recorded' };

  var ec = headers.indexOf('EmpID'), ac = headers.indexOf('Authorisation');
  var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var row = -1;
  for (var i = 0; i < data.length; i++) {
    if (_sameEmpId_(data[i][ec], emp) &&
        String(data[i][ac]).trim().toLowerCase() === auth.toLowerCase()) { row = i + 2; break; }
  }
  if (row === -1) return { success: false, error: emp + ' holds no ' + auth + ' authorisation' };

  setCell(sheet, row, 'WithdrawnOn', _isoDate_(new Date()));
  setCell(sheet, row, 'WithdrawnBy', String((entry && entry.by) || ''));
  setCell(sheet, row, 'Remarks', why);
  return { success: true, empId: emp, authorisation: auth, state: 'WITHDRAWN' };
}

// ── Toolbox talks — PM/REG/OHS-01 ──────────────────────────────────────────

/**
 * The toolbox talk register.
 *
 * Its own record, not a TrainingPlan row, because IMS-01 step 5 says so and
 * because a talk credits no skill: it is awareness under clause 7.3, which is
 * the half of the standard the skill matrix does not cover.
 */
function getToolboxTalks(year) {
  _ensureAuthSheets_();
  var y = String(year || '').trim();
  var rows = getSheetAsObjects(AUTH_SHEETS.TOOLBOX)
    .map(function (t) {
      return {
        talkId: t.TalkID, date: _isoDate_(t.Date), topic: t.Topic || '',
        type: t.Type || 'TBT', area: t.Area || '', conductedBy: t.ConductedBy || '',
        durationMin: Number(t.DurationMin) || 0, attended: Number(t.Attended) || 0,
        attendanceRef: t.AttendanceRef || '', keyPoints: t.KeyPoints || '',
        feedbackAction: t.FeedbackAction || '', verifiedBy: t.VerifiedBy || ''
      };
    })
    .filter(function (t) { return !y || String(t.date).slice(0, 4) === y; });

  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

  // Unverified talks are counted separately: OHS-01 carries a "Verified By"
  // column precisely so somebody other than the presenter confirms it happened.
  var unverified = rows.filter(function (t) { return !t.verifiedBy; }).length;

  return {
    success: true, stamp: isoStamp('toolbox'), year: y,
    counts: {
      talks: rows.length,
      attendances: rows.reduce(function (s, t) { return s + t.attended; }, 0),
      unverified: unverified
    },
    rows: rows
  };
}

/** Record one toolbox talk. Admin-gated: it is a safety record. */
function saveToolboxTalk(entry, token) {
  _requireAdmin_(token);
  _ensureAuthSheets_();

  var date  = _isoDate_(entry && entry.date);
  var topic = String((entry && entry.topic) || '').trim();
  if (!date || !topic) return { success: false, error: 'A talk needs a date and a topic' };

  var by = String((entry && entry.conductedBy) || '').trim();
  if (!by) return { success: false, error: 'Name who conducted the talk' };

  var attended = Number(entry && entry.attended);
  if (!attended || attended < 1) {
    return { success: false, error: 'A talk with nobody attending is not a record' };
  }

  var sheet = getSheet(AUTH_SHEETS.TOOLBOX);
  var id = String((entry && entry.talkId) || '').trim() ||
           ('TBT-' + date.replace(/-/g, '') + '-' + (sheet.getLastRow() + 1));
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = findRowByValue(sheet, 'TalkID', id);

  var values = {
    TalkID: id, Date: date, Topic: topic, Type: String((entry && entry.type) || 'TBT'),
    Area: String((entry && entry.area) || ''), ConductedBy: by,
    DurationMin: Number(entry && entry.durationMin) || 0, Attended: attended,
    AttendanceRef: String((entry && entry.attendanceRef) || ''),
    KeyPoints: String((entry && entry.keyPoints) || ''),
    FeedbackAction: String((entry && entry.feedbackAction) || ''),
    VerifiedBy: String((entry && entry.verifiedBy) || ''),
    RecordedAt: new Date().toISOString()
  };
  var out = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });

  if (row !== -1) sheet.getRange(row, 1, 1, headers.length).setValues([out]);
  else sheet.appendRow(out);

  return { success: true, talkId: id, stamp: isoStamp('toolbox') };
}
