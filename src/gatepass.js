// ============================================================
// gatepass.gs — Visitor item gatepass (IN/OUT, returnable, host-approved)
// ============================================================
//
// One row per item movement (like Logs/Visitors). A visitor's gatepass is the
// set of rows sharing its VisitorID. Logged by the gate guard from the visitor
// detail modal; the host approves via a Telegram/WhatsApp link (advisory audit
// flag, never a hard block on logging or checkout).

var GATEPASS_HEADERS = ['GatepassID','VisitorID','Direction','MaterialCode','ItemDesc',
  'Unit','Qty','Returnable','Status','PhotoURL','HostEmpID','HostApproved',
  'LoggedBy','LoggedAt','SettledAt','Note'];

/** Creates the Gatepass sheet with headers if it does not exist. Idempotent. */
function _ensureGatepassSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.GATEPASS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.GATEPASS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, GATEPASS_HEADERS.length).setValues([GATEPASS_HEADERS])
      .setFontWeight('bold').setBackground('#F0F0F0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Initial status: an inbound returnable item is owed back (OUT_PENDING); an
// outbound item, or any non-returnable, has simply LEFT at creation.
function _gatepassStatusFor_(direction, returnable) {
  return (direction === 'IN' && returnable === 'YES') ? 'OUT_PENDING' : 'LEFT';
}

/** All gatepass items for a visitor + a count of still-out returnables. */
function getGatepass(visitorId) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var rows = getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return String(r.VisitorID) === String(visitorId);
  });
  var items = rows.map(function(r) {
    return {
      gatepassId:   r.GatepassID,
      direction:    r.Direction,
      materialCode: r.MaterialCode || '',
      itemDesc:     r.ItemDesc || '',
      unit:         r.Unit || '',
      qty:          Number(r.Qty) || 0,
      returnable:   String(r.Returnable).toUpperCase() === 'YES',
      status:       r.Status || '',
      photoUrl:     _normalizePhotoUrl_(r.PhotoURL || ''),
      hostApproved: String(r.HostApproved).toUpperCase() === 'YES'
    };
  });
  var outstanding = items.filter(function(i) { return i.status === 'OUT_PENDING'; }).length;
  return { success: true, items: items, returnableOutstanding: outstanding };
}

/** Count of still-out returnable items for a visitor (pure query). */
function getVisitorReturnablesOutstanding(visitorId) {
  return getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return String(r.VisitorID) === String(visitorId) && r.Status === 'OUT_PENDING';
  }).length;
}

/**
 * Log one item movement for a visitor. item = {direction, materialCode,
 * itemDesc, unit, qty, returnable, photoData}. Photo is best-effort. Does not
 * notify — that is an explicit guard action (notifyHostForApproval).
 */
function addGatepassItem(visitorId, item) {
  if (!visitorId || !item) return { success: false, error: 'Missing data' };
  if (!item.itemDesc && !item.materialCode) return { success: false, error: 'Item description required' };
  _ensureGatepassSheet_();

  var direction  = item.direction === 'OUT' ? 'OUT' : 'IN';
  var returnable = item.returnable ? 'YES' : 'NO';
  var gatepassId = 'GP-' + today().replace(/-/g, '') + '-' +
                   Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();

  var photoUrl = '';
  if (item.photoData) {
    try { photoUrl = _storeVisitorPhoto_(gatepassId, item.photoData); }
    catch (e) { Logger.log('gatepass photo store failed: ' + e.message); }
  }

  var visSheet = getSheet(SHEETS.VISITORS);
  var vRow = findRowByValue(visSheet, 'VisitorID', visitorId);
  var hostEmpId = vRow === -1 ? '' : (getCell(visSheet, vRow, 'HostEmpID') || '');

  var sheet = getSheet(SHEETS.GATEPASS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = {
    GatepassID: gatepassId, VisitorID: visitorId, Direction: direction,
    MaterialCode: item.materialCode || '', ItemDesc: item.itemDesc || '',
    Unit: item.unit || '', Qty: Number(item.qty) || 1, Returnable: returnable,
    Status: _gatepassStatusFor_(direction, returnable), PhotoURL: photoUrl,
    HostEmpID: hostEmpId, HostApproved: 'NO', LoggedBy: 'gate',
    LoggedAt: new Date().toISOString(), SettledAt: '', Note: ''
  };
  sheet.appendRow(headers.map(function(h) { return values[h] !== undefined ? values[h] : ''; }));
  return { success: true, gatepassId: gatepassId };
}

/** Reconcile a returnable item: OUT_PENDING → RETURNED. */
function markItemReturned(gatepassId) {
  var sheet = getSheet(SHEETS.GATEPASS);
  var row = findRowByValue(sheet, 'GatepassID', gatepassId);
  if (row === -1) return { success: false, error: 'Not found' };
  setCell(sheet, row, 'Status', 'RETURNED');
  setCell(sheet, row, 'SettledAt', new Date().toISOString());
  return { success: true };
}

/** Void a mistaken entry. */
function voidGatepassItem(gatepassId, reason) {
  var sheet = getSheet(SHEETS.GATEPASS);
  var row = findRowByValue(sheet, 'GatepassID', gatepassId);
  if (row === -1) return { success: false, error: 'Not found' };
  setCell(sheet, row, 'Status', 'VOID');
  setCell(sheet, row, 'SettledAt', new Date().toISOString());
  if (reason) setCell(sheet, row, 'Note', String(reason));
  return { success: true };
}

// ── Host approval ──────────────────────────────────────────────────────────
// The host approves via a link (they are not app users). The link carries a
// per-visitor token, cache-stored with TTL, so it cannot be forged or replayed
// — same mechanism as the admin bearer token (adminAuth.js).

var GP_TOKEN_PREFIX = 'GPTOK_';
var GP_TOKEN_TTL = 21600; // 6h

/** Mechanism: mint an approval token for this visitor's gatepass. */
function _issueGatepassToken_(visitorId) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(GP_TOKEN_PREFIX + visitorId + '_' + token, '1', GP_TOKEN_TTL);
  return token;
}

