// ============================================================
// Code.gs — Entry point
// ============================================================

var SHEETS = {
  EMPLOYEES:       'Employees',
  VISITORS:        'Visitors',
  LOGS:            'Logs',
  ACTIVE_VISITORS: 'ActiveVisitors',
  BLACKLIST:       'Blacklist',
  CONFIG:          'Config',
  GATEPASS:        'Gatepass'
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

  // Cache diagnostics. bumpbuild rotates the build stamp: one property write
  // that retires every stamped cache entry at once, and returns instantly.
  // Deliberately the primary cache-clearing command — sweeping and deleting
  // keys is O(keys) and can exceed the request timeout, which fails silently
  // and blocks new code from reaching users.
  if (e && e.parameter && e.parameter.diag) {
    var diag = String(e.parameter.diag);
    if (diag === 'bumpbuild') {
      var stamp = bumpBuildStamp_();
      return ContentService
        .createTextOutput(JSON.stringify({ ok: !!stamp, stamp: stamp }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (diag === 'build') {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, stamp: getBuildStamp_() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'scanner';
  var validPages = ['scanner', 'scanner_popup', 'dashboard', 'reports', 'visitors', 'kiosk', 'admin', 'idcards', 'e2e', 'vreg', 'vpass', 'gatepass_approve', 'training', 'skillmatrix'];
  if (validPages.indexOf(page) === -1) page = 'scanner';

  var template = HtmlService.createTemplateFromFile('pages/' + page);
  template.page = page;
  template.appUrl = ScriptApp.getService().getUrl();
  template.publicUrl = publicBaseUrl();   // GAS app base for in-app nav + shared links (direct, no launcher)
  // Org name, read ONCE for every page. Three separate blocks used to read the
  // same Config key with three different fallbacks, and any page outside those
  // branches got an empty string — which is how the training calendar shipped
  // printing "Rev 00 ·" with nothing after the separator.
  var orgName = 'My Organisation';
  try {
    getSheetAsObjects(SHEETS.CONFIG).forEach(function(c) {
      if (String(c.Key).trim() === 'OrgName' && c.Value) orgName = String(c.Value).trim();
    });
  } catch(ex) {}
  template.orgName = orgName;

  // For ID cards page inject employee data server-side (no extra round-trip)
  if (page === 'idcards') {
    var emps = [], idcardsError = '';
    try {
      emps = getSheetAsObjects(SHEETS.EMPLOYEES);
    } catch(ex) { idcardsError += 'Employees sheet error: ' + ex.message + '. '; }
    template.employeesJson = JSON.stringify(emps);
    template.idcardsError = idcardsError;
  } else {
    template.employeesJson = '[]';
    template.idcardsError = '';
  }

  // Public visitor self-service pages: inject org name + (for vpass) the pass record
  if (page === 'vreg' || page === 'vpass') {
    var hostDepts = '';
    try {
      getSheetAsObjects(SHEETS.CONFIG).forEach(function(c) {
        if (String(c.Key).trim() === 'HostDepartments') hostDepts = String(c.Value || '').trim();
      });
    } catch(ex) {}
    template.hostDepartments = hostDepts;  // comma-separated depts shown in "Whom to meet"; blank = all active
  } else {
    template.hostDepartments = '';
  }
  if (page === 'vpass') {
    var vid = String((e && e.parameter && e.parameter.id) || '');
    var passJson = '{}';
    try { passJson = JSON.stringify(getVisitorPass(vid)); } catch(ex) { passJson = JSON.stringify({ success: false, error: ex.message }); }
    template.passJson = passJson;
  } else {
    template.passJson = '{}';
  }

  // Host gatepass-approval page: inject the visitor's item list + token so the
  // host sees the list without a round-trip (the Approve button still calls back).
  if (page === 'gatepass_approve') {
    var gpVid = String((e && e.parameter && e.parameter.id) || '');
    var gpTok = String((e && e.parameter && e.parameter.t) || '');
    var gpJson = '{}';
    try { gpJson = JSON.stringify(getGatepass(gpVid)); } catch(ex) { gpJson = JSON.stringify({ success: false, error: ex.message }); }
    template.gpJson = gpJson; template.gpVid = gpVid; template.gpTok = gpTok;
  } else {
    template.gpJson = '{}'; template.gpVid = ''; template.gpTok = '';
  }

  // Inject the shared i18n runtime (dictionary + qrattT/qrattApplyLang/etc.)
  // into every served page before </head>. HtmlOutput methods like
  // setTitle/addMetaTag/setXFrameOptionsMode aren't available on a template,
  // so evaluate first, patch the content string, then rebuild the output.
  var evaluated = template.evaluate();

  // Shared design tokens go in FIRST — right after <head>, ahead of the page's
  // own <style>. Both declare :root, so they tie on specificity and the later
  // one wins; being first makes every shared value a default the page silently
  // overrides just by declaring its own. Injecting them before </head> instead
  // would invert that and restyle all eleven pages at once.
  var withTokens = evaluated.getContent().replace('<head>',
    '<head>' + HtmlService.createHtmlOutputFromFile('tokens').getContent());

  var withI18n = withTokens.replace('</head>',
    HtmlService.createHtmlOutputFromFile('i18n').getContent() +
    // Shared visitor-item card (markup + styles + QRATT_GPC renderer). Injected
    // like i18n so every surface renders items identically instead of each page
    // hand-rolling its own copy.
    HtmlService.createHtmlOutputFromFile('gatepassCard').getContent() + '</head>');
  // Shared floating "Report an issue" widget on every page, before </body>.
  var feedback = HtmlService.createHtmlOutputFromFile('feedbackWidget').getContent();
  withI18n = withI18n.indexOf('</body>') !== -1
    ? withI18n.replace('</body>', feedback + '</body>')
    : withI18n + feedback;
  return HtmlService.createHtmlOutput(withI18n)
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
    // JobRole drives the per-role minimum on the skill matrix. Only written
    // on a fresh install — an existing sheet keeps its headers, and a missing
    // JobRole simply falls back to each skill's own default minimum.
    'Employees':      ['EmpID','Name','Department','JobRole','Gender','BloodGroup','Phone','Email','QRCode','Status','PhotoURL','QRImageURL'],
    'Visitors':       ['VisitorID','Name','Company','Phone','HostEmpID','Purpose','ExpectedOut','BlacklistFlag','IDType','IDNumber','Vehicle','PhotoURL','SafetyAckAt','SafetyVersion','EmergencyName','EmergencyPhone'],
    'Logs':           ['LogID','QRCode','PersonID','Type','Name','Department','TimeIN','TimeOUT','Duration','Date','Gate','Status'],
    'ActiveVisitors': ['VisitorID','Name','TimeIN','HostEmpID','Gate'],
    'Blacklist':      ['QRCode','PersonName','Reason','AddedDate','AddedBy'],
    'HoursSummary':   ['Year','Month','EmpID','Name','Department','DaysWorked','PresentDays','LateDays','OpenSessions','TotalMinutes','TotalHours','AvgPerDay','OvertimeHours','Status'],
    'Config':         ['Key','Value'],
    'Gatepass':       ['GatepassID','VisitorID','Direction','MaterialCode','ItemDesc','Unit','Qty','Returnable','Status','PhotoURL','HostEmpID','HostApproved','LoggedBy','LoggedAt','SettledAt','Note']
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
      ['SummaryHr',      '9'],
      ['LateAfter',          '09:30'],
      ['StandardHours',      '8'],
      ['OvertimeAfterHours', '8'],
      ['HoursRebuildHr',     '1'],
      ['TelegramBotToken',   ''],
      ['TelegramChatID',     ''],
      ['TelegramLiveScans',  'off'],
      // Per-alert toggles. Blacklist is deliberately absent — a security alert
      // must not be switchable off from a settings screen.
      ['AlertVisitorArrival', 'on'],
      ['AlertGatepassApproval', 'on'],
      ['AlertItemsKept',     'on'],
      ['AlertUnreturned',    'on'],
      ['AlertFeedback',      'on'],
      ['AlertDigest',        'on'],
      ['AlertButtons',       'on'],   // inline action buttons on alerts
      ['AlertShowSite',      'on'],   // 🏢 OrgName stamp on every card
      ['AlertShowGate',      'on'],   // gate on scan alerts + blacklist
      ['SummaryMin',         '0'],    // minute for the daily digest (hour = SummaryHr)
      ['Holidays',           ''],
      ['PublicUrl',          ''],  // blank → publicBaseUrl() falls back to the raw GAS app URL (links open the app directly)
      ['AutoWhatsAppPass',   'off'],  // 'on' → vreg auto-opens the wa.me pass draft after registration
      ['QMSMaterialSheetID', ''],   // QMS spreadsheet ID for the gatepass material picklist; blank → free-text only
      ['HostDepartments',    'Office,Management'],  // depts shown in vreg "Whom to meet"; blank = all active employees
      // Training & competency. PassMark is the score at or above which an
      // attendee counts as assessed. MinRequired sets the minimum level per
      // job role, one role per line ("Packaging Operator: SKL-01=L3, SKL-16=NA");
      // blank means every role falls back to the skill's own default.
      ['PassMark',           '70'],
      ['MinRequired',        ''],
      ['LevelNames',         'Beginner|Under supervision|Independent|Can train others']
    ];
    configSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }

  // Delete default empty sheet if it still exists
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  // Install triggers
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailySummary').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('autoCheckoutAll').timeBased().atHour(23).everyDays(1).create();

  props.setProperty('bootstrapped', 'true');
  Logger.log('Bootstrap complete.');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  try {
    return _dispatchPost_(JSON.parse(e.postData.contents));
  } catch (err) {
    // _requireAdmin_ throws on an unauthorized call; without this the caller
    // gets a 500 HTML error page instead of a JSON body.
    return jsonResponse({ success: false, error: err.message });
  }
}

function _dispatchPost_(params) {
  // (Telegram uses polling, not webhooks — GAS doPost 302s, which Telegram
  //  rejects. See TelegramLib.poll / telegramPoll trigger.)

  var action = params.action;

  if (action === 'getSkillMatrix')        return jsonResponse(getSkillMatrix(params.group));
  if (action === 'getSkillHistory')       return jsonResponse(getSkillHistory(params.empId, params.skillId));
  if (action === 'setSkillLevel')         return jsonResponse(setSkillLevel(params.entry, params.token));
  if (action === 'seedSkills')            return jsonResponse(seedSkills(params.token));
  if (action === 'getTrainingCalendar') return jsonResponse(getTrainingCalendar(params.year));
  if (action === 'getSessionAttendance')  return jsonResponse(getSessionAttendance(params.planId));
  if (action === 'saveSessionAttendance') return jsonResponse(saveSessionAttendance(params.planId, params.rows));
  if (action === 'addSessionPhoto')       return jsonResponse(addSessionPhoto(params.planId, params.dataUrl));
  if (action === 'saveTrainingSession') return jsonResponse(saveTrainingSession(params.session));
  if (action === 'addTrainingSession')  return jsonResponse(addTrainingSession(params.session));
  if (action === 'seedTrainingYear')    return jsonResponse(seedTrainingYear(params.year, params.token));
  if (action === 'submitFeedback')   return jsonResponse(submitFeedback(params.text, params.meta));
  if (action === 'processQRScan')    return jsonResponse(processQRScan(params.qrCode, params.gate));
  if (action === 'registerVisitor')  return jsonResponse(registerVisitor(params.visitor));
  if (action === 'checkoutVisitor')  return jsonResponse(checkoutVisitor(params.visitorId));
  if (action === 'getVisitorDetail') return jsonResponse(getVisitorDetail(params.visitorId));
  if (action === 'getGatepass')      return jsonResponse(getGatepass(params.visitorId));
  if (action === 'addGatepassItem')  return jsonResponse(addGatepassItem(params.visitorId, params.item));
  if (action === 'markItemReturned') return jsonResponse(markItemReturned(params.gatepassId));
  if (action === 'voidGatepassItem') return jsonResponse(voidGatepassItem(params.gatepassId, params.reason));
  if (action === 'approveGatepass')  return jsonResponse(approveGatepass(params.visitorId, params.token));
  if (action === 'getOutstandingGatepass') return jsonResponse(getOutstandingGatepass());
  if (action === 'getGatepassKpis')        return jsonResponse(getGatepassKpis());
  if (action === 'settleVisitorGatepass')  return jsonResponse(settleVisitorGatepass(params.visitorId, params.mode, params.reason, params.token));
  if (action === 'settleGatepassAtCheckout') return jsonResponse(settleGatepassAtCheckout(params.visitorId, params.decisions));
  if (action === 'notifyHostItemsKept')      return jsonResponse(notifyHostItemsKept(params.visitorId, params.kept));
  if (action === 'notifyHostForApproval') return jsonResponse(notifyHostForApproval(params.visitorId));
  if (action === 'getMaterialList')  return jsonResponse(getMaterialList());
  if (action === 'lookupVisitorByPhone') return jsonResponse(lookupVisitorByPhone(params.phone));
  if (action === 'importGenderBloodGroup') return jsonResponse(importGenderBloodGroup(params.token));
  if (action === 'getDashboardData') return jsonResponse(getDashboardData());
  if (action === 'getAnalyticsData') return jsonResponse(getAnalyticsData(params.range));
  if (action === 'getLogs')          return jsonResponse(getLogs(params.filters));
  if (action === 'getEmployees')     return jsonResponse(getEmployees());
  if (action === 'saveEmployee')     return jsonResponse(saveEmployee(params.employee, params.token));
  if (action === 'deleteEmployee')   return jsonResponse(deleteEmployee(params.empId, params.token));
  if (action === 'setEmployeeStatus') return jsonResponse(setEmployeeStatus(params.empId, params.status, params.token));
  if (action === 'verifyPIN')        return jsonResponse(verifyPIN(params.pin));
  if (action === 'getConfig')        return jsonResponse(getConfig(params.token));
  if (action === 'saveConfig')       return jsonResponse(saveConfig(params.config, params.token));
  if (action === 'getBlacklist')     return jsonResponse(getBlacklist());
  if (action === 'addBlacklist')     return jsonResponse(addToBlacklist(params.entry, params.token));
  if (action === 'removeBlacklist')  return jsonResponse(removeFromBlacklist(params.qrCode, params.token));
  if (action === 'exportCSV')            return jsonResponse(exportCSV(params.filters));
  if (action === 'getMonthlyAttendance') return jsonResponse(getMonthlyAttendance(params.year, params.month, params.includeInactive));
  if (action === 'processAndStoreScan') return jsonResponse(processAndStoreScan(params.qrCode, params.gate, params.sid));
  if (action === 'getPendingResult')    return jsonResponse(getPendingResult(params.sid));
  if (action === 'getHolidayCatalog') return jsonResponse(getHolidayCatalog());
  if (action === 'getHolidays')       return jsonResponse(getHolidays());
  if (action === 'saveHolidays')      return jsonResponse(saveHolidays(params.dates, params.token));

  return jsonResponse({ success: false, error: 'Unknown action: ' + action });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
