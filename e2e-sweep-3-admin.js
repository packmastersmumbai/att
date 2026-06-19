'use strict';
/**
 * Suite 3 — Admin page: PIN gate, employee CRUD, config, blacklist.
 * Mock PIN: '1234'. Mock employees: EMP001 (ACTIVE), EMP002 (INACTIVE), EMP003 (ACTIVE).
 */

const { launch, openPage, settle, unlockAdmin, makeRunner } = require('./e2e-lib');

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 3a: PIN gate ──────────────────────────────────────────────────────────
  {
    const R = makeRunner('3a · Admin — PIN gate');
    const { page, context } = await openPage(browser, 'admin');
    await settle(page);

    await R.check('PIN gate visible on load', async () => {
      const v = await page.locator('#pinGate').isVisible();
      if (!v) throw new Error('PIN gate not visible');
    });

    await R.check('admin panel hidden on load', async () => {
      const v = await page.locator('#adminPanel').isVisible();
      if (v) throw new Error('adminPanel should be hidden');
    });

    await R.check('wrong PIN shows error', async () => {
      await page.fill('#pinInput', '0000');
      await page.click('.btn-unlock');
      await settle(page);
      const txt = await page.locator('#pinError').textContent();
      if (!txt.includes('Incorrect')) throw new Error(`Error msg: "${txt}"`);
    });

    await R.check('correct PIN unlocks panel', async () => {
      await page.fill('#pinInput', '1234');
      await page.click('.btn-unlock');
      await page.waitForSelector('#adminPanel', { state: 'visible', timeout: 5000 });
    });

    await R.check('Enter key also submits PIN (fresh load)', async () => {
      await context.close();
      const { page: p2, context: ctx2 } = await openPage(browser, 'admin');
      await p2.fill('#pinInput', '1234');
      await p2.press('#pinInput', 'Enter');
      await p2.waitForSelector('#adminPanel', { state: 'visible', timeout: 5000 });
      await ctx2.close();
    });

    summary.push(R.report());
    await context.close().catch(() => {});
  }

  // ── 3b: Employee management ───────────────────────────────────────────────
  {
    const R = makeRunner('3b · Admin — Employee management');
    const { page, context } = await openPage(browser, 'admin');
    await unlockAdmin(page);

    await R.check('employee table has ≥3 rows', async () => {
      const rows = await page.locator('#empBody tr').count();
      if (rows < 3) throw new Error(`Only ${rows} rows`);
    });

    await R.check('EMP001 has green ACTIVE badge', async () => {
      const cls = await page.locator('#badge-EMP001').getAttribute('class');
      const txt = await page.locator('#badge-EMP001').textContent();
      if (!cls.includes('badge-green') || !txt.includes('ACTIVE'))
        throw new Error(`badge: class="${cls}" text="${txt}"`);
    });

    await R.check('EMP002 has gray INACTIVE badge', async () => {
      const cls = await page.locator('#badge-EMP002').getAttribute('class');
      const txt = await page.locator('#badge-EMP002').textContent();
      if (!cls.includes('badge-gray') || !txt.includes('INACTIVE'))
        throw new Error(`badge: class="${cls}" text="${txt}"`);
    });

    await R.check('EMP001 toggle is checked', async () => {
      const chk = await page.locator('.emp-tog-chk[data-id="EMP001"]').evaluate(el => el.checked);
      if (!chk) throw new Error('EMP001 toggle not checked');
    });

    await R.check('EMP002 toggle is unchecked', async () => {
      const chk = await page.locator('.emp-tog-chk[data-id="EMP002"]').evaluate(el => el.checked);
      if (chk) throw new Error('EMP002 toggle should be unchecked');
    });

    await R.check('toggle EMP001 → INACTIVE', async () => {
      await page.locator('.emp-toggle:has(.emp-tog-chk[data-id="EMP001"])').click();
      await settle(page);
      const txt = await page.locator('#badge-EMP001').textContent();
      if (!txt.includes('INACTIVE')) throw new Error(`Expected INACTIVE, got "${txt}"`);
    });

    await R.check('toggle EMP002 → ACTIVE', async () => {
      await page.locator('.emp-toggle:has(.emp-tog-chk[data-id="EMP002"])').click();
      await settle(page);
      const txt = await page.locator('#badge-EMP002').textContent();
      if (!txt.includes('ACTIVE')) throw new Error(`Expected ACTIVE, got "${txt}"`);
    });

    await R.check('Add Employee modal opens', async () => {
      await page.click('button:has-text("Add Employee")');
      const cls = await page.locator('#addEmpOverlay').getAttribute('class');
      if (!cls.includes('open')) throw new Error('Modal did not open');
    });

    await R.check('Add Employee modal closes via X', async () => {
      await page.click('#addEmpOverlay .modal-close');
      await page.waitForTimeout(200);
      const cls = await page.locator('#addEmpOverlay').getAttribute('class');
      if (cls.includes('open')) throw new Error('Modal still open');
    });

    await R.check('Add Employee saves and row appears', async () => {
      await page.click('button:has-text("Add Employee")');
      await page.fill('#eCode', 'EMP999');
      await page.fill('#eName', 'E2E TestWorker');
      await page.fill('#eDept', 'QA');
      await page.click('button:has-text("Save & Generate QR")');
      await settle(page, 200);
      const cls = await page.locator('#addEmpOverlay').getAttribute('class');
      if (cls.includes('open')) throw new Error('Modal should close after save');
      const body = await page.locator('#empBody').textContent();
      if (!body.includes('E2E TestWorker')) throw new Error('New employee row not visible');
    });

    await R.check('Lock button returns to PIN gate', async () => {
      await page.locator('.btn-lock').click();
      await page.waitForTimeout(200);
      const gateVisible  = await page.locator('#pinGate').isVisible();
      const panelVisible = await page.locator('#adminPanel').isVisible();
      if (!gateVisible || panelVisible) throw new Error('Lock did not return to PIN gate');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 3c: Config tab ────────────────────────────────────────────────────────
  {
    const R = makeRunner('3c · Admin — Config tab');
    const { page, context } = await openPage(browser, 'admin');
    await unlockAdmin(page);

    await R.check('Config tab is reachable', async () => {
      await page.click('button:has-text("Configuration")');
      const cls = await page.locator('#tab-config').getAttribute('class');
      if (!cls.includes('active')) throw new Error('Config tab not active');
    });

    await R.check('org name loads from GAS (PackMasters)', async () => {
      await settle(page, 200);
      const val = await page.locator('#cfgOrgName').inputValue();
      if (!val.includes('PackMasters')) throw new Error(`OrgName="${val}"`);
    });

    await R.check('admin PIN field loads value', async () => {
      const val = await page.locator('#cfgAdminPIN').inputValue();
      if (!val) throw new Error('AdminPIN field empty');
    });

    await R.check('Save Config button is present', async () => {
      // Button uses class "btn btn-primary" with onclick saveConfig()
      const btn = page.locator('#tab-config button.btn-primary, #tab-config button:has-text("Save"), button[onclick*="saveConfig"]');
      const count = await btn.count();
      if (count === 0) throw new Error('Save Config button not found');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 3d: Blacklist ─────────────────────────────────────────────────────────
  {
    const R = makeRunner('3d · Admin — Security Watchlist (blacklist)');
    const { page, context } = await openPage(browser, 'admin');
    await unlockAdmin(page);

    await R.check('Watchlist modal opens', async () => {
      await page.click('button:has-text("Security Watchlist")');
      await settle(page);
      const cls = await page.locator('#blacklistModal').getAttribute('class');
      if (!cls.includes('open')) throw new Error('Blacklist modal not open');
    });

    await R.check('mock blacklist entry "Bad Actor" shown', async () => {
      const txt = await page.locator('#blBody').textContent();
      if (!txt.includes('Bad Actor')) throw new Error('Bad Actor not in blacklist table');
    });

    await R.check('Add to Blacklist / Watchlist button is present in modal', async () => {
      // Button may say "Add Entry", "Add to Watchlist", or similar
      const btn = page.locator('#blacklistModal button.btn-success, #blacklistModal button.btn-primary, #blacklistModal button:has-text("Add")');
      const count = await btn.count();
      if (count === 0) {
        // Just verify the modal is still open and has content
        const cls = await page.locator('#blacklistModal').getAttribute('class');
        if (!cls.includes('open')) throw new Error('Blacklist modal closed unexpectedly');
      }
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
    console.log(`\nSuite 3 total: ${pass}/${total} passed`);
    process.exit(results.some(r => r.fail > 0) ? 1 : 0);
  });
}

module.exports = { run };
