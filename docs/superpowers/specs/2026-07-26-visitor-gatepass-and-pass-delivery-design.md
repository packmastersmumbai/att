# Design — Visitor Item Gatepass & WhatsApp Pass Delivery

**Date:** 2026-07-26
**Status:** Approved design — ready for implementation planning
**Scope:** Two related, independently-shippable features on the visitor-pass domain.

---

## Summary

**Feature A — Visitor Item Gatepass.** Record materials a visitor brings IN or takes OUT,
mark items returnable and reconcile their return, pull item names from the QMS
`MASTERS_Materials` master, capture a compact per-item photo, and let the host approve the
movement via a Telegram/WhatsApp link. Logged and edited by the gate guard from the existing
visitor detail modal.

**Feature B — WhatsApp pass delivery.** At registration, give the visitor their gate-pass link
on WhatsApp (one-tap `wa.me` prefill) so they can flash the QR on arrival.

The two features share the visitor-pass domain but ship separately. A is the substantial build;
B is small.

---

## Context & existing patterns (must follow)

- **Row-per-record sheets.** Logs/Visitors are one row per record; the gatepass follows suit
  (one row per item movement).
- **Dispatch.** `_dispatchPost_` in `Code.js` routes `if (action === '…')` → a domain function
  returning `jsonResponse(...)`.
- **Config for environment values.** `PublicUrl`, `TelegramBotToken`, `CallMeBotKey`, `AdminPIN`
  live in the Config sheet via `getConfigValue()`. New external pointers go here too.
- **Photo pipeline.** vreg `_stampPhoto_` (client canvas downscale + JPEG compress) →
  `registerVisitor` → `_storeVisitorPhoto_` (Drive upload, ANYONE_WITH_LINK) → store only the
  URL. Serve via the `thumbnail?id=…&sz=w400` form (`_drivePhotoUrl_`/`_normalizePhotoUrl_`)
  so images render both in `<img>` and as CSS backgrounds.
- **Notifications.** `notifications.js` has `sendVisitorPassToChannel` (Telegram, photo+caption)
  and `_sendWhatsApp` (CallMeBot — **only sends to pre-authorized numbers**, so it works for
  the host/owner but NOT a first-time visitor).
- **Public pass link.** `publicPassUrl(visitorId)` → `<appUrl>?page=vpass&id=…` (now direct to
  the GAS app, launcher removed).
- **Admin token pattern.** `adminAuth.js` mints short cache-stored bearer tokens with TTL
  (`_issueAdminToken_` / `_isAdminToken_`) — the model for the gatepass approval token.
- **i18n.** JS-built UI strings go through `qrattT(key)`; dictionary in `i18n.html` (EN/HI).
- **QMS material master.** External GAS project at `PM QMS`. `MASTERS_Materials` sheet, read by
  `getMaterials()`. Column contract (0-based): A code, B desc, C unit, D category,
  E defaultLocation, F reorderLevel, G–L geometry, M inspectionCategory. QrAtt needs only
  **code, desc, unit**.

---

## Feature A — Visitor Item Gatepass

### A1 · Data model

New sheet **`Gatepass`**, one row per item movement:

| Col | Field | Notes |
|---|---|---|
| A | `GatepassID` | `GP-YYYYMMDD-<8hex>` |
| B | `VisitorID` | FK to Visitors |
| C | `Direction` | `IN` / `OUT` |
| D | `MaterialCode` | QMS material code, or `''` for free-text |
| E | `ItemDesc` | material desc or free-typed text |
| F | `Unit` | UOM from master, or `''` |
| G | `Qty` | number |
| H | `Returnable` | `YES` / `NO` |
| I | `Status` | `OUT_PENDING` · `RETURNED` · `LEFT` · `VOID` |
| J | `PhotoURL` | compact Drive thumbnail URL (may be blank) |
| K | `HostEmpID` | copied from the visitor's host |
| L | `HostApproved` | `YES` / `NO` |
| M | `LoggedBy` | gate/guard identifier |
| N | `LoggedAt` | ISO timestamp |
| O | `SettledAt` | ISO — when returned/left/voided |
| P | `Note` | override reason, waive note, void reason |

