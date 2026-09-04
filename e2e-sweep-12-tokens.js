/**
 * Suite 12 — Shared design tokens (src/tokens.html).
 *
 * The whole safety argument for the shared token file is one claim: injecting
 * it changes NOTHING on any page today, because it lands before each page's
 * own <style> and every page overrides what it declares. Pages migrate later
 * by deleting a local token and inheriting the shared one.
 *
 * That claim is easy to break by accident — moving the injection to before
 * </head>, or adding !important — and the breakage is invisible in the e2e
 * suites, which never run doGet(). So it is asserted here directly.
 */
const fs = require('fs');
const path = require('path');
const { launch, makeRunner } = require('./e2e-lib');

const ROOT   = __dirname;
const TOKENS = fs.readFileSync(path.join(ROOT, 'src', 'tokens.html'), 'utf8');

// Every page that declares its own :root block.
const PAGES = ['admin', 'dashboard', 'reports', 'visitors', 'scanner',
               'kiosk', 'vreg', 'login', 'idcards', 'vpass'];

// The tokens most likely to be silently clobbered — both naming families.
const WATCH = ['--primary', '--color-primary', '--bg', '--color-bg',
               '--text', '--color-text', '--muted', '--color-text-muted',
               '--border', '--color-border', '--danger', '--color-danger',
               '--surface', '--color-surface', '--radius-md',
               '--font', '--font-sans'];

function pageHtml(name) {
  // doGet() never runs here, so strip the GAS scriptlets the page carries.
  return fs.readFileSync(path.join(ROOT, 'src', 'pages', name + '.html'), 'utf8')
           .replace(/<\?[=!]?[\s\S]*?\?>/g, '');
}

async function readTokens(page, html) {
  await page.setContent(html);
  return page.evaluate(names => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    names.forEach(n => { out[n] = cs.getPropertyValue(n).trim(); });
    return out;
  }, WATCH);
}

async function run() {
  const browser = await launch();
  const summary = [];

  {
    const R = makeRunner('12a · Design tokens — adoption is a no-op');
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const name of PAGES) {
      await R.check(name + ': keeps every token it declares', async () => {
        const html   = pageHtml(name);
        const before = await readTokens(page, html);
        const after  = await readTokens(page, html.replace('<head>', '<head>' + TOKENS));

        const broken = WATCH.filter(k => before[k] && before[k] !== after[k]);
        if (broken.length) {
          throw new Error('shared tokens overrode the page: ' +
            broken.map(k => `${k} ${before[k]} -> ${after[k]}`).join(', '));
        }
      });
    }

    await R.check('a page with no token of its own inherits the shared one', async () => {
      // Guards the other direction: if the file stopped defining defaults (or
      // regressed to a self-referential var(--x, y) cycle, which resolves to
      // nothing) this passes the check above while providing no value at all.
      const html = '<!doctype html><html><head>' + TOKENS +
                   '</head><body></body></html>';
      const got = await readTokens(page, html);
      if (!/#000666/i.test(got['--primary']))
        throw new Error('--primary did not resolve: ' + JSON.stringify(got['--primary']));
      if (!/#000666/i.test(got['--color-primary']))
        throw new Error('--color-primary did not resolve: ' + JSON.stringify(got['--color-primary']));
    });

    await R.check('both naming families resolve to the same value', async () => {
      // The fork this file exists to end: --primary and --color-primary must
      // never drift apart again.
      const html = '<!doctype html><html><head>' + TOKENS +
                   '</head><body></body></html>';
      const got = await readTokens(page, html);
      const pairs = [['--primary', '--color-primary'], ['--bg', '--color-bg'],
                     ['--text', '--color-text'], ['--danger', '--color-danger'],
                     ['--surface', '--color-surface'], ['--border', '--color-border']];
      const drift = pairs.filter(([a, b]) => got[a].toLowerCase() !== got[b].toLowerCase());
      if (drift.length)
        throw new Error('naming families disagree: ' +
          drift.map(([a, b]) => `${a}=${got[a]} vs ${b}=${got[b]}`).join(', '));
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
    console.log(`\nSuite 12: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
