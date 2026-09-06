'use strict';
/**
 * Suite 16 — Mock drills.
 *
 * Three halves:
 *  16a renders the register and the procedure reference against the mock,
 *    which deliberately carries a drill that met its target, one that ran
 *    over, and one still overdue — a register where every row reads
 *    SATISFACTORY proves nothing about the page.
 *  16b drives the report form: the validation, the live response clock, the
 *    evidence upload and the printed artefact. A drill report is the audit
 *    document, so what it refuses to record matters as much as what it saves.
 *  16c exercises the server logic in src/mockdrill.js directly — the
 *    validation, the response time and the outcome verdict, each of which is
 *    a claim an auditor can test.
 */
const fs   = require('fs');
const path = require('path');
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'mockdrill.js'), 'utf8');

/** Lift one function out of mockdrill.js and run it in isolation. */
function lift(name, stubs) {
  const body = (SRC.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/mockdrill.js');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

const isTime         = lift('_isTime_', {});
const minutesBetween = lift('_minutesBetween_', { _isTime_: isTime });
const validate       = lift('_validateDrillReport_', { _isTime_: isTime, _minutesBetween_: minutesBetween });
const outcome        = lift('_drillOutcome_', { _minutesBetween_: minutesBetween });
const splitList      = lift('_splitList_', {});

/** A report that passes validation, so each test can break one thing. */
function goodReport(over) {
  return Object.assign({
    planId: 'PLN-D2', drillDate: '2026-11-24',
    startTime: '10:05', endTime: '10:25',
    location: 'Loading Bay',
    team: { SiteInCharge: 'Tarun Mishra' },
    stepResults: [
      { step: 1, text: 'Stop the source', done: true, remark: '' },
      { step: 2, text: 'Cordon the area', done: true, remark: '' }
    ],
    recommendations: []
  }, over || {});
}

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 16a · the register and the procedures ───────────────────────────────
  {
    const R = makeRunner('16a · Mock drills — the register');
    const { page, context } = await openPage(browser, 'mockdrill');
    await settle(page, 900);

    await R.check('one row per planned drill', async () => {
      const rows = await page.evaluate(() =>
        document.querySelectorAll('#grid tbody tr').length);
      if (rows !== 3) throw new Error('expected 3 drills, got ' + rows);
    });

    await R.check('the response time is shown against its target', async () => {
      // A bare "28 min" says nothing. Beside a 20-minute target it is a finding.
      const txt = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr')]
          .map(r => r.textContent).join(' | '));
      if (!/35\/40/.test(txt)) throw new Error('on-target drill lost its target: ' + txt);
      if (!/28\/20/.test(txt)) throw new Error('over-target drill lost its target: ' + txt);
    });

    await R.check('an over-target response is marked, not just printed', async () => {
      const marked = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr')].some(r => {
          const cells = [...r.querySelectorAll('td')];
          const resp = cells[3];
          return resp && /28\/20/.test(resp.textContent) &&
                 /var\(--bad\)|rgb\(185, 28, 28\)/.test(resp.getAttribute('style') || '');
        }));
      if (!marked) throw new Error('the over-target response carries no visual mark');
    });

    await R.check('outcomes are distinguishable, and an overdue drill says so', async () => {
      const tags = await page.evaluate(() =>
        [...document.querySelectorAll('#grid .tag')].map(t => t.textContent.trim()));
      if (!tags.includes('SATISFACTORY')) throw new Error('no satisfactory outcome: ' + tags);
      if (!tags.includes('NEEDS IMPROVEMENT')) throw new Error('no shortfall outcome: ' + tags);
      if (!tags.includes('OVERDUE')) throw new Error('the un-run drill is not flagged: ' + tags);
    });

    await R.check('open actions are surfaced on the row that carries them', async () => {
      const txt = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr')]
          .filter(r => /Spill/.test(r.textContent))[0].textContent);
      if (!/2 open/.test(txt)) throw new Error('open actions not shown: ' + txt);
    });

    await R.check('evidence counts distinguish photos from videos', async () => {
      const txt = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr')]
          .filter(r => /First Aid/.test(r.textContent))[0].textContent);
      if (!/2 photos/.test(txt)) throw new Error('photo count missing: ' + txt);
      if (!/1 video/.test(txt)) throw new Error('video count missing: ' + txt);
    });

    await R.check('a drill not yet run offers to record it', async () => {
      const label = await page.evaluate(() =>
        [...document.querySelectorAll('#grid tbody tr')]
          .filter(r => /Fire Safety/.test(r.textContent))[0]
          .querySelector('button').textContent.trim());
      if (!/record/i.test(label)) throw new Error('button reads: ' + label);
    });

    await R.check('the procedure reference lists numbered steps and equipment', async () => {
      const p = await page.evaluate(() => ({
        cards: document.querySelectorAll('#procs .proc').length,
        steps: document.querySelectorAll('#procs .proc ol li').length,
        equip: document.querySelectorAll('#procs .proc-eq').length,
        meta:  document.querySelector('#procs .proc-m').textContent
      }));
      if (p.cards !== 2) throw new Error('expected 2 procedures, got ' + p.cards);
      if (p.steps < 4) throw new Error('procedures carry no steps: ' + p.steps);
      if (!p.equip) throw new Error('no equipment listed');
      // Target time belongs on the procedure: it is what the drill is judged by.
      if (!/target \d+ min/.test(p.meta)) throw new Error('procedure omits its target: ' + p.meta);
    });

    await R.check('KPIs report readiness, not just activity', async () => {
      const k = await page.evaluate(() =>
        [...document.querySelectorAll('#kpis .kpi')].map(x => x.textContent));
      const joined = k.join(' | ');
      if (!/Within target time/i.test(joined)) throw new Error('no on-time KPI: ' + joined);
      if (!/Open actions/i.test(joined)) throw new Error('no open-actions KPI: ' + joined);
      if (!/50%/.test(joined)) throw new Error('on-time percentage wrong: ' + joined);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 16b · the report form ───────────────────────────────────────────────
  {
    const R = makeRunner('16b · Mock drills — recording one');
    const { page, context } = await openPage(browser, 'mockdrill');
    await settle(page, 900);

    await R.check('opening a drill loads its procedure as the assessment', async () => {
      await page.evaluate(() => openReport('PLN-D2'));
      await settle(page, 800);
      const s = await page.evaluate(() => ({
        open: document.getElementById('panel').classList.contains('on'),
        steps: document.querySelectorAll('#fSteps .step').length,
        scenario: document.getElementById('fScenario').value,
        type: document.getElementById('fType').value,
        location: document.getElementById('fLocation').value,
        team: document.querySelectorAll('#fTeam .fld').length
      }));
      if (!s.open) throw new Error('the panel did not open');
      if (s.steps !== 4) throw new Error('expected 4 procedure steps, got ' + s.steps);
      if (!s.scenario) throw new Error('the scenario did not pre-fill');
      if (s.type !== 'SPILL CONTROL') throw new Error('emergency type reads: ' + s.type);
      if (s.location !== 'Loading Bay') throw new Error('location did not pre-fill');
      if (s.team !== 4) throw new Error('expected 4 ERT roles, got ' + s.team);
    });

    await R.check('every section renders at its full height', async () => {
      // .panel-b is a column flex container, so each section is a flex item
      // and shrank below its own content — collapsing every group to little
      // more than its header and hiding the fields inside. Nothing else here
      // noticed, because the fields still existed and still held values.
      const g = await page.evaluate(() => ({
        heights: [...document.querySelectorAll('.grp')]
          .map(x => Math.round(x.getBoundingClientRect().height)),
        date: Math.round(document.getElementById('fDate').getBoundingClientRect().height),
        scrolls: (() => { const pb = document.querySelector('.panel-b');
                          return pb.scrollHeight > pb.clientHeight; })()
      }));
      const squashed = g.heights.filter(h => h < 90);
      if (squashed.length)
        throw new Error(squashed.length + ' sections collapsed: ' + g.heights.join(','));
      if (g.date < 30) throw new Error('the date field is ' + g.date + 'px tall');
      // The form is longer than the panel, so the panel must scroll rather
      // than compress its contents to fit.
      if (!g.scrolls) throw new Error('the panel is not scrolling its overflow');
    });

    await R.check('the response time is computed live, against the target', async () => {
      // The number the drill is judged on should not be a surprise at save time.
      await page.fill('#fStart', '10:05');
      await page.fill('#fEnd', '10:25');
      await settle(page, 200);
      let c = await page.evaluate(() => ({
        v: document.getElementById('fMins').textContent,
        n: document.getElementById('fMinsNote').textContent
      }));
      if (!/20 min/.test(c.v)) throw new Error('clock reads: ' + c.v);
      if (!/[Ww]ithin/.test(c.n)) throw new Error('within-target not stated: ' + c.n);

      await page.fill('#fEnd', '10:40');
      await settle(page, 200);
      c = await page.evaluate(() => ({
        v: document.getElementById('fMins').textContent,
        n: document.getElementById('fMinsNote').textContent
      }));
      if (!/35 min/.test(c.v)) throw new Error('clock reads: ' + c.v);
      if (!/[Oo]ver the 20/.test(c.n)) throw new Error('over-target not stated: ' + c.n);
      await page.fill('#fEnd', '10:25');
      await settle(page, 200);
    });

    await R.check('an end time before the start is refused', async () => {
      await page.fill('#fEnd', '09:00');
      await settle(page, 200);
      const n = await page.evaluate(() => document.getElementById('fMinsNote').textContent);
      if (!/must end after/i.test(n)) throw new Error('note reads: ' + n);
      await page.fill('#fEnd', '10:25');
      await settle(page, 200);
    });

    await R.check('a missed step must be explained before it can be saved', async () => {
      // An unexplained gap is the first thing an auditor asks about.
      await page.evaluate(() => { window.__mockSavedDrill = null; window.prompt = () => '1234'; });
      await page.evaluate(() => {
        [...document.querySelectorAll('#fSteps input[type=checkbox]')]
          .forEach((c, i) => { c.checked = i !== 1; stepToggled(i); });
        document.getElementById('team_SiteInCharge').value = 'Tarun Mishra';
        saveReport();
      });
      await settle(page, 500);
      const m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/step 2/i.test(m)) throw new Error('message did not name the step: ' + m);
      const wrote = await page.evaluate(() => window.__mockSavedDrill);
      if (wrote) throw new Error('an unexplained gap reached the server');
      // The offending field is marked, not just described.
      const marked = await page.evaluate(() =>
        document.getElementById('sr_1').classList.contains('bad'));
      if (!marked) throw new Error('the field needing the remark is not marked');
    });

    await R.check('the site in-charge is required — somebody owns the drill', async () => {
      await page.evaluate(() => {
        document.getElementById('sr_1').value = 'Kit was being restocked';
        document.getElementById('team_SiteInCharge').value = '';
        saveReport();
      });
      await settle(page, 400);
      const m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/site in-charge/i.test(m)) throw new Error('message reads: ' + m);
      const wrote = await page.evaluate(() => window.__mockSavedDrill);
      if (wrote) throw new Error('an unowned drill reached the server');
    });

    await R.check('a recommendation with no owner or date is refused', async () => {
      await page.evaluate(() => {
        document.getElementById('team_SiteInCharge').value = 'Tarun Mishra';
        document.getElementById('rc_0').value = 'More absorbent granules on site';
        saveReport();
      });
      await settle(page, 400);
      let m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/who owns/i.test(m)) throw new Error('missing owner not caught: ' + m);
      await page.evaluate(() => {
        document.getElementById('ro_0').value = 'Anuj';
        saveReport();
      });
      await settle(page, 400);
      m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/target date/i.test(m)) throw new Error('missing target date not caught: ' + m);
      const wrote = await page.evaluate(() => window.__mockSavedDrill);
      if (wrote) throw new Error('an unowned recommendation reached the server');
    });

    await R.check('a complete report saves, and reports its own verdict', async () => {
      await page.evaluate(() => {
        document.getElementById('rt_0').value = '2026-12-15';
        document.getElementById('fReportedBy').value = 'Supervisor';
        document.getElementById('fObs').value = 'Spill kit deployed and the area contained.';
        document.getElementById('fBy').value = 'Anuj Pathak';
        saveReport();
      });
      await settle(page, 900);
      const wrote = await page.evaluate(() => window.__mockSavedDrill);
      if (!wrote) throw new Error('nothing was saved');
      if (wrote.stepResults.length !== 4) throw new Error('steps lost on the way out');
      if (wrote.recommendations.length !== 1) throw new Error('the recommendation was dropped');
      if (!wrote.recommendations[0].owner || !wrote.recommendations[0].targetDate)
        throw new Error('the recommendation lost its owner or date');
      if (wrote.team.SiteInCharge !== 'Tarun Mishra') throw new Error('the ERT was dropped');
      const m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      // 3 of 4 steps = 75%, which is not a pass — the message must say so.
      if (!/75%/.test(m)) throw new Error('the score was not reported: ' + m);
      if (!/UNSATISFACTORY/.test(m)) throw new Error('the verdict was not reported: ' + m);
    });

    await R.check('a wrong PIN records nothing', async () => {
      await page.evaluate(() => { window.__mockSavedDrill = null; window.prompt = () => '9999'; });
      await page.evaluate(() => saveReport());
      await settle(page, 800);
      const wrote = await page.evaluate(() => window.__mockSavedDrill);
      if (wrote) throw new Error('a drill was recorded without a valid PIN');
      const m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/not accepted/i.test(m)) throw new Error('no rejection shown: ' + m);
    });

    await R.check('an oversized video is refused before it is uploaded', async () => {
      // google.script.run serialises the file as base64; a phone clip becomes a
      // multi-megabyte argument that fails opaquely after a long wait.
      await page.evaluate(() => {
        window.__mockDrillMedia = [];
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(26 * 1024 * 1024)], 'big.mp4', { type: 'video/mp4' }));
        const input = document.getElementById('fVideoFile');
        input.files = dt.files;
        uploadMedia(input, 'video');
      });
      await settle(page, 500);
      const m = await page.evaluate(() => document.getElementById('fMsg').textContent);
      if (!/25 MB/.test(m)) throw new Error('no size limit stated: ' + m);
      const sent = await page.evaluate(() => (window.__mockDrillMedia || []).length);
      if (sent) throw new Error('an oversized video was uploaded anyway');
    });

    await R.check('a video within the limit uploads and is tagged as video', async () => {
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(1024)], 'ok.mp4', { type: 'video/mp4' }));
        const input = document.getElementById('fVideoFile');
        input.files = dt.files;
        uploadMedia(input, 'video');
      });
      await settle(page, 900);
      const sent = await page.evaluate(() => window.__mockDrillMedia || []);
      if (!sent.length) throw new Error('the video never reached the server');
      if (sent[0].kind !== 'video') throw new Error('uploaded as ' + sent[0].kind);
      // A video tile must be distinguishable from a photo tile.
      const tagged = await page.evaluate(() =>
        !!document.querySelector('#fMedia .vtag'));
      if (!tagged) throw new Error('the video tile is indistinguishable from a photo');
    });

    await R.check('the printed report carries every section of the format', async () => {
      await page.evaluate(() => {
        window.print = () => { window.__printed = true; };
        printReport();
      });
      await settle(page, 300);
      const html = await page.evaluate(() => document.getElementById('printArea').innerHTML);
      ['MOCK DRILL REPORT', 'Emergency details', 'Emergency Response Team',
       'Observations', 'Minutes of meeting', 'Recommendation', 'Responsibility',
       'Target Date', 'Total Time taken for handling emergency'].forEach(s => {
        if (!html.includes(s)) throw new Error('the printed report omits "' + s + '"');
      });
      // Document control is what makes it a controlled document.
      if (!/Document Owner/.test(html)) throw new Error('no document control block');
      if (!/paper copy is not the official document/.test(html))
        throw new Error('the controlled-copy notice is missing');
      // A video cannot print; saying so beats silently dropping the evidence.
      if (!/video\(s\) attached/.test(html))
        throw new Error('attached video is not accounted for on paper');
    });

    await R.check('Escape closes the panel', async () => {
      await page.keyboard.press('Escape');
      await settle(page, 400);
      const open = await page.evaluate(() =>
        document.getElementById('panel').classList.contains('on'));
      if (open) throw new Error('the panel stayed open');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 16c · the server logic ──────────────────────────────────────────────
  {
    const R = makeRunner('16c · Mock drills — what the record must contain');

    await R.check('a complete report validates', async () => {
      const v = validate(goodReport());
      if (!v.ok) throw new Error('a good report was refused: ' + v.error);
    });

    await R.check('the clock is required, and must run forwards', async () => {
      if (validate(goodReport({ startTime: '' })).ok) throw new Error('no start time accepted');
      if (validate(goodReport({ endTime: '25:00' })).ok) throw new Error('a bad time accepted');
      if (validate(goodReport({ startTime: '10:25', endTime: '10:05' })).ok)
        throw new Error('a drill that ended before it started was accepted');
    });

    await R.check('a drill nobody owns is refused', async () => {
      const v = validate(goodReport({ team: {} }));
      if (v.ok) throw new Error('an unowned drill was accepted');
      if (v.field !== 'SiteInCharge') throw new Error('wrong field named: ' + v.field);
    });

    await R.check('an unexplained missed step is refused, and named', async () => {
      const v = validate(goodReport({ stepResults: [
        { step: 1, text: 'a', done: true,  remark: '' },
        { step: 2, text: 'b', done: false, remark: '' }
      ] }));
      if (v.ok) throw new Error('an unexplained gap was accepted');
      if (!/step 2/.test(v.error)) throw new Error('the step was not named: ' + v.error);
    });

    await R.check('a missed step WITH a reason is accepted — it is a finding, not an error', async () => {
      const v = validate(goodReport({ stepResults: [
        { step: 1, text: 'a', done: true,  remark: '' },
        { step: 2, text: 'b', done: false, remark: 'Kit was being restocked' }
      ] }));
      if (!v.ok) throw new Error('an explained gap was refused: ' + v.error);
    });

    await R.check('a drill with no procedure behind it cannot be assessed', async () => {
      const v = validate(goodReport({ stepResults: [] }));
      if (v.ok) throw new Error('a drill with no steps was accepted');
    });

    await R.check('a recommendation needs an owner and a date, blanks are ignored', async () => {
      if (validate(goodReport({ recommendations: [{ text: 'Buy more kit' }] })).ok)
        throw new Error('an unowned recommendation was accepted');
      if (validate(goodReport({ recommendations: [{ text: 'x', owner: 'Anuj' }] })).ok)
        throw new Error('a recommendation with no target date was accepted');
      // An empty row left in the form is not a recommendation.
      const v = validate(goodReport({ recommendations: [{ text: '', owner: '', targetDate: '' }] }));
      if (!v.ok) throw new Error('a blank row was treated as a recommendation: ' + v.error);
    });

    await R.check('response time is whole minutes, and spans the hour correctly', async () => {
      if (minutesBetween('10:05', '10:25') !== 20) throw new Error('20 min miscounted');
      if (minutesBetween('09:50', '10:10') !== 20) throw new Error('across the hour miscounted');
      if (minutesBetween('10:25', '10:05') !== -20) throw new Error('backwards not negative');
      if (minutesBetween('', '10:00') !== '') throw new Error('a missing time is not blank');
    });

    await R.check('the verdict needs BOTH every step and the target time', async () => {
      // A team that did everything but took twice as long has not shown
      // readiness; one that was fast because it skipped half the procedure
      // certainly has not.
      const r = { startTime: '10:00', endTime: '10:20' };   // 20 minutes
      if (outcome(100, r, 20) !== 'SATISFACTORY')
        throw new Error('on time and complete gave ' + outcome(100, r, 20));
      if (outcome(100, r, 15) !== 'OVER TIME')
        throw new Error('complete but late gave ' + outcome(100, r, 15));
      if (outcome(90, r, 20) !== 'NEEDS IMPROVEMENT')
        throw new Error('a missed step gave ' + outcome(90, r, 20));
      if (outcome(50, r, 20) !== 'UNSATISFACTORY')
        throw new Error('half the procedure gave ' + outcome(50, r, 20));
      // No target set: the score alone decides, rather than everything failing.
      if (outcome(100, r, 0) !== 'SATISFACTORY')
        throw new Error('no target gave ' + outcome(100, r, 0));
    });

    await R.check('every seeded procedure has steps, a target and real equipment', async () => {
      const seed = lift('_drillProcedureSeed_', {})();
      if (seed.length !== 4) throw new Error('expected 4 scenarios, got ' + seed.length);
      seed.forEach(p => {
        const steps = splitList(p.Steps);
        const hi    = splitList(p.StepsHi);
        if (steps.length < 8) throw new Error(p.DrillID + ' has only ' + steps.length + ' steps');
        // Every step is scored, and a worker reads the procedure — a Hindi
        // list that has drifted out of step with the English one is worse
        // than none, because the numbers stop matching.
        if (hi.length !== steps.length)
          throw new Error(p.DrillID + ' has ' + steps.length + ' steps but ' + hi.length + ' in Hindi');
        if (!splitList(p.Equipment).length) throw new Error(p.DrillID + ' lists no equipment');
        if (!p.TargetMinutes) throw new Error(p.DrillID + ' has no target time');
        if (!p.Scenario) throw new Error(p.DrillID + ' has no scenario');
        if (!/^DRL-\d\d$/.test(p.TopicID)) throw new Error(p.DrillID + ' has a bad topic: ' + p.TopicID);
      });
    });

    await R.check('the procedures match the drill topics the calendar seeds', async () => {
      // A procedure keyed to a topic that does not exist never opens.
      const seed = lift('_drillProcedureSeed_', {})();
      const training = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');
      const known = new Set((training.match(/'DRL-\d\d'/g) || []).map(s => s.replace(/'/g, '')));
      seed.forEach(p => {
        if (!known.has(p.TopicID))
          throw new Error(p.DrillID + ' points at unknown topic ' + p.TopicID);
      });
      if (known.size !== seed.length)
        throw new Error(known.size + ' drill topics but ' + seed.length + ' procedures');
    });

    await R.check('the four 2025 drill reports are transcribed, not invented', async () => {
      const seed = lift('_drillReportSeed_', {})();
      if (seed.length !== 4) throw new Error('expected 4 conducted drills, got ' + seed.length);

      // Dates, times and locations exactly as they appear on the signed reports.
      const want = {
        '2025-02-04': { type: 'FIRST AID', s: '09:30', e: '10:10', mins: 40 },
        '2025-05-16': { type: 'SUSPICIOUS TRANSACTION', s: '11:00', e: '11:15', mins: 15 },
        '2025-08-09': { type: 'FIRE SAFETY', s: '09:00', e: '09:30', mins: 30 },
        '2025-11-24': { type: 'SPILL CONTROL', s: '10:05', e: '10:25', mins: 20 }
      };
      seed.forEach(d => {
        const w = want[d.date];
        if (!w) throw new Error('unexpected drill date ' + d.date);
        if (d.type !== w.type) throw new Error(d.date + ' type drifted to ' + d.type);
        if (d.startTime !== w.s || d.endTime !== w.e)
          throw new Error(d.date + ' clock drifted to ' + d.startTime + '-' + d.endTime);
        // The recorded duration must follow from the two clock times beside it.
        if (minutesBetween(d.startTime, d.endTime) !== w.mins)
          throw new Error(d.date + ' does not span ' + w.mins + ' minutes');
        if (!d.team.SiteInCharge) throw new Error(d.date + ' names no site in-charge');
        if (!d.observations) throw new Error(d.date + ' has no observations');
        if (!d.minutes) throw new Error(d.date + ' has no minutes of meeting');
      });
    });

    await R.check('every seeded recommendation carries an owner and a real date', async () => {
      // An impossible date on the paper ("31|11|25") must be transcribed as
      // something a date field can hold, not passed through or dropped.
      lift('_drillReportSeed_', {})().forEach(d => {
        d.recommendations.forEach((r, i) => {
          if (!r.text) throw new Error(d.date + ' recommendation ' + (i + 1) + ' is empty');
          if (!r.owner) throw new Error(d.date + ' recommendation ' + (i + 1) + ' has no owner');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(r.targetDate || ''))
            throw new Error(d.date + ' target date is not a date: ' + r.targetDate);
          const dt = new Date(r.targetDate + 'T00:00:00');
          if (isNaN(dt) || r.targetDate.slice(8) !== String(dt.getDate()).padStart(2, '0'))
            throw new Error(d.date + ' has an impossible target date: ' + r.targetDate);
        });
      });
    });

    await R.check('a seeded drill points at a procedure and a real topic', async () => {
      const reports = lift('_drillReportSeed_', {})();
      const procs = lift('_drillProcedureSeed_', {})();
      const ids = new Set(procs.map(p => p.DrillID));
      const topics = new Set(procs.map(p => p.TopicID));
      reports.forEach(d => {
        if (!ids.has(d.drillId)) throw new Error(d.date + ' names unknown procedure ' + d.drillId);
        if (!topics.has(d.topicId)) throw new Error(d.date + ' names unknown topic ' + d.topicId);
      });
      // All four scenarios were run in 2025 — one each.
      if (new Set(reports.map(r => r.drillId)).size !== 4)
        throw new Error('the four 2025 drills are not four distinct scenarios');
    });

    await R.check('the 2025 targets match the records they came from', async () => {
      // Spill 20, fire 30, suspicious 15, first aid 40 — the actual times in
      // the 2025 mock drill reports, not invented benchmarks.
      const by = {};
      lift('_drillProcedureSeed_', {})().forEach(p => { by[p.DrillID] = p; });
      const want = { 'MD-SPILL': 20, 'MD-FIRE': 30, 'MD-SUSPECT': 15, 'MD-FIRSTAID': 40 };
      Object.keys(want).forEach(k => {
        if (!by[k]) throw new Error('missing scenario ' + k);
        if (by[k].TargetMinutes !== want[k])
          throw new Error(k + ' target drifted to ' + by[k].TargetMinutes);
      });
    });

    summary.push(R.report());
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 16: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