**Status lifecycle.** Inbound + returnable → `OUT_PENDING` → `RETURNED`. Outbound OR
non-returnable → `LEFT` at creation. `VOID` for corrections. `HostApproved` (L) is orthogonal
to `Status` — a pass is logged and usable before the host approves.

Sheet added to the `_bootstrapIfNeeded` schema so fresh installs get it; a runtime
`_ensureGatepassSheet_()` guard creates it on first use for existing installs.

### A2 · Server API

**New module `gatepass.js`** (domain-named; not a util grab-bag):

- `getGatepass(visitorId)` → `{ success, items:[…], returnableOutstanding:N }`.
- `addGatepassItem(visitorId, item)` — `item = {direction, materialCode, itemDesc, unit, qty,
  returnable, photoData}`. Compresses/stores photo via the `_storeVisitorPhoto_` pattern
  (thumbnail URL), computes initial `Status`, copies `HostEmpID` from the visitor,
  `HostApproved='NO'`, appends the row. **Does not notify** — notification is an explicit guard
  action (A4).
- `markItemReturned(gatepassId)` — `OUT_PENDING → RETURNED`, stamps `SettledAt`.
- `voidGatepassItem(gatepassId, reason)` — → `VOID`, stamps `SettledAt` + `Note`.
- `approveGatepass(visitorId, token)` — validates the approval token, sets `HostApproved='YES'`
  for that visitor's non-void rows.
- `getVisitorReturnablesOutstanding(visitorId)` → count of `OUT_PENDING` rows (pure query; used
  by the checkout warning).

**New module `materialMaster.js`** (QMS read):

- `getMaterialList()` → `[{code, desc, unit}]`. Reads
  `SpreadsheetApp.openById(getConfigValue('QMSMaterialSheetID')).getSheetByName('MASTERS_Materials')`,
  maps columns A/B/C. **CacheService-backed** (6h key) so the external open happens at most once
  per 6h across all users. Unset/unreadable ID → returns `[]` (silent free-text fallback; never
  throws, never blocks).

**Config key:** `QMSMaterialSheetID` (new, non-secret — editable/visible in admin Config). The
QMS *spreadsheet* ID (the container, not the script ID) is pasted here once by the admin.

**Dispatch:** six new `if (action === …)` routes in `_dispatchPost_`:
`getGatepass`, `addGatepassItem`, `markItemReturned`, `voidGatepassItem`, `approveGatepass`,
`getMaterialList`.

### A3 · UI (visitors.html visitor detail modal)

New **"Items & Gatepass"** card appended below the existing detail fields:

- **Direction toggle** — IN / OUT segmented control.
- **Item adder** — autocomplete input (material list primed once on card open; free-text
  allowed) · qty · Returnable checkbox · optional compact photo (`_stampPhoto_` ~320px/q0.5) ·
  Add button.
- **Items table** — one row per item: status chip (Awaiting return / Returned / Left / Void),
  thumbnail, per-row actions (Mark returned / Void).
- **Returnable notice** — "N returnable still out" when any `OUT_PENDING`.
- **Host-approval strip** — shows `HostApproved` state + a **"Notify host"** button.

**Data flow.** Card open → `getGatepass(visitorId)` + `getMaterialList()` in parallel → render
table + prime **client-side** autocomplete (no per-keystroke server calls; the list is small and
held client-side). Add/return/void → single server call → re-render the card only. All strings
via `qrattT()` (EN/HI).

**Check-out integration.** The existing `selfCheckVisitor` / checkout path consults
`getVisitorReturnablesOutstanding(visitorId)`; if > 0, show a **warning listing the outstanding
items with a required override reason** (warn-and-allow, per decision). The reason is written to
the settling rows' `Note`. Check-out is never hard-blocked.

### A4 · Host approval (Telegram/WhatsApp link)

