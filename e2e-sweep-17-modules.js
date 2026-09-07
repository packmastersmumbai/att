'use strict';
/**
 * Suite 17 — Training modules.
 *
 * A module is what a topic actually teaches and how it is tested. The KPI
 * table printed on every one of the 33 site training records — Post Training
 * Assessment, After Training Tests, Training Validation — is blank because
 * there was never any module content to compute it from. These assertions
 * are about that content being usable rather than merely present:
 *
 *  17a the module library itself — every topic covered, every question
 *      answerable, every module sourced.
 *  17b the parsing and marking logic in src/modules.js, which decides what a
 *      person's score actually is.
 */
const fs   = require('fs');
const path = require('path');
const { makeRunner } = require('./e2e-lib');

const MODULES = fs.readFileSync(path.join(__dirname, 'src', 'modules.js'), 'utf8');
const SEED    = fs.readFileSync(path.join(__dirname, 'src', 'moduleSeed.js'), 'utf8');
const TRAIN   = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');

/** Lift one function out of modules.js and run it in isolation. */
function lift(name, stubs) {
  const body = (MODULES.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/modules.js');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

/** The seed is pure data; evaluate the whole file to read it. */
function moduleSeed() {
  const box = {};
  new Function(SEED + '; this._moduleSeed_ = _moduleSeed_;').call(box);
  return box._moduleSeed_();
}

// _splitList_ is defined in mockdrill.js and shared across the training
// files — GAS puts every source in one global scope, so this is a real
// dependency rather than a duplicate. Lifted from where it actually lives.
const DRILL = fs.readFileSync(path.join(__dirname, 'src', 'mockdrill.js'), 'utf8');
const splitList = new Function(
  (DRILL.match(/function _splitList_[\s\S]*?\n}/) || [])[0] + '; return _splitList_;')();
const parseQuestions = lift('_parseQuestions_', { _splitList_: splitList });

async function run() {
  const summary = [];

  // ── 17a · the library ───────────────────────────────────────────────────
  {
    const R = makeRunner('17a · Modules — the library');
    const modules = moduleSeed();
    const topics = new Set((TRAIN.match(/\['([A-Z]{3}-[A-Z0-9]{2,4})'/g) || [])
      .map(s => s.replace(/\['|'/g, '')));

    await R.check('every topic in the library has a module', async () => {
      // A topic that can be scheduled but not assessed is the gap this
      // sheet exists to close.
      const have = new Set(modules.map(m => m.TopicID));
      const missing = [...topics].filter(t => !have.has(t));
      if (missing.length) throw new Error('no module for: ' + missing.join(', '));
      if (modules.length !== topics.size)
        throw new Error(modules.length + ' modules for ' + topics.size + ' topics');
    });

    await R.check('no module points at a topic that does not exist', async () => {
      modules.forEach(m => {
        if (!topics.has(m.TopicID))
          throw new Error(m.TopicID + ' has a module but is not a topic');
      });
      const seen = new Set();
      modules.forEach(m => {
        if (seen.has(m.TopicID)) throw new Error('duplicate module for ' + m.TopicID);
        seen.add(m.TopicID);
      });
    });

    await R.check('every module records where its content came from', async () => {
      // A module drafted by a system and one transcribed from a signed
      // record are not the same claim, and an auditor may tell them apart.
      const valid = new Set(['RECORD', 'DRILL', 'AYT', 'VIDEO', 'DRAFTED']);
      modules.forEach(m => {
        if (!m.Source) throw new Error(m.TopicID + ' records no source');
        if (!valid.has(m.Source))
          throw new Error(m.TopicID + ' has an unknown source: ' + m.Source);
      });
    });

    await R.check('every module has objectives, sections and questions', async () => {
      modules.forEach(m => {
        const objs = splitList(m.Objectives);
        const secs = splitList(m.Sections);
        const qs   = splitList(m.Questions);
        if (objs.length < 2) throw new Error(m.TopicID + ' has ' + objs.length + ' objective(s)');
        if (secs.length < 3) throw new Error(m.TopicID + ' has ' + secs.length + ' section(s)');
        if (qs.length < 3)   throw new Error(m.TopicID + ' has ' + qs.length + ' question(s)');
      });
    });

    await R.check('every section carries a heading', async () => {
      modules.forEach(m => {
        splitList(m.Sections).forEach((s, i) => {
          if (s.indexOf('::') === -1)
            throw new Error(m.TopicID + ' section ' + (i + 1) + ' has no heading');
        });
      });
    });

    await R.check('every question is answerable and its answer is in range', async () => {
      // An answer index past the end of the options makes the question
      // unpassable, and nothing at render time would reveal it.
      modules.forEach(m => {
        parseQuestions(m.Questions).forEach(q => {
          if (!q.text) throw new Error(m.TopicID + ' q' + q.n + ' has no text');
          if (q.options.length < 2)
            throw new Error(m.TopicID + ' q' + q.n + ' has ' + q.options.length + ' option(s)');
          if (!(q.answer >= 0 && q.answer < q.options.length))
            throw new Error(m.TopicID + ' q' + q.n + ' answer ' + q.answer +
                            ' is outside its ' + q.options.length + ' options');
        });
      });
    });

    await R.check('no question repeats an option', async () => {
      // Two identical options mean two correct answers, or none.
      modules.forEach(m => {
        parseQuestions(m.Questions).forEach(q => {
          const lower = q.options.map(o => o.toLowerCase().trim());
          if (new Set(lower).size !== lower.length)
            throw new Error(m.TopicID + ' q' + q.n + ' repeats an option');
        });
      });
    });

    await R.check('AYT course material is referenced, never reproduced', async () => {
      // The course notes are a third party's copyrighted material held on
      // site. A module points at them; it must not copy them.
      modules.filter(m => m.Source === 'AYT').forEach(m => {
        const secs = splitList(m.Sections).join(' ');
        if (!/# TRAINING\/QA Course\//.test(secs))
          throw new Error(m.TopicID + ' does not point at the course notes on site');
        // A section long enough to be transcribed content rather than a summary.
        splitList(m.Sections).forEach(s => {
          if (s.length > 700) throw new Error(m.TopicID + ' has a section long enough to be a copy');
        });
      });
    });

    await R.check('the drill modules match the drill procedures', async () => {
      // A drill module that teaches something the procedure does not contain
      // would assess people against the wrong thing.
      const drills = modules.filter(m => m.TopicID.indexOf('DRL-') === 0);
      if (drills.length !== 5) throw new Error('expected 5 drill modules, got ' + drills.length);
      drills.forEach(m => {
        if (m.Source !== 'DRILL')
          throw new Error(m.TopicID + ' is sourced ' + m.Source + ', not the drill procedure');
      });
      const quake = drills.filter(m => m.TopicID === 'DRL-05')[0];
      const body = splitList(quake.Sections).join(' ').toLowerCase();
      ['drop, cover', 'single file', 'buddy', 'roll call'].forEach(k => {
        if (body.indexOf(k) === -1)
          throw new Error('the earthquake module omits "' + k + '" from its own procedure');
      });
    });

    summary.push(R.report());
  }

  // ── 17b · parsing and marking ───────────────────────────────────────────
  {
    const R = makeRunner('17b · Modules — parsing and marking');

    await R.check('a sheet made before a column existed gains that column', async () => {
      // This bug has now bitten three times: Employees.JobRole, the document
      // control keys, and the Hindi module columns. Every writer maps values
      // BY HEADER NAME, so a column the sheet lacks is silently dropped and
      // the call still reports success — the Hindi wrote nothing for a whole
      // deploy while seedTrainingModules said "39 updated".
      const added = [];
      let headers = ['TopicID', 'Objectives'];   // an old, narrower sheet
      lift('_ensureSheetsWithHeaders_', {
        SpreadsheetApp: { getActiveSpreadsheet: () => ({
          getSheetByName: () => ({
            getLastColumn: () => headers.length,
            getRange: () => ({
              getValues: () => [headers],
              setValue: v => { added.push(v); headers.push(v);
                               return { setFontWeight: () => ({ setBackground: () => {} }) }; },
              setValues: () => ({ setFontWeight: () => ({ setBackground: () => {} }) })
            }),
            setFrozenRows: () => {}
          }),
          insertSheet: () => { throw new Error('should not create an existing sheet'); }
        }) }
      })({ T: ['TopicID', 'Objectives', 'ObjectivesHi', 'Questions'] });

      if (added.indexOf('ObjectivesHi') === -1)
        throw new Error('a new column was not added: ' + JSON.stringify(added));
      if (added.indexOf('Questions') === -1)
        throw new Error('a second new column was missed: ' + JSON.stringify(added));
      // Existing columns must not be duplicated.
      if (added.indexOf('TopicID') !== -1)
        throw new Error('an existing column was added again');
    });

    await R.check('a question parses into text, options and an answer', async () => {
      const qs = parseQuestions('What is 2+2? ?? three ~ four ~ five ?? 1');
      if (qs.length !== 1) throw new Error('parsed ' + qs.length + ' questions');
      if (qs[0].text !== 'What is 2+2?') throw new Error('text: ' + qs[0].text);
      if (qs[0].options.join(',') !== 'three,four,five') throw new Error('options: ' + qs[0].options);
      if (qs[0].answer !== 1) throw new Error('answer: ' + qs[0].answer);
    });

    await R.check('a malformed question degrades rather than throwing', async () => {
      // A trainer edits these in a spreadsheet. A typo must not take the
      // page down; it must show up as a question that cannot be marked.
      const qs = parseQuestions('Just some text with no options');
      if (qs.length !== 1) throw new Error('parsed ' + qs.length);
      if (qs[0].answer !== -1) throw new Error('a malformed question claims an answer');
      if (qs[0].options.length) throw new Error('a malformed question invented options');
    });

    await R.check('marking counts only exact matches', async () => {
      const score = lift('scoreModuleTest', {
        _ensureModuleSheets_: () => {},
        getTrainingModule: () => ({ success: true, module: {
          questions: [
            { n: 1, text: 'a', options: ['x','y'], answer: 0 },
            { n: 2, text: 'b', options: ['x','y'], answer: 1 },
            { n: 3, text: 'c', options: ['x','y'], answer: 1 },
            { n: 4, text: 'd', options: ['x','y'], answer: 0 }
          ], passMark: 70 } })
      });
      const r = score('TRN-01', [0, 1, 0, 0]);
      if (r.correct !== 3) throw new Error('marked ' + r.correct + '/4');
      if (r.score !== 75) throw new Error('score ' + r.score);
      if (!r.passed) throw new Error('75 should pass a 70 mark');
      // A blank answer is wrong, not skipped — a test half completed is not
      // a pass on the questions that were attempted.
      const blank = score('TRN-01', [0, undefined, 1, 0]);
      if (blank.correct !== 3) throw new Error('blank handling: ' + blank.correct);
    });

    await R.check('the pass mark boundary passes, and below it fails', async () => {
      const mk = (answer, pass) => lift('scoreModuleTest', {
        _ensureModuleSheets_: () => {},
        getTrainingModule: () => ({ success: true, module: {
          questions: [0,1,2,3,4].map(n => ({ n: n+1, options:['x','y'], answer: 0 })),
          passMark: pass } })
      })('T', answer);
      // Exactly at the mark is a pass — the boundary is where an off-by-one
      // decides whether somebody is recorded as competent.
      const at = mk([0,0,0,0,1], 80);
      if (at.score !== 80) throw new Error('score ' + at.score);
      if (!at.passed) throw new Error('80 should pass an 80 mark');
      const under = mk([0,0,0,1,1], 80);
      if (under.passed) throw new Error('60 should not pass an 80 mark');
    });

    await R.check('a module with no questions cannot be scored', async () => {
      const r = lift('scoreModuleTest', {
        _ensureModuleSheets_: () => {},
        getTrainingModule: () => ({ success: true, module: { questions: [], passMark: 70 } })
      })('T', []);
      if (r.success) throw new Error('an empty module returned a score');
    });

    await R.check('sections parse into heading and body', async () => {
      const out = lift('_moduleOut_', {
        _splitList_: splitList, _parseQuestions_: parseQuestions,
        _parseSections_: lift('_parseSections_', { _splitList_: splitList }),
        _trainingPassMark_: () => 70,
        MODULE_SOURCES: { RECORD: 'From the site training records' }
      })({ TopicID: 'T', Objectives: 'a|b', Sections: 'Head::Body text|Two::More',
           Questions: '', PassMark: '', Source: 'RECORD', Reviewed: 'NO' });
      if (out.sections.length !== 2) throw new Error('parsed ' + out.sections.length);
      if (out.sections[0].heading !== 'Head') throw new Error('heading: ' + out.sections[0].heading);
      if (out.sections[0].body !== 'Body text') throw new Error('body: ' + out.sections[0].body);
      // The source is resolved to a human label for the printed record.
      if (!/site training records/.test(out.sourceLabel))
        throw new Error('source not labelled: ' + out.sourceLabel);
      // An unreviewed module must not claim to be reviewed.
      if (out.reviewed) throw new Error('an unreviewed module reported as reviewed');
    });

    summary.push(R.report());
  }

  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 17: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
