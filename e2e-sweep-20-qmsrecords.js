'use strict';
/**
 * Suite 20 — Controlled records.
 *
 * These emit the site's own QMS documents (PM/OH/REC-007 Mock Drill Report,
 * PM/REG/HR-01 Competence & Training Matrix) from live data. They carry real
 * doc numbers and end up in an audit file, so the things that must hold are
 * about what the document CLAIMS:
 *
 *   - a drill with no report produces NO document, because a correctly
 *     numbered form with every field blank is a more convincing lie than an
 *     empty folder
 *   - a generated record is a DRAFT until a person approves it: "a machine
 *     assembled this" and "somebody checked it" must never look the same
 *   - approving is admin-gated, because that stamp is the signature
 *   - fields this system does not hold are left BLANK, never guessed
 */
const fs   = require('fs');
const path = require('path');
const assert = require('assert');
const { makeRunner } = require('./e2e-lib');

const SRC   = fs.readFileSync(path.join(__dirname, 'src', 'qmsRecords.js'), 'utf8');
const DRILL = fs.readFileSync(path.join(__dirname, 'src', 'mockdrill.js'), 'utf8');

function lift(src, name, stubs) {
  const body = (src.match(new RegExp('function ' + name + '[\\s\\S]*?\\n}')) || [])[0];
  if (!body) throw new Error(name + ' not found');
  const names = Object.keys(stubs || {});
  return new Function(...names, body + '; return ' + name + ';')(...names.map(n => stubs[n]));
}

