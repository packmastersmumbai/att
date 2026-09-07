'use strict';
/**
 * Suite 19 — Induction audio.
 *
 * The clips ARE the instruction, not decoration: a worker who cannot read the
 * rule printed beside it has only the voice. So what must hold here is about
 * integrity, not playback.
 *
 *   - a clip is addressed by LOGICAL NAME, never a Drive file id, or every
 *     caller breaks the day a clip is re-recorded in a real voice
 *   - uploading is admin-gated, because a public Drive file that states a
 *     safety rule is worth replacing if you are hostile
 *   - cues survive the round trip as an array, or the highlight drifts onto
 *     the wrong phrase
 *   - a malformed cue list degrades to no highlighting, never a dead page
 */
const fs   = require('fs');
const path = require('path');
const assert = require('assert');
const { makeRunner } = require('./e2e-lib');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'inductionAudio.js'), 'utf8');

function lift(name) {
  const body = (SRC.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found in src/inductionAudio.js');
  return new Function(body + '; return ' + name + ';')();
}

async function run() {
  const R = makeRunner('19 induction audio');

  const fileName  = lift('_audioFileName_');
  const parseCues = lift('_parseCues_');

  // ---- the name / id split ------------------------------------------------
  await R.check('logical name flattens to a safe filename', () =>
    fileName('TRN-IND/R14/hi') === 'TRN-IND_R14_hi.opus');

  await R.check('visitor clips flatten the same way', () =>
    fileName('VISITOR/S/en') === 'VISITOR_S_en.opus');

  await R.check('path separators cannot escape the folder', () =>
    fileName('../../etc/passwd').indexOf('..') === -1);

  await R.check('spaces never reach the filename', () =>
    fileName('a b/c').indexOf(' ') === -1);

  // ---- cues survive the round trip ---------------------------------------
  await R.check('stored cues come back as numbers', () => {
    assert.deepStrictEqual(parseCues('[0,2.31,4.8]'), [0, 2.31, 4.8]);
    return true;
  });

  await R.check('no cues is an empty list, not a throw', () =>
    parseCues('').length === 0);

  await R.check('malformed cues degrade to no highlighting', () =>
    parseCues('not json').length === 0);

  await R.check('a non-array cue value is rejected, not half-used', () =>
    parseCues('{"a":1}').length === 0);

  // ---- the upload is admin-gated -----------------------------------------
  await R.check('putInductionClip calls _requireAdmin_', () =>
    /_requireAdmin_\(token\)/.test(SRC));

  await R.check('the guard runs BEFORE anything reaches Drive', () => {
    const guard  = SRC.indexOf('_requireAdmin_(token)');
    const create = SRC.indexOf('folder.createFile');
    return guard > -1 && create > -1 && guard < create;
  });

  // ---- reads stay open ----------------------------------------------------
  await R.check('fetching clips needs no token (a visitor has none)', () => {
    const body = (SRC.match(/function getInductionAudio\b[\s\S]*?\n}/) || [])[0];
    return !!body && !/_requireAdmin_/.test(body);
  });

  // ---- the manifest is one call ------------------------------------------
  await R.check('a prefix fetches one induction without the other', () =>
    /prefix && name\.indexOf\(prefix\) !== 0/.test(SRC));

  await R.check('the manifest reports its count, so a short set is visible', () =>
    /count: Object\.keys\(out\)\.length/.test(SRC));

  // ---- re-upload replaces, never duplicates ------------------------------
  await R.check('re-upload trashes the old file rather than growing a copy', () =>
    /getFilesByName\(fileName\)[\s\S]{0,160}setTrashed\(true\)/.test(SRC));

  await R.check('the row is found by name, so a re-upload updates in place', () =>
    /findRowByValue\(sheet, 'Name', name\)/.test(SRC));

  // ---- the schema is extended, not merely created ------------------------
  // The bug that has bitten three times: writers map values BY HEADER NAME,
  // so a column the sheet lacks is dropped and the call still reports success.
  await R.check('the audio tab is created AND topped up by the shared helper', () =>
    /_ensureSheetsWithHeaders_\(AUDIO_HEADERS\)/.test(SRC));

  await R.check('Cues and FileID are declared columns, not implied', () =>
    /'Cues'/.test(SRC) && /'FileID'/.test(SRC));

  // ---- the page degrades when there is no audio --------------------------
  const PAGE = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'selftest.html'), 'utf8');

  await R.check('the listen button is hidden until a clip exists', () =>
    /btn\.hidden = !url/.test(PAGE));

  await R.check('a failed manifest fetch is not treated as an error', () => {
    const body = (PAGE.match(/function loadClips\b[\s\S]*?\n    }/) || [])[0];
    return !!body && /withFailureHandler\(function \(\) \{/.test(body);
  });

  await R.check('clips are fetched once, filtered by topic', () =>
    /getInductionAudio\(TOPIC \+ '\/'\)/.test(PAGE));

  // The page keys question audio by POSITION because getModuleTest returns
  // n/text/options and nothing identifying the rule — the answer key stays
  // server-side. Upload naming must agree or every clip silently misses.
  await R.check('question audio is keyed by question number', () =>
    /TOPIC \+ '\/Q' \+ \(q\.n \|\| \(idx \+ 1\)\)/.test(PAGE));

  await R.check('the uploader names question clips the same way', () => {
    const up = fs.readFileSync(
      path.join(__dirname, 'tools', 'upload_induction_audio.py'), 'utf8');
    return /"%s\/Q%d\/%s" % \(prefix, n, key\)/.test(up);
  });

  await R.check('the module still hides the answer key from the page', () => {
    const mods = fs.readFileSync(path.join(__dirname, 'src', 'modules.js'), 'utf8');
    const body = (mods.match(/function getModuleTest\b[\s\S]*?\n}/) || [])[0];
    return !!body && !/answer/.test(body.split('questions: qs.map')[1] || '');
  });

  // ---- the induction module itself ---------------------------------------
  const box = {};
  new Function(fs.readFileSync(path.join(__dirname, 'src', 'moduleSeed.js'), 'utf8')
    + '; this._moduleSeed_ = _moduleSeed_;').call(box);
  const IND = box._moduleSeed_().filter(m => m.TopicID === 'TRN-IND')[0];

  await R.check('TRN-IND exists in the module seed', () => !!IND);

  await R.check('every rule is a section, in both languages', () =>
    IND.Sections.split('|').length === 30 &&
    IND.SectionsHi.split('|').length === 30);

  await R.check('the answer key is identical in both languages', () => {
    const key = s => s.split('|').map(q => q.split('??')[2].trim());
    assert.deepStrictEqual(key(IND.Questions), key(IND.QuestionsHi));
    return true;
  });

  await R.check('correct is not always the same side', () => {
    const ans = IND.Questions.split('|').map(q => Number(q.split('??')[2].trim()));
    const left = ans.filter(a => a === 0).length;
    // Always-left is a pattern a worker spots within five screens and then
    // taps without listening — which is what this format exists to prevent.
    return left > 0 && left < ans.length;
  });

  await R.check('every question offers exactly two actions', () =>
    IND.Questions.split('|').every(q => q.split('??')[1].split('~').length === 2));

  await R.check('the pass mark is higher than the usual 70', () =>
    IND.PassMark === 80);

  await R.check('induction is not on the yearly calendar', () => {
    const tr = fs.readFileSync(path.join(__dirname, 'src', 'training.js'), 'utf8');
    const dates = (tr.match(/function _trainingDateSeed_[\s\S]*?\n}/) || [''])[0];
    // Due when somebody joins, not in March. A scheduled induction would be
    // overdue for the whole site on day one.
    return !/TRN-IND/.test(dates);
  });

  await R.check('induction credits the Safety & Security skill', () => {
    const sm = fs.readFileSync(path.join(__dirname, 'src', 'skillmatrix.js'), 'utf8');
    return /'SKL-12'[\s\S]{0,200}TRN-IND/.test(sm);
  });

  // ---- induction opens its own session -----------------------------------
  // Induction is not on the calendar, so no plan row exists for it. But the
  // matrix counts attendance against a PLAN — with no row the test is taken
  // and then counts for nothing, which is the whole point of the feature.
  const MODS = fs.readFileSync(path.join(__dirname, 'src', 'modules.js'), 'utf8');

  await R.check('a scheduled topic still requires its session', () => {
    const body = (MODS.match(/function recordAssessment[\s\S]*?\n  var marked/) || [])[0];
    return !!body && /_isSelfScheduled_\(topicId\)\) return \{ success: false, error: 'Missing session' \}/.test(body);
  });

  await R.check('self-scheduling is read from Type, not a hardcoded id', () => {
    const body = (MODS.match(/function _isSelfScheduled_[\s\S]*?\n}/) || [])[0];
    return !!body && /'INDUCT'/.test(body) && !/TRN-IND/.test(body);
  });

  await R.check('the induction session is one per person per day', () => {
    const body = (MODS.match(/function _inductionPlanFor_[\s\S]*?\n}/) || [])[0];
    // A shared row would make the second person inducted that week look like
    // they attended the first person's session.
    return !!body && /topicId \+ '-' \+ empId \+ '-' \+ today/.test(body);
  });

  await R.check('the induction session carries an ActualDate', () => {
    const body = (MODS.match(/function _inductionPlanFor_[\s\S]*?\n}/) || [])[0];
    // The matrix counts only sessions that demonstrably happened. Without
    // this the induction is recorded and still credits nothing.
    //
    // Matched off the values object rather than the whole body: the first
    // version of this check passed against ActualDate:'' because `today`
    // appears on the PlannedDate line right above it.
    const vals = (body.match(/var values = \{[\s\S]*?\n  \};/) || [''])[0];
    return /ActualDate:\s*today\b/.test(vals) && /Status:\s*'HELD'/.test(vals);
  });

  await R.check('an existing induction session is reused, not duplicated', () => {
    const body = (MODS.match(/function _inductionPlanFor_[\s\S]*?\n}/) || [])[0];
    return !!body && /findRowByValue\(sheet, 'PlanID', planId\) !== -1\) return planId/.test(body);
  });

  // ---- the visitor safety block ------------------------------------------
  const VREG = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'vreg.html'), 'utf8');

  await R.check('a visitor section is keyed by its SQCDP key', () =>
    /'VISITOR\/'\+sec\.key\+'\/'\+lang/.test(VREG));

  await R.check('language comes from qrattLang, not an invented global', () =>
    /typeof qrattLang==='function'/.test(VREG));

  // The audio IS the dwell — a section counts as read when the voice ends.
  // But every failure path has to fall back to the timer, or a refused
  // autoplay strands the visitor on a section that never reveals and they
  // can never acknowledge the rules at all.
  await R.check('finishing the clip is what reveals the section', () =>
    /addEventListener\('ended', done\)/.test(VREG));

  await R.check('a dead or refused clip still falls back to the timer', () => {
    const body = (VREG.match(/function revealRule[\s\S]*?\n    }/) || [])[0];
    if (!body) return false;
    const onErr  = /addEventListener\('error'[\s\S]{0,90}setTimeout\(done/.test(body);
    const onFail = /play\(\)\.catch\([\s\S]{0,60}setTimeout\(done/.test(body);
    const noClip = /else \{\s*setTimeout\(done/.test(body);
    return onErr && onFail && noClip;
  });

  await R.check('a section can never be counted twice', () =>
    /if\(el\.classList\.contains\('revealed'\)\) return;/.test(VREG));

  await R.check('audio does not change the acknowledged wording', () => {
    // The screen text stays exactly as i18n.html has it, so
    // QRATT_SAFETY_VERSION is untouched and no returning visitor is dragged
    // through a re-induction just because the site gained a voice.
    const i18n = fs.readFileSync(path.join(__dirname, 'src', 'i18n.html'), 'utf8');
    return /QRATT_SAFETY_VERSION = '2026-09-06\.sqcdp\.v1'/.test(i18n);
  });

  await R.check('every SQCDP section has audio in both languages', () => {
    const root = path.join(path.dirname(__dirname), '# TRAINING', 'Courses & Content',
                           'ZED - PM', 'PM FORMATS', 'induction-audio', 'visitor-sqcdp');
    if (!fs.existsSync(root)) return true;          // clips are data, not repo
    const keys = ['sqcdp_s', 'sqcdp_q', 'sqcdp_c', 'sqcdp_d', 'sqcdp_p'];
    return keys.every(k => ['en', 'hi'].every(l =>
      fs.existsSync(path.join(root, k + '_' + l + '.opus'))));
  });

  return [R.report()];
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0);
    const p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 19: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
