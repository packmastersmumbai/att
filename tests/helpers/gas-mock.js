/**
 * Mock google.script.run bridge injected into pages during testing.
 * Each call chain (withSuccessHandler → withFailureHandler → method) creates
 * an isolated context so concurrent calls don't stomp each other's handlers.
 */
const GAS_MOCK_SCRIPT = `
(function() {
  window.__gasDelay = 150;

  var MOCK_EMPLOYEES = [
    { EmpID: 'EMP001', Name: 'Priya Sharma', Department: 'Operations', JobRole: 'Packaging Operator', Phone: '+91 98765 00001', Status: 'ACTIVE', QRCode: 'EMP001', QRImageURL: '' },
    { EmpID: 'EMP002', Name: 'Rahul Mehta',  Department: 'Engineering', Phone: '+91 98765 00002', Status: 'INACTIVE', QRCode: 'EMP002', QRImageURL: '' },
    { EmpID: 'EMP003', Name: 'Anita Rao',    Department: 'HR',          Phone: '+91 98765 00003', Status: 'ACTIVE', QRCode: 'EMP003', QRImageURL: '' },
  ];

  var MOCK_BLACKLIST = [
    { QRCode: 'EMP-BLOCKED', PersonName: 'Bad Actor', Reason: 'Unauthorised Entry', AddedBy: 'Admin', AddedDate: '2026-01-15' }
  ];

  // Gatepass items keyed by visitorId, seeded fresh per page load.
  // VIS-OUT-OWING's scan result reports returnableOutstanding:2, so its
  // gatepass must actually hold two OUT_PENDING rows — a surface that renders
  // the warning from getGatepass (the kiosk) rather than from the scan result
  // sees nothing otherwise.
  var MOCK_GP = {
    'VIS-OUT-OWING': [
      { gatepassId: 'GP-OWING-1', direction: 'IN', materialCode: '', itemDesc: 'laptop',
        unit: '', qty: 1, returnable: true, status: 'OUT_PENDING', photoUrl: '',
        hostApproved: false, loggedAt: '2026-09-04T09:00:00.000Z', daysOut: 0 },
      { gatepassId: 'GP-OWING-2', direction: 'IN', materialCode: '', itemDesc: 'toolkit',
        unit: '', qty: 1, returnable: true, status: 'OUT_PENDING', photoUrl: '',
        hostApproved: false, loggedAt: '2026-09-04T09:00:00.000Z', daysOut: 0 }
    ]
  };

  // Mirrors src/holidays.js: saveHolidays stores only what the admin picked;
  // the 3 gazetted national dates are merged in on every getHolidays() read
  // (not stored), so they're always observed even before the admin ticks them.
  var NATIONAL_HOLIDAYS = ['2026-01-26', '2026-08-15', '2026-10-02'];
  var MOCK_HOLIDAYS = [];

  var MOCK_DASHBOARD = {
    success: true,
    present: 3,
    absent: 1,
    activeVisitors: 2,
    totalEmployees: 4,
    holiday: false,
    // recentActivity is TODAY's logs only. Visitor B checked in YESTERDAY and
    // never checked out, so they are still inside and counted in
    // activeVisitors: 2 — but they do not appear here. That asymmetry is real
    // (see getDashboardData in reports.js) and is what made the kiosk grid
    // disagree with its own KPI tile.
    recentActivity: [
      { Name: 'Priya Sharma', Type: 'EMP', Department: 'Operations', TimeIN: '09:05 AM', TimeOUT: '', Status: 'PARTIAL' },
      { Name: 'Rahul Mehta',  Type: 'EMP', Department: 'Engineering', TimeIN: '09:12 AM', TimeOUT: '05:30 PM', Status: 'PRESENT' },
      { Name: 'Visitor A',    Type: 'VIS', Department: '', TimeIN: '10:00 AM', TimeOUT: '', Status: 'PARTIAL', PersonID: 'VIS001' },
    ],
    activeVisitorList: [
      { VisitorID: 'VIS001', Name: 'Visitor A', TimeIN: '10:00 AM', Gate: 'Main Gate',
        Company: 'Alpha Traders', Host: 'Priya Sharma', overdue: false },
      { VisitorID: 'VIS-STAYOVER', Name: 'Visitor B', TimeIN: '04:20 PM', Gate: 'Main Gate',
        Company: 'Acme Ltd', Host: 'Rahul Mehta', overdue: true },
      // Deliberately shares a display name with Visitor A. Deduping on name
      // silently dropped this person; two people can have one name.
      { VisitorID: 'VIS-SAMENAME', Name: 'Visitor A', TimeIN: '02:15 PM', Gate: 'Side Gate',
        Company: 'Beta Corp', Host: 'Priya Sharma', overdue: false }
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

      // Training calendar. Deliberately mixes states so the grid renders every
      // one: a completed session, one due this month, one overdue, one future,
      // and a drill — otherwise a test can pass against a grid that only ever
      // draws green.
      getTrainingCalendar: function(year) {
        var y = String(year || '2026');
        var today = new Date();
        var iso = function(d) { return d.toISOString().slice(0, 10); };
        var thisMonth = iso(new Date(today.getFullYear(), today.getMonth(), 15));
        var past      = iso(new Date(today.getFullYear(), today.getMonth() - 2, 10));
        var future    = iso(new Date(today.getFullYear() + 1, 5, 20));
        respond({
          success: true, year: y, years: ['2025', '2026'],
          topics: [
            { TopicID: 'TRN-01', Title: 'SOP, Product Safety', Type: 'TRAIN',
              Agenda: 'Filling, Packing, Calibration|Standard Operating Procedure',
              Method: 'Classroom', DurationHrs: 3, ValidityMonths: 12, Active: 'YES' },
            { TopicID: 'TRN-05', Title: 'Electrical Safety', Type: 'TRAIN',
              Agenda: 'Electrical safety training|PPE Matrix compliance',
              Method: 'Classroom + demonstration', DurationHrs: 1, ValidityMonths: 12, Active: 'YES' },
            { TopicID: 'DRL-03', Title: 'Mock Drill — Fire Safety', Type: 'DRILL',
              Agenda: 'Alarm and evacuation|Assembly point roll call',
              Method: 'Drill', DurationHrs: 0.5, ValidityMonths: 12, Active: 'YES' }
          ],
          plan: [
            { planId: 'PLN-1', topicId: 'TRN-01', type: 'TRAIN', plannedDate: past,
              actualDate: past, status: 'DONE', trainer: 'Anuj Pathak', rating: '4' },
            { planId: 'PLN-2', topicId: 'TRN-05', type: 'TRAIN', plannedDate: past,
              actualDate: '', status: 'OVERDUE', trainer: '', rating: '' },
            { planId: 'PLN-3', topicId: 'TRN-05', type: 'TRAIN', plannedDate: thisMonth,
              actualDate: '', status: 'DUE', trainer: '', rating: '' },
            { planId: 'PLN-4', topicId: 'TRN-01', type: 'TRAIN', plannedDate: future,
              actualDate: '', status: 'PLANNED', trainer: '', rating: '' },
            { planId: 'PLN-5', topicId: 'DRL-03', type: 'DRILL', plannedDate: future,
              actualDate: '', status: 'PLANNED', trainer: '', rating: '' }
          ]
        });
      },

      // Attendance is kept per session so a save can be read back — a mock
      // that always returns a blank roster hides the double-count bug the
      // real rewrite-on-save exists to prevent.
      // A module: what the session teaches and how it is checked. Marked
      // unreviewed, because that is the state every generated module starts
      // in and the panel must say so.
      getTrainingModule: function(topicId) {
        if (!topicId) { respond({ success: false, error: 'Missing topic id' }); return; }
        respond({
          success: true,
          module: {
            topicId: topicId,
            objectives: ['State what an SOP is', 'Follow the SOP for your process'],
            sections: [
              { heading: 'What an SOP is', body: 'The agreed written way a task is done.' },
              { heading: 'Why it matters', body: 'The same steps every time.' }
            ],
            questions: [{ n:1, text:'What is an SOP?', options:['A method','A machine'], answer:0 }],
            passMark: 70, source: 'RECORD',
            sourceLabel: 'From the site training records',
            reviewed: false
          }
        });
      },

      // The test an attendee sits. No answer key — that is the whole point
      // of it being a separate endpoint from getTrainingModule.
      getModuleTest: function(topicId, lang) {
        if (!topicId) { respond({ success: false, error: 'Missing topic id' }); return; }
        var hi = String(lang || '') === 'hi';
        respond({
          success: true, topicId: topicId, lang: hi ? 'hi' : 'en',
          hasHindi: true, passMark: 70,
          objectives: [hi ? 'एसओपी क्या है यह बताना' : 'State what an SOP is'],
          sections: [{ heading: hi ? 'एसओपी क्या है' : 'What an SOP is',
                       body: hi ? 'लिखित सहमत तरीका।' : 'The agreed written way.' }],
          questions: [
            { n:1, text: hi ? 'एसओपी क्या है?' : 'What is an SOP?',
              options: hi ? ['लिखित तरीका','मशीन सेटिंग'] : ['A written method','A machine setting'] },
            { n:2, text: hi ? 'इसे कौन पढ़ता है?' : 'Who reads it?',
              options: hi ? ['जो काम करे','केवल सुपरवाइज़र'] : ['Whoever does the task','Only the supervisor'] }
          ]
        });
      },

      recordAssessment: function(entry) {
        if (!entry || !entry.empId) { respond({ success: false, error: 'Pick your name first' }); return; }
        if (!entry.planId) { respond({ success: false, error: 'Missing session' }); return; }
        window.__mockAssessments = (window.__mockAssessments || []).concat([entry]);
        var ans = entry.answers || [];
        var correct = ans.filter(function(a) { return a === 0; }).length;
        var total = 2;
        var score = Math.round(correct / total * 100);
        respond({ success: true, score: score, correct: correct, total: total,
                  passed: score >= 70, passMark: 70,
                  detail: [0,1].map(function(i) {
                    return { n: i+1, correct: ans[i] === 0, answer: 0, picked: ans[i] };
                  }),
                  attendanceRecorded: 'added',
                  levelNote: score >= 70
                    ? 'Recorded. Your supervisor confirms anything above this level.'
                    : 'Recorded. Speak to your supervisor about a refresher.' });
      },

      getSessionAssessments: function(planId) {
        var taken = (window.__mockAssessments || []).length;
        respond({
          success: true, planId: planId,
          roster: MOCK_EMPLOYEES.filter(function(e){ return e.Status === 'ACTIVE'; })
            .map(function(e, i) {
              return { empId: e.EmpID, name: e.Name, dept: e.Department,
                       taken: i === 0 && taken > 0, score: i === 0 && taken ? 100 : '',
                       passed: i === 0 && taken > 0, lang: 'en', confidence: 'c3',
                       attempts: i === 0 && taken ? 1 : 0 };
            }),
          kpis: { roster: 2, taken: taken ? 1 : 0, passed: taken ? 1 : 0,
                  participation: taken ? 50 : 0, passRate: taken ? 100 : 0,
                  avgScore: taken ? 100 : 0 }
        });
      },

      getSessionAttendance: function(planId) {
        var saved = (window.__mockAttendance || {})[planId] || {};
        respond({
          success: true, planId: planId, passMark: 70,
          session: { observations: '', photoURLs: [] },
          roster: MOCK_EMPLOYEES
            .filter(function(e) { return e.Status === 'ACTIVE'; })
            .map(function(e) {
              var m = saved[e.EmpID] || {};
              return { empId: e.EmpID, name: e.Name, dept: e.Department,
                       jobRole: '', present: !!m.present, score: m.score || '' };
            })
        });
      },

      saveSessionAttendance: function(planId, rows) {
        if (!planId) { respond({ success: false, error: 'Missing plan id' }); return; }
        window.__mockAttendance = window.__mockAttendance || {};
        var keep = {};
        (rows || []).forEach(function(r) {
          if (r && r.present) keep[r.empId] = { present: true, score: r.score };
        });
        window.__mockAttendance[planId] = keep;
        var present = Object.keys(keep);
        var scored = present.filter(function(k) { return keep[k].score !== '' && keep[k].score != null; });
        respond({ success: true, planId: planId, present: present.length,
                  scored: scored.length,
                  passed: scored.filter(function(k) { return Number(keep[k].score) >= 70; }).length });
      },

      addSessionPhoto: function(planId, dataUrl) {
        if (!dataUrl) { respond({ success: false, error: 'No image supplied' }); return; }
        respond({ success: true, url: 'https://example.test/photo.jpg', count: 1 });
      },

      seedTrainingYear: function(year, token) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        respond({ success: true, year: year, topicsAdded: 14, sessionsAdded: 36 });
      },

      saveTrainingSession: function(session) {
        if (!session || !session.planId) { respond({ success: false, error: 'Missing plan id' }); return; }
        respond({ success: true, planId: session.planId });
      },

      // Skill matrix. Every distinct cell state appears at least once —
      // meets, gap, never trained, expired, pending and NA — because a
      // matrix that only ever draws green is indistinguishable from one
      // that works. Priya meets everything; Anita carries the awkward cases.
      getSkillMatrix: function(group) {
        var g = String(group || '');
        var SKILLS = [
          { skillId: 'SKL-01', name: 'Filling',         nameHi: '', group: 'Packaging', minRequired: 'L2' },
          { skillId: 'SKL-12', name: 'PPE Compliance',  nameHi: '', group: 'Common',    minRequired: 'L2' },
          { skillId: 'SKL-16', name: 'Security Awareness', nameHi: '', group: 'Security', minRequired: 'L2' }
        ].filter(function(s) { return !g || s.group === g; });

        var CELLS = {
          EMP001: {
            'SKL-01': { level: 'L3', source: 'OVERRIDE', flag: '', min: 'L2', gap: false,
                        by: 'Anuj Pathak', reason: 'Assessed on line 2', at: '2026-08-01' },
            'SKL-12': { level: 'L2', source: 'COMPUTED', flag: 'PENDING', min: 'L2', gap: false,
                        lastTrained: '2026-08-10', lastScore: 82 },
            'SKL-16': { level: 'NA', source: 'NA', flag: '', min: 'NA', gap: false }
          },
          EMP003: {
            // Attended, not assessed -> L1, which is below the L2 minimum.
            'SKL-01': { level: 'L1', source: 'COMPUTED', flag: 'PENDING', min: 'L2', gap: true,
                        lastTrained: '2026-07-02', lastScore: '' },
            // Trained too long ago: dropped a level and flagged.
            'SKL-12': { level: 'L1', source: 'COMPUTED', flag: 'EXPIRED', min: 'L2', gap: true,
                        lastTrained: '2024-01-15', lastScore: 90 },
            // Never trained is a BLANK level, not L1 — the distinction the
            // printed matrix exists to make.
            'SKL-16': { level: '', source: 'NONE', flag: 'NEVER_TRAINED', min: 'L2', gap: true }
          }
        };

        var people = MOCK_EMPLOYEES
          .filter(function(e) { return e.Status === 'ACTIVE'; })
          .map(function(e) {
            var cells = SKILLS.map(function(s) {
              var c = (CELLS[e.EmpID] || {})[s.skillId];
              return c ? JSON.parse(JSON.stringify(c))
                       : { skillId: s.skillId, level: '', source: 'NONE',
                           flag: 'NEVER_TRAINED', min: s.minRequired, gap: true };
            });
            cells.forEach(function(c, i) { c.skillId = SKILLS[i].skillId; });
            var gaps = cells.filter(function(c) { return c.level !== 'NA' && c.gap; }).length;
            return { empId: e.EmpID, name: e.Name, dept: e.Department, jobRole: '',
                     photoUrl: '', cells: cells, gaps: gaps,
                     overall: gaps === 0 ? 'MEETS' : (gaps + ' GAP' + (gaps === 1 ? '' : 'S')) };
          });

        var required = 0, met = 0, gaps = 0, never = 0, expired = 0, pending = 0;
        people.forEach(function(p) { p.cells.forEach(function(c) {
          if (c.level === 'NA') return;
          required++; if (c.gap) gaps++; else met++;
          if (c.flag === 'NEVER_TRAINED') never++;
          if (c.flag === 'EXPIRED') expired++;
          if (c.flag === 'PENDING') pending++;
        }); });

        respond({
          success: true, group: g, groups: ['Common', 'Packaging', 'Security'],
          skills: SKILLS, people: people, passMark: 70,
          levelNames: { L1: 'Beginner', L2: 'Under supervision',
                        L3: 'Independent', L4: 'Can train others' },
          // No per-role minimums set, so the matrix must mark itself a draft.
          minSource: window.__mockMinSource || 'DEFAULT',
          kpis: { people: people.length, required: required,
                  coverage: required ? Math.round(met / required * 100) : 0,
                  gaps: gaps, never: never, expired: expired, pending: pending },
          nextReview: '2026-09-30'
        });
      },

      getSkillHistory: function(empId, skillId) {
        if (!empId || !skillId) { respond({ success: false, error: 'Missing employee or skill' }); return; }
        respond({
          success: true, empId: empId, skillId: skillId,
          skillName: 'Filling', minRequired: 'L2', passMark: 70,
          levelNames: { L1: 'Beginner', L2: 'Under supervision',
                        L3: 'Independent', L4: 'Can train others' },
          // One attended and one missed, so the panel has to distinguish
          // "scored nothing" from "was not there".
          sessions: [
            { planId: 'PLN-1', topicId: 'TRN-01', title: 'SOP, Product Safety',
              date: '2026-07-02', trainer: 'Anuj Pathak', present: true, score: '' },
            { planId: 'PLN-0', topicId: 'TRN-04', title: 'SSOP, Best Practices',
              date: '2026-03-11', trainer: 'Anuj Pathak', present: false, score: '' }
          ],
          override: null
        });
      },

      setSkillLevel: function(entry, token) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        if (!entry || !entry.empId || !entry.skillId) { respond({ success: false, error: 'Missing employee or skill' }); return; }
        if (entry.level && !String(entry.reason || '').trim()) {
          respond({ success: false, error: 'Give a reason for the level' }); return;
        }
        window.__mockLevels = window.__mockLevels || [];
        window.__mockLevels.push(entry);
        respond({ success: true, empId: entry.empId, skillId: entry.skillId,
                  level: entry.level || '', cleared: !entry.level });
      },

      seedSkills: function(token) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        respond({ success: true, skillsAdded: 19, total: 19 });
      },

      // ── Mock drills ──────────────────────────────────────────────────
      // The register deliberately mixes a conducted drill that met its
      // target, one that ran over, and one still planned — a register where
      // every row reads SATISFACTORY tests nothing.
      getDrillRegister: function(year) {
        var y = String(year || '2026');
        respond({
          success: true, year: y, years: ['2025', '2026'],
          docControl: { owner: 'Balkrishna Mishra', approver: 'Balkrishna Mishra',
                        approvedOn: '2023-04-01', version: '1.0', nextReview: '2027-04-01' },
          drills: [
            { planId: 'PLN-D1', topicId: 'DRL-01', name: 'First Aid', type: 'FIRST AID',
              plannedDate: y + '-02-04', actualDate: y + '-02-04', status: 'DONE',
              targetMinutes: 40, responseMinutes: 35, score: 100, outcome: 'SATISFACTORY',
              conducted: true, photos: 2, videos: 1, openActions: 0 },
            // Over its target AND a step missed: the two ways a drill fails.
            { planId: 'PLN-D2', topicId: 'DRL-04', name: 'Spill Control', type: 'SPILL CONTROL',
              plannedDate: y + '-11-24', actualDate: y + '-11-24', status: 'DONE',
              targetMinutes: 20, responseMinutes: 28, score: 90, outcome: 'NEEDS IMPROVEMENT',
              conducted: true, photos: 1, videos: 0, openActions: 2 },
            { planId: 'PLN-D3', topicId: 'DRL-03', name: 'Fire Safety', type: 'FIRE SAFETY',
              plannedDate: y + '-08-10', actualDate: '', status: 'OVERDUE',
              targetMinutes: 30, responseMinutes: '', score: '', outcome: '',
              conducted: false, photos: 0, videos: 0, openActions: 0 }
          ],
          kpis: { planned: 3, conducted: 2, overdue: 1, onTimePct: 50,
                  avgScore: 95, openActions: 2 }
        });
      },

      getDrillProcedures: function() {
        respond({
          success: true,
          roles: [
            { key: 'SiteInCharge', label: 'Site In-charge', note: 'Overall control of the emergency scenario' },
            { key: 'SecurityLead', label: 'Security', note: 'To ensure smooth evacuation' },
            { key: 'FireFighter',  label: 'Fire fighter', note: 'Fire fighter responded on time' },
            { key: 'FirstAider',   label: 'First Aider', note: '' }
          ],
          procedures: [
            { drillId: 'MD-FIRE', topicId: 'DRL-03', name: 'Fire Safety', nameHi: '',
              type: 'FIRE SAFETY', scenario: 'A FIRE scenario is created outside the premises.',
              location: 'Outside Gate', targetMinutes: 30,
              steps: ['Raise the alarm', 'Evacuate to the assembly point', 'Head count',
                      'Deploy the extinguisher'],
              stepsHi: [], equipment: ['ABC fire extinguisher', 'Fire hydrant system'] },
            { drillId: 'MD-SPILL', topicId: 'DRL-04', name: 'Spill Control', nameHi: '',
              type: 'SPILL CONTROL', scenario: 'A jerry can is spilled onto the floor.',
              location: 'Loading Bay', targetMinutes: 20,
              steps: ['Stop the source', 'Cordon the area', 'Consult the MSDS',
                      'Deploy the spill kit'],
              stepsHi: [], equipment: ['Spill kit', 'Absorbent pads'] }
          ]
        });
      },

      getDrillReport: function(planId) {
        var saved = (window.__mockDrillReports || {})[planId];
        var proc = { drillId: 'MD-SPILL', topicId: 'DRL-04', name: 'Spill Control',
          type: 'SPILL CONTROL', scenario: 'A jerry can is spilled onto the floor.',
          location: 'Loading Bay', targetMinutes: 20,
          steps: ['Stop the source', 'Cordon the area', 'Consult the MSDS', 'Deploy the spill kit'],
          stepsHi: [], equipment: ['Spill kit', 'Absorbent pads'] };
        respond({
          success: true, planId: planId,
          roles: [
            { key: 'SiteInCharge', label: 'Site In-charge', note: 'Overall control of the emergency scenario' },
            { key: 'SecurityLead', label: 'Security', note: 'To ensure smooth evacuation' },
            { key: 'FireFighter',  label: 'Fire fighter', note: 'Fire fighter responded on time' },
            { key: 'FirstAider',   label: 'First Aider', note: '' }
          ],
          procedure: proc,
          plannedDate: '2026-11-24', actualDate: '',
          conducted: !!saved,
          report: saved || {
            drillId: 'MD-SPILL', drillDate: '2026-11-24', type: 'SPILL CONTROL',
            location: 'Loading Bay', reportedBy: '', startTime: '', endTime: '',
            responseMinutes: '',
            team: { SiteInCharge: '', SecurityLead: '', FireFighter: '', FirstAider: '' },
            scenario: proc.scenario, observations: '',
            stepResults: proc.steps.map(function(s, i) {
              return { step: i + 1, text: s, done: false, remark: '' };
            }),
            recommendations: [], minutes: '', photoURLs: [], videoURLs: [],
            score: '', outcome: '', conductedBy: ''
          }
        });
      },

      // Mirrors the server's validation, so a test cannot pass against a mock
      // that accepts what production would reject.
      saveDrillReport: function(report, token) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        function mins(a, b) {
          function m(t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
          return m(b) - m(a);
        }
        if (!report || !report.planId) { respond({ success: false, error: 'Missing plan id' }); return; }
        if (!report.drillDate) { respond({ success: false, error: 'Give the date the drill was run' }); return; }
        if (!/^\\d\\d:\\d\\d$/.test(report.startTime || '') || !/^\\d\\d:\\d\\d$/.test(report.endTime || '')) {
          respond({ success: false, error: 'Give the start and end time as HH:MM' }); return;
        }
        if (mins(report.startTime, report.endTime) <= 0) {
          respond({ success: false, error: 'The drill must end after it starts' }); return;
        }
        if (!(report.team || {}).SiteInCharge) {
          respond({ success: false, error: 'Name the site in-charge' }); return;
        }
        var steps = report.stepResults || [];
        var unexplained = steps.filter(function(s) { return s && !s.done && !s.remark; });
        if (unexplained.length) {
          respond({ success: false, error: 'Say why step ' + unexplained[0].step + ' was not completed' });
          return;
        }
        window.__mockDrillReports = window.__mockDrillReports || {};
        window.__mockDrillReports[report.planId] = report;
        window.__mockSavedDrill = report;
        var done = steps.filter(function(s) { return s.done; }).length;
        var score = steps.length ? Math.round(done / steps.length * 100) : '';
        var m = mins(report.startTime, report.endTime);
        var late = m > 20;
        respond({ success: true, planId: report.planId, score: score, responseMinutes: m,
                  outcome: score === 100 ? (late ? 'OVER TIME' : 'SATISFACTORY')
                         : score >= 80 ? 'NEEDS IMPROVEMENT' : 'UNSATISFACTORY' });
      },

      addDrillMedia: function(planId, dataUrl, kind) {
        if (!dataUrl) { respond({ success: false, error: 'No file supplied' }); return; }
        window.__mockDrillMedia = (window.__mockDrillMedia || []).concat([{ planId: planId, kind: kind }]);
        respond({ success: true, kind: kind, count: 1,
                  url: 'https://example.test/' + kind + '.' + (kind === 'video' ? 'mp4' : 'jpg') });
      },

      seedDrillProcedures: function(token) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        respond({ success: true, proceduresAdded: 4, total: 4 });
      },

      setupTraining: function(token, years) {
        if (token !== 'test-admin-token') { respond({ success: false, error: 'Admin PIN required' }); return; }
        window.__mockSetup = (window.__mockSetup || 0) + 1;
        respond({
          success: true, skillsAdded: 19, topicsAdded: 14, sessionsAdded: 108,
          proceduresAdded: 4, drillReportsAdded: 4,
          attendanceRows: 43, attendanceSessions: 7,
          // Six of the fourteen names in the 2025 records match no employee.
          // The setup must SAY so rather than quietly crediting nobody.
          unmatchedAttendees: ['ASHOK PATOLE', 'ATUL WAGHMARE', 'AVINASH VASANT',
                               'KRIPASANKAR', 'RAJNI', 'RIDDHI MESTRY',
                               'SATENDRA YADAV', 'TARUN MISHRA'],
          years: [{ year: 2025, sessionsAdded: 36 }, { year: 2026, sessionsAdded: 36 },
                  { year: 2027, sessionsAdded: 36 }]
        });
      },

      getEmployees: function() {
        respond({ success: true, data: JSON.parse(JSON.stringify(MOCK_EMPLOYEES)) });
      },

      saveEmployee: function(emp) {
        // Captured so a test can assert what the form actually sent — a field
        // dropped on the way out looks identical to one that saved fine.
        window.__mockSavedEmp = emp;
        var id = emp.EmpID || 'EMP999';
        // Update in place when the id already exists. The real saveEmployee
        // updates an existing row and only creates a new one for an unknown
        // id; an append-always mock produces two rows with one EmpID, which
        // breaks every later lookup by id rather than the save under test.
        var existing = MOCK_EMPLOYEES.find(function(e) { return e.EmpID === id; });
        if (existing) {
          ['Name','Department','JobRole','Phone','Email','Gender','BloodGroup','PhotoURL']
            .forEach(function(k) { if (emp[k] !== undefined) existing[k] = emp[k]; });
        } else {
          MOCK_EMPLOYEES.push({ EmpID: id, Name: emp.Name, Department: emp.Department || '',
            JobRole: emp.JobRole || '', Phone: emp.Phone || '', Status: 'ACTIVE',
            QRCode: id, QRImageURL: '' });
        }
        respond({ success: true, empId: id, qrCode: id });
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
          // empId carries the VisitorID for a VIS scan — the scanner's inline
          // gatepass card keys off it.
          res = { success: true, action: 'CHECK_IN', name: 'Visitor One', empId: 'VIS001', type: 'VIS', time: '10:30 AM', gate: gate };
        } else if (qrCode === 'VIS-OUT-CLEAN') {
          res = { success: true, action: 'CHECK_OUT', name: 'Clean Exit', empId: 'VIS-OUT-CLEAN', type: 'VIS',
                  time: '05:00 PM', duration: '6h 30m', gate: gate, returnableOutstanding: 0 };
        } else if (qrCode === 'VIS-OUT-OWING') {
          // Visitor leaving while still holding returnable items.
          res = { success: true, action: 'CHECK_OUT', name: 'Owing Exit', empId: 'VIS-OUT-OWING', type: 'VIS',
                  time: '05:00 PM', duration: '6h 30m', gate: gate, returnableOutstanding: 2 };
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
          // Training & competency. PassMark is set; LevelNames and MinRequired
          // are absent, so the page must show the in-force fallback for one
          // and an honest blank for the other.
          { Key: 'PassMark', Value: '65' },
        ]});
      },

      // Captures the payload so a test can assert what was actually sent —
      // a save that silently drops a field looks identical to one that works.
      saveConfig: function(config) {
        window.__mockSavedConfig = config;
        respond({ success: true });
      },

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
        var all = NATIONAL_HOLIDAYS.concat(MOCK_HOLIDAYS);
        var uniq = all.filter(function(d, i) { return all.indexOf(d) === i; });
        respond({ success: true, dates: uniq });
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

      // The kiosk person modal calls this for an EMPLOYEE card. Its absence
      // made that path throw, so the modal kept whatever was rendered before —
      // which looked like a product bug when it was a missing mock.
      getEmployeeMonth: function(empId) {
        respond({
          success: true, month: '2026-09', presentDays: 18, lateDays: 2,
          inToday: true, outToday: false,
          rows: [
            { day: '01', weekday: 'Mon', timeIn: '09:05 AM', timeOut: '05:30 PM', lateMins: 0 },
            { day: '02', weekday: 'Tue', timeIn: '09:42 AM', timeOut: '06:10 PM', lateMins: 12 }
          ]
        });
      },

      checkoutVisitor: function(visitorId) {
        respond({ success: true, visitorId: visitorId, returnableOutstanding: 0 });
      },

      getVisitorDetail: function(visitorId) {
        respond({ success: true, visitorId: visitorId, name: 'Test Visitor',
          phone: '9876543210', company: 'TestCorp', hostName: 'Host', purpose: 'Meeting',
          vehicle: '', idType: '', visitorType: 'Guest', safetyAckAt: '',
          blacklisted: false, status: 'IN', visits: [], visitCount: 0 });
      },

      // ── Gatepass mocks ──
      getMaterialList: function() {
        respond({ success: true, materials: [
          { code: 'RM-001', desc: 'HDPE Granules', unit: 'KG' },
          { code: 'PK-020', desc: 'Carton Box 12x8', unit: 'NOS' }
        ]});
      },
      getGatepass: function(vid) {
        var items = MOCK_GP[vid] || [];
        respond({ success: true, items: items,
          returnableOutstanding: items.filter(function(i){ return i.status === 'OUT_PENDING'; }).length });
      },
      addGatepassItem: function(vid, item) {
        MOCK_GP[vid] = MOCK_GP[vid] || [];
        MOCK_GP[vid].push({ gatepassId: 'GP-TEST-' + MOCK_GP[vid].length,
          direction: item.direction, materialCode: item.materialCode || '', itemDesc: item.itemDesc,
          unit: item.unit || '', qty: item.qty, returnable: !!item.returnable,
          status: (item.direction === 'IN' && item.returnable) ? 'OUT_PENDING' : 'LEFT',
          photoUrl: '', hostApproved: false });
        respond({ success: true, gatepassId: 'GP-TEST' });
      },
      settleGatepassAtCheckout: function(vid, decisions) {
        var kept = [], returned = 0;
        (decisions || []).forEach(function(d) {
          (MOCK_GP[vid] || []).forEach(function(i) {
            if (i.gatepassId !== d.gatepassId || i.status !== 'OUT_PENDING') return;
            if (d.decision === 'KEPT') {
              // Deliberately still OUT_PENDING — it is owed back.
              i.note = 'Kept at check-out: ' + (d.reason || '');
              kept.push({ gatepassId: i.gatepassId, itemDesc: i.itemDesc, qty: i.qty, reason: d.reason || '' });
            } else {
              i.status = 'RETURNED';
              returned++;
            }
          });
        });
        respond({ success: true, returned: returned, kept: kept });
      },
      notifyHostItemsKept: function(vid, kept) {
        respond({ success: true, notified: (kept || []).length });
      },
      markItemReturned: function(id) {
        Object.keys(MOCK_GP).forEach(function(k){ (MOCK_GP[k]||[]).forEach(function(i){ if(i.gatepassId===id) i.status='RETURNED'; }); });
        respond({ success: true });
      },
      voidGatepassItem: function(id) {
        Object.keys(MOCK_GP).forEach(function(k){ (MOCK_GP[k]||[]).forEach(function(i){ if(i.gatepassId===id) i.status='VOID'; }); });
        respond({ success: true });
      },
      notifyHostForApproval: function() { respond({ success: true }); },

      // Outstanding-returnables register (Reports → Gatepass tab). Mirrors the
      // server shape: joined visitor/host names, daysOut, approval flag.
      getOutstandingGatepass: function() {
        var items = [];
        Object.keys(MOCK_GP).forEach(function(vid) {
          (MOCK_GP[vid] || []).forEach(function(i) {
            if (i.status !== 'OUT_PENDING') return;
            items.push({ gatepassId: i.gatepassId, visitorId: vid, visitorName: 'Visitor ' + vid,
              company: 'ACME', phone: '900', hostName: 'Host One', itemDesc: i.itemDesc,
              materialCode: i.materialCode || '', unit: i.unit || '', qty: i.qty, photoUrl: '',
              hostApproved: !!i.hostApproved, loggedAt: '2026-09-01T09:00:00.000Z', daysOut: 2 });
          });
        });
        // Seed one row so the tab has content even before any add.
        if (!items.length) {
          items.push({ gatepassId: 'GP-SEED-1', visitorId: 'VIS-SEED', visitorName: 'Seed Visitor',
            company: 'Bolt Ltd', phone: '901', hostName: 'Host Two', itemDesc: 'Calibration Jig',
            materialCode: 'TL-007', unit: 'NOS', qty: 1, photoUrl: '', hostApproved: false,
            loggedAt: '2026-08-30T09:00:00.000Z', daysOut: 4 });
        }
        respond({ success: true, items: items, count: items.length });
      },
      getGatepassKpis: function() {
        respond({ success: true, outstanding: 1, overdue: 1, unapproved: 1 });
      },
      approveGatepass: function() { respond({ success: true, approved: 1 }); },

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
        // renderHours() default-expands the CURRENT year+month, so a fixture
        // pinned to a fixed month renders collapsed once that month passes and
        // the "shows summary rows" check fails with no app defect. Track the
        // clock instead of hardcoding a date.
        var _now = new Date();
        var _y = _now.getFullYear(), _m = _now.getMonth() + 1;
        var _MN = ['January','February','March','April','May','June','July',
                   'August','September','October','November','December'];
        respond({
          success: true,
          generatedAt: '2026-07-10T09:00:00.000Z',
          years: [
            {
              year: _y,
              totalHours: 304,
              totalManDays: 38,
              months: [
                {
                  month: _m,
                  label: _MN[_m - 1] + ' ' + _y,
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
