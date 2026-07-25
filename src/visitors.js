// ============================================================
// visitors.gs — Visitor registration, checkout, blacklist
// ============================================================

/**
 * Uploads a captured visitor photo (base64 data URL) to a public Drive folder
 * and returns a viewable image URL — mirrors generateAndStoreQR in qr.js. Only
 * a URL is stored in the sheet; the image itself lives in Drive (no bloat).
 * Best-effort: returns '' on any failure so registration is never blocked.
 */
function _storeVisitorPhoto_(visitorId, dataUrl) {
  try {
    if (!dataUrl || String(dataUrl).indexOf('data:image') !== 0) return '';
    var blob = _dataUrlToBlob_(dataUrl, visitorId);   // defined in notifications.js
    if (!blob) return '';
    blob.setName(visitorId + '.jpg');
    var folders = DriveApp.getFoldersByName('VisitorPhotos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('VisitorPhotos');
    var existing = folder.getFilesByName(visitorId + '.jpg');
    while (existing.hasNext()) existing.next().setTrashed(true);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?id=' + file.getId();
  } catch (e) {
    Logger.log('visitor photo store failed: ' + e.message);
    return '';
  }
}

/** Writes a visitor's PhotoURL cell by VisitorID. Best-effort. */
function _setVisitorPhotoUrl_(visitorId, url) {
  if (!url) return;
  try {
    var sheet = getSheet(SHEETS.VISITORS);
    var row = findRowByValue(sheet, 'VisitorID', visitorId);
    if (row !== -1) setCell(sheet, row, 'PhotoURL', url);
  } catch (e) {
    Logger.log('visitor photo url write failed: ' + e.message);
  }
}

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

  // Persist the captured photo to Drive and post the pass to Telegram — both
  // deliberately OUTSIDE the lock (Drive upload + network send take seconds;
  // holding the script lock across them would stall every gate scan). Both are
  // best-effort: a failure must never fail the registration. A returning
  // visitor already has a record, so skip.
  if (result.success && !result.returning) {
    var photoData = v.PhotoData || '';
    if (photoData) {
      var photoUrl = _storeVisitorPhoto_(result.visitorId, photoData);
      _setVisitorPhotoUrl_(result.visitorId, photoUrl);
    }
    try {
      sendVisitorPassToChannel(result.visitorId, photoData);
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
  // Any-date open row — a visitor stuck open from a previous day must still be
  // closeable, otherwise they can never check out and stay "in" forever.
  var openRow = _findOpenVisitorLogRow(logsSheet, visitorId);

  if (openRow !== -1) {
    return _checkOut(logsSheet, openRow, person, 'Manual Checkout');
  }

  // Genuinely already checked out (no open row anywhere).
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
  // Any-date open row: a visitor who checked in yesterday and never checked out
  // is still "IN" today. Date-scoping this to today() made them read as OUT and
  // let them accumulate duplicate open rows.
  var openRow = _findOpenVisitorLogRow(logsSheet, visitorId);

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
 * Full profile + complete visit log for one visitor, for the History detail
 * popup. Returns the whole Visitors record (name, mobile, company, host,
 * purpose, vehicle, ID, safety-ack) with the host id resolved to a name, plus
 * every Logs row for that visitor across all dates (newest first).
 */
function getVisitorDetail(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var sheet = getSheet(SHEETS.VISITORS);
  var row = findRowByValue(sheet, 'VisitorID', visitorId);
  if (row === -1) return { success: false, error: 'Visitor not found' };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var vals    = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var rec = {};
  headers.forEach(function(h, i) { rec[h] = vals[i]; });

  var hostName = '';
  if (rec.HostEmpID) {
    var empRow = findRowByValue(getSheet(SHEETS.EMPLOYEES), 'EmpID', rec.HostEmpID);
    if (empRow !== -1) hostName = getCell(getSheet(SHEETS.EMPLOYEES), empRow, 'Name');
  }

  var visits = getSheetAsObjects(SHEETS.LOGS).filter(function(r) {
    return r.Type === 'VIS' && String(r.PersonID) === String(visitorId);
  }).map(function(r) {
    return { date: String(r.Date), timeIn: r.TimeIN || '', timeOut: r.TimeOUT || '',
             duration: r.Duration || '', gate: r.Gate || '', status: r.Status || '' };
  }).reverse(); // newest first

  var openRow = _findOpenVisitorLogRow(getSheet(SHEETS.LOGS), visitorId);

  return {
    success:     true,
    visitorId:   visitorId,
    name:        rec.Name || '',
    phone:       rec.Phone != null ? String(rec.Phone) : '',
    company:     rec.Company || '',
    hostEmpId:   rec.HostEmpID || '',
    hostName:    hostName || rec.HostEmpID || '',
    purpose:     rec.Purpose || '',
    vehicle:     rec.Vehicle || '',
    photoUrl:    rec.PhotoURL || '',
    // The ID TYPE (e.g. "Aadhaar") is shown, but the ID NUMBER is deliberately
    // withheld from this endpoint. getVisitorDetail is reachable anonymously
    // (the visitors page has no auth gate yet), so a leaked/replayed pass id
    // must not expose a government ID number. Restore idNumber once the page is
    // behind an admin token. See the deferred auth-gate task.
    idType:      rec.IDType || '',
    visitorType: rec.VisitorType || '',
    safetyAckAt: rec.SafetyAckAt || '',
    blacklisted: String(rec.BlacklistFlag || '').toUpperCase() === 'YES',
    status:      openRow === -1 ? 'OUT' : 'IN',
    visits:      visits,
    visitCount:  visits.length
  };
}

/**
 * Self check-in / check-out toggle from the visitor pass link.
 * Open row (any date) → check OUT; no open row → check IN.
 *
 * Uses the visitor-aware open-row finder (not processQRScan's today()-scoped
 * one) so a visitor left open from a previous day checks OUT instead of being
 * checked in a second time. A short in-flight guard collapses an accidental
 * fast double-tap; a genuine later toggle is always honoured.
 */
var SELF_CHECK_INFLIGHT_SEC = 5; // collapse only a rapid accidental re-tap

function selfCheckVisitor(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (e) { return { success: false, error: 'Busy — please try again' }; }

  try {
    var vSheet = getSheet(SHEETS.VISITORS);
    if (findRowByValue(vSheet, 'VisitorID', visitorId) === -1) {
      return { success: false, error: 'Visitor not found' };
    }

    // Collapse an accidental fast double-tap (page double-fire / retry). A
    // deliberate toggle seconds later is fine; a real visit lasts minutes.
    var cache = CacheService.getScriptCache();
    var key = 'SELFCHK_' + String(visitorId).replace(/[^a-z0-9]/gi, '');
    if (cache.get(key)) {
      var cur = getVisitorPass(visitorId);
      return { success: true, action: 'NOOP', name: cur.name || '',
               status: cur.status, note: 'just recorded — please wait a moment' };
    }
    cache.put(key, '1', SELF_CHECK_INFLIGHT_SEC);

    var person = _lookupPerson(visitorId);
    if (!person) return { success: false, error: 'Visitor not found' };

    var logsSheet = getSheet(SHEETS.LOGS);
    var openRow = _findOpenVisitorLogRow(logsSheet, visitorId);
    var result = openRow === -1
      ? _checkIn(logsSheet, person, 'Self Service')
      : _checkOut(logsSheet, openRow, person, 'Self Service');

    result.status = openRow === -1 ? 'IN' : 'OUT'; // post-toggle status
    return result;
  } finally {
    lock.releaseLock();
  }
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
