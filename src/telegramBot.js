// ============================================================
// telegramBot.js — QrAtt attendance query builders for Telegram
// ------------------------------------------------------------
// Transport (send/reply/poll/enable) is in TelegramLib.js.
// Command wiring is in telegramCommands.js (TELEGRAM_COMMANDS map).
// This file holds only the sheet-reading query builders those commands call.
// Commands: /present /absent /late /today /visitors /find <name> /help
// ============================================================

// ── Query builders (pure-ish; read the sheet, return HTML strings) ──────────

function _tgEmpDayRows_() {
  var todayStr = today();
  return getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
    return r.Type === 'EMP' && r.Date === todayStr;
  });
}

function _tgFirstInByEmp_(rows) {
  var seen = {}, out = [];
  rows.forEach(function(r) {
    var id = String(r.PersonID);
    if (seen[id] || !r.TimeIN) return;
    seen[id] = true;
    out.push(r);
  });
  return out;
}

function _tgHelp_() {
  return '🤖 <b>QR Attendance Bot</b>\n' +
    '/today — attendance summary\n' +
    '/present — who is in today\n' +
    '/absent — who has not shown up\n' +
    '/late — late arrivals\n' +
    '/visitors — visitors today\n' +
    '/find &lt;name&gt; — look up a person';
}

function _tgToday_() {
  var rows = _tgEmpDayRows_();
  var present = _tgFirstInByEmp_(rows);
  var visLogs = getSheetAsObjects(SHEETS.LOGS).filter(function(r) { return r.Type === 'VIS' && r.Date === today(); });
  var active = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) { return e.Status === 'ACTIVE'; });
  var lateCount = present.filter(function(r) { return _isLateTime_(r.TimeIN); }).length;
  var absent = active.length - present.length;
  var pct = active.length ? Math.round((present.length / active.length) * 100) : 0;
  return '📊 <b>Today — ' + today() + '</b>\n' +
    '✅ Present: <b>' + present.length + '</b> / ' + active.length + ' (' + pct + '%)\n' +
    '⏰ Late: <b>' + lateCount + '</b>   ❌ Absent: <b>' + absent + '</b>\n' +
    '👥 Visitors: <b>' + visLogs.length + '</b>';
}

function _tgPresent_() {
  var present = _tgFirstInByEmp_(_tgEmpDayRows_())
    .sort(function(a, b) { return (a.Name || '').localeCompare(b.Name || ''); });
  if (!present.length) return 'No one has checked in today.';
  var lines = present.slice(0, 40).map(function(r) {
    return (_isLateTime_(r.TimeIN) ? '🟠' : '🟢') + ' ' + _tgEsc_(r.Name) + ' — ' + _tgEsc_(r.TimeIN);
  });
  if (present.length > 40) lines.push('… +' + (present.length - 40) + ' more');
  return '<b>Present (' + present.length + ')</b>\n' + lines.join('\n');
}

function _tgAbsent_() {
  var presentIds = {};
  _tgFirstInByEmp_(_tgEmpDayRows_()).forEach(function(r) { presentIds[String(r.PersonID)] = true; });
  var absent = getSheetAsObjects(SHEETS.EMPLOYEES)
    .filter(function(e) { return e.Status === 'ACTIVE' && !presentIds[String(e.EmpID)]; });
  if (!absent.length) return '🎉 Everyone is present today.';
  var lines = absent.slice(0, 40).map(function(e) {
    return '🔴 ' + _tgEsc_(e.Name) + (e.Department ? ' — ' + _tgEsc_(e.Department) : '');
  });
  if (absent.length > 40) lines.push('… +' + (absent.length - 40) + ' more');
  return '<b>Absent (' + absent.length + ')</b>\n' + lines.join('\n');
}

function _tgLate_() {
  var late = _tgFirstInByEmp_(_tgEmpDayRows_())
    .filter(function(r) { return _isLateTime_(r.TimeIN); })
    .sort(function(a, b) { return (a.Name || '').localeCompare(b.Name || ''); });
  if (!late.length) return 'No late arrivals today. 👍';
  var lines = late.slice(0, 40).map(function(r) {
    return '🟠 ' + _tgEsc_(r.Name) + ' — ' + _tgEsc_(r.TimeIN);
  });
  return '<b>Late today (' + late.length + ')</b>\n' + lines.join('\n');
}

// Openable visitor link: opens the visitor pass (?page=vpass&id=<VisitorID>).
// Falls back to plain name if the id or app URL is unavailable.
function _tgVisitorLink_(name, visitorId) {
  var id = String(visitorId || '').trim();
  var nm = _tgEsc_(name || 'Visitor');
  if (!id) return nm;
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!base) return nm;
  return '<a href="' + base + '?page=vpass&id=' + encodeURIComponent(id) + '">' + nm + '</a>';
}

function _tgVisitors_() {
  var vis = getSheetAsObjects(SHEETS.LOGS).filter(function(r) { return r.Type === 'VIS' && r.Date === today(); });
  if (!vis.length) return 'No visitors today.';
  var lines = vis.slice(0, 40).map(function(r) {
    return '👤 ' + _tgVisitorLink_(r.Name, r.PersonID) + ' — IN ' + _tgEsc_(r.TimeIN) + (r.TimeOUT ? ' · OUT ' + _tgEsc_(r.TimeOUT) : ' · <i>still in</i>');
  });
  return '<b>Visitors today (' + vis.length + ')</b>\n' + lines.join('\n');
}

function _tgFind_(name) {
  if (!name) return 'Usage: /find &lt;name&gt;';
  var q = name.toLowerCase();
  var emps = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) {
    return String(e.Name || '').toLowerCase().indexOf(q) !== -1 || String(e.EmpID || '').toLowerCase() === q;
  });
  if (!emps.length) return 'No employee matching "' + _tgEsc_(name) + '".';
  var todayRows = _tgEmpDayRows_();
  var lines = emps.slice(0, 10).map(function(e) {
    var row = null;
    todayRows.forEach(function(r) { if (String(r.PersonID) === String(e.EmpID) && r.TimeIN) row = r; });
    var status = e.Status !== 'ACTIVE' ? '⚪ ' + e.Status
      : row ? (row.TimeOUT ? '🔴 OUT ' + row.TimeOUT + ' (in ' + row.TimeIN + ')' : '🟢 IN since ' + row.TimeIN)
            : '❌ not in today';
    return '<b>' + _tgEsc_(e.Name) + '</b> (' + _tgEsc_(e.EmpID) + ')\n' +
      (e.Department ? _tgEsc_(e.Department) + ' · ' : '') + status;
  });
  return lines.join('\n\n');
}
