// ============================================================
// hoursSummary.gs — Year/Month working-hours & attendance rollup
// Source of truth: Logs tab. Hours reported as decimal (2 dp).
// Closed sessions only (TimeIN + TimeOUT) count toward total hours;
// open rows (missed checkout) count 0 and are flagged.
// ============================================================

/**
 * Parses a stored Duration value to minutes.
 * Accepts "Xh Ym" strings (as produced by getSheetAsObjects) and falls back
 * to computing from TimeIN/TimeOUT when Duration is missing or garbage (>23h).
 * Returns 0 for open/invalid sessions.
 */
function _durationMinutes_(row) {
  var dur = row.Duration;
  if (dur) {
    var m = String(dur).match(/^(\d+)h\s*(\d+)m$/);
    if (m) {
      var h = parseInt(m[1], 10);
      if (h <= 23) return h * 60 + parseInt(m[2], 10);
    }
  }
  // Fallback: recompute from TimeIN/TimeOUT
  if (row.TimeIN && row.TimeOUT) {
    var ti = parseTimeToday(row.TimeIN);
    var to = parseTimeToday(row.TimeOUT);
    if (ti && to && to > ti) {
      var diff = Math.floor((to - ti) / 60000);
      if (diff >= 0 && diff <= 1440) return diff;
    }
  }
  return 0;
}

function _minutesToDecimalHours_(mins) {
  return Math.round((mins / 60) * 100) / 100; // 2 dp
}

function _hoursThresholds_() {
  var cfg = getSheetAsObjects(SHEETS.CONFIG);
  var map = {};
  cfg.forEach(function(c) { map[c.Key] = c.Value; });
  function parseHM(v, dh, dm) {
    var s = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
    return s ? parseInt(s[1], 10) * 60 + parseInt(s[2], 10) : dh * 60 + dm;
  }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  return {
    lateThreshMin:  parseHM(map.LateAfter, 9, 30),   // existing Config key
    standardHours:  num(map.StandardHours, 8),
    otAfterHours:   num(map.OvertimeAfterHours, 8)
  };
}

function _parseTimeMinutes_(t) {
  if (!t) return null;
  var s = String(t);
  var m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    var h = parseInt(m12[1], 10), mn = parseInt(m12[2], 10), ap = m12[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + mn;
  }
  var m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  return null;
}

var _MONTH_NAMES_ = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

/**
 * Reads and filters the Logs sheet once. Shared by getHoursSummary() and
 * getHoursKpis() so a single request that needs both (getHoursKpis calls
 * getHoursSummary internally for the overtime figure) reads Logs only once
 * instead of twice.
 *
 * @param {Array} [rawLogs]  Pre-fetched getSheetAsObjects(SHEETS.LOGS) rows.
 *   Pass this when the caller already has the raw rows (see getHoursKpis)
 *   to avoid re-reading the sheet; omitted, this reads it directly.
 * @return {Array} EMP log rows with a well-formed Date
 */
function _computeHours_(rawLogs) {
  var rows = rawLogs || getSheetAsObjects(SHEETS.LOGS);
  return rows.filter(function(r) {
    return r.Type === 'EMP' && r.Date && String(r.Date).match(/^\d{4}-\d{2}-\d{2}$/);
  });
}

/**
 * Core aggregation: groups EMP logs by Year → Month → Employee.
 * One employee-day = the first IN of that date for that person (dedupe multi-swipes).
 * Returns a nested structure consumed by both the UI and the sheet writer.
 *
 * @param {Object} opts  { includeInactive: bool }
 * @param {Array} [rawLogs]  Pre-fetched Logs rows — see _computeHours_.
 */
