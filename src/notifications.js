// ============================================================
// notifications.gs — WhatsApp (CallMeBot) + Gmail alerts
// ============================================================

/**
 * Send WhatsApp message via CallMeBot API.
 * One-time setup: owner visits
 * https://wa.me/18053986627?text=I%20allow%20callmebot%20to%20send%20me%20messages
 * then saves the returned API key in Config tab under 'CallMeBotKey'.
 */
function _sendWhatsApp(phone, message) {
  var apiKey = getConfigValue('CallMeBotKey');
  if (!apiKey || apiKey === '(set after WhatsApp link)') {
    Logger.log('WhatsApp not configured — skipping notification');
    return false;
  }
  var url = 'https://api.callmebot.com/whatsapp.php' +
    '?phone='  + encodeURIComponent(phone) +
    '&text='   + encodeURIComponent(message) +
    '&apikey=' + encodeURIComponent(apiKey);
  try {
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return true;
  } catch (e) {
    Logger.log('WhatsApp send failed: ' + e.message);
    return false;
  }
}

/**
 * Notify the host employee that their visitor has arrived.
 */
function sendVisitorAlert(visitor) {
  if (!visitor || !visitor.hostId) return;

  var empSheet = getSheet(SHEETS.EMPLOYEES);
  var hostRow  = findRowByValue(empSheet, 'EmpID', visitor.hostId);
  if (hostRow === -1) return;

  var hostPhone = getCell(empSheet, hostRow, 'Phone');
  var hostName  = getCell(empSheet, hostRow, 'Name');
  if (!hostPhone) return;

  var msg = 'Hi ' + hostName + ', your visitor *' + visitor.name +
    '* from ' + (visitor.department || 'N/A') +
    ' has arrived. Time: ' + formatTime(new Date());

  _sendWhatsApp(hostPhone, msg);
}

/**
 * Alert owner when a blacklisted QR is scanned.
 */
function sendBlacklistAlert(qrCode, personName, gate) {
  var ownerPhone = getConfigValue('OwnerPhone');
  if (!ownerPhone || ownerPhone === '(set after setup)') return;

  var msg = '⚠️ ALERT: Blacklisted person *' + personName +
    '* (QR: ' + qrCode + ') attempted entry at *' + gate +
    '* — ' + formatTime(new Date());

  _sendWhatsApp(ownerPhone, msg);
}

/**
 * Daily attendance summary sent to owner via Gmail.
 * Called by time-based trigger at configured hour.
 */
function sendDailySummary() {
  var ownerEmail = getConfigValue('OwnerEmail');
  if (!ownerEmail || ownerEmail === '(set after setup)') return;

  var todayStr = today();
  var logs     = getSheetAsObjects(SHEETS.LOGS);
  var todayLogs = logs.filter(function(r) { return r.Date === todayStr; });

  var empLogs = todayLogs.filter(function(r) { return r.Type === 'EMP'; });
  var visLogs = todayLogs.filter(function(r) { return r.Type === 'VIS'; });
  var present = empLogs.filter(function(r) { return r.TimeIN !== ''; }).length;

  var allEmps = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) { return e.Status === 'ACTIVE'; });
  var presentIds = empLogs.map(function(r) { return String(r.PersonID); });
  var absent = allEmps.filter(function(e) { return presentIds.indexOf(String(e.EmpID)) === -1; });

  var orgName = getConfigValue('OrgName') || 'Organisation';

  var rows = empLogs.map(function(r) {
    return '<tr><td>' + r.Name + '</td><td>' + r.Department + '</td><td>' + r.TimeIN + '</td>' +
      '<td>' + (r.TimeOUT || 'Still IN') + '</td><td>' + (r.Duration || '–') + '</td></tr>';
  }).join('');

  var absentRows = absent.map(function(e) {
    return '<tr style="color:#c00"><td>' + e.Name + '</td><td>' + e.Department +
      '</td><td colspan="3">ABSENT</td></tr>';
  }).join('');

  var html = '<h2>' + orgName + ' — Daily Attendance Report</h2>' +
    '<p><b>Date:</b> ' + todayStr + '</p>' +
    '<p><b>Present:</b> ' + present + ' | <b>Absent:</b> ' + absent.length +
    ' | <b>Visitors:</b> ' + visLogs.length + '</p>' +
    '<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">' +
    '<tr style="background:#f0f0f0"><th>Name</th><th>Dept</th><th>Time IN</th><th>Time OUT</th><th>Duration</th></tr>' +
    rows + absentRows + '</table>';

  GmailApp.sendEmail(ownerEmail, orgName + ' Attendance — ' + todayStr, '', { htmlBody: html });
}
