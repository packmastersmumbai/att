// @ts-check
const { expect } = require('@playwright/test');
const { test } = require('./helpers/fixture');

test.describe('Scanner page', () => {

  test('loads with camera open button visible', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    const btn = page.locator('#openCameraBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Open Camera');
  });

  test('sidebar navigation shows Scanner as active', async ({ page, loadPage }) => {
    await loadPage('scanner');
    const active = page.locator('.sb-item.active');
    await expect(active).toContainText('Scanner');
  });

  test('manual QR input is visible', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await expect(page.locator('#manualCode')).toBeVisible();
    await expect(page.locator('.btn-submit')).toBeVisible();
  });

  test('activity log loads on startup', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(600); // wait for mock GAS call
    const list = page.locator('#alList');
    await expect(list).not.toContainText('Loading…');
  });

  test('manual submit — CHECK_IN shows result card', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    // Loading state
    await expect(page.locator('.rc-spinner')).toBeVisible();
    // Wait for result card
    await page.waitForTimeout(500);
    const card = page.locator('.rc.check-in');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Priya Sharma');
    await expect(card).toContainText('CHECK IN');
  });

  test('manual submit — CHECK_OUT shows result card with duration', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP002');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    const card = page.locator('.rc.check-out');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Rahul Mehta');
    await expect(card).toContainText('CHECK OUT');
    await expect(card).toContainText('8h 18m');
  });

  test('manual submit — BLOCKED shows blocked card', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP-BLOCKED');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    const card = page.locator('.rc.blocked');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Access Denied');
  });

  test('manual submit — UNKNOWN shows unknown card', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'NOSUCHCODE');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    const card = page.locator('.rc.unknown');
    await expect(card).toBeVisible();
  });

  test('dismiss button closes result card and restores camera', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    await page.locator('.rc-close').click();
    // scanLeft should be visible again
    await expect(page.locator('#scanLeft')).toBeVisible();
    await expect(page.locator('#openCameraBtn')).toBeVisible();
  });

  test('toast appears after scan', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    const toast = page.locator('.scan-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Priya Sharma');
  });

  test('cooldown prevents immediate re-scan after dismiss', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    await page.locator('.rc-close').click();
    const btn = page.locator('#openCameraBtn');
    await expect(btn).toBeDisabled();
    const sub = page.locator('#camBtnSub');
    await expect(sub).toContainText('Ready in');
  });

  test('throughput counter updates after scan', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(600);
    const tp = page.locator('#tpNum');
    const val = await tp.textContent();
    expect(parseInt(val)).toBeGreaterThan(0);
  });

  test('gate selector has expected options', async ({ page, loadPage }) => {
    await loadPage('scanner');
    const opts = await page.locator('#gateSelect option').allTextContents();
    expect(opts).toContain('Main Gate');
    expect(opts).toContain('Reception');
  });

  test('status dot is visible on result card', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    await expect(page.locator('.rc-status-dot')).toBeVisible();
  });

  test('employee badge shows EMPLOYEE for EMP type', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'EMP001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    await expect(page.locator('.rc-badge.b-emp')).toContainText('EMPLOYEE');
  });

  test('visitor scan shows VISITOR badge (b-vis)', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);
    await page.fill('#manualCode', 'VIS001');
    await page.click('.btn-submit');
    await page.waitForTimeout(500);
    await expect(page.locator('.rc-badge.b-vis')).toContainText('VISITOR');
  });

  test('gate value is forwarded in processQRScan call', async ({ page, loadPage }) => {
    await loadPage('scanner');
    await page.waitForTimeout(300);

    // The gas-mock echoes the gate back in the response object (res.gate).
    // Select a non-default gate, submit, and verify the result card received it.
    // This proves submitCode() read and forwarded gateSelect.value correctly.
    await page.selectOption('#gateSelect', 'Side Gate');
    await page.fill('#manualCode', 'EMP001');

    // Capture the gate value passed into processQRScan.
    // post() calls run.withFailureHandler(fh).withSuccessHandler(sh).processQRScan(qr, gate)
    // The mock's makeRunner() returns a new object at each chaining step, so we must
    // intercept at the final chain level (after both withFailureHandler + withSuccessHandler).
    await page.evaluate(function() {
      window.__capturedGate = null;
      var origRun = window.google.script.run;
      var origWFH = origRun.withFailureHandler.bind(origRun);
      origRun.withFailureHandler = function(fh) {
        var mid = origWFH(fh);
        var origWSH = mid.withSuccessHandler.bind(mid);
        mid.withSuccessHandler = function(sh) {
          var final = origWSH(sh);
          var origPQS = final.processQRScan.bind(final);
          final.processQRScan = function(qrCode, gate) {
            window.__capturedGate = gate;
            return origPQS(qrCode, gate);
          };
          return final;
        };
        return mid;
      };
    });

    await page.click('.btn-submit');
    await page.waitForTimeout(500);

    const capturedGate = await page.evaluate(function() { return window.__capturedGate; });
    expect(capturedGate).toBe('Side Gate');
  });
});
