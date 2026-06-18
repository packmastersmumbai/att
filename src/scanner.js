// ============================================================
// scanner.gs — Core check-in / check-out logic
// Single scan: automatically detects IN vs OUT
// ============================================================

/**
 * Called by the camera popup via fetch POST.
 * Processes the QR scan and stores the result in ScriptProperties for the scanner page to poll.
 */
function processAndStoreScan(qrCode, gate, sid) {
  return processQRScan(qrCode, gate);
}

/**
 * Scanner page polls this to retrieve the processed result stored by the popup.
 */
function getPendingResult(sid) {
  var key   = 'PRESULT_' + String(sid || '').replace(/[^a-z0-9]/gi, '');
  var props = PropertiesService.getScriptProperties();
  var raw   = props.getProperty(key) || '';
  if (raw) props.deleteProperty(key);
  return { success: true, result: raw ? JSON.parse(raw) : null };
}

/**
 * Main entry point called on every QR scan.
 * @param {string} qrCode  e.g. "EMP-004217" or "VIS-20260326-839201"
 * @param {string} gate    e.g. "Main Gate"
 * @returns {object}       result object sent back to frontend
 */
function processQRScan(qrCode, gate) {
  if (!qrCode) return { success: false, action: 'ERROR', message: 'No QR code received' };
  gate = gate || 'Main Gate';

  // 1. Check blacklist
  var blacklistSheet = getSheet(SHEETS.BLACKLIST);
  var blacklistRow = findRowByValue(blacklistSheet, 'QRCode', qrCode);
  if (blacklistRow !== -1) {
    var blacklistName = getCell(blacklistSheet, blacklistRow, 'PersonName');
    sendBlacklistAlert(qrCode, blacklistName, gate);
    return {
      success: false,
      action: 'BLOCKED',
      message: blacklistName + ' is on the blacklist',
      name: blacklistName,
      gate: gate,
      time: formatTime(new Date())
    };
  }

  // 2. Identify person
  var person = _lookupPerson(qrCode);
  if (!person) {
    return {
      success: false,
      action: 'UNKNOWN',
      message: 'QR code not recognised',
      qrCode: qrCode,
      time: formatTime(new Date())
    };
  }

  // 3. Check for open check-in today
  var logsSheet = getSheet(SHEETS.LOGS);
  var openRow = _findOpenLogRow(logsSheet, person.id, today());

  if (openRow === -1) {
    return _checkIn(logsSheet, person, gate);
  } else {
    return _checkOut(logsSheet, openRow, person, gate);
  }
}

// ── Private helpers ──────────────────────────────────────────

function _lookupPerson(qrCode) {
  // Try Employees
  var empSheet = getSheet(SHEETS.EMPLOYEES);
  var empRow = findRowByValue(empSheet, 'QRCode', qrCode);
  if (empRow !== -1) {
    return {
      id:         getCell(empSheet, empRow, 'EmpID'),
      name:       getCell(empSheet, empRow, 'Name'),
      department: getCell(empSheet, empRow, 'Department'),
      phone:      getCell(empSheet, empRow, 'Phone'),
      photoUrl:   getCell(empSheet, empRow, 'PhotoURL') || '',
      qrImageUrl: getCell(empSheet, empRow, 'QRImageURL') || '',
      type:       'EMP',
      qrCode:     qrCode
    };
  }

  // Try Visitors
  var visSheet = getSheet(SHEETS.VISITORS);
  var visRow = findRowByValue(visSheet, 'VisitorID', qrCode);
  if (visRow !== -1) {
    return {
      id:         getCell(visSheet, visRow, 'VisitorID'),
      name:       getCell(visSheet, visRow, 'Name'),
      department: getCell(visSheet, visRow, 'Company'),
      phone:      getCell(visSheet, visRow, 'Phone'),
      hostId:     getCell(visSheet, visRow, 'HostEmpID'),
      type:       'VIS',
      qrCode:     qrCode
    };
  }

  return null;
}

function _findOpenLogRow(logsSheet, personId, dateStr) {
  var lastRow = logsSheet.getLastRow();
  if (lastRow < 2) return -1;

  var personIdCol = getColIndex(logsSheet, 'PersonID');
  var dateCol     = getColIndex(logsSheet, 'Date');
  var timeOutCol  = getColIndex(logsSheet, 'TimeOUT');

  // One wide read spanning all three needed columns instead of three separate reads
  var minCol = Math.min(personIdCol, dateCol, timeOutCol);
  var maxCol = Math.max(personIdCol, dateCol, timeOutCol);
  var block  = logsSheet.getRange(2, minCol, lastRow - 1, maxCol - minCol + 1).getValues();
  var piOff  = personIdCol - minCol;
  var dtOff  = dateCol     - minCol;
  var toOff  = timeOutCol  - minCol;
  var ids   = block.map(function(r) { return [r[piOff]]; });
  var dates = block.map(function(r) { return [r[dtOff]]; });
  var outs  = block.map(function(r) { return [r[toOff]]; });

  for (var i = 0; i < ids.length; i++) {
    var storedDate = dates[i][0];
    var formattedDate = storedDate instanceof Date ? formatDate(storedDate) : String(storedDate);
    if (String(ids[i][0]) === String(personId) &&
        formattedDate === dateStr &&
        outs[i][0] === '') {
      return i + 2;
    }
  }
  return -1;
}

function _checkIn(logsSheet, person, gate) {
  var now = new Date();
  var logId = generateID('LOG');

  logsSheet.appendRow([
    logId,
    person.qrCode,
    person.id,
    person.type,
    person.name,
    person.department || '',
    formatTime(now),
    '',
    '',
    today(),
    gate,
    'PARTIAL'
  ]);

  if (person.type === 'VIS') {
    var activeSheet = getSheet(SHEETS.ACTIVE_VISITORS);
    activeSheet.appendRow([person.id, person.name, formatTime(now), person.hostId || '', gate]);
    sendVisitorAlert(person);
  }

  return {
    success:    true,
    action:     'CHECK_IN',
    name:       person.name,
    empId:      person.id,
    type:       person.type,
    department: person.department,
    photoUrl:   person.photoUrl || person.qrImageUrl || '',
    time:       formatTime(now),
    gate:       gate,
    logId:      logId
  };
}

function _checkOut(logsSheet, openRow, person, gate) {
  var now = new Date();
  var timeInStr = getCell(logsSheet, openRow, 'TimeIN');
  var timeIn = parseTimeToday(timeInStr);
  var duration = timeIn ? calcDuration(timeIn, now) : '';

  // Resolve column indices once, then batch TimeOUT+Duration (contiguous) in one write
  var timeOutCol  = getColIndex(logsSheet, 'TimeOUT');
  var durationCol = getColIndex(logsSheet, 'Duration');
  var statusCol   = getColIndex(logsSheet, 'Status');
  logsSheet.getRange(openRow, timeOutCol, 1, 2).setValues([[formatTime(now), duration]]);
  logsSheet.getRange(openRow, statusCol).setValue('PRESENT');

  if (person.type === 'VIS') {
    var activeSheet = getSheet(SHEETS.ACTIVE_VISITORS);
    var activeRow = findRowByValue(activeSheet, 'VisitorID', person.id);
    if (activeRow !== -1) activeSheet.deleteRow(activeRow);
  }

  return {
    success:  true,
    action:   'CHECK_OUT',
    name:     person.name,
    empId:    person.id,
    type:     person.type,
    photoUrl: person.photoUrl || person.qrImageUrl || '',
    time:     formatTime(now),
    duration: duration,
    gate:     gate
  };
}

