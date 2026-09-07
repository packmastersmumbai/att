// ============================================================
// triggers.gs — Install and manage time-based triggers
// Run installTriggers() ONCE manually after first deployment.
// ============================================================

function installTriggers(authToken) {
  _requireAdmin_(authToken);
  // Remove existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  var summaryHr  = parseInt(getConfigValue('SummaryHr')      || '9');
  var checkoutHr = parseInt(getConfigValue('AutoCheckoutHr') || '23');
  var hoursHr    = parseInt(getConfigValue('HoursRebuildHr') || '1'); // after auto-checkout closes the day
  var backupHr   = parseInt(getConfigValue('BackupHr')       || '23'); // end of day, after checkout

  // GAS fires an .atHour() trigger somewhere inside that hour, not on the dot.
  // nearMinute() narrows it to ~±15min, which is as precise as the platform
  // allows — worth setting so "digest at 09:00" is not delivered at 09:52.
  var summaryMin = parseInt(getConfigValue('SummaryMin') || '0');
  if (isNaN(summaryMin) || summaryMin < 0 || summaryMin > 59) summaryMin = 0;

  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .atHour(summaryHr)
    .nearMinute(summaryMin)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('autoCheckoutAll')
    .timeBased()
    .atHour(checkoutHr)
    .everyDays(1)
    .create();

  // Refresh the HoursSummary sheet daily (after sessions are closed for the day)
  ScriptApp.newTrigger('rebuildHoursSummarySheet')
    .timeBased()
    .atHour(hoursHr)
    .everyDays(1)
    .create();

  // Daily backup of Logs to the external backup spreadsheet (Config: BackupSheetId)
  ScriptApp.newTrigger('backupDailyLogs')
    .timeBased()
    .atHour(backupHr)
    .everyDays(1)
    .create();

  Logger.log('Triggers installed: summary at ' + summaryHr + 'h, auto-checkout at ' + checkoutHr + 'h, hours-rebuild at ' + hoursHr + 'h, backup at ' + backupHr + 'h');
  return { success: true };
}

/** Lists installed trigger handler function names (for verifying setup). */
function listInstalledTriggers() {
  return { success: true, handlers: ScriptApp.getProjectTriggers().map(function(t) { return t.getHandlerFunction(); }) };
}

/**
 * Core backup: appends Logs rows to the backup spreadsheet (Config 'BackupSheetId').
 * Copies exact displayed strings (times "6:51 AM", dates "2026-07-03") as plain text
 * so the backup mirrors the source format. Deduped by LogID — re-runs never duplicate.
 * @param {boolean} allDates  true = every date (backfill); false = today only (daily).
 */
function _backupLogs_(allDates) {
  var backupId = getConfigValue('BackupSheetId');
  if (!backupId) { Logger.log('backup: no BackupSheetId configured — skipped'); return { success: false, skipped: true }; }

  var src = getSheet(SHEETS.LOGS);
  var values = src.getDataRange().getDisplayValues();
  if (values.length < 2) return { success: true, appended: 0 };
  var headers = values[0];
  var logIdIdx = headers.indexOf('LogID');
  var dateIdx  = headers.indexOf('Date');
  var todayStr = today();

  var rows = values.slice(1).filter(function(r) {
    if (allDates || dateIdx === -1) return true;
    return String(r[dateIdx]) === todayStr;
  });
  if (!rows.length) return { success: true, appended: 0 };

  var backupSs = SpreadsheetApp.openById(backupId);
  var dest = backupSs.getSheetByName('Logs') || backupSs.insertSheet('Logs');
  if (dest.getLastRow() === 0) {
    dest.appendRow(headers);
    dest.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  var already = {};
  if (logIdIdx !== -1 && dest.getLastRow() > 1) {
    var col = dest.getRange(2, logIdIdx + 1, dest.getLastRow() - 1, 1).getValues();
    col.forEach(function(c) { already[String(c[0])] = true; });
  }
  var fresh = rows.filter(function(r) {
    return logIdIdx === -1 || !already[String(r[logIdIdx])];
  });
  if (!fresh.length) return { success: true, appended: 0 };

  var writeRange = dest.getRange(dest.getLastRow() + 1, 1, fresh.length, headers.length);
  writeRange.setNumberFormat('@');   // plain text — keep the copied strings verbatim
  writeRange.setValues(fresh);
  Logger.log('backup: appended ' + fresh.length + ' rows (allDates=' + !!allDates + ')');
  return { success: true, appended: fresh.length };
}

/** Daily trigger — backs up today's Logs. */
function backupDailyLogs() { return _backupLogs_(false); }

/** One-off backfill — copies ALL dates into the backup (deduped). */
function backupAllLogs() { return _backupLogs_(true); }

/** Wipes the backup 'Logs' tab (header + data). Use before a clean re-backfill. */
function clearBackupLogs() {
  var backupId = getConfigValue('BackupSheetId');
  if (!backupId) return { success: false, skipped: true };
  var dest = SpreadsheetApp.openById(backupId).getSheetByName('Logs');
  if (dest) dest.clear();
  return { success: true };
}

/**
 * Auto-closes any open check-ins from today (marks as PARTIAL).
 * Runs at 11 PM by default.
 */
function autoCheckoutAll() {
  // Runs at 11 PM, when people may still be scanning out. Without the lock this
  // sweep's stale in-memory snapshot can overwrite a checkout written a moment
  // earlier by processQRScan, resetting PRESENT back to PARTIAL.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('autoCheckoutAll: could not acquire lock, skipping this run');
    return;
  }
  try {
    _autoCheckoutAllLocked_();
  } finally {
    lock.releaseLock();
  }
}

