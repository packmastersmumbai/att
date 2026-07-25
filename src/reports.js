// ============================================================
// reports.gs — Query logs, CSV export, analytics data
// ============================================================

function getLogs(filters) {
  filters = filters || {};
  var logs = getSheetAsObjects(SHEETS.LOGS);

  // Gender lookup from Employees (Logs has no Gender column); join onto each row.
  var genderMap = {};
  getSheetAsObjects(SHEETS.EMPLOYEES).forEach(function(e) { genderMap[String(e.EmpID)] = e.Gender || ''; });
  logs.forEach(function(row) { row.Gender = genderMap[String(row.PersonID)] || ''; });

  // Visitor details live only in the Visitors sheet — the Logs row for a scan
  // carries just Name (+ empty Department). Join Company/Purpose/Host/Vehicle/ID
  // onto each VIS row so the report can show who the visitor is, why they came,
  // and who they met. Host id is resolved to the employee's name for display.
  var hasVisRows = logs.some(function(row) { return row.Type === 'VIS'; });
  if (hasVisRows) {
    var visMap = {};
    getSheetAsObjects(SHEETS.VISITORS).forEach(function(v) { visMap[String(v.VisitorID)] = v; });
    var empNameMap = {};
    getSheetAsObjects(SHEETS.EMPLOYEES).forEach(function(e) { empNameMap[String(e.EmpID)] = e.Name || ''; });
    logs.forEach(function(row) {
      if (row.Type !== 'VIS') return;
      var v = visMap[String(row.PersonID)];
      if (!v) return;
      row.Company = v.Company || '';
      row.Purpose = v.Purpose || '';
      row.Vehicle = v.Vehicle || '';
      row.IDType  = v.IDType || '';
      row.IDNumber = v.IDNumber || '';
      row.Phone   = v.Phone || '';
      // HostEmpID is what the visitors History table renders; Host is the
      // resolved employee name for the report's richer view.
      row.HostEmpID = v.HostEmpID || '';
      row.Host    = empNameMap[String(v.HostEmpID)] || v.HostEmpID || '';
      // The report's "Department" column is blank for visitors; show Company
      // there (falling back to Purpose) so the row isn't just a bare name.
      if (!row.Department) row.Department = v.Company || v.Purpose || '';
    });
  }

  var results = logs.filter(function(row) {
    if (filters.dateFrom && row.Date < filters.dateFrom) return false;
    if (filters.dateTo   && row.Date > filters.dateTo)   return false;
    if (filters.type   && filters.type   !== 'ALL' && row.Type   !== filters.type)   return false;
    if (filters.status && filters.status !== 'ALL' && row.Status !== filters.status) return false;
    if (filters.department && row.Department !== filters.department) return false;
    if (filters.gender && filters.gender !== 'ALL' && String(row.Gender) !== filters.gender) return false;
    if (filters.name && row.Name.toLowerCase().indexOf(filters.name.toLowerCase()) === -1) return false;
    return true;
  });

  // Late threshold (shared with the modal & hours summary — single source of truth)
  var lateThreshMin = _hoursThresholds_().lateThreshMin;

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
    // Mark late so the access-log UI can highlight it (EMP rows only)
    var tMin = _parseTimeMinutes_(r.TimeIN);
    r.isLate = r.Type === 'EMP' && tMin !== null && tMin > lateThreshMin;
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
  // Cache the whole payload ~15s. Kiosks/dashboards poll this every few seconds
  // and it reads 5 full sheets per call — uncached that exhausts the daily script
  // runtime quota (→ "refused to connect" for everyone until reset). CacheService
  // costs no quota; rapid polls now reuse one computation.
  var cache = CacheService.getScriptCache();
  var hit = cache.get('dashData');
  if (hit) { try { return JSON.parse(hit); } catch(e) {} }
  var result = _computeDashboardData_();
  try { cache.put('dashData', JSON.stringify(result), 15); } catch(e) {}
  return result;
}

/**
 * Drops the cached dashboard payload. Call after any write that changes
 * attendance, otherwise a person who just checked in still reads as absent for
 * up to 15s — which prompts staff to scan again and race the first write.
 */
function invalidateDashboardCache() {
  try { CacheService.getScriptCache().remove('dashData'); } catch(e) {}
}

