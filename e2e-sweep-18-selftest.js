'use strict';
/**
 * Suite 18 — Self-assessment.
 *
 * A worker scans a QR code on their own phone, picks their name, answers in
 * Hindi or English, and their score goes on the record. Two things must hold
 * for that to be worth anything:
 *
 *   - the answer key never reaches the phone, or the test proves nothing
 *   - the result moves the person to L2 and NO further, because SOP-SM-001
 *     §6.2 makes L3 and L4 a supervisor's judgement
 *
 *  18a drives the test on the page, in both languages.
 *  18b checks the server logic — marking, the level cap, and the retake rule.
 */
const fs   = require('fs');
const path = require('path');
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'modules.js'), 'utf8');
const SEED = fs.readFileSync(path.join(__dirname, 'src', 'moduleSeed.js'), 'utf8');

function lift(name, stubs) {
  const body = (SRC.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/modules.js');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

function moduleSeed() {
  const box = {};
  new Function(SEED + '; this._moduleSeed_ = _moduleSeed_;').call(box);
  return box._moduleSeed_();
}

const DRILL = fs.readFileSync(path.join(__dirname, 'src', 'mockdrill.js'), 'utf8');
const splitList = new Function(
  (DRILL.match(/function _splitList_[\s\S]*?\n}/) || [])[0] + '; return _splitList_;')();
const parseQuestions = lift('_parseQuestions_', { _splitList_: splitList });

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 18a · taking the test ───────────────────────────────────────────────
  {
    const R = makeRunner('18a · Self-test — taking it');
    const { page, context } = await openPage(browser, 'selftest');
    await settle(page, 900);

    await R.check('the answer key never reaches the phone', async () => {
      // The single assertion this whole feature rests on. If the answers are
      // in the page, a worker can read them and the record is worthless.
      const leaked = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        // The test object the page holds must carry no answer field at all.
        const t = (typeof TEST !== 'undefined' && TEST) ? TEST : null;
        return {
          inState: t ? t.questions.some(q => 'answer' in q) : false,
          inHtml: /"answer"\s*:/.test(src)
        };
      });
      if (leaked.inState) throw new Error('the question objects carry an answer key');
      if (leaked.inHtml) throw new Error('an answer key is embedded in the page HTML');
      // The page must also never ASK for the trainer's endpoint, which does
      // carry the key. Calling getTrainingModule here would leak it however
      // carefully getModuleTest strips it.
      const src = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'selftest.html'), 'utf8');
      if (/getTrainingModule\s*\(/.test(src))
        throw new Error('the self-test page calls the trainer endpoint, which carries the answers');
    });

    await R.check('a name must be picked before the test starts', async () => {
      await page.evaluate(() => start());
      await settle(page, 250);
      const s = await page.evaluate(() => ({
        err: document.getElementById('whoErr').hidden === false,
        onQ: !document.getElementById('stepQ').hidden
      }));
      if (!s.err) throw new Error('no prompt to pick a name');
      if (s.onQ) throw new Error('the test started without a name');
    });

    await R.check('answering advances one question at a time', async () => {
      await page.evaluate(() => {
        document.getElementById('who').value = 'EMP001';
        start();
      });
      await settle(page, 300);
      const first = await page.evaluate(() => ({
        onQ: !document.getElementById('stepQ').hidden,
        qn: document.getElementById('qn').textContent,
        opts: document.querySelectorAll('#opts .opt').length,
        nextDisabled: document.getElementById('bNext').disabled
      }));
      if (!first.onQ) throw new Error('the test did not start');
      if (first.opts !== 2) throw new Error('expected 2 options, got ' + first.opts);
      // Next stays disabled until something is picked — a blank answer is
      // not an answer.
      if (!first.nextDisabled) throw new Error('Next was enabled before answering');
      if (!/1/.test(first.qn)) throw new Error('not on question 1: ' + first.qn);
    });

    await R.check('a tap selects but does not auto-advance', async () => {
      // Auto-advancing denies a change of mind, and a mis-tap on a phone
      // would lock in a wrong answer with no way back.
      await page.evaluate(() => pick(0));
      await settle(page, 200);
      const s = await page.evaluate(() => ({
        qn: document.getElementById('qn').textContent,
        picked: document.querySelectorAll('#opts .opt[aria-pressed="true"]').length,
        nextDisabled: document.getElementById('bNext').disabled
      }));
      if (!/1/.test(s.qn)) throw new Error('it advanced on its own: ' + s.qn);
      if (s.picked !== 1) throw new Error('the tap did not select');
      if (s.nextDisabled) throw new Error('Next is still disabled after answering');
    });

    await R.check('an answer can be changed before moving on', async () => {
      await page.evaluate(() => pick(1));
      await settle(page, 200);
      const idx = await page.evaluate(() =>
        [...document.querySelectorAll('#opts .opt')]
          .findIndex(b => b.getAttribute('aria-pressed') === 'true'));
      if (idx !== 1) throw new Error('the answer did not change, index ' + idx);
      await page.evaluate(() => pick(0));
      await settle(page, 200);
    });

    await R.check('the last question leads to the confidence step', async () => {
      await page.evaluate(() => { next(); });
      await settle(page, 250);
      await page.evaluate(() => { pick(0); next(); });
      await settle(page, 250);
      const s = await page.evaluate(() => ({
        onConf: !document.getElementById('stepConf').hidden,
        choices: document.querySelectorAll('#conf button').length,
        submitDisabled: document.getElementById('bSubmit').disabled
      }));
      if (!s.onConf) throw new Error('did not reach the confidence step');
      if (s.choices !== 3) throw new Error('expected 3 confidence choices, got ' + s.choices);
      // A self-rating is required, so the supervisor gets the signal.
      if (!s.submitDisabled) throw new Error('Submit was enabled before rating');
    });

    await R.check('submitting records the attempt and shows what was wrong', async () => {
      await page.evaluate(() => { window.__mockAssessments = []; setConf('c3'); submit(); });
      await settle(page, 900);
      const s = await page.evaluate(() => ({
        onDone: !document.getElementById('stepDone').hidden,
        score: document.getElementById('rScore').textContent,
        review: document.querySelectorAll('#rReview .r').length,
        note: document.getElementById('rNote').textContent,
        sent: (window.__mockAssessments || [])[0] || null
      }));
      if (!s.onDone) throw new Error('no result shown');
      if (s.score !== '100%') throw new Error('score reads ' + s.score);
      // A test that returns only a number teaches nothing.
      if (s.review !== 2) throw new Error('no per-question review: ' + s.review);
      if (!s.sent) throw new Error('nothing reached the server');
      if (s.sent.empId !== 'EMP001') throw new Error('wrong person recorded');
      if (s.sent.confidence !== 'c3') throw new Error('the self-rating was not sent');
      if (!s.sent.lang) throw new Error('the language was not recorded');
      // The attendee is told plainly what their result does and does not do.
      if (!/supervisor/i.test(s.note)) throw new Error('no note about the supervisor: ' + s.note);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 18a2 · Hindi ────────────────────────────────────────────────────────
  {
    const R = makeRunner('18a2 · Self-test — in Hindi');
    const { page, context } = await openPage(browser, 'selftest');
    await settle(page, 900);

    await R.check('the whole page switches to Hindi, not just the questions', async () => {
      await page.evaluate(() => {
        document.querySelector('#langSeg button[data-lang="hi"]').click();
      });
      await settle(page, 800);
      const s = await page.evaluate(() => ({
        title: document.getElementById('tTitle').textContent,
        who: document.getElementById('lWho').textContent,
        start: document.getElementById('bStart').textContent,
        htmlLang: document.documentElement.lang
      }));
      // A worker who reads Hindi should not meet an English button.
      [['title', s.title], ['name label', s.who], ['start button', s.start]].forEach(([what, v]) => {
        if (!/[ऀ-ॿ]/.test(v))
          throw new Error('the ' + what + ' is not in Hindi: ' + v);
      });
      if (s.htmlLang !== 'hi') throw new Error('document language is ' + s.htmlLang);
    });

    await R.check('the questions come through in Hindi', async () => {
      await page.evaluate(() => { document.getElementById('who').value = 'EMP001'; start(); });
      await settle(page, 400);
      const q = await page.evaluate(() => ({
        text: document.getElementById('qt').textContent,
        opts: [...document.querySelectorAll('#opts .opt')].map(b => b.textContent.trim())
      }));
      if (!/[ऀ-ॿ]/.test(q.text)) throw new Error('question not in Hindi: ' + q.text);
      q.opts.forEach(o => {
        if (!/[ऀ-ॿ]/.test(o)) throw new Error('option not in Hindi: ' + o);
      });
    });

    await R.check('the language taken is recorded with the result', async () => {
      await page.evaluate(() => {
        window.__mockAssessments = [];
        pick(0); next(); pick(0); next();
      });
      await settle(page, 400);
      await page.evaluate(() => { setConf('c2'); submit(); });
      await settle(page, 900);
      const sent = await page.evaluate(() => (window.__mockAssessments || [])[0]);
      if (!sent) throw new Error('nothing was recorded');
      if (sent.lang !== 'hi') throw new Error('recorded language: ' + sent.lang);
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 18b · the server side ───────────────────────────────────────────────
  {
    const R = makeRunner('18b · Self-test — what the record says');

    await R.check('the test endpoint strips the answer key', async () => {
      const getTest = lift('getModuleTest', {
        _ensureModuleSheets_: () => {},
        getTrainingModule: () => ({ success: true, module: {
          topicId: 'T', passMark: 70, hasHindi: false,
          objectives: ['o'], sections: [{ heading: 'h', body: 'b' }],
          objectivesHi: [], sectionsHi: [], questionsHi: [],
          questions: [{ n: 1, text: 'q', options: ['a', 'b'], answer: 1 }]
        } })
      });
      const t = getTest('T', 'en');
      if (!t.success) throw new Error('the test did not load');
      if ('answer' in t.questions[0])
        throw new Error('the answer key survived into the test payload');
      if (!t.questions[0].options.length) throw new Error('options were stripped too');
    });

    await R.check('Hindi is served only when the module is fully translated', async () => {
      // A worker halfway through a test that reverts to English has been
      // failed by the tool, not by their knowledge.
      const make = (hasHindi) => lift('getModuleTest', {
        _ensureModuleSheets_: () => {},
        getTrainingModule: () => ({ success: true, module: {
          topicId: 'T', passMark: 70, hasHindi: hasHindi,
          objectives: ['en'], sections: [{ heading: 'h', body: 'b' }],
          objectivesHi: ['hi'], sectionsHi: [{ heading: 'h', body: 'b' }],
          questions: [{ n: 1, text: 'en q', options: ['a', 'b'], answer: 0 }],
          questionsHi: [{ n: 1, text: 'hi q', options: ['क', 'ख'], answer: 0 }]
        } })
      })('T', 'hi');
      if (make(true).lang !== 'hi') throw new Error('a translated module did not serve Hindi');
      // Untranslated: fall back to English AND say so, rather than mixing.
      const partial = make(false);
      if (partial.lang !== 'en') throw new Error('an untranslated module served Hindi');
      if (partial.hasHindi) throw new Error('an untranslated module claims Hindi');
    });

    await R.check('a module is only bilingual when the questions line up', async () => {
      // The answer index is shared between the two languages, so a Hindi
      // question with a different option count marks the wrong answer.
      const out = lift('_moduleOut_', {
        _splitList_: splitList, _parseQuestions_: parseQuestions,
        _parseSections_: lift('_parseSections_', { _splitList_: splitList }),
        _trainingPassMark_: () => 70, MODULE_SOURCES: {}
      });
      const ok = out({ TopicID:'T', Objectives:'a', Sections:'h::b',
        Questions:'q ?? one ~ two ?? 0', ObjectivesHi:'क', SectionsHi:'ह::ब',
        QuestionsHi:'प ?? एक ~ दो ?? 0', Source:'RECORD', Reviewed:'NO' });
      if (!ok.hasHindi) throw new Error('a matching translation was rejected');

      const short = out({ TopicID:'T', Objectives:'a', Sections:'h::b',
        Questions:'q1 ?? one ~ two ?? 0|q2 ?? one ~ two ?? 0',
        ObjectivesHi:'क', SectionsHi:'ह::ब', QuestionsHi:'प ?? एक ~ दो ?? 0',
        Source:'RECORD', Reviewed:'NO' });
      if (short.hasHindi) throw new Error('a half-translated module claims Hindi');

      const mismatched = out({ TopicID:'T', Objectives:'a', Sections:'h::b',
        Questions:'q ?? one ~ two ~ three ?? 2', ObjectivesHi:'क', SectionsHi:'ह::ब',
        QuestionsHi:'प ?? एक ~ दो ?? 0', Source:'RECORD', Reviewed:'NO' });
      if (mismatched.hasHindi)
        throw new Error('a translation with fewer options claims Hindi');
    });

    await R.check('the seeded Hindi lines up with its English everywhere', async () => {
      moduleSeed().forEach(m => {
        if (!m.QuestionsHi) return;
        const en = parseQuestions(m.Questions), hi = parseQuestions(m.QuestionsHi);
        if (en.length !== hi.length)
          throw new Error(m.TopicID + ': ' + en.length + ' EN vs ' + hi.length + ' HI questions');
        en.forEach((q, i) => {
          if (q.options.length !== hi[i].options.length)
            throw new Error(m.TopicID + ' q' + (i+1) + ': option counts differ');
          if (q.answer !== hi[i].answer)
            throw new Error(m.TopicID + ' q' + (i+1) + ': answer index differs');
        });
        if (!/[ऀ-ॿ]/.test(m.QuestionsHi))
          throw new Error(m.TopicID + ': Hindi is not in Devanagari');
      });
    });

    await R.check('a retake keeps the better score, never the later one', async () => {
      // Retaking after retraining is the behaviour the system wants. Writing
      // the newer score would penalise somebody for having failed first.
      const cells = [];
      const rows = [['PLN-1', 'EMP001', 'A', 'YES', 40, 'x']];
      const upsert = lift('_upsertAttendanceScore_', {
        TRAINING_SHEETS: { ATTENDANCE: 'A' },
        getSheet: () => ({
          // Row 1 is the header read; row 2 onward is the data read. The
          // real getRange distinguishes them by start row, so the stub must
          // too or the lookup never finds the existing person.
          getRange: (r, c, nr, nc) => ({
            getValues: () => r === 1
              ? [['PlanID','EmpID','Name','Present','Score','RecordedAt']]
              : rows
          }),
          getLastColumn: () => 6, getLastRow: () => 2,
          appendRow: x => rows.push(x)
        }),
        setCell: (sh, row, col, val) => cells.push([col, val]),
        getCell: (sh, row, col) => col === 'Score' ? 40 : ''
      });
      const r1 = upsert('PLN-1', 'EMP001', 'A', 90);
      if (r1 !== 'updated') throw new Error('a retake added a second row: ' + r1);
      if (!cells.some(c => c[0] === 'Score' && c[1] === 90))
        throw new Error('the better score was not written');

      cells.length = 0;
      const r2 = upsert('PLN-1', 'EMP001', 'A', 20);
      if (cells.some(c => c[0] === 'Score'))
        throw new Error('a worse retake overwrote the better score');
      if (r2 !== 'updated') throw new Error('second retake: ' + r2);
    });

    await R.check('a self-test never claims more than L2', async () => {
      // SOP-SM-001 §6.2: department heads and supervisors evaluate. The test
      // is real evidence of knowledge; it is not evidence that somebody can
      // work unsupervised or train others. Nothing in this file may write a
      // level at all — the matrix computes L1/L2 from the score and stops.
      if (/SkillOverrides|setSkillLevel|'L3'|'L4'/.test(SRC))
        throw new Error('the assessment path can set a competency level directly');
      // And the message to the attendee must say a supervisor decides above.
      const rec = SRC.match(/levelNote:[\s\S]{0,220}/);
      if (!rec || !/supervisor/i.test(rec[0]))
        throw new Error('the result does not tell the attendee a supervisor confirms above it');
    });

    await R.check('an attempt is stored whole, and attempts are never replaced', async () => {
      // A second pass after a fail is the evidence that retraining worked.
      // Deleting the first attempt destroys what an auditor wants to see.
      const rec = (SRC.match(/function recordAssessment[\s\S]*?\n}/) || [])[0] || '';
      if (!/appendRow/.test(rec))
        throw new Error('assessments are not appended');
      if (/deleteRow/.test(rec))
        throw new Error('recordAssessment deletes a previous attempt');
      ['Answers', 'Lang', 'Confidence', 'Score'].forEach(f => {
        if (rec.indexOf(f) === -1) throw new Error('the attempt does not store ' + f);
      });
    });

    await R.check('participation is measured against the whole roster', async () => {
      // "8 people passed" means nothing without knowing 8 of how many. The
      // paper record's Training Feedback KPI never had this number.
      const get = lift('getSessionAssessments', {
        _ensureModuleSheets_: () => {}, _ensureTrainingSheets_: () => {},
        MODULE_SHEETS: { ASSESSMENTS: 'A' }, SHEETS: { EMPLOYEES: 'E' },
        getSheetAsObjects: tab => tab === 'A'
          ? [{ PlanID:'P', EmpID:'1', Name:'A', Score:90, Passed:'YES', Lang:'en' },
             { PlanID:'P', EmpID:'1', Name:'A', Score:40, Passed:'NO',  Lang:'en' }]
          : [{ EmpID:'1', Name:'A', Status:'ACTIVE' },
             { EmpID:'2', Name:'B', Status:'ACTIVE' },
             { EmpID:'3', Name:'C', Status:'INACTIVE' }]
      })('P');
      if (!get.success) throw new Error('participation did not compute');
      // Two active people, one has taken it — 50%, and the inactive person
      // must not be counted in the denominator.
      if (get.kpis.roster !== 2) throw new Error('roster counted ' + get.kpis.roster);
      if (get.kpis.taken !== 1) throw new Error('taken counted ' + get.kpis.taken);
      if (get.kpis.participation !== 50)
        throw new Error('participation reads ' + get.kpis.participation);
      // Two attempts by one person is one participant, with the best score.
      if (get.kpis.avgScore !== 90) throw new Error('avg used the wrong attempt: ' + get.kpis.avgScore);
    });

    summary.push(R.report());
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 18: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
