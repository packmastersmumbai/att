/**
 * e2e-lib.js — Shared helpers for QR Attendance E2E harness.
 * Inspired by the DWM e2e-lib pattern: launch once, load pages via fixture,
 * assert via makeRunner, teardown with a summary.
 *
 * Usage:
 *   const { launch, loadPage, makeRunner, GAS_DELAY, PAGES } = require('./e2e-lib');
 *   const { chromium } = require('playwright');
 *   const browser = await launch();
 *   const { page } = await openPage(browser, 'kiosk');
 *   const R = makeRunner('Kiosk smoke');
 *   await R.check('clock visible', async () => page.locator('#kClock').isVisible());
 *   R.report();
 *   await browser.close();
 */

'use strict';

const fs          = require('fs');
const path        = require('path');
const { chromium } = require('playwright');
const { GAS_MOCK_SCRIPT } = require('./tests/helpers/gas-mock');

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT     = path.join(__dirname, 'src', 'pages');
const GAS_DELAY = 350;   // ms to wait after a mock GAS call resolves

// doGet() (src/Code.js) injects src/i18n.html's <script> into every served
// page's <head>. The harness below builds pages directly from raw files and
// never runs doGet, so the same injection is done here — otherwise pages
// using qrattT()/data-i18n would find those globals undefined.
const I18N_SCRIPT = fs.readFileSync(path.join(__dirname, 'src', 'i18n.html'), 'utf8');
const GPC_PARTIAL = fs.readFileSync(path.join(__dirname, 'src', 'gatepassCard.html'), 'utf8');
// Shared design tokens. doGet() injects these right after <head>, ahead of
// each page's own <style>, and several pages have now dropped their local
// :root entirely and rely on them. Without this the harness renders those
// pages with no palette at all — every colour, radius and font resolves to
// nothing — which looks like a page-wide style collapse in a screenshot.
const TOKENS_PARTIAL = fs.readFileSync(path.join(__dirname, 'src', 'tokens.html'), 'utf8');

/** All testable pages (maps to src/pages/<name>.html) */
const PAGES = ['kiosk', 'dashboard', 'scanner', 'admin', 'reports', 'visitors',
               'training', 'skillmatrix', 'mockdrill', 'selftest'];

// ── Browser helpers ──────────────────────────────────────────────────────────

/** Launch a headed Chromium browser (matches playwright.config.js viewport). */
async function launch() {
  return chromium.launch({ headless: false, slowMo: 80 });
}

/**
 * Replace window.sessionStorage with an in-memory Map-backed shim.
 * data: URLs disable real sessionStorage in Chromium; this restores the
 * same get/setItem contract so i18n.html's qratt_lang persistence works
 * in tests the same way it does when the app is served over https.
 * @param {import('playwright').Page} page
 */
async function installSessionStorageShim(page) {
  await page.addInitScript(() => {
    const store = new Map();
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key),
        clear: () => store.clear(),
      },
    });
  });
}

/**
 * Open a fresh browser context + page, load <pageName>.html via data URL
 * with GAS mock injected, and wait for DOM ready.
 *
 * Returns { page, context }.
 */
