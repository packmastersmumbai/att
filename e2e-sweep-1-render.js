'use strict';
/**
 * Suite 1 — Render smoke tests
 * Loads every page and asserts: no JS errors, key structural elements visible.
 */

const { launch, openPage, settle, makeRunner, PAGES } = require('./e2e-lib');

const CHECKS = {
  kiosk: {
    label: 'Kiosk',
    checks: [
      ['top bar visible',          page => page.locator('.k-top').isVisible()],
      ['clock present',            page => page.locator('#kClock').isVisible()],
      ['arrivals grid present',    page => page.locator('.arrivals-grid').isVisible()],
      ['bottom bar present',       page => page.locator('.kb-sys-txt').isVisible()],
      ['scan prompt visible',      page => page.locator('.kb-scan-txt').isVisible()],
    ],
  },
  dashboard: {
    label: 'Dashboard',
    checks: [
      ['sidebar visible',          page => page.locator('.sidebar').isVisible()],
      ['KPI grid visible',         page => page.locator('.kpi-grid-6').isVisible()],
      ['present/absent table in DOM', async page => (await page.locator('#presentTableCol').count()) > 0],
      ['activity feed visible',    page => page.locator('#activityFeed').isVisible()],
    ],
  },
  scanner: {
    label: 'Scanner',
    checks: [
      ['camera button visible',    page => page.locator('#btnOpenScanner').isVisible()],
      ['manual input visible',     page => page.locator('#manualCode').isVisible()],
      ['gate selector visible',    page => page.locator('#gateSelect').isVisible()],
    ],
  },
  admin: {
    label: 'Admin',
    checks: [
      ['PIN gate shown',           page => page.locator('#pinGate').isVisible()],
      ['PIN input present',        page => page.locator('#pinInput').isVisible()],
      ['unlock button present',    page => page.locator('.btn-unlock').isVisible()],
    ],
  },
  reports: {
    label: 'Reports',
    checks: [
      ['filter sidebar visible',   page => page.locator('.filter-sidebar').isVisible()],
      ['tabs bar visible',         page => page.locator('.report-tabs-bar').isVisible()],
      ['logs table present',       page => page.locator('#logsTable').isVisible()],
    ],
  },
  visitors: {
    label: 'Visitors',
    checks: [
      ['page tab bar visible',     page => page.locator('.page-tabs').isVisible()],
      ['register form visible',    page => page.locator('#regForm').isVisible()],
      ['visitor name input',       page => page.locator('#vName').isVisible()],
      ['issue pass button',        page => page.locator('#regBtn').isVisible()],
    ],
  },
};

async function run() {
  const browser = await launch();
  const summary = [];

  for (const pageName of PAGES) {
    const cfg = CHECKS[pageName];
    const R = makeRunner(`1 · Render smoke — ${cfg.label}`);
    const { page, context, errors } = await openPage(browser, pageName);
    await settle(page);

    await R.check('no JS errors on load', async () => {
      if (errors.length) throw new Error(errors.join(' | '));
    });

    for (const [name, fn] of cfg.checks) {
      await R.check(name, async () => {
        const result = await fn(page);
        if (!result) throw new Error(`${name} returned false`);
      });
    }

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
    console.log(`\nSuite 1 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
