/**
 * AqrsIsoStamp.js — this app's link to the controlled document register.
 *
 * Every record this app writes is audit evidence, and evidence has to say which
 * issue of which controlled document it was recorded against. That revision
 * changes without this app being redeployed, so it is resolved at call time
 * from PMCore and never written here as a literal.
 *
 * The mapping below is not decoration and the entries are NOT interchangeable.
 * Citing the wrong document is worse than citing none: it asserts the work was
 * done against something that does not describe it.
 *
 * Prefixed, because Apps Script shares one global namespace across every file
 * in this project.
 */

var ISO_DOCS = {
  attendance:     'PM/FRM/HR-05',    // cl 7.2     Training Attendance Sheet
  plan:           'PM/FRM/HR-04',    // cl 7.2     Annual Training Plan
  effectiveness:  'PM/FRM/HR-06',    // cl 7.2     Training Effectiveness Record
  test:           'PM/FRM/HR-07',    // cl 7.2     Training Effectiveness Test Paper
  induction:      'PM/FRM/HR-08',    // cl 7.2     Induction Programme - New Joiner
  matrix:         'PM/REG/HR-01',    // cl 7.2     Competence & Skill Matrix
  personnel:      'PM/REG/HR-03',    // cl 5.3     Personnel Master & Signature Register
  gatepass:       'PM/FRM/STR-02',   // cl 8.5.4   Gate Pass - Material Outward
  mockdrill:      'PM/FRM/ENV-08'    // cl 8.2     Mock Emergency Drill Record
};

/**
 * The line to print on a record:
 *   isoStamp('attendance') -> "PM/FRM/HR-05 Rev 1.0, effective 01.04.2026"
 *
 * Returns '' rather than throwing — a stamp must never block someone mid-entry
 * — but logs, because a record written without one is a finding waiting to
 * happen.
 */
function isoStamp(kind) {
  var code = ISO_DOCS[kind] || kind;
  if (!code) { console.error('isoStamp: no document for ' + kind); return ''; }
  try {
    return PMCore.stamp(code) || '';
  } catch (e) {
    console.error('isoStamp(' + code + '): ' + e);
    return '';
  }
}

/** Run by hand to confirm the binding, and that every mapped code resolves. */
function isoCheck() {
  var h = PMCore.health(), out = {}, bad = 0;
  Object.keys(ISO_DOCS).forEach(function (k) {
    var d = PMCore.doc(ISO_DOCS[k]);
    if (!d) bad++;
    out[k] = d ? (ISO_DOCS[k] + ' | ' + d.title + ' | cl ' + d.clause)
               : ISO_DOCS[k] + ' | NOT IN THE REGISTRY';
  });
  return {registry: h.documents + ' documents from ' + h.source,
          degraded: h.degraded === true, unresolved: bad, documents: out};
}
