// @ts-check
const { expect } = require('@playwright/test');
const { test } = require('./helpers/fixture');

test.describe('Admin page — PIN gate', () => {

  test('shows PIN gate on load', async ({ page, loadPage }) => {
    await loadPage('admin');
    await expect(page.locator('#pinGate')).toBeVisible();
    await expect(page.locator('#adminPanel')).not.toBeVisible();
  });

  test('wrong PIN shows error', async ({ page, loadPage }) => {
    await loadPage('admin');
    await page.fill('#pinInput', '0000');
    await page.click('.btn-unlock');
    await page.waitForTimeout(400);
    await expect(page.locator('#pinError')).toContainText('Incorrect PIN');
  });

  test('correct PIN unlocks admin panel', async ({ page, loadPage }) => {
    await loadPage('admin');
    await page.fill('#pinInput', '1234');
    await page.click('.btn-unlock');
    await page.waitForTimeout(400);
    await expect(page.locator('#adminPanel')).toBeVisible();
    await expect(page.locator('#pinGate')).not.toBeVisible();
  });

  test('Enter key submits PIN', async ({ page, loadPage }) => {
    await loadPage('admin');
    await page.fill('#pinInput', '1234');
    await page.press('#pinInput', 'Enter');
    await page.waitForTimeout(400);
    await expect(page.locator('#adminPanel')).toBeVisible();
  });
});

test.describe('Admin page — Employee management', () => {

  async function unlock(page, loadPage) {
    await loadPage('admin');
    await page.fill('#pinInput', '1234');
    await page.click('.btn-unlock');
    // Wait for adminPanel to show AND employee table to populate
    await expect(page.locator('#adminPanel')).toBeVisible({ timeout: 5000 });
    // Wait until employee rows appear (mock has 200ms delay + GAS bridge call)
    await expect(page.locator('#empBody tr td strong').first()).toBeVisible({ timeout: 5000 });
  }

  test('employee table loads after unlock', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    const rows = page.locator('#empBody tr');
    // Should have data rows (not loading placeholder)
    await expect(rows.first()).not.toContainText('Loading');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('ACTIVE employee shows green badge and checked toggle', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await expect(page.locator('#badge-EMP001')).toHaveClass(/badge-green/);
    await expect(page.locator('#badge-EMP001')).toContainText('ACTIVE');
    // Hidden checkbox should be checked (use evaluate to bypass visibility check)
    const checked = await page.locator('.emp-tog-chk[data-id="EMP001"]').evaluate(el => el.checked);
    expect(checked).toBe(true);
  });

  test('INACTIVE employee shows gray badge and unchecked toggle', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await expect(page.locator('#badge-EMP002')).toHaveClass(/badge-gray/);
    await expect(page.locator('#badge-EMP002')).toContainText('INACTIVE');
    const checked = await page.locator('.emp-tog-chk[data-id="EMP002"]').evaluate(el => el.checked);
    expect(checked).toBe(false);
  });

  test('toggle turns ACTIVE employee INACTIVE', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    const chk = page.locator('.emp-tog-chk[data-id="EMP001"]');
    await expect(chk).toBeChecked();
    // Click the visible slider label, not the hidden checkbox
    await page.locator('.emp-toggle:has(.emp-tog-chk[data-id="EMP001"])').click();
    await page.waitForTimeout(500);
    const badge = page.locator('#badge-EMP001');
    await expect(badge).toContainText('INACTIVE');
    await expect(badge).toHaveClass(/badge-gray/);
  });

  test('toggle turns INACTIVE employee ACTIVE', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    const chk = page.locator('.emp-tog-chk[data-id="EMP002"]');
    await expect(chk).not.toBeChecked();
    // Click the visible slider label, not the hidden checkbox
    await page.locator('.emp-toggle:has(.emp-tog-chk[data-id="EMP002"])').click();
    await page.waitForTimeout(500);
    const badge = page.locator('#badge-EMP002');
    await expect(badge).toContainText('ACTIVE');
    await expect(badge).toHaveClass(/badge-green/);
  });

  test('Add Employee modal opens and closes', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Add Employee")');
    await expect(page.locator('#addEmpOverlay')).toHaveClass(/open/);
    await page.click('#addEmpOverlay .modal-close');
    await expect(page.locator('#addEmpOverlay')).not.toHaveClass(/open/);
  });

  test('Add Employee requires code and name', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Add Employee")');
    // Try saving without filling required fields
    await page.click('button:has-text("Save & Generate QR")');
    // Should show toast error, not close modal
    await expect(page.locator('#addEmpOverlay')).toHaveClass(/open/);
  });

  test('Add Employee saves new employee', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Add Employee")');
    await page.fill('#eCode', 'EMP999');
    await page.fill('#eName', 'Test Worker');
    await page.fill('#eDept', 'QA');
    await page.click('button:has-text("Save & Generate QR")');
    await page.waitForTimeout(500);
    // Modal closes and new employee row appears
    await expect(page.locator('#addEmpOverlay')).not.toHaveClass(/open/);
    await expect(page.locator('#empBody')).toContainText('Test Worker');
  });

  test('Lock button returns to PIN gate', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.locator('.btn-lock').click();
    await expect(page.locator('#pinGate')).toBeVisible();
    await expect(page.locator('#adminPanel')).not.toBeVisible();
  });

  test('Config tab is reachable', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Configuration")');
    await expect(page.locator('#tab-config')).toHaveClass(/active/);
    await expect(page.locator('#cfgOrgName')).toBeVisible();
  });

  test('Config loads org name from GAS', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Configuration")');
    await page.waitForTimeout(400);
    await expect(page.locator('#cfgOrgName')).toHaveValue('PackMasters');
  });

  test('Security Watchlist opens and shows blacklist', async ({ page, loadPage }) => {
    await unlock(page, loadPage);
    await page.click('button:has-text("Security Watchlist")');
    await page.waitForTimeout(400);
    await expect(page.locator('#blacklistModal')).toHaveClass(/open/);
    await expect(page.locator('#blBody')).toContainText('Bad Actor');
  });
});
