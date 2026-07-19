// Backend for the person-detail modal (kiosk + dashboard):
//   getEmployeeMonth(empId)  → this month's day-by-day IN/OUT/late rows
//   checkoutEmployee(empId)   → close today's open session (sets TimeOUT), no re-scan
// Reuses existing log parsing + the scanner's _checkOut helper — no duplicated logic.

/**
 * Day-by-day attendance for one employee, current month.
 * Returns { success, name, empId, month, rows:[{date, day, weekday, timeIn, timeOut, lateMins}], presentDays, lateDays }.
 * One row per calendar day the person has a log; multi-swipe days collapse to first IN / last OUT.
 */
function getEmployeeMonth(empId) {
  if (!empId) return { success: false, error: 'No empId' };
  empId = String(empId);

  // Visitors are clickable in the same arrivals grid but live in the Visitors
  // sheet with Type='VIS' logs — the employee-only path below would show them as
  // "No attendance / Not checked in today". Route them to the visitor view.
  if (_isVisitorId_(empId)) return _getVisitorMonth_(empId);

  var th = _hoursThresholds_();                       // { lateThreshMin, ... } from hoursSummary.js
  var now = new Date();
  var ym = formatDate(now).substring(0, 7);           // 'YYYY-MM' of the current month

  var emps = getSheetAsObjects(SHEETS.EMPLOYEES);
  var emp = null;
  for (var i = 0; i < emps.length; i++) {
    if (String(emps[i].EmpID) === empId) { emp = emps[i]; break; }
  }

  var logs = getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
    return r.Type === 'EMP' &&
           String(r.PersonID) === empId &&
           String(r.Date).indexOf(ym) === 0;          // this month only
  });

  // Collapse multiple swipes per day: earliest TimeIN, latest non-empty TimeOUT.
  var byDay = {};
  logs.forEach(function(r) {
    var date = String(r.Date);
    var d = byDay[date] || (byDay[date] = { date: date, timeIn: '', timeOut: '' });
    var inMin  = _parseTimeMinutes_(r.TimeIN);
    var curMin = _parseTimeMinutes_(d.timeIn);
    if (r.TimeIN && (curMin === null || (inMin !== null && inMin < curMin))) d.timeIn = r.TimeIN;
    if (r.TimeOUT && String(r.TimeOUT).trim() !== '') d.timeOut = r.TimeOUT;   // last write wins (rows are in scan order)
  });

  var lateDays = 0;
  var rows = Object.keys(byDay).sort().reverse().map(function(date) {
    var d = byDay[date];
    var inMin = _parseTimeMinutes_(d.timeIn);
    var lateMins = (inMin !== null && inMin > th.lateThreshMin) ? (inMin - th.lateThreshMin) : 0;
    if (lateMins > 0) lateDays++;
    var dt = new Date(date + 'T00:00:00');
    return {
      date:     date,
      day:      date.substring(8, 10),
      weekday:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()],
      timeIn:   d.timeIn || '',
      timeOut:  d.timeOut || '',
      lateMins: lateMins
    };
  });

  // Today's session state, so the modal can grey the Check Out button.
  var todayStr = formatDate(now);
  var todayRow = byDay[todayStr];
  var inToday  = !!(todayRow && todayRow.timeIn);
  var outToday = !!(todayRow && todayRow.timeOut);

  return {
    success:     true,
    empId:       empId,
    name:        (emp && emp.Name) || (logs[0] && logs[0].Name) || empId,
    department:  (emp && emp.Department) || '',
    month:       ym,
    rows:        rows,
    presentDays: rows.length,
    lateDays:    lateDays,
    inToday:     inToday,
    outToday:    outToday
  };
}

/**
 * Check out an employee for today without re-scanning their QR.
 * Finds today's open (no TimeOUT) log row and closes it via the scanner's _checkOut.
 * Returns { success, action:'CHECK_OUT'|'NONE', name, time, duration, message }.
 */
