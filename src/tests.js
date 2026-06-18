// ============================================================
// tests.gs — QR Attendance System test suite
//
// HOW TO RUN:
//   1. Open the project in Google Apps Script editor
//   2. Select function: runAllTests
//   3. Click Run — results appear in Execution Log
//
// Run on a TEST spreadsheet, NOT production data.
// Integration tests (verifyPIN, getLogs) require bootstrap
// to have run at least once on the spreadsheet.
// ============================================================

// ── Assertion helpers ─────────────────────────────────────────

function _assert(condition, message) {
  if (!condition) {
    Logger.log('❌ FAIL: ' + message);
    throw new Error('Assertion failed: ' + message);
  }
  Logger.log('✅ PASS: ' + message);
}

function _assertEqual(actual, expected, message) {
  var a = String(actual), e = String(expected);
  if (a !== e) {
    Logger.log('❌ FAIL: ' + message + ' — expected "' + e + '" got "' + a + '"');
    throw new Error('Assertion failed: ' + message);
  }
  Logger.log('✅ PASS: ' + message);
}

// ── Test runner ───────────────────────────────────────────────

function runAllTests() {
  var suites = [
    testFormatTime,
    testFormatDate,
    testCalcDuration,
    testParseTimeToday,
    testGenerateID,
    testEscapeHTML,
    testVerifyPIN,
    testGetLogsFilters
  ];

  var passed = 0, failed = 0;
  suites.forEach(function(fn) {
    Logger.log('\n── ' + fn.name);
    try {
      fn();
      passed++;
    } catch (e) {
      failed++;
      Logger.log('   ' + e.message);
    }
  });

  Logger.log('\n' + '─'.repeat(40));
  Logger.log('Results: ' + passed + '/' + suites.length + ' suites passed, ' +
             failed + ' failed.');
  if (failed > 0) throw new Error(failed + ' suite(s) failed — see log above.');
  Logger.log('All tests passed ✅');
}

// ── formatTime ────────────────────────────────────────────────
// RED: these tests fail if formatTime is not defined or broken.

function testFormatTime() {
  _assertEqual(formatTime(new Date(2026, 2, 26,  9,  5, 0)), '9:05 AM',  'morning with leading-zero minutes');
  _assertEqual(formatTime(new Date(2026, 2, 26, 13, 30, 0)), '1:30 PM',  'afternoon');
  _assertEqual(formatTime(new Date(2026, 2, 26,  0,  0, 0)), '12:00 AM', 'midnight');
  _assertEqual(formatTime(new Date(2026, 2, 26, 12,  0, 0)), '12:00 PM', 'noon');
  _assertEqual(formatTime(new Date(2026, 2, 26, 23, 59, 0)), '11:59 PM', 'last minute of day');
}

// ── formatDate ────────────────────────────────────────────────

function testFormatDate() {
  _assertEqual(formatDate(new Date(2026, 2, 26)), '2026-03-26', 'YYYY-MM-DD format');
  _assertEqual(formatDate(new Date(2026, 0,  5)), '2026-01-05', 'zero-pads month and day');
  _assertEqual(formatDate(new Date(2026, 11, 31)), '2026-12-31', 'December');
}

// ── calcDuration ──────────────────────────────────────────────

function testCalcDuration() {
  var base = new Date(2026, 2, 26, 9, 0, 0);
  _assertEqual(calcDuration(base, new Date(2026, 2, 26, 17, 30, 0)), '8h 30m',  'standard workday');
  _assertEqual(calcDuration(base, new Date(2026, 2, 26,  9, 45, 0)), '0h 45m',  'sub-hour');
  _assertEqual(calcDuration(base, base),                              '0h 0m',   'zero duration');
  _assertEqual(calcDuration(base, new Date(2026, 2, 26,  9,  1, 0)), '0h 1m',   'one minute');
  _assertEqual(calcDuration(base, new Date(2026, 2, 26, 10,  0, 0)), '1h 0m',   'exactly one hour');
}

// ── parseTimeToday ────────────────────────────────────────────
// Critical: used by scanner checkout + autoCheckoutAll trigger.

