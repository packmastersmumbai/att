// ============================================================
// TelegramLib.js — Reusable two-way Telegram module for GAS projects
// ------------------------------------------------------------
// Drop this ONE file into any Apps Script project (QrAtt, QMS, DWM, MMT, 5S).
// It provides generic transport (send / reply / poll) and a command router.
// Nothing here is project-specific.
//
// Each project supplies:
//   1. Config keys  TelegramBotToken / TelegramChatID  in its Config sheet.
//   2. A command map  TELEGRAM_COMMANDS  (see registerTelegramCommands below).
//
// WHY POLLING, NOT WEBHOOKS: Google Apps Script doPost always returns a 302
// redirect, which Telegram rejects ("Wrong response from the webhook: 302").
// Webhooks are impossible on GAS — we poll getUpdates on a 1-minute trigger.
// ============================================================

var TelegramLib = (function () {
  'use strict';

  var API = 'https://api.telegram.org/bot';

  // ── Config access ─────────────────────────────────────────
  // Reads from the host project's Config sheet via its getConfigValue(),
  // which most projects have. Falls back to ScriptProperties, trying both the
  // camelCase key and the SNAKE_CASE variant some projects already use
  // (e.g. 5S stores TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). So the same file
  // works everywhere with no per-project config shim.
  var PROP_ALIASES = {
    TelegramBotToken: ['TelegramBotToken', 'TELEGRAM_BOT_TOKEN'],
    TelegramChatID:   ['TelegramChatID', 'TELEGRAM_CHAT_ID']
  };
  function cfg(key) {
    try {
      if (typeof getConfigValue === 'function') {
        var v = getConfigValue(key);
        if (v != null && v !== '') return String(v).trim();
      }
    } catch (e) { /* fall through to properties */ }
    var props = PropertiesService.getScriptProperties();
    var aliases = PROP_ALIASES[key] || [key];
    for (var i = 0; i < aliases.length; i++) {
      var p = props.getProperty(aliases[i]);
      if (p != null && p !== '') return String(p).trim();
    }
    return '';
  }

  function token()  { return cfg('TelegramBotToken'); }
  function chatId() { return cfg('TelegramChatID'); }

  // ── Escaping (HTML parse_mode) ────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Low-level POST with HTML→plain-text fallback ──────────
  // Telegram returns 400 "can't parse entities" on malformed HTML; retry the
  // same text with tags stripped and no parse_mode so the message still lands.
  function postMessage(tok, to, text) {
    var url = API + tok + '/sendMessage';
    function post(payload) {
      return UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
    }
    var resp = post({ chat_id: to, text: text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (resp.getResponseCode() === 200) return true;
    if (/can't parse entities/i.test(resp.getContentText())) {
      var plain = post({ chat_id: to, text: String(text).replace(/<[^>]+>/g, ''), disable_web_page_preview: true });
      return plain.getResponseCode() === 200;
    }
    Logger.log('TelegramLib send failed: ' + resp.getContentText());
    return false;
  }

  // ── Public: broadcast to the configured channel/chat ──────
  function send(text) {
    var tok = token(), to = chatId();
    if (!tok || !to) { Logger.log('TelegramLib: not configured (token/chatId)'); return false; }
    return postMessage(tok, to, text);
  }

  // ── Public: reply to a specific chat (command sender) ─────
  function reply(to, text) {
    var tok = token();
    if (!tok || !to) return false;
    return postMessage(tok, to, text);
  }

  // ── Command routing ───────────────────────────────────────
  // Looks up the host project's TELEGRAM_COMMANDS map. Each entry:
  //   '/present': function(arg, chatId) { return 'reply text'; }
  // A '/help' entry (or _default) is optional.
  function commands() {
    try { if (typeof TELEGRAM_COMMANDS === 'object' && TELEGRAM_COMMANDS) return TELEGRAM_COMMANDS; }
    catch (e) { /* not defined */ }
    return {};
  }

  /**
   * Only the configured chat may issue commands. Bot usernames are publicly
   * discoverable, so without this check anyone could DM the bot and run
   * /present, /find <name> or /visitors and read live staff and visitor data.
   *
   * TelegramChatID may be configured either as a numeric id (-100…) or as an
   * @username, so match the incoming chat on whichever form is configured.
   */
  function isAuthorizedChat(chat) {
    var allowed = String(chatId() || '').trim();
    if (!allowed || !chat) return false; // not configured → answer nobody

    if (allowed.charAt(0) === '@') {
      return ('@' + String(chat.username || '')).toLowerCase() === allowed.toLowerCase();
    }
    return String(chat.id) === allowed;
  }

  function route(chat, text) {
    if (!isAuthorizedChat(chat)) {
      Logger.log('TelegramLib: ignoring command from unauthorized chat ' + (chat && chat.id));
      return;
    }
    var to = chat.id;

    var parts = String(text).trim().split(/\s+/);
    var cmd = (parts[0] || '').toLowerCase().replace(/@[\w]+$/, ''); // strip @botname
    var arg = parts.slice(1).join(' ').trim();
    var map = commands();

    var handler = map[cmd];
    if (typeof handler === 'function') return reply(to, handler(arg, to));
    if (cmd.charAt(0) === '/') {
      var help = map['/help'] || map._default;
      return reply(to, typeof help === 'function' ? help(arg, to) : 'Unknown command.');
    }
    // ignore non-command chatter
  }

  // ── Polling ───────────────────────────────────────────────
  // Runs on a 1-minute trigger. Tracks last update_id in ScriptProperties so
  // each update is handled once; LockService guards against overlapping runs.
  function poll() {
    var tok = token();
    if (!tok) return;

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return;
    try {
      var props  = PropertiesService.getScriptProperties();
      var offset = parseInt(props.getProperty('TG_OFFSET') || '0', 10) || 0;
      var url = API + tok + '/getUpdates?timeout=0' + (offset ? '&offset=' + offset : '');
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) { Logger.log('TelegramLib poll: ' + resp.getContentText()); return; }

      var data = JSON.parse(resp.getContentText());
      if (!data.ok || !data.result || !data.result.length) return;

      var maxId = offset;
      data.result.forEach(function (u) {
        if (u.update_id >= maxId) maxId = u.update_id + 1;
        var msg = u.message || u.edited_message; // bots don't get channel posts
        if (msg && msg.text && msg.chat && msg.chat.id) route(msg.chat, msg.text);
      });
      props.setProperty('TG_OFFSET', String(maxId));
    } catch (err) {
      Logger.log('TelegramLib poll error: ' + err.message);
    } finally {
      lock.releaseLock();
    }
  }

  // ── Enable / disable the polling trigger ──────────────────
  function enable() {
    var tok = token();
    if (!tok) return { success: false, error: 'Set TelegramBotToken in Config first' };
    // Webhooks must be off for getUpdates to work.
    UrlFetchApp.fetch(API + tok + '/deleteWebhook', { muteHttpExceptions: true });
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'telegramPoll') ScriptApp.deleteTrigger(t);
    });
    // 5-min poll (was 1-min). 1,440 runs/day burned ~12 min of the daily script
    // runtime quota per project just to catch occasional bot commands; 5 min still
    // answers /present, /today etc. within a few minutes and cuts the drain 5×.
    ScriptApp.newTrigger('telegramPoll').timeBased().everyMinutes(5).create();
    return { success: true, mode: 'polling' };
  }

  function disable() {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'telegramPoll') ScriptApp.deleteTrigger(t);
    });
    return { success: true };
  }

  return {
    send: send, reply: reply, poll: poll,
    enable: enable, disable: disable,
    esc: esc, route: route
  };
})();

// ── Top-level trigger entry point ───────────────────────────
// GAS time-based triggers can only call top-level functions, not object
// methods — so the trigger targets this thin wrapper.
function telegramPoll() { TelegramLib.poll(); }
