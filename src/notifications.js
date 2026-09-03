// ============================================================
// notifications.gs — WhatsApp (CallMeBot) + Telegram + Gmail alerts
// ============================================================

/**
 * Send a message to a Telegram channel/chat via the Bot API.
 * One-time setup:
 *   1. Create a bot with @BotFather → get the token.
 *   2. Add the bot as an admin of your channel.
 *   3. Save token in Config 'TelegramBotToken' and the channel id in 'TelegramChatID'
 *      (e.g. '@mychannel' for a public channel, or the numeric '-100…' id).
 * Best-effort: logs and returns false if not configured or on failure.
 */
/** Escapes text for Telegram HTML parse_mode. */
function _tgEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _sendTelegram(message) {
  var token  = getConfigValue('TelegramBotToken');
  var chatId = getConfigValue('TelegramChatID');
  if (!token || !chatId) {
    Logger.log('Telegram not configured — skipping notification');
    return false;
  }
  token  = String(token).trim();
  chatId = String(chatId).trim();
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';

  // Sends one chunk (chat_id/parse_mode fixed here), retrying as plain text if
  // HTML parsing fails so the message still delivers.
  function sendOne(text) {
    function post(t, html) {
      var payload = { chat_id: chatId, text: t, disable_web_page_preview: true };
      if (html) payload.parse_mode = 'HTML';
      return UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
    }
    try {
      var resp = post(text, true);
      if (resp.getResponseCode() === 200) return true;
      var errTxt = resp.getContentText();
      if (/can't parse entities/i.test(errTxt)) {
        var retry = post(String(text).replace(/<[^>]+>/g, ''), false);
        if (retry.getResponseCode() === 200) return true;
        Logger.log('Telegram plain retry failed: ' + retry.getContentText());
        return false;
      }
      Logger.log('Telegram send failed (' + resp.getResponseCode() + '): ' + errTxt);
      return false;
    } catch (e) {
      Logger.log('Telegram send failed: ' + e.message);
      return false;
    }
  }

  // Telegram rejects any message over 4096 chars. Split on blank-line section
  // boundaries (never inside a <pre>) so the full present/absent list is
  // delivered across several messages instead of being truncated.
  var allOk = true;
  _splitTelegramMessage_(message).forEach(function(chunk) {
    if (!sendOne(chunk)) allOk = false;
  });
  return allOk;
}

/**
 * Splits an HTML message into <=LIMIT-char chunks on blank-line boundaries.
 * A single section longer than LIMIT (e.g. a huge <pre>) is passed through
 * whole rather than split mid-tag — Telegram will reject it, which is louder
 * and safer than silently corrupting markup.
 */
