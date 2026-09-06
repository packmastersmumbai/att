// ============================================================
// employees.gs — Employee CRUD + QR generation
// ============================================================

function getEmployees() {
  _ensureEmployeeColumns_(getSheet(SHEETS.EMPLOYEES));   // ensure Gender (etc.) column exists
  return { success: true, data: getSheetAsObjects(SHEETS.EMPLOYEES) };
}

function saveEmployee(emp, token) {
  _requireAdmin_(token);
  var sheet = getSheet(SHEETS.EMPLOYEES);
  _ensureEmployeeColumns_(sheet);

  if (emp.EmpID) {
    // Supplied ID: update if row exists, create if not
    var row = findRowByValue(sheet, 'EmpID', emp.EmpID);
    if (row !== -1) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      headers.forEach(function(h) {
        if (emp[h] !== undefined) setCell(sheet, row, h, emp[h]);
      });
      return { success: true, action: 'updated', empId: emp.EmpID };
    }
    // Row not found — create with the supplied ID
    return _createEmployee_(sheet, emp.EmpID, emp);
  } else {
    // No ID supplied — auto-generate
    var newId = _nextEmpID(sheet);
    return _createEmployee_(sheet, newId, emp);
  }
}

function deleteEmployee(empId, token) {
  _requireAdmin_(token);
  var sheet = getSheet(SHEETS.EMPLOYEES);
  var row = findRowByValue(sheet, 'EmpID', empId);
  if (row === -1) return { success: false, error: 'Employee not found' };
  setCell(sheet, row, 'Status', 'INACTIVE');
  return { success: true, empId: empId };
}

function setEmployeeStatus(empId, status, token) {
  _requireAdmin_(token);
  var sheet = getSheet(SHEETS.EMPLOYEES);
  var row = findRowByValue(sheet, 'EmpID', empId);
  if (row === -1) return { success: false, error: 'Employee not found' };
  var allowed = ['ACTIVE', 'INACTIVE'];
  if (allowed.indexOf(status) === -1) return { success: false, error: 'Invalid status' };
  setCell(sheet, row, 'Status', status);
  return { success: true, empId: empId, status: status };
}

/**
 * One-shot import of Gender + Blood Group from the external HR master sheet.
 * Matches source CODE → app EmpID. Sanitises hard: only real gender/blood-group
 * values are accepted (the source column has junk like TRUE/FALSE/training text).
 * Never overwrites an existing app value with a blank/invalid source value.
 * Returns a summary so you can see what actually matched.
 */