function _autoCheckoutAllLocked_() {
  var logsSheet = getSheet(SHEETS.LOGS);
  var todayStr  = today();
  var lastRow   = logsSheet.getLastRow();
  if (lastRow < 2) return;

  var dateCol     = getColIndex(logsSheet, 'Date');
  var timeInCol   = getColIndex(logsSheet, 'TimeIN');
  var timeOutCol  = getColIndex(logsSheet, 'TimeOUT');
  var statusCol   = getColIndex(logsSheet, 'Status');

  var dataRange = lastRow - 1;
  var dates    = logsSheet.getRange(2, dateCol,    dataRange, 1).getValues();
  var timeIns  = logsSheet.getRange(2, timeInCol,  dataRange, 1).getValues();
  var statuses = logsSheet.getRange(2, statusCol,  dataRange, 1).getValues();
  // TimeOUT and Duration are contiguous — read them as one 2-wide block so the
  // untouched rows are written back with their own existing values.
  var outBlock = logsSheet.getRange(2, timeOutCol, dataRange, 2).getValues();

  var now = new Date();
  var nowTimeStr = formatTime(now);
  var closed = 0;

  // Mutate the in-memory images, then write each range once. The previous loop
  // issued two range writes per open session.
  for (var i = 0; i < dates.length; i++) {
    var storedDate = dates[i][0];
    var formattedDate = storedDate instanceof Date ? formatDate(storedDate) : String(storedDate);
    if (formattedDate !== todayStr || outBlock[i][0] !== '') continue;

    var timeIn = parseTimeToday(timeIns[i][0]);
    outBlock[i][0] = nowTimeStr;                              // TimeOUT
    outBlock[i][1] = timeIn ? calcDuration(timeIn, now) : ''; // Duration
    statuses[i][0] = 'PARTIAL';
    closed++;
  }

  if (closed) {
    logsSheet.getRange(2, timeOutCol, dataRange, 2).setValues(outBlock);
    logsSheet.getRange(2, statusCol,  dataRange, 1).setValues(statuses);
    invalidateDashboardCache();
  }

  // Before wiping ActiveVisitors, flag anyone being auto-closed who still holds
  // returnable gatepass items. This sweep runs at 11 PM with nobody watching,
  // so an unreturned item would otherwise vanish from view entirely — the
  // visitor is marked out, the item stays OUT_PENDING, and no human is ever
  // told. Best-effort: a notification failure must not abort the sweep.
  try { _alertUnreturnedAtAutoCheckout_(); }
  catch (e) { Logger.log('unreturned-items alert failed: ' + e.message); }

  // Clear ActiveVisitors tab
  var activeSheet  = getSheet(SHEETS.ACTIVE_VISITORS);
  var activeLastRow = activeSheet.getLastRow();
  if (activeLastRow > 1) {
    activeSheet.getRange(2, 1, activeLastRow - 1, activeSheet.getLastColumn()).clearContent();
  }
}

/**
 * Sends one summary alert naming the still-inside visitors who are being
 * auto-checked-out while holding OUT_PENDING gatepass items. Silent when there
 * are none.
 */
function _alertUnreturnedAtAutoCheckout_() {
  var activeSheet = getSheet(SHEETS.ACTIVE_VISITORS);
  if (activeSheet.getLastRow() < 2) return;
  var active = getSheetAsObjects(SHEETS.ACTIVE_VISITORS);
  if (!active.length) return;

  var lines = [], owing = [];
  active.forEach(function(a) {
    var id = String(a.VisitorID || '');
    if (!id) return;
    var n = 0;
    try { n = getVisitorReturnablesOutstanding(id); } catch (e) { return; }
    if (n > 0) {
      // _tgEsc_ — this used to interpolate the name raw, so a visitor called
      // "Ram & Co <Pvt>" broke HTML parsing and the message arrived stripped
      // of all formatting by the transport's plain-text retry.
      lines.push('• <b>' + _tgEsc_(a.Name || id) + '</b> — ' + n + ' item(s) not returned');
      owing.push({ id: id, name: a.Name || id });
    }
  });
  if (!lines.length) return;

  var msg = _tgCard_({
    icon: '⚠️', title: 'Auto-checkout: unreturned items',
    body: lines.join('\n'), raw: true,
    footer: '<i>Closed out by the nightly sweep while still holding returnable items.</i>'
  });

  // One "mark returned" button per visitor, so the common case (the items did
  // come back, nobody ticked them off) is a single tap instead of opening the
  // app. Capped at 5 — beyond that the keyboard is unreadable and /outstanding
  // is the better tool.
  var buttons = owing.slice(0, 5).map(function(v) {
    return [{ text: '✓ ' + v.name + ' returned', callback_data: 'gpret:' + v.id }];
  });

  if (!_alertOn_('AlertUnreturned')) return;
  try { _sendTelegram(msg, _tgButtons_(buttons)); } catch (e) { Logger.log('unreturned alert telegram: ' + e.message); }
}