function getHoursSummary(opts, rawLogs) {
  opts = opts || {};
  var th = _hoursThresholds_();
  var logs = _computeHours_(rawLogs);

  var emps = getSheetAsObjects(SHEETS.EMPLOYEES);
  var empMap = {};
  emps.forEach(function(e) { empMap[String(e.EmpID)] = e; });

  // buckets[year][month][empId] = aggregate; one entry per employee-day
  var buckets = {};
  // dayseen[year][month][empId][day] = true  (dedupe multi-swipes within a day)
  var daySeen = {};

  logs.forEach(function(r) {
    var date  = String(r.Date);
    var year  = date.substring(0, 4);
    var month = parseInt(date.substring(5, 7), 10); // 1-12
    var day   = date.substring(8, 10);
    var id    = String(r.PersonID);

    buckets[year]            = buckets[year]            || {};
    buckets[year][month]     = buckets[year][month]     || {};
    daySeen[year]            = daySeen[year]            || {};
    daySeen[year][month]     = daySeen[year][month]     || {};
    daySeen[year][month][id] = daySeen[year][month][id] || {};

    var agg = buckets[year][month][id];
    if (!agg) {
      var e = empMap[id] || {};
      agg = buckets[year][month][id] = {
        empId:        id,
        name:         r.Name || e.Name || id,
        department:   r.Department || e.Department || '',
        status:       (e.Status || 'ACTIVE'),
        daysWorked:   0,
        presentDays:  0,
        lateDays:     0,
        openSessions: 0,
        totalMinutes: 0
      };
    }

    var mins = _durationMinutes_(r);
    agg.totalMinutes += mins;
    if (r.TimeIN && !r.TimeOUT) agg.openSessions++;

    // Per-day rollup: count a day once
    if (!daySeen[year][month][id][day]) {
      daySeen[year][month][id][day] = true;
      agg.presentDays++;
      if (mins > 0) agg.daysWorked++;
      var tMin = _parseTimeMinutes_(r.TimeIN);
      if (tMin !== null && tMin > th.lateThreshMin) agg.lateDays++;
    }
  });

  // Shape into nested arrays with computed decimals + totals
  var years = Object.keys(buckets).sort(function(a, b) { return b - a; }); // desc
  var out = years.map(function(year) {
    var months = Object.keys(buckets[year]).map(Number).sort(function(a, b) { return b - a; });
    var yearMinutes = 0, yearDays = 0;
    var monthObjs = months.map(function(month) {
      var byEmp = buckets[year][month];
      var rows = Object.keys(byEmp).map(function(id) { return byEmp[id]; })
        .filter(function(a) { return opts.includeInactive || a.status === 'ACTIVE'; });

      var monthMinutes = 0, monthDistinctDays = {};
      rows.forEach(function(a) {
        a.totalHours = _minutesToDecimalHours_(a.totalMinutes);
        a.avgPerDay  = a.daysWorked > 0
          ? _minutesToDecimalHours_(a.totalMinutes / a.daysWorked) : 0;
        // Overtime: hours beyond standard, summed per worked-day basis (approx on month total)
        var stdMonthMin = a.daysWorked * th.standardHours * 60;
        a.overtimeHours = a.totalMinutes > stdMonthMin
          ? _minutesToDecimalHours_(a.totalMinutes - stdMonthMin) : 0;
        a.perfect = (a.lateDays === 0 && a.openSessions === 0 && a.daysWorked === a.presentDays && a.daysWorked > 0);
        monthMinutes += a.totalMinutes;
      });

      rows.sort(function(x, y) { return (x.name || '').localeCompare(y.name || ''); });

      var monthWorkDays = rows.reduce(function(s, a) { return s + a.daysWorked; }, 0);
      yearMinutes += monthMinutes;
      yearDays    += monthWorkDays;

      return {
        month:        month,
        monthName:    _MONTH_NAMES_[month - 1],
        label:        _MONTH_NAMES_[month - 1] + ' ' + year,
        totalHours:   _minutesToDecimalHours_(monthMinutes),
        totalManDays: monthWorkDays,
        present:      rows.reduce(function(s, a) { return s + a.presentDays; }, 0),
        late:         rows.reduce(function(s, a) { return s + a.lateDays; }, 0),
        overtime:     rows.reduce(function(s, a) { return s + a.overtimeHours; }, 0),
        employees:    rows
      };
    });

    return {
      year:         year,
      totalHours:   _minutesToDecimalHours_(yearMinutes),
      totalManDays: yearDays,
      months:       monthObjs
    };
  });

  return { success: true, years: out, generatedAt: new Date().toISOString() };
}

/**
 * KPI snapshot for a specific Year+Month (used by the snapshot block).
 * Counts present/absent/late against ACTIVE roster for that month.
 * @param {string|number} year   e.g. 2026
 * @param {number} month         1-12
 */
