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
    return _drivePhotoUrl_(file.getId());
  } catch (e) {
    Logger.log('visitor photo store failed: ' + e.message);
    return '';
  }
}

/**
 * Canonical embeddable URL for a Drive image, given a file id. Uses the
 * `thumbnail` endpoint, which serves the image bytes directly — reliable both
 * in an <img> tag AND as a CSS background-image (the kiosk arrival cards use a
 * background). The older `uc?id=` form 302-redirects to an interstitial that
 * loads in <img> but is flaky as a background, which is why kiosk photos showed
 * only initials. `sz=w400` is ample for the ~96–200px cards.
 */
function _drivePhotoUrl_(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
}

/**
 * Normalises any previously-stored Drive photo URL to the canonical embeddable
 * form, so existing `uc?id=` rows render without a data migration. Non-Drive or
 * empty URLs pass through unchanged.
 */
function _normalizePhotoUrl_(url) {
  if (!url) return '';
  var m = String(url).match(/[?&]id=([^&]+)/);
  if (m && String(url).indexOf('drive.google.com') !== -1) return _drivePhotoUrl_(m[1]);
  return url;
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
    SafetyAckAt:   v.SafetyAckAt || '',  // ISO timestamp of the safety acknowledgement
    // WHICH rule set was agreed to. A timestamp alone cannot say what the
    // visitor signed once the wording is edited.
    SafetyVersion: v.SafetyVersion || '',
    EmergencyName:  v.EmergencyName  || '',
    EmergencyPhone: v.EmergencyPhone || ''
  };
  // Older sheets predate these columns; adding them is idempotent.
  ['SafetyAckAt','SafetyVersion','EmergencyName','EmergencyPhone']
    .forEach(function(c) { _ensureVisitorColumn_(sheet, c); });
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

/**
 * Re-record the safety acknowledgement for an EXISTING visitor.
 *
 * The re-induction path needs to update one row, not create a second visitor
 * for the same person — a duplicate would fork their visit history and leave
 * two passes in circulation.
 *
 * Deliberately writes only the three safety fields: this endpoint is reachable
 * anonymously (vreg has no auth gate), so it must not be able to change a
 * visitor's name, host, phone or blacklist flag.
 */
function recordSafetyAck(visitorId, ackAt, ackVersion) {
  var id = String(visitorId || '').trim();
  if (!id) return { success: false, error: 'Missing visitor id' };
  if (!ackAt) return { success: false, error: 'Missing acknowledgement' };

  var sheet = getSheet(SHEETS.VISITORS);
  var row = findRowByValue(sheet, 'VisitorID', id);
  if (row === -1) return { success: false, error: 'Visitor not found' };

  ['SafetyAckAt','SafetyVersion'].forEach(function(c) { _ensureVisitorColumn_(sheet, c); });
  setCell(sheet, row, 'SafetyAckAt', String(ackAt));
  setCell(sheet, row, 'SafetyVersion', String(ackVersion || ''));
  return { success: true, visitorId: id };
}

/**
 * Is a stored safety acknowledgement still good?
 *
 * Two ways it expires:
 *  - age. An induction is a point-in-time briefing, not a permanent licence.
 *    SafetyInductionDays in Config sets the window (default 7; 0 disables).
 *    SafetyInductionMonths still works for sites that set it, but Days wins.
 *  - version. If the rules have been reworded since, what the visitor agreed
 *    to is not what the site now requires, so they re-read regardless of age.
 */
function _safetyAckValid_(ackAt, ackVersion) {
  if (!ackAt) return false;

  var current = '';
  try { current = String(getConfigValue('SafetyRulesVersion') || '').trim(); } catch (e) {}
  if (current && String(ackVersion || '').trim() !== current) return false;

  // Validity is expressed in DAYS. SafetyInductionDays wins where it is set;
  // SafetyInductionMonths is kept because sites already have it configured,
  // and a month is taken as 30.44 days exactly as before.
  var validDays = 7;
  var haveDays = false;
  try {
    var rawD = getConfigValue('SafetyInductionDays');
    if (rawD !== '' && rawD != null && !isNaN(Number(rawD))) {
      validDays = Number(rawD); haveDays = true;
    }
  } catch (e) {}
  if (!haveDays) {
    try {
      var raw = getConfigValue('SafetyInductionMonths');
      if (raw !== '' && raw != null && !isNaN(Number(raw))) validDays = Number(raw) * 30.44;
    } catch (e) {}
  }
  if (validDays <= 0) return true;   // 0 = never expires, an explicit site choice

  var then = new Date(ackAt);
  if (isNaN(then.getTime())) return false;   // unparseable = treat as unsigned
  var ageDays = (new Date().getTime() - then.getTime()) / 86400000;
  return ageDays <= validDays;
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
  var result;
  try {
    result = _checkoutVisitorLocked_(visitorId);
  } finally {
    lock.releaseLock();
  }
  // Surface any still-out returnable gatepass items so the client can warn the
  // guard before finalising the check-out (warn-and-override, never a block).
  if (result && result.success) {
    try { result.returnableOutstanding = getVisitorReturnablesOutstanding(visitorId); }
    catch (e) { result.returnableOutstanding = 0; }
  }
  return result;
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
    photoUrl:    _normalizePhotoUrl_(rec.PhotoURL || ''),
    // The ID TYPE (e.g. "Aadhaar") is returned, but the ID NUMBER is deliberately
    // withheld: getVisitorDetail is reachable anonymously (the visitors page has
    // no auth gate), so a leaked/replayed pass id must not expose a government ID
    // number.
    idType:      rec.IDType || '',
    visitorType: rec.VisitorType || '',
    safetyAckAt: rec.SafetyAckAt || '',
    // Whether that acknowledgement still counts. Computed HERE, not in the
    // page: the returning-visitor path skips the induction entirely, so if the
    // client decided this a visitor could re-enter years later, against rules
    // that have since changed, having read nothing.
    safetyValid: _safetyAckValid_(rec.SafetyAckAt, rec.SafetyVersion),
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

/**
 * Record a visitor's arrival from the Visitors page.
 *
 * Presence is recorded by the gate alone (d436309 removed the pass's own
 * check-in button, because a pass URL is a bearer link and anyone it was
 * forwarded to could toggle presence from anywhere). That left a gap: a
 * visitor who self-registers at reception has a valid pass, a completed
 * safety induction and no way onto the Active list unless someone scans
 * their QR — so on a day nobody is scanning, they are simply invisible.
 *
 * This closes the gap without reopening the hole. The caller is a staff
 * member already inside the Visitors page, not the holder of a forwarded
 * link, so the person letting the visitor in still owns the decision.
 * It check-INs only: checking out stays with checkoutVisitor(), which also
 * settles gatepass items. Gate is recorded as 'Reception' rather than
 * 'Self Service' so the log says who actually admitted them.
 */
function checkInVisitor(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (e) { return { success: false, error: 'Busy — please try again' }; }

  try {
    var person = _lookupPerson(visitorId);
    if (!person) return { success: false, error: 'Visitor not found' };

    // Already inside is not an error — two people can press this at once, and
    // the honest answer is that the visitor is on site either way. Opening a
    // second IN row would show them checked in twice.
    var logsSheet = getSheet(SHEETS.LOGS);
    if (_findOpenVisitorLogRow(logsSheet, visitorId) !== -1) {
      return { success: true, action: 'NOOP', status: 'IN',
               name: person.name || '', note: 'already checked in' };
    }

    var result = _checkIn(logsSheet, person, 'Reception');
    result.status = 'IN';
    return result;
  } finally {
    lock.releaseLock();
  }
}

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