function checkoutEmployee(empId) {
  if (!empId) return { success: false, error: 'No empId' };
  empId = String(empId);

  // A visitor clicked in the arrivals grid checks out through the visitor path
  // (any-date open row), not the employee one.
  if (_isVisitorId_(empId)) return checkoutVisitor(empId);

  var empSheet = getSheet(SHEETS.EMPLOYEES);
  var empRow = findRowByValue(empSheet, 'EmpID', empId);
  if (empRow === -1) return { success: false, error: 'Employee not found' };

  var person = {
    id:         empId,
    name:       getCell(empSheet, empRow, 'Name'),
    department: getCell(empSheet, empRow, 'Department'),
    photoUrl:   getCell(empSheet, empRow, 'PhotoURL') || '',
    type:       'EMP'
  };

  var logsSheet = getSheet(SHEETS.LOGS);
  var openRow = _findOpenLogRow(logsSheet, empId, today());
  if (openRow === -1) {
    return { success: false, action: 'NONE', name: person.name, message: 'No open session to check out' };
  }

  return _checkOut(logsSheet, openRow, person, 'Manual');   // reuses scanner.js
}

/** A visitor id looks like "VIS-YYYYMMDD-…" or exists in the Visitors sheet. */
function _isVisitorId_(id) {
  if (/^VIS-/i.test(String(id))) return true;
  return findRowByValue(getSheet(SHEETS.VISITORS), 'VisitorID', id) !== -1;
}

/**
 * Visitor equivalent of getEmployeeMonth — same response shape so the shared
 * person-detail modal renders it. Rows are this month's visits (one per day),
 * and inToday/outToday reflect whether the visitor currently has an open row.
 */
function _getVisitorMonth_(visitorId) {
  var now = new Date();
  var ym  = formatDate(now).substring(0, 7);
  var todayStr = formatDate(now);

  var vis = null;
  getSheetAsObjects(SHEETS.VISITORS).forEach(function(v) {
    if (String(v.VisitorID) === String(visitorId)) vis = v;
  });

  var logs = getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
    return r.Type === 'VIS' && String(r.PersonID) === String(visitorId);
  });

  // Collapse to one row per day: earliest IN, latest OUT.
  var byDay = {};
  logs.forEach(function(r) {
    var date = String(r.Date);
    var d = byDay[date] || (byDay[date] = { date: date, timeIn: '', timeOut: '' });
    var inMin  = _parseTimeMinutes_(r.TimeIN);
    var curMin = _parseTimeMinutes_(d.timeIn);
    if (r.TimeIN && (curMin === null || (inMin !== null && inMin < curMin))) d.timeIn = r.TimeIN;
    if (r.TimeOUT && String(r.TimeOUT).trim() !== '') d.timeOut = r.TimeOUT;
  });

  var rows = Object.keys(byDay).filter(function(date) { return date.indexOf(ym) === 0; })
    .sort().reverse().map(function(date) {
      var d = byDay[date];
      var dt = new Date(date + 'T00:00:00');
      return {
        date:     date,
        day:      date.substring(8, 10),
        weekday:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()],
        timeIn:   d.timeIn || '',
        timeOut:  d.timeOut || '',
        lateMins: 0   // late thresholds are for staff, not visitors
      };
    });

  // Open row on ANY date = currently in. outToday = a completed visit today.
  var openRow  = _findOpenVisitorLogRow(getSheet(SHEETS.LOGS), visitorId);
  var todayRow = byDay[todayStr];
  var inToday  = openRow !== -1;
  var outToday = !!(todayRow && todayRow.timeOut) && openRow === -1;

  return {
    success:     true,
    empId:       visitorId,
    name:        (vis && vis.Name) || (logs[0] && logs[0].Name) || visitorId,
    department:  (vis && vis.Company) || (vis && vis.Purpose) || '',
    month:       ym,
    rows:        rows,
    presentDays: rows.length,
    lateDays:    0,
    inToday:     inToday,
    outToday:    outToday,
    isVisitor:   true
  };
}