function _splitTelegramMessage_(message) {
  var LIMIT = 4000; // under 4096 to leave headroom
  if (message.length <= LIMIT) return [message];

  var sections = message.split('\n\n');
  var chunks = [];
  var cur = '';
  sections.forEach(function(sec) {
    var candidate = cur ? cur + '\n\n' + sec : sec;
    if (candidate.length <= LIMIT) {
      cur = candidate;
    } else {
      if (cur) chunks.push(cur);
      cur = sec;
    }
  });
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * Sends a photo (by URL) with an HTML caption to the configured channel.
 * Used to post a visitor pass QR into Telegram. Falls back to a text message
 * (with the image URL) if sendPhoto fails, so the pass still gets delivered.
 */
function _sendTelegramPhoto(photoUrl, caption) {
  var token  = getConfigValue('TelegramBotToken');
  var chatId = getConfigValue('TelegramChatID');
  if (!token || !chatId) { Logger.log('Telegram not configured — skipping photo'); return false; }
  token  = String(token).trim();
  chatId = String(chatId).trim();

  function fetch(method, payload) {
    return UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  }
  try {
    var resp = fetch('sendPhoto', { chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: 'HTML' });
    if (resp.getResponseCode() === 200) return true;

    var errTxt = resp.getContentText();
    if (/can't parse entities/i.test(errTxt)) {
      var plain = fetch('sendPhoto', { chat_id: chatId, photo: photoUrl, caption: String(caption).replace(/<[^>]+>/g, '') });
      if (plain.getResponseCode() === 200) return true;
    }
    Logger.log('Telegram sendPhoto failed (' + resp.getResponseCode() + '): ' + errTxt);
    // Last resort: deliver as text with the image link so nothing is lost.
    return _sendTelegram(caption + '\n' + photoUrl);
  } catch (e) {
    Logger.log('Telegram sendPhoto error: ' + e.message);
    return _sendTelegram(caption + '\n' + photoUrl);
  }
}

/**
 * Sends a photo BLOB (raw bytes) with an HTML caption via multipart sendPhoto.
 * Used for the captured visitor photo — Telegram often can't fetch Drive image
 * URLs, so we upload the bytes directly. Returns true on HTTP 200.
 */
function _sendTelegramPhotoBlob(blob, caption) {
  var token  = getConfigValue('TelegramBotToken');
  var chatId = getConfigValue('TelegramChatID');
  if (!token || !chatId) return false;
  token = String(token).trim(); chatId = String(chatId).trim();
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
      method: 'post',
      payload: { chat_id: chatId, caption: caption || '', parse_mode: 'HTML', photo: blob },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) return true;
    if (/can't parse entities/i.test(resp.getContentText())) {
      var retry = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
        method: 'post',
        payload: { chat_id: chatId, caption: String(caption || '').replace(/<[^>]+>/g, ''), photo: blob },
        muteHttpExceptions: true
      });
      return retry.getResponseCode() === 200;
    }
    Logger.log('Telegram sendPhoto(blob) failed: ' + resp.getContentText());
    return false;
  } catch (e) {
    Logger.log('Telegram sendPhoto(blob) error: ' + e.message);
    return false;
  }
}

/** Decodes a "data:image/...;base64,XXXX" URL into a GAS Blob, or null. */
function _dataUrlToBlob_(dataUrl, name) {
  try {
    if (!dataUrl || String(dataUrl).indexOf('base64,') === -1) return null;
    var m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    var bytes = Utilities.base64Decode(m[2]);
    return Utilities.newBlob(bytes, m[1], (name || 'photo') + '.' + (m[1].split('/')[1] || 'jpg'));
  } catch (e) {
    Logger.log('_dataUrlToBlob_ error: ' + e.message);
    return null;
  }
}

/**
 * Posts a visitor pass to the Telegram channel on registration: the QR image
 * plus visitor details and a tap-to-check-in link (the vpass page). Whoever is
 * in the channel can scan the QR at the kiosk or tap the link to admit them.
 * If a captured photo (base64 data URL) is supplied, the photo is posted first
 * (bytes uploaded directly), then the QR as a second image.
 */
