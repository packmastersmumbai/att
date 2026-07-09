// ============================================================
// adminAuth.gs — Server-side authorization for admin actions
// ============================================================
//
// The web app is deployed ANYONE_ANONYMOUS and executes as the owner, so every
// server function reachable from doPost or google.script.run runs with full
// owner rights for any anonymous caller. The PIN gate in admin.html is only a
// client-side display toggle and enforces nothing.
//
// verifyPIN() mints a bearer token; every mutating admin action must present it.

var ADMIN_TOKEN_PREFIX = 'ADMTOK_';
var ADMIN_TOKEN_TTL_SEC = 21600; // 6h — CacheService hard maximum

/**
 * Config keys holding credentials. getConfig() redacts these unless the caller
 * is an authenticated admin — vreg.html is a public page and calls getConfig(),
 * so an unredacted payload hands the bot token to any anonymous visitor.
 *
 * Authenticated admins may still read and write them (that is the Settings tab).
 */
var CONFIG_SECRET_KEYS = ['AdminPIN', 'TelegramBotToken', 'TelegramChatID', 'CallMeBotKey'];

function _isSecretConfigKey_(key) {
  return CONFIG_SECRET_KEYS.indexOf(String(key).trim()) !== -1;
}

/**
 * Mechanism: issues a token and records it as valid. Caller decides when.
 */
function _issueAdminToken_() {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(ADMIN_TOKEN_PREFIX + token, '1', ADMIN_TOKEN_TTL_SEC);
  return token;
}

/**
 * Mechanism: is this token currently valid? Returns a boolean, never throws.
 */
function _isAdminToken_(token) {
  if (!token) return false;
  var key = ADMIN_TOKEN_PREFIX + String(token).replace(/[^a-z0-9-]/gi, '');
  return CacheService.getScriptCache().get(key) === '1';
}

/**
 * Mechanism: is this an owner-initiated run (Apps Script editor or an
 * installable trigger) rather than an anonymous web request?
 *
 * getActiveUser() returns the owner's email for editor/trigger runs and an
 * empty string for anonymous web-app visitors. getEffectiveUser() cannot be
 * used — it is the owner in both cases, because the app executes as the owner.
 */
function _isOwnerSession_() {
  try {
    return !!Session.getActiveUser().getEmail();
  } catch (e) {
    return false;
  }
}

/**
 * Mechanism: does this caller hold admin rights? Returns a boolean, never throws.
 * Use when the answer changes the response (e.g. redaction) rather than aborting.
 */
function _isAdminCaller_(token) {
  return _isOwnerSession_() || _isAdminToken_(token);
}

/**
 * Policy: refuse to proceed without admin rights.
 * Call this as the first statement of every mutating admin function.
 */
function _requireAdmin_(token) {
  if (!_isAdminCaller_(token)) throw new Error('Unauthorized: admin sign-in required');
}
