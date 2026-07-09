'use strict';
/**
 * Suite 8 — i18n language toggle: vreg starts in Hindi when sessionStorage
 * pre-sets qratt_lang='hi', then flips to English via qrattSetLang('en').
 * The i18n runtime (src/i18n.html) is injected by e2e-lib.js the same way
 * doGet() injects it in production — see e2e-lib.js's I18N_SCRIPT constant.
 */

const { launch, openPage, installSessionStorageShim, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 8a: Hindi pre-selected via sessionStorage renders Hindi labels ────────
  {
    const R = makeRunner('8a · i18n — Hindi pre-selected via sessionStorage');
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    // Install the sessionStorage shim (data: URLs disable the real API),
    // then seed qratt_lang='hi' before the page's own scripts run — the
    // i18n runtime's DOMContentLoaded handler reads it on first paint.
    await installSessionStorageShim(page);
    await page.addInitScript(() => sessionStorage.setItem('qratt_lang', 'hi'));

    const fs   = require('fs');
    const path = require('path');
    let html = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'vreg.html'), 'utf8');
    html = html.replace(/<\?=\s*[^?]+\?>/g, '"__GAS_TEMPLATE__"');
    html = html.replace(/<\?\s*[^?]+\?>/g, '');
    html = html.replace(/__GAS_TEMPLATE__/g, '""');
    const { GAS_MOCK_SCRIPT } = require('./tests/helpers/gas-mock');
    const I18N_SCRIPT = fs.readFileSync(path.join(__dirname, 'src', 'i18n.html'), 'utf8');
    html = html.replace('<head>', '<head><script>' + GAS_MOCK_SCRIPT + '</script>' + I18N_SCRIPT);

    const encoded = Buffer.from(html).toString('base64');
    await page.goto('data:text/html;base64,' + encoded);
    await page.waitForLoadState('domcontentloaded');
    await settle(page);

    await R.check('"Been here before?" label renders in Hindi', async () => {
      const txt = await page.locator('[data-i18n="vreg_been_here"]').textContent();
      if (!txt.includes('पहले आए हैं')) throw new Error(`label: "${txt}"`);
    });

    await R.check('mobile placeholder renders in Hindi', async () => {
      const ph = await page.locator('#rPhone').getAttribute('placeholder');
      if (!ph.includes('मोबाइल नंबर')) throw new Error(`placeholder: "${ph}"`);
    });

    await R.check('Hindi toggle button is marked active', async () => {
      const cls = await page.locator('[data-lang-btn="hi"]').getAttribute('class');
      if (!cls.includes('active')) throw new Error(`class: "${cls}"`);
    });

    await R.check('qrattSetLang("en") flips the label back to English', async () => {
      await page.evaluate(() => window.qrattSetLang('en'));
      const txt = await page.locator('[data-i18n="vreg_been_here"]').textContent();
      if (!txt.includes('Been here before')) throw new Error(`label: "${txt}"`);
    });

    await R.check('English toggle button becomes active after the flip', async () => {
      const cls = await page.locator('[data-lang-btn="en"]').getAttribute('class');
      if (!cls.includes('active')) throw new Error(`class: "${cls}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 8b: Default (no sessionStorage set) renders English ───────────────────
  {
    const R = makeRunner('8b · i18n — Default language is English');
    const { page, context } = await openPage(browser, 'vreg');
    await settle(page);

    await R.check('"Been here before?" label renders in English by default', async () => {
      const txt = await page.locator('[data-i18n="vreg_been_here"]').textContent();
      if (!txt.includes('Been here before')) throw new Error(`label: "${txt}"`);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 8c: vpass toggle flips the emergency-contact label ────────────────────
  {
    const R = makeRunner('8c · i18n — vpass toggle flips emergency contact label');
    const { page, context } = await openPage(browser, 'vpass');
    await settle(page);

    // The harness strips vpass's server-injected `passJson` down to `{}`
    // (no live GAS backend to supply a real pass), so render() shows its
    // "Pass not found" branch by default. Swap in a valid pass and re-render
    // to reach the emergency-contacts section this test exercises.
    await R.check('inject a valid pass and re-render', async () => {
      await page.evaluate(() => {
        window.PASS = { success: true, name: 'E2E Visitor', visitorId: 'VIS-TEST', status: 'IN', qrUrl: '' };
        window.render(window.PASS);
      });
      const count = await page.locator('[data-i18n="vpass_emg_incharge"]').count();
      if (count === 0) throw new Error('emergency contact label not found after render');
    });

    await R.check('emergency contact label starts in English', async () => {
      const txt = await page.locator('[data-i18n="vpass_emg_incharge"]').textContent();
      if (!txt.includes('In-charge')) throw new Error(`label: "${txt}"`);
    });

    await R.check('qrattSetLang("hi") flips the emergency contact label to Hindi', async () => {
      await page.evaluate(() => window.qrattSetLang('hi'));
      const txt = await page.locator('[data-i18n="vpass_emg_incharge"]').textContent();
      if (!txt.includes('प्रभारी')) throw new Error(`label: "${txt}"`);
    });

    await R.check('check-in button label is Hindi when lang=hi', async () => {
      const txt = await page.locator('#toggleBtn').textContent();
      if (!txt.includes('चेक आउट करें')) throw new Error(`button label: "${txt}"`);
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
    console.log(`\nSuite 8 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
