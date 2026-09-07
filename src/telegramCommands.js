// ============================================================
// telegramCommands.js — QrAtt-specific Telegram command map
// ------------------------------------------------------------
// Transport (send/reply/poll/enable) lives in the shared TelegramLib.js.
// This file only declares WHICH commands this project answers and reuses the
// existing query builders (_tgPresent_, _tgToday_, …) defined in telegramBot.js.
// ============================================================

var TELEGRAM_COMMANDS = {
  '/today':    function () { return _tgToday_(); },
  '/summary':  function () { return _tgToday_(); },
  '/present':  function () { return _tgPresent_(); },
  '/absent':   function () { return _tgAbsent_(); },
  '/late':     function () { return _tgLate_(); },
  '/visitors': function () { return _tgVisitors_(); },
  // The register existed but could only be read by opening Reports on a
  // laptop — the one question a gatepass exists to answer ("what is still
  // out?") was the one the bot could not answer.
  '/outstanding': function () { return _tgOutstanding_(); },
  '/items':       function () { return _tgOutstanding_(); },
  '/find':     function (arg) { return _tgFind_(arg); },
  '/start':    function () { return _tgHelp_(); },
  '/help':     function () { return _tgHelp_(); }
};

/**
 * Inline-button actions. Keys match the part of callback_data before the ':';
 * the remainder is passed as arg. Each returns {toast, reply?}.
 *
 * Note the 5-minute poll interval: a press is acted on at the next poll, not
 * instantly. Button labels should not promise immediacy.
 */
var TELEGRAM_CALLBACKS = {
  // gpret:<visitorId> — mark every outstanding item for that visitor returned.
  'gpret': function (visitorId) {
    if (!visitorId) return { toast: 'Missing visitor' };
    var res = settleVisitorGatepass(visitorId, 'RETURNED', 'Marked returned from Telegram');
    if (!res || !res.success) return { toast: 'Could not update' };
    if (!res.settled) return { toast: 'Nothing was outstanding' };
    return {
      toast: res.settled + ' item(s) marked returned',
      reply: '✅ <b>' + _tgEsc_(String(res.settled)) + ' item(s) marked returned</b> for ' +
             _tgEsc_(_tgVisitorName_(visitorId)) + ' — via Telegram.'
    };
  },

  // gpack:<what> — acknowledge an alert so the channel shows someone saw it.
  'gpack': function (what, cq) {
    var who = (cq && cq.from && (cq.from.first_name || cq.from.username)) || 'someone';
    return {
      toast: 'Acknowledged',
      reply: '👁 <b>Acknowledged</b> by ' + _tgEsc_(who) + (what ? ' — ' + _tgEsc_(what) : '')
    };
  }
};

/** Visitor display name for callback confirmations; falls back to the id. */
function _tgVisitorName_(visitorId) {
  try {
    var sheet = getSheet(SHEETS.VISITORS);
    var row = findRowByValue(sheet, 'VisitorID', visitorId);
    return row === -1 ? visitorId : (getCell(sheet, row, 'Name') || visitorId);
  } catch (e) { return visitorId; }
}

/** Everything still owed back, oldest first — the read side of the register. */
function _tgOutstanding_() {
  var res;
  try { res = getOutstandingGatepass(); }
  catch (e) { return '⚠️ Could not read the gatepass register.'; }
  if (!res || !res.success) return '⚠️ Could not read the gatepass register.';
  if (!res.items.length) return '✅ <b>Nothing outstanding</b> — every returnable item is back.';

  var lines = ['📦 <b>Outstanding items (' + res.items.length + ')</b>', ''];
  res.items.forEach(function (i) {
    var age = i.daysOut === '' ? '' : (i.daysOut === 0 ? ' · today' : ' · ' + i.daysOut + 'd');
    lines.push('• <b>' + _tgEsc_(i.itemDesc) + '</b> ×' + i.qty +
               ' — ' + _tgEsc_(i.visitorName) +
               (i.hostName ? ' (host ' + _tgEsc_(i.hostName) + ')' : '') + age);
  });
  return lines.join('\n');
}

// Admin buttons call these thin wrappers (keeps the UI decoupled from the lib).
function setTelegramWebhook(authToken) { _requireAdmin_(authToken); return TelegramLib.enable(); }   // "Enable Bot Commands"
function deleteTelegramWebhook() { return TelegramLib.disable(); }