async function run() {
  const R = makeRunner('20 controlled records');

  const qmsDate = lift(SRC, '_qmsDate_', {});
  const roleRows = lift(SRC, '_drillRoleRows_', {});
  const actionRows = lift(SRC, '_drillActionRows_', { _qmsDate_: qmsDate });
  const equip = lift(SRC, '_drillEquipmentOptions_', {});
  const bump = lift(SRC, '_bumpVersion_', {});

  // ---- the empty-document refusal ---------------------------------------
  await R.check('a drill with no report produces no document', () => {
    const body = (SRC.match(/function getDrillRecordDoc[\s\S]*?\n  var r = /) || [])[0];
    return !!body && /if \(!d\.conducted\)/.test(body) && /notConducted: true/.test(body);
  });

  await R.check('the refusal says why, not just no', () =>
    /A controlled record cannot[\s\S]{0,90}nobody wrote up/.test(SRC));

  // ---- draft until approved ---------------------------------------------
  await R.check('an unapproved record is stamped DRAFT, not versioned', () => {
    const body = (SRC.match(/function _withApproval_[\s\S]*?\n}/) || [])[0];
    return !!body &&
      /doc\.version = approved \? \(rec\.Version \|\| '1\.0'\) : 'DRAFT'/.test(body) &&
      /doc\.watermark = approved \? '' : 'DRAFT/.test(body);
  });

  await R.check('an unapproved record carries no effective date', () => {
    const body = (SRC.match(/function _withApproval_[\s\S]*?\n}/) || [])[0];
    // An effective date on an unreviewed document is the field that makes it
    // look live in a file.
    return /doc\.effective_date = approved \? _qmsDate_\(rec\.ApprovedAt\) : ''/.test(body);
  });

  await R.check('approving is admin-gated', () => {
    const body = (SRC.match(/function approveQmsRecord[\s\S]*?\n}/) || [])[0];
    const guard = body.indexOf('_requireAdmin_(token)');
    const write = body.indexOf('appendRow');
    return guard > -1 && (write === -1 || guard < write);
  });

  await R.check('re-approving bumps the version rather than overwriting', () => {
    assert.strictEqual(bump('1.0'), '2.0');
    assert.strictEqual(bump('2.0'), '3.0');
    assert.strictEqual(bump(''), '2.0');
    return true;
  });

  // ---- dates in the site's own format -----------------------------------
  await R.check('dates print DD/MM/YYYY, as every paper record does', () => {
    assert.strictEqual(qmsDate('2026-09-02'), '02/09/2026');
    assert.strictEqual(qmsDate(''), '');
    assert.strictEqual(qmsDate('bad'), '');
    return true;
  });

  // ---- the ERT table ----------------------------------------------------
  await R.check('team names are read from report.team, not the report root', () => {
    const rows = roleRows({ team: { SiteInCharge: 'A Sharma', FirstAider: 'B Rao' } });
    const byRole = {};
    rows.forEach(r => { byRole[r[0]] = r[2]; });
    assert.strictEqual(byRole['Site In-charge'], 'A Sharma');
    assert.strictEqual(byRole['First-aiders'], 'B Rao');
    return true;
  });

  await R.check('every role in the format appears, named or not', () => {
    const rows = roleRows({ team: {} });
    // Five rows including "All personnel", which has no named holder — the
    // format lists it because everyone on site is part of the response.
    return rows.length === 5 && rows.every(r => r[1] && r[1].length > 10);
  });

  // ---- recommendations --------------------------------------------------
  await R.check('recommendations keep the form its five rows', () => {
    assert.strictEqual(actionRows({ recommendations: ['one'] }).length, 5);
    assert.strictEqual(actionRows({ recommendations: [] }).length, 5);
    return true;
  });

  await R.check('a recommendation with an owner keeps it', () => {
    const rows = actionRows({ recommendations: [
      { text: 'Re-brief segregation', owner: 'Supervisor', targetDate: '2026-10-01' }] });
    return rows[0][0] === 'Re-brief segregation' && rows[0][2] === 'Supervisor'
        && rows[0][3] === '01/10/2026';
  });

  // ---- equipment checklist ----------------------------------------------
  await R.check('the ten-point equipment list matches the QMS format', () => {
    const opts = equip({});
    return opts.length === 10 && opts[0] === 'Alarm / siren audible throughout';
  });

  await R.check('a procedure may add equipment, never lose the ten', () => {
    const opts = equip({ equipment: ['Breathing apparatus', 'Exit signage visible'] });
    // The duplicate is not added twice; the new one is appended.
    return opts.length === 11 && opts.indexOf('Breathing apparatus') === 10;
  });

  // ---- nothing is invented ----------------------------------------------
  await R.check('matrix columns this system does not hold are left blank', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // Qualification, training identified, trainer and next-due are columns the
    // QMS carries and this app does not. A competence register invented in
    // part is worth nothing whole.
    return /Qualification — not held/.test(body) && /Next due — not held/.test(body);
  });

  await R.check('N.A. competences are omitted, not printed blank', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // A blank row in a competence register reads as a gap rather than as
    // "this job does not need it".
    return /if \(c\.level === 'NA'\) return;/.test(body);
  });

  // ---- the matrix has to fit on a page ----------------------------------
  await R.check('the matrix is people down and skills across', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // A row per person per competence is what the QMS column list literally
    // describes and it runs to 406 rows — twenty pages of mostly-empty cells
    // against a format laid out for 20 rows a sheet. An unreadable register
    // is not a register.
    return /var wide = \(m\.people \|\| \[\]\)\.map/.test(body) &&
           /columns: \['Employee Name', 'Designation'\]\.concat\(skillCols\)/.test(body);
  });

  await R.check('N.A. prints as N.A., never as an empty cell', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // Blank reads as a gap. "This job does not need it" is not a gap, and the
    // difference is the whole point of a competence matrix.
    return /c\.level === 'NA' \? 'N\.A\.'/.test(body);
  });

  await R.check('the annexure lists only what is short', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // Repeating every cell in longhand says nothing the grid did not. The
    // reader opened the annexure to find what is missing.
    return /rows\.filter\(function \(r\) \{ return r\[9\] === 'NO'; \}\)/.test(body);
  });

  await R.check('the level key travels with the document', () => {
    const body = (SRC.match(/function getTrainingMatrixDoc[\s\S]*?\n}/) || [])[0];
    // L1..L4 on a page with no key is unreadable to the auditor it is for,
    // and the L3 rule is the one an assessor most needs in front of them.
    return /m\.levelNames/.test(body) && /SOP-SM-001 §6\.2/.test(body);
  });

  await R.check('the annexure is capped, and says so on the page', () => {
    const MAX = Number((SRC.match(/var ANNEXURE_MAX = (\d+)/) || [])[1]);
    const ann = lift(SRC, '_annexureBlock_', { ANNEXURE_MAX: MAX });
    const many = [];
    for (let i = 0; i < 404; i++) many.push(['P' + i, '', '', 'S', '', '', '', '', '', 'NO', '', '']);
    const b = ann(many);
    // While coverage is near zero almost every competence is short — the live
    // matrix produced 404 annexure rows, the same twenty-page document the
    // grid was reshaped to avoid. Capped, but never silently: a register
    // quietly showing 60 of 404 gaps understates exactly what it exists to
    // report.
    if (b.rows.length !== 60) throw new Error('annexure not capped: ' + b.rows.length);
    if (!/first 60 of 404/.test(b.title)) throw new Error('the cap is not stated in the title');
    if (!/404/.test(b.note || '')) throw new Error('the full count is not stated');
    return true;
  });

  await R.check('a short annexure is not capped or captioned', () => {
    const MAX = Number((SRC.match(/var ANNEXURE_MAX = (\d+)/) || [])[1]);
    const ann = lift(SRC, '_annexureBlock_', { ANNEXURE_MAX: MAX });
    const few = [['A', '', '', 'S', '', '', '', '', '', 'NO', '', '']];
    const b = ann(few);
    return b.rows.length === 1 && !/first/.test(b.title) && !b.note;
  });

  // ---- the new drill fields ---------------------------------------------
  await R.check('the head count is now part of the drill schema', () => {
    // PM/OH/REC-007 asks for persons on site and persons accounted for. The
    // old schema could not record either, so the one number an evacuation
    // drill exists to produce had nowhere to go.
    return /'PersonsOnSite', 'PersonsAccounted'/.test(DRILL) &&
           /personsAccounted:/.test(DRILL);
  });

  await R.check('announced vs unannounced is recorded', () =>
    /'Announced'/.test(DRILL) && /announced:\s+r\.Announced/.test(DRILL));

  await R.check('the drill schema is extended through the shared helper', () =>
    /_ensureSheetsWithHeaders_/.test(DRILL));

  return [R.report()];
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0);
    const p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 20: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