async function openPage(browser, pageName) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', e => {
    // Ignore font / network errors that don't affect logic
    if (!e.message.includes('net::ERR') && !e.message.includes('fonts.googleapis')) {
      errors.push(e.message);
    }
  });

  // Chromium disables sessionStorage on data: URLs (the pages here are loaded
  // via data: to avoid a file server), but the real app always serves from
  // https://script.google.com — so qrattLang()/qrattSetLang() would throw in
  // tests despite working correctly in production. Shim it with a plain
  // object before any page script runs.
  await installSessionStorageShim(page);

  const filePath = path.join(ROOT, pageName + '.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // Strip GAS template expressions (same pattern as tests/helpers/fixture.js).
  // `<?!= expr ?>` (unescaped print — vpass.html uses it for `passJson`, a
  // raw JSON literal, not an HTML-escaped string) must be substituted with a
  // valid raw JS value, NOT the quoted "__GAS_TEMPLATE__" sentinel used for
  // `<?= ?>` — quoting it here would double-quote the sentinel into `""""`.
  // It's also handled before the generic `<?...?>` stripper, which would
  // otherwise collapse it to nothing and leave `var PASS = ;` — a syntax error.
  html = html.replace(/<\?!=\s*[^?]+\?>/g, '{}');
  html = html.replace(/<\?=\s*[^?]+\?>/g, '"__GAS_TEMPLATE__"');
  html = html.replace(/<\?\s*[^?]+\?>/g, '');
  html = html.replace(/__GAS_TEMPLATE__/g, '""');

  // Inject mock + i18n runtime before any other scripts (i18n.html already
  // includes its own <script>…</script> wrapper, so it's concatenated as-is).
  // TOKENS_PARTIAL must come FIRST, so a page's own :root still overrides it
  // — the same ordering doGet() uses in production.
  html = html.replace('<head>', '<head>' + TOKENS_PARTIAL + '<script>' + GAS_MOCK_SCRIPT + '</script>' + I18N_SCRIPT + GPC_PARTIAL);

  // charset MUST be declared on the data URL. The page's own <meta charset>
  // only counts inside the first 1024 bytes, and the injected mock + i18n +
  // gatepass partial push it well past that — the browser then falls back to
  // Latin-1 and every Devanagari string renders as mojibake.
  const encoded = Buffer.from(html, 'utf8').toString('base64');
  await page.goto('data:text/html;charset=utf-8;base64,' + encoded);
  await page.waitForLoadState('domcontentloaded');

  return { page, context, errors };
}

/**
 * Wait for GAS mock to resolve + a render tick.
 * @param {import('playwright').Page} page
 * @param {number} [extra=0] additional ms beyond GAS_DELAY
 */
async function settle(page, extra = 0) {
  await page.waitForTimeout(GAS_DELAY + extra);
}

// ── Admin helper ─────────────────────────────────────────────────────────────

/**
 * Navigate admin page past the PIN gate.
 * PIN '1234' is correct per gas-mock.js.
 */
async function unlockAdmin(page) {
  await page.fill('#pinInput', '1234');
  await page.click('.btn-unlock');
  await page.waitForSelector('#adminPanel', { state: 'visible', timeout: 5000 });
  await page.waitForSelector('#empBody tr td strong', { state: 'visible', timeout: 5000 });
}

// ── Assertion runner ─────────────────────────────────────────────────────────

/**
 * Create a lightweight assertion runner (mirrors DWM makeRunner).
 *
 * Each check(name, fn) runs fn(); if it throws the check fails.
 * fn may be async. fn may return a boolean; false also counts as failure.
 *
 * report() prints a table and returns { pass, fail, total }.
 */
function makeRunner(label) {
  const results = [];

  async function check(name, fn) {
    const start = Date.now();
    try {
      const ret = await fn();
      // Playwright assertions throw on failure, so reaching here = pass.
      // Support explicit boolean return for non-Playwright checks.
      if (ret === false) throw new Error('returned false');
      results.push({ name, ok: true, ms: Date.now() - start });
    } catch (err) {
      results.push({ name, ok: false, ms: Date.now() - start, err: err.message || String(err) });
    }
  }

  function report() {
    const pass  = results.filter(r => r.ok).length;
    const fail  = results.filter(r => !r.ok).length;
    const total = results.length;

    console.log('\n' + '─'.repeat(60));
    console.log(`  Suite: ${label}`);
    console.log('─'.repeat(60));
    results.forEach(r => {
      const icon = r.ok ? '✓' : '✗';
      const ms   = String(r.ms).padStart(4) + 'ms';
      console.log(`  ${icon}  ${r.name.padEnd(44)} ${ms}`);
      if (!r.ok && r.err) {
        // Show first line of error message only
        console.log(`       ↳ ${r.err.split('\n')[0].slice(0, 120)}`);
      }
    });
    console.log('─'.repeat(60));
    console.log(`  ${pass}/${total} passed${fail ? `  ← ${fail} FAILED` : ''}`);
    console.log('─'.repeat(60) + '\n');

    return { pass, fail, total, label };
  }

  return { check, report };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  launch,
  openPage,
  installSessionStorageShim,
  settle,
  unlockAdmin,
  makeRunner,
  GAS_DELAY,
  PAGES,
  chromium,
};
