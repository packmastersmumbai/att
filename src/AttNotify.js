// ============================================================
// AttNotify.js — push QrAtt next-action tasks into TaskFlow DWM.
// Telegram/WhatsApp alerts already live in notifications.js; this adds ONLY
// the DWM task bridge, mirroring QMS QmsNotify / MMT MmtNotify.
// Config (Script Properties): taskflow_hmac_secret (shared w/ DWM), dwm_create_url.
// ============================================================

function _attSourceUrl(visitorId) {
  // Uses the shared public base (Config PublicUrl) — was a stale hardcoded
  // '/qratt' URL that 404'd; the real Pages path is '/att'.
  return publicPassUrl(visitorId);
}

// Sign params to match DWM _canonicalCreateString byte-for-byte.
function _attDwmSign_(params) {
  var secret = PropertiesService.getScriptProperties().getProperty('taskflow_hmac_secret');
  if (!secret) throw new Error('taskflow_hmac_secret not set in QrAtt');
  var keys = [];
  for (var k in params) {
    if (!params.hasOwnProperty(k)) continue;
    if (k === 'sig' || k === 'fmt' || k === 'act') continue;
    keys.push(k);
  }
  keys.sort();
  var canonical = keys.map(function (k) {
    return k + '=' + String(params[k] == null ? '' : params[k]);
  }).join('&');
  var sigBytes = Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(sigBytes).replace(/=/g, '');
}

// Internal: POST a signed create to DWM. Best-effort.
function _attPushDwm_(params) {
  var base = PropertiesService.getScriptProperties().getProperty('dwm_create_url');
  if (!base) { Logger.log('dwm_create_url not set — skip'); return; }
  params.sig = _attDwmSign_(params);
  var qs = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = base + (base.indexOf('?') === -1 ? '?' : '&') + 'act=create&' + qs;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  Logger.log('ATT DWM push → ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
}

// Visitor arrival → DWM task for the host to attend. Best-effort; never throws.
function pushAttVisitorTask(visitor, hostName) {
  try {
    if (!visitor) return;
    var vid = visitor.VisitorID || visitor.visitorId || '';
    var name = visitor.Name || visitor.name || 'Visitor';
    _attPushDwm_({
      title:    'Attend visitor — ' + name + (visitor.company || visitor.Company ? ' (' + (visitor.company || visitor.Company) + ')' : ''),
      assignee: hostName || '',
      creator:  '',
      priority: 'high',
      status:   'todo',
      ref:      'ATT/' + vid,
      shared:   '1',
      desc:     'QrAtt visitor ' + vid + ' — ' + _attSourceUrl(vid),
      ts:       String(Math.floor(Date.now() / 1000))
    });
  } catch (e) { Logger.log('pushAttVisitorTask skipped: ' + e.message); }
}

// Blacklisted person at gate → urgent security task.
function pushAttBlacklistTask(qrCode, personName, gate) {
  try {
    _attPushDwm_({
      title:    '⚠️ Verify blacklisted person — ' + (personName || qrCode) + ' at ' + (gate || 'gate'),
      assignee: '',
      creator:  '',
      priority: 'urgent',
      status:   'todo',
      ref:      'ATT/BL/' + qrCode + '/' + Math.floor(Date.now() / 60000),  // per-minute dedupe
      shared:   '1',
      desc:     'QrAtt blacklist alert — QR ' + qrCode + ' at ' + (gate || ''),
      ts:       String(Math.floor(Date.now() / 1000))
    });
  } catch (e) { Logger.log('pushAttBlacklistTask skipped: ' + e.message); }
}

// One-time config setter (run via editor).
function setAttDwmConfig(secret, dwmCreateUrl) {
  PropertiesService.getScriptProperties().setProperties({
    taskflow_hmac_secret: String(secret || '').trim(),
    dwm_create_url:       String(dwmCreateUrl || '').trim()
  });
  return { ok: true };
}
