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

      verifyPIN: function(pin) {
        respond(pin === '1234' ? { success: true } : { success: false, error: 'Wrong PIN' });
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

      addToBlacklist: function(entry) {
        MOCK_BLACKLIST.push(Object.assign({ AddedBy: 'Admin', AddedDate: '2026-05-31' }, entry));
        respond({ success: true });
      },

      removeFromBlacklist: function(qrCode) {
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
        respond({ success: true, data: [
          { LogID: 'L1', Name: 'Priya Sharma', Type: 'EMP', Department: 'Operations',
            TimeIN: '09:05 AM', TimeOUT: '06:00 PM', Duration: '8h 55m',
            Date: '2026-06-17', Gate: 'Main Gate', Status: 'PRESENT' },
          { LogID: 'L2', Name: 'Walk-in Visitor', Type: 'VIS', Department: '',
            TimeIN: '10:30 AM', TimeOUT: '', Duration: '',
            Date: '2026-06-17', Gate: 'Reception', Status: 'PARTIAL' },
        ], total: 2 });
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
