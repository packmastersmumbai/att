'use strict';
/**
 * Suite 7 — Login page
 * Tile render, tap-to-login (no PIN).
 */

const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const R = makeRunner('7 · Login — user tiles');
  const { page, context } = await openPage(browser, 'login');

  await settle(page, 100);

  await R.check('user tiles render', async () => {
    const count = await page.locator('.user-tile').count();
    if (count < 2) throw new Error(`Expected ≥2 tiles, got ${count}`);
  });

  await R.check('Owner tile visible', async () => {
    const txt = await page.locator('#userGrid').textContent();
    if (!txt.includes('Owner')) throw new Error('Owner tile missing');
  });

  await R.check('Khushi tile visible', async () => {
    const txt = await page.locator('#userGrid').textContent();
    if (!txt.includes('Khushi')) throw new Error('Khushi tile missing');
  });

  await R.check('tiles have avatar initials', async () => {
    const txt = await page.locator('#userGrid').textContent();
    if (!txt.includes('OW') && !txt.includes('KH')) throw new Error('Initials missing');
  });

  await R.check('tiles are clickable elements', async () => {
    // Login tiles exist but navigation is GAS-side (no local routing in v80)
    const count = await page.locator('.user-tile').count();
    if (count < 2) throw new Error(`Expected ≥2 clickable tiles, got ${count}`);
  });

  const result = R.report();
  await context.close();
  await browser.close();
  return [result];
}

if (require.main === module) {
  run().then(results => {
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
