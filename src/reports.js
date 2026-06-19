// ============================================================
// reports.gs — Query logs, CSV export, analytics data
// ============================================================

function getLogs(filters) {
  filters = filters || {};
  var logs = getSheetAsObjects(SHEETS.LOGS);

  var results = logs.filter(function(row) {
    if (filters.dateFrom && row.Date < filters.dateFrom) return false;
    if (filters.dateTo   && row.Date > filters.dateTo)   return false;
    if (filters.type   && filters.type   !== 'ALL' && row.Type   !== filters.type)   return false;
    if (filters.status && filters.status !== 'ALL' && row.Status !== filters.status) return false;
    if (filters.department && row.Department !== filters.department) return false;
    if (filters.name && row.Name.toLowerCase().indexOf(filters.name.toLowerCase()) === -1) return false;
    return true;
  });

  // Compute Duration on-the-fly when missing or clearly invalid (h > 23 = old garbage)
  results.forEach(function(r) {
    var needsCompute = !r.Duration;
    if (!needsCompute && r.Duration) {
      var hMatch = String(r.Duration).match(/^(\d+)h/);
      if (hMatch && parseInt(hMatch[1], 10) > 23) needsCompute = true;
    }
    if (needsCompute && r.TimeIN && r.TimeOUT) {
      var ti = parseTimeToday(r.TimeIN);
      var to = parseTimeToday(r.TimeOUT);
      if (ti && to && to > ti) {
        var d = calcDuration(ti, to);
        if (d) r.Duration = d;
      }
    }
  });

  return { success: true, data: results, total: results.length };
}

function exportCSV(filters) {
  var result = getLogs(filters);
  if (!result.success) return result;

  var headers = ['LogID','QRCode','PersonID','Type','Name','Department','TimeIN','TimeOUT','Duration','Date','Gate','Status'];
  var rows = [headers.join(',')];

  result.data.forEach(function(row) {
    rows.push(headers.map(function(h) {
      var val = String(row[h] || '').replace(/,/g, ' ');
      return '"' + val + '"';
    }).join(','));
  });

  return { success: true, csv: rows.join('\n'), filename: 'attendance-' + today() + '.csv' };
}

