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
  var nowMs = Date.now();
  var items = rows.map(function(r) {
    // daysOut separates "declared this visit" from a stale row carried over
    // from an earlier one — a returning visitor keeps the same VisitorID, so
    // without an age the two are indistinguishable in the UI.
    var logged = r.LoggedAt ? new Date(r.LoggedAt) : null;
    var days = (logged && !isNaN(logged)) ? Math.floor((nowMs - logged.getTime()) / 86400000) : '';
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
      hostApproved: String(r.HostApproved).toUpperCase() === 'YES',
      loggedAt:     r.LoggedAt || '',
      daysOut:      days
    };
  });
  var outstanding = items.filter(function(i) { return i.status === 'OUT_PENDING'; }).length;
  // Stale = outstanding from a previous day, i.e. carried over from an earlier
  // visit rather than declared on this one.
  var stale = items.filter(function(i) {
    return i.status === 'OUT_PENDING' && i.daysOut !== '' && i.daysOut >= 1;
  }).length;
  return { success: true, items: items, returnableOutstanding: outstanding, staleOutstanding: stale };
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

  // Did this visitor already have items? Decides whether this add is the one
  // that triggers the host notification (see below).
  var wasExisting = getSheetAsObjects(SHEETS.GATEPASS).some(function(r) {
    return String(r.VisitorID) === String(visitorId) && r.Status !== 'VOID';
  });

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

  // Notify the host automatically on the FIRST item of a visitor's gatepass.
  // The old design required the guard to press "Notify host" — an unprompted
  // button nobody pressed, which left HostApproved permanently 'NO'. Firing on
  // the first item only (not every item) keeps it to one message per gatepass
  // while the guard is still adding to the list; the guard can re-send later
  // from the card once the list is complete. Best-effort: a notification
  // failure must never fail the logging of the item itself.
  var notified = false;
  if (!wasExisting) {
    try { notified = !!(notifyHostForApproval(visitorId) || {}).success; }
    catch (e) { Logger.log('gatepass auto-notify failed: ' + e.message); }
  }
  return { success: true, gatepassId: gatepassId, hostNotified: notified };
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

/**
 * Settle every still-out item for a visitor in one action.
 *
 * A returning visitor keeps one VisitorID for life and gatepass rows are keyed
 * on that id alone, so anything never marked returned follows them into every
 * future visit — three or four stale OUT_PENDING rows accumulate and the
 * check-out warning cries wolf on every arrival until someone clears them.
 * Clearing them one by one was the only option; this does the lot.
 *
 * mode 'RETURNED' = the items genuinely came back (the honest default).
 * mode 'VOID'     = the rows were wrong and should never have been raised.
 * Both write SettledAt, so the item leaves the outstanding register either way.
 */
function settleVisitorGatepass(visitorId, mode, reason) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  var status = mode === 'VOID' ? 'VOID' : 'RETURNED';
  var sheet = getSheet(SHEETS.GATEPASS);
  var rows = getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return String(r.VisitorID) === String(visitorId) && r.Status === 'OUT_PENDING';
  });
  var now = new Date().toISOString();
  var settled = 0;
  rows.forEach(function(r) {
    var row = findRowByValue(sheet, 'GatepassID', r.GatepassID);
    if (row === -1) return;
    setCell(sheet, row, 'Status', status);
    setCell(sheet, row, 'SettledAt', now);
    if (reason) setCell(sheet, row, 'Note', String(reason));
    settled++;
  });
  return { success: true, settled: settled, status: status };
}

/**
 * Settle a visitor's outstanding items as part of checking them out.
 *
 * The old flow checked the visitor out and THEN warned that items were still
 * out. The visitor was already gone, nothing was recorded, and the rows stayed
 * OUT_PENDING forever — so a laptop that genuinely came back haunted the
 * visitor's next ten visits, and one that genuinely walked out left no trace
 * that anyone noticed. Same non-decision, both failure modes.
 *
 * decisions = [{gatepassId, decision:'RETURNED'|'KEPT', reason}]
 *   RETURNED — came back. Row closes (Status RETURNED, SettledAt set).
 *   KEPT     — left with the visitor, deliberately. Row STAYS OUT_PENDING so
 *              it keeps showing in the outstanding register for chasing, but
 *              gains a reason + timestamp so it reads as an accepted decision
 *              rather than an oversight.
 *
 * Returns the kept items so the caller can notify the host — someone walking
 * out with company property on purpose is exactly what the host must hear.
 */
