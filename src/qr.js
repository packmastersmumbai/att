// ============================================================
// qr.gs — QR code image generation
// Uses api.qrserver.com (free, no API key required)
// ============================================================

/**
 * Returns a publicly accessible QR code image URL for the given data string.
 * @param {string} data  e.g. "EMP-004217"
 * @param {number} size  pixel size of the image (default 200)
 * @returns {string}     image URL
 */
function generateQR(data, size) {
  size = size || 200;
  var base = 'https://api.qrserver.com/v1/create-qr-code/';
  return base + '?data=' + encodeURIComponent(data) + '&size=' + size + 'x' + size + '&margin=10';
}

/**
 * Fetches a QR code image for empId from qrserver, saves it to Drive folder
 * "QRCodes" (created if missing), makes it public, and returns the file URL.
 */
function generateAndStoreQR(empId) {
  var url = generateQR(empId, 300);
  var response = UrlFetchApp.fetch(url);
  var blob = response.getBlob().setName(empId + '.png');

  var folder;
  var folders = DriveApp.getFoldersByName('QRCodes');
  folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('QRCodes');

  // Remove old file for this empId if exists
  var existing = folder.getFilesByName(empId + '.png');
  while (existing.hasNext()) existing.next().setTrashed(true);

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?id=' + file.getId();
}
