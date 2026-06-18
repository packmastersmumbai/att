// ============================================================
// visitors.gs — Visitor registration, checkout, blacklist
// ============================================================

function registerVisitor(v) {
  if (!v.Name || !v.Phone) return { success: false, error: 'Name and Phone are required' };

  var visitorId = 'VIS-' + today().replace(/-/g, '') + '-' + Math.floor(100000 + Math.random() * 900000);
  var qrUrl = generateQR(visitorId, 300);

  var sheet = getSheet(SHEETS.VISITORS);
  sheet.appendRow([
    visitorId,
    v.Name,
    v.Company    || '',
    v.Phone,
    v.HostEmpID  || '',
    v.Purpose    || '',
    v.ExpectedOut|| '',
    'NO'
  ]);

  return { success: true, visitorId: visitorId, qrCode: visitorId, qrUrl: qrUrl };
}

function checkoutVisitor(visitorId) {
  var person = _lookupPerson(visitorId);
  if (!person) return { success: false, error: 'Visitor not found' };
  return processQRScan(visitorId, 'Manual Checkout');
}

function addToBlacklist(entry) {
  if (!entry.QRCode) return { success: false, error: 'QRCode required' };
  var sheet = getSheet(SHEETS.BLACKLIST);
  if (findRowByValue(sheet, 'QRCode', entry.QRCode) !== -1) {
    return { success: false, error: 'Already on blacklist' };
  }
  sheet.appendRow([entry.QRCode, entry.PersonName || '', entry.Reason || '', today(), entry.AddedBy || 'Admin']);
  return { success: true };
}

function removeFromBlacklist(qrCode) {
  var sheet = getSheet(SHEETS.BLACKLIST);
  var row = findRowByValue(sheet, 'QRCode', qrCode);
  if (row === -1) return { success: false, error: 'Not found on blacklist' };
  sheet.deleteRow(row);
  return { success: true };
}

function getBlacklist() {
  return { success: true, data: getSheetAsObjects(SHEETS.BLACKLIST) };
}
