// people.js — one person, everything known about them, in one place.
//
// The facts about a worker are spread across five pages: the employee master
// has their department, the skill matrix their levels, induction.js whether
// they are cleared to work unsupervised, kpi.js their KRAs, hoursSummary
// their attendance. Answering "is this person ready for the line" meant
// opening all five and holding the answer in your head.
//
// WHAT IS IN THE TABLE AND WHAT IS NOT
//
// getSkillMatrix already returns name, department, job role, photo, every
// skill cell, the gap count AND the induction badge — it calls
// _inductionBadgeMap_ internally, which reads the induction sheets once for
// everybody. So the table is built from it plus the employee master, and
// getInductionRegister is deliberately NOT called: measured live it takes
// 13.1s against the matrix's 5.8s and would only repeat what the badge says.
//
// Everything per-person — the nine induction sessions, the KRA sheet, the
// month's attendance — is fetched when a row is opened, by the functions that
// already exist. A page that loads all of it for thirty-one people pays for
// thirty-one records to show one.

/**
 * The people table: one row per person, enough to scan and filter.
 *
 * Read-only and ungated, like getSkillMatrix and getAuthorisations which it
 * is assembled from — this is the same information those pages already show
 * without a token, gathered into one place.
 */
function getPeopleTable(includeInactive) {
  var all = String(includeInactive) === 'true' || includeInactive === true;

  var matrix = getSkillMatrix('');
  if (!matrix.success) return matrix;

  var emps = getSheetAsObjects(SHEETS.EMPLOYEES);
  var byId = {};
  emps.forEach(function (e) { byId[_normEmpId_(e.EmpID)] = e; });

  // Authorisations for everybody in one read, grouped here rather than
  // fetched per row.
  var auth = {};
  try {
    var a = getAuthorisations();
    if (a.success) {
      (a.rows || []).forEach(function (r) {
        var k = _normEmpId_(r.empId);
        (auth[k] = auth[k] || []).push({ what: r.authorisation, state: r.state });
      });
    }
  } catch (e) { /* a missing register is not a reason to show no people */ }

  var rows = (matrix.people || []).map(function (p) {
    var k = _normEmpId_(p.empId);
    var e = byId[k] || {};
    var live = auth[k] || [];
    return {
      empId:      p.empId,
      name:       p.name,
      dept:       p.dept,
      jobRole:    p.jobRole,
      photoUrl:   p.photoUrl,
      gender:     String(e.Gender || ''),
      status:     String(e.Status || 'ACTIVE').toUpperCase(),
      engagement: String(e.Engagement || ''),
      phone:      String(e.Phone || ''),
      induction:  p.induction,
      skills:     (p.cells || []).length,
      gaps:       p.gaps,
      overall:    p.overall,
      authorised: live.filter(function (x) { return x.state === 'VALID'; }).length,
      authTotal:  live.length
    };
  });

  /* People on the master but NOT in the matrix are the ones most worth
     seeing: the matrix covers ACTIVE staff, so anyone missing here is
     inactive, a leaver, or one of the signatories nobody has resolved. They
     appear only when asked for, and say plainly that they have no matrix. */
  if (all) {
    var seen = {};
    rows.forEach(function (r) { seen[_normEmpId_(r.empId)] = true; });
    emps.forEach(function (e) {
      if (!e.EmpID || seen[_normEmpId_(e.EmpID)]) return;
      rows.push({
        empId: e.EmpID, name: e.Name || e.EmpID, dept: e.Department || '',
        jobRole: e.JobRole || '', photoUrl: e.PhotoURL || '',
        gender: String(e.Gender || ''), status: String(e.Status || '').toUpperCase() || 'INACTIVE',
        engagement: String(e.Engagement || ''), phone: String(e.Phone || ''),
        induction: { status: 'NONE', label: 'Not inducted' },
        skills: 0, gaps: 0, overall: 'no matrix',
        authorised: 0, authTotal: 0, offMatrix: true
      });
    });
  }

  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  return {
    success: true,
    rows: rows,
    skills: matrix.skills || [],
    counts: _peopleCounts_(rows),
    stamp: isoStamp('matrix')
  };
}

/** The five figures across the top. Computed from the rows actually shown. */
function _peopleCounts_(rows) {
  var active = rows.filter(function (r) { return r.status !== 'INACTIVE'; });
  var inducted = rows.filter(function (r) { return r.induction && r.induction.status === 'CLEARED'; });
  var gaps = active.reduce(function (n, r) { return n + (r.gaps || 0); }, 0);
  return {
    people:    rows.length,
    active:    active.length,
    inducted:  inducted.length,
    avgGaps:   active.length ? Math.round(gaps / active.length * 10) / 10 : 0,
    authorised: rows.filter(function (r) { return r.authorised > 0; }).length
  };
}

/**
 * Everything about ONE person, for an opened row.
 *
 * Four existing reads in one round trip. Each is wrapped: a person with no
 * KRA sheet, no induction and no attendance is a real and common state on
 * this site, and must render as an empty section rather than a failed page.
 */
function getPersonDetail(empId) {
  var id = String(empId || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };

  var out = { success: true, empId: id };

  try { out.induction = getInduction(id); }
  catch (e) { out.induction = { success: false, error: e.message }; }

  try { out.kra = getKraSheet(id, ''); }
  catch (e) { out.kra = { success: false, error: e.message }; }

  try { out.month = getEmployeeMonth(id); }
  catch (e) { out.month = { success: false, error: e.message }; }

  try { out.authorisations = getAuthorisations(id); }
  catch (e) { out.authorisations = { success: false, error: e.message }; }

  out.kpisOwned = _kpisOwnedBy_(id);
  return out;
}

/**
 * The KPIs this person owns.
 *
 * KpiDefinitions stores Owner as a free-text name with an honorific
 * ("Mr. Harish Singh") and has no OwnerEmpID column, so the match is on the
 * bare name — the same comparison _validateKraKpiRef_ already makes when it
 * checks a KRA cites an indicator its owner actually holds. Matching on a
 * name is weak, and it is what the sheet supports; a second person with the
 * same name would need an OwnerEmpID column, not a cleverer comparison.
 */
function _kpisOwnedBy_(empId) {
  try {
    var emp = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function (e) {
      return _sameEmpId_(e.EmpID, empId);
    })[0];
    if (!emp || !emp.Name) return [];

    var mine = _bareName_(emp.Name);
    return getSheetAsObjects(KPI_SHEETS.DEFS)
      .filter(function (d) { return _bareName_(d.Owner || '') === mine; })
      .map(function (d) {
        return { kpiId: d.KpiID, indicator: d.Indicator, target: d.Target,
                 frequency: d.Frequency, zed: d.Zed || '' };
      });
  } catch (e) {
    return [];
  }
}
