# Phase 5a report — i18n core + gate pages (vreg, vpass)

## i18n dictionary (`src/i18n.html`) — for human review of Hindi

| Key | English | Hindi |
|---|---|---|
| lang_en | English | English |
| lang_hi | हिंदी | हिंदी |
| vreg_been_here | Been here before? | पहले आए हैं? |
| vreg_mobile_ph | Mobile number | मोबाइल नंबर |
| vreg_find | Find | खोजें |
| vreg_new_visitor_hint | New visitor? Fill the form below. | नए विज़िटर नीचे फ़ॉर्म भरें |
| vreg_name | Name | नाम |
| vreg_name_ph | Rahul Sharma | राहुल शर्मा |
| vreg_mobile | Mobile | मोबाइल |
| vreg_whom | Whom to meet | किससे मिलना है |
| vreg_loading | Loading… | लोड हो रहा है… |
| vreg_purpose | Purpose | उद्देश्य |
| vreg_add_photo | Add Photo (optional) | फ़ोटो लें |
| vreg_photo_added | Photo added ✓ | फ़ोटो जोड़ी गई ✓ |
| vreg_tap_camera | Tap to use camera | कैमरा खोलने के लिए टैप करें |
| vreg_more_details | More details | अधिक जानकारी |
| vreg_type | Type | प्रकार |
| vreg_company | Company | कंपनी |
| vreg_id_type | ID Type | ID प्रकार |
| vreg_id_number | ID Number | ID नंबर |
| vreg_id_number_ph | Last 4 digits | अंतिम 4 अंक |
| vreg_vehicle | Vehicle Number | वाहन नंबर |
| vreg_purpose_meeting | Meeting | मीटिंग |
| vreg_purpose_delivery | Delivery | डिलीवरी |
| vreg_purpose_interview | Interview | इंटरव्यू |
| vreg_purpose_maintenance | Maintenance | मेंटेनेंस |
| vreg_purpose_other | Other | अन्य |
| vreg_safety_title | Safety Instructions | सुरक्षा निर्देश |
| vreg_video_unavailable | Video unavailable | वीडियो उपलब्ध नहीं |
| vreg_tap_each_rule | Tap each rule to reveal | हर नियम पर टैप करें |
| vreg_tap_to_read | Tap to read | टैप करें |
| vreg_safety_ack | I have read and understood all the rules. | मैंने सभी नियम पढ़े और समझ लिए हैं |
| vreg_register_btn | Register & Get Pass | पंजीकरण करें |
| vreg_registering | Registering… | पंजीकरण हो रहा है… |
| vreg_select_person | Select person… | व्यक्ति चुनें… |
| vreg_owner_group | Owner | मालिक |
| vreg_office_group | Office | ऑफिस |
| vreg_toast_required | Name and Mobile are required | नाम और मोबाइल आवश्यक |
| vreg_toast_rules_pending | Please read all safety rules first | कृपया सभी नियम पढ़ें |
| safety_rule_1 | The entire site is a NO SMOKING area. | पूरा परिसर धूम्रपान निषेध क्षेत्र है। |
| safety_rule_2 | Photography inside the premises is strictly prohibited. | परिसर के अंदर फ़ोटोग्राफ़ी सख़्त वर्जित है। |
| safety_rule_3 | No mobile phone use outside the office. Phones must be switched OFF elsewhere. | ऑफिस के अलावा कहीं भी मोबाइल का उपयोग न करें; बाहर मोबाइल बंद रखें। |
| safety_rule_4 | Please do not litter. Help us keep the site clean. | कूड़ा न फैलाएँ। परिसर को साफ़ रखने में मदद करें। |
| safety_rule_5 | Entry to any area outside the office is prohibited unless authorised and accompanied by your host. | ऑफिस के बाहर किसी भी क्षेत्र में बिना अनुमति और बिना साथी के प्रवेश वर्जित है — आपका मेज़बान आपके साथ रहेगा। |
| safety_rule_6 | Be alert to safety signs and internal traffic. Do not play with any equipment. | सुरक्षा संकेतों और आंतरिक यातायात का ध्यान रखें। किसी भी उपकरण से छेड़छाड़ न करें। |
| safety_rule_7 | If the alarm sounds, follow the instructions of your contact person. | अलार्म बजने पर संपर्क व्यक्ति के निर्देशों का पालन करें। |
| vpass_exit_note | ⚠ Show this pass to security when leaving. | ⚠ बाहर जाते समय यह पास सुरक्षा को दिखाएँ |
| vpass_emergency_title | Emergency Contacts | आपातकालीन संपर्क |
| vpass_safety_rules_title | Safety Rules | सुरक्षा नियम |
| vpass_emg_incharge | In-charge | प्रभारी |
| vpass_emg_main_gate | Main Gate | मुख्य गेट |
| vpass_emg_office | Office | ऑफिस |