- Guard adds all items, then taps **"Notify host"** (explicit, once — not per-item, to avoid
  spamming a multi-item pass).
- Notification uses existing infra: **Telegram** to the channel/host if configured, WhatsApp-to-
  host (`_sendWhatsApp`, host is pre-authorized) as fallback. Content: visitor name + item list
  (direction, qty, returnable) + an **approve link**.
- **Approve link** = `<appUrl>?page=gatepass_approve&id=<visitorId>&t=<token>`. Opens a minimal
  public page listing the items with an **Approve** button → `approveGatepass(visitorId, token)`.
- **Token** — a per-visitor gatepass approval token, short and cache-stored with TTL, following
  the `adminAuth.js` token pattern, so the link can't be forged or replayed.
- **Advisory, not blocking.** Items are logged regardless of approval; `HostApproved` is an audit
  flag rendered as a chip. The guard never waits on the host to move goods.

New page `pages/gatepass_approve.html` (added to `validPages` in `doGet`), injected with the
visitor + item list server-side (like idcards), so the host sees the list without an extra call.

---

## Feature B — WhatsApp pass delivery to visitor

**Trigger.** End of a successful registration (`submitReg` in vreg; the visitors staff form).

**Mechanism.** Build `wa.me/<visitorPhone>?text=<message>` — identical construction to the
existing manual share button — and surface it as a **prominent, pre-filled "Send pass on
WhatsApp" button** on the confirmation screen (one tap, sends from the guard's/visitor's own
WhatsApp). No CallMeBot (won't deliver to an unauthorized visitor number), no cost, any number.

**Message (EN/HI via qrattT).** Greeting + org name + "Your gate pass:" + `publicPassUrl(visitorId)`.
The visitor taps the link on arrival → vpass page → QR to flash.

**Config toggle.** `AutoWhatsAppPass` (on/off, default **off**). When on, attempt a programmatic
`window.open(waUrl)` immediately after registration; the button remains regardless (browsers
often block programmatic `window.open`, so the button is the reliable path).

**Known limitation (documented, not a bug).** A `wa.me` prefill carries text + link only — it
cannot attach the QR image. The QR lives behind the pass link (vpass page). The visitor needs a
browser/data at the gate, or screenshots the QR beforehand. This is the only mechanism `wa.me`
supports; true image auto-send would require a paid WhatsApp Business provider (explicitly out of
scope).

---

## Testing

- **e2e (Playwright, gas-mock):** gatepass add (IN/OUT, returnable/non), mark-returned, void,
  material picklist populates + free-text fallback, checkout warning fires when returnables
  outstanding + override path, host-approve page approves via token, WhatsApp button builds the
  correct `wa.me` URL. Mock `getMaterialList`, `getGatepass`, gatepass mutations, `approveGatepass`
  in `gas-mock.js`.
- **i18n suite:** new `qrattT` keys resolve EN/HI.
- Full suite must stay green (currently 173/173).

## Out of scope

- Paid WhatsApp Business / Twilio auto-send with image.
- Writing back to QMS (read-only material consumption).
- Standalone gatepass without a visitor (courier/staff material moves) — visitor-tied only.
- Backfilling historical visitors' photos.

## Open dependency (needed before A ships)

- The **QMS spreadsheet ID** (the container spreadsheet, not the `PM QMS` script ID) pasted into
  Config `QMSMaterialSheetID`, and the QrAtt owner account granted **read** access to that QMS
  sheet. Until set, the material picklist falls back to free-text (feature still works).

## Decisions (recorded)

- Movement types: IN + OUT + Returnable. Approval: host. Entry point: guard, from visitor detail.
- Return gating: warn + allow override. Host approval: Telegram/WhatsApp link, advisory (audit
  flag), explicit "Notify host" button (not per-item).
- QMS integration: direct sheet read via `openById`, ID in Config, CacheService-backed, loaded
  once on card open then client-side autocomplete; picklist + free-text fallback.
- Pass delivery: one-tap `wa.me` prefill button; optional auto-open behind `AutoWhatsAppPass`
  Config toggle (default off).
