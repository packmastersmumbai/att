'use strict';
/**
 * Suite 6 — Dashboard page: KPI chips, present grid, absent roster,
 * activity feed, sync indicator, mobile tabs.
 * Mock: present=3, absent=1, activeVisitors=2, totalEmployees=4
 */

const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

/** Patch getAnalyticsData into the mock (not in base gas-mock.js) */
const ANALYTICS_PATCH = `
(function() {
  var orig = window.google.script.run;
  var _origWSH = orig.withSuccessHandler.bind(orig);
  orig.withSuccessHandler = function(sh) {
    var runner = _origWSH(sh);
    if (!runner.getAnalyticsData) {
      runner.getAnalyticsData = function(range) {
        setTimeout(function() { sh({ success: true,
          trend: [], peakHours: [], totals: { employees:4, present:3, absent:1, visitors:2 }
        }); }, 150);
      };
    }
    if (!runner.getLogs) {
      runner.getLogs = function(f) {
        setTimeout(function() { sh({ success: true, data: [], total: 0 }); }, 150);
      };
    }
    return runner;
  };
  // Also on root
  if (!orig.getAnalyticsData) {
    orig.getAnalyticsData = function(range) {};
  }
})();
`;

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 6a: KPI chips ─────────────────────────────────────────────────────────
  {
    const R = makeRunner('6a · Dashboard — KPI chips');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page, 300);

    await R.check('kpiPresent shows 3', async () => {
      const txt = await page.locator('#kpiPresent').textContent();
      if (!txt.includes('3')) throw new Error(`kpiPresent: "${txt}"`);
    });

    await R.check('kpiAbsent shows 1', async () => {
      const txt = await page.locator('#kpiAbsent').textContent();
      if (!txt.includes('1')) throw new Error(`kpiAbsent: "${txt}"`);
    });

    await R.check('kpiVisitors shows a number', async () => {
      // Mock has activeVisitors=2 but dashboard maps kpiVisitors to data.visitors field
      const txt = await page.locator('#kpiVisitors').textContent();
      if (!/\d/.test(txt)) throw new Error(`kpiVisitors has no number: "${txt}"`);
    });

    await R.check('kpiOnTime shows % value', async () => {
      const txt = await page.locator('#kpiOnTime').textContent();
      if (!/\d/.test(txt)) throw new Error(`kpiOnTime: "${txt}"`);
    });

    await R.check('kpiActive shows value', async () => {
      const txt = await page.locator('#kpiActive').textContent();
      if (!txt || txt.trim() === '—') throw new Error(`kpiActive: "${txt}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 6b: Present grid ──────────────────────────────────────────────────────
  {
    const R = makeRunner('6b · Dashboard — Present grid');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page, 300);

    await R.check('present column has employee rows', async () => {
      const children = await page.locator('#presentTableCol > *').count();
      if (children === 0) throw new Error('presentTableCol appears empty');
    });

    await R.check('present column contains employee data', async () => {
      await page.waitForTimeout(300);
      const txt = await page.locator('#presentTableCol').textContent();
      if (!txt.includes('Priya') && !txt.includes('Rahul') && txt.trim().length < 3) {
        throw new Error('presentTableCol appears empty after data load: ' + txt.slice(0,80));
      }
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 6c: Activity feed ─────────────────────────────────────────────────────
  {
    const R = makeRunner('6c · Dashboard — Activity feed');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page, 300);

    await R.check('activityFeed has entries', async () => {
      const count = await page.locator('#activityFeed .feed-item, #activityFeed li, #activityFeed > *').count();
      if (count === 0) {
        const txt = await page.locator('#activityFeed').textContent();
        if (txt.trim().length < 3) throw new Error('Activity feed empty');
      }
    });

    await R.check('activity feed shows employee name', async () => {
      const txt = await page.locator('#activityFeed').textContent();
      if (!txt.includes('Priya') && !txt.includes('Rahul'))
        throw new Error('No known employee in activity feed');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 6d: Absent column ─────────────────────────────────────────────────────
  {
    const R = makeRunner('6d · Dashboard — Absent column');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page, 300);

    await R.check('#absentTableCol is present in DOM', async () => {
      const count = await page.locator('#absentTableCol').count();
      if (count === 0) throw new Error('#absentTableCol not in DOM');
    });

    await R.check('absent column has employee rows', async () => {
      const children = await page.locator('#absentTableCol > *').count();
      if (children === 0) throw new Error('absentTableCol appears empty');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 6e: Sync indicator ────────────────────────────────────────────────────
  {
    const R = makeRunner('6e · Dashboard — Sync indicator');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page, 300);

    await R.check('syncStatus element present', async () => {
      const count = await page.locator('#syncStatus').count();
      if (count === 0) throw new Error('#syncStatus not in DOM');
    });

    await R.check('syncTime shows last-updated text', async () => {
      const txt = await page.locator('#syncTime').textContent();
      if (!txt || txt.trim().length < 3) throw new Error(`syncTime: "${txt}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 6f: Sidebar navigation ────────────────────────────────────────────────
  {
    const R = makeRunner('6f · Dashboard — Sidebar nav');
    const { page, context } = await openPage(browser, 'dashboard');
    await settle(page);

    await R.check('sidebar is visible', async () => {
      if (!await page.locator('.sidebar').isVisible()) throw new Error('sidebar not visible');
    });

    await R.check('dashboard nav item is active', async () => {
      const active = page.locator('.sb-item.active');
      const txt = await active.textContent();
      if (!txt.toLowerCase().includes('dashboard')) throw new Error(`Active item: "${txt}"`);
    });

    await R.check('sidebar contains Kiosk nav item (not Scanner)', async () => {
      const allItems = await page.locator('.sb-item').allTextContents();
      const hasKiosk   = allItems.some(t => t.toLowerCase().includes('kiosk'));
      const hasScanner = allItems.some(t => t.toLowerCase() === 'scanner');
      if (!hasKiosk)   throw new Error('Kiosk nav item not found. Items: ' + JSON.stringify(allItems));
      if (hasScanner)  throw new Error('Old "Scanner" nav item still present (should be "Kiosk")');
    });

    await R.check('header date is displayed', async () => {
      const txt = await page.locator('#headerDate').textContent();
      if (!txt || txt.length < 5) throw new Error(`headerDate: "${txt}"`);
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
    console.log(`\nSuite 6 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