function importGenderBloodGroup(token) {
  _requireAdmin_(token);
  var SOURCE_ID = '1TKCGJilJenmr0yCZ6g_dS_RDSISe3bCZQ5boMlM-YQ4';
  var src;
  try {
    src = SpreadsheetApp.openById(SOURCE_ID).getSheets()[0];
  } catch (e) {
    return { success: false, error: 'Cannot open source sheet — share it with this account. ' + e.message };
  }

  var data = src.getDataRange().getValues();
  if (data.length < 2) return { success: false, error: 'Source sheet is empty' };

  // Locate columns by header name (row 1), so we do not hard-code positions.
  var hdr = data[0].map(function(h) { return String(h || '').trim().toUpperCase(); });
  var codeCol  = hdr.indexOf('CODE');
  var genCol   = hdr.indexOf('GENDER');
  var bloodCol = hdr.indexOf('BLOOD GROUP');
  if (codeCol === -1) return { success: false, error: 'No CODE column in source' };

  var VALID_BLOOD = { 'A+':1,'A-':1,'B+':1,'B-':1,'AB+':1,'AB-':1,'O+':1,'O-':1 };
  function cleanGender(v) {
    var g = String(v || '').trim().toUpperCase();
    if (g === 'MALE' || g === 'M') return 'Male';
    if (g === 'FEMALE' || g === 'F') return 'Female';
    if (g === 'OTHER') return 'Other';
    return '';  // reject TRUE/FALSE/text/blank
  }
  function cleanBlood(v) {
    var b = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
    return VALID_BLOOD[b] ? b : '';
  }

  // Build EmpID → {gender, blood} from source (last non-empty wins).
  var srcMap = {};
  for (var i = 1; i < data.length; i++) {
    var code = String(data[i][codeCol] || '').trim();
    if (!code) continue;
    var g = genCol   !== -1 ? cleanGender(data[i][genCol])  : '';
    var b = bloodCol !== -1 ? cleanBlood(data[i][bloodCol]) : '';
    if (!g && !b) continue;
    if (!srcMap[code]) srcMap[code] = {};
    if (g) srcMap[code].gender = g;
    if (b) srcMap[code].blood  = b;
  }

  // Apply to the app Employees sheet.
  var sheet = getSheet(SHEETS.EMPLOYEES);
  _ensureEmployeeColumns_(sheet);
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol    = headers.indexOf('EmpID') + 1;
  var gCol      = headers.indexOf('Gender') + 1;
  var bCol      = headers.indexOf('BloodGroup') + 1;

  var matched = 0, genSet = 0, bloodSet = 0;
  for (var r = 2; r <= lastRow; r++) {
    var empId = String(sheet.getRange(r, idCol).getValue() || '').trim();
    var rec = srcMap[empId];
    if (!rec) continue;
    matched++;
    if (rec.gender && !String(sheet.getRange(r, gCol).getValue() || '').trim()) {
      sheet.getRange(r, gCol).setValue(rec.gender); genSet++;
    }
    if (rec.blood && !String(sheet.getRange(r, bCol).getValue() || '').trim()) {
      sheet.getRange(r, bCol).setValue(rec.blood); bloodSet++;
    }
  }

  var summary = { success: true, sourceRowsWithData: Object.keys(srcMap).length,
                  matchedEmployees: matched, genderSet: genSet, bloodGroupSet: bloodSet };
  Logger.log('importGenderBloodGroup: ' + JSON.stringify(summary));
  return summary;
}

// ── Private ──────────────────────────────────────────────────

/**
 * Appends a new employee row. QR-image storage is best-effort: if Drive
 * sharing / external fetch fails (common under Workspace policies), the row
 * is still created and QRImageURL falls back to the live qrserver URL.
 * Employee creation must never fail because of an image side effect.
 */
function _createEmployee_(sheet, empId, emp) {
  var qrCode = empId;
  var qrImageUrl = '';
  try {
    qrImageUrl = generateAndStoreQR(empId);
  } catch (err) {
    Logger.log('generateAndStoreQR failed for ' + empId + ': ' + err);
    qrImageUrl = generateQR(empId, 300); // public fallback image URL
  }
  // Write by header name so new columns (e.g. Gender) land in the right place
  // regardless of column order.
  var values = {
    EmpID: empId, Name: emp.Name, Department: emp.Department || '', Gender: emp.Gender || '',
    BloodGroup: emp.BloodGroup || '',
    Phone: emp.Phone || '', Email: emp.Email || '', QRCode: qrCode, Status: 'ACTIVE',
    PhotoURL: emp.PhotoURL || '', QRImageURL: qrImageUrl
  };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(function(h) { return values[h] !== undefined ? values[h] : ''; }));
  return { success: true, action: 'created', empId: empId, qrCode: qrCode, qrUrl: qrImageUrl };
}

/** Appends any missing employee columns (idempotent) so older sheets pick up new fields. */
function _ensureEmployeeColumns_(sheet) {
  // JobRole drives the per-role minimum levels on the skill matrix.
  var needed = ['EmpID','Name','Department','JobRole','Gender','BloodGroup','Phone','Email','QRCode','Status','PhotoURL','QRImageURL'];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  needed.forEach(function(h) {
    if (headers.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#F0F0F0');
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
  });
}

function _nextEmpID(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '1';
  var ids = sheet.getRange(2, getColIndex(sheet, 'EmpID'), lastRow - 1, 1).getValues().flat();
  var max = 0;
  ids.forEach(function(id) {
    var n = parseInt(String(id).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return String(max + 1);
}
