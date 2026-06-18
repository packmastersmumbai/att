// ============================================================
// triggers.gs — Install and manage time-based triggers
// Run installTriggers() ONCE manually after first deployment.
// ============================================================

function installTriggers() {
  // Remove existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  var summaryHr  = parseInt(getConfigValue('SummaryHr')     || '19');
  var checkoutHr = parseInt(getConfigValue('AutoCheckoutHr') || '23');

  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .atHour(summaryHr)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('autoCheckoutAll')
    .timeBased()
    .atHour(checkoutHr)
    .everyDays(1)
    .create();

  Logger.log('Triggers installed: summary at ' + summaryHr + 'h, auto-checkout at ' + checkoutHr + 'h');
  return { success: true };
}

/**
 * Auto-closes any open check-ins from today (marks as PARTIAL).
 * Runs at 11 PM by default.
 */
function autoCheckoutAll() {
  var logsSheet = getSheet(SHEETS.LOGS);
  var todayStr  = today();
  var lastRow   = logsSheet.getLastRow();
  if (lastRow < 2) return;

  var dateCol     = getColIndex(logsSheet, 'Date');
  var timeInCol   = getColIndex(logsSheet, 'TimeIN');
  var timeOutCol  = getColIndex(logsSheet, 'TimeOUT');
  var durationCol = getColIndex(logsSheet, 'Duration');
  var statusCol   = getColIndex(logsSheet, 'Status');

  var dataRange = lastRow - 1;
  var dates    = logsSheet.getRange(2, dateCol,    dataRange, 1).getValues();
  var timeIns  = logsSheet.getRange(2, timeInCol,  dataRange, 1).getValues();
  var timeOuts = logsSheet.getRange(2, timeOutCol, dataRange, 1).getValues();

  var now = new Date();
  var nowTimeStr = formatTime(now);

  for (var i = 0; i < dates.length; i++) {
    var storedDate = dates[i][0];
    var formattedDate = storedDate instanceof Date ? formatDate(storedDate) : String(storedDate);
    if (formattedDate === todayStr && timeOuts[i][0] === '') {
      var rowNum = i + 2;
      var timeIn = parseTimeToday(timeIns[i][0]);
      var duration = timeIn ? calcDuration(timeIn, now) : '';
      // TimeOUT+Duration are contiguous — one write; Status is separate
      logsSheet.getRange(rowNum, timeOutCol, 1, 2).setValues([[nowTimeStr, duration]]);
      logsSheet.getRange(rowNum, statusCol).setValue('PARTIAL');
    }
  }

  // Clear ActiveVisitors tab
  var activeSheet  = getSheet(SHEETS.ACTIVE_VISITORS);
  var activeLastRow = activeSheet.getLastRow();
  if (activeLastRow > 1) {
    activeSheet.getRange(2, 1, activeLastRow - 1, activeSheet.getLastColumn()).clearContent();
  }
}
