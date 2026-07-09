// ============================================================
// visitors.gs — Visitor registration, checkout, blacklist
// ============================================================

function registerVisitor(v) {
  if (!v.Name || !v.Phone) return { success: false, error: 'Name and Phone are required' };

  // "Does this phone exist? If not, append" is a read-check-write. Two
  // concurrent registrations from the same phone would both miss and create
  // duplicate visitor records with different permanent QR codes.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: 'Registration busy — please try again' };
  }

  var result;
  try {
    result = _registerVisitorLocked_(v);
  } finally {
    lock.releaseLock();
  }

  // Post the pass (QR + details + check-in link, plus the captured photo if any)
  // to the Telegram channel. Deliberately outside the lock: this uploads a photo
  // over the network and can take seconds — holding the script lock across it
  // would stall every gate scan. Best-effort; a failure must not fail the
  // registration, and a returning visitor already has a pass.
  if (result.success && !result.returning) {
    try {
      sendVisitorPassToChannel(result.visitorId, v.PhotoData || '');
    } catch (e) {
      Logger.log('visitor pass Telegram failed: ' + e.message);
    }
  }
  return result;
}

function _registerVisitorLocked_(v) {
  var sheet = getSheet(SHEETS.VISITORS);
  _ensureVisitorColumns_(sheet);

  // Returning visitor: if this phone already exists, reuse the existing record
  // and its permanent QR — drivers/couriers/regulars register once and scan the
  // SAME pass every day (the kiosk toggle is date-scoped, so it just works).
  var existingId = _findVisitorByPhone_(sheet, v.Phone);
  if (existingId) {
    return { success: true, visitorId: existingId, qrCode: existingId,
             qrUrl: generateQR(existingId, 300), returning: true };
  }

  // The VisitorID is the only secret protecting the public ?page=vpass&id=…
  // pass, which exposes the visitor's name, company and host. A 6-digit random
  // suffix was ~900k guesses per day — enumerable. Use 15 hex chars (~2^60)
  // taken from a UUID so a pass cannot be found by brute force.
  var visitorId = 'VIS-' + today().replace(/-/g, '') + '-' +
                  Utilities.getUuid().replace(/-/g, '').slice(0, 15).toUpperCase();
  var qrUrl = generateQR(visitorId, 300);

  // Write by header name so it is safe regardless of column order / new columns
  var values = {
    VisitorID:     visitorId,
    Name:          v.Name,
    VisitorType:   v.VisitorType || 'Guest',
    Company:       v.Company    || '',
    Phone:         v.Phone,
    HostEmpID:     v.HostEmpID  || '',
    Purpose:       v.Purpose    || '',
    ExpectedOut:   v.ExpectedOut || '',
    BlacklistFlag: 'NO',
    IDType:        v.IDType     || '',
    IDNumber:      v.IDNumber   || '',
    Vehicle:       v.Vehicle    || '',
    PhotoURL:      v.PhotoURL   || '',
    SafetyAckAt:   v.SafetyAckAt || ''   // ISO timestamp of the safety-video acknowledgement
  };
  _ensureVisitorColumn_(sheet, 'SafetyAckAt');   // older sheets predate this column
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return values[h] !== undefined ? values[h] : ''; });
  sheet.appendRow(row);

  // The Telegram pass is sent by the caller, after the lock is released.
  return { success: true, visitorId: visitorId, qrCode: visitorId, qrUrl: qrUrl };
}

/** Appends `name` as a header column if the sheet doesn't already have it. Idempotent. */
function _ensureVisitorColumn_(sheet, name) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(name) !== -1) return;
  sheet.getRange(1, lastCol + 1).setValue(name).setFontWeight('bold').setBackground('#F0F0F0');
}

/**
 * Fast path for frequent visitors: find an existing pass by phone so they can
 * check in without re-filling the form. Returns the same shape as getVisitorPass.
 */
function lookupVisitorByPhone(phone) {
  var target = _normPhone_(phone);
  if (target.length < 4) return { success: false, error: 'Enter at least 4 digits of the mobile number' };

  var sheet = getSheet(SHEETS.VISITORS);
  var matches = _findVisitorMatches_(sheet, target);
  if (!matches.length) return { success: false, error: 'No visitor found for this number. Please register.' };
  if (matches.length > 1) return { success: false, error: matches.length + ' visitors match — enter more digits.' };
  return getVisitorPass(matches[0]);
}

/** Strips a phone to bare digits (no length coercion). */
function _normPhone_(p) {
  return String(p || '').replace(/\D/g, '');
}

/**
 * Returns VisitorIDs whose stored phone digit-string contains the typed digits
 * (or vice-versa) — a partial "contains" match that works for short numbers.
 */
function _findVisitorMatches_(sheet, targetDigits) {
  var out = [];
  if (!targetDigits || targetDigits.length < 4) return out;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var phoneCol = headers.indexOf('Phone');
  var idCol    = headers.indexOf('VisitorID');
  if (phoneCol === -1 || idCol === -1) return out;
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var stored = _normPhone_(data[i][phoneCol]);
    if (!stored) continue;
    if (stored.indexOf(targetDigits) !== -1 || targetDigits.indexOf(stored) !== -1) {
      out.push(String(data[i][idCol]));
    }
  }
  return out;
}