function settleGatepassAtCheckout(visitorId, decisions) {
  if (!visitorId) return { success: false, error: 'Missing visitor id' };
  if (!decisions || !decisions.length) return { success: true, returned: 0, kept: [] };

  var sheet = getSheet(SHEETS.GATEPASS);
  var now = new Date().toISOString();
  var returned = 0, kept = [];

  decisions.forEach(function(d) {
    var row = findRowByValue(sheet, 'GatepassID', d.gatepassId);
    if (row === -1) return;
    // Only ever settle a row that is actually outstanding — a replayed or
    // stale client payload must not reopen or overwrite a closed row.
    if (getCell(sheet, row, 'Status') !== 'OUT_PENDING') return;

    if (d.decision === 'KEPT') {
      // Status deliberately unchanged: still owed back.
      setCell(sheet, row, 'Note', 'Kept at check-out: ' + (d.reason || 'no reason given') + ' (' + now + ')');
      kept.push({
        gatepassId: d.gatepassId,
        itemDesc:   getCell(sheet, row, 'ItemDesc') || '',
        qty:        Number(getCell(sheet, row, 'Qty')) || 1,
        reason:     d.reason || ''
      });
    } else {
      setCell(sheet, row, 'Status', 'RETURNED');
      setCell(sheet, row, 'SettledAt', now);
      returned++;
    }
  });

  return { success: true, returned: returned, kept: kept };
}

/**
 * Tell the host their visitor left holding items. Best-effort: a notification
 * failure must never fail the check-out that triggered it.
 */