/** Mechanism: is this token valid for this visitor? Boolean, never throws. */
function _isGatepassToken_(visitorId, token) {
  if (!visitorId || !token) return false;
  var key = GP_TOKEN_PREFIX + visitorId + '_' + String(token).replace(/[^a-z0-9-]/gi, '');
  return CacheService.getScriptCache().get(key) === '1';
}

/** Host approves: flag this visitor's non-void gatepass rows as HostApproved. */
function approveGatepass(visitorId, token) {
  if (!_isGatepassToken_(visitorId, token)) return { success: false, error: 'Invalid or expired approval link' };
  var sheet = getSheet(SHEETS.GATEPASS);
  var data = getSheetAsObjects(SHEETS.GATEPASS);
  var approved = 0;
  data.forEach(function(r) {
    if (String(r.VisitorID) === String(visitorId) && r.Status !== 'VOID' &&
        String(r.HostApproved).toUpperCase() !== 'YES') {
      var row = findRowByValue(sheet, 'GatepassID', r.GatepassID);
      if (row !== -1) { setCell(sheet, row, 'HostApproved', 'YES'); approved++; }
    }
  });
  return { success: true, approved: approved };
}

/**
 * Notify the host (WhatsApp — host is a pre-authorized number) with the item
 * list and a one-tap approve link. Explicit guard action, fired once when the
 * item list is complete (not per item). Best-effort: never throws.
 */
function notifyHostForApproval(visitorId) {
  try {
    var gp = getGatepass(visitorId);
    if (!gp.success || !gp.items.length) return { success: false, error: 'No items to approve' };

    var visSheet = getSheet(SHEETS.VISITORS);
    var vRow = findRowByValue(visSheet, 'VisitorID', visitorId);
    if (vRow === -1) return { success: false, error: 'Visitor not found' };
    var visitorName = getCell(visSheet, vRow, 'Name') || visitorId;
    var hostEmpId   = getCell(visSheet, vRow, 'HostEmpID') || '';

    var token = _issueGatepassToken_(visitorId);
    var link  = publicBaseUrl() + '?page=gatepass_approve&id=' + encodeURIComponent(visitorId) +
                '&t=' + encodeURIComponent(token);

    var lines = gp.items.filter(function(i) { return i.status !== 'VOID'; }).map(function(i) {
      return '• ' + i.direction + ' ' + i.qty + '× ' + i.itemDesc + (i.returnable ? ' (returnable)' : '');
    }).join('\n');
    var msg = 'Gatepass approval for visitor *' + visitorName + '*:\n' + lines + '\n\nApprove: ' + link;

    if (hostEmpId) {
      var empSheet = getSheet(SHEETS.EMPLOYEES);
      var hr = findRowByValue(empSheet, 'EmpID', hostEmpId);
      var hostPhone = hr === -1 ? '' : getCell(empSheet, hr, 'Phone');
      if (hostPhone) { try { _sendWhatsApp(hostPhone, msg); } catch (e) { Logger.log('gp host wa: ' + e.message); } }
    }
    return { success: true };
  } catch (e) {
    Logger.log('notifyHostForApproval failed: ' + e.message);
    return { success: false, error: e.message };
  }
}
