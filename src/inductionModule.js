// inductionModule.js — every induction this site runs, in one register.
//
// The site inducts two kinds of people and recorded them in two unrelated
// places: a worker gets HR-08's nine signed sessions across InductionRecord
// and InductionSessions, a visitor gets two columns on the Visitors sheet
// written at the gate. Nobody could answer "who has been inducted this month"
// without opening both and adding up by hand.
//
// WHY THIS IS NOT IN THE TRAINING CALENDAR
//
// Worker induction is not annual training. It happens when a person joins,
// once, and it either completed or it did not — there is no April slot for it
// and scheduling it as a session implies a date somebody chose. TRN-IND is
// still the rules TEST a joiner sits, and still lives in the module library;
// what leaves the calendar is the pretence that induction is a planned event.

/**
 * Both registers, one call.
 *
 * Read-only and ungated, matching getInductionRegister and getVisitors which
 * it is built from.
 */
function getInductionModule(monthIso) {
  var month = String(monthIso || '').trim() ||
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  var workers = { success: false, rows: [], kpis: {} };
  try { workers = getInductionRegister(); } catch (e) { workers.error = e.message; }

  var visitors = _visitorInductions_(month);

  return {
    success: true,
    month: month,
    months: _inductionMonths_(),
    workers: workers.rows || [],
    workerKpis: workers.kpis || {},
    visitors: visitors.rows,
    visitorKpis: visitors.kpis,
    stamp: isoStamp('induction')
  };
}

/**
 * Visitor safety inductions for one month.
 *
 * A visitor's induction is two columns on their own row — SafetyAckAt and
 * SafetyVersion — so the register is the visitor list read through
 * _safetyAckValid_, the same check vreg.html applies at the gate. Reusing it
 * matters: a second copy of "is this still good" would drift from the one
 * that actually admits people.
 */
function _visitorInductions_(month) {
  var rows = [];
  var acked = 0, expired = 0, never = 0;

  try {
    getSheetAsObjects(SHEETS.VISITORS).forEach(function (v) {
      var at = String(v.SafetyAckAt || '').trim();
      if (at && String(at).slice(0, 7) !== month) return;   // acked, another month

      /* A visitor with no acknowledgement at all has no date to file them
         under — the Visitors sheet carries no created-at or check-in column,
         only the ack itself. So they are counted and shown, but cannot be
         narrowed to a month; pretending otherwise would silently hide them. */
      if (!at) never++;

      var valid = at ? _safetyAckValid_(at, v.SafetyVersion) : false;
      if (at) { if (valid) acked++; else expired++; }

      rows.push({
        visitorId: v.VisitorID,
        name: v.Name || '',
        company: v.Company || '',
        hostEmpId: v.HostEmpID || '',
        ackAt: at,
        version: String(v.SafetyVersion || ''),
        state: !at ? 'NONE' : (valid ? 'VALID' : 'EXPIRED')
      });
    });
  } catch (e) { /* an unreadable visitor sheet must not blank the worker half */ }

  rows.sort(function (a, b) { return String(b.ackAt).localeCompare(String(a.ackAt)); });
  return { rows: rows, kpis: { inducted: acked, expired: expired, never: never } };
}

/** Months that actually have a visitor induction in them, newest first. */
function _inductionMonths_() {
  var seen = {};
  try {
    getSheetAsObjects(SHEETS.VISITORS).forEach(function (v) {
      var m = String(v.SafetyAckAt || '').slice(0, 7);
      if (m) seen[m] = true;
    });
  } catch (e) {}
  seen[Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM')] = true;
  return Object.keys(seen).sort().reverse();
}

/**
 * Keep worker induction out of the annual training calendar.
 *
 * TRN-IND is an INDUCT-type topic, and getTrainingCalendar returns every
 * topic so a planner can schedule one. Induction is not schedulable: it
 * happens when somebody joins.
 *
 * MEASURED 2026-09-13: the 2026 calendar holds exactly ONE TRN-IND row and it
 * was actually held, so there is currently nothing to prune. This is kept as
 * the guard for when somebody schedules one — which is the mistake it exists
 * to undo — not because the calendar is cluttered today.
 *
 * Editor-run and deliberately unrouted: it deletes plan rows, and a register
 * that can be emptied over the API is not a register. Reports what it would
 * remove before removing anything, so running it to look is safe.
 */
function pruneInductionFromCalendar(reallyDelete) {
  _ensureTrainingSheets_();
  var sheet = getSheet(TRAINING_SHEETS.PLAN);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last = sheet.getLastRow();
  if (last < 2) return { success: true, found: 0, removed: 0, rows: [] };

  var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var tC = headers.indexOf('TopicID'), pC = headers.indexOf('PlanID');
  var aC = headers.indexOf('ActualDate'), sC = headers.indexOf('Status');

  var hits = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][tC]) !== 'TRN-IND') continue;
    hits.push({
      rowIndex: i + 2,
      planId: String(data[i][pC]),
      // A session actually HELD is evidence and is never touched, only
      // reported. Deleting a record of something that happened would be
      // worse than the calendar being untidy.
      held: !!String(data[i][aC] || '').trim() || String(data[i][sC]) === 'HELD'
    });
  }

  var removable = hits.filter(function (h) { return !h.held; });
  var removed = 0;
  if (reallyDelete === true) {
    removable.sort(function (a, b) { return b.rowIndex - a.rowIndex; })  // bottom-up
             .forEach(function (h) { sheet.deleteRow(h.rowIndex); removed++; });
  }

  return {
    success: true,
    found: hits.length,
    held: hits.length - removable.length,
    removable: removable.length,
    removed: removed,
    note: reallyDelete === true
      ? 'Removed ' + removed + ' unheld induction rows from the calendar.'
      : 'Dry run. Call pruneInductionFromCalendar(true) to remove them.',
    rows: hits
  };
}