function getDashboardData() {
  var todayStr = today();
  var logs     = getSheetAsObjects(SHEETS.LOGS);
  var todayLogs = logs.filter(function(r) { return r.Date === todayStr; });

  var empLogs = todayLogs.filter(function(r) { return r.Type === 'EMP'; });
  var visLogs = todayLogs.filter(function(r) { return r.Type === 'VIS'; });

  var allEmps = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) { return e.Status === 'ACTIVE'; });

  // LateAfter threshold from Config (default 09:30)
  var configRows = getSheetAsObjects(SHEETS.CONFIG);
  var lateAfterStr = '09:30';
  configRows.forEach(function(c) { if (c.Key === 'LateAfter') lateAfterStr = c.Value || lateAfterStr; });
  var lateMatch = lateAfterStr.match(/^(\d{1,2}):(\d{2})$/);
  var lateH = lateMatch ? parseInt(lateMatch[1]) : 9;
  var lateM = lateMatch ? parseInt(lateMatch[2]) : 30;

  function parseTimeMinutes(t) {
    if (!t) return null;
    var s = String(t);
    var m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
      var h = parseInt(m12[1]), mn = parseInt(m12[2]), ap = m12[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      return h * 60 + mn;
    }
    var m24 = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
    return null;
  }
  var lateThreshMin = lateH * 60 + lateM;

  // Unique employee IDs who checked in today
  var presentIdSet = {};
  empLogs.forEach(function(r) { presentIdSet[String(r.PersonID)] = true; });
  var presentIds = Object.keys(presentIdSet);
  var absent = allEmps.filter(function(e) { return presentIds.indexOf(String(e.EmpID)) === -1; });

  // One chip per unique present employee (use first log row per person), mark late
  var seenIds = {};
  var lateCount = 0;
  var presentList = empLogs.filter(function(r) {
    var id = String(r.PersonID);
    if (seenIds[id]) return false;
    seenIds[id] = true;
    var tMin = parseTimeMinutes(r.TimeIN);
    r.isLate = tMin !== null && tMin > lateThreshMin;
    if (r.isLate) lateCount++;
    return true;
  });

  // Build photo lookup from Employees sheet
  var photoMap = {};
  allEmps.forEach(function(e) { if (e.PhotoURL) photoMap[String(e.EmpID)] = e.PhotoURL; });

  // Monthly stats — count present/absent/late days this month per employee
  var nowDate2   = new Date();
  var ymPrefix   = todayStr.substring(0, 7); // "YYYY-MM"
  var todayDay   = nowDate2.getDate();
  var monthLogs  = logs.filter(function(r) { return r.Type === 'EMP' && r.Date && String(r.Date).indexOf(ymPrefix) === 0; });
  var mthDayMap  = {}; // empId -> { day -> timeIn }
  monthLogs.forEach(function(r) {
    var id  = String(r.PersonID);
    var day = parseInt(String(r.Date).split('-')[2], 10);
    if (!mthDayMap[id]) mthDayMap[id] = {};
    if (!mthDayMap[id][day]) mthDayMap[id][day] = r.TimeIN || '';
  });
  function mthStats(empId) {
    var id = String(empId);
    var dayMap = mthDayMap[id] || {};
    var present = 0, absentDays = 0, late = 0;
    for (var d = 1; d <= todayDay; d++) {
      if (dayMap[d] !== undefined) {
        present++;
        var t = parseTimeMinutes(dayMap[d]);
        if (t !== null && t > lateThreshMin) late++;
      } else { absentDays++; }
    }
    return { mthPresent: present, mthAbsent: absentDays, mthLate: late };
  }

  // Attach monthly stats to presentList (PersonID = EmpID in logs)
  presentList = presentList.map(function(r) { return Object.assign({}, r, mthStats(r.PersonID)); });
  // Attach monthly stats to absent list (EmpID field)
  absent = absent.map(function(e) { return Object.assign({}, e, mthStats(e.EmpID)); });

  // Mark isLate on all recent activity too, attach PhotoURL
  var recent = todayLogs.slice(-20).reverse().map(function(r) {
    var tMin = parseTimeMinutes(r.TimeIN);
    r.isLate = tMin !== null && tMin > lateThreshMin;
    r.PhotoURL = photoMap[String(r.PersonID)] || '';
    return r;
  });

  var activeVisitors = getSheetAsObjects(SHEETS.ACTIVE_VISITORS);

  // Enrich active visitors with ExpectedOut / Purpose / Company from Visitors sheet
  var visitorRecords = getSheetAsObjects(SHEETS.VISITORS);
  var visitorMap = {};
  visitorRecords.forEach(function(v) { visitorMap[String(v.VisitorID)] = v; });

  var nowDate = new Date();
  var nowH = nowDate.getHours(), nowM = nowDate.getMinutes();
  var overdueCount = 0;

  activeVisitors = activeVisitors.map(function(av) {
    var vis = visitorMap[String(av.VisitorID)] || {};
    var expectedOut = vis.ExpectedOut || '';
    var overdue = false;
    if (expectedOut) {
      var m = String(expectedOut).match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        var expH = parseInt(m[1]), expM = parseInt(m[2]);
        if (expH < nowH || (expH === nowH && expM <= nowM)) {
          overdue = true;
          overdueCount++;
        }
      }
    }
    return Object.assign({}, av, {
      ExpectedOut: expectedOut,
      Purpose:     vis.Purpose || '',
      Company:     vis.Company || '',
      overdue:     overdue
    });
  });

  return {
    success:           true,
    date:              todayStr,
    present:           presentIds.length,
    absent:            absent.length,
    totalEmployees:    allEmps.length,
    lateCount:         lateCount,
    lateAfter:         lateAfterStr,
    visitors:          visLogs.length,
    activeVisitors:    activeVisitors.length,
    overdueVisitors:   overdueCount,
    presentList:       presentList,
    absentList:        absent,
    recentActivity:    recent,
    activeVisitorList: activeVisitors
  };
}

