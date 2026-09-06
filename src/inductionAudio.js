// ============================================================
// inductionAudio.js — spoken induction clips, stored in Drive
//
// Both inductions (worker TRN-IND and the visitor safety block) read their
// rules aloud. That needs 160 short clips, and there are only two places to
// put them:
//
//   base64 in a Sheet   — a cell caps at 50 000 characters, so a 7 KB clip
//                         is ~9 500 characters of base64 and fits, but the
//                         whole set is ~1.4 MB of cells that every read of
//                         that tab drags through memory. Fragile and slow.
//   Drive               — a file per clip, served by id. What every other
//                         binary in this codebase already does (QRCodes,
//                         VisitorPhotos, TrainingPhotos, DrillEvidence).
//
// Drive it is, following the same pattern as those four so there is one way
// to store a file here and not five.
//
// A clip is addressed by its LOGICAL name, never by file id:
//
//     TRN-IND/R14/hi        the rule, in Hindi
//     TRN-IND/R14/qhi       the situation that follows it
//     VISITOR/S/en          an SQCDP section, in English
//
// The id is an implementation detail that changes every time a clip is
// replaced — and clips WILL be replaced, because the current voice is
// machine-generated and a recording of a supervisor the workers know is
// strictly better. Callers that hold a name keep working across that swap;
// callers that hold an id would all break at once.
// ============================================================

var INDUCTION_AUDIO_FOLDER = 'InductionAudio';

/** One row per clip, so a replaced file does not orphan the name. */
var AUDIO_HEADERS = {
  InductionAudio: ['Name', 'FileID', 'Lang', 'Bytes', 'Seconds', 'Cues', 'Voice', 'UpdatedAt']
};

function _ensureAudioSheets_() {
  _ensureSheetsWithHeaders_(AUDIO_HEADERS);
}

/**
 * The Drive folder holding every clip, created on first use.
 * Same shape as generateAndStoreQR and _visitorPhotoFolder_.
 */
function _audioFolder_() {
  var folders = DriveApp.getFoldersByName(INDUCTION_AUDIO_FOLDER);
  return folders.hasNext() ? folders.next()
                           : DriveApp.createFolder(INDUCTION_AUDIO_FOLDER);
}

/** A logical clip name flattened for use as a filename. */
function _audioFileName_(name) {
  return String(name).replace(/[^A-Za-z0-9_-]+/g, '_') + '.opus';
}

/**
 * Store one clip. Replaces any file already holding that name so re-running
 * the upload is idempotent, and trashes the old file rather than leaving the
 * folder to grow a copy per run.
 *
 * `cues` is the phrase-start list used to highlight text as the clip plays.
 * It is stored WITH the clip because the two must move together: a cue list
 * measured against a different recording drifts further behind with every
 * phrase, and a highlight that lags the voice is worse than no highlight.
 */
function putInductionClip(name, base64, lang, cues, voice, token) {
  // Admin-gated: this writes a public file to Drive. An unauthenticated
  // caller could otherwise fill the folder, or worse, replace the clip that
  // states a safety rule with anything at all — the audio IS the instruction
  // for a worker who cannot read the text beside it.
  _requireAdmin_(token);
  _ensureAudioSheets_();
  if (!name)   return { success: false, error: 'name required' };
  if (!base64) return { success: false, error: 'audio required' };

  var folder   = _audioFolder_();
  var fileName = _audioFileName_(name);

  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  var blob = Utilities.newBlob(Utilities.base64Decode(base64),
                               'audio/ogg', fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var sheet   = getSheet('InductionAudio');
  var headers = AUDIO_HEADERS.InductionAudio;
  var values  = {
    Name:      name,
    FileID:    file.getId(),
    Lang:      lang || '',
    Bytes:     blob.getBytes().length,
    Seconds:   '',
    Cues:      cues ? JSON.stringify(cues) : '',
    Voice:     voice || 'tts',
    UpdatedAt: new Date().toISOString()
  };

  var row = findRowByValue(sheet, 'Name', name);
  if (row === -1) {
    sheet.appendRow(headers.map(function (h) {
      return values[h] !== undefined ? values[h] : '';
    }));
  } else {
    headers.forEach(function (h) { setCell(sheet, row, h, values[h]); });
  }

  return { success: true, name: name, fileId: file.getId(), bytes: values.Bytes };
}

/**
 * Every clip for one induction, as { name: {url, cues} }.
 *
 * Returned as a manifest in a single call rather than a route per clip: the
 * page needs all of them before it starts, and forty round trips through
 * google.script.run is several seconds a visitor spends looking at a spinner
 * at the gate.
 */
function getInductionAudio(prefix) {
  _ensureAudioSheets_();
  var out = {};
  getSheetAsObjects('InductionAudio').forEach(function (r) {
    var name = String(r.Name || '');
    if (!name) return;
    if (prefix && name.indexOf(prefix) !== 0) return;
    out[name] = {
      url:  'https://drive.google.com/uc?id=' + r.FileID,
      cues: _parseCues_(r.Cues)
    };
  });
  return { success: true, clips: out, count: Object.keys(out).length };
}

/** Malformed cues are dropped, never thrown: silent text beats a dead page. */
function _parseCues_(v) {
  if (!v) return [];
  try {
    var a = JSON.parse(v);
    return Object.prototype.toString.call(a) === '[object Array]' ? a : [];
  } catch (e) { return []; }
}

/**
 * What is present, so a half-finished upload is visible rather than showing
 * up later as one silent rule nobody notices.
 */
function getInductionAudioStatus() {
  _ensureAudioSheets_();
  var byPrefix = {}, bytes = 0;
  getSheetAsObjects('InductionAudio').forEach(function (r) {
    var p = String(r.Name || '').split('/')[0] || '?';
    byPrefix[p] = (byPrefix[p] || 0) + 1;
    bytes += Number(r.Bytes) || 0;
  });
  return { success: true, byPrefix: byPrefix, totalKB: Math.round(bytes / 1024) };
}
