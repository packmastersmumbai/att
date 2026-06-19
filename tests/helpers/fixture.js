const { test: base } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { GAS_MOCK_SCRIPT } = require('./gas-mock');

const ROOT = path.join(__dirname, '../../src/pages');

/**
 * Load an HTML page, strip GAS template expressions, inject mock google.script.run,
 * and serve it as a data URL in the browser.
 */
async function loadPage(page, pageName) {
  const filePath = path.join(ROOT, pageName + '.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // Strip GAS template tags: <?= expr ?> and <? ... ?>
  html = html.replace(/<\?=\s*[^?]+\?>/g, '"__GAS_TEMPLATE__"');
  html = html.replace(/<\?\s*[^?]+\?>/g, '');

  // Replace appUrl placeholder strings with empty string
  html = html.replace(/__GAS_TEMPLATE__/g, '""');

  // Inject mock before any other scripts
  const mockTag = `<script>${GAS_MOCK_SCRIPT}</script>`;
  html = html.replace('<head>', '<head>' + mockTag);

  // Use data URL to load in browser without a server
  const encoded = Buffer.from(html).toString('base64');
  await page.goto('data:text/html;base64,' + encoded);
  await page.waitForLoadState('domcontentloaded');
}

const test = base.extend({
  loadPage: async ({ page }, use) => {
    await use((pageName) => loadPage(page, pageName));
  },
});

module.exports = { test, loadPage };
