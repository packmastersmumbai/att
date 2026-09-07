'use strict';
/**
 * Suite 10 — the gatepass surfaces added to connect it to real workflows:
 *   10a  scanner: inline card on a visitor scan (+ the auto-dismiss hold)
 *   10b  scanner: unreturned-items warning on a visitor check-out
 *   10c  reports: outstanding-returnables register
 * GAS calls are mocked in tests/helpers/gas-mock.js.
 */
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 10a · Scanner: gatepass card on a visitor scan ────────────────────────
  {
    const R = makeRunner('10a · Scanner — inline gatepass card on a visitor scan');
    const { page, context } = await openPage(browser, 'scanner');
    await settle(page);

    await R.check('visitor scan mounts the gatepass card', async () => {
      await page.evaluate(() => window.submitCode('VIS001'));
      await page.waitForSelector('#scGpMount', { state: 'attached', timeout: 5000 });
      await page.waitForSelector('#scGpDesc', { timeout: 5000 });
    });

    await R.check('material picklist reaches the scanner card', async () => {
      await page.waitForFunction(() => {
        const dl = document.getElementById('scGpMats');
        return dl && dl.querySelectorAll('option').length > 0;
      }, { timeout: 5000 });
    });

    await R.check('interacting holds the card open past auto-dismiss', async () => {
      // The result card self-dismisses at 8.1s. Typing must cancel that, or the
      // card would vanish mid-entry — the whole reason holdResult() exists.
      await page.fill('#scGpDesc', 'HDPE Granules');
      await page.waitForTimeout(9000);
      const stillOpen = await page.locator('#scGpDesc').count();
      if (!stillOpen) throw new Error('card auto-dismissed while the guard was typing');
    });

    await R.check('add item from the scanner records it', async () => {
      await page.fill('#scGpQty', '2');
      await page.click('.gpc-add');
      await settle(page, 600);
      const rows = await page.locator('#scGpMount .gpc-row').count();
      if (rows < 1) throw new Error('no gatepass row after add from scanner');
    });

    await R.check('returnable item offers mark-returned', async () => {
      const n = await page.locator('#scGpMount .gpc-act').count();
      if (n < 1) throw new Error('no mark-returned action on a returnable item');
    });

    await R.check('mark returned settles it', async () => {
      await page.locator('#scGpMount .gpc-act').first().click();
      await settle(page, 600);
      const n = await page.locator('#scGpMount .gpc-act').count();
      if (n !== 0) throw new Error('item still shows as outstanding after return');
    });

    await R.check('employee scan does NOT mount the card', async () => {
      await page.evaluate(() => window.dismissResult && window.dismissResult());
      await settle(page, 300);
      await page.evaluate(() => window.submitCode('EMP001'));
      await settle(page, 800);
      const n = await page.locator('#scGpMount').count();
      if (n !== 0) throw new Error('gatepass card mounted on an employee scan');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 10b · Scanner: unreturned-items warning at check-out ──────────────────
  {
    const R = makeRunner('10b · Scanner — unreturned-items warning on check-out');
    const { page, context } = await openPage(browser, 'scanner');
    await settle(page);

    await R.check('checkout with items outstanding shows the warning', async () => {
      await page.evaluate(() => window.submitCode('VIS-OUT-OWING'));
      await page.waitForSelector('.sc-gp-warn', { timeout: 5000 });
      const txt = await page.locator('.sc-gp-warn').first().textContent();
      if (!/2/.test(txt)) throw new Error('warning does not state the item count: ' + txt);
    });

    await R.check('the warning holds the card open', async () => {
      await page.waitForTimeout(9000);
      const n = await page.locator('.sc-gp-warn').count();
      if (!n) throw new Error('warning auto-dismissed before the guard could read it');
    });

    // Regression: the camera-popup path (onScanCode) used to re-arm its own
    // 1800ms dismiss AFTER showResult had armed 8100, so on the path guards
    // actually use the warning flashed and vanished. The old test only drove
    // submitCode, which never re-armed, so it passed while production broke.
    await R.check('warning holds on the camera-popup path too', async () => {
      await page.evaluate(() => window.dismissResult && window.dismissResult());
      await settle(page, 400);
      await page.evaluate(() => window.onScanCode('VIS-OUT-OWING', null));
      await page.waitForSelector('.sc-gp-warn', { timeout: 5000 });
      await page.waitForTimeout(3000);   // well past the old 1800ms re-arm
      // Must assert VISIBILITY, not presence: dismissResult() hides the
      // overlay but leaves .sc-gp-warn in the DOM, so a count check passes
      // even when the guard can no longer see the warning.
      if (!(await page.locator('.sc-gp-warn').first().isVisible())) {
        throw new Error('popup-path warning dismissed itself');
      }
    });

    await R.check('clean checkout shows no warning', async () => {
      await page.evaluate(() => window.dismissResult && window.dismissResult());
      await settle(page, 400);
      await page.evaluate(() => window.submitCode('VIS-OUT-CLEAN'));
      await settle(page, 1200);
      const n = await page.locator('.sc-gp-warn').count();
      if (n !== 0) throw new Error('warning shown for a visitor owing nothing');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 10c · Reports: outstanding-returnables register ───────────────────────
  {
    const R = makeRunner('10c · Reports — outstanding gatepass register');
    const { page, context } = await openPage(browser, 'reports');
    await settle(page);

    await R.check('Gatepass tab exists and opens', async () => {
      await page.waitForSelector('#rtabGatepass', { timeout: 4000 });
      await page.click('#rtabGatepass');
      await page.waitForSelector('#reportsViewGatepass', { state: 'visible', timeout: 4000 });
    });

    await R.check('outstanding items render as rows', async () => {
      await page.waitForSelector('#gpOutWrap table tbody tr', { timeout: 5000 });
      const rows = await page.locator('#gpOutWrap table tbody tr').count();
      if (rows < 1) throw new Error('no outstanding rows rendered');
    });

    await R.check('KPI reports the outstanding count', async () => {
      const txt = await page.locator('#gpOutKpi').textContent();
      if (!/outstanding/i.test(txt)) throw new Error('KPI missing: ' + txt);
    });

    await R.check('approval state is surfaced', async () => {
      const body = await page.locator('#gpOutWrap').innerHTML();
      if (!/Unapproved|Approved/.test(body)) throw new Error('no approval chip rendered');
    });

    await R.check('mark-returned action is present', async () => {
      const n = await page.locator('#gpOutWrap button', { hasText: 'Returned' }).count();
      if (n < 1) throw new Error('no mark-returned button');
    });

    await R.check('export button is wired', async () => {
      const fn = await page.evaluate(() => typeof window.exportGatepassCSV);
      if (fn !== 'function') throw new Error('exportGatepassCSV missing');
    });

    summary.push(R.report());
    await context.close();
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 10: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
