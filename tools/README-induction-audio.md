# Induction audio — how the pieces fit

The clips are the instruction, not decoration. A worker who reads slowly, or
not at all, has only the voice — so the audio is treated as content with a
provenance, not as an asset.

## The pipeline

```
Workers instructions .xlsx          the site's own sheet, 15 categories / 30 rules
        │
        │  build.py → simple.py     rewrite both languages for speech
        │  scenarios.py             pair each rule with a situation
        │  speed.py                 1.15× (atempo, pitch preserved)
        ▼
induction-audio/*.opus              100 clips, ~500 KB, Opus 12k mono
        │
        │  tools/upload_induction_audio.py --pin ####
        ▼
Drive: InductionAudio/              one public file per clip
InductionAudio sheet                Name → FileID + cues
        │
        │  getInductionAudio('TRN-IND/')
        ▼
selftest.html                       🔊 button, shown only when a clip exists
```

The build scripts live beside the clips in
`# TRAINING/Courses & Content/ZED - PM/PM FORMATS/induction-audio/`,
not in this repo: they need `gtts` and `ffmpeg`, run once, and produce data
rather than code.

## Naming, and why it matters

| Clip | Name |
|---|---|
| A rule, Hindi | `TRN-IND/R14/hi` |
| A rule, English | `TRN-IND/R14/en` |
| A question, Hindi | `TRN-IND/Q7/qhi` |
| A visitor SQCDP section | `VISITOR/sqcdp_s/hi` |

Rules are named by **rule id**; questions by **position in the test**.

That asymmetry is deliberate. `getModuleTest` returns `n`, `text` and
`options` and deliberately nothing else — the answer key never reaches the
phone. So the question's position is the only stable handle the page has. The
alternative would be shipping a rule id to the phone purely so the audio could
find itself, which leaks structure for no benefit.

The consequence: **renumbering the questions means re-uploading the audio.**
The `ASKED` list in `upload_induction_audio.py` must match the `PICK` list
that generated the module, and suite 19 asserts both ends agree.

Clips are never addressed by Drive file id. The id changes every time a clip
is replaced, and clips *will* be replaced — the current voice is
machine-generated and a recording of a supervisor the workers know is strictly
better. Name-addressing means that swap breaks nothing.

## Running the upload

```bash
python tools/upload_induction_audio.py --pin 1234 --dry-run   # see what would go
python tools/upload_induction_audio.py --pin 1234             # ~100 clips, a few minutes
python tools/upload_induction_audio.py --pin 1234 --only TRN-IND
```

One clip per request, not one large payload: a GAS request has a hard size
limit, and a failure then loses one clip rather than the whole run. Re-running
is safe — an existing clip is replaced and its old Drive file trashed.

## The visitor side is different

The visitor induction **already existed** — 19 bilingual rules grouped by
SQCDP in `i18n.html`, revealed a section at a time in `vreg.html`, versioned
by `QRATT_SAFETY_VERSION`, expiring through `_safetyAckValid_`. Audio is
additive to that, not a replacement.

- **One clip per SECTION, not per rule.** The page reveals a section at a
  time, so the unit of audio has to be the unit of reveal. Five sections, two
  languages, ten clips.
- **The audio IS the dwell.** `revealRule` used a timer of ~900 ms per rule to
  stop tapping through. Where a clip exists, the section instead counts as
  read when the voice finishes — real briefing time (1 m 44 s per language)
  rather than an arbitrary 17 s.
- **Every failure path falls back to the timer.** A refused autoplay, a dead
  link or a codec the phone rejects must not strand a visitor on a section
  that never reveals — they could then never acknowledge the rules at all.
- **The screen text is untouched.** `i18n.html` keeps its exact formal
  wording, so `QRATT_SAFETY_VERSION` does not change and no returning visitor
  is dragged through a re-induction merely because the site gained a voice.
  Only the spoken track is in plain register.

Returning visitors need no new logic: `_safetyAckValid_` already sends anyone
whose acknowledgement has expired *or* who signed an older rules version
through `startReinduction()`, which updates their existing record rather than
creating a second visitor.

## What is still open

- **The voice is machine-generated.** Neutral Hindi, not Mumbai register.
  Replacing it changes only the files; nothing in the app or the manifest.
- **The Hindi rewrite is mine.** The site's original wording is preserved in
  the build manifest as `hiFormal`, and is still the right text for anything
  printed and signed.
- **The wrong answers are plausible guesses.** They should be the excuses
  supervisors actually hear on the floor — that is the part that makes the
  test real rather than decorative, and the part I could not invent.
- **Validity is 12 months, assumed.** The sheet's seven SIGN columns prove the
  site re-inducts but not how often.
