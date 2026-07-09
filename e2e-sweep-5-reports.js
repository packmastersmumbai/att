'use strict';
/**
 * Suite 5 — Reports page: filter sidebar, log table, tab switching,
 * analytics view, monthly view, export.
 */

const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

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

    await R.check('quick-date "Today" click sets both date inputs to today', async () => {
      await page.click('#qdToday');
      await settle(page, 200);
      // quickDate('today', …) sets #dateFrom/#dateTo to today's ISO date (reports.html
      // clearFilters/quickDate logic); assert the inputs actually reflect that, not
      // just that the table has rows (which is true regardless of the filter).
      const today = new Date().toISOString().split('T')[0];
      const from = await page.locator('#dateFrom').inputValue();
      const to   = await page.locator('#dateTo').inputValue();
      if (from !== today || to !== today)
        throw new Error(`Expected both dates to be ${today}, got from=${from} to=${to}`);
    });

    await R.check('filter by type EMP narrows rows to employees only', async () => {
      await page.selectOption('#filterType', 'EMP');
      await page.click('.fs-apply');
      await settle(page, 300);
      // getLogs() is called with filters.type='EMP'; gas-mock's getLogs now honours
      // this, so the Visitor row must disappear and only the Employee row remains.
      const txt = await page.locator('#logsBody').textContent();
      if (txt.includes('Walk-in Visitor'))
        throw new Error('Visitor row still present after filtering to type=EMP');
      if (!txt.includes('Priya Sharma'))
        throw new Error('Employee row missing after filtering to type=EMP');
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

    await R.check('switch to Hours tab', async () => {
      await page.click('#rtabHours');
      await settle(page, 300);
      const cls = await page.locator('#rtabHours').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Hours tab not active');
    });

    await R.check('Hours tab shows summary rows', async () => {
      // renderHours() writes the year/month/employee tree into #hsDetail;
      // the current year+month are auto-expanded on load, so the innermost
      // employee table should already be present.
      await page.waitForSelector('#hsDetail table tr', { timeout: 5000 });
      const rows = await page.locator('#hsDetail table tr').count();
      if (rows < 1) throw new Error('no hours rows rendered');
    });

    await R.check('Hours KPI snapshot renders', async () => {
      const txt = await page.locator('#hsKpiBlock').textContent();
      if (!txt.includes('KPI Snapshot')) throw new Error('KPI snapshot not rendered');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 5c: Summary stats bar ─────────────────────────────────────────────────
  {
    const R = makeRunner('5c · Reports — Summary stats');
    const { page, context } = await openPage(browser, 'reports');
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
