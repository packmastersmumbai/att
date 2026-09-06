/**
 * Suite 14 — Training calendar (Stage 1).
 *
 * Two halves:
 *  14a/14b render the page against the mock, because a calendar that renders
 *    everything green is indistinguishable from one that works — the mock
 *    deliberately carries a done, a due, an overdue and a future session.
 *  14c exercises the seed's date arithmetic directly. It decides when 36
 *    sessions a year actually land, and getting it wrong puts training on a
 *    Sunday or silently drops 29 February.
 */
const fs   = require('fs');
const path = require('path');
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');

/** Lift one function out of training.js and run it in isolation. */
function lift(name, stubs) {
  const body = (SRC.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/training.js');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

// GAS globals the lifted functions touch.
const GAS = {
  Utilities: {
    formatDate: (d, _tz, _fmt) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },
  Session: { getScriptTimeZone: () => 'Asia/Kolkata' }
};

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 14a · the grid ──────────────────────────────────────────────────────
  {
    const R = makeRunner('14a · Training — the calendar grid');
    const { page, context } = await openPage(browser, 'training');
    await settle(page, 900);

    await R.check('renders a row per topic and a column per month', async () => {
      const g = await page.evaluate(() => ({
        rows: document.querySelectorAll('#grid tbody tr').length,
        cols: document.querySelectorAll('#grid thead th').length
      }));
      if (g.cols !== 13) throw new Error('expected 13 columns (topic + 12 months), got ' + g.cols);
      if (g.rows !== 2)  throw new Error('expected 2 training topics, got ' + g.rows);
    });

    await R.check('each status renders with its own glyph, not colour alone', async () => {
      // A printed calendar is black and white, and some readers cannot
      // separate the hues at all.
      const cells = await page.evaluate(() =>
        [...document.querySelectorAll('#grid .cell')].map(c => ({
          cls: c.className, txt: c.textContent.trim()
        })));
      const done = cells.find(c => c.cls.includes('c-done'));
      const late = cells.find(c => c.cls.includes('c-late'));
      const due  = cells.find(c => c.cls.includes('c-due'));
      if (!done || !done.txt.startsWith('✓')) throw new Error('completed cell carries no glyph');
      if (!late || !late.txt.startsWith('!')) throw new Error('overdue cell carries no glyph');
      if (!due  || !due.txt.startsWith('◷'))  throw new Error('due cell carries no glyph');
    });

    await R.check('the cell shows the day of the month', async () => {
      const txt = await page.evaluate(() =>
        (document.querySelector('#grid .c-done') || {}).textContent || '');
      if (!/^✓\d{2}$/.test(txt.trim())) throw new Error('cell text is not a day number: ' + txt);
    });

    await R.check('KPIs count what the grid shows', async () => {
      const k = await page.evaluate(() =>
        [...document.querySelectorAll('.kpi')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      // Mock: 4 training rows — 1 done, 1 overdue, 1 due, 1 future.
      if (!k.some(x => /Sessions held\s*1\/4/.test(x))) throw new Error('session count wrong: ' + k.join(' | '));
      if (!k.some(x => /Overdue\s*1/.test(x)))          throw new Error('overdue count wrong: ' + k.join(' | '));
      if (!k.some(x => /Hours delivered\s*3\.0/.test(x))) throw new Error('hours wrong: ' + k.join(' | '));
    });

    await R.check('adherence measures what was DUE, not the whole year', async () => {
      // Dividing by every session planned for the year made a perfectly
      // on-schedule January read 8% — which reads as failure at a glance.
      // 1 done of 2 that had come due = 50%, not 1 of 4 = 25%.
      const pct = await page.evaluate(() => {
        const k = [...document.querySelectorAll('.kpi')]
          .find(e => /On-time so far/i.test(e.textContent));
        return k ? k.textContent.replace(/\s+/g, ' ') : '';
      });
      if (!/50%/.test(pct)) throw new Error('adherence should be 50% (1 of 2 due): ' + pct);
    });

    await R.check('every cell is reachable and operable by keyboard', async () => {
      // The grid's only action was a <span onclick> — unreachable without a
      // mouse, which fails WCAG 2.1.1 outright.
      const a = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.cell')];
        return {
          n: cells.length,
          buttons: cells.filter(c => c.tagName === 'BUTTON').length,
          labelled: cells.filter(c => (c.getAttribute('aria-label') || '').length > 5).length
        };
      });
      if (!a.n) throw new Error('no cells rendered');
      if (a.buttons !== a.n)  throw new Error(a.n - a.buttons + ' cells are not buttons');
      if (a.labelled !== a.n) throw new Error('cells without an accessible name');

      // ...and pressing one actually opens the session.
      await page.evaluate(() => document.querySelector('.cell').focus());
      await page.keyboard.press('Enter');
      await settle(page, 350);
      const open = await page.evaluate(() =>
        document.getElementById('panel').classList.contains('on'));
      if (!open) throw new Error('Enter on a focused cell did not open the session');
      await page.keyboard.press('Escape');
      await settle(page, 200);
    });

    await R.check('a planned session carries a glyph too', async () => {
      // Three states had a mark and the fourth did not, so on a black-and-white
      // print "planned" and "no session at all" were the same empty cell.
      const txt = await page.evaluate(() =>
        (document.querySelector('#grid .c-plan') || {}).textContent || '');
      if (!txt.trim()) throw new Error('no planned cell rendered');
      if (/^\d/.test(txt.trim())) throw new Error('planned cell is a bare number: ' + txt);
    });

    await R.check('the drill toggle swaps the grid, it is not a second page', async () => {
      await page.click('#typeSeg button[data-type="DRILL"]');
      await settle(page, 200);
      const d = await page.evaluate(() => ({
        rows: document.querySelectorAll('#grid tbody tr').length,
        head: (document.querySelector('#grid thead th') || {}).textContent || '',
        url:  location.href
      }));
      if (d.rows !== 1) throw new Error('expected 1 drill row, got ' + d.rows);
      if (!/drill/i.test(d.head)) throw new Error('header did not switch: ' + d.head);
      await page.click('#typeSeg button[data-type="TRAIN"]');
      await settle(page, 200);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 14b · the session panel ─────────────────────────────────────────────
  {
    const R = makeRunner('14b · Training — the session panel');
    const { page, context } = await openPage(browser, 'training');
    await settle(page, 900);

    await R.check('a cell opens the session with its agenda filled in', async () => {
      await page.click('#grid .c-done');
      await settle(page, 300);
      const p = await page.evaluate(() => ({
        open:   document.getElementById('panel').classList.contains('on'),
        title:  document.getElementById('pTitle').textContent,
        agenda: document.getElementById('pAgenda').textContent,
        items:  document.querySelectorAll('#pAgenda li').length,
        actual: document.getElementById('pActual').value
      }));
      if (!p.open) throw new Error('panel did not open');
      if (!/SOP/.test(p.title)) throw new Error('wrong session opened: ' + p.title);
      // The agenda must come from the topic library, not be retyped per session.
      if (p.items < 2) throw new Error('agenda not populated from the topic: ' + p.agenda);
      if (!p.actual) throw new Error('a completed session should show its actual date');
    });

    await R.check('Escape closes it', async () => {
      await page.keyboard.press('Escape');
      await settle(page, 250);
      const open = await page.evaluate(() => document.getElementById('panel').classList.contains('on'));
      if (open) throw new Error('panel stayed open');
    });

    await R.check('an unheld session opens with no actual date', async () => {
      await page.click('#grid .c-late');
      await settle(page, 300);
      const v = await page.evaluate(() => document.getElementById('pActual').value);
      if (v) throw new Error('an overdue session must not carry an actual date: ' + v);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 14c · seed date arithmetic ──────────────────────────────────────────
  {
    const R = makeRunner('14c · Training — seed dates');
    const planDate = lift('_planDateFor_', GAS);

    await R.check('a date carries into the target year unchanged', async () => {
      if (planDate('10/01', 2026) !== '2026-01-10') throw new Error(planDate('10/01', 2026));
      if (planDate('17/12', 2026) !== '2026-12-17') throw new Error(planDate('17/12', 2026));
    });

    await R.check('a Sunday moves to the Monday', async () => {
      // 25 Jan 2026 and 10 May 2026 are Sundays; Saturdays are working days
      // at this site, so they must NOT move.
      if (planDate('25/01', 2026) !== '2026-01-26') throw new Error('Sun 25 Jan -> ' + planDate('25/01', 2026));
      if (planDate('10/05', 2026) !== '2026-05-11') throw new Error('Sun 10 May -> ' + planDate('10/05', 2026));
      if (planDate('10/01', 2026) !== '2026-01-10') throw new Error('Sat 10 Jan must not move');
    });

    await R.check('29 February steps back in a non-leap year', async () => {
      if (planDate('29/02', 2024) !== '2024-02-29') throw new Error('2024 is a leap year');
      const d = planDate('29/02', 2026);
      if (!d.startsWith('2026-02-2')) throw new Error('29 Feb 2026 -> ' + d);
      if (d > '2026-02-28') throw new Error('produced a February date that does not exist: ' + d);
    });

    await R.check('every seeded 2026 date lands on a working day', async () => {
      const seed = lift('_trainingDateSeed_', {});
      const all = Object.values(seed()).flat();
      if (all.length !== 36) throw new Error('expected 36 seeded sessions, got ' + all.length);
      const sundays = all
        .map(d => planDate(d, 2026))
        .filter(iso => new Date(iso + 'T00:00:00').getDay() === 0);
      if (sundays.length) throw new Error('sessions landed on a Sunday: ' + sundays.join(', '));
    });

    await R.check('the seed matches the 2025 records it came from', async () => {
      const seed = lift('_trainingDateSeed_', {})();
      // 32 dated training sessions + 4 drills. The 33rd record carries no
      // date in the source document, so it is deliberately not seeded.
      const train = Object.keys(seed).filter(k => k.startsWith('TRN'))
                      .reduce((n, k) => n + seed[k].length, 0);
      const drill = Object.keys(seed).filter(k => k.startsWith('DRL'))
                      .reduce((n, k) => n + seed[k].length, 0);
      if (train !== 32) throw new Error('expected 32 training sessions, got ' + train);
      if (drill !== 4)  throw new Error('expected 4 drills, got ' + drill);
      // Spot-check against the real records.
      if (seed['TRN-05'].join() !== '07/03,30/07,14/10,17/12')
        throw new Error('Electrical Safety dates drifted: ' + seed['TRN-05'].join());
    });

    summary.push(R.report());
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 14: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
