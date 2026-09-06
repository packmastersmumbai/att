# -*- coding: utf-8 -*-
"""
Push the induction clips into the app's Drive folder.

The clips are built offline (see the induction-audio folder in Drive for
build.py / simple.py / scenarios.py / visitor.py) and uploaded here one at a
time through the admin-gated putInductionClip route.

One at a time, not one big payload, because a GAS request has a hard limit and
160 clips of base64 is several megabytes. A per-clip POST also means a failure
loses one clip rather than the whole run, and re-running only re-uploads what
is missing.

Usage:
    python upload_induction_audio.py --pin 1234
    python upload_induction_audio.py --pin 1234 --only TRN-IND
    python upload_induction_audio.py --pin 1234 --dry-run
"""
import argparse, base64, json, os, sys, time
import urllib.request, urllib.parse

EXEC = ("https://script.google.com/macros/s/"
        "AKfycbzkGp766lCPYqhitkbYsv0jQGPtBE_dLzpc3CiwuXIWmm7CbFps4XMTb5kmxLAryR0CMQ"
        "/exec")

# Where the built clips live, relative to this file.
AUDIO_ROOT = os.path.join(
    os.path.expanduser("~"),
    "My Drive (packmasters.mumbai@gmail.com)",
    "# TRAINING", "Courses & Content", "ZED - PM", "PM FORMATS", "induction-audio")


def post(action, payload, timeout=120):
    # doPost does JSON.parse(e.postData.contents), so the body must be JSON —
    # form encoding throws before the router is ever reached. Content-Type is
    # text/plain to avoid the CORS preflight GAS does not answer.
    body = json.dumps(dict(payload, action=action)).encode()
    req = urllib.request.Request(EXEC, data=body,
                                 headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def login(pin):
    res = post("verifyPIN", {"pin": str(pin)})
    if not res.get("success"):
        sys.exit("PIN rejected: %s" % res.get("error", "unknown"))
    return res["token"]


def clips_from(folder, prefix, manifest_name="manifest.json"):
    """Yield (logical_name, path, lang, cues) for every clip in a manifest.

    The logical name is what the app stores and the page asks for; the file on
    disk is addressed only here. See inductionAudio.js for why that split
    matters when a clip is later re-recorded.
    """
    man_path = os.path.join(folder, manifest_name)
    if not os.path.exists(man_path):
        return
    man = json.load(open(man_path, encoding="utf-8"))

    # Which rules became test questions, in the order they are asked. The page
    # keys question audio by POSITION (TRN-IND/Q3/qhi) because getModuleTest
    # returns n/text/options and nothing that would identify the source rule —
    # the answer key stays on the server. So the mapping lives here, and must
    # match the PICK list in gen_seed.py that built the module.
    ASKED = {"TRN-IND": ["R01", "R04", "R05", "R06", "R07",
                         "R11", "R14", "R16", "R18", "R21"]}
    asked = ASKED.get(prefix, [])

    for m in man:
        for key, suffix in (("en", "_en"), ("hi", "_hi"),
                            ("qen", "_qen"), ("qhi", "_qhi")):
            path = os.path.join(folder, m["id"] + suffix + ".opus")
            if not os.path.exists(path):
                continue
            lang = "hi" if key.endswith("hi") else "en"

            if key in ("en", "hi"):
                # A rule clip: named by rule, and the only one with cues,
                # because it is the only one with text to follow along.
                cues = m.get("cues", {}).get(key, [])
                yield ("%s/%s/%s" % (prefix, m["id"], key), path, lang, cues)
            else:
                # A question clip: only uploaded if this rule is actually
                # asked, and named by its position in the test.
                if m["id"] not in asked:
                    continue
                n = asked.index(m["id"]) + 1
                yield ("%s/Q%d/%s" % (prefix, n, key), path, lang, [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pin", required=True)
    ap.add_argument("--only", help="TRN-IND or VISITOR")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sets = [("TRN-IND", AUDIO_ROOT),
            ("VISITOR", os.path.join(AUDIO_ROOT, "visitor-sqcdp"))]
    if args.only:
        sets = [s for s in sets if s[0] == args.only]
        if not sets:
            sys.exit("--only must be TRN-IND or VISITOR")

    work = []
    for prefix, folder in sets:
        work.extend(clips_from(folder, prefix))

    total_kb = sum(os.path.getsize(p) for _, p, _, _ in work) / 1024
    print("%d clips, %.0f KB" % (len(work), total_kb))
    if args.dry_run:
        for name, path, lang, cues in work[:5]:
            print("  %-22s %-4s %5d B  %d cues"
                  % (name, lang, os.path.getsize(path), len(cues)))
        print("  … dry run, nothing uploaded")
        return

    token = login(args.pin)
    ok = fail = 0
    t0 = time.time()
    for i, (name, path, lang, cues) in enumerate(work, 1):
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        try:
            res = post("putInductionClip",
                       {"name": name, "audio": b64, "lang": lang,
                        "cues": cues, "voice": "tts", "token": token})
            if res.get("success"):
                ok += 1
            else:
                fail += 1
                print("  FAIL %s: %s" % (name, res.get("error")))
        except Exception as e:
            fail += 1
            print("  FAIL %s: %s" % (name, e))
        if i % 10 == 0 or i == len(work):
            print("  %3d/%d  ok=%d fail=%d  %.0fs"
                  % (i, len(work), ok, fail, time.time() - t0))

    print("\ndone: %d uploaded, %d failed" % (ok, fail))
    st = post("getInductionAudioStatus", {})
    print("server now holds:", st.get("byPrefix"), st.get("totalKB"), "KB")


if __name__ == "__main__":
    main()
