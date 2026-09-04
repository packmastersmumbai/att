// ============================================================
// feedback.gs — user complaint / feedback → Telegram
// ============================================================
//
// The floating "Report an issue" button on every page calls submitFeedback().
// It posts to the app's Telegram channel via the shared _sendTelegram helper
// (reads TelegramBotToken + TelegramChatID from Config). Best-effort: returns a
// clear error if Telegram isn't configured, never throws.

function submitFeedback(text, meta) {
  // Checked before doing any work — the user is waiting on this response.
  if (!_alertOn_('AlertFeedback')) return { success: false, error: 'Issue reporting is switched off.' };

  var msg = String(text || '').trim();
  if (!msg) return { success: false, error: 'Please describe the issue.' };
  if (msg.length > 2000) msg = msg.slice(0, 2000);

  meta = meta || {};
  var page = String(meta.page || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
  var lang = String(meta.lang || '').replace(/[^a-z]/gi, '').slice(0, 4);

  // _tgCard_ escapes every value it is given (parse_mode=HTML), so the user's
  // text cannot inject markup or break parsing.
  var body = _tgCard_({
    icon: '🛠️', title: 'App Issue Reported',
    body: msg, bodyFirst: true,   // the complaint is the message, not the metadata
    rows: [
      ['Page', page || 'unknown'],
      ['Lang', lang],
      ['Time', formatTime(new Date())]
    ]
  });

  var ok = _sendTelegram(body, _tgButtons_([[{ text: '👁 Acknowledge', callback_data: 'gpack:issue on ' + (page || 'app') }]]));
  if (!ok) return { success: false, error: 'Could not send right now. Please tell the front desk.' };
  return { success: true };
}
