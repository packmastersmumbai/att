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
  // IMS-01 step 7 (authorisations) and step 5 (toolbox talks). Both are
  // 45001 records the app had no home for.
  safetyCompetence: 'PM/OH-REC-006', // cl 7.2     Safety Competency & Training Register
  toolbox:        'PM/REG/OHS-01',   // cl 7.2     Toolbox Talk & Induction Register
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

/**
 * Tell the ISO this app is bound, and to which documents.
 *
 * Call once a day from a trigger this app already has. It is bookkeeping: it
 * never throws, and nothing here should ever wait on it. Without it, whether
 * this app is wired is a claim in a file rather than something the ISO can see.
 */
function isoAnnounce(force) {
  // Once a day is the point; more often is waste. The host function may run
  // hourly or every few minutes — that is the host's business, not this one's,
  // so the limit lives here rather than in the choice of host.
  try {
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(),
                                     'yyyy-MM-dd');
    if (!force && props.getProperty('ISO_ANNOUNCED') === today) {
      return {ok: true, skipped: 'already announced today'};
    }
    var r = PMCore.announce('aqrs', ISO_DOCS);
    if (r && r.ok) props.setProperty('ISO_ANNOUNCED', today);
    return r;
  } catch (e) {
    // Never let bookkeeping break the job it rides on. If PMCore is not bound,
    // `PMCore` is undefined and a bare call would be a ReferenceError that
    // takes the host function down with it.
    console.error('isoAnnounce: ' + e);
    return {ok: false, error: String(e)};
  }
}

/**
 * Is the announce actually scheduled?
 *
 * isoAnnounce() rides on sendDailySummary, which is only useful if that function is on
 * a time-based trigger. If it is not, this app will never report itself and the
 * ISO's consumer list will quietly omit it — the exact failure the list exists
 * to prevent, one level up.
 */
function isoTriggerCheck() {
  var host = 'sendDailySummary', found = null;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === host) found = String(t.getEventType());
  });
  var all = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    all.push(t.getHandlerFunction() + ' (' + t.getEventType() + ')');
  });
  return {host: host, scheduled: !!found, eventType: found,
          note: found ? 'announces whenever ' + host + ' runs'
                      : 'NOT SCHEDULED — this app will never announce itself',
          // listed so a wrong host is visible, not merely reported as absent
          triggers: all.sort()};
}

/**
 * The stamp for a page header, with the failure made visible.
 *
 * isoStamp returns '' when PMCore cannot resolve the code, which on a page
 * header would print a bare separator and look like a styling bug. On a
 * controlled record the honest reading of an unresolved document is that the
 * record cannot cite one — so say that, rather than leaving a gap the reader
 * fills in with the wrong assumption.
 */
function _pageStamp_(kind) {
  var s = isoStamp(kind);
  return s || ((ISO_DOCS[kind] || kind) + ' — revision unresolved');
}
