// ============================================================
// qmsRecords.js — live records rendered into the site's controlled formats
//
// The QMS at "Pack Masters Digital ISO" already defines the documents these
// records belong in — PM/OH/REC-007 Mock Drill Report, PM/REG/HR-01 Competence
// & Training Matrix — with doc numbers, versions, approval chains, ISO clause
// mapping and a QR back to the portal. This app holds the data those documents
// are supposed to contain.
//
// They were two systems describing the same drill. This closes that: the app
// emits the QMS's own JSON shape, and the QMS pipeline renders it to
// HTML/PDF/DOCX. No rendering is reimplemented here.
//
// TWO RULES THAT MATTER MORE THAN THE FORMATTING:
//
//   1. A generated record is a DRAFT until somebody approves it. It carries a
//      real doc number, so an unreviewed one loose in the audit file is worse
//      than no document — the whole point of the review is that a person
//      checked the machine.
//
//   2. Nothing is generated for a session with no underlying record. The three
//      2026 drills marked held carry no report; rendering those would produce
//      a controlled document, correctly numbered, with every field blank.
//      That is a more convincing lie than an empty folder.
// ============================================================

var QMS_SHEETS = {
  APPROVALS: 'QmsRecordApprovals'
};

var QMS_HEADERS = {
  // One row per generated record. Not the document itself — that is rebuilt
  // from live data every time — only who signed off on what, and when.
  QmsRecordApprovals: ['RecordID', 'DocCode', 'SourceID', 'Version',
                       'Status', 'PreparedBy', 'PreparedAt',
                       'ApprovedBy', 'ApprovedAt', 'Notes']
};

function _ensureQmsSheets_() {
  _ensureSheetsWithHeaders_(QMS_HEADERS);
}

/**
 * Header fields every controlled document carries, read from Config so the
 * site can change an approver without a deploy. Defaults match the QMS as it
 * stands today.
 */