## Injection points

- **`src/Code.js` `doGet`** (~lines 73–82): after `template.evaluate()`, the content string has
  `HtmlService.createHtmlOutputFromFile('i18n').getContent()` inserted before `</head>` via
  `.replace()`, then rebuilt into a fresh `HtmlOutput` with `.setTitle()` / `.addMetaTag()` /
  `.setXFrameOptionsMode()` preserved exactly as before (live app path).
- **`e2e-lib.js`** (~line 30 for the `I18N_SCRIPT` constant reading `src/i18n.html`, ~line 104 in
  `openPage`): concatenates `GAS_MOCK_SCRIPT` + the full `i18n.html` contents into `<head>` the
  same way the mock script was already injected. Without this the harness (which builds pages
  from raw files and never runs `doGet`) would not have the i18n runtime available at all.

## Harness fixes required beyond the brief's literal scope

1. **sessionStorage shim** (`installSessionStorageShim` in `e2e-lib.js`) — Chromium disables real
   `sessionStorage` on `data:` URLs (how the harness loads pages), which would throw on every
   `qrattLang()`/`qrattSetLang()` call. Production serves over `https://` so this only affected
   tests, not the live app.
2. **`<?!= expr ?>` unescaped-template stripping** — the harness's existing template-stripping
   regex only handled `<?= expr ?>`, not vpass.html's unescaped `<?!= passJson ?>`, which
   previously collapsed to `var PASS = ;` (a syntax error) and made vpass entirely unloadable by
   the harness. This predates this change (confirmed no prior sweep exercised vpass) — fixed with
   a dedicated regex.

## Final e2e result

```
✓  8  8a · i18n — Hindi pre-selecte     5       0
✓  8  8b · i18n — Default language      1       0
✓  8  8c · i18n — vpass toggle flip     3       0
──────────────────────────────────────────────────────────
Total: 168/168 passed  (0 failed)  143.3s
✅ ALL TESTS PASSED
```
(159 pre-existing + 9 new from Suite 8.)

## Flagged for human double-check

- **Hindi phrasing** — simple spoken register used throughout (e.g. `टैप करें` not
  `स्पर्श करें`). Please confirm these read naturally to actual guard/visitor staff.
- **`vreg_registering`** ("पंजीकरण हो रहा है…") — this transient button-state text had no Hindi
  equivalent in the original code (was English-only "Registering…"); authored a Hindi version for
  toggle consistency, but it wasn't part of a pre-existing bilingual string — confirm it's wanted.
- **Confirmation screen (doneCard) and vpass status/button text** ("You're registered",
  "Check IN/OUT", "Currently checked IN", etc.) were **not** converted — they were English-only in
  the original files (not the `"<hi> · <en>"` pattern), so per the brief's literal scope ("every
  user-visible bilingual string") these were left alone. Flag if this slice should have included
  them too.

## Files created/modified

- Created: `src/i18n.html`
- Created: `e2e-sweep-8-i18n.js` (gitignored by `e2e-*.js`; added with `git add -f`)
- Modified: `src/Code.js`
- Modified: `index.html`
- Modified: `src/pages/vreg.html`
- Modified: `src/pages/vpass.html`
- Modified: `e2e-lib.js` (gitignored)
- Modified: `e2e-all.js` (gitignored)

---

## Phase 5b — closing the vpass status/button and vreg doneCard seams

The previous slice deliberately left two seams open (see "Flagged for human double-check" above):
vpass's check-in/out status + button, and vreg's confirmation screen. This slice closes both.

### New i18n keys (`src/i18n.html`)

| Key | English | Hindi |
|---|---|---|
| vpass_status_in | Currently checked IN | अभी अंदर दर्ज हैं |
| vpass_status_out | Not checked in | अभी दर्ज नहीं हैं |
| vpass_btn_checkin | Check IN | चेक इन करें |
| vpass_btn_checkout | Check OUT | चेक आउट करें |
| vpass_hint_checkin | check in | चेक इन |
| vpass_hint_checkout | check out | चेक आउट |
| vpass_hint_tail | Tap the button to {action}. Keep this page — you can check in and out from here, or show the QR at the gate. | {action} करने के लिए बटन दबाएँ। इस पेज को सुरक्षित रखें — यहाँ से चेक इन/आउट कर सकते हैं, या गेट पर QR दिखा सकते हैं। |
| vpass_wait | Please wait… | कृपया प्रतीक्षा करें… |
| vreg_done_title | You're registered | आपका पंजीकरण हो गया |
| vreg_done_subline | Show this QR at the security desk to check in / out. | चेक इन / आउट के लिए यह QR सुरक्षा डेस्क पर दिखाएँ |
| vreg_done_returning_title | Welcome back | फिर से स्वागत है |
| vreg_done_returning_sub | We recognised your number — this is your existing pass. Show it at the desk to check in / out. | हमने आपका नंबर पहचान लिया — यह आपका मौजूदा पास है। चेक इन / आउट के लिए इसे डेस्क पर दिखाएँ |
| vreg_open_pass | Open my pass ↗ | मेरा पास खोलें ↗ |
| vreg_close | Close | बंद करें |

