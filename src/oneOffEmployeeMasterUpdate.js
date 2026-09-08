/**
 * oneOffEmployeeMasterUpdate.js — 2026-09-08
 *
 * Fills Department, JobRole and Engagement on the Employees sheet from the
 * employee master (org chart FRM/HR/017 Rev 02 + ATT identity).
 *
 * Why this is needed:
 *   · JobRole is empty on all 59 rows, so the skill matrix falls back to each
 *     skill's generic minimum instead of a per-role minimum.
 *   · Department holds Direct / NEEL / LAKSHMI — that is how a person is
 *     engaged, not where they work. Those values move to a new Engagement
 *     column and Department gets the real department.
 *
 * SAFE BY DEFAULT. Run in this order:
 *   1. previewEmployeeMasterUpdate()   — writes nothing, logs every change
 *   2. applyEmployeeMasterUpdate()     — snapshots the sheet, then writes
 *
 * Matching is by EmpID only. A row whose EmpID is not in the master is left
 * exactly as it is. Re-running changes nothing further — it is idempotent.
 */

var EMP_MASTER_ = {
  // EmpID : [Department, JobRole, Engagement]
  '004': ['Management', 'Plant In-charge', 'Office'],
  '007': ['Management', 'Proprietor', 'Office'],
  '102': ['Production & Operations', 'Worker', 'Direct'],
  '116': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '131': ['Production & Operations', 'Worker', 'Direct'],
  '133': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '134': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '156': ['Production & Operations', 'Worker', 'Direct'],
  '167': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '178': ['Production & Operations', 'Worker', 'Direct'],
  '181': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '184': ['Production & Operations', 'Worker', 'Direct'],
  '189': ['Production & Operations', 'Worker', 'Direct'],
  '190': ['Production & Operations', 'Worker', 'Direct'],
  '197': ['Production & Operations', 'Worker', 'Direct'],
  '205': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '206': ['Office, HR & Purchase', 'Department In-charge', 'Office'],
  '214': ['Production & Operations', 'Worker', 'Direct'],
  '217': ['Production & Operations', 'Worker', 'Direct'],
  '219': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '229': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '230': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '233': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '235': ['Production & Operations', 'Department In-charge', 'Direct'],
  '246': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '254': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '256': ['Production & Operations', 'Worker', 'Direct'],
  '262': ['Production & Operations', 'Worker', 'Direct'],
  '263': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '264': ['Production & Operations', 'Worker', 'Direct'],
  '265': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '266': ['Production & Operations', 'Worker', 'Direct'],
  '267': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '268': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '270': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '271': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '272': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '273': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '274': ['Production & Operations', 'Worker', 'Direct'],
  '275': ['Production & Operations', 'Worker', 'Direct'],
  '276': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '277': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '278': ['Quality Assurance & Admin', 'Department In-charge', 'Office'],
  '279': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '281': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '282': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '283': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '285': ['Production & Operations', 'Worker', 'Contract - LAKSHMI'],
  '355': ['Security', 'Security Guard', 'Contract - NEEL'],
  '368': ['Production & Operations', 'Worker', 'Direct'],
  '444': ['Production & Operations', 'Worker', 'Direct'],
  '486': ['Production & Operations', 'Worker', 'Direct'],
  '556': ['Production & Operations', 'Worker', 'Direct'],
  '557': ['Maintenance', 'Department In-charge', 'Direct'],
  '579': ['Stores', 'Department In-charge', 'Direct'],
  '597': ['Production & Operations', 'Worker', 'Contract - NEEL'],
  '687': ['Management', 'Manager', 'Office'],
  '762': ['Production & Operations', 'Worker', 'Direct'],
  '825': ['Dispatch & Logistics', 'Department In-charge', 'Direct'],
  '843': ['Production & Operations', 'Worker', 'Direct'],
  '903': ['External', 'ISO Consultant', 'External']
};

/* People who hold an EmpID but never clock in — owners and the consultant.
   They are absent from AQRS entirely, so they must be inserted, not updated.
   Status INACTIVE keeps them out of attendance reports and headcount while
   still giving the other apps an id to join on. */
var EMP_MASTER_NEW_ = [
  { EmpID: '004', Name: 'TARUN MISHRA',      Gender: 'Male', Status: 'INACTIVE' },
  { EmpID: '007', Name: 'BALKRISHNA MISHRA', Gender: 'Male', Status: 'INACTIVE' },
  { EmpID: '903', Name: 'ANIL SWAMI',        Gender: 'Male', Status: 'INACTIVE' }
];

/** Preview the rows that would be added. Writes nothing. */
function previewMissingEmployees() {
  return employeeMasterInsert_(true);
}

/** Append the three missing people. Safe to re-run — skips ids already present. */
function addMissingEmployees() {
  return employeeMasterInsert_(false);
}