function testParseTimeToday() {
  // Null / invalid input
  _assert(parseTimeToday(null)      === null, 'null → null');
  _assert(parseTimeToday('')        === null, 'empty string → null');
  _assert(parseTimeToday('garbage') === null, 'invalid string → null');

  // AM parsing
  var am = parseTimeToday('9:14 AM');
  _assert(am instanceof Date,       'valid AM string → Date');
  _assertEqual(am.getHours(),   9,  'AM hour correct');
  _assertEqual(am.getMinutes(), 14, 'AM minutes correct');

  // PM parsing
  var pm = parseTimeToday('1:30 PM');
  _assertEqual(pm.getHours(), 13, 'PM converts to 24h correctly');

  // Edge cases
  var midnight = parseTimeToday('12:00 AM');
  _assertEqual(midnight.getHours(), 0, '12:00 AM → hour 0');

  var noon = parseTimeToday('12:00 PM');
  _assertEqual(noon.getHours(), 12, '12:00 PM → hour 12');

  // GSheets Date serial (stored as Date relative to 1899-12-30)
  var sheetDate = new Date(1899, 11, 30, 14, 45, 0);
  var fromSheet = parseTimeToday(sheetDate);
  _assert(fromSheet instanceof Date,    'GSheets Date → Date');
  _assertEqual(fromSheet.getHours(),   14, 'GSheets Date hour correct');
  _assertEqual(fromSheet.getMinutes(), 45, 'GSheets Date minutes correct');
}

// ── generateID ────────────────────────────────────────────────

function testGenerateID() {
  var id = generateID('LOG');
  _assert(id.indexOf('LOG-') === 0, 'prefix applied');
  _assert(id.length > 5,            'has content after prefix');

  // Probabilistic uniqueness — 36^6 ≈ 2.18B space, 50 draws → negligible collision risk
  var seen = {};
  for (var i = 0; i < 50; i++) {
    var newId = generateID('T');
    _assert(!seen[newId], 'duplicate ID generated: ' + newId);
    seen[newId] = true;
  }
  Logger.log('   50 unique IDs generated without collision');
}

// ── HTML escaping (mirrors client-side esc() function) ────────
// Tests the logic that prevents XSS injection into innerHTML.

function _escServer(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function testEscapeHTML() {
  _assertEqual(
    _escServer('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    'neutralises script tag');

  _assertEqual(
    _escServer('"><img src=x onerror=alert(1)>'),
    '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
    'neutralises attribute injection');

  _assertEqual(
    _escServer("'; DROP TABLE logs; --"),
    '&#39;; DROP TABLE logs; --',
    'escapes single quote');

  _assertEqual(_escServer('Rahul Sharma'), 'Rahul Sharma', 'clean text unchanged');
  _assertEqual(_escServer('R&D'),          'R&amp;D',      'ampersand escaped');
  _assertEqual(_escServer(null),           '',             'null → empty string');
  _assertEqual(_escServer(undefined),      '',             'undefined → empty string');
  _assertEqual(_escServer(42),             '42',           'number → string');
}

// ── verifyPIN (integration — needs bootstrapped Config tab) ───

function testVerifyPIN() {
  var stored = getConfigValue('AdminPIN');
  if (!stored) {
    Logger.log('   SKIP: Config tab not set up — visit the web app URL once to trigger bootstrap, then re-run tests.');
    return;
  }

  var correct = verifyPIN(stored);
  _assert(correct.success === true,       'correct PIN → success:true');
  _assert(correct.pin === undefined,      'response never exposes the stored PIN');

  var wrong = verifyPIN('WRONG-000');
  _assert(wrong.success === false,        'wrong PIN → success:false');
  _assert(typeof wrong.success === 'boolean', 'success is boolean');
}

// ── getLogs filters (integration — needs Logs tab) ────────────

function testGetLogsFilters() {
  var all = getLogs({});
  _assert(all.success === true,           'no-filter call succeeds');
  _assert(Array.isArray(all.data),        'returns data array');
  _assert(typeof all.total === 'number',  'returns numeric total');
  _assertEqual(all.data.length, all.total, 'data.length matches total');

  var empOnly = getLogs({ type: 'EMP' });
  _assert(empOnly.data.every(function(r) { return r.Type === 'EMP'; }),
    'type:EMP filter excludes visitors');

  var visOnly = getLogs({ type: 'VIS' });
  _assert(visOnly.data.every(function(r) { return r.Type === 'VIS'; }),
    'type:VIS filter excludes employees');

  var allCount = getLogs({ type: 'ALL' });
  _assertEqual(allCount.total, all.total, 'type:ALL returns same as no filter');

  var none = getLogs({ name: '___NO_MATCH_XYZ_98765___' });
  _assertEqual(none.data.length, 0,       'unmatched name filter → empty array');

  var present = getLogs({ status: 'PRESENT' });
  _assert(present.data.every(function(r) { return r.Status === 'PRESENT'; }),
    'status:PRESENT filter correct');

  var partial = getLogs({ status: 'PARTIAL' });
  _assert(partial.data.every(function(r) { return r.Status === 'PARTIAL'; }),
    'status:PARTIAL filter correct');
}