/**
 * Dedup on registration: exact digit match only (partial matches must NOT merge
 * two different people at registration). Returns the existing VisitorID or ''.
 */
function _findVisitorByPhone_(sheet, phone) {
  var target = _normPhone_(phone);
  if (target.length < 4) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var phoneCol = headers.indexOf('Phone');
  var idCol    = headers.indexOf('VisitorID');
  if (phoneCol === -1 || idCol === -1) return '';
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (_normPhone_(data[i][phoneCol]) === target) return String(data[i][idCol]);
  }
  return '';
}

/** Appends any missing visitor columns (idempotent) so older sheets pick up new fields. */
function _ensureVisitorColumns_(sheet) {
  var needed = ['VisitorID','Name','VisitorType','Company','Phone','HostEmpID','Purpose','ExpectedOut','BlacklistFlag','IDType','IDNumber','Vehicle','PhotoURL'];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  needed.forEach(function(h) {
    if (headers.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#F0F0F0');
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
  });
}

/**
 * Explicit checkout from the Active-tab button. Unlike a kiosk scan this must
 * NEVER toggle back to check-in — it force-closes the open log row and always
 * clears the ActiveVisitors sheet, even if the two had drifted out of sync.
 */
function checkoutVisitor(visitorId) {
  // Same read-check-write on Logs as processQRScan — must not interleave with a
  // concurrent gate scan or the nightly autoCheckoutAll sweep.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: 'Busy — please try again' };
  }
  try {
    return _checkoutVisitorLocked_(visitorId);
  } finally {
    lock.releaseLock();
  }
}

function _checkoutVisitorLocked_(visitorId) {
  var person = _lookupPerson(visitorId);
  if (!person) return { success: false, error: 'Visitor not found' };

  var logsSheet = getSheet(SHEETS.LOGS);
  var openRow = _findOpenLogRow(logsSheet, visitorId, today());

  if (openRow !== -1) {
    // Normal case: close the open row (stamps TimeOUT + clears ActiveVisitors).
    return _checkOut(logsSheet, openRow, person, 'Manual Checkout');
  }

  // Drift case: no open log row, but the Active tab still listed them. Clear the
  // stale ActiveVisitors entry so the dashboard/present list stops showing them.
  var activeSheet = getSheet(SHEETS.ACTIVE_VISITORS);
  var activeRow = findRowByValue(activeSheet, 'VisitorID', visitorId);
  if (activeRow !== -1) activeSheet.deleteRow(activeRow);

  invalidateDashboardCache();
  return { success: true, action: 'CHECK_OUT', name: person.name, empId: visitorId,
           type: 'VIS', time: formatTime(new Date()), note: 'already checked out' };
}

/**
 * Returns the visitor record + current IN/OUT status for the self-service pass page.
 */
function getVisitorPass(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var sheet = getSheet(SHEETS.VISITORS);
  var row = findRowByValue(sheet, 'VisitorID', visitorId);
  if (row === -1) return { success: false, error: 'Visitor not found' };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var vals    = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var rec = {};
  headers.forEach(function(h, i) { rec[h] = vals[i]; });

  var logsSheet = getSheet(SHEETS.LOGS);
  var openRow = _findOpenLogRow(logsSheet, visitorId, today());

  return {
    success:    true,
    visitorId:  visitorId,
    name:       rec.Name || '',
    company:    rec.Company || '',
    purpose:    rec.Purpose || '',
    qrUrl:      generateQR(visitorId, 300),
    status:     openRow === -1 ? 'OUT' : 'IN',  // IN = currently checked in
    blacklisted: String(rec.BlacklistFlag || '').toUpperCase() === 'YES'
  };
}

/**
 * Self check-in / check-out toggle from the visitor pass link.
 * First tap = check IN, next = check OUT (same logic as a kiosk scan).
 */
function selfCheckVisitor(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var sheet = getSheet(SHEETS.VISITORS);
  if (findRowByValue(sheet, 'VisitorID', visitorId) === -1) {
    return { success: false, error: 'Visitor not found' };
  }
  var result = processQRScan(visitorId, 'Self Service');
  var pass = getVisitorPass(visitorId);
  result.status = pass.status;     // post-toggle status
  return result;
}

function addToBlacklist(entry, token) {
  _requireAdmin_(token);
  if (!entry.QRCode) return { success: false, error: 'QRCode required' };
  var sheet = getSheet(SHEETS.BLACKLIST);
  if (findRowByValue(sheet, 'QRCode', entry.QRCode) !== -1) {
    return { success: false, error: 'Already on blacklist' };
  }
  sheet.appendRow([entry.QRCode, entry.PersonName || '', entry.Reason || '', today(), entry.AddedBy || 'Admin']);
  return { success: true };
}

function removeFromBlacklist(qrCode, token) {
  _requireAdmin_(token);
  var sheet = getSheet(SHEETS.BLACKLIST);
  var row = findRowByValue(sheet, 'QRCode', qrCode);
  if (row === -1) return { success: false, error: 'Not found on blacklist' };
  sheet.deleteRow(row);
  return { success: true };
}

function getBlacklist() {
  return { success: true, data: getSheetAsObjects(SHEETS.BLACKLIST) };
}