function sendVisitorPassToChannel(visitorId, photoDataUrl) {
  if (!visitorId) return false;
  var pass = getVisitorPass(visitorId);
  if (!pass || !pass.success) { Logger.log('sendVisitorPassToChannel: pass not found ' + visitorId); return false; }

  // Resolve host name from HostEmpID, if any.
  var sheet   = getSheet(SHEETS.VISITORS);
  var vRow    = findRowByValue(sheet, 'VisitorID', visitorId);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var vals    = vRow === -1 ? [] : sheet.getRange(vRow, 1, 1, headers.length).getValues()[0];
  var rec = {}; headers.forEach(function(h, i) { rec[h] = vals[i]; });

  var hostName = '';
  if (rec.HostEmpID) {
    var empSheet = getSheet(SHEETS.EMPLOYEES);
    var hr = findRowByValue(empSheet, 'EmpID', rec.HostEmpID);
    if (hr !== -1) hostName = getCell(empSheet, hr, 'Name') || '';
  }

  // Pretty public URL (GitHub Pages), not the raw script.google.com/exec link.
  var checkInUrl = publicPassUrl(visitorId);
  var type = rec.VisitorType || 'Guest';
  var icon = type === 'Courier' ? '📦' : type === 'Supplier' ? '🚚' : type === 'Contractor' ? '🔧' : '🧑';

  // Badge-style card: header, prominent name, divider, aligned detail rows, ID, link.
  var line = '━━━━━━━━━━━━━━━';
  var rows = '';
  if (hostName)     rows += '👤 <b>To meet</b>   ' + _tgEsc_(hostName) + '\n';
  if (pass.purpose) rows += '📝 <b>Purpose</b>   ' + _tgEsc_(pass.purpose) + '\n';
  if (rec.Phone)    rows += '📞 <b>Phone</b>     ' + _tgEsc_(rec.Phone) + '\n';
  if (rec.Vehicle)  rows += '🚗 <b>Vehicle</b>   ' + _tgEsc_(rec.Vehicle) + '\n';
  if (rec.IDType)   rows += '🪪 <b>ID</b>        ' + _tgEsc_(rec.IDType) + (rec.IDNumber ? ' · ' + _tgEsc_(rec.IDNumber) : '') + '\n';

  var caption =
    icon + ' <b>VISITOR PASS</b> · ' + _tgEsc_(type) + '\n' +
    line + '\n' +
    '<b>' + _tgEsc_(pass.name) + '</b>' + (rec.Company ? '\n<i>' + _tgEsc_(rec.Company) + '</i>' : '') + '\n' +
    (rows ? line + '\n' + rows : '') +
    line + '\n' +
    '🆔 <code>' + _tgEsc_(visitorId) + '</code>\n' +
    // The pass no longer toggles presence — the gate scanner does. Label the
    // link for what it now is, or the message promises a button that is gone.
    '▶️ <a href="' + checkInUrl + '">Open pass</a>';

  // Single image only (Telegram renders photos large — avoid posting two).
  // With a captured photo: send the photo + badge caption. The QR stays on the
  // confirmation screen and behind the check-in link. Without a photo: fall back
  // to the QR image (so the channel still has something scannable).
  var photoBlob = _dataUrlToBlob_(photoDataUrl, visitorId);
  if (photoBlob && _sendTelegramPhotoBlob(photoBlob, caption)) return true;
  return _sendTelegramPhoto(pass.qrUrl, caption);
}

/**
 * Sends a test message to the configured Telegram channel and returns detail.
 * Called from the admin Config "Send Test" button.
 */
