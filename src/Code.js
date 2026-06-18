// ============================================================
// Code.gs — Entry point
// ============================================================

var SHEETS = {
  EMPLOYEES:       'Employees',
  VISITORS:        'Visitors',
  LOGS:            'Logs',
  ACTIVE_VISITORS: 'ActiveVisitors',
  BLACKLIST:       'Blacklist',
  CONFIG:          'Config'
};

function doGet(e) {
  // Auto-bootstrap on first visit
  _bootstrapIfNeeded();

  // Camera popup relay: popup GETs this URL to pass the scanned code back
  if (e && e.parameter && e.parameter.action === 'scan_relay') {
    var sid  = String(e.parameter.sid  || 'default').replace(/[^a-z0-9]/gi, '');
    var code = String(e.parameter.code || '');
    if (sid && code) {
      PropertiesService.getScriptProperties().setProperty('SCAN_' + sid, code);
    }
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }

  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'scanner';
  var validPages = ['scanner', 'scanner_popup', 'dashboard', 'reports', 'visitors', 'kiosk', 'admin', 'idcards', 'e2e'];
  if (validPages.indexOf(page) === -1) page = 'scanner';

  var template = HtmlService.createTemplateFromFile('pages/' + page);
  template.page = page;
  template.appUrl = ScriptApp.getService().getUrl();
  // For ID cards page inject employee data server-side (no extra round-trip)
  if (page === 'idcards') {
    var emps = [], orgName = 'My Organisation', idcardsError = '';
    try {
      emps = getSheetAsObjects(SHEETS.EMPLOYEES);
    } catch(ex) { idcardsError += 'Employees sheet error: ' + ex.message + '. '; }
    try {
      var cfg = getSheetAsObjects(SHEETS.CONFIG);
      cfg.forEach(function(c) { if (String(c.Key).trim() === 'OrgName') orgName = String(c.Value || 'My Organisation').trim(); });
    } catch(ex) { idcardsError += 'Config sheet error: ' + ex.message + '. '; }
    template.employeesJson = JSON.stringify(emps);
    template.orgName = orgName;
    template.idcardsError = idcardsError;
  } else {
    template.employeesJson = '[]';
    template.orgName = '';
    template.idcardsError = '';
  }
  return template.evaluate()
    .setTitle('QR Attendance System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Runs once on first deployment — creates all sheet tabs, headers,
 * default config, and installs time-based triggers.
 * Safe to call multiple times (idempotent).
 */
function _bootstrapIfNeeded() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('bootstrapped') === 'true') return;

  var schema = {
    'Employees':      ['EmpID','Name','Department','Phone','Email','QRCode','Status','PhotoURL','QRImageURL'],
    'Visitors':       ['VisitorID','Name','Company','Phone','HostEmpID','Purpose','ExpectedOut','BlacklistFlag'],
    'Logs':           ['LogID','QRCode','PersonID','Type','Name','Department','TimeIN','TimeOUT','Duration','Date','Gate','Status'],
    'ActiveVisitors': ['VisitorID','Name','TimeIN','HostEmpID','Gate'],
    'Blacklist':      ['QRCode','PersonName','Reason','AddedDate','AddedBy'],
    'Config':         ['Key','Value']
  };

  // Create tabs and headers (safe: never fails if tab already exists)
  Object.keys(schema).forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      try {
        sheet = ss.insertSheet(tabName);
      } catch(e) {
        sheet = ss.getSheetByName(tabName); // race condition fallback
      }
    }
    if (!sheet) return;
    var headers = schema[tabName];
    var existing = sheet.getRange(1, 1, 1, 1).getValue();
    if (existing === '' || existing === null) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
           .setFontWeight('bold')
           .setBackground('#F0F0F0');
      sheet.setFrozenRows(1);
    }
  });

  // Populate Config defaults if empty
  var configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() < 2) {
    var defaults = [
      ['OrgName',        'My Organisation'],
      ['OwnerPhone',     ''],
      ['OwnerEmail',     ''],
      ['AdminPIN',       '1234'],
      ['SchemaVersion',  '1'],
      ['CallMeBotKey',   ''],
      ['AutoCheckoutHr', '23'],
      ['SummaryHr',      '19']
    ];
    configSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }

  // Delete default empty sheet if it still exists
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  // Install triggers
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailySummary').timeBased().atHour(19).everyDays(1).create();
  ScriptApp.newTrigger('autoCheckoutAll').timeBased().atHour(23).everyDays(1).create();

  props.setProperty('bootstrapped', 'true');
  Logger.log('Bootstrap complete.');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var action = params.action;

  if (action === 'processQRScan')    return jsonResponse(processQRScan(params.qrCode, params.gate));
  if (action === 'registerVisitor')  return jsonResponse(registerVisitor(params.visitor));
  if (action === 'checkoutVisitor')  return jsonResponse(checkoutVisitor(params.visitorId));
  if (action === 'getDashboardData') return jsonResponse(getDashboardData());
  if (action === 'getAnalyticsData') return jsonResponse(getAnalyticsData(params.range));
  if (action === 'getLogs')          return jsonResponse(getLogs(params.filters));
  if (action === 'getEmployees')     return jsonResponse(getEmployees());
  if (action === 'saveEmployee')     return jsonResponse(saveEmployee(params.employee));
  if (action === 'deleteEmployee')   return jsonResponse(deleteEmployee(params.empId));
  if (action === 'setEmployeeStatus') return jsonResponse(setEmployeeStatus(params.empId, params.status));
  if (action === 'verifyPIN')        return jsonResponse(verifyPIN(params.pin));
  if (action === 'getConfig')        return jsonResponse(getConfig());
  if (action === 'saveConfig')       return jsonResponse(saveConfig(params.config));
  if (action === 'getBlacklist')     return jsonResponse(getBlacklist());
  if (action === 'addBlacklist')     return jsonResponse(addToBlacklist(params.entry));
  if (action === 'removeBlacklist')  return jsonResponse(removeFromBlacklist(params.qrCode));
  if (action === 'exportCSV')            return jsonResponse(exportCSV(params.filters));
  if (action === 'getMonthlyAttendance') return jsonResponse(getMonthlyAttendance(params.year, params.month));
  if (action === 'processAndStoreScan') return jsonResponse(processAndStoreScan(params.qrCode, params.gate, params.sid));
  if (action === 'getPendingResult')    return jsonResponse(getPendingResult(params.sid));

  return jsonResponse({ success: false, error: 'Unknown action: ' + action });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
