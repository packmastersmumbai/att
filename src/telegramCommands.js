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
  '/find':     function (arg) { return _tgFind_(arg); },
  '/start':    function () { return _tgHelp_(); },
  '/help':     function () { return _tgHelp_(); }
};

// Admin buttons call these thin wrappers (keeps the UI decoupled from the lib).
function setTelegramWebhook(authToken) { _requireAdmin_(authToken); return TelegramLib.enable(); }   // "Enable Bot Commands"
function deleteTelegramWebhook() { return TelegramLib.disable(); }
