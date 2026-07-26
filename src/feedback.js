// ============================================================
// feedback.gs — user complaint / feedback → Telegram
// ============================================================
//
// The floating "Report an issue" button on every page calls submitFeedback().
// It posts to the app's Telegram channel via the shared _sendTelegram helper
// (reads TelegramBotToken + TelegramChatID from Config). Best-effort: returns a
// clear error if Telegram isn't configured, never throws.

function submitFeedback(text, meta) {
  var msg = String(text || '').trim();
  if (!msg) return { success: false, error: 'Please describe the issue.' };
  if (msg.length > 2000) msg = msg.slice(0, 2000);

  meta = meta || {};
  var page = String(meta.page || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
  var lang = String(meta.lang || '').replace(/[^a-z]/gi, '').slice(0, 4);

  // parse_mode=HTML in _sendTelegram — escape the user text so it can't inject
  // markup or break parsing.
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var body =
    '🛠️ <b>App Issue Reported</b>\n' +
    '━━━━━━━━━━━━━━━\n' +
    esc(msg) + '\n' +
    '━━━━━━━━━━━━━━━\n' +
    '📄 Page: <code>' + esc(page || 'unknown') + '</code>' +
    (lang ? ' · 🌐 ' + esc(lang) : '') + '\n' +
    '🕒 ' + esc(formatTime(new Date()));

  var ok = _sendTelegram(body);
  if (!ok) return { success: false, error: 'Could not send right now. Please tell the front desk.' };
  return { success: true };
}