function sendTestTelegram(authToken) {
  _requireAdmin_(authToken);
  var token  = getConfigValue('TelegramBotToken');
  var chatId = getConfigValue('TelegramChatID');
  if (!token || !chatId) return { success: false, error: 'Telegram not configured — set Bot Token and Channel ID first.' };
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, parse_mode: 'HTML',
        text: '✅ <b>Test message</b>\nYour QR Attendance app is connected to this channel.' }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) return { success: true };
    return { success: false, error: 'Telegram API ' + resp.getResponseCode() + ': ' + resp.getContentText() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Runs the daily digest immediately (on-demand). Returns whether it was sent.
 */
function sendDigestNow(authToken) {
  _requireAdmin_(authToken);
  var token  = getConfigValue('TelegramBotToken');
  var chatId = getConfigValue('TelegramChatID');
  if (!token || !chatId) return { success: false, error: 'Telegram not configured — set Bot Token and Channel ID first.' };
  try {
    sendDailySummary();  // posts the digest (and email if configured)
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Send WhatsApp message via CallMeBot API.
 * One-time setup: owner visits
 * https://wa.me/18053986627?text=I%20allow%20callmebot%20to%20send%20me%20messages
 * then saves the returned API key in Config tab under 'CallMeBotKey'.
 */
function _sendWhatsApp(phone, message) {
  var apiKey = getConfigValue('CallMeBotKey');
  if (!apiKey || apiKey === '(set after WhatsApp link)') {
    Logger.log('WhatsApp not configured — skipping notification');
    return false;
  }
  var url = 'https://api.callmebot.com/whatsapp.php' +
    '?phone='  + encodeURIComponent(phone) +
    '&text='   + encodeURIComponent(message) +
    '&apikey=' + encodeURIComponent(apiKey);
  try {
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return true;
  } catch (e) {
    Logger.log('WhatsApp send failed: ' + e.message);
    return false;
  }
}

/**
 * Builds the daily attendance digest text (Telegram HTML). Pure — no side effects.
 * De-dupes employees by PersonID, marks late using the LateAfter config threshold,
 * and lists present (with IN time) + absentees.
 */
function _buildTelegramDigest_(todayStr, orgName, empLogs, visLogs, presentCount, absent, activeTotal) {
  // Late threshold (HH:MM 24h) from Config, default 09:30
  var lateStr = getConfigValue('LateAfter') || '09:30';
  var lm = String(lateStr).match(/^(\d{1,2}):(\d{2})$/);
  var lateThreshMin = lm ? (parseInt(lm[1], 10) * 60 + parseInt(lm[2], 10)) : 570;

  function toMin(t) {
    if (!t) return null;
    var m12 = String(t).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
      var h = parseInt(m12[1], 10), mn = parseInt(m12[2], 10), ap = m12[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      return h * 60 + mn;
    }
    var m24 = String(t).match(/^(\d{1,2}):(\d{2})$/);
    return m24 ? parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10) : null;
  }

  // Gender lookup from Employees (Logs has no Gender column).
  var genderMap = {};
  getSheetAsObjects(SHEETS.EMPLOYEES).forEach(function(e) { genderMap[String(e.EmpID)] = e.Gender || ''; });
  function gSym(g) {
    g = String(g || '').toLowerCase();
    return g === 'male' ? '♂' : g === 'female' ? '♀' : g === 'other' ? '⚧' : '';
  }

  // One row per employee (first IN of the day); flag late
  var seen = {}, presentList = [], lateCount = 0;
  var presG = { male: 0, female: 0, other: 0, unspecified: 0 };
  empLogs.forEach(function(r) {
    var id = String(r.PersonID);
    if (seen[id] || !r.TimeIN) return;
    seen[id] = true;
    var tMin = toMin(r.TimeIN);
    var isLate = tMin !== null && tMin > lateThreshMin;
    if (isLate) lateCount++;
    var g = genderMap[id] || '';
    var gk = String(g).toLowerCase();
    presG[gk === 'male' || gk === 'female' || gk === 'other' ? gk : 'unspecified']++;
    presentList.push({ name: r.Name, dept: r.Department, timeIn: r.TimeIN, late: isLate, gender: g });
  });
  presentList.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

  // Absent gender split
  var absG = { male: 0, female: 0, other: 0, unspecified: 0 };
  absent.forEach(function(e) {
    var gk = String(e.Gender || '').toLowerCase();
    absG[gk === 'male' || gk === 'female' || gk === 'other' ? gk : 'unspecified']++;
  });

  function gStr(c) {
    var parts = [];
    if (c.male) parts.push('♂' + c.male);
    if (c.female) parts.push('♀' + c.female);
    if (c.other) parts.push('⚧' + c.other);
    if (c.unspecified) parts.push('•' + c.unspecified);
    return parts.length ? '  (' + parts.join(' ') + ')' : '';
  }

  var pct = activeTotal > 0 ? Math.round((presentCount / activeTotal) * 100) : 0;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Present rows are paged into <pre> blocks of this many so a long roster still
  // renders as a table and _sendTelegram can split between blocks. The full
  // list is always shown — nothing is dropped.
  var ROWS_PER_BLOCK = 25;

  var lines = [];
  lines.push('📊 <b>' + esc(orgName) + ' — Daily Attendance</b>');
  lines.push('🗓 ' + todayStr);
  lines.push('');
  lines.push('✅ Present: <b>' + presentCount + '</b> / ' + activeTotal + '  (' + pct + '%)' + gStr(presG));
  lines.push('⏰ Late: <b>' + lateCount + '</b>    ❌ Absent: <b>' + absent.length + '</b>' + gStr(absG));
  lines.push('👥 Visitors: <b>' + visLogs.length + '</b>');

  // Fixed-width helpers for the monospace <pre> table (truncate so rows never wrap)
  var NAMEW = 14;
  function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + Array(n - s.length + 1).join(' '); }

  if (presentList.length) {
    var INW = 9;
    var header = pad('Name', NAMEW) + pad('IN', INW) + '⏰ ⚥\n' +
                 Array(NAMEW + INW + 2).join('-') + '\n';
    for (var start = 0; start < presentList.length; start += ROWS_PER_BLOCK) {
      var block = presentList.slice(start, start + ROWS_PER_BLOCK);
      var t = header;
      block.forEach(function(p) {
        // esc AFTER padding so alignment uses real char widths, not entity lengths
        t += esc(pad(p.name, NAMEW) + pad(p.timeIn, INW) + (p.late ? '⏰' : '  ')) + ' ' + gSym(p.gender) + '\n';
      });
      lines.push('');
      lines.push(start === 0
        ? '<b>Present (' + presentList.length + ')</b>'
        : '<b>Present (cont.)</b>');
      lines.push('<pre>' + t + '</pre>');
    }

    // Explicit late-arrivals callout so tardiness is impossible to miss.
    var lateNames = presentList.filter(function(p) { return p.late; }).map(function(p) { return p.name + ' (' + p.timeIn + ')'; });
    if (lateNames.length) {
      lines.push('');
      lines.push('🚨 <b>Late arrivals (' + lateNames.length + '):</b> ' + esc(lateNames.join(', ')));
    }
  }

  if (absent.length) {
    var names = absent.map(function(e) { return esc(e.Name); }).join(', ');
    lines.push('');
    lines.push('❌ <b>Absent (' + absent.length + '):</b> ' + names);
  }

  return lines.join('\n');
}

/**
 * Posts a single check-in / check-out to the Telegram channel.
 * Gated by Config 'TelegramLiveScans' (must be 'on'/'true'/'yes') so the
 * channel isn't flooded unless explicitly enabled.
 *
 * @param {string} kind      'IN' or 'OUT'
 * @param {Object} person    { name, department, type }  (from _lookupPerson)
 * @param {string} gate
 * @param {string} timeStr   formatted arrival/departure time (e.g. "09:48 AM")
 * @param {string} [duration] worked duration for OUT (e.g. "8h 24m")
 */
function sendScanAlert(kind, person, gate, timeStr, duration) {
  var flag = String(getConfigValue('TelegramLiveScans') || '').toLowerCase();
  if (flag !== 'on' && flag !== 'true' && flag !== 'yes' && flag !== '1') return;
  if (!person) return;

  var isVisitor = person.type === 'VIS';
  var name = _tgEsc_(person.name || (isVisitor ? 'Visitor' : 'Person'));
  var dept = person.department ? _tgEsc_(person.department) : '';

  // Single-line format: emoji IN/OUT · name · [dept ·] time [· extras]
  var tail = (dept ? dept + ' · ' : '') + _tgEsc_(timeStr);
  var msg;
  if (kind === 'IN') {
    var late = !isVisitor && _isLateTime_(timeStr);  // "late" applies to employees only
    // IN always green; late adds a striking siren so tardiness jumps out.
    msg = '🟢 <b>IN</b>' + (late ? ' 🚨 <b>LATE</b>' : '') + ' · ' + name + ' · ' + tail;
  } else {
    msg = '🔴 <b>OUT</b> · ' + name + ' · ' + tail + (duration ? ' · ⏱ ' + _tgEsc_(duration) : '');
  }
  if (isVisitor) msg += ' <i>(visitor)</i>';

  _sendTelegram(msg);
}

/** True if a formatted time (e.g. "09:48 AM") is past the LateAfter config threshold. */
function _isLateTime_(timeStr) {
  var lateStr = getConfigValue('LateAfter') || '09:30';
  var lm = String(lateStr).match(/^(\d{1,2}):(\d{2})$/);
  var threshMin = lm ? (parseInt(lm[1], 10) * 60 + parseInt(lm[2], 10)) : 570;
  var m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return false;
  var h = parseInt(m[1], 10), mn = parseInt(m[2], 10), ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return (h * 60 + mn) > threshMin;
}

/**
 * Notify the host employee that their visitor has arrived.
 */
function sendVisitorAlert(visitor) {
  if (!visitor) return;
  var arrivedAt = formatTime(new Date());

  // NOTE: the Telegram channel already got the visitor pass at registration
  // (sendVisitorPassToChannel), and the one-line IN post is handled by
  // sendScanAlert('IN') under the Live Scans toggle — so we do NOT post the
  // channel arrival here (that caused a duplicate message).

  // Notify the host employee via WhatsApp (only if a valid host with a phone exists)
  if (!visitor.hostId) return;
  var empSheet = getSheet(SHEETS.EMPLOYEES);
  var hostRow  = findRowByValue(empSheet, 'EmpID', visitor.hostId);
  if (hostRow === -1) return;

  var hostPhone = getCell(empSheet, hostRow, 'Phone');
  var hostName  = getCell(empSheet, hostRow, 'Name');
  if (!hostPhone) return;

  var msg = 'Hi ' + hostName + ', your visitor *' + visitor.name +
    '* from ' + (visitor.department || 'N/A') +
    ' has arrived. Time: ' + arrivedAt;

  _sendWhatsApp(hostPhone, msg);

  // DWM task: host attends the visitor (best-effort).
  try { if (typeof pushAttVisitorTask === 'function') pushAttVisitorTask(visitor, hostName); } catch (e) {}
}

/**
 * Alert owner when a blacklisted QR is scanned.
 */
function sendBlacklistAlert(qrCode, personName, gate) {
  var ownerPhone = getConfigValue('OwnerPhone');
  if (!ownerPhone || ownerPhone === '(set after setup)') return;

  var msg = '⚠️ ALERT: Blacklisted person *' + personName +
    '* (QR: ' + qrCode + ') attempted entry at *' + gate +
    '* — ' + formatTime(new Date());

  _sendWhatsApp(ownerPhone, msg);

  // DWM task: urgent security verification (best-effort).
  try { if (typeof pushAttBlacklistTask === 'function') pushAttBlacklistTask(qrCode, personName, gate); } catch (e) {}
}

/**
 * Daily attendance summary sent to owner via Gmail.
 * Called by time-based trigger at configured hour.
 */
function sendDailySummary() {
  var todayStr = today();
  var logs     = getSheetAsObjects(SHEETS.LOGS);
  var todayLogs = logs.filter(function(r) { return r.Date === todayStr; });

  var empLogs = todayLogs.filter(function(r) { return r.Type === 'EMP'; });
  var visLogs = todayLogs.filter(function(r) { return r.Type === 'VIS'; });
  var present = empLogs.filter(function(r) { return r.TimeIN !== ''; }).length;

  var allEmps = getSheetAsObjects(SHEETS.EMPLOYEES).filter(function(e) { return e.Status === 'ACTIVE'; });
  var presentIds = empLogs.map(function(r) { return String(r.PersonID); });
  var absent = allEmps.filter(function(e) { return presentIds.indexOf(String(e.EmpID)) === -1; });

  var orgName = getConfigValue('OrgName') || 'Organisation';

  // Post a full digest to the Telegram channel (independent of email config)
  _sendTelegram(_buildTelegramDigest_(todayStr, orgName, empLogs, visLogs, present, absent, allEmps.length));

  var ownerEmail = getConfigValue('OwnerEmail');
  if (!ownerEmail || ownerEmail === '(set after setup)') return;

  var rows = empLogs.map(function(r) {
    return '<tr><td>' + r.Name + '</td><td>' + r.Department + '</td><td>' + r.TimeIN + '</td>' +
      '<td>' + (r.TimeOUT || 'Still IN') + '</td><td>' + (r.Duration || '–') + '</td></tr>';
  }).join('');

  var absentRows = absent.map(function(e) {
    return '<tr style="color:#c00"><td>' + e.Name + '</td><td>' + e.Department +
      '</td><td colspan="3">ABSENT</td></tr>';
  }).join('');

  var html = '<h2>' + orgName + ' — Daily Attendance Report</h2>' +
    '<p><b>Date:</b> ' + todayStr + '</p>' +
    '<p><b>Present:</b> ' + present + ' | <b>Absent:</b> ' + absent.length +
    ' | <b>Visitors:</b> ' + visLogs.length + '</p>' +
    '<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">' +
    '<tr style="background:#f0f0f0"><th>Name</th><th>Dept</th><th>Time IN</th><th>Time OUT</th><th>Duration</th></tr>' +
    rows + absentRows + '</table>';

  GmailApp.sendEmail(ownerEmail, orgName + ' Attendance — ' + todayStr, '', { htmlBody: html });
}
