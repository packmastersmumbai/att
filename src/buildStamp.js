// ============================================================
// buildStamp.gs — one auto-rotating code version for cache keys
// ============================================================
//
// WHY THIS EXISTS
//
// A cache key must encode every input the value depends on. Payload caches here
// were keyed on a bare name ('dashData') or a hand-typed version
// ('qms_materials_v1'). Both are blind to a deploy: change the shape of what a
// function returns, push it, and the cache keeps serving the OLD shape until it
// expires — 15s for the dashboard, up to 6h for materials. That reads exactly
// like "my fix didn't work", and costs a debugging round every time.
//
// A data fingerprint cannot cover this either. It answers "did the data change",
// not "did the code change". They are different questions and need different
// inputs:
//
//   data changed   -> fingerprint / explicit invalidation
//   code changed   -> build stamp        (this file)
//   shape changed  -> explicit key version in the caller's prefix
//
// HOW IT WORKS
//
// One Script Property holds a stamp. Every derived cache key contains it, so
// rotating the stamp retires every entry keyed on it at once. That is the whole
// trick: do not hunt down and delete cache keys — change the namespace they
// live in. Deletion is O(keys) and can blow the request timeout; rotation is a
// single property write and returns instantly.
//
// The stamp is rotated as part of deploying (deploy.ps1 calls ?diag=bumpbuild),
// so nobody has to maintain a version number by hand. It can also be rotated
// manually at any time by opening:
//   ?diag=bumpbuild
//
// FAIL TOWARD CORRECTNESS: every path here degrades to "cache miss, rebuild it",
// never to "serve something possibly wrong". If PropertiesService is unavailable
// we return a per-execution stamp, which simply means nothing gets reused.

var PM_BUILD_PROP_ = 'pm.build.stamp';

/** Current build stamp; creates one on first call. Never throws. */
function getBuildStamp_() {
  try {
    var sp = PropertiesService.getScriptProperties();
    var v = sp.getProperty(PM_BUILD_PROP_);
    if (!v) {
      v = Date.now().toString(36);
      sp.setProperty(PM_BUILD_PROP_, v);
    }
    return v;
  } catch (e) {
    // Degrade to a value that is simply never reused, rather than to a constant
    // that would make every deploy share one namespace forever.
    return 'nostamp' + Date.now().toString(36);
  }
}

/** Rotate the stamp — retires every cache entry derived from it. O(1). */
function bumpBuildStamp_() {
  var v = Date.now().toString(36);
  try {
    PropertiesService.getScriptProperties().setProperty(PM_BUILD_PROP_, v);
  } catch (e) {
    return '';
  }
  return v;
}

/**
 * Namespace a cache key with the current build stamp.
 *
 * @param {string} name  logical key, INCLUDING its own shape version when the
 *                       payload shape can change independently of a deploy
 *                       (e.g. 'materials_v1'). The build stamp covers code
 *                       changes; the caller's version covers deliberate shape
 *                       changes. Both inputs, both in the key.
 */
function buildScopedKey_(name) {
  return 'b' + getBuildStamp_() + '_' + name;
}

/**
 * Rotate the stamp as part of deploying.
 *
 * There is deliberately NO automatic "detect a new deployment" check here.
 * Apps Script exposes no reliable in-script signal for it: the exec URL is
 * fixed per deploymentId and does not change between versions, so a
 * URL-watching heuristic would simply never fire — worse than nothing, because
 * it reads like protection while providing none.
 *
 * Rotation is instead an explicit step, wired into the deploy path:
 *   clasp push && clasp deploy ... && curl '<exec>?diag=bumpbuild'
 * or by opening ?diag=bumpbuild once after deploying. One property write,
 * returns instantly, retires every stamped cache entry.
 *
 * See deploy.ps1, which does this automatically.
 */
function onDeployBump_() {
  return bumpBuildStamp_();
}
