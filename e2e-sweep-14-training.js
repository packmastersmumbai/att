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

    await R.check('long topic titles wrap instead of being clipped', async () => {
      // table-layout:fixed keeps the twelve months evenly spaced, but it will
      // clip a cell's content rather than widen for it — so the longest real
      // topic title has to be checked, not assumed.
      const clipped = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.topic')];
        cells.forEach(c => { if (!c.dataset.orig) c.dataset.orig = c.textContent; });
        // Longest title in the real 2026 library.
        cells[0].textContent = 'Emergency Response, Fire Extinguisher, Hose';
        const bad = cells.filter(c => c.scrollWidth > c.clientWidth + 1).length;
        cells.forEach(c => { c.textContent = c.dataset.orig; });
        return bad;
      });
      if (clipped) throw new Error(clipped + ' topic title(s) clipped');
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

    await R.check('the session panel shows the module and flags a draft', async () => {
      // A trainer opening a session should see what to teach without going
      // looking for it, and must be told when the module is still a draft.
      await page.click('#grid .c-done');
      await settle(page, 900);
      const m = await page.evaluate(() => {
        const b = document.getElementById('pModule');
        return { shown: b.style.display !== 'none', text: b.textContent,
                 height: Math.round(b.getBoundingClientRect().height) };
      });
      if (!m.shown) throw new Error('the module block is hidden');
      if (!/By the end, an attendee can/.test(m.text))
        throw new Error('objectives missing: ' + m.text.slice(0, 90));
      if (!/What an SOP is/.test(m.text)) throw new Error('content sections missing');
      if (!/pass mark 70%/.test(m.text)) throw new Error('the pass mark is not stated');
      if (!/site training records/.test(m.text))
        throw new Error('the module does not say where its content came from');
      if (!/DRAFT/.test(m.text))
        throw new Error('an unreviewed module does not say it is a draft');
      // The same flex trap that collapsed the drill panel: a block in a
      // column flex container shrinks below its own content unless told not
      // to. Compare rendered height against what the content needs, rather
      // than against a fixed number that a longer module would outgrow.
      const fit = await page.evaluate(() => {
        const b = document.getElementById('pModule');
        return { h: Math.round(b.getBoundingClientRect().height), need: b.scrollHeight };
      });
      if (fit.h < fit.need - 1)
        throw new Error('the module block is squashed: ' + fit.h + 'px for ' + fit.need + 'px of content');
      await page.keyboard.press('Escape');
      await settle(page, 250);
    });

    await R.check('an empty year offers the setup, and it seeds everything', async () => {
      // The empty state is the first thing anyone sees on a fresh install, and
      // its button is the only way to fill the module. Untested, it is a dead
      // end that looks like a working page.
      await page.evaluate(() => {
        window.prompt = () => '1234';
        DATA.topics = []; DATA.plan = [];
        render();
      });
      await settle(page, 300);
      const btn = await page.evaluate(() => {
        const b = document.querySelector('#grid .empty button');
        return b ? b.textContent.trim() : null;
      });
      if (!btn) throw new Error('the empty state offers no way out');
      if (!/set up/i.test(btn)) throw new Error('button reads: ' + btn);

      await page.evaluate(() => document.querySelector('#grid .empty button').click());
      await settle(page, 900);
      const ran = await page.evaluate(() => window.__mockSetup || 0);
      if (!ran) throw new Error('the setup never reached the server');
      // The report must survive the grid repaint that seeding triggers, and
      // must name the years AND the skills — otherwise a supervisor cannot
      // tell whether the matrix half of the module came up too.
      const note = await page.evaluate(() => {
        const m = document.getElementById('setupNote');
        return m && m.style.display !== 'none' ? m.textContent : '';
      });
      if (!note) throw new Error('the setup result did not survive the repaint');
      if (!/2025/.test(note) || !/skill/i.test(note))
        throw new Error('setup did not report what it did: ' + note);
      // The 2025 history the documents recorded must be reported too, or a
      // supervisor cannot tell it came across.
      if (!/attendance/i.test(note)) throw new Error('attendance not reported: ' + note);
      if (!/drill report/i.test(note)) throw new Error('drill reports not reported: ' + note);
      const onward = await page.evaluate(() =>
        !!document.querySelector('#setupNote a[href*="skillmatrix"]'));
      if (!onward) throw new Error('nothing points at the matrix that was just seeded');
    });

    await R.check('names that match no employee are named, not swallowed', async () => {
      // Their training is on paper but cannot be credited to anyone, so the
      // matrix will understate them. Saying nothing would let that pass for
      // a complete import.
      const warn = await page.evaluate(() => {
        const w = document.querySelector('#setupNote .setup-warn');
        return w ? w.textContent : '';
      });
      if (!warn) throw new Error('the unmatched names were not surfaced');
      if (!/TARUN MISHRA/.test(warn)) throw new Error('a missing person is not listed: ' + warn);
      // And it must say what to do about it, or it is just a complaint.
      if (!/Admin/.test(warn) || !/again/.test(warn))
        throw new Error('no remedy offered: ' + warn);
    });

    await R.check('a wrong PIN seeds nothing', async () => {
      await page.evaluate(() => {
        window.__mockSetup = 0;
        window.prompt = () => '9999';
        DATA.topics = []; DATA.plan = [];
        render();
        document.querySelector('#grid .empty button').click();
      });
      await settle(page, 900);
      const ran = await page.evaluate(() => window.__mockSetup || 0);
      if (ran) throw new Error('training was seeded without a valid PIN');
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

  // ── 14d · attendance capture (Stage 2) ─────────────────────────
  {
    const R = makeRunner('14d · Training — attendance and scores');
    const { page, context } = await openPage(browser, 'training');
    await settle(page, 900);
    await page.click('#grid .c-done');
    await page.waitForSelector('#pAtt .att-r', { timeout: 8000 });

    await R.check('the roster comes from the live employee master', async () => {
      // Driven off Employees rather than a second list, so a new joiner shows
      // up in training the same day they show up at the gate. INACTIVE staff
      // must not appear at all.
      const r = await page.evaluate(() =>
        [...document.querySelectorAll('#pAtt .att-r')].map(x => x.textContent.trim()));
      if (r.length !== 2) throw new Error('expected 2 active employees, got ' + r.length);
      if (r.join(' ').includes('Rahul')) throw new Error('an INACTIVE employee is on the roster');
    });

    await R.check('the score box is disabled until the person is marked present', async () => {
      // A score against someone who was not in the room is meaningless.
      const before = await page.evaluate(() =>
        document.querySelector('#pAtt .score').disabled);
      if (!before) throw new Error('score was editable before anyone was marked present');

      await page.click('#pAtt input[type=checkbox]');
      await settle(page, 150);
      const after = await page.evaluate(() =>
        document.querySelector('#pAtt .score').disabled);
      if (after) throw new Error('score stayed disabled after marking present');
    });

    await R.check('a score below the pass mark is flagged as it is typed', async () => {
      await page.fill('#pAtt .score', '65');
      await settle(page, 150);
      const low = await page.evaluate(() =>
        document.querySelector('#pAtt .score').classList.contains('low'));
      if (!low) throw new Error('65 was not flagged against a pass mark of 70');

      await page.fill('#pAtt .score', '70');
      await settle(page, 150);
      const still = await page.evaluate(() =>
        document.querySelector('#pAtt .score').classList.contains('low'));
      if (still) throw new Error('70 is a pass at the boundary, not a fail');
    });

    await R.check('unticking someone clears their score', async () => {
      // Otherwise a score lingers against a person recorded as absent.
      await page.click('#pAtt input[type=checkbox]');
      await settle(page, 150);
      const v = await page.evaluate(() => ({
        val: document.querySelector('#pAtt .score').value,
        off: document.querySelector('#pAtt .score').disabled
      }));
      if (v.val) throw new Error('score survived the person being unticked: ' + v.val);
      if (!v.off) throw new Error('score box stayed editable');
      await page.click('#pAtt input[type=checkbox]');
      await settle(page, 150);
    });

    await R.check('the footer counts present, scored and below', async () => {
      await page.fill('#pAtt .score', '65');
      await settle(page, 200);
      const t = await page.evaluate(() =>
        document.getElementById('pAttCount').textContent);
      if (!/1 of 2 present/.test(t)) throw new Error('present count wrong: ' + t);
      if (!/1 scored/.test(t))       throw new Error('scored count wrong: ' + t);
      if (!/1 below/.test(t))        throw new Error('below-pass count wrong: ' + t);
    });

    await R.check('select all marks everyone, clear unmarks everyone', async () => {
      await page.click('button[onclick="attAll(true)"]');
      await settle(page, 200);
      let n = await page.evaluate(() =>
        document.querySelectorAll('#pAtt input[type=checkbox]:checked').length);
      if (n !== 2) throw new Error('select all marked ' + n + ' of 2');

      await page.click('button[onclick="attAll(false)"]');
      await settle(page, 200);
      n = await page.evaluate(() =>
        document.querySelectorAll('#pAtt input[type=checkbox]:checked').length);
      if (n !== 0) throw new Error('clear left ' + n + ' marked');
    });

    await R.check('saving twice does not double-count anyone', async () => {
      // The server rewrites this session's rows rather than appending. An
      // append-only table would silently inflate every downstream count,
      // and the panel is edited repeatedly as a trainer works the list.
      await page.click('button[onclick="attAll(true)"]');
      await settle(page, 200);
      await page.click('#pSave');
      await settle(page, 900);

      await page.click('#grid .c-done');
      await page.waitForSelector('#pAtt .att-r', { timeout: 8000 });
      const marked = await page.evaluate(() =>
        document.querySelectorAll('#pAtt input[type=checkbox]:checked').length);
      if (marked !== 2) throw new Error('reopened with ' + marked + ' marked, expected 2');

      await page.click('#pSave');
      await settle(page, 900);
      const stored = await page.evaluate(() =>
        Object.keys((window.__mockAttendance || {})['PLN-1'] || {}).length);
      if (stored !== 2) throw new Error('second save produced ' + stored + ' rows, expected 2');
    });

    await R.check('names render as written, not shouted', async () => {
      // Each attendee row is a <label> nested inside .fld, so a descendant
      // selector meant for field captions rendered every worker's name in
      // uppercase with caption letter-spacing.
      const n = await page.evaluate(() => {
        const el = document.querySelector('#pAtt .att-n');
        return { text: el.textContent.trim(),
                 tf: getComputedStyle(el).textTransform };
      });
      if (n.tf === 'uppercase') throw new Error('attendee names are uppercased by CSS');
      if (n.text !== 'Priya Sharma') throw new Error('name rendered as: ' + n.text);
    });

    await R.check('every attendance control has an accessible name', async () => {
      await page.click('#grid .c-done');
      await page.waitForSelector('#pAtt .att-r', { timeout: 8000 });
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('#pAtt input')]
          .filter(i => !(i.getAttribute('aria-label') || '').trim()).length);
      if (bad) throw new Error(bad + ' attendance inputs have no accessible name');
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

    await R.check('a holiday moves too, and Sunday-into-a-holiday keeps walking', async () => {
      // 25 Jan 2026 is a Sunday and 26 Jan is Republic Day, which the app
      // already knows about. Shifting onto it would put training on a
      // gazetted holiday — nobody notices until the day itself.
      const off = { '2026-01-26': true };
      const d = planDate('25/01', 2026, off);
      if (d !== '2026-01-27') throw new Error('Sun into Republic Day -> ' + d);
      // A plain working day next to a holiday must not move.
      if (planDate('28/01', 2026, off) !== '2026-01-28')
        throw new Error('a working day was moved for a nearby holiday');
      // And a holiday on its own steps forward one.
      if (planDate('26/01', 2026, off) !== '2026-01-27')
        throw new Error('the holiday itself was not avoided');
    });

    await R.check('a pathological holiday list cannot hang the seeder', async () => {
      // Bounded rather than unbounded: a fortnight of consecutive non-working
      // days is not a real calendar, and hanging the seeder is worse than
      // scheduling one session badly.
      const off = {};
      for (let i = 1; i <= 28; i++) off['2026-03-' + String(i).padStart(2, '0')] = true;
      const d = planDate('02/03', 2026, off);
      if (!/^2026-03-\d\d$/.test(d)) throw new Error('returned ' + d);
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
      // 33 training (32 from the 2025 records + Product Stewardship, added in
      // 2026) and 5 drills (the four run in 2025 plus Earthquake, run in 2024).
      if (all.length !== 38) throw new Error('expected 38 seeded sessions, got ' + all.length);
      const sundays = all
        .map(d => planDate(d, 2026))
        .filter(iso => new Date(iso + 'T00:00:00').getDay() === 0);
      if (sundays.length) throw new Error('sessions landed on a Sunday: ' + sundays.join(', '));
    });

    await R.check('re-seeding an existing year tops it up, never duplicates it', async () => {
      // A topic added to the library later must reach a calendar that already
      // exists, and the year must NOT be rewritten — attendance and drill
      // reports hang off those rows by PlanID.
      const written = [], cells = [];
      const run = lift('seedTrainingYear', {
        _requireAdmin_: () => {},
        _ensureTrainingSheets_: () => {},
        _isoDate_: v => String(v || ''),
        _planDateFor_: (dd, y) => y + '-' + dd.split('/')[1] + '-' + dd.split('/')[0],
        _holidayLookup_: () => ({}),
        _trainingTopicSeed_: () => [],
        _trainingDateSeed_: () => ({ 'TRN-01': ['10/01'], 'TRN-11': ['03/02'] }),
        _actualDateOverrides_: () => ({ '2026': { 'TRN-01': [['2026-01-10', '2026-01-02']] } }),
        TRAINING_SHEETS: { TOPICS: 'T', PLAN: 'P' },
        // TRN-01 is already on the calendar; TRN-11 is the new topic.
        getSheetAsObjects: tab => tab === 'P'
          ? [{ PlanID: 'PLN-2026-001', Year: '2026', TopicID: 'TRN-01',
               PlannedDate: '2026-01-10', ActualDate: '' }]
          : [],
        getSheet: () => ({
          getRange: () => ({
            getValues: () => [['PlanID','Year','TopicID','Type','PlannedDate','ActualDate']],
            setValues: v => v.forEach(x => written.push(x))
          }),
          getLastColumn: () => 6, getLastRow: () => 2
        }),
        findRowByValue: () => 2,
        setCell: (sh, row, col, val) => cells.push([col, val])
      })(2026, 'tok');

      if (run.sessionsAdded !== 1)
        throw new Error('expected only the new topic to be added, got ' + run.sessionsAdded);
      if (written[0][2] !== 'TRN-11')
        throw new Error('added the wrong topic: ' + written[0][2]);
      if (run.alreadyPresent !== 1)
        throw new Error('the existing session was not recognised: ' + run.alreadyPresent);
      // And the existing row's actual date is corrected in place.
      if (run.datesCorrected !== 1)
        throw new Error('the real date was not applied: ' + run.datesCorrected);
      if (!cells.some(c => c[0] === 'ActualDate' && c[1] === '2026-01-02'))
        throw new Error('ActualDate not set to the record date: ' + JSON.stringify(cells));
      // The new PlanID must not collide with the one already there.
      if (written[0][0] === 'PLN-2026-001')
        throw new Error('the top-up minted a PlanID that already exists');
    });

    await R.check('a real session date beats the derived one', async () => {
      // The 2026 SOP session was derived onto 10/01 but the record dates it
      // 02/01. Without the override the calendar shows it overdue on a day it
      // was never held, and absent on the day it was.
      const ov = lift('_actualDateOverrides_', {})();
      const y26 = ov['2026'] || {};
      const sop = (y26['TRN-01'] || [])[0];
      if (!sop) throw new Error('the 2026 SOP override is missing');
      if (sop[0] !== '2026-01-10' || sop[1] !== '2026-01-02')
        throw new Error('SOP override reads ' + JSON.stringify(sop));
      // Product Stewardship: derived and actual agree, and it must still be
      // marked as run rather than left blank because the dates match.
      const ps = (y26['TRN-11'] || [])[0];
      if (!ps || ps[1] !== '2026-02-03')
        throw new Error('the Product Stewardship override is missing or wrong');
      // An override must point at a date the derivation actually produces,
      // or it silently never fires.
      const planDate = lift('_planDateFor_', GAS);
      const seeded = lift('_trainingDateSeed_', {})();
      Object.keys(y26).forEach(topic => {
        y26[topic].forEach(pair => {
          const derived = (seeded[topic] || []).map(dd => planDate(dd, 2026));
          if (derived.indexOf(pair[0]) === -1)
            throw new Error(topic + ' override targets ' + pair[0] +
                            ', which the seed never produces (' + derived.join(', ') + ')');
        });
      });
    });

    await R.check('the 2025 attendance seed matches the records it came from', async () => {
      // 7 of the 33 Word records carry a typed attendance table; the other 26
      // are blank. 57 rows across those seven.
      const att = lift('_attendanceSeed_', {})();
      if (att.length !== 7) throw new Error('expected 7 sessions, got ' + att.length);
      const rows = att.reduce((n, [, names]) => n + names.length, 0);
      if (rows !== 57) throw new Error('expected 57 attendance rows, got ' + rows);
      // Spot-check the largest against the document.
      const dec = att.filter(([d]) => d === '2025-12-17')[0];
      if (!dec) throw new Error('the 17 Dec session is missing');
      if (dec[1].length !== 11) throw new Error('17 Dec had 11 attendees, got ' + dec[1].length);
      // Every date must be one the plan actually seeds, or the rows attach to
      // nothing and vanish silently.
      const planDates = lift('_trainingDateSeed_', {})();
      const known = new Set();
      Object.values(planDates).forEach(ds => ds.forEach(dd => {
        const [d, m] = dd.split('/');
        known.add(`2025-${m}-${d}`);
      }));
      att.forEach(([d]) => {
        if (!known.has(d)) throw new Error('attendance on ' + d + ' has no planned session');
      });
    });

    await R.check('the alias table maps records to the current roster', async () => {
      // These are substitutions the CUSTOMER supplied. The system cannot
      // infer that "Atul Waghmare" on a 2025 record is Shikha Kumar today,
      // so an alias absent from this table must never be invented.
      const a = lift('_nameAliasDefaults_', {})();
      const want = {
        'ASHOK PATOLE': 'ASHOK POTALE',      // transposed spelling
        'ATUL WAGHMARE': 'SHIKHA KUMAR',
        'SATENDRA YADAV': 'HARISH SINGH',
        'AVINASH VASANT': 'DILIP MAHALE',
        'KRIPASANKAR': 'DEEPAK NISHAD',
        'RIDDHI MESTRY': 'KHUSHI PASWAN'
      };
      Object.keys(want).forEach(k => {
        if (a[k] !== want[k]) throw new Error(k + ' maps to ' + a[k] + ', expected ' + want[k]);
      });
      // TARUN MISHRA and RAJNI were deliberately NOT mapped. Adding a guess
      // here would credit someone with training they did not attend.
      if (a['TARUN MISHRA']) throw new Error('TARUN MISHRA was given an unrequested alias');
      if (a['RAJNI']) throw new Error('RAJNI was given an unrequested alias');
    });

    await R.check('Config can override or cancel an alias without a deploy', async () => {
      const aliases = lift('_nameAliases_', {
        _nameAliasDefaults_: lift('_nameAliasDefaults_', {}),
        getConfigValue: () => 'ATUL WAGHMARE = SOMEONE ELSE\nKRIPASANKAR ='
      })();
      if (aliases['ATUL WAGHMARE'] !== 'SOMEONE ELSE')
        throw new Error('Config did not override a default: ' + aliases['ATUL WAGHMARE']);
      // A blank right-hand side cancels the default rather than being ignored.
      if (aliases['KRIPASANKAR']) throw new Error('a blank alias did not cancel the default');
      // Untouched defaults survive.
      if (aliases['SATENDRA YADAV'] !== 'HARISH SINGH')
        throw new Error('an unrelated default was lost');
    });

    await R.check('an alias never double-credits somebody in one session', async () => {
      // Harish Singh attends 18/06 under his own name AND as the alias for
      // Satendra Yadav in other sessions. If those ever coincided, one person
      // would get two rows for one session and inflate every count.
      const seed = lift('_attendanceSeed_', {})();
      const alias = lift('_nameAliasDefaults_', {})();
      seed.forEach(([date, names]) => {
        const resolved = names.map(n => alias[n] || n);
        const dupes = resolved.filter((v, i) => resolved.indexOf(v) !== i);
        if (dupes.length)
          throw new Error(date + ' resolves ' + dupes.join(', ') + ' more than once');
      });
      // And the seeder must dedupe anyway, because Config can add an alias
      // tomorrow that collides. Exercised rather than grepped: run the real
      // function against a session where two names resolve to one person.
      const rows = [];
      const run = lift('seedTrainingAttendance', {
        _requireAdmin_: () => {},
        _ensureTrainingSheets_: () => {},
        _isoDate_: v => String(v || ''),
        _normName_: lift('_normName_', {}),
        _nameAliases_: () => ({ 'SATENDRA YADAV': 'HARISH SINGH' }),
        _attendanceSeed_: () => [['2025-01-01', ['HARISH SINGH', 'SATENDRA YADAV']]],
        SHEETS: { EMPLOYEES: 'Employees' },
        TRAINING_SHEETS: { PLAN: 'P', ATTENDANCE: 'A' },
        getSheetAsObjects: tab =>
          tab === 'Employees' ? [{ EmpID: '825', Name: 'HARISH SINGH' }]
          : tab === 'P' ? [{ PlanID: 'PLN-1', PlannedDate: '2025-01-01' }]
          : [],
        getSheet: () => ({
          getRange: (r, c, nr, nc) => ({
            getValues: () => [['PlanID', 'EmpID', 'Name', 'Present', 'Score', 'RecordedAt']],
            setValues: v => { v.forEach(x => rows.push(x)); }
          }),
          getLastColumn: () => 6,
          getLastRow: () => 1
        })
      })('tok');
      if (rows.length !== 1)
        throw new Error('one person got ' + rows.length + ' rows for one session');
      if (run.merged !== 1) throw new Error('the duplicate was not reported: merged=' + run.merged);
    });

    await R.check('a name is matched exactly, never fuzzily', async () => {
      // 'RAJNI' in the records loosely matches 'DHRUV RAJ NISHAD' on the
      // employee sheet. Crediting that person with safety training they did
      // not attend is exactly the failure an audit looks for.
      const norm = lift('_normName_', {});
      if (norm('Anuj Pathak') !== norm('ANUJ  PATHAK'))
        throw new Error('case and spacing should not matter');
      if (norm('RAJNI') === norm('DHRUV RAJ NISHAD'))
        throw new Error('a substring match would credit the wrong person');
      if (norm('ASHOK PATOLE') === norm('ASHOK POTALE'))
        throw new Error('a transposed spelling must NOT match silently');
    });

    await R.check('no attendance carries a fabricated score', async () => {
      // The paper records no scores. A zero would read as a failed test on
      // the matrix; blank correctly reads as "not assessed".
      const src = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');
      const fn = (src.match(/function seedTrainingAttendance[\s\S]*?\n}/) || [])[0] || '';
      if (!fn) throw new Error('seedTrainingAttendance not found');
      if (!/Score:\s*''/.test(fn)) throw new Error('the seed does not store a blank score');
      if (/Score:\s*0\b/.test(fn)) throw new Error('the seed stores a zero score');
    });

    await R.check('the seed matches the 2025 records it came from', async () => {
      const seed = lift('_trainingDateSeed_', {})();
      // 32 dated training sessions + 4 drills. The 33rd record carries no
      // date in the source document, so it is deliberately not seeded.
      const train = Object.keys(seed).filter(k => k.startsWith('TRN'))
                      .reduce((n, k) => n + seed[k].length, 0);
      const drill = Object.keys(seed).filter(k => k.startsWith('DRL'))
                      .reduce((n, k) => n + seed[k].length, 0);
      // 32 of the training sessions come from the 2025 records; the 33rd is
      // Product Stewardship, which first appears in the 2026 folder. The 5th
      // drill is Earthquake, run in 2024 but not in 2025.
      if (train !== 33) throw new Error('expected 33 training sessions, got ' + train);
      if (drill !== 5)  throw new Error('expected 5 drills, got ' + drill);
      const y2025 = Object.keys(seed).filter(k => k.startsWith('TRN') && k !== 'TRN-11')
                      .reduce((n, k) => n + seed[k].length, 0);
      if (y2025 !== 32) throw new Error('the 2025 record count drifted: ' + y2025);
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
