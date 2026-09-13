// presented.js — training delivered to a group from one phone.
//
// A trainer stands at the machine with eight people, walks the module's rules
// on screen, and the room answers the questions together. That is how this
// site actually trains, and until now the app could only record the two ends
// of it: a session marked held, or an individual sitting a test alone.
//
// WHAT THIS WRITES, AND WHAT IT DELIBERATELY DOES NOT
//
// Each person present gets an attendance row with NO score. The room answered
// as a room; writing the group's percentage onto eight people would assert
// eight individual assessments that never took place, and every count that
// reads Score — coverage, pass rate, the skill matrix — would believe it.
// saveSessionAttendance already distinguishes these: a blank score means "not
// assessed", explicitly not a zero. That is the true state of a person after
// a group session, and IMS-01 step 6 is emphatic about the difference:
// attendance is not evidence of competence.
//
// The group's result is real and is kept — on the SESSION, where it is
// attributable to the room that gave it. A trainer can see the room scored
// 8/10 and which two it got wrong; an auditor can see it was delivered
// collectively and that nobody's level moved because of it.
//
// Individual assessment stays where it belongs: selftest.html, at
// reassessment, one person answering for themselves.

/**
 * Record a presented session: who was in the room, and how the room answered.
 *
 * Admin-gated for the same reason saveSessionAttendance is — attendance is
 * competence evidence the company stands behind, and this writes it for
 * several people at once.
 */
function savePresentedSession(entry, token) {
  _requireAdmin_(token);
  _ensureTrainingSheets_();
  _ensureModuleSheets_();

  var topicId = String((entry && entry.topicId) || '').trim();
  if (!topicId) return { success: false, error: 'Missing topic' };

  var rows = (entry && entry.rows) || [];
  var present = rows.filter(function (r) { return r && r.empId && r.present; });
  if (!present.length) return { success: false, error: 'Nobody was marked present' };

  var marked = scoreModuleTest(topicId, (entry && entry.answers) || []);
  if (!marked.success) return marked;

  var planId = String((entry && entry.planId) || '').trim() ||
               _createPresentedPlan_(topicId, present.length);

  // Attendance first: it is the record that matters, and it must land even if
  // annotating the session afterwards fails.
  var att = saveSessionAttendance(planId, present.map(function (r) {
    return { empId: r.empId, name: r.name, present: true, score: '' };
  }), token);
  if (!att.success) return att;

  _recordGroupResult_(planId, marked, present.length, String((entry && entry.lang) || ''));

  return {
    success: true,
    planId: planId,
    present: att.present,
    correct: marked.correct,
    total: marked.total,
    score: marked.score,
    detail: marked.detail,
    stamp: isoStamp('induction')
  };
}

/**
 * A plan row for a session that was delivered without being scheduled.
 *
 * Training at this site is often called on the morning it happens. Refusing
 * to record it because nobody planned it a week earlier is how evidence goes
 * missing, so the session is created as held — and says so, in Content, where
 * getTrainingCalendar already surfaces it to tell a real record apart from a
 * bulk back-fill.
 */
function _createPresentedPlan_(topicId, headcount) {
  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date();
  var planId = 'PLN-' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd') +
               '-' + Utilities.getUuid().slice(0, 4).toUpperCase();

  var values = {
    PlanID: planId,
    Year: String(now.getFullYear()),
    TopicID: topicId,
    Type: _presentedType_(topicId),
    PlannedDate: now,
    ActualDate: now,
    Status: 'HELD',
    Trainer: _presentedTrainer_(),
    Content: 'Presented to a group of ' + headcount + ' on a shared device.',
    Internal: 'YES'
  };
  sheet.appendRow(headers.map(function (h) {
    return values[h] !== undefined ? values[h] : '';
  }));
  return planId;
}

/** The topic's own type, so a drill presented this way is still a drill. */
function _presentedType_(topicId) {
  var t = getSheetAsObjects(TRAINING_SHEETS.TOPICS)
            .filter(function (r) { return String(r.TopicID) === String(topicId); })[0];
  return (t && t.Type) || 'TRAIN';
}

/** Who delivered it. The signed-in owner, or unattributed rather than wrong. */
function _presentedTrainer_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

/**
 * The group's answers, written onto the session.
 *
 * Into Observations because that is where a trainer's own account of a
 * session already goes, and this IS that account — what the room got right,
 * and which questions it did not. Appended, never overwritten: a session run
 * twice with two groups has two results, and losing the first would hide a
 * room that struggled.
 */
function _recordGroupResult_(planId, marked, headcount, lang) {
  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var planCol = headers.indexOf('PlanID');
  var obsCol  = headers.indexOf('Observations');
  if (planCol === -1 || obsCol === -1) return;

  var last = sheet.getLastRow();
  if (last < 2) return;
  var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][planCol]) !== String(planId)) continue;

    var missed = marked.detail.filter(function (d) { return !d.correct; })
                              .map(function (d) { return 'Q' + d.n; });
    var line = 'Group test (' + headcount + ' present' + (lang ? ', ' + lang : '') + '): ' +
      marked.correct + '/' + marked.total + ' = ' + marked.score + '%' +
      (missed.length ? '. Missed ' + missed.join(', ') : '. All correct') +
      '. Answered collectively — no individual score recorded.';

    var existing = String(data[i][obsCol] || '').trim();
    sheet.getRange(i + 2, obsCol + 1).setValue(existing ? existing + '\n' + line : line);
    return;
  }
}
