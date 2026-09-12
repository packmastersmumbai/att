/**
 * kpi.js — the KPI register (PM/FRM/MR-14) and the KRA sheet (PM/FRM/MR-27).
 *
 * MR-14 names fifteen indicators, each with ONE owner and a named source of
 * data. Its own instruction is "no figure is re-typed where an app already
 * holds it", so an indicator declares HOW it gets its number:
 *
 *   AUTO      this app computes it from its own data
 *   FETCH     PMCore reads it from the app that owns it
 *   MANUAL    somebody types it, because no system holds it yet
 *
 * FETCH is a READ. The 5S app owns its scores and MMT owns its breakdowns;
 * this register shows them and never writes them back. That is the estate
 * rule — an app owns its data and publishes it.
 *
 * MR-14 also asserts that an indicator's owner "carries the same measure as a
 * KRA on PM/FRM/MR-27 — the two cannot drift apart". On paper nothing enforced
 * that: MR-27 has no field pointing at a KPI. Here a KRA row carries KpiRef,
 * and the owner is checked against the register before the link is accepted.
 */

var KPI_DOC_ = 'PM/FRM/MR-14';
var KRA_DOC_ = 'PM/FRM/MR-27';

var KPI_SHEETS = {
  DEFS:    'KpiDefinitions',
  ENTRIES: 'KpiMonthlyEntries',
  KRA:     'KraRows'
};

