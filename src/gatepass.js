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