function getAnalyticsData(range) {
  range = range || 30;
  var logs = getSheetAsObjects(SHEETS.LOGS);

  var trend = {};
  logs.forEach(function(r) {
    if (!trend[r.Date]) trend[r.Date] = { emp: 0, vis: 0 };
    if (r.Type === 'EMP' && r.TimeIN) trend[r.Date].emp++;
    if (r.Type === 'VIS' && r.TimeIN) trend[r.Date].vis++;
  });

  var hours = {};
  for (var h = 0; h < 24; h++) hours[h] = 0;
  logs.forEach(function(r) {
    if (!r.TimeIN) return;
    var hr;
    if (r.TimeIN instanceof Date) {
      hr = r.TimeIN.getHours();
    } else {
      var match = String(r.TimeIN).match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return;
      hr = parseInt(match[1]);
      var ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hr !== 12) hr += 12;
      if (ampm === 'AM' && hr === 12) hr = 0;
    }
    hours[hr]++;
  });

  /* Dept × weekday heatmap
     Structure: { "Engineering": { 1:n, 2:n, 3:n, 4:n, 5:n }, ... }
     Keys 1-5 = Mon-Fri (Date.getDay() returns 0=Sun,6=Sat — skip those).
     Value = count of check-ins; caller divides by total dept employees to get %.
     We also track per-dept totals so the frontend can normalise. */
  var heatmap = {};      // dept → { 1..5: count }
  var deptTotal = {};    // dept → { 1..5: eligible employee count } — we use distinct PersonIDs per day
  var deptPersonDay = {}; // dept+day → Set of PersonIDs (deduplicate multi-swipes)

  logs.forEach(function(r) {
    if (r.Type !== 'EMP' || !r.TimeIN || !r.Department || !r.PersonID) return;
    var d = r.Date ? new Date(r.Date) : null;
    if (!d || isNaN(d.getTime())) return;
    var dow = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
    if (dow === 0 || dow === 6) return;
    var dept = String(r.Department).trim();
    if (!dept) return;
    var key = dept + '|' + dow;
    if (!deptPersonDay[key]) deptPersonDay[key] = {};
    deptPersonDay[key][r.PersonID] = true;
  });

  Object.keys(deptPersonDay).forEach(function(key) {
    var parts = key.split('|');
    var dept = parts[0];
    var dow  = parseInt(parts[1]);
    var cnt  = Object.keys(deptPersonDay[key]).length;
    if (!heatmap[dept]) heatmap[dept] = { 1:0, 2:0, 3:0, 4:0, 5:0 };
    heatmap[dept][dow] = cnt;
  });

  /* To normalise as %, the frontend needs the max possible per dept per day.
     Approximate: use the highest single-day count for that dept as the 100% anchor. */
  var heatmapNorm = {};
  Object.keys(heatmap).forEach(function(dept) {
    var row = heatmap[dept];
    var maxCnt = Math.max(row[1]||0, row[2]||0, row[3]||0, row[4]||0, row[5]||0) || 1;
    heatmapNorm[dept] = {};
    for (var dow = 1; dow <= 5; dow++) {
      heatmapNorm[dept][dow] = Math.round(((row[dow]||0) / maxCnt) * 100);
    }
  });

  /* Top repeat visitors — count distinct visit days per visitor name */
  var visCount = {};
  var visCompany = {};
  logs.forEach(function(r) {
    if (r.Type !== 'VIS' || !r.Name || !r.TimeIN) return;
    var name = String(r.Name).trim();
    visCount[name] = (visCount[name] || 0) + 1;
    if (r.Department) visCompany[name] = String(r.Department).trim(); // visitors may store host dept
  });
  /* Also pull from VISITORS sheet for Company field */
  var visitorRecords = getSheetAsObjects(SHEETS.VISITORS);
  var visitorCompanyMap = {};
  visitorRecords.forEach(function(v) {
    if (v.Name && v.Company) visitorCompanyMap[String(v.Name).trim()] = String(v.Company).trim();
  });

  var visFreqArr = Object.keys(visCount).map(function(name) {
    return { name: name, count: visCount[name], company: visitorCompanyMap[name] || '' };
  });
  visFreqArr.sort(function(a, b) { return b.count - a.count; });
  var visitorFreq = visFreqArr.slice(0, 8);

  return { success: true, trend: trend, peakHours: hours, heatmap: heatmapNorm, visitorFreq: visitorFreq };
}

