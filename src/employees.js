// ============================================================
// employees.gs — Employee CRUD + QR generation
// ============================================================

function getEmployees() {
  return { success: true, data: getSheetAsObjects(SHEETS.EMPLOYEES) };
}

function saveEmployee(emp) {
  var sheet = getSheet(SHEETS.EMPLOYEES);

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
    var qrCode = emp.EmpID;
    var qrImageUrl = generateAndStoreQR(emp.EmpID);
    sheet.appendRow([emp.EmpID, emp.Name, emp.Department || '', emp.Phone || '', emp.Email || '', qrCode, 'ACTIVE', emp.PhotoURL || '', qrImageUrl]);
    return { success: true, action: 'created', empId: emp.EmpID, qrCode: qrCode, qrUrl: qrImageUrl };
  } else {
    // No ID supplied — auto-generate
    var newId = _nextEmpID(sheet);
    var qrCode = newId;
    var qrImageUrl = generateAndStoreQR(newId);
    sheet.appendRow([newId, emp.Name, emp.Department || '', emp.Phone || '', emp.Email || '', qrCode, 'ACTIVE', emp.PhotoURL || '', qrImageUrl]);
    return { success: true, action: 'created', empId: newId, qrCode: qrCode, qrUrl: qrImageUrl };
  }
}

function deleteEmployee(empId) {
  var sheet = getSheet(SHEETS.EMPLOYEES);
  var row = findRowByValue(sheet, 'EmpID', empId);
  if (row === -1) return { success: false, error: 'Employee not found' };
  setCell(sheet, row, 'Status', 'INACTIVE');
  return { success: true, empId: empId };
}

function setEmployeeStatus(empId, status) {
  var sheet = getSheet(SHEETS.EMPLOYEES);
  var row = findRowByValue(sheet, 'EmpID', empId);
  if (row === -1) return { success: false, error: 'Employee not found' };
  var allowed = ['ACTIVE', 'INACTIVE'];
  if (allowed.indexOf(status) === -1) return { success: false, error: 'Invalid status' };
  setCell(sheet, row, 'Status', status);
  return { success: true, empId: empId, status: status };
}

// ── Private ──────────────────────────────────────────────────

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