`vpass_hint_tail` uses a `{action}` placeholder substituted at render time with `vpass_hint_checkin`/
`vpass_hint_checkout`, avoiding string-concatenation duplication of the sentence for each state
(the "checked in"/"checked out" fragment is the only part that changes).

### How the JS-built status/button re-render was handled

`vpass.html`'s `render(p)` builds the status pill and action button from JS based on `p.status`.
The status/button copy depends on **check-in state**, not just language — so instead of writing
plain text once, each element is now given a **state-selected `data-i18n` key**
(`vpass_status_in`/`vpass_status_out`, `vpass_btn_checkin`/`vpass_btn_checkout`) chosen by the
current `isIn` boolean, same pattern already used for `vpass_exit_note` etc. elsewhere in the file.

This means a later language toggle only needs to re-run the existing `qrattApplyLang()` (which
`qrattSetLang()` already calls) — it re-translates whichever state-key is currently attached to the
node, without needing to re-invoke `render()`. No new re-render wiring was required; the existing
toggle handler was sufficient once the elements carried the correct keys.

The transient "Please wait…" button state (shown mid-request) was also translated
(`vpass_wait`) and clears its `data-i18n` attribute while showing that transient text — mirroring
the existing pattern already used for vreg's "Registering…" button state.

`vreg.html`'s `showDone()` sets `doneTitle`/`doneSub` text directly for the returning-visitor
variant. Rather than hardcoding two different English strings, it now swaps each element's
`data-i18n` attribute to the returning/non-returning key and calls `qrattT()` immediately — keeping
both variants toggle-able and reusing the same `qrattApplyLang()` mechanism for any later toggle.

Visitor data (`esc()`-rendered names/company on vpass, e.g. `p.name`, `p.company`) was left
completely untouched — only static labels became i18n keys.

### One new e2e assertion (`e2e-sweep-8-i18n.js`, suite 8c)

Added: "check-in button label is Hindi when lang=hi" — asserts `#toggleBtn` on vpass reads
`चेक आउट करें` (the injected test PASS has `status: 'IN'`, so the button shows the checkout label)
after `qrattSetLang('hi')` is called, without any explicit re-render call.

### Final e2e result

```
✓  8  8a · i18n — Hindi pre-selecte     5       0
✓  8  8b · i18n — Default language      1       0
✓  8  8c · i18n — vpass toggle flip     4       0
──────────────────────────────────────────────────────────
Total: 169/169 passed  (0 failed)  115.5s
✅ ALL TESTS PASSED
```
(168 pre-existing + 1 new assertion in suite 8c.)

### Flagged for human double-check

- **`vpass_status_in`/`vpass_status_out`** ("अभी अंदर दर्ज हैं" / "अभी दर्ज नहीं हैं") — phrasing
  chosen for brevity to fit the small status pill; confirm this reads naturally versus a more
  literal "अभी चेक इन हैं".
- **`vpass_btn_checkin`/`vpass_btn_checkout`** ("चेक इन करें" / "चेक आउट करें") — kept "चेक इन"/
  "चेक आउट" as loanwords (common in Indian workplace usage) rather than translating fully; confirm
  this matches expectations for guard/visitor staff.
- **`vpass_hint_tail`** placeholder sentence — confirm the `{action}` substitution reads smoothly
  in Hindi grammar (Hindi is SOV, so inserting an English-pattern "tap to {action}" translation
  mid-sentence needs a native speaker's sanity check).
- **`vreg_done_returning_title`/`vreg_done_returning_sub`** — these are new Hindi translations of
  strings that were previously English-only and dynamically injected via `textContent`; there was
  no prior Hindi reference text to check against.

### Files modified in this slice

- Modified: `src/i18n.html` (new keys only, no existing keys touched)
- Modified: `src/pages/vpass.html` (status/button/hint made state-keyed i18n; "Please wait…" translated)
- Modified: `src/pages/vreg.html` (doneCard title/subline/link/close button made i18n; `showDone()` swaps data-i18n key per returning/non-returning state)
- Modified: `e2e-sweep-8-i18n.js` (gitignored by `e2e-*.js`; added with `git add -f`) — one new assertion in suite 8c