function notifyHostItemsKept(visitorId, kept) {
  try {
    if (!kept || !kept.length) return { success: false, error: 'Nothing kept' };

    var visSheet = getSheet(SHEETS.VISITORS);
    var vRow = findRowByValue(visSheet, 'VisitorID', visitorId);
    if (vRow === -1) return { success: false, error: 'Visitor not found' };
    var visitorName = getCell(visSheet, vRow, 'Name') || visitorId;
    var hostEmpId   = getCell(visSheet, vRow, 'HostEmpID') || '';

    var hostName = '', hostPhone = '';
    if (hostEmpId) {
      var empSheet = getSheet(SHEETS.EMPLOYEES);
      var hr = findRowByValue(empSheet, 'EmpID', hostEmpId);
      if (hr !== -1) {
        hostName  = getCell(empSheet, hr, 'Name') || '';
        hostPhone = getCell(empSheet, hr, 'Phone') || '';
      }
    }

    var lines = kept.map(function(k) {
      return '• <b>' + _tgEsc_(k.itemDesc) + '</b> ×' + k.qty +
             (k.reason ? ' — <i>' + _tgEsc_(k.reason) + '</i>' : '');
    }).join('\n');

    var tgMsg = _tgCard_({
      icon: '📤', title: 'Visitor left with items',
      subtitle: visitorName,
      rows: [['Host', hostName]],
      body: lines, raw: true,
      footer: '<i>These remain outstanding in the gatepass register.</i>'
    });

    var sent = false;
    // One tap to close them out if they do come back later.
    var btns = _tgButtons_([[{ text: '✓ Mark returned', callback_data: 'gpret:' + visitorId }]]);
    try { if (_alertOn_('AlertItemsKept') && _sendTelegram(tgMsg, btns)) sent = true; } catch (e) { Logger.log('kept telegram: ' + e.message); }
    if (hostPhone) {
      var waMsg = 'Visitor *' + visitorName + '* left holding:\n' + lines + '\n\nStill outstanding in the gatepass register.';
      try { if (_sendWhatsApp(hostPhone, waMsg)) sent = true; } catch (e) { Logger.log('kept wa: ' + e.message); }
    }
    return { success: sent };
  } catch (e) {
    Logger.log('notifyHostItemsKept failed: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ── Host approval ──────────────────────────────────────────────────────────
// The host approves via a link (they are not app users). The link carries a
// per-visitor token, cache-stored with TTL, so it cannot be forged or replayed
// — same mechanism as the admin bearer token (adminAuth.js).

var GP_TOKEN_PREFIX = 'GPTOK_';
// 48h, not 6h: a host notified late in the shift routinely approves the next
// morning. A 6h link was expired by then, and an expired approval link is
// indistinguishable from a broken feature to the host.
var GP_TOKEN_TTL = 172800; // 48h

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

    var hostName = '';
    if (hostEmpId) {
      var empSheet = getSheet(SHEETS.EMPLOYEES);
      var hr = findRowByValue(empSheet, 'EmpID', hostEmpId);
      if (hr !== -1) hostName = getCell(empSheet, hr, 'Name') || '';
      var hostPhone = hr === -1 ? '' : getCell(empSheet, hr, 'Phone');
    }

    var lines = gp.items.filter(function(i) { return i.status !== 'VOID'; }).map(function(i) {
      return '• ' + i.direction + ' ' + i.qty + '× ' + i.itemDesc + (i.returnable ? ' (returnable)' : '');
    }).join('\n');

    // Primary channel: Telegram (HTML), which the app already uses for passes.
    // Secondary: WhatsApp to the host via CallMeBot (only if that key is set).
    var tgMsg = _tgCard_({
      icon: '📦', title: 'Gatepass approval needed',
      subtitle: visitorName,
      rows: [['Host', hostName]],
      body: lines
    });

    var sent = false;
    // A real button beats a bare link — the host taps once, in the chat.
    var btns = _tgButtons_([[{ text: '✅ Approve gatepass', url: link }]]);
    try { if (_alertOn_('AlertGatepassApproval') && _sendTelegram(tgMsg, btns)) sent = true; } catch (e) { Logger.log('gp telegram: ' + e.message); }

    if (typeof hostPhone !== 'undefined' && hostPhone) {
      var waMsg = 'Gatepass approval for visitor *' + visitorName + '*:\n' + lines + '\n\nApprove: ' + link;
      try { if (_sendWhatsApp(hostPhone, waMsg)) sent = true; } catch (e) { Logger.log('gp host wa: ' + e.message); }
    }

    if (!sent) return { success: false, error: 'No notification channel is configured (set Telegram or CallMeBot in Config).' };
    return { success: true };
  } catch (e) {
    Logger.log('notifyHostForApproval failed: ' + e.message);
    return { success: false, error: e.message };
  }
}


// ── Outstanding returnables register ───────────────────────────────────────
// The gatepass was write-only: rows went into the sheet and were readable only
// by re-opening one visitor's detail modal. Nobody could answer "what is still
// out?", which is the entire purpose of a returnable register. This is the
// read side, consumed by the Reports → Gatepass tab and the dashboard tile.

/**
 * Every item still OUT_PENDING, across all visitors, newest first.
 * Joins the visitor + host name so the caller needs no second lookup.
 */
function getOutstandingGatepass() {
  var rows = getSheetAsObjects(SHEETS.GATEPASS).filter(function(r) {
    return r.Status === 'OUT_PENDING';
  });
  if (!rows.length) return { success: true, items: [], count: 0 };

  // Build id→name maps once rather than a findRowByValue per row (that is a
  // full sheet scan each time and this list is rendered on every tab open).
  var visName = {};
  getSheetAsObjects(SHEETS.VISITORS).forEach(function(v) {
    visName[String(v.VisitorID)] = { name: v.Name || '', company: v.Company || '', phone: v.Phone || '' };
  });
  var empName = {};
  getSheetAsObjects(SHEETS.EMPLOYEES).forEach(function(e) { empName[String(e.EmpID)] = e.Name || ''; });

  var now = new Date();
  var items = rows.map(function(r) {
    var logged = r.LoggedAt ? new Date(r.LoggedAt) : null;
    var days = logged && !isNaN(logged) ? Math.floor((now - logged) / 86400000) : '';
    var v = visName[String(r.VisitorID)] || {};
    return {
      gatepassId:   r.GatepassID,
      visitorId:    r.VisitorID,
      visitorName:  v.name || String(r.VisitorID),
      company:      v.company || '',
      phone:        v.phone || '',
      hostName:     empName[String(r.HostEmpID)] || '',
      itemDesc:     r.ItemDesc || '',
      materialCode: r.MaterialCode || '',
      unit:         r.Unit || '',
      qty:          Number(r.Qty) || 0,
      photoUrl:     _normalizePhotoUrl_(r.PhotoURL || ''),
      hostApproved: String(r.HostApproved).toUpperCase() === 'YES',
      loggedAt:     r.LoggedAt || '',
      daysOut:      days
    };
  });
  // Oldest first — the longest-outstanding item is the one that needs chasing.
  items.sort(function(a, b) { return String(a.loggedAt).localeCompare(String(b.loggedAt)); });
  return { success: true, items: items, count: items.length };
}

/** Compact counts for the dashboard tile. */
function getGatepassKpis() {
  var rows = getSheetAsObjects(SHEETS.GATEPASS);
  var outstanding = 0, unapproved = 0, overdue = 0;
  var now = new Date();
  rows.forEach(function(r) {
    if (r.Status === 'OUT_PENDING') {
      outstanding++;
      var logged = r.LoggedAt ? new Date(r.LoggedAt) : null;
      if (logged && !isNaN(logged) && (now - logged) > 86400000) overdue++;
    }
    if (r.Status !== 'VOID' && String(r.HostApproved).toUpperCase() !== 'YES') unapproved++;
  });
  return { success: true, outstanding: outstanding, overdue: overdue, unapproved: unapproved };
}