function _computeDashboardData_() {
  var todayStr = today();
  var holiday  = isHoliday(todayStr);
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

  // Build photo + gender lookups from Employees sheet
  var photoMap = {}, genderMap = {};
  allEmps.forEach(function(e) {
    if (e.PhotoURL) photoMap[String(e.EmpID)] = e.PhotoURL;
    genderMap[String(e.EmpID)] = e.Gender || '';
  });
  // Visitor photos live in the Visitors sheet, keyed by VisitorID — join them
  // so visitor arrival cards show the captured photo, not just initials.
  getSheetAsObjects(SHEETS.VISITORS).forEach(function(vv) {
    if (vv.PhotoURL) photoMap[String(vv.VisitorID)] = vv.PhotoURL;
  });

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

  // Attach monthly stats + Gender to presentList (Gender joined from Employees).
  presentList = presentList.map(function(r) {
    return Object.assign({}, r, mthStats(r.PersonID), { Gender: genderMap[String(r.PersonID)] || '' });
  });
  // Absent already carries Gender (from Employees); just attach monthly stats.
  absent = absent.map(function(e) { return Object.assign({}, e, mthStats(e.EmpID)); });

  // Gender split counts for present & absent (Male/Female/Other/Unspecified).
  function genderCounts(list) {
    var c = { male: 0, female: 0, other: 0, unspecified: 0 };
    list.forEach(function(x) {
      var g = String(x.Gender || '').toLowerCase();
      if (g === 'male') c.male++;
      else if (g === 'female') c.female++;
      else if (g === 'other') c.other++;
      else c.unspecified++;
    });
    return c;
  }
  var presentGender = genderCounts(presentList);
  var absentGender  = genderCounts(absent);

  // Mark isLate on all recent activity too, attach PhotoURL
  var recent = todayLogs.slice().reverse().map(function(r) {
    var tMin = parseTimeMinutes(r.TimeIN);
    r.isLate = tMin !== null && tMin > lateThreshMin;
    r.PhotoURL = photoMap[String(r.PersonID)] || '';
    return r;
  });

  // "Currently checked-in visitors" is derived from OPEN visitor Logs rows —
  // the authoritative record — NOT the ActiveVisitors sheet. That separate
  // sheet drifted out of sync (autoCheckoutAll wipes it nightly, a half-run
  // checkout could clear it) leaving visitors with an open Logs row invisible
  // in every "who's here" view. A visitor is active iff their latest Logs row
  // has an empty TimeOUT.
  var visitorRecords = getSheetAsObjects(SHEETS.VISITORS);
  var visitorMap = {};
  visitorRecords.forEach(function(v) { visitorMap[String(v.VisitorID)] = v; });

  var empNameMap = {};
  allEmps.forEach(function(e) { empNameMap[String(e.EmpID)] = e.Name || ''; });

  var openVisitorLogs = logs.filter(function(r) { return r.Type === 'VIS' && r.TimeOUT === ''; });

  var nowDate = new Date();
  var nowH = nowDate.getHours(), nowM = nowDate.getMinutes();
  var overdueCount = 0;

  var activeVisitors = openVisitorLogs.map(function(r) {
    var vis = visitorMap[String(r.PersonID)] || {};
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
    return {
      VisitorID:   r.PersonID,
      Name:        r.Name || vis.Name || '',
      TimeIN:      r.TimeIN,
      Gate:        r.Gate || '',
      HostEmpID:   vis.HostEmpID || '',
      Host:        empNameMap[String(vis.HostEmpID)] || vis.HostEmpID || '',
      ExpectedOut: expectedOut,
      Purpose:     vis.Purpose || '',
      Company:     vis.Company || '',
      overdue:     overdue
    };
  });

  return {
    success:           true,
    date:              todayStr,
    holiday:           holiday,
    present:           presentIds.length,
    absent:            absent.length,
    presentGender:     presentGender,
    absentGender:      absentGender,
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
  // Note: getSheetAsObjects still reads the full Logs sheet — GAS has no
  // server-side range filter on header objects — but bounding the rows to
  // this month right after the read keeps all downstream per-row work
  // (empDayMap build, totals) scoped to a single month instead of full
  // history. A true fix (per-month sheet) is out of scope here.
  var monthLogs = getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
    return r.Type === 'EMP' && r.Date && String(r.Date).indexOf(ym) === 0;
  });
  var employees = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) {
    return e.Status === 'ACTIVE' || e.Status === 'INACTIVE';
  });

  var lateThreshMin = _hoursThresholds_().lateThreshMin;  // shared threshold

  // Build map: empId → { day → { timeIn, timeOut, duration, status, late } }
  var empDayMap = {};
  monthLogs.forEach(function(r) {
    var id = String(r.PersonID);
    var day = parseInt(String(r.Date).split('-')[2], 10);
    if (!empDayMap[id]) empDayMap[id] = {};
    var existing = empDayMap[id][day];
    var tMin = _parseTimeMinutes_(r.TimeIN);
    var isLate = tMin !== null && tMin > lateThreshMin;
    // Prefer PRESENT over PARTIAL; earliest TimeIN, latest TimeOUT
    if (!existing) {
      empDayMap[id][day] = { timeIn: r.TimeIN || '', timeOut: r.TimeOUT || '', duration: r.Duration || '', status: r.Status || '', late: isLate };
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

/**
 * Returns the Config sheet. Credentials are redacted unless the caller is an
 * authenticated admin.
 *
 * This endpoint is reachable anonymously — vreg.html is a public page and
 * calls it — so an unredacted payload would hand the Telegram bot token, the
 * CallMeBot key and the admin PIN to any visitor.
 */
function getConfig(token) {
  var isAdmin = _isAdminCaller_(token);
  var rows = getSheetAsObjects(SHEETS.CONFIG).filter(function(r) {
    return isAdmin || !_isSecretConfigKey_(r.Key);
  });
  return { success: true, data: rows };
}

function saveConfig(configArray, token) {
  _requireAdmin_(token);

  var sheet = getSheet(SHEETS.CONFIG);
  var valueCol = getColIndex(sheet, 'Value');
  configArray.forEach(function(item) {
    var row = findRowByValue(sheet, 'Key', item.Key);
    if (row === -1) {
      row = sheet.getLastRow() + 1;
      setCell(sheet, row, 'Key', item.Key);
    }
    // Force plain-text so Sheets can't coerce "08:10" into a time/date serial
    // (that corrupted LateAfter into "1899-12-30" and silently broke late calc).
    var cell = sheet.getRange(row, valueCol);
    cell.setNumberFormat('@');
    cell.setValue(item.Value == null ? '' : String(item.Value));
  });
  // Invalidate the per-execution Config memo so a value changed here is
  // seen by any getConfigValue() call later in this same execution.
  _CONFIG_MEMO = null;
  return { success: true };
}
