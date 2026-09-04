'use strict';
/**
 * Suite 11 — items on the KIOSK scan card.
 *
 * The kiosk is the terminal the guard actually stands at, but it had no
 * gatepass affordance at all: logging a visitor's laptop meant leaving the
 * kiosk, opening the Visitors page, finding the row, opening the modal and
 * working a nine-control form. These assertions pin the item form to the scan
 * result itself, where the guard is already holding the visitor.
 *
 * GAS calls are mocked in tests/helpers/gas-mock.js.
 */
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 11a · Kiosk: item form on a visitor scan ──────────────────────────────
  {
    const R = makeRunner('11a · Kiosk — item form on the visitor scan card');
    const { page, context } = await openPage(browser, 'kiosk');
    await settle(page);

    await R.check('visitor scan mounts the item form', async () => {
      await page.evaluate(() => window.kioskOnScan('VIS001', null));
      await page.waitForSelector('#kGpMount', { state: 'attached', timeout: 5000 });
      await page.waitForSelector('#kGpDesc', { timeout: 5000 });
    });

    await R.check('employee scan does NOT mount it', async () => {
      await page.evaluate(() => window.kioskDismissResult());
      await settle(page, 400);
      await page.evaluate(() => window.kioskOnScan('EMP001', null));
      await settle(page, 1200);
      const n = await page.locator('#kGpMount').count();
      if (n !== 0) throw new Error('item form mounted on an employee scan');
    });

    await R.check('typing holds the card past auto-dismiss', async () => {
      // The kiosk card self-dismisses at 8s. Both scan paths used to re-arm
      // that timer after the card was built, so a guard mid-entry lost it.
      await page.evaluate(() => window.kioskDismissResult());
      await settle(page, 400);
      await page.evaluate(() => window.kioskOnScan('VIS001', null));
      await page.waitForSelector('#kGpDesc', { timeout: 5000 });
      await page.fill('#kGpDesc', 'laptop');
      await page.waitForTimeout(9000);
      if (!(await page.locator('#kGpDesc').isVisible())) {
        throw new Error('card auto-dismissed while the guard was typing');
      }
    });

    await R.check('add records the item and it appears in the list', async () => {
      await page.fill('#kGpQty', '2');
      await page.click('.gpc-add');
      await settle(page, 800);
      const rows = await page.locator('#kGpMount .gpc-row').count();
      if (rows < 1) throw new Error('no item row after add');
    });

    await R.check('a returnable item offers mark-returned', async () => {
      const n = await page.locator('#kGpMount .gpc-act').count();
      if (n < 1) throw new Error('no mark-returned action on a returnable item');
    });

    await R.check('mark returned settles it', async () => {
      await page.locator('#kGpMount .gpc-act').first().click();
      await settle(page, 800);
      const n = await page.locator('#kGpMount .gpc-act').count();
      if (n !== 0) throw new Error('item still outstanding after mark-returned');
    });

    await R.check('adding with an empty description does nothing', async () => {
      const before = await page.locator('#kGpMount .gpc-row').count();
      await page.fill('#kGpDesc', '');
      await page.click('.gpc-add');
      await settle(page, 600);
      const after = await page.locator('#kGpMount .gpc-row').count();
      if (after !== before) throw new Error('empty description was accepted');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 11d · Kiosk: tapping a visitor card gives items, not a dead modal ─────
  {
    const R = makeRunner('11d · Kiosk — visitor card opens items, not an empty modal');
    const { page, context } = await openPage(browser, 'kiosk');
    await settle(page, 1200);

    await R.check('tapping a visitor card mounts the item form', async () => {
      // pmOpen used to call getEmployeeMonth with a VisitorID, which returns
      // nothing — the modal opened empty with a dead Check Out button, so the
      // guard had to leave the kiosk for the Visitors page.
      await page.evaluate(() => window.pmOpen('VIS-STAYOVER', 'Visitor B'));
      await page.waitForSelector('#kGpMount', { state: 'attached', timeout: 5000 });
      await page.waitForSelector('#kGpDesc', { timeout: 5000 });
    });

    await R.check('the check-out button is live for a visitor', async () => {
      const dis = await page.locator('#pmCheckoutBtn').isDisabled();
      if (dis) throw new Error('visitor check-out button is dead');
    });

    await R.check('a visitor who already left cannot be checked out again', async () => {
      // Not in activeVisitorList → already gone. Offering "Check out" there is
      // meaningless and was the confusing part.
      await page.evaluate(() => window.pmClose());
      await settle(page, 300);
      await page.evaluate(() => window.pmOpen('VIS-GONE', 'Departed'));
      await settle(page, 700);
      const dis = await page.locator('#pmCheckoutBtn').isDisabled();
      if (!dis) throw new Error('check-out offered to a visitor who already left');
    });

    await R.check('item rows say what is owed, not column jargon', async () => {
      await page.evaluate(() => window.pmClose());
      await settle(page, 300);
      await page.evaluate(() => window.pmOpen('VIS-OUT-OWING', 'Owing'));
      await page.waitForSelector('#kGpMount .gpc-row', { timeout: 5000 });
      const txt = await page.locator('#kGpMount').textContent();
      if (!/with visitor/i.test(txt)) throw new Error('no plain-language state on the row: ' + txt);
      if (!/Got it back/i.test(txt)) throw new Error('return action is not labelled as an action');
    });

    await R.check('an employee card still shows attendance, not items', async () => {
      await page.evaluate(() => window.pmClose());
      await settle(page, 300);
      await page.evaluate(() => window.pmOpen('EMP001', 'Priya'));
      await settle(page, 900);
      const n = await page.locator('#kGpMount').count();
      if (n !== 0) throw new Error('item form mounted for an employee');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 11b · Kiosk: unreturned-items warning on check-out ────────────────────
  {
    const R = makeRunner('11b · Kiosk — unreturned-items warning on check-out');
    const { page, context } = await openPage(browser, 'kiosk');
    await settle(page);

    await R.check('check-out with items outstanding warns', async () => {
      await page.evaluate(() => window.kioskOnScan('VIS-OUT-OWING', null));
      await page.waitForSelector('.kgp-warn', { timeout: 5000 });
      const txt = await page.locator('.kgp-warn').first().textContent();
      if (!/2/.test(txt)) throw new Error('warning omits the item count: ' + txt);
    });

    await R.check('the warning holds the card open', async () => {
      // Assert VISIBILITY, not presence: dismissing hides the card but leaves
      // the node in the DOM, so a count check passes on a card nobody can see.
      await page.waitForTimeout(9000);
      if (!(await page.locator('.kgp-warn').first().isVisible())) {
        throw new Error('warning dismissed itself before the guard could read it');
      }
    });

    await R.check('a clean check-out shows no warning', async () => {
      await page.evaluate(() => window.kioskDismissResult());
      await settle(page, 400);
      await page.evaluate(() => window.kioskOnScan('VIS-OUT-CLEAN', null));
      await settle(page, 1500);
      const n = await page.locator('.kgp-warn').count();
      if (n !== 0) throw new Error('warning shown for a visitor owing nothing');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 11c · Kiosk: settling items as part of the check-out ──────────────────
  {
    const R = makeRunner('11c · Kiosk — settle items at check-out');
    const { page, context } = await openPage(browser, 'kiosk');
    await settle(page);

    await R.check('check-out lists each owed item with Returned/Kept', async () => {
      await page.evaluate(() => window.kioskOnScan('VIS-OUT-OWING', null));
      await page.waitForSelector('.kgp-choose', { timeout: 5000 });
      const n = await page.locator('.kgp-choose').count();
      if (n !== 2) throw new Error('expected 2 items to settle, got ' + n);
    });

    await R.check('complete button is disabled while items are unanswered', async () => {
      const dis = await page.locator('#kGpDoneBtn').isDisabled();
      if (!dis) throw new Error('check-out enabled before every item was answered');
    });

    await R.check('marking one Returned leaves the button disabled', async () => {
      await page.locator('.kgp-ret').first().click();
      await settle(page, 700);
      const dis = await page.locator('#kGpDoneBtn').isDisabled();
      if (!dis) throw new Error('button enabled with one item still unanswered');
    });

    await R.check('Kept asks for a reason before it is accepted', async () => {
      await page.locator('.kgp-keep').first().click();
      await settle(page, 400);
      if (!(await page.locator('#kGpReasonBox').isVisible())) {
        throw new Error('no reason prompt when marking an item Kept');
      }
    });

    await R.check('picking a reason answers the item and enables check-out', async () => {
      await page.locator('.kgp-reason').first().click();   // "Host approved"
      await settle(page, 800);
      const dis = await page.locator('#kGpDoneBtn').isDisabled();
      if (dis) throw new Error('check-out still disabled after every item was answered');
    });

    await R.check('a decision can be changed before completing', async () => {
      const n = await page.locator('.kgp-verdict').count();
      if (n !== 2) throw new Error('expected 2 answered rows, got ' + n);
      await page.locator('.kgp-verdict').first().click();
      await settle(page, 700);
      const dis = await page.locator('#kGpDoneBtn').isDisabled();
      if (!dis) throw new Error('undoing a decision did not re-disable check-out');
    });

    await R.check('completing settles returned items and keeps Kept ones outstanding', async () => {
      await page.locator('.kgp-ret').first().click();      // re-answer the undone row
      await settle(page, 700);

      // Assert on the settle call itself rather than re-reading getGatepass
      // afterwards: completing the check-out also fires loadData(), and under
      // full-suite load that poll can land first and reset the mock's state,
      // making a post-hoc read flaky. The settle response is deterministic.
      const res = await page.evaluate(() => new Promise(resolve => {
        const decisions = Object.keys(window.kGpDecisions).map(id => ({
          gatepassId: id,
          decision: window.kGpDecisions[id].decision,
          reason: window.kGpDecisions[id].reason
        }));
        google.script.run.withSuccessHandler(resolve)
          .settleGatepassAtCheckout('VIS-OUT-OWING', decisions);
      }));

      if (res.returned !== 1) throw new Error('expected 1 returned item, got ' + res.returned);
      // The Kept item must remain owed back — that is the whole point of the
      // register. Closing it would erase the record of what walked out.
      if (!res.kept || res.kept.length !== 1) {
        throw new Error('expected 1 kept item, got ' + JSON.stringify(res.kept));
      }
      if (!res.kept[0].reason) throw new Error('Kept item carries no reason');
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
    console.log(`\nSuite 11: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
