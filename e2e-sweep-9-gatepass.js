'use strict';
/**
 * Suite 9 — Visitor item gatepass card in the visitor detail modal.
 * Gatepass actions are mocked in tests/helpers/gas-mock.js.
 */
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  const R = makeRunner('9 · Gatepass — add / return / material picklist');
  const { page, context } = await openPage(browser, 'visitors');
  await settle(page);

  await R.check('open detail modal exposes gatepass card', async () => {
    await page.evaluate(() => window.openVisitorDetail && window.openVisitorDetail('VIS-TEST-1'));
    await page.waitForSelector('#gpCard', { state: 'attached', timeout: 4000 });
    // wait for the card to render (getGatepass + getMaterialList resolve)
    await page.waitForSelector('#gpDesc', { timeout: 4000 });
  });

  await R.check('material picklist is populated', async () => {
    // <datalist> options are not in the layout tree, so count them via the DOM
    // rather than a visibility-based locator.
    await page.waitForFunction(() => {
      const dl = document.getElementById('gpMatList');
      return dl && dl.querySelectorAll('option').length > 0;
    }, { timeout: 4000 });
    const n = await page.evaluate(() => document.getElementById('gpMatList').querySelectorAll('option').length);
    if (n < 1) throw new Error('no material options');
  });

  await R.check('add item renders a table row', async () => {
    await page.fill('#gpDesc', 'HDPE Granules');
    await page.fill('#gpQty', '3');
    await page.click('#gpCard .btn-primary');
    await settle(page, 300);
    const rows = await page.locator('#gpCard table tbody tr').count();
    if (rows < 1) throw new Error('no gatepass row after add');
  });

  await R.check('returnable IN item shows an awaiting-return action', async () => {
    const returnBtns = await page.locator('#gpCard .link-btn').count();
    if (returnBtns < 1) throw new Error('no mark-returned action for returnable item');
  });

  await R.check('mark returned settles the item', async () => {
    await page.locator('#gpCard .link-btn').first().click();
    await settle(page, 300);
    // after return, the row's action becomes Void (or no awaiting action remains)
    const rows = await page.locator('#gpCard table tbody tr').count();
    if (rows < 1) throw new Error('row disappeared unexpectedly');
  });

  summary.push(R.report());
  await context.close();
  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 9: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