function _qmsHeader_(docCode, title, titleHi, deptKey, department, orientation) {
  function cfg(key, fallback) {
    try {
      var v = getConfigValue(key);
      return (v === '' || v == null) ? fallback : String(v);
    } catch (e) { return fallback; }
  }
  return {
    doc_code: docCode,
    form_no: docCode,
    doc_title: title,
    title: title,
    title_hi: titleHi,
    doc_type: 'form',
    department: department,
    dept_key: deptKey,
    orientation: orientation || 'portrait',
    company_name: cfg('OrgName', 'Pack Masters'),
    company_address: cfg('OrgAddress', 'Rabale MIDC, Navi Mumbai'),
    company_code: 'PM',
    owner:          cfg('QmsOwner', 'Ms. Khushi Paswan'),
    owner_title:    cfg('QmsOwnerTitle', 'Quality Management Representative'),
    reviewer:       cfg('QmsReviewer', 'Tarun Mishra'),
    reviewer_title: cfg('QmsReviewerTitle', 'General Manager – Operations'),
    approver:       cfg('QmsApprover', 'Balkrishna Mishra'),
    approver_title: cfg('QmsApproverTitle', 'CEO / Managing Director'),
    retention: '3 years',
    print_class: 'RECORD',
    print_label: 'Print on use',
    qr_target: cfg('QmsPortalBase',
                   'https://packmastersmumbai.github.io/pmdigitaliso/html/') +
               docCode.replace(/\//g, '_') + '.html'
  };
}

/** dd/mm/yyyy — what the site writes on every paper record. */
function _qmsDate_(iso) {
  if (!iso || String(iso).length < 10) return '';
  var s = String(iso);
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

// ── PM/OH/REC-007 · Mock Drill Report ──────────────────────────────────────

/**
 * One conducted drill, in the QMS's own block shape.
 *
 * Refuses a drill with no report rather than emitting blank fields under a
 * real doc number.
 */
function getDrillRecordDoc(planId) {
  _ensureQmsSheets_();
  var id = String(planId || '').trim();
  if (!id) return { success: false, error: 'Missing plan id' };

  var d = getDrillReport(id);
  if (!d || !d.success) return { success: false, error: (d && d.error) || 'Drill not found' };
  if (!d.conducted) {
    return { success: false, notConducted: true,
             error: 'This drill has no report yet. A controlled record cannot ' +
                    'be issued for a drill nobody wrote up.' };
  }

  var r = d.report || {};
  var proc = d.procedure || {};
  var doc = _qmsHeader_('PM/OH/REC-007', 'Mock Drill Report',
                        'मॉक ड्रिल रिपोर्ट', 'EHS',
                        'Environment, Health & Safety', 'portrait');

  doc.instructions = [
    'Complete within 48 hours of the drill, while timings and observations are still accurate.',
    'Record the time actually taken, not the time expected — a slow drill is the finding.',
    'Every recommendation needs an owner and a target date, or it is not an action.'
  ];

  doc.blocks = [
    { type: 'fields', title: '1. Drill details', cols: 3, items: [
      { label: 'Drill No.',               value: id },
      { label: 'Date',                    value: _qmsDate_(d.actualDate) },
      { label: 'Time',                    value: r.startTime || '' },
      { label: 'Scenario Rehearsed',      value: proc.name || r.scenario || '' },
      { label: 'Location / Area',         value: r.location || '' },
      { label: 'Announced / Unannounced', value: r.announced || '' },
      { label: 'Emergency Reported By',   value: r.reportedBy || '' },
      { label: 'Alarm Raised At',         value: r.startTime || '' },
      { label: 'All-Clear Given At',      value: r.endTime || '' },
      { label: 'Total Evacuation Time',
        value: (r.responseMinutes === '' || r.responseMinutes == null)
                 ? '' : r.responseMinutes + ' min (target ' + (proc.targetMinutes || '—') + ')' },
      { label: 'Persons on Site',         value: r.personsOnSite || '' },
      { label: 'Persons Accounted For',   value: r.personsAccounted || '' }
    ]},
    { type: 'table', title: '2. Response team performance',
      columns: [{ label: 'Role', width: '175px' },
                { label: 'Expected', width: '195px' },
                { label: 'Observed' },
                { label: 'OK / Not OK', width: '72px' }],
      rows: _drillRoleRows_(r) },
    { type: 'ticks', title: '3. Equipment and systems checked during the drill',
      options: _drillEquipmentOptions_(proc),
      checked: r.equipmentChecked || [] },
    { type: 'text', title: '4. Observations (what went well, what did not)',
      lines: 5, value: r.observations || '' },
    { type: 'table', title: '5. Recommendations and corrective actions',
      columns: [{ label: 'Recommendation' }, { label: 'Action required' },
                { label: 'Responsibility', width: '110px' },
                { label: 'Target date', width: '78px' },
                { label: 'Closed on', width: '78px' }],
      rows: _drillActionRows_(r) }
  ];

  return _withApproval_(doc, 'PM/OH/REC-007', id);
}

/**
 * The ERT table. Expected behaviour comes from the QMS format, not from us —
 * it is what the site committed each role would do.
 */
function _drillRoleRows_(r) {
  var expected = [
    ['SiteInCharge', 'Site In-charge',
     'Declared the emergency, directed the response, gave the all-clear'],
    ['FireFighter', 'Fire fighters',
     'Responded on time with the correct extinguisher'],
    ['FirstAider', 'First-aiders',
     'Attended the casualty and called for medical help'],
    ['SecurityLead', 'Security',
     'Cleared the gate, stopped entry, took the head count'],
    [null, 'All personnel',
     'Stopped work, evacuated by the nearest exit, stayed at assembly point']
  ];
  // The named people sit under report.team, keyed exactly as DRILL_ROLES —
  // not flattened onto the report itself.
  var team = r.team || {};
  return expected.map(function (e) {
    var who = e[0] ? (team[e[0]] || '') : '';
    return [e[1], e[2], who, who ? 'OK' : ''];
  });
}

/** The QMS ten-point list, plus anything the procedure names beyond it. */
function _drillEquipmentOptions_(proc) {
  var base = ['Alarm / siren audible throughout', 'Emergency exits unobstructed',
              'Exit signage visible', 'Emergency lighting worked',
              'Extinguishers accessible and in date', 'Hydrant / hose reel',
              'First-aid box stocked', 'Spill kit available',
              'Assembly point marked and clear', 'Contact list current'];
  (proc.equipment || []).forEach(function (e) {
    if (base.indexOf(e) === -1) base.push(e);
  });
  return base;
}

/**
 * Recommendations, padded to five rows so the printed form keeps its shape.
 *
 * Already an array from _reportOut_ (stored as JSON, not pipe-separated), and
 * an entry may be a bare string or an object carrying its owner and dates.
 */
function _drillActionRows_(r) {
  var rows = (r.recommendations || []).map(function (x) {
    if (x && typeof x === 'object') {
      return [x.text || x.recommendation || '', x.action || '',
              x.owner || '', _qmsDate_(x.targetDate), _qmsDate_(x.closedOn)];
    }
    return [String(x || ''), '', '', '', ''];
  });
  while (rows.length < 5) rows.push(['', '', '', '', '']);
  return rows;
}

// ── PM/REG/HR-01 · Competence & Training Matrix ────────────────────────────

/**
 * The skill matrix as the site's controlled register.
 *
 * One row per person per skill they are REQUIRED to hold — N.A. cells are
 * omitted rather than printed blank, because a blank row in a competence
 * register reads as a gap rather than as "not applicable to this job".
 */
function getTrainingMatrixDoc(year) {
  _ensureQmsSheets_();
  var m = getSkillMatrix();
  if (!m || !m.success) return { success: false, error: (m && m.error) || 'Matrix unavailable' };

  var y = String(year || new Date().getFullYear());
  var doc = _qmsHeader_('PM/REG/HR-01', 'Competence & Training Matrix',
                        'योग्यता एवं प्रशिक्षण मैट्रिक्स', 'HR',
                        'Human Resources & Administration', 'landscape');
  doc.doc_type = 'tracking_sheet';

  doc.instructions = [
    'One row per person per competence they are required to hold.',
    'Level is set from recorded training and assessment, never typed in directly.',
    'A level above L2 is a supervisor judgement and must be signed, per SOP-SM-001 §6.2.'
  ];

  var skillById = {};
  (m.skills || []).forEach(function (s) { skillById[s.skillId] = s; });

  // ONE ROW PER PERSON, skills as columns — not a row per person per skill.
  //
  // The long form is what the QMS column list literally describes, and it is
  // unusable: 29 people against 14 competences is 406 rows, roughly twenty
  // printed pages of mostly-empty cells, against a format that lays out 20
  // rows to a sheet. Nobody reads that, and an unreadable register is not a
  // register. The site's own F-HR-01 puts people down and skills across for
  // exactly this reason, and it fits on one landscape page.
  var skillCols = (m.skills || []).map(function (s) { return s.name; });
  var wide = (m.people || []).map(function (p) {
    var byId = {};
    (p.cells || []).forEach(function (c) { byId[c.skillId] = c; });
    var row = [p.name || '', p.jobRole || ''];
    (m.skills || []).forEach(function (s) {
      var c = byId[s.skillId] || {};
      // N.A. is printed as N.A., never blank: a blank cell in a competence
      // register reads as a gap, and "this job does not need it" is not a gap.
      row.push(c.level === 'NA' ? 'N.A.' : (c.level || '—'));
    });
    row.push(String(p.gaps == null ? '' : p.gaps));
    return row;
  });

  // The long form is still built, as the annexure that carries the detail a
  // single letter per cell cannot: what set the level, and why it is short.
  var rows = [];
  (m.people || []).forEach(function (p) {
    (p.cells || []).forEach(function (c) {
      if (c.level === 'NA') return;          // not required for this job role
      var s = skillById[c.skillId] || {};
      // Only what the matrix actually holds. Qualification, trainer and the
      // next-due date are columns the QMS format carries and this system does
      // not — left blank rather than filled with a plausible guess, because a
      // competence register invented in part is worth nothing whole.
      rows.push([
        p.name || '',
        p.jobRole || '',
        '',                                       // Qualification — not held
        s.name || c.skillId,
        '',                                       // Training identified — not held
        '',                                       // Training date — see history
        '',                                       // Trainer — see the session
        c.source === 'ASSESSED' ? 'Module test'
          : c.source === 'OVERRIDE' ? 'Supervisor judgement'
          : c.source === 'ATTENDED' ? 'Attendance' : '',
        c.level || '—',
        c.gap ? 'NO' : 'YES',
        '',                                       // Next due — not held
        (c.flag ? String(c.flag).replace(/_/g, ' ').toLowerCase() + '. ' : '') +
          'Minimum ' + (c.min || '—')
      ]);
    });
  });

  doc.blocks = [
    { type: 'fields', title: 'Matrix Details', cols: 4, items: [
      { label: 'Year',        value: y },
      { label: 'Department',  value: m.group || 'All' },
      { label: 'Prepared By', value: doc.owner },
      { label: 'Sheet No.',   value: '1 of 1' }
    ]},
    { type: 'table', title: 'Competence & Training Matrix',
      columns: ['Employee Name', 'Designation'].concat(skillCols).concat(['Gaps']),
      rows: wide },
    { type: 'note',
      text: 'Levels: ' + Object.keys(m.levelNames || {}).map(function (k) {
              return k + ' ' + m.levelNames[k];
            }).join(' · ') + '. N.A. = not required for that job role. ' +
            'A level above L2 is a supervisor judgement and is signed, per ' +
            'SOP-SM-001 §6.2 — this system never sets one.' },
    { type: 'note',
      text: 'Coverage ' + (m.kpis || {}).coverage + '% · ' +
            (m.kpis || {}).gaps + ' gaps across ' + (m.kpis || {}).required +
            ' required competences · ' + (m.kpis || {}).people + ' people. ' +
            'Next review ' + _qmsDate_(m.nextReview || '') + '.' },
    // The detail behind the grid. Only the cells that are SHORT — a full
    // annexure repeats what the grid already says, and the reader is looking
    // for what is missing.
    { type: 'table', title: 'Annexure A · Competences below the required level',
      columns: ['Employee Name', 'Designation', 'Qualification',
                'Required Competence', 'Training Identified', 'Training Date',
                'Trainer', 'Assessment Method', 'Result',
                'Effectiveness Verified', 'Next Training Due', 'Remarks'],
      rows: rows.filter(function (r) { return r[9] === 'NO'; }) },
    { type: 'signoff' }
  ];

  return _withApproval_(doc, 'PM/REG/HR-01', y);
}

// ── Draft / approved state ─────────────────────────────────────────────────

/**
 * Stamps the record with its approval state.
 *
 * A generated document is a DRAFT until a person approves it. It carries a
 * real doc number and will sit in an audit file, so "a machine assembled this
 * from live data" and "a responsible person checked it" must never look the
 * same on the page.
 */
function _withApproval_(doc, docCode, sourceId) {
  var rec = _findApproval_(docCode, sourceId);
  var approved = rec && String(rec.Status).toUpperCase() === 'APPROVED';

  doc.version = approved ? (rec.Version || '1.0') : 'DRAFT';
  doc.status = approved ? 'APPROVED' : 'DRAFT';
  doc.watermark = approved ? '' : 'DRAFT — FOR REVIEW';
  doc.effective_date = approved ? _qmsDate_(rec.ApprovedAt) : '';
  doc.generated_at = new Date().toISOString();

  doc.approvals = {
    prepared_by: { name: doc.owner, title: doc.owner_title,
                   date: approved ? _qmsDate_(rec.PreparedAt) : '' },
    reviewed_by: { name: doc.reviewer, title: doc.reviewer_title, date: '' },
    approved_by: { name: approved ? (rec.ApprovedBy || doc.approver) : doc.approver,
                   title: doc.approver_title,
                   date: approved ? _qmsDate_(rec.ApprovedAt) : '' }
  };

  return { success: true, doc: doc, status: doc.status,
           docCode: docCode, sourceId: String(sourceId) };
}

function _findApproval_(docCode, sourceId) {
  var rows = getSheetAsObjects(QMS_SHEETS.APPROVALS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].DocCode) === String(docCode) &&
        String(rows[i].SourceID) === String(sourceId)) return rows[i];
  }
  return null;
}

