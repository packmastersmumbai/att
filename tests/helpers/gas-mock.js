/**
 * Mock google.script.run bridge injected into pages during testing.
 * Each call chain (withSuccessHandler → withFailureHandler → method) creates
 * an isolated context so concurrent calls don't stomp each other's handlers.
 */
const GAS_MOCK_SCRIPT = `
(function() {
  window.__gasDelay = 150;

  var MOCK_EMPLOYEES = [
    { EmpID: 'EMP001', Name: 'Priya Sharma', Department: 'Operations', Phone: '+91 98765 00001', Status: 'ACTIVE', QRCode: 'EMP001', QRImageURL: '' },
    { EmpID: 'EMP002', Name: 'Rahul Mehta',  Department: 'Engineering', Phone: '+91 98765 00002', Status: 'INACTIVE', QRCode: 'EMP002', QRImageURL: '' },
    { EmpID: 'EMP003', Name: 'Anita Rao',    Department: 'HR',          Phone: '+91 98765 00003', Status: 'ACTIVE', QRCode: 'EMP003', QRImageURL: '' },
  ];

  var MOCK_BLACKLIST = [
    { QRCode: 'EMP-BLOCKED', PersonName: 'Bad Actor', Reason: 'Unauthorised Entry', AddedBy: 'Admin', AddedDate: '2026-01-15' }
  ];

  // National holidays start pre-selected — mirrors getHolidays() always
  // including the 3 gazetted dates even before the admin ticks anything.
  var MOCK_HOLIDAYS = ['2026-01-26', '2026-08-15', '2026-10-02'];

  var MOCK_DASHBOARD = {
    success: true,
    present: 3,
    absent: 1,
    activeVisitors: 2,
    totalEmployees: 4,
    recentActivity: [
      { Name: 'Priya Sharma', Type: 'EMP', Department: 'Operations', TimeIN: '09:05 AM', TimeOUT: '', Status: 'PARTIAL' },
      { Name: 'Rahul Mehta',  Type: 'EMP', Department: 'Engineering', TimeIN: '09:12 AM', TimeOUT: '05:30 PM', Status: 'PRESENT' },
      { Name: 'Visitor A',    Type: 'VIS', Department: '', TimeIN: '10:00 AM', TimeOUT: '', Status: 'PARTIAL' },
    ]
  };

  function makeRunner(sh, fh) {
    function respond(value) {
      setTimeout(function() { if (sh) sh(value); }, window.__gasDelay || 150);
    }
    return {
      withSuccessHandler: function(h) { return makeRunner(h, fh); },
      withFailureHandler: function(h) { return makeRunner(sh, h); },

      // Mirrors the real verifyPIN: a wrong PIN carries no error field (the
      // page supplies the wording), and a correct PIN mints the admin bearer
      // token that every mutating admin action must present.
      verifyPIN: function(pin) {
        respond(pin === '1234'
          ? { success: true, token: 'test-admin-token' }
          : { success: false });
      },

      validateUserPin: function(userId, pin) {
        var ok = (userId === 'u1' && pin === '1111') || (userId === 'u2' && pin === '2222');
        if (ok) respond({ success: true, user: { id: userId, name: userId === 'u1' ? 'Owner' : 'Khushi', role: userId === 'u1' ? 'Owner' : 'Admin' } });
        else    respond({ success: false, error: 'Incorrect PIN' });
      },

      getEmployees: function() {
        respond({ success: true, data: JSON.parse(JSON.stringify(MOCK_EMPLOYEES)) });
      },

      saveEmployee: function(emp) {
        MOCK_EMPLOYEES.push({ EmpID: emp.EmpID || 'EMP999', Name: emp.Name, Department: emp.Department || '', Phone: emp.Phone || '', Status: 'ACTIVE', QRCode: emp.EmpID || 'EMP999', QRImageURL: '' });
        respond({ success: true, empId: emp.EmpID || 'EMP999', qrCode: emp.EmpID || 'EMP999' });
      },

      deleteEmployee: function(empId) {
        var emp = MOCK_EMPLOYEES.find(function(e) { return e.EmpID === empId; });
        if (emp) emp.Status = 'INACTIVE';
        respond({ success: true, empId: empId });
      },

      setEmployeeStatus: function(empId, status) {
        var emp = MOCK_EMPLOYEES.find(function(e) { return e.EmpID === empId; });
        if (emp) emp.Status = status;
        respond({ success: true, empId: empId, status: status });
      },

      processQRScan: function(qrCode, gate) {
        var res;
        if (qrCode === 'EMP-BLOCKED') {
          res = { success: false, action: 'BLOCKED', name: 'Bad Actor', message: 'Bad Actor is on the blacklist' };
        } else if (qrCode === 'EMP001') {
          res = { success: true, action: 'CHECK_IN', name: 'Priya Sharma', empId: 'EMP001', type: 'EMP', department: 'Operations', time: '09:05 AM', gate: gate };
        } else if (qrCode === 'EMP002') {
          res = { success: true, action: 'CHECK_OUT', name: 'Rahul Mehta', empId: 'EMP002', type: 'EMP', time: '05:30 PM', duration: '8h 18m', gate: gate };
        } else if (qrCode === 'VIS001') {
          res = { success: true, action: 'CHECK_IN', name: 'Visitor One', type: 'VIS', time: '10:30 AM', gate: gate };
        } else {
          res = { success: false, action: 'UNKNOWN', message: 'QR code not recognised' };
        }
        respond(res);
      },

      getDashboardData: function() {
        respond(JSON.parse(JSON.stringify(MOCK_DASHBOARD)));
      },

      getBlacklist: function() {
        respond({ success: true, data: JSON.parse(JSON.stringify(MOCK_BLACKLIST)) });
      },

      // admin.html's post() shim maps action 'addBlacklist' -> r.addToBlacklist(...)
      // (client-side method name), while doPost's dispatch key is 'addBlacklist'
      // (server-side action name). Keep both mock keys as aliases of one impl
      // so either calling convention resolves.
      addToBlacklist: function(entry) {
        MOCK_BLACKLIST.push(Object.assign({ AddedBy: 'Admin', AddedDate: '2026-05-31' }, entry));
        respond({ success: true });
      },
      addBlacklist: function(entry) {
        MOCK_BLACKLIST.push(Object.assign({ AddedBy: 'Admin', AddedDate: '2026-05-31' }, entry));
        respond({ success: true });
      },

      removeFromBlacklist: function(qrCode) {
        var i = MOCK_BLACKLIST.findIndex(function(r) { return r.QRCode === qrCode; });
        if (i !== -1) MOCK_BLACKLIST.splice(i, 1);
        respond({ success: true });
      },
      removeBlacklist: function(qrCode) {
        var i = MOCK_BLACKLIST.findIndex(function(r) { return r.QRCode === qrCode; });
        if (i !== -1) MOCK_BLACKLIST.splice(i, 1);
        respond({ success: true });
      },

      getConfig: function() {
        respond({ success: true, data: [
          { Key: 'OrgName', Value: 'PackMasters' },
          { Key: 'AdminPIN', Value: '1234' },
          { Key: 'OwnerPhone', Value: '' },
          { Key: 'OwnerEmail', Value: '' },
          { Key: 'CallMeBotKey', Value: '' },
          { Key: 'SummaryHr', Value: '19' },
          { Key: 'AutoCheckoutHr', Value: '23' },
        ]});
      },

      saveConfig: function() { respond({ success: true }); },

      // India holidays (Phase 3): catalog is static 2026 dates; selection is
      // held in-memory for the duration of the test run, mirroring the
      // Config-sheet-backed real implementation.
      getHolidayCatalog: function() {
        respond({ success: true, catalog: [
          { date: '2026-01-26', name: 'Republic Day',        national: true },
          { date: '2026-08-15', name: 'Independence Day',    national: true },
          { date: '2026-10-02', name: 'Gandhi Jayanti',      national: true },
          { date: '2026-03-04', name: 'Holi',                national: false },
          { date: '2026-11-08', name: 'Diwali',              national: false }
        ]});
      },

      getHolidays: function() {
        respond({ success: true, dates: MOCK_HOLIDAYS.slice() });
      },

      saveHolidays: function(dates, token) {
        if (!token) { respond({ success: false, error: 'Unauthorized: admin sign-in required' }); return; }
        MOCK_HOLIDAYS = (dates || []).slice();
        respond({ success: true });
      },

      getAnalyticsData: function(range) {
        respond({ success: true,
          trend: Array.from({length: 7}, function(_, i) {
            return { date: '2026-06-' + (11 + i), emp: 3 + i, vis: 1 };
          }),
          peakHours: [{ hour: '09:00', count: 12 }, { hour: '10:00', count: 8 }],
          totals: { employees: 4, present: 3, absent: 1, visitors: 2 }
        });
      },

      getLogs: function(filters) {
        var rows = [
          { LogID: 'L1', Name: 'Priya Sharma', Type: 'EMP', Department: 'Operations',
            TimeIN: '09:05 AM', TimeOUT: '06:00 PM', Duration: '8h 55m',
            Date: '2026-06-17', Gate: 'Main Gate', Status: 'PRESENT' },
          { LogID: 'L2', Name: 'Walk-in Visitor', Type: 'VIS', Department: '',
            TimeIN: '10:30 AM', TimeOUT: '', Duration: '',
            Date: '2026-06-17', Gate: 'Reception', Status: 'PARTIAL' },
        ];
        // Honour the type filter reports.html sends via getFilters(), so
        // e2e tests can assert the filtered result instead of just "not empty".
        if (filters && filters.type && filters.type !== 'ALL') {
          rows = rows.filter(function(r) { return r.Type === filters.type; });
        }
        respond({ success: true, data: rows, total: rows.length });
      },

      getMonthlyAttendance: function(year, month) {
        respond({ success: true, data: [
          { EmpID: 'EMP001', Name: 'Priya Sharma', attendance: {} }
        ], year: year, month: month });
      },

      exportCSV: function(filters) {
        respond({ success: true,
          csv: 'Name,Date\\nPriya Sharma,2026-06-17',
          filename: 'export.csv'
        });
      },

      registerVisitor: function(v) {
        respond({ success: true, visitorId: 'VIS-E2E', qrCode: 'VIS-E2E-QR' });
      },

      checkoutVisitor: function(visitorId) {
        respond({ success: true, visitorId: visitorId });
      },

      // vreg.html's "returning visitor" fast path: known test number
      // (ending 9999) hits an existing pass, anything else misses.
      lookupVisitorByPhone: function(phone) {
        if (String(phone).replace(/\D/g, '').slice(-4) === '9999') {
          respond({ success: true, visitorId: 'VIS-20260710-TESTPASS0000001', returning: true });
        } else {
          respond({ success: false, error: 'No visitor found for this number. Please register.' });
        }
      },

      importGenderBloodGroup: function(token) {
        respond(token
          ? { success: true, updated: 0 }
          : { success: false, error: 'Unauthorized: admin sign-in required' });
      },

      processAndStoreScan: function(qrCode, gate, sid) { respond({ success: true }); },

      getPendingResult: function(sid) { respond({ success: true, result: null }); },

      // Shape mirrors reports.html's renderHours(): a tree of years -> months
      // -> per-employee rows, since the page reads res.years directly (not a
      // flat rows array).
      getHoursSummary: function(opts) {
        respond({
          success: true,
          generatedAt: '2026-07-10T09:00:00.000Z',
          years: [
            {
              year: 2026,
              totalHours: 304,
              totalManDays: 38,
              months: [
                {
                  month: 7,
                  label: 'July 2026',
                  totalHours: 304,
                  totalManDays: 38,
                  present: 38,
                  late: 1,
                  overtime: 4,
                  employees: [
                    { empId: 'EMP001', name: 'Owner', status: 'ACTIVE', daysWorked: 20, presentDays: 20, lateDays: 1, avgPerDay: 8, totalHours: 160, openSessions: 0, perfect: false },
                    { empId: 'EMP002', name: 'Khushi', status: 'ACTIVE', daysWorked: 18, presentDays: 18, lateDays: 0, avgPerDay: 8, totalHours: 144, openSessions: 0, perfect: true },
                  ],
                },
              ],
            },
          ],
        });
      },

      // Shape mirrors reports.html's loadHoursKpis() tile list.
      getHoursKpis: function(year, month) {
        respond({
          success: true,
          year: year,
          monthName: 'July',
          present: 38,
          absent: 2,
          late: 1,
          attendancePct: 95,
          stillIn: 0,
          totalHours: 304,
          avgHoursPerEmp: 8,
          overtimeHours: 4,
          avgCheckIn: '09:05 AM',
          missedOut: 0,
          perfectCount: 1,
          lateRate: 2.6,
          activeStaff: 2,
        });
      },

      rebuildHoursSummarySheet: function() { respond({ success: true }); },
    };
  }

  window.google = {
    script: {
      run: makeRunner(null, null)
    }
  };
})();
`;

module.exports = { GAS_MOCK_SCRIPT };
