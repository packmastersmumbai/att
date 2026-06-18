// ============================================================
// utils.gs — Shared helpers
// Rule: ALWAYS read columns by header name, NEVER by index.
//       New columns MUST be appended at the end of each tab.
// ============================================================

function getSheet(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Sheet not found: ' + tabName);
  return sheet;
}

/**
 * Returns the 1-based column index for a given header name.
 * Throws if the header is not found — fail fast, never silently return wrong data.
 */
function getColIndex(sheet, headerName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf(headerName);
  if (idx === -1) throw new Error('Column "' + headerName + '" not found in sheet "' + sheet.getName() + '"');
  return idx + 1; // convert to 1-based
}

/**
 * Returns all rows of a sheet as an array of objects keyed by header name.
 * Row 1 is headers; data starts at row 2.
 */
function getSheetAsObjects(tabName) {
  var sheet = getSheet(tabName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      var val = row[i];
      if (val instanceof Date) {
        // Time columns → "H:MM AM/PM"; date columns → "YYYY-MM-DD"
        // Duration is stored as "Xh Ym" string but GSheets may parse it as a time value
        var isTimeCol = (h === 'TimeIN' || h === 'TimeOUT');
        var isDurCol  = (h === 'Duration');
        if (isDurCol) {
          // Extract h/m directly from the Date rather than calling formatDate
          var dh = val.getHours();
          var dm = val.getMinutes();
          obj[h] = dh + 'h ' + dm + 'm';
        } else {
          obj[h] = isTimeCol ? formatTime(val) : formatDate(val);
        }
      } else if (typeof val === 'number' && h === 'Duration') {
        // Fractional-day numeric → convert to "Xh Ym"
        var totalMins = Math.round(val * 24 * 60);
        var dh = Math.floor(totalMins / 60);
        var dm = totalMins % 60;
        obj[h] = dh + 'h ' + dm + 'm';
      } else {
        obj[h] = val;
      }
    });
    return obj;
  });
}

/**
 * Finds the row number (1-based) of the first row where columnName === value.
 * Returns -1 if not found.
 */
function findRowByValue(sheet, columnName, value) {
  var col = getColIndex(sheet, columnName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(value)) return i + 2; // +2: header + 0-based
  }
  return -1;
}

/**
 * Sets a single cell in a row by column header name.
 */
function setCell(sheet, rowNum, columnName, value) {
  var col = getColIndex(sheet, columnName);
  sheet.getRange(rowNum, col).setValue(value);
}

/**
 * Gets a single cell value in a row by column header name.
 */
function getCell(sheet, rowNum, columnName) {
  var col = getColIndex(sheet, columnName);
  return sheet.getRange(rowNum, col).getValue();
}

/**
 * Verifies an admin PIN server-side.
 * Never exposes the stored PIN to the client.
 * @param {string} pin  PIN entered by user
 * @returns {{success: boolean}}
 */
function verifyPIN(pin) {
  var stored = getConfigValue('AdminPIN');
  return { success: String(pin) === String(stored) };
}

/* ─────────────────────────────────────────────
   MULTI-USER PIN LOGIN
   Users are defined here; owners and Khushi admin.
   PINs are plain strings (no hashing needed for a
   local kiosk app, but can be upgraded later).
───────────────────────────────────────────── */
var APP_USERS = [
  { id: 'u1', name: 'Owner',  role: 'owner', pin: '1111', avatar: 'OW' },
  { id: 'u2', name: 'Khushi', role: 'admin', pin: '2222', avatar: 'KH' },
];

/**
 * Returns safe user list for the login screen (no PINs).
 */
function getUsersForLogin() {
  var list = APP_USERS.map(function(u) {
    return { id: u.id, name: u.name, role: u.role, avatar: u.avatar };
  });
  return { success: true, users: list };
}

/**
 * Validates a user's PIN. Returns user info on success, error on failure.
 */
function validateUserPin(userId, pin) {
  var user = null;
  for (var i = 0; i < APP_USERS.length; i++) {
    if (APP_USERS[i].id === userId) { user = APP_USERS[i]; break; }
  }
  if (!user) return { success: false, error: 'User not found' };
  if (String(pin) !== String(user.pin)) return { success: false, error: 'Incorrect PIN' };
  return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar } };
}

/**
 * Manual checkout for an employee by EmpID — sets TimeOUT to now.
 */
function manualCheckout(empId) {
  if (!empId) return { success: false, error: 'No empId provided' };
  try {
    var sheet = getSheet(SHEETS.ATTENDANCE);
    var data  = sheet.getDataRange().getValues();
    var headers = data[0];
    var empCol  = headers.indexOf('EmpID');
    var outCol  = headers.indexOf('TimeOUT');
    var dateCol = headers.indexOf('Date');
    if (empCol < 0 || outCol < 0) return { success: false, error: 'Sheet columns missing' };
    var today   = new Date().toISOString().split('T')[0];
    var updated = 0;
    for (var r = 1; r < data.length; r++) {
      var rowEmp  = String(data[r][empCol] || '').trim();
      var rowDate = String(data[r][dateCol] || '').split('T')[0];
      var rowOut  = String(data[r][outCol]  || '').trim();
      if (rowEmp === String(empId).trim() && rowDate === today && rowOut === '') {
        sheet.getRange(r + 1, outCol + 1).setValue(new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }));
        updated++;
      }
    }
    if (updated === 0) return { success: false, error: 'No open check-in found for today' };
    return { success: true, updated: updated };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Reads a value from the Config tab by key.
 */
function getConfigValue(key) {
  var sheet = getSheet(SHEETS.CONFIG);
  var row = findRowByValue(sheet, 'Key', key);
  if (row === -1) return null;
  return getCell(sheet, row, 'Value');
}

/**
 * Generates a unique ID with a given prefix, e.g. "EMP-004217"
 */
function generateID(prefix) {
  return prefix + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Formats a Date object as "H:MM AM/PM"
 */
function formatTime(date) {
  var h = date.getHours();
  var m = date.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
}

/**
 * Formats a Date object as "YYYY-MM-DD"
 */
function formatDate(date) {
  var y = date.getFullYear();
  var mo = date.getMonth() + 1;
  var d = date.getDate();
  return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
}

/**
 * Calculates duration string between two Date objects, e.g. "8h 48m"
 */
function calcDuration(timeIn, timeOut) {
  var diff = Math.floor((timeOut - timeIn) / 60000);
  if (diff < 0 || diff > 1440) return ''; // sanity: negative or >24h → invalid
  var h = Math.floor(diff / 60);
  var m = diff % 60;
  return h + 'h ' + m + 'm';
}

/**
 * Returns today's date string "YYYY-MM-DD"
 */
function today() {
  return formatDate(new Date());
}

/**
 * Parses a time string (or GSheets Date object) and returns a Date set to today.
 * GSheets stores time-only values relative to 30 Dec 1899 — this transplants
 * the H:M onto the current date so duration calculations work correctly.
 * @param {string|Date} timeStr  e.g. "9:14 AM" or a GSheets Date serial
 * @returns {Date|null}
 */
function parseTimeToday(timeStr) {
  if (!timeStr) return null;
  if (timeStr instanceof Date) {
    var d = new Date();
    d.setHours(timeStr.getHours(), timeStr.getMinutes(), 0, 0);
    return d;
  }
  var match = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  var h = parseInt(match[1]);
  var m = parseInt(match[2]);
  var ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  var d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
