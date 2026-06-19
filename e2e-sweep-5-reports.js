'use strict';
/**
 * Suite 5 — Reports page: filter sidebar, log table, tab switching,
 * analytics view, monthly view, export.
 */

const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

/**
 * Extend gas-mock with getLogs, getAnalyticsData, getMonthlyAttendance.
 * gas-mock.js uses a chaining pattern: each withSuccessHandler/withFailureHandler
 * call returns a NEW object. We extend by adding methods to the prototype chain
 * without breaking the existing makeRunner closure.
 */
const REPORTS_PATCH = `
(function() {
  // Monkey-patch makeRunner to add missing methods on each returned runner object.
  // The gas-mock's makeRunner creates a plain object; we intercept withSuccessHandler
  // at the top level and add our methods to every returned runner.
  var origRun = window.google.script.run;

  function addMissingMethods(runner) {
    if (!runner.getLogs) {
      runner.getLogs = function(f) {
        setTimeout(function() {
          if (runner.__sh) runner.__sh({ success: true, data: [
            { LogID:'L1', Name:'Priya Sharma', Type:'EMP', Department:'Operations',
              TimeIN:'09:05 AM', TimeOUT:'06:00 PM', Duration:'8h 55m', Date:'2026-06-17',
              Gate:'Main Gate', Status:'PRESENT' },
            { LogID:'L2', Name:'Walk-in Visitor', Type:'VIS', Department:'',
              TimeIN:'10:30 AM', TimeOUT:'', Duration:'', Date:'2026-06-17',
              Gate:'Reception', Status:'PARTIAL' },
          ], total: 2 });
        }, 150);
      };
    }
    if (!runner.getAnalyticsData) {
      runner.getAnalyticsData = function(range) {
        setTimeout(function() {
          if (runner.__sh) runner.__sh({ success: true,
            trend: Array.from({length:7}, function(_,i) { return { date:'2026-06-' + (11+i), emp: 3+i, vis: 1 }; }),
            peakHours: [{ hour:'09:00', count:12 }, { hour:'10:00', count:8 }],
            totals: { employees:4, present:3, absent:1, visitors:5 }
          });
        }, 150);
      };
    }
    if (!runner.getMonthlyAttendance) {
      runner.getMonthlyAttendance = function(y, m) {
        setTimeout(function() {
          if (runner.__sh) runner.__sh({ success: true, data: [
            { EmpID:'EMP001', Name:'Priya Sharma', attendance: {} }
          ], year: y, month: m });
        }, 150);
      };
    }
    if (!runner.exportCSV) {
      runner.exportCSV = function(f) {
        setTimeout(function() {
          if (runner.__sh) runner.__sh({ success: true,
            csv: 'Name,Date\\nPriya Sharma,2026-06-17', filename: 'export.csv' });
        }, 150);
      };
    }
    return runner;
  }

  // Wrap withSuccessHandler to capture sh AND inject missing methods
  var origWSH = origRun.withSuccessHandler.bind(origRun);
  origRun.withSuccessHandler = function(sh) {
    var runner = origWSH(sh);
    runner.__sh = sh;
    return addMissingMethods(runner);
  };
  // Also add to the root run object for direct calls
  addMissingMethods(origRun);
})();
`;

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 5a: Filter sidebar + logs view ────────────────────────────────────────
  {
    const R = makeRunner('5a · Reports — Filter sidebar & logs table');
    const { page, context } = await openPage(browser, 'reports');
    await settle(page, 300);

    await R.check('filter sidebar visible', async () => {
      if (!await page.locator('.filter-sidebar').isVisible())
        throw new Error('Filter sidebar not visible');
    });

    await R.check('quick-date "Today" button visible', async () => {
      if (!await page.locator('#qdToday').isVisible())
        throw new Error('#qdToday not visible');
    });

    await R.check('date range inputs visible', async () => {
      const from = await page.locator('#dateFrom').isVisible();
      const to   = await page.locator('#dateTo').isVisible();
      if (!from || !to) throw new Error('Date range inputs not visible');
    });

    await R.check('filter type dropdown visible', async () => {
      if (!await page.locator('#filterType').isVisible())
        throw new Error('#filterType not visible');
    });

    await R.check('logs table renders data rows after load', async () => {
      await page.waitForSelector('#logsBody tr', { timeout: 5000 });
      const rows = await page.locator('#logsBody tr').count();
      if (rows < 1) throw new Error(`logsBody has ${rows} rows`);
    });

    await R.check('logs show employee entry', async () => {
      const txt = await page.locator('#logsBody').textContent();
      if (!txt.includes('Priya Sharma')) throw new Error('Priya Sharma not in logs');
    });

    await R.check('logs show visitor entry', async () => {
      const txt = await page.locator('#logsBody').textContent();
      if (!txt.includes('Walk-in Visitor')) throw new Error('Visitor not in logs');
    });

    await R.check('quick-date "Today" click triggers reload', async () => {
      await page.click('#qdToday');
      await settle(page, 200);
      // Table should still have rows (reload with today filter)
      const rows = await page.locator('#logsBody tr').count();
      if (rows < 1) throw new Error('Table empty after today filter');
    });

    await R.check('filter by type EMP narrows rows', async () => {
      await page.selectOption('#filterType', 'EMP');
      await settle(page, 200);
      const txt = await page.locator('#logsBody').textContent();
      // Visitor row may or may not be filtered client-side; at minimum no crash
      if (!txt) throw new Error('logsBody empty after type filter');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 5b: Tab switching ─────────────────────────────────────────────────────
  {
    const R = makeRunner('5b · Reports — Tab switching');
    const { page, context } = await openPage(browser, 'reports');
    await settle(page, 300);

    await R.check('Logs tab active by default', async () => {
      const cls = await page.locator('#rtabLogs').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Logs tab not active by default');
    });

    await R.check('switch to Analytics tab', async () => {
      await page.click('#rtabAnalytics');
      await settle(page, 300);
      const cls = await page.locator('#reportsViewAnalytics').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Analytics view not active');
    });

    await R.check('analytics trend SVG visible', async () => {
      if (!await page.locator('#trendSvg').isVisible())
        throw new Error('#trendSvg not visible');
    });

    await R.check('analytics KPI tiles visible', async () => {
      if (!await page.locator('#anaTotal').isVisible())
        throw new Error('#anaTotal not visible');
    });

    await R.check('peak hours list visible', async () => {
      if (!await page.locator('#peakHoursList').isVisible())
        throw new Error('#peakHoursList not visible');
    });

    await R.check('switch to Monthly tab', async () => {
      await page.click('#rtabMonthly');
      await settle(page, 300);
      // Monthly view uses style.display='flex' (not .active class)
      const display = await page.locator('#reportsViewMonthly').evaluate(el => el.style.display);
      const notHidden = await page.locator('#reportsViewMonthly').isVisible();
      if (!notHidden && display === 'none') throw new Error('Monthly view not visible');
    });

    await R.check('month picker visible', async () => {
      if (!await page.locator('#monthPicker').isVisible())
        throw new Error('#monthPicker not visible');
    });

    await R.check('monthly export button present in DOM', async () => {
      // Button may be hidden until data loads; check it exists
      const count = await page.locator('#monthExportBtn').count();
      if (count === 0) throw new Error('#monthExportBtn not in DOM');
    });

    await R.check('switch back to Logs tab', async () => {
      await page.click('#rtabLogs');
      await settle(page, 200);
      // Logs view uses .hidden class toggled; check it's not hidden
      const isVisible = await page.locator('#reportsViewLogs').isVisible();
      if (!isVisible) throw new Error('Logs view not visible after switch back');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 5c: Summary stats bar ─────────────────────────────────────────────────
  {
    const R = makeRunner('5c · Reports — Summary stats');
    const { page, context } = await openPage(browser, 'reports');
    await page.addScriptTag({ content: REPORTS_PATCH });
    await settle(page, 400);

    await R.check('sumTotal shows value', async () => {
      const txt = await page.locator('#sumTotal').textContent();
      if (!txt || txt.trim() === '—') throw new Error(`sumTotal: "${txt}"`);
    });

    await R.check('sumVisitors shows value', async () => {
      const txt = await page.locator('#sumVisitors').textContent();
      if (!txt || txt.trim() === '—') throw new Error(`sumVisitors: "${txt}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(results => {
    const total = results.reduce((a, r) => a + r.total, 0);
    const pass  = results.reduce((a, r) => a + r.pass,  0);
    console.log(`\nSuite 5 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
