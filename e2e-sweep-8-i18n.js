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

    // charset MUST be on the data URL, as e2e-lib's openPage does. A page's own
    // <meta charset> only counts inside the first 1024 bytes, and the injected
    // mock + i18n push it far past that — the browser then falls back to
    // Latin-1 and every Devanagari string renders as mojibake. This suite built
    // its page by hand and omitted the charset; it passed only while i18n.html
    // happened to be small enough.
    const encoded = Buffer.from(html, 'utf8').toString('base64');
    await page.goto('data:text/html;charset=utf-8;base64,' + encoded);
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

    // The pass no longer carries a self check-in/out button — presence is
    // recorded only by the gate scanner — so the gate instruction that
    // replaced it is what must translate here.
    await R.check('gate instruction is Hindi when lang=hi', async () => {
      const txt = await page.locator('[data-i18n="vpass_show_at_gate"]').textContent();
      if (!txt.includes('गेट पर')) throw new Error(`instruction: "${txt}"`);
    });

    await R.check('no self check-in/out control on the pass', async () => {
      const n = await page.locator('#toggleBtn').count();
      if (n !== 0) throw new Error('self check-in/out button is still rendered');
    });

    summary.push(R.report());
    await context.close();
  }

  // 8d — Phase 5b pages: kiosk, scanner, login, idcards each toggle Hindi/English.
  {
    const R = makeRunner('8d · i18n — kiosk/scanner/login/idcards toggle');
    const CASES = [
      { page: 'kiosk',   key: 'kiosk_total_present', hi: 'कुल उपस्थित', en: 'Total Present' },
      { page: 'scanner', key: 'nav_dashboard',       hi: 'डैशबोर्ड',    en: 'Dashboard' },
      { page: 'login',   key: 'login_who_is_logging_in', hi: null,      en: null },
      { page: 'idcards', key: 'idcards_title',        hi: null,         en: null },
    ];
    for (const c of CASES) {
      const { page, context } = await openPage(browser, c.page);
      await installSessionStorageShim(page);
      await page.addInitScript(() => sessionStorage.setItem('qratt_lang', 'hi'));
      await page.reload();
      await settle(page);

      await R.check(`${c.page}: [${c.key}] renders under lang=hi`, async () => {
        const loc = page.locator(`[data-i18n="${c.key}"]`).first();
        if (await loc.count() === 0) throw new Error(`no node for ${c.key}`);
        const hiTxt = (await loc.textContent()).trim();
        if (!hiTxt) throw new Error('empty hi text');
        // Flip to English and confirm the same node changes.
        await page.evaluate(() => window.qrattSetLang('en'));
        const enTxt = (await loc.textContent()).trim();
        if (enTxt === hiTxt) throw new Error(`did not flip: still "${hiTxt}"`);
        if (c.hi && !hiTxt.includes(c.hi)) throw new Error(`hi mismatch: "${hiTxt}"`);
        if (c.en && !enTxt.includes(c.en)) throw new Error(`en mismatch: "${enTxt}"`);
      });
      await context.close();
    }
    summary.push(R.report());
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