function getHoursKpis(year, month) {
  var th = _hoursThresholds_();
  var ym = String(year) + '-' + (month < 10 ? '0' + month : String(month));
  // Read Logs exactly once for this request: rawLogs is reused below when
  // calling getHoursSummary() for the overtime figure, instead of it doing
  // its own second full read.
  var rawLogs = getSheetAsObjects(SHEETS.LOGS);
  var logs = _computeHours_(rawLogs).filter(function(r) {
    return String(r.Date).indexOf(ym) === 0;
  });
  var activeEmps = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function(e) { return e.Status === 'ACTIVE'; });

  var byEmpDay = {}, present = {}, lateDaysTot = 0, missedOut = 0, stillIn = 0;
  var totalMinutes = 0, inMinutesSum = 0, inMinutesCount = 0;
  var perfectByEmp = {}; // id -> { late:0, open:0 } accumulation

  logs.forEach(function(r) {
    var id  = String(r.PersonID);
    var day = String(r.Date).substring(8, 10);
    present[id] = true;
    byEmpDay[id] = byEmpDay[id] || {};

    var mins = _durationMinutes_(r);
    totalMinutes += mins;
    if (r.TimeIN && !r.TimeOUT) { missedOut++; stillIn++; }

    var tIn = _parseTimeMinutes_(r.TimeIN);
    if (tIn !== null) { inMinutesSum += tIn; inMinutesCount++; }

    perfectByEmp[id] = perfectByEmp[id] || { late: 0, open: 0, days: 0 };
    if (r.TimeIN && !r.TimeOUT) perfectByEmp[id].open++;

    if (!byEmpDay[id][day]) {
      byEmpDay[id][day] = true;
      perfectByEmp[id].days++;
      if (tIn !== null && tIn > th.lateThreshMin) { lateDaysTot++; perfectByEmp[id].late++; }
    }
  });

  var presentIds = Object.keys(present);
  var absent = activeEmps.filter(function(e) { return presentIds.indexOf(String(e.EmpID)) === -1; });
  var totalManDays = Object.keys(byEmpDay).reduce(function(s, id) {
    return s + Object.keys(byEmpDay[id]).length;
  }, 0);
  var attendancePct = activeEmps.length > 0 && totalManDays > 0
    ? Math.round((presentIds.length / activeEmps.length) * 1000) / 10 : 0;

  // Overtime total = sum over employees of (totalMinutes - standard*daysWorked) when positive
  var summary = getHoursSummary({ includeInactive: false }, rawLogs);
  var otTotal = 0;
  summary.years.forEach(function(y) {
    if (String(y.year) !== String(year)) return;
    y.months.forEach(function(mo) { if (mo.month === month) otTotal = mo.overtime; });
  });

  var perfectCount = Object.keys(perfectByEmp).filter(function(id) {
    var p = perfectByEmp[id];
    return p.days > 0 && p.late === 0 && p.open === 0;
  }).length;

  var avgInMin = inMinutesCount > 0 ? Math.round(inMinutesSum / inMinutesCount) : null;
  function fmtMin(m) {
    if (m === null) return '—';
    var h = Math.floor(m / 60), mn = m % 60;
    return (h < 10 ? '0' + h : h) + ':' + (mn < 10 ? '0' + mn : mn);
  }

  var lateRate = totalManDays > 0
    ? Math.round((lateDaysTot / totalManDays) * 1000) / 10 : 0;

  return {
    success:        true,
    year:           String(year),
    month:          month,
    monthName:      _MONTH_NAMES_[month - 1],
    present:        presentIds.length,
    absent:         absent.length,
    late:           lateDaysTot,
    attendancePct:  attendancePct,
    stillIn:        stillIn,
    totalHours:     _minutesToDecimalHours_(totalMinutes),
    avgHoursPerEmp: presentIds.length > 0
                      ? _minutesToDecimalHours_(totalMinutes / presentIds.length) : 0,
    overtimeHours:  otTotal,
    avgCheckIn:     fmtMin(avgInMin),
    missedOut:      missedOut,
    perfectCount:   perfectCount,
    lateRate:       lateRate,
    activeStaff:    activeEmps.length
  };
}

/**
 * Rebuilds (overwrites) the HoursSummary sheet: one row per employee-month.
 * Hours are written as real numbers so they sort/pivot in Sheets.
 */
function rebuildHoursSummarySheet() {
  var summary = getHoursSummary({ includeInactive: true });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('HoursSummary');
  if (!sheet) sheet = ss.insertSheet('HoursSummary');

  var headers = ['Year','Month','EmpID','Name','Department','DaysWorked',
                 'PresentDays','LateDays','OpenSessions','TotalMinutes',
                 'TotalHours','AvgPerDay','OvertimeHours','Status'];
  var rows = [headers];

  summary.years.forEach(function(y) {
    y.months.forEach(function(mo) {
      mo.employees.forEach(function(a) {
        rows.push([
          y.year, mo.monthName, a.empId, a.name, a.department,
          a.daysWorked, a.presentDays, a.lateDays, a.openSessions,
          a.totalMinutes, a.totalHours, a.avgPerDay, a.overtimeHours, a.status
        ]);
      });
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F0F0F0');
  sheet.setFrozenRows(1);

  return { success: true, rowsWritten: rows.length - 1, generatedAt: summary.generatedAt };
}