function employeeMasterInsert_(dryRun) {
  var ss = employeeMasterSpreadsheet_();
  var sh = ss.getSheetByName('Employees');
  if (!sh) throw new Error('Employees sheet not found');

  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf('EmpID');
  if (idCol < 0) throw new Error('EmpID column not found');

  var present = {};
  if (lastRow > 1) {
    sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0]).trim();
      if (v) { present[v] = 1; present[('00' + v).slice(-3)] = 1; }
    });
  }

  var added = [], skipped = [];
  EMP_MASTER_NEW_.forEach(function (p) {
    if (present[p.EmpID]) { skipped.push(p.EmpID + ' ' + p.Name); return; }
    var m = EMP_MASTER_[p.EmpID];
    var row = headers.map(function (h) {
      if (h === 'EmpID')       return p.EmpID;
      if (h === 'Name')        return p.Name;
      if (h === 'Department')  return m ? m[0] : '';
      if (h === 'JobRole')     return m ? m[1] : '';
      if (h === 'Engagement')  return m ? m[2] : '';
      if (h === 'Gender')      return p.Gender;
      if (h === 'Status')      return p.Status;
      if (h === 'QRCode')      return p.EmpID;
      return '';
    });
    if (!dryRun) {
      sh.appendRow(row);
      // EmpID must stay text — 004 stored as the number 4 breaks the QR lookup.
      sh.getRange(sh.getLastRow(), idCol + 1).setNumberFormat('@').setValue(p.EmpID);
    }
    added.push(p.EmpID + ' ' + p.Name + ' — ' + (m ? m[0] + ' / ' + m[1] : 'no master entry'));
  });

  var msg = (dryRun ? 'PREVIEW — nothing written. ' : 'APPLIED. ') +
            added.length + ' row(s) ' + (dryRun ? 'would be added' : 'added') +
            (skipped.length ? ', ' + skipped.length + ' already present (' + skipped.join('; ') + ')' : '');
  Logger.log(msg);
  added.forEach(function (a) { Logger.log('  + ' + a); });
  return msg;
}

/** Log every change without writing anything. */
function previewEmployeeMasterUpdate() {
  return employeeMasterUpdate_(true);
}

/** Snapshot the sheet, then write. */
function applyEmployeeMasterUpdate() {
  return employeeMasterUpdate_(false);
}

/** The AQRS workbook. getActiveSpreadsheet() is null when the function is
 *  invoked through the Apps Script API (clasp run) rather than from the
 *  container, so fall back to the file id. */
var EMP_MASTER_SS_ID_ = '19sZN-uUARWqQ3o8QKmwDtKhXtfiGCS1LC-g4Vnxfvwo';

function employeeMasterSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
             EMP_MASTER_SS_ID_;
    ss = SpreadsheetApp.openById(id);
  }
  return ss;
}

function employeeMasterUpdate_(dryRun) {
  var ss = employeeMasterSpreadsheet_();
  var sh = ss.getSheetByName('Employees');
  if (!sh) throw new Error('Employees sheet not found');

  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) throw new Error('Employees sheet has no data rows');

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = function (name) { return headers.indexOf(name) + 1; };

  var cEmp = col('EmpID'), cDept = col('Department'), cJob = col('JobRole');
  if (!cEmp) throw new Error('EmpID column not found');
  if (!cDept || !cJob) throw new Error('Department or JobRole column not found');

  // Engagement is new. Append it rather than repurposing an existing column.
  var cEng = col('Engagement');
  if (!cEng) {
    cEng = lastCol + 1;
    if (!dryRun) sh.getRange(1, cEng).setValue('Engagement');
    Logger.log('Engagement column ' + (dryRun ? 'WOULD BE' : 'was') + ' added at column ' + cEng);
  }

  // Snapshot before any write — a dated copy of the tab, kept in the same file.
  if (!dryRun) {
    var stamp = Utilities.formatDate(new Date(), (Session.getScriptTimeZone() || "Asia/Kolkata"), 'yyyyMMdd-HHmm');
    sh.copyTo(ss).setName('Employees_backup_' + stamp);
    Logger.log('backup tab created: Employees_backup_' + stamp);
  }

  var data = sh.getRange(2, 1, lastRow - 1, Math.max(lastCol, cEng)).getValues();
  var changed = 0, unmatched = [], rows = [];

  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][cEmp - 1]).trim();
    if (!id) continue;
    // Sheets may have stored 004 as the number 4 — compare on both forms.
    var m = EMP_MASTER_[id] || EMP_MASTER_[('00' + id).slice(-3)];
    if (!m) { unmatched.push(id); continue; }

    var before = [data[i][cDept - 1], data[i][cJob - 1], data[i][cEng - 1]];
    if (String(before[0]) === m[0] && String(before[1]) === m[1] && String(before[2]) === m[2]) continue;

    rows.push(id + ': dept "' + before[0] + '"->"' + m[0] + '"  job "' + before[1] +
              '"->"' + m[1] + '"  eng "' + before[2] + '"->"' + m[2] + '"');
    if (!dryRun) {
      sh.getRange(i + 2, cDept).setValue(m[0]);
      sh.getRange(i + 2, cJob).setValue(m[1]);
      sh.getRange(i + 2, cEng).setValue(m[2]);
    }
    changed++;
  }

  var msg = (dryRun ? 'PREVIEW — nothing written. ' : 'APPLIED. ') +
            changed + ' row(s) ' + (dryRun ? 'would change' : 'changed') +
            ', ' + unmatched.length + ' row(s) not in the master' +
            (unmatched.length ? ' (' + unmatched.join(', ') + ')' : '');
  Logger.log(msg);
  rows.forEach(function (r) { Logger.log('  ' + r); });
  return msg;
}