var KPI_HEADERS = {
  KpiDefinitions: ['KpiID', 'Indicator', 'Owner', 'Department', 'ZED', 'Frequency',
                   'Target', 'SourceOfData', 'ComputeMode', 'Dataset', 'Active'],
  // One row per indicator per month. Append-only: a corrected figure is a new
  // row, and the old one stays — an indicator that was reported wrong and then
  // fixed is exactly what a management review needs to see.
  KpiMonthlyEntries: ['EntryID', 'KpiID', 'Year', 'Month', 'Value', 'Target',
                      'Met', 'Note', 'EnteredBy', 'EnteredAt', 'DocStamp'],
  // MR-27: one sheet per person per financial year, ten KRAs, scored monthly
  // 1 / 0 / P. Month columns carry the form's own names, not M01..M12.
  KraRows: ['EmpID', 'Name', 'FY', 'KraNo', 'Activity', 'TargetFrequency',
            'Record', 'KpiRef', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
            'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'UpdatedAt']
};

/**
 * The fifteen indicators, verbatim from PM/FRM/MR-14 Rev 3.0.
 *
 * ComputeMode and Dataset are OURS, not the form's: the form names a source in
 * prose ("MMT breakdown log") and this is the machine-readable half of that
 * sentence. Nothing else here is invented — owners, ZED numbers, frequencies
 * and targets are as printed.
 */
function _kpiSeed_() {
  return [
    ['KPI-01', 'On-time delivery vs schedule %', 'Mr. Harish Singh', 'Dispatch & Logistics', 'ZED-4', 'Monthly', '>= 95%', 'Despatch records', 'MANUAL', ''],
    ['KPI-02', 'Sales revenue vs target', 'Mr. Balkrishna Mishra', 'Management', 'ZED-14', 'Monthly', 'As budgeted', 'Sales register', 'MANUAL', ''],
    ['KPI-03', 'Customer satisfaction rating %', 'Ms. Shikha Kumar', 'Quality Assurance & Admin', 'ZED-14', 'Half-yearly', '>= 90%', 'Feedback forms', 'MANUAL', ''],
    ['KPI-04', 'Customer return PPM', 'Ms. Shikha Kumar', 'Quality Assurance & Admin', 'ZED-14', 'Monthly', 'Reducing', 'Complaints register', 'MANUAL', ''],
    ['KPI-05', 'Internal rejection PPM', 'Mr. Deepak Nishad', 'Production & Operations', 'ZED-9', 'Monthly', 'Reducing', 'IQC / in-process records', 'MANUAL', ''],
    ['KPI-06', 'Internal rework PPM', 'Mr. Deepak Nishad', 'Production & Operations', 'ZED-9', 'Monthly', 'Reducing', 'Rework register', 'MANUAL', ''],
    ['KPI-07', 'Supplier average rating %', 'Mr. Dilip Mahale', 'Stores', 'ZED-15', 'Quarterly', '>= 75%', 'GRN + IQC records', 'MANUAL', ''],
    ['KPI-08', 'Management review compliance', 'Mr. Tarun Mishra', 'Management', 'ZED-1', 'Half-yearly', 'As planned', 'MRM minutes', 'MANUAL', ''],
    ['KPI-09', 'Customer complaints count', 'Ms. Shikha Kumar', 'Quality Assurance & Admin', 'ZED-14', 'Monthly', 'Reducing', 'Complaints + CAPA file', 'MANUAL', ''],
    // The one this app owns outright: the training plan lives here.
    ['KPI-10', 'Training plan vs actual', 'Ms. Khushi Paswan', 'Office, HR & Purchase', 'ZED-6', 'Monthly', '100%', 'Training records', 'AUTO', ''],
    ['KPI-11', 'Breakdown hours and MTTR', 'Mr. Santosh Maurya', 'Maintenance', 'ZED-8', 'Monthly', '<= 5 hrs', 'MMT breakdown log', 'FETCH', 'maintenance_kpi'],
    ['KPI-12', 'Electricity, diesel, power factor', 'Mr. Santosh Maurya', 'Maintenance', 'ZED-12', 'Monthly', 'PF >= 0.95', 'Utility bill + DG log', 'MANUAL', ''],
    ['KPI-13', '5S zone audit scores — 28 zones', 'Mr. Tarun Mishra', 'Management', 'ZED-2', 'Monthly', '>= 80 / 100', '5S system', 'FETCH', 'housekeeping_5s'],
    ['KPI-14', '5S zone compliance summary', 'Mr. Tarun Mishra', 'Management', 'ZED-2', 'Monthly', '>= 80 / 100', '5S system', 'FETCH', 'housekeeping_5s'],
    ['KPI-15', 'New product development', 'Mr. Anuj Pathak', 'Management', 'ZED-18', 'Monthly', '1 per month', 'Development records', 'MANUAL', '']
  ];
}

function _ensureKpiSheets_() {
  _ensureSheetsWithHeaders_(KPI_HEADERS);
}

/** The document stamp for a KPI record, resolved at run time, never a literal. */
function _kpiStamp_(code) {
  try { return PMCore.stamp(code); }
  catch (e) { return code + ' (revision unresolved — PMCore unavailable)'; }
}

/** Seed the fifteen definitions once. Idempotent by KpiID. */
function seedKpiRegister(token) {
  _requireAdmin_(token);
  _ensureKpiSheets_();

  var sheet = getSheet(KPI_SHEETS.DEFS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var have = {};
  getSheetAsObjects(KPI_SHEETS.DEFS).forEach(function (r) { have[String(r.KpiID)] = 1; });

  var added = 0;
  _kpiSeed_().forEach(function (k) {
    if (have[k[0]]) return;
    var v = { KpiID: k[0], Indicator: k[1], Owner: k[2], Department: k[3],
              ZED: k[4], Frequency: k[5], Target: k[6], SourceOfData: k[7],
              ComputeMode: k[8], Dataset: k[9], Active: 'YES' };
    sheet.appendRow(headers.map(function (h) { return v[h] !== undefined ? v[h] : ''; }));
    added++;
  });
  return { success: true, added: added, total: _kpiSeed_().length };
}

/**
 * The register for one month: every indicator, its figure, and where the
 * figure came from.
 *
 * AUTO and FETCH are computed live rather than read from the entries sheet, so
 * the register is never staler than its sources. A stored entry is still
 * returned for MANUAL, which is the only mode where somebody typed it.
 */
function getKpiRegister(period) {
  _ensureKpiSheets_();
  var ym = String(period || '').match(/^\d{4}-\d{2}$/)
             ? String(period)
             : _isoDate_(new Date()).slice(0, 7);

  var defs = getSheetAsObjects(KPI_SHEETS.DEFS)
    .filter(function (d) { return String(d.Active || 'YES').toUpperCase() !== 'NO'; });
  if (!defs.length) return { success: true, period: ym, seeded: false, rows: [] };

  var stored = {};
  getSheetAsObjects(KPI_SHEETS.ENTRIES).forEach(function (e) {
    if (String(e.Year) + '-' + _pad2_(e.Month) !== ym) return;
    stored[String(e.KpiID)] = e;   // later row wins: append-only, latest is current
  });

  var rows = defs.map(function (d) {
    var mode = String(d.ComputeMode || 'MANUAL').toUpperCase();
    var out = {
      kpiId: d.KpiID, indicator: d.Indicator, owner: d.Owner,
      department: d.Department, zed: d.ZED, frequency: d.Frequency,
      target: d.Target, source: d.SourceOfData, mode: mode,
      value: '', note: '', from: ''
    };

    if (mode === 'AUTO' && String(d.KpiID) === 'KPI-10') {
      var a = _kpiTrainingAdherence_(ym);
      out.value = a.value; out.note = a.note; out.from = 'this app';
      return out;
    }
    if (mode === 'FETCH') {
      var f = _kpiFetch_(d.Dataset, ym);
      out.value = f.value; out.note = f.note; out.from = f.from;
      return out;
    }
    var e = stored[String(d.KpiID)];
    if (e) {
      out.value = e.Value; out.note = e.Note || '';
      out.from = 'entered by ' + (e.EnteredBy || '?');
    } else {
      out.note = 'not entered';
    }
    return out;
  });

  return {
    success: true, period: ym, seeded: true, rows: rows,
    docStamp: _kpiStamp_(KPI_DOC_),
    kpis: {
      total: rows.length,
      auto: rows.filter(function (r) { return r.mode === 'AUTO'; }).length,
      fetched: rows.filter(function (r) { return r.mode === 'FETCH'; }).length,
      manual: rows.filter(function (r) { return r.mode === 'MANUAL'; }).length,
      withFigure: rows.filter(function (r) { return r.value !== '' && r.value !== null; }).length
    }
  };
}

function _pad2_(n) { return ('0' + String(n)).slice(-2); }

/**
 * KPI-10 — training plan vs actual, for one month.
 *
 * Adherence counts only what SHOULD have happened by now: sessions held
 * against sessions due. Dividing by the whole year's plan makes a perfectly
 * on-schedule April read 8%, which reads as failure to anyone glancing at it.
 * Same rule the training page already uses, so the two cannot disagree.
 */
function _kpiTrainingAdherence_(ym) {
  try {
    var end = ym + '-31';
    var due = 0, held = 0;
    getSheetAsObjects(TRAINING_SHEETS.PLAN).forEach(function (p) {
      var planned = _isoDate_(p.PlannedDate);
      if (!planned || planned > end) return;
      due++;
      if (String(p.ActualDate || '').trim()) held++;
    });
    if (!due) return { value: '', note: 'nothing due yet' };
    return { value: Math.round(held / due * 100),
             note: held + ' held of ' + due + ' due' };
  } catch (e) {
    return { value: '', note: 'training data unavailable' };
  }
}

/**
 * Read an indicator from the app that owns it.
 *
 * A READ, never a write. An empty result is reported as empty rather than as
 * zero: "the 5S app recorded nothing this month" and "every zone scored 0" are
 * different claims, and only one of them is a finding.
 */
function _kpiFetch_(dataset, ym) {
  var name = String(dataset || '').trim();
  if (!name) return { value: '', note: 'no dataset configured', from: '' };
  try {
    var res = PMCore.fetch(name, ym);
    var rows = (res && res.rows) || [];
    if (!rows.length) {
      return { value: '', note: 'no rows for ' + ym, from: (res && res.source) || name };
    }
    return { value: rows.length, note: rows.length + ' rows', from: (res && res.source) || name };
  } catch (e) {
    return { value: '', note: 'fetch failed: ' + String(e.message).slice(0, 60), from: name };
  }
}

/** Record a MANUAL figure. Append-only — a correction is a new row. */
function saveKpiEntry(entry, token) {
  _requireAdmin_(token);
  _ensureKpiSheets_();

  var id = String((entry && entry.kpiId) || '').trim();
  var ym = String((entry && entry.period) || '').trim();
  if (!id) return { success: false, error: 'Missing KPI id' };
  if (!/^\d{4}-\d{2}$/.test(ym)) return { success: false, error: 'Period must be YYYY-MM' };

  var def = getSheetAsObjects(KPI_SHEETS.DEFS).filter(function (d) {
    return String(d.KpiID) === id;
  })[0];
  if (!def) return { success: false, error: 'Unknown KPI' };
  if (String(def.ComputeMode).toUpperCase() !== 'MANUAL') {
    return { success: false,
             error: id + ' is ' + def.ComputeMode + ' — it is computed, not entered' };
  }

  var sheet = getSheet(KPI_SHEETS.ENTRIES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var v = {
    EntryID: 'KPE-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(),
    KpiID: id, Year: Number(ym.slice(0, 4)), Month: Number(ym.slice(5, 7)),
    Value: entry.value, Target: def.Target, Met: entry.met || '',
    Note: entry.note || '', EnteredBy: String(entry.enteredBy || '').trim(),
    EnteredAt: new Date().toISOString(),
    DocStamp: _kpiStamp_(KPI_DOC_)
  };
  if (!v.EnteredBy) return { success: false, error: 'Who entered it must be recorded' };
  sheet.appendRow(headers.map(function (h) { return v[h] !== undefined ? v[h] : ''; }));
  return getKpiRegister(ym);
}

// ── KRA (PM/FRM/MR-27) ──────────────────────────────────────────────────────

/** One person's KRA sheet for a financial year. */
function getKraSheet(empId, fy) {
  _ensureKpiSheets_();
  var id = String(empId || '').trim();
  if (!id) return { success: false, error: 'Missing employee id' };
  var year = String(fy || '').trim() || _currentFy_();

  var rows = getSheetAsObjects(KPI_SHEETS.KRA)
    .filter(function (r) { return String(r.EmpID) === id && String(r.FY) === year; })
    .sort(function (a, b) { return Number(a.KraNo) - Number(b.KraNo); });

  var months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  var done = 0, total = 0;
  var out = rows.map(function (r) {
    var scores = {};
    months.forEach(function (m) {
      var v = String(r[m] || '').trim();
      scores[m] = v;
      if (v === '') return;
      total++;
      if (v === '1') done++;
    });
    return { kraNo: Number(r.KraNo), activity: r.Activity,
             targetFrequency: r.TargetFrequency || '', record: r.Record || '',
             kpiRef: r.KpiRef || '', scores: scores };
  });

  return {
    success: true, empId: id, fy: year, rows: out, months: months,
    scored: total, done: done,
    scorePct: total ? Math.round(done / total * 100) : '',
    docStamp: _kpiStamp_(KRA_DOC_)
  };
}

/** April to March. A KRA sheet is per financial year, not per calendar year. */
function _currentFy_() {
  var d = new Date();
  var y = d.getFullYear();
  var start = (d.getMonth() + 1) >= 4 ? y : y - 1;
  return start + '-' + (start + 1);
}

/**
 * Write one KRA row.
 *
 * KpiRef is what stops MR-14 and MR-27 drifting apart, so it is validated: the
 * KPI must exist, and its owner must be the person whose sheet this is. A KRA
 * claiming an indicator somebody else owns is the drift the link exists to
 * prevent — the form asserts the two carry the same measure, and prose cannot
 * enforce that.
 */
function saveKraRow(entry, token) {
  _requireAdmin_(token);
  _ensureKpiSheets_();

  var id = String((entry && entry.empId) || '').trim();
  var no = Number((entry && entry.kraNo) || 0);
  if (!id || !no) return { success: false, error: 'Missing employee or KRA number' };
  if (no < 1 || no > 10) return { success: false, error: 'MR-27 has ten KRAs' };

  var fy = String(entry.fy || '').trim() || _currentFy_();
  var emp = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function (e) {
    return String(e.EmpID) === id;
  })[0];
  if (!emp) return { success: false, error: 'Employee not found' };

  var ref = String(entry.kpiRef || '').trim();
  if (ref) {
    var chk = _validateKraKpiRef_(ref, emp.Name || '');
    if (!chk.ok) return { success: false, error: chk.error };
  }

  var sheet = getSheet(KPI_SHEETS.KRA);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var last = sheet.getLastRow();
  var row = -1;
  if (last > 1) {
    var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
    var eC = headers.indexOf('EmpID'), fC = headers.indexOf('FY'), nC = headers.indexOf('KraNo');
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][eC]) === id && String(data[i][fC]) === fy &&
          Number(data[i][nC]) === no) { row = i + 2; break; }
    }
  }

  var months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  if (row === -1) {
    var v = { EmpID: id, Name: emp.Name || id, FY: fy, KraNo: no,
              Activity: entry.activity || '', TargetFrequency: entry.targetFrequency || '',
              Record: entry.record || '', KpiRef: ref, UpdatedAt: new Date().toISOString() };
    months.forEach(function (m) { v[m] = (entry.scores && entry.scores[m]) || ''; });
    sheet.appendRow(headers.map(function (h) { return v[h] !== undefined ? v[h] : ''; }));
  } else {
    if (entry.activity !== undefined) setCell(sheet, row, 'Activity', entry.activity);
    if (entry.targetFrequency !== undefined) setCell(sheet, row, 'TargetFrequency', entry.targetFrequency);
    if (entry.record !== undefined) setCell(sheet, row, 'Record', entry.record);
    if (entry.kpiRef !== undefined) setCell(sheet, row, 'KpiRef', ref);
    if (entry.scores) {
      months.forEach(function (m) {
        if (entry.scores[m] === undefined) return;
        var sc = String(entry.scores[m]).trim().toUpperCase();
        // 1 done on time, 0 not done, P partial — MR-27's own scale. Anything
        // else is refused rather than stored, because a stray value silently
        // changes the Score % at the bottom of the form.
        if (sc !== '' && sc !== '1' && sc !== '0' && sc !== 'P') return;
        setCell(sheet, row, m, sc);
      });
    }
    setCell(sheet, row, 'UpdatedAt', new Date().toISOString());
  }
  return getKraSheet(id, fy);
}

/** The KPI must exist and belong to this person. */
function _validateKraKpiRef_(ref, personName) {
  var def = getSheetAsObjects(KPI_SHEETS.DEFS).filter(function (d) {
    return String(d.KpiID) === ref;
  })[0];
  if (!def) return { ok: false, error: 'Unknown KPI ' + ref };

  // Names on MR-14 carry honorifics ("Mr. Harish Singh") while the employee
  // master does not. Compare on the bare surname-and-given-name text.
  var a = _bareName_(def.Owner), b = _bareName_(personName);
  if (a && b && a !== b) {
    return { ok: false,
             error: ref + ' is owned by ' + def.Owner + ', not ' + personName };
  }
  return { ok: true };
}

function _bareName_(n) {
  return String(n || '').replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '')
           .replace(/\s+/g, ' ').trim().toUpperCase();
}