// ── Monthly attendance matrix ──────────────────────────────
// Returns per-employee rows with TimeIN, TimeOUT, Duration for each day of the month.
// year: "2025", month: "06" (1-indexed, zero-padded)
function getMonthlyAttendance(year, month) {
  var ym = year + '-' + (String(month).length === 1 ? '0' + month : month);
  var logs = getSheetAsObjects(SHEETS.LOGS);
  var employees = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) {
    return e.Status === 'ACTIVE' || e.Status === 'INACTIVE';
  });

  // Filter to this month, employees only
  var monthLogs = logs.filter(function(r) {
    return r.Type === 'EMP' && r.Date && String(r.Date).indexOf(ym) === 0;
  });

  // Build map: empId → { day → { timeIn, timeOut, duration, status } }
  var empDayMap = {};
  monthLogs.forEach(function(r) {
    var id = String(r.PersonID);
    var day = parseInt(String(r.Date).split('-')[2], 10);
    if (!empDayMap[id]) empDayMap[id] = {};
    var existing = empDayMap[id][day];
    // Prefer PRESENT over PARTIAL; earliest TimeIN, latest TimeOUT
    if (!existing) {
      empDayMap[id][day] = { timeIn: r.TimeIN || '', timeOut: r.TimeOUT || '', duration: r.Duration || '', status: r.Status || '' };
    } else {
      if (r.Status === 'PRESENT') existing.status = 'PRESENT';
      if (r.TimeOUT) existing.timeOut = r.TimeOUT;
      if (r.Duration) existing.duration = r.Duration;
    }
  });

  // Count days in month
  var daysInMonth = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();

  // Build rows
  var rows = employees.map(function(emp) {
    var id = String(emp.EmpID);
    var days = {};
    for (var d = 1; d <= daysInMonth; d++) {
      days[d] = empDayMap[id] && empDayMap[id][d] ? empDayMap[id][d] : null;
    }
    // Totals
    var presentDays = 0, totalMins = 0;
    for (var d2 = 1; d2 <= daysInMonth; d2++) {
      if (days[d2]) {
        presentDays++;
        var dur = days[d2].duration;
        if (dur) {
          var m = String(dur).match(/^(\d+)h\s*(\d+)m$/);
          if (m) totalMins += parseInt(m[1]) * 60 + parseInt(m[2]);
          else { var m2 = String(dur).match(/^(\d+)m$/); if (m2) totalMins += parseInt(m2[1]); }
        }
      }
    }
    var totalHrs = totalMins ? (totalMins / 60).toFixed(1) : '0.0';
    return {
      empId: id,
      name: emp.Name,
      department: emp.Department || '',
      status: emp.Status,
      days: days,
      presentDays: presentDays,
      totalHours: totalHrs
    };
  });

  rows.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { success: true, rows: rows, daysInMonth: daysInMonth, year: year, month: month };
}

function getConfig() {
  return { success: true, data: getSheetAsObjects(SHEETS.CONFIG) };
}

function saveConfig(configArray) {
  var sheet = getSheet(SHEETS.CONFIG);
  configArray.forEach(function(item) {
    var row = findRowByValue(sheet, 'Key', item.Key);
    if (row !== -1) setCell(sheet, row, 'Value', item.Value);
  });
  return { success: true };
}
