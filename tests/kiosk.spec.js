// @ts-check
const { expect } = require('@playwright/test');
const { test } = require('./helpers/fixture');

test.describe('Kiosk page', () => {

  test('renders without errors', async ({ page, loadPage }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadPage('kiosk');
    await page.waitForTimeout(300);
    expect(errors.filter(e => !e.includes('net::ERR'))).toHaveLength(0);
  });

  test('clock is visible and running', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(1200);
    const t1 = await page.locator('#kClock').textContent();
    await page.waitForTimeout(1100);
    const t2 = await page.locator('#kClock').textContent();
    // Clock should have updated (seconds change)
    expect(t1).not.toEqual(t2);
  });

  test('date label is present', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(300);
    const date = await page.locator('#kDate').textContent();
    expect(date.length).toBeGreaterThan(5);
  });

  test('KPIs load after data fetch', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    await expect(page.locator('#kpiPresent')).not.toContainText('–');
    await expect(page.locator('#kpiVisitors')).not.toContainText('–');
  });

  test('total present is sum of employees + visitors', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    // Mock: present=3, activeVisitors=2 → totalPresent=5
    await expect(page.locator('#kpiPresent')).toContainText('5');
  });

  test('efficiency index shows percentage', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const eff = await page.locator('#kpiOnTime').textContent();
    expect(eff).toMatch(/\d+%/);
  });

  test('arrivals grid populates with cards', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const cards = page.locator('.a-card');
    await expect(cards).toHaveCount(3); // 3 unique names in mock data
  });

  test('newest arrival card has .newest class', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    await expect(page.locator('.a-card.newest')).toHaveCount(1);
  });

  test('scanner logs list shows entries', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const items = page.locator('.log-item');
    await expect(items).toHaveCount(3);
  });

  test('scanner logs show check-in arrow for entries without TimeOUT', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const inArrow = page.locator('.arr-in').first();
    await expect(inArrow).toBeVisible();
  });

  test('bottom bar shows SYSTEM ACTIVE', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await expect(page.locator('.kb-sys-txt')).toContainText('System Active');
  });

  test('scan prompt pulsing text is visible', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await expect(page.locator('.kb-scan-txt')).toBeVisible();
  });

  test('settings gear button opens settings panel', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.click('.k-settings-btn');
    await expect(page.locator('.settings-overlay')).toHaveClass(/open/);
  });

  test('settings panel has KPI Management tab active by default', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.click('.k-settings-btn');
    await expect(page.locator('#spNav-kpi')).toHaveClass(/active/);
    await expect(page.locator('#sp-section-kpi')).toHaveClass(/active/);
  });

  test('settings panel Display Filters tab switches correctly', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.click('.k-settings-btn');
    await page.click('#spNav-filters');
    await expect(page.locator('#sp-section-filters')).toHaveClass(/active/);
    await expect(page.locator('#sp-section-kpi')).not.toHaveClass(/active/);
  });

  test('settings save closes panel', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.click('.k-settings-btn');
    await page.click('.btn-sp-save');
    await expect(page.locator('.settings-overlay')).not.toHaveClass(/open/);
  });

  test('settings close via X button', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.click('.k-settings-btn');
    await page.click('.sp-close');
    await expect(page.locator('.settings-overlay')).not.toHaveClass(/open/);
  });

  test('last updated timestamp appears after data load', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const ts = await page.locator('#kLastUpdated').textContent();
    expect(ts).not.toEqual('—');
    expect(ts.length).toBeGreaterThan(3);
  });

  test('percent bar width is non-zero after data load', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    const width = await page.locator('#pctBar').evaluate(el => el.style.width);
    expect(width).not.toEqual('0%');
    expect(width).not.toEqual('');
  });

  test('arrivals show employee badge for EMP type', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    await expect(page.locator('.a-badge.b-emp').first()).toContainText('EMPLOYEE');
  });

  test('arrivals show visitor badge for VIS type', async ({ page, loadPage }) => {
    await loadPage('kiosk');
    await page.waitForTimeout(500);
    await expect(page.locator('.a-badge.b-vis')).toContainText('VISITOR');
  });
});
