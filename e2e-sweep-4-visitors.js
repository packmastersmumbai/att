'use strict';
/**
 * Suite 4 — Visitors page: register form, QR pass display, active tab, history tab.
 * registerVisitor is defined natively in tests/helpers/gas-mock.js.
 */

const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 4a: Register tab structure ────────────────────────────────────────────
  {
    const R = makeRunner('4a · Visitors — Register form');
    const { page, context } = await openPage(browser, 'visitors');
    // Inject extra mock patches
    await settle(page);

    await R.check('Register tab is active by default', async () => {
      const cls = await page.locator('#panel-register').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Register panel not active');
    });

    // Staff form is hidden by default (vreg is the primary form); reveal it.
    await R.check('reveal staff form via "Type it in here"', async () => {
      await page.evaluate(() => window.showStaffForm());
      await page.waitForSelector('#regForm', { state: 'visible', timeout: 3000 });
    });

    await R.check('visitor name input visible', async () => {
      if (!await page.locator('#vName').isVisible()) throw new Error('#vName not visible');
    });

    await R.check('phone input visible', async () => {
      if (!await page.locator('#vPhone').isVisible()) throw new Error('#vPhone not visible');
    });

    await R.check('company input visible', async () => {
      if (!await page.locator('#vCompany').isVisible()) throw new Error('#vCompany not visible');
    });

    await R.check('purpose dropdown visible', async () => {
      if (!await page.locator('#vPurpose').isVisible()) throw new Error('#vPurpose not visible');
    });

    await R.check('expected out time input visible', async () => {
      if (!await page.locator('#vExpOut').isVisible()) throw new Error('#vExpOut not visible');
    });

    await R.check('"Issue Visitor Pass" button visible', async () => {
      if (!await page.locator('#regBtn').isVisible()) throw new Error('#regBtn not visible');
    });

    await R.check('submit without required fields keeps form open', async () => {
      await page.click('#regBtn');
      await page.waitForTimeout(300);
      // Form should still be visible (not replaced by passPanel)
      const formVisible = await page.locator('#regForm').isVisible();
      if (!formVisible) throw new Error('regForm disappeared on empty submit');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 4b: Register visitor → QR pass display ────────────────────────────────
  {
    const R = makeRunner('4b · Visitors — Register flow → QR pass');
    const { page, context } = await openPage(browser, 'visitors');
    await settle(page);

    await R.check('fill and submit register form', async () => {
      await page.evaluate(() => window.showStaffForm());
      await page.waitForSelector('#regForm', { state: 'visible', timeout: 3000 });
      await page.fill('#vName', 'E2E Visitor');
      await page.fill('#vPhone', '9876543210');
      await page.fill('#vCompany', 'TestCorp');
      await page.selectOption('#vPurpose', { index: 1 });
      await page.fill('#vExpOut', '17:00');
      // Photo is now mandatory; simulate a successful capture (the form stores
      // the captured base64 in the vPhotoData var, which the submit reads).
      await page.evaluate(() => { window.vPhotoData = 'data:image/jpeg;base64,/9j/AAAA'; });
      await page.click('#regBtn');
      // Wait for pass panel to appear
      await page.waitForSelector('#passPanel', { state: 'visible', timeout: 6000 });
    });

    await R.check('pass panel shows visitor name', async () => {
      const txt = await page.locator('#passSummaryName').textContent();
      if (!txt.includes('E2E Visitor')) throw new Error(`Name: "${txt}"`);
    });

    await R.check('pass panel shows company', async () => {
      const txt = await page.locator('#passSummaryCompany').textContent();
      if (!txt.includes('TestCorp')) throw new Error(`Company: "${txt}"`);
    });

    await R.check('QR code image is rendered', async () => {
      // QR img may be a canvas or img — check it exists and is visible
      const qrVisible = await page.locator('#passQRImg').isVisible();
      if (!qrVisible) throw new Error('QR image not visible');
    });

    await R.check('visitor trace ID is displayed', async () => {
      const txt = await page.locator('#passTraceID').textContent();
      if (!txt || txt.length < 2) throw new Error(`Trace ID: "${txt}"`);
    });

    await R.check('WhatsApp share button visible', async () => {
      if (!await page.locator('#waShareBtn').isVisible()) throw new Error('WA share btn not visible');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 4c: Active visitors tab ───────────────────────────────────────────────
  {
    const R = makeRunner('4c · Visitors — Active tab');
    const { page, context } = await openPage(browser, 'visitors');
    await settle(page);

    await R.check('switch to Active tab', async () => {
      // Tabs use onclick="switchTab('active')" — click by text or by position
      await page.click('.page-tab:has-text("Active"), .page-tab:nth-child(2), button[onclick*="active"]');
      await settle(page, 300); // wait for loadActive() GAS call to resolve
      const cls = await page.locator('#panel-active').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Active panel not active');
    });

    await R.check('active panel badge present in DOM', async () => {
      // Badge is populated by loadActive() — check it exists
      const count = await page.locator('#activeTotalBadge').count();
      if (count === 0) throw new Error('#activeTotalBadge not in DOM');
    });

    await R.check('active table visible', async () => {
      const v = await page.locator('#activeTable').isVisible();
      if (!v) throw new Error('#activeTable not visible');
    });

    await R.check('stat tiles rendered (hidden if no active visitors)', async () => {
      // statTiles is display:none when empty; check DOM exists
      const count = await page.locator('#statTiles').count();
      if (count === 0) throw new Error('#statTiles not in DOM');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 4d: History tab ───────────────────────────────────────────────────────
  {
    const R = makeRunner('4d · Visitors — History tab');
    const { page, context } = await openPage(browser, 'visitors');
    await settle(page);

    await R.check('switch to History tab', async () => {
      await page.click('.page-tab:has-text("History"), .page-tab:nth-child(3), button[onclick*="history"]');
      await page.waitForTimeout(300);
      const cls = await page.locator('#panel-history').getAttribute('class');
      if (!cls.includes('active')) throw new Error('History panel not active');
    });

    await R.check('history filter inputs visible', async () => {
      const v = await page.locator('#hFilterName').isVisible();
      if (!v) throw new Error('#hFilterName not visible');
    });

    await R.check('history table visible', async () => {
      const v = await page.locator('#historyTable').isVisible();
      if (!v) throw new Error('#historyTable not visible');
    });

    await R.check('peak day / peak time stats visible', async () => {
      const pd = await page.locator('#peakDay').isVisible();
      const pt = await page.locator('#peakTime').isVisible();
      if (!pd || !pt) throw new Error('Peak stats not visible');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 4e: Returning-visitor phone lookup (vreg.html self-service page) ──────
  {
    const R = makeRunner('4e · Visitor self-reg — Returning visitor lookup');
    const { page, context } = await openPage(browser, 'vreg');
    await settle(page);

    await R.check('known number (ends 9999) resolves the returning-visitor pass', async () => {
      await page.fill('#rPhone', '9876549999');
      await page.click('#rBtn');
      await page.waitForSelector('#doneCard', { state: 'visible', timeout: 5000 });
      const txt = await page.locator('#doneVid').textContent();
      if (!txt.includes('VIS-20260710-TESTPASS0000001')) throw new Error(`visitor id: "${txt}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  {
    const R = makeRunner('4f · Visitor self-reg — Unknown number lookup');
    const { page, context } = await openPage(browser, 'vreg');
    await settle(page);

    await R.check('unknown number keeps returning-visitor card open with an error', async () => {
      await page.fill('#rPhone', '9876540000');
      await page.click('#rBtn');
      await page.waitForTimeout(600); // mock delay + failure-path render
      const cardVisible = await page.locator('#returnCard').isVisible();
      if (!cardVisible) throw new Error('returnCard hidden after a lookup miss');
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
    console.log(`\nSuite 4 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