/**
 * Approve a generated record. Admin-gated: this is the signature that turns a
 * machine-assembled draft into a controlled document.
 */
function approveQmsRecord(docCode, sourceId, approvedBy, notes, token) {
  _requireAdmin_(token);
  _ensureQmsSheets_();
  if (!docCode || !sourceId) return { success: false, error: 'Missing document' };
  if (!approvedBy) return { success: false, error: 'Who is approving this?' };

  var sheet = getSheet(QMS_SHEETS.APPROVALS);
  var headers = QMS_HEADERS.QmsRecordApprovals;
  var now = new Date().toISOString();
  var existing = _findApproval_(docCode, sourceId);

  var values = {
    RecordID: existing ? existing.RecordID : 'QMS-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    DocCode: docCode, SourceID: String(sourceId),
    // Re-approving after a change bumps the version rather than overwriting:
    // the register should show that this record was reissued.
    Version: existing ? _bumpVersion_(existing.Version) : '1.0',
    Status: 'APPROVED',
    PreparedBy: existing ? existing.PreparedBy : approvedBy,
    PreparedAt: existing ? existing.PreparedAt : now,
    ApprovedBy: approvedBy, ApprovedAt: now, Notes: notes || ''
  };

  var row = -1;
  var rows = getSheetAsObjects(QMS_SHEETS.APPROVALS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].DocCode) === String(docCode) &&
        String(rows[i].SourceID) === String(sourceId)) { row = i + 2; break; }
  }
  if (row === -1) {
    sheet.appendRow(headers.map(function (h) {
      return values[h] !== undefined ? values[h] : '';
    }));
  } else {
    headers.forEach(function (h) { setCell(sheet, row, h, values[h]); });
  }

  return { success: true, version: values.Version, approvedAt: now };
}

function _bumpVersion_(v) {
  var n = Number(String(v || '1.0').split('.')[0]) || 1;
  return (n + 1) + '.0';
}

/** Everything generated so far, for the review queue. */
function getQmsRecordQueue() {
  _ensureQmsSheets_();
  return { success: true, records: getSheetAsObjects(QMS_SHEETS.APPROVALS) };
}
