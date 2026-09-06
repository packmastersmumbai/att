'use strict';
/**
 * Suite 15 — Skill matrix (Stage 3).
 *
 * Three halves:
 *  15a renders the matrix against the mock, which deliberately carries every
 *    cell state — meets, gap, never trained, expired, pending and NA. A
 *    matrix that only ever draws green passes a test that only ever checks
 *    that it rendered.
 *  15b drives the cell panel and the override write, because the SOP's
 *    "attendance proposes, a supervisor confirms" is a claim about what the
 *    UI actually lets a person do.
 *  15c exercises the level computation in src/skillmatrix.js directly. It
 *    decides what the printed matrix asserts about a person's competence,
 *    and every branch of it is a claim an auditor can test.
 */
const fs   = require('fs');
const path = require('path');
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'skillmatrix.js'), 'utf8');

/** Lift one function out of skillmatrix.js and run it in isolation. */
function lift(name, stubs) {
  const body = (SRC.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/skillmatrix.js');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

// Globals the lifted functions close over.
const LEVELS = ['L1', 'L2', 'L3', 'L4'];
const GAS = {
  SKILL_LEVELS: LEVELS,
  Utilities: {
    formatDate: (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },
  Session: { getScriptTimeZone: () => 'Asia/Kolkata' }
};

const normLevel     = lift('_normLevel_', { SKILL_LEVELS: LEVELS });
const below         = lift('_below_',     { SKILL_LEVELS: LEVELS });
const monthsBetween = lift('_monthsBetween_', {});
const matrixKpis    = lift('_matrixKpis_', {});
const skillCell     = lift('_skillCell_', {
  SKILL_LEVELS: LEVELS, _normLevel_: normLevel, _below_: below,
  _monthsBetween_: monthsBetween, _isoDate_: v => String(v || '')
});

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 15a · the grid ──────────────────────────────────────────────────────
  {
    const R = makeRunner('15a · Skill matrix — the grid');
    const { page, context } = await openPage(browser, 'skillmatrix');
    await settle(page, 900);

    await R.check('renders a row per person plus the MIN REQUIRED row', async () => {
      const g = await page.evaluate(() => ({
        rows: document.querySelectorAll('#grid tbody tr').length,
        min:  document.querySelectorAll('#grid tbody tr.minrow').length,
        cols: document.querySelectorAll('#grid thead th').length
      }));
      // 3 skills + employee + overall + remarks
      if (g.cols !== 6) throw new Error('expected 6 columns, got ' + g.cols);
      if (g.min !== 1)  throw new Error('MIN REQUIRED row missing');
      // 2 active employees + the min row
      if (g.rows !== 3) throw new Error('expected 3 body rows, got ' + g.rows);
    });

    await R.check('MIN REQUIRED prints the policy level, not a person', async () => {
      const txt = await page.evaluate(() =>
        document.querySelector('#grid tbody tr.minrow').textContent);
      if (!/MIN REQUIRED/.test(txt)) throw new Error('min row is not labelled');
      if (!/L2/.test(txt)) throw new Error('min row carries no level: ' + txt);
    });

    await R.check('MIN REQUIRED says "by role" where roles disagree', async () => {
      // Security Awareness is N.A. for one person and L2 for another. One
      // printed number would be a claim the matrix does not hold either of
      // them to, so the row must decline to pick one.
      const mins = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr.minrow .lv')]
          .map(c => c.textContent.trim()));
      if (!mins.includes('by role'))
        throw new Error('a differing minimum was printed as a single level: ' + mins.join());
      if (mins.filter(m => m === 'L2').length !== 2)
        throw new Error('a uniform minimum stopped printing its level: ' + mins.join());
    });

    await R.check('a never-trained cell is blank, never L1', async () => {
      // The distinction the printed matrix exists to make: L1 means the
      // person sat the training and has not yet shown competence; blank
      // means they have never attended at all.
      const cell = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.lv')]
          .find(x => /never trained/.test(x.getAttribute('aria-label') || ''));
        return b ? b.textContent.trim() : null;
      });
      if (cell === null) throw new Error('no never-trained cell rendered');
      if (/L1/.test(cell)) throw new Error('never-trained rendered as L1: ' + cell);
      if (!/—/.test(cell)) throw new Error('never-trained carries no dash: ' + cell);
    });

    await R.check('every state carries a mark, not colour alone', async () => {
      // Printed in black and white, and read by people who cannot separate
      // the hues.
      const cells = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr:not(.minrow) .lv')]
          .map(c => ({ cls: c.className, txt: c.textContent.trim() })));
      const gap  = cells.find(c => c.cls.includes('l-gap'));
      const pend = cells.find(c => c.cls.includes('l-pend'));
      if (!gap  || !gap.txt.startsWith('!'))  throw new Error('below-minimum cell carries no mark');
      if (!pend || !pend.txt.startsWith('•')) throw new Error('pending cell carries no mark');
    });

    await R.check('an N.A. cell is not counted as a gap', async () => {
      const na = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.lv')]
          .find(x => /not applicable/.test(x.getAttribute('aria-label') || ''));
        return b ? { txt: b.textContent.trim(), cls: b.className } : null;
      });
      if (!na) throw new Error('no N.A. cell rendered');
      if (na.cls.includes('l-gap')) throw new Error('N.A. rendered as a gap');
      if (!/NA/.test(na.txt)) throw new Error('N.A. cell reads: ' + na.txt);
    });

    await R.check('OVERALL states MEETS only when every required skill is met', async () => {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr:not(.minrow)')].map(r => ({
          name: r.querySelector('.who-n') ? r.querySelector('.who-n').textContent.trim() : '',
          overall: r.querySelector('.ovr').textContent.trim(),
          gaps: [...r.querySelectorAll('.lv')].filter(c => c.className.includes('l-gap')).length
        })));
      rows.forEach(r => {
        if (r.gaps === 0 && r.overall !== 'MEETS')
          throw new Error(r.name + ' has no gaps but reads ' + r.overall);
        if (r.gaps > 0 && r.overall === 'MEETS')
          throw new Error(r.name + ' has ' + r.gaps + ' gaps but reads MEETS');
      });
    });

    await R.check('coverage excludes N.A. from the percentage', async () => {
      // 2 people × 3 skills = 6 cells, one of which is N.A. -> 5 required,
      // 2 met. Counting the N.A. as met would read 50%, not 40%.
      const cov = await page.evaluate(() =>
        document.querySelector('#kpis .kpi-v').textContent.trim());
      if (cov !== '40%') throw new Error('coverage reads ' + cov + ', expected 40%');
    });

    await R.check('the printed artefact carries its signature blocks', async () => {
      const t = await page.evaluate(() =>
        [...document.querySelectorAll('.sign div')].map(d => d.textContent.trim()).join('|'));
      if (t !== 'Prepared by|Reviewed by|Approved by')
        throw new Error('signature blocks read: ' + t);
    });

    await R.check('unsigned minimums are marked draft, and the mark prints', async () => {
      // Nobody has set MinRequired, so these levels are a derivation. Printing
      // them as though they were policy is what an auditor objects to.
      const d = await page.evaluate(() => {
        const el = document.querySelector('.minrow .draft');
        if (!el) return null;
        return { txt: el.textContent.trim(), title: el.getAttribute('title') || '' };
      });
      if (!d) throw new Error('no draft mark on defaulted minimums');
      if (!/draft/i.test(d.txt)) throw new Error('mark reads: ' + d.txt);
      if (!/SOP-SM-001/.test(d.title)) throw new Error('the mark does not say who must confirm');
      await page.emulateMedia({ media: 'print' });
      await settle(page, 250);
      const shown = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.minrow .draft')).display !== 'none');
      await page.emulateMedia({ media: 'screen' });
      await settle(page, 250);
      if (!shown) throw new Error('the draft mark is hidden on paper');
    });

    await R.check('minimums set in Config are NOT marked draft', async () => {
      await page.evaluate(() => { window.__mockMinSource = 'CONFIG'; load(); });
      await settle(page, 800);
      const still = await page.evaluate(() => !!document.querySelector('.minrow .draft'));
      await page.evaluate(() => { window.__mockMinSource = 'DEFAULT'; load(); });
      await settle(page, 800);
      if (still) throw new Error('signed-off minimums were still marked draft');
    });

    await R.check('printing neither clips columns nor truncates a skill name', async () => {
      // This is the audit artefact. A scroller that clips would silently drop
      // skill columns from the paper, and a truncated header cannot be
      // recovered from a tooltip once it is printed.
      await page.emulateMedia({ media: 'print' });
      await settle(page, 300);
      const p = await page.evaluate(() => {
        const sp = document.querySelector('.sk-h span');
        return {
          overflow: getComputedStyle(document.querySelector('.scroll')).overflowX,
          maxH: getComputedStyle(sp).maxHeight,
          truncated: sp.scrollHeight > sp.clientHeight + 1
        };
      });
      if (p.overflow !== 'visible') throw new Error('print scroller clips: ' + p.overflow);
      if (p.maxH !== 'none') throw new Error('print header still capped at ' + p.maxH);
      if (p.truncated) throw new Error('a skill name is truncated on paper');
      await page.emulateMedia({ media: 'screen' });
      await settle(page, 300);
    });

    await R.check('the legend names all four levels', async () => {
      const t = await page.evaluate(() => document.getElementById('legend').textContent);
      ['Beginner', 'Under supervision', 'Independent', 'Can train others']
        .forEach(n => { if (!t.includes(n)) throw new Error('legend omits ' + n); });
      if (!t.includes('Never trained')) throw new Error('legend omits the never-trained state');
    });

    await R.check('the department filter narrows the columns', async () => {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('#groupSeg button')]
          .find(x => x.textContent.trim() === 'Security');
        b.click();
      });
      await settle(page, 700);
      const cols = await page.evaluate(() =>
        document.querySelectorAll('#grid thead th.sk-h').length);
      if (cols !== 1) throw new Error('Security should show 1 skill column, got ' + cols);
      await page.evaluate(() => {
        [...document.querySelectorAll('#groupSeg button')]
          .find(x => x.textContent.trim() === 'All').click();
      });
      await settle(page, 700);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 15b · the cell panel and the override ───────────────────────────────
  {
    const R = makeRunner('15b · Skill matrix — confirming a level');
    const { page, context } = await openPage(browser, 'skillmatrix');
    await settle(page, 900);

    await R.check('clicking a cell opens its history', async () => {
      await page.evaluate(() =>
        document.querySelector('#grid tbody tr:not(.minrow) .lv').click());
      await settle(page, 700);
      const open = await page.evaluate(() =>
        document.getElementById('panel').classList.contains('on'));
      if (!open) throw new Error('panel did not open');
      const hist = await page.evaluate(() =>
        document.querySelectorAll('#pHist .hist-r').length);
      if (hist !== 2) throw new Error('expected 2 history rows, got ' + hist);
    });

    await R.check('a missed session reads as absent, not as a zero score', async () => {
      // "Did not attend" and "attended but was not assessed" are different
      // claims, and the panel is where a supervisor tells them apart.
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('#pHist .hist-r')].map(r => ({
          absent: r.className.includes('absent'),
          score: r.querySelector('.hist-s') ? r.querySelector('.hist-s').textContent.trim() : ''
        })));
      const missed = rows.find(r => r.absent);
      if (!missed) throw new Error('the missed session is not marked absent');
      if (missed.score === '0') throw new Error('absence rendered as a zero score');
      if (missed.score !== 'absent') throw new Error('absent row reads: ' + missed.score);
    });

    await R.check('the panel says where the current level came from', async () => {
      const t = await page.evaluate(() => document.getElementById('pNow').textContent);
      if (!/Set by|Suggested from attendance|never|lapsed|Not applicable/.test(t))
        throw new Error('no basis stated: ' + t);
    });

    await R.check('an existing override arrives pre-selected', async () => {
      // The first cell is an L3 override. Opening it must show that as the
      // current choice, or a supervisor re-picking it would read as a change
      // when it is a confirmation — and clicking it again clears the choice.
      const s = await page.evaluate(() => ({
        picked: window.PICKED,
        pressed: [...document.querySelectorAll('#pLevels button')]
          .filter(b => b.getAttribute('aria-pressed') === 'true')
          .map(b => b.textContent.trim())
      }));
      if (s.picked !== 'L3') throw new Error('pre-selected ' + s.picked);
      if (s.pressed.join() !== 'L3') throw new Error('pressed: ' + s.pressed.join());
    });

    await R.check('a level without a stated basis is refused', async () => {
      await page.evaluate(() => {
        document.getElementById('pReason').value = '';
        // L4, not L3 — clicking the already-selected level toggles it off,
        // which is a different thing to test.
        [...document.querySelectorAll('#pLevels button')]
          .find(b => b.textContent.trim() === 'L4').click();
        saveLevel();
      });
      await settle(page, 400);
      const m = await page.evaluate(() => document.getElementById('pMsg').textContent);
      if (!/based on/i.test(m)) throw new Error('saved without a reason; message was: ' + m);
      const wrote = await page.evaluate(() => (window.__mockLevels || []).length);
      if (wrote) throw new Error('an unjustified level reached the server');
    });

    await R.check('a confirmed level is written with its reason and assessor', async () => {
      await page.evaluate(() => { window.prompt = () => '1234'; });
      await page.evaluate(() => {
        document.getElementById('pReason').value = 'Observed on line 2, three shifts';
        document.getElementById('pBy').value = 'Anuj Pathak';
        saveLevel();
      });
      await settle(page, 900);
      const wrote = await page.evaluate(() => (window.__mockLevels || [])[0] || null);
      if (!wrote) throw new Error('nothing was written');
      if (wrote.level !== 'L4') throw new Error('wrote level ' + wrote.level);
      if (!wrote.reason) throw new Error('wrote no reason');
      if (wrote.by !== 'Anuj Pathak') throw new Error('wrote no assessor');
    });

    await R.check('a wrong PIN writes nothing', async () => {
      await page.evaluate(() => { window.__mockLevels = []; window.prompt = () => '9999'; });
      await page.evaluate(() =>
        document.querySelector('#grid tbody tr:not(.minrow) .lv').click());
      await settle(page, 700);
      await page.evaluate(() => {
        document.getElementById('pReason').value = 'No authority to do this';
        [...document.querySelectorAll('#pLevels button')]
          .find(b => b.textContent.trim() === 'L4').click();
        saveLevel();
      });
      await settle(page, 900);
      const wrote = await page.evaluate(() => (window.__mockLevels || []).length);
      if (wrote) throw new Error('a level was set without a valid PIN');
      const m = await page.evaluate(() => document.getElementById('pMsg').textContent);
      if (!/not accepted/i.test(m)) throw new Error('no rejection shown: ' + m);
    });

    await R.check('Escape closes the panel', async () => {
      await page.keyboard.press('Escape');
      await settle(page, 400);
      const open = await page.evaluate(() =>
        document.getElementById('panel').classList.contains('on'));
      if (open) throw new Error('panel stayed open');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 15c · the level computation ─────────────────────────────────────────
  {
    const R = makeRunner('15c · Skill matrix — how a level is decided');

    const skill = (min, topics) =>
      ({ SkillID: 'SKL-X', MinRequired: min, TopicIDs: topics || 'TRN-01' });
    const cell = (o) => skillCell(Object.assign({
      empId: 'EMP001', skill: skill('L2'), attendance: {}, validity: { 'TRN-01': 12 },
      override: null, passMark: 70, today: '2026-09-06'
    }, o));

    await R.check('no attendance is NEVER TRAINED, not L1', async () => {
      const c = cell({});
      if (c.level !== '') throw new Error('level is ' + c.level + ', expected blank');
      if (c.flag !== 'NEVER_TRAINED') throw new Error('flag is ' + c.flag);
      if (!c.gap) throw new Error('an untrained required skill must count as a gap');
    });

    await R.check('attended without a passing score is L1', async () => {
      const c = cell({ attendance: { 'TRN-01': { date: '2026-08-01', score: 55 } } });
      if (c.level !== 'L1') throw new Error('level is ' + c.level);
      if (c.flag !== 'PENDING') throw new Error('flag is ' + c.flag);
    });

    await R.check('a score exactly at the pass mark passes', async () => {
      // The boundary is where an off-by-one lives, and it decides whether a
      // person is recorded as competent.
      const c = cell({ attendance: { 'TRN-01': { date: '2026-08-01', score: 70 } } });
      if (c.level !== 'L2') throw new Error('70 with a pass mark of 70 gave ' + c.level);
    });

    await R.check('attended but not assessed is L1, not L2', async () => {
      // A blank score means "not assessed", which is not a passing claim.
      const c = cell({ attendance: { 'TRN-01': { date: '2026-08-01', score: '' } } });
      if (c.level !== 'L1') throw new Error('an unassessed attendee reads ' + c.level);
    });

    await R.check('L3 and L4 are never reached automatically', async () => {
      // SOP-SM-001 §6.2 makes these a human assessment. Computing them would
      // put the system in contradiction with the customer's own document.
      const c = cell({ attendance: { 'TRN-01': { date: '2026-09-01', score: 100 } } });
      if (c.level !== 'L2') throw new Error('a perfect score computed to ' + c.level);
    });

    await R.check('a lapsed level drops one step and flags EXPIRED', async () => {
      const c = cell({ attendance: { 'TRN-01': { date: '2024-01-15', score: 90 } } });
      if (c.level !== 'L1') throw new Error('lapsed L2 became ' + c.level);
      if (c.flag !== 'EXPIRED') throw new Error('flag is ' + c.flag);
      if (!c.gap) throw new Error('a lapsed L1 against an L2 minimum is a gap');
    });

    await R.check('validity is measured per topic, not assumed to be 12 months', async () => {
      const fresh = cell({
        attendance: { 'TRN-01': { date: '2025-11-01', score: 90 } },
        validity: { 'TRN-01': 24 }
      });
      if (fresh.flag === 'EXPIRED') throw new Error('a 24-month topic expired after 10 months');
      const stale = cell({
        attendance: { 'TRN-01': { date: '2025-11-01', score: 90 } },
        validity: { 'TRN-01': 6 }
      });
      if (stale.flag !== 'EXPIRED') throw new Error('a 6-month topic did not expire after 10');
    });

    await R.check('an override beats the computed level and records who and why', async () => {
      const c = cell({
        attendance: { 'TRN-01': { date: '2026-08-01', score: 40 } },
        override: { Level: 'L4', Reason: 'Trains the line', By: 'Anuj Pathak', At: '2026-08-20' }
      });
      if (c.level !== 'L4') throw new Error('override lost to the computation: ' + c.level);
      if (c.source !== 'OVERRIDE') throw new Error('source is ' + c.source);
      if (!c.reason || !c.by) throw new Error('override recorded no basis');
      if (c.gap) throw new Error('L4 against an L2 minimum is not a gap');
    });

    await R.check('MinRequired = NA renders N.A. and never counts as a gap', async () => {
      const c = cell({ skill: skill('NA') });
      if (c.level !== 'NA') throw new Error('level is ' + c.level);
      if (c.gap) throw new Error('N.A. counted as a gap');
    });

    await R.check('the role\'s minimum wins over the skill default', async () => {
      // A security guard is not short of a filling competency they were
      // never meant to have — the minimum belongs to the role.
      const c = cell({ skill: skill('L3'), minRequired: 'NA' });
      if (c.level !== 'NA') throw new Error('role minimum ignored: ' + c.level);
      if (c.gap) throw new Error('a skill outside the role counted as a gap');
    });

    await R.check('a role with no line falls back to the skill default', async () => {
      const byRole = lift('_minByRole_', {
        _normLevel_: normLevel,
        getConfigValue: () => 'Packaging Operator: SKL-01=L3, SKL-16=NA'
      })();
      const minFor = lift('_minFor_', {})
      if (minFor(byRole, 'Packaging Operator', 'SKL-01', 'L1') !== 'L3')
        throw new Error('the role line was not applied');
      if (minFor(byRole, 'Packaging Operator', 'SKL-16', 'L2') !== 'NA')
        throw new Error('NA on a role line was not applied');
      // A skill the role says nothing about, and a role with no line at all.
      if (minFor(byRole, 'Packaging Operator', 'SKL-05', 'L2') !== 'L2')
        throw new Error('an unlisted skill lost its default');
      if (minFor(byRole, 'Security Guard', 'SKL-01', 'L1') !== 'L1')
        throw new Error('an unlisted role lost its default');
      if (minFor(byRole, '', 'SKL-01', 'L2') !== 'L2')
        throw new Error('a person with no job role lost the default');
    });

    await R.check('a malformed MinRequired line is ignored, not crashed on', async () => {
      // This is hand-typed policy in a Config cell. It must degrade to the
      // skill defaults rather than take the whole matrix down.
      const byRole = lift('_minByRole_', {
        _normLevel_: normLevel,
        getConfigValue: () => 'no colon here\nRole A: SKL-01=L9, junk, SKL-02=L2\n: L3'
      })();
      if (byRole['Role A']['SKL-01']) throw new Error('L9 was accepted');
      if (byRole['Role A']['SKL-02'] !== 'L2')
        throw new Error('a valid pair beside a bad one was lost');
    });

    await R.check('the latest crediting session wins, across several topics', async () => {
      // One skill is built by several topics; the current claim rests on the
      // most recent of them, not on whichever the loop happened to see last.
      const c = cell({
        skill: skill('L2', 'TRN-01,TRN-04'),
        attendance: {
          'TRN-01': { date: '2025-02-01', score: 95 },
          'TRN-04': { date: '2026-08-01', score: 40 }
        },
        validity: { 'TRN-01': 12, 'TRN-04': 12 }
      });
      if (c.lastTrained !== '2026-08-01') throw new Error('used ' + c.lastTrained);
      if (c.level !== 'L1') throw new Error('the older passing score won: ' + c.level);
    });

    await R.check('coverage excludes N.A. from both sides of the fraction', async () => {
      const rows = [{ cells: [
        { level: 'L2', gap: false, flag: '' },
        { level: 'NA', gap: false, flag: '' },
        { level: 'L1', gap: true,  flag: 'PENDING' }
      ] }];
      const k = matrixKpis(rows);
      if (k.required !== 2) throw new Error('required counted ' + k.required + ', expected 2');
      if (k.coverage !== 50) throw new Error('coverage is ' + k.coverage + '%, expected 50%');
    });

    await R.check('a level short of the minimum is a gap, at every rank', async () => {
      if (!below('L1', 'L2')) throw new Error('L1 against L2 is not flagged');
      if (below('L3', 'L2'))  throw new Error('L3 against L2 was flagged');
      if (below('L2', 'L2'))  throw new Error('meeting the minimum exactly was flagged');
      if (!below('', 'L1'))   throw new Error('never-trained against L1 is not flagged');
      if (below('L1', 'NA'))  throw new Error('anything against N.A. was flagged');
    });

    await R.check('levels are read leniently but nothing invalid is accepted', async () => {
      if (normLevel('l3') !== 'L3')  throw new Error('lowercase rejected');
      if (normLevel(3) !== 'L3')     throw new Error('a bare number rejected');
      if (normLevel('N.A.') !== 'NA') throw new Error('N.A. with stops rejected');
      if (normLevel('L9') !== '')    throw new Error('L9 was accepted');
      if (normLevel('expert') !== '') throw new Error('free text was accepted');
    });

    await R.check('month arithmetic does not expire a level a day early', async () => {
      // 12 months to the day is still valid; a day later is not.
      if (monthsBetween('2025-09-06', '2026-09-06') !== 12)
        throw new Error('exactly a year measured ' + monthsBetween('2025-09-06', '2026-09-06'));
      if (monthsBetween('2025-09-07', '2026-09-06') !== 11)
        throw new Error('a day short measured ' + monthsBetween('2025-09-07', '2026-09-06'));
    });

    await R.check('the seeded skills map only to topics that exist', async () => {
      const skills = lift('_skillSeed_', {})();
      const topicSrc = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');
      // Every topic id the library defines, whatever its prefix — TRN and DRL
      // are delivered training, VID and QAC are the video and course library.
      // Matching on a hardcoded prefix list would silently stop checking the
      // moment a new kind of topic is added.
      const known = new Set((topicSrc.match(/'[A-Z]{3}-\d\d'/g) || [])
        .map(s => s.replace(/'/g, '')));
      skills.forEach(s => {
        String(s[4]).split(',').map(t => t.trim()).forEach(t => {
          if (!known.has(t)) throw new Error(s[0] + ' credits unknown topic ' + t);
        });
        if (!/^(L[1-4]|NA)$/.test(s[5])) throw new Error(s[0] + ' has a bad minimum: ' + s[5]);
      });
      // 10 process skills (Packaging, Labelling) plus 4 site-wide ones. The
      // site-wide four replaced eleven narrower competencies that had turned
      // "Common" into a bucket holding 8 of 21 skills and filtering nothing.
      if (skills.length !== 14) throw new Error('expected 14 skills, got ' + skills.length);
      const groups = [...new Set(skills.map(s => s[3]))].sort();
      if (groups.includes('Common'))
        throw new Error('"Common" is a bucket, not a department — it should be gone');
      groups.forEach(g => {
        const n = skills.filter(s => s[3] === g).length;
        if (n < 2) throw new Error('group "' + g + '" holds only ' + n + ' skill');
      });
    });

    await R.check('a redefined skill is rewritten, a dropped one is retired not deleted', async () => {
      // Eleven narrow skills were replaced by four broad ones under reused
      // ids. A plain idempotency guard would skip every existing id, leaving
      // the sheet holding names the code no longer knows about.
      const rows = [], cells = [];
      const run = lift('seedSkills', {
        _requireAdmin_: () => {},
        _ensureSkillSheets_: () => {},
        SKILL_SHEETS: { SKILLS: 'S' },
        _skillSeed_: () => [
          ['SKL-01', 'Filling', '', 'Packaging', 'TRN-01', 'L3'],       // unchanged
          ['SKL-11', 'Emergency Response', '', 'Site-wide', 'TRN-07', 'L2'] // redefined
        ],
        getSheetAsObjects: () => [
          { SkillID: 'SKL-01', Name: 'Filling', TopicIDs: 'TRN-01', MinRequired: 'L3', Active: 'YES' },
          // Same id, old definition — must be rewritten.
          { SkillID: 'SKL-11', Name: 'Waste Segregation', TopicIDs: 'TRN-03',
            MinRequired: 'L4', Active: 'YES' },
          // No longer in the seed — must be retired, not removed.
          { SkillID: 'SKL-17', Name: 'First Aid Response', TopicIDs: 'DRL-01',
            MinRequired: 'L1', Active: 'YES' }
        ],
        getSheet: () => ({
          getRange: () => ({
            getValues: () => [['SkillID','Name','NameHi','Group','TopicIDs','MinRequired','Active']],
            setValues: v => v.forEach(x => rows.push(x))
          }),
          getLastColumn: () => 7,
          appendRow: r => rows.push(r)
        }),
        findRowByValue: () => 2,
        setCell: (sh, row, col, val) => cells.push([col, val])
      })('tok');

      if (run.skillsUpdated !== 1)
        throw new Error('the redefined skill was not rewritten: ' + run.skillsUpdated);
      if (run.skillsAdded !== 0)
        throw new Error('an existing id was appended as a duplicate');
      if (run.skillsRetired !== 1)
        throw new Error('the dropped skill was not retired: ' + run.skillsRetired);
      if (!cells.some(c => c[0] === 'Active' && c[1] === 'NO'))
        throw new Error('retirement did not set Active=NO');
      // A supervisor's own minimum survives the rewrite — that is policy,
      // and the seed value is only a draft.
      const written = rows.find(r => r[0] === 'SKL-11');
      if (!written) throw new Error('the redefined skill was never written');
      if (written[1] !== 'Emergency Response')
        throw new Error('the new name was not applied: ' + written[1]);
      if (written[5] !== 'L4')
        throw new Error('the seed overwrote a minimum somebody had set: ' + written[5]);
    });

    await R.check('every topic credits at least one skill', async () => {
      // Product Stewardship and the Earthquake drill were added to the
      // library and bound to nothing, so attending either earned nobody a
      // competency. Nothing noticed, because the matrix still rendered.
      const skills = lift('_skillSeed_', {})();
      const credited = new Set();
      skills.forEach(s => String(s[4]).split(',')
        .forEach(t => credited.add(t.trim())));

      const topicSrc = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');
      const seedFn = (topicSrc.match(/function _trainingTopicSeed_[\s\S]*?\n}/) || [])[0] || '';
      const topics = [...new Set((seedFn.match(/'(TRN|DRL)-\d\d'/g) || [])
        .map(s => s.replace(/'/g, '')))];
      if (topics.length !== 16) throw new Error('expected 16 topics, got ' + topics.length);

      const orphans = topics.filter(t => !credited.has(t));
      if (orphans.length)
        throw new Error('these topics build no skill: ' + orphans.join(', '));
    });

    await R.check('setup seeds 2025 plus this year and next, without duplicates', async () => {
      // 2025 is the year the paper records cover; this year and next are
      // derived from it. A year already present must not appear twice.
      const years = lift('_defaultSeedYears_', {})();
      const now = new Date().getFullYear();
      if (years.indexOf(2025) === -1) throw new Error('2025 is not seeded: ' + years);
      if (years.indexOf(now) === -1)  throw new Error('this year is not seeded: ' + years);
      if (years.indexOf(now + 1) === -1) throw new Error('next year is not seeded: ' + years);
      if (years.length !== new Set(years).size) throw new Error('a year is seeded twice: ' + years);
      for (let i = 1; i < years.length; i++) {
        if (years[i] <= years[i - 1]) throw new Error('years are not in order: ' + years);
      }
    });

    await R.check('the quarterly review date is the end of the quarter', async () => {
      const next = lift('_nextReviewDate_', GAS);
      if (next('2026-09-06') !== '2026-09-30') throw new Error('Q3 gave ' + next('2026-09-06'));
      if (next('2026-01-02') !== '2026-03-31') throw new Error('Q1 gave ' + next('2026-01-02'));
      if (next('2026-12-31') !== '2026-12-31') throw new Error('Q4 gave ' + next('2026-12-31'));
    });

    summary.push(R.report());
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 15: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
