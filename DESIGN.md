---
name: QR Att.
description: Institutional attendance and visitor management — precision at the gate, clarity at the desk.
colors:
  primary: "#000666"
  primary-dark: "#000444"
  success: "#006b5f"
  danger: "#DC2626"
  warning: "#D97706"
  blocked: "#7C3AED"
  bg: "#fcf9f8"
  surface: "#ffffff"
  border: "#e8e3e0"
  text: "#1b1c1c"
  text-muted: "#4a5568"
  text-slate: "#6b7280"
typography:
  body:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "1.5px"
  mono:
    fontFamily: "'Roboto Mono', monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  chip-success:
    backgroundColor: "#dcfce7"
    textColor: "{colors.success}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  chip-danger:
    backgroundColor: "#fee2e2"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: QR Att.

## 1. Overview

**Creative North Star: "The Duty Register"**

QR Att. is designed with the discipline of a physical duty register: every entry legible, every column purposeful, every status unambiguous. The system serves gate staff who make access decisions in under three seconds and facility managers who scan reports without scrolling. Design choices earn their place by compressing decision time — not by embellishing it.

The palette is institutional without being governmental. Deep ink-navy (#000666) commands authority on white and warm surfaces; cold slate (#4a5568, #6b7280) carries secondary information without competing with primary actions. Motion is near-absent by intention: state changes are immediate, confirmations are brief. The system does not celebrate itself.

This system explicitly rejects the SaaS cream aesthetic — rounded cards, soft gradients, pastel illustrations, startup-template layouts — and refuses to look like a bootstrapped HR tool or a government legacy system. It occupies a narrower, more serious register: a tool that institution staff trust because it behaves with the consistency of a physical ledger.

**Key Characteristics:**
- Ink-navy primary on warm-white ground, cold slate for supporting text
- Near-flat elevation: surfaces at rest carry no shadow; depth appears only on state
- Compact type scale anchored at 14px body, 11px uppercase labels with 1.5px tracking
- Sharp corners (2–4px radius) reinforcing precision over softness
- Mobile scanner surface is first-class; dashboard and reports are desktop-primary

## 2. Colors: The Duty Register Palette

A restrained two-register palette: one authoritative primary and a cold slate hierarchy for supporting information, grounded on a warm near-white canvas.

### Primary
- **Regulation Navy** (#000666): The single authoritative color. Used on primary buttons, active nav states, links, and any element that represents a confirmed action or access approval. Its rarity signals importance.
- **Deep Navy** (#000444): Hover and active state for primary elements only. Never used as a default background.

### Secondary
- **Blocked Violet** (#7C3AED): Used exclusively for "blocked" access status. Never repurposed for decorative use. Its distinctness from the primary ensures blocked status reads before the brain processes the word.

### Tertiary
- **Approved Teal** (#006b5f): Success and approved states. Paired with green chip backgrounds (#dcfce7) for scan confirmations and attendance records.
- **Alert Amber** (#D97706): Warnings, late arrivals, pending states. Never used on white without pairing with an icon.
- **Danger Red** (#DC2626): Denied access, error states, destructive actions. Paired with red chip backgrounds (#fee2e2).

### Neutral
- **Ground Ivory** (#fcf9f8): Page background. Warm undertone prevents the interface from reading as clinical.
- **Surface White** (#ffffff): Card and panel background. The one-step lift from Ground Ivory creates tonal depth without shadows.
- **Hairline Border** (#e8e3e0): Dividers, input strokes, table rules. Warm-tinged to match the ground.
- **Ink** (#1b1c1c): All body text. Near-black with warmth — not pure #000.
- **Slate Mid** (#4a5568): Muted body text, secondary labels, metadata. WCAG AA at 4.6:1 on white.
- **Slate Light** (#6b7280): Supporting labels, timestamps, subordinate counts. Use only at 11px+ with 600+ weight.

### Named Rules
**The One Voice Rule.** Regulation Navy (#000666) is used on ≤10% of any surface. Its rarity is its signal. A screen saturated in navy has lost its command structure.

**The Unambiguous Status Rule.** Every scan result — approved, denied, blocked — uses color, icon, AND copy together. Never color alone. A colorblind gate guard must read the outcome as fast as anyone else.

## 3. Typography

**Display / Heading Font:** Public Sans (with system-ui, sans-serif fallback)
**Body Font:** Public Sans (same stack)
**Label / Mono Font:** Roboto Mono (monospace fallback) for IDs, codes, timestamps

**Character:** Public Sans's neutral geometric construction reads institutional without coldness. Its tight vertical metrics suit dense data tables. Roboto Mono grounds ID strings and timestamps in legibility without decorative weight.

### Hierarchy
- **Headline** (800 weight, 18–20px, line-height 1.2): Section titles on reports and dashboard. Sparingly — one per visible panel.
- **Title** (700 weight, 15–16px, line-height 1.3): Card headings, sidebar section names, tab labels.
- **Body** (400 weight, 14px, line-height 1.5): All prose, table cell content, form labels. Cap at 65ch in reading contexts.
- **Label** (700 weight, 11px, letter-spacing 1.5px, uppercase): Column headers, status chips, category tags. Never body copy at this size.
- **Micro** (600 weight, 10–11px): Timestamps, counts, subordinate metadata. Use #6b7280 only; never #4a5568 at this scale.
- **Mono** (400 weight, 13px): QR IDs, employee codes, visitor pass numbers. Roboto Mono.

### Named Rules
**The 11px Floor Rule.** No text renders below 11px. Labels at 9px or 10px are illegible for gate staff under poor lighting. Bump to 11px minimum, increase weight to 600+ to compensate for reduced size.

## 4. Elevation

This system is flat by default. Surfaces at rest carry no box-shadow. Tonal separation between Ground Ivory (#fcf9f8) and Surface White (#ffffff) provides the first layer of depth. Explicit borders (Hairline Border, #e8e3e0) define container boundaries without shadow.

Shadows appear only in response to state — hover, active modals, sticky headers on scroll — making elevation a behavioral signal, not a decorative one.

### Shadow Vocabulary
- **Ambient** (`0 1px 3px rgba(0,0,0,0.08)`): Interactive cards on hover, sticky sidebar. Not applied at rest.
- **Elevated** (`0 4px 16px rgba(0,0,0,0.12)`): Modals, drawers, dropdowns. Appears only when a surface lifts above the page plane.

### Named Rules
**The Flat-By-Default Rule.** If a surface doesn't move, it doesn't shadow. Elevation is a behavioral cue. Apply shadow-sm only on hover or sticky; shadow-md only on modal/overlay surfaces. Never decorate a resting card with a shadow.

## 5. Components

### Buttons
Compact and sharp-edged. Primary buttons are the single point of high contrast on any surface.

- **Shape:** Gently squared (4px radius)
- **Primary:** Regulation Navy (#000666) background, white text, 10px × 20px padding, 500 weight, 13px
- **Hover / Focus:** Deep Navy (#000444) background, 0.15s transition, focus-visible ring in navy at 2px offset
- **Secondary / Ghost:** Transparent background, 1px Hairline Border (#e8e3e0) stroke, Ink text. Same shape and padding.
- **Danger:** Danger Red (#DC2626) background, white text. Used only for destructive or denial actions.

### Chips / Status Badges
The primary status communication surface. Always pair with a short text label — never color alone.

- **Approved / Success:** #dcfce7 background, Approved Teal (#006b5f) text, 2px radius, 11px 700 weight uppercase
- **Denied / Danger:** #fee2e2 background, Danger Red (#DC2626) text, same treatment
- **Blocked:** #ede9fe background, Blocked Violet (#7C3AED) text, same treatment
- **Warning / Late:** #fef3c7 background, Alert Amber (#D97706) text, same treatment

### Cards / Containers
Tonal separation, not shadow. Cards use Surface White (#ffffff) on Ground Ivory (#fcf9f8) ground.

- **Corner Style:** 8px radius (lg) for content cards; 4px (md) for data rows and compact panels
- **Background:** Surface White (#ffffff)
- **Shadow Strategy:** None at rest. shadow-sm on hover (interactive cards only)
- **Border:** 1px Hairline Border (#e8e3e0) on all sides
- **Internal Padding:** 16px (md) standard; 12px for compact data rows

### Inputs / Fields
Minimal treatment. Inputs should read as receptive, not decorative.

- **Style:** 1px Hairline Border (#e8e3e0) stroke, Surface White background, 4px radius
- **Focus:** Navy border (#000666), 2px; no glow or shadow added
- **Error:** Danger Red (#DC2626) border, paired with inline error text below the field
- **Disabled:** 50% opacity, cursor not-allowed

### Navigation (Sidebar / Mobile Tab Bar)
Two surfaces: desktop sidebar and mobile bottom tab bar. Both use the same active state.

- **Sidebar:** Surface White background, 1px right border (Hairline), 13px 500 weight nav items, active state = Navy left accent + #eff6ff background, hover = #f8fafc
- **Mobile Tab Bar:** Surface White, 1px top border, icons + 10px labels, active icon and label in Regulation Navy (#000666), inactive in Slate Mid (#4a5568). Fixed to viewport bottom; body padded 56px to clear content.

### Scan Result Card (Signature Component)
The highest-stakes surface in the system. Gate staff read this under time pressure.

- **Full-width card**, 16px padding, 8px radius
- **Status color block:** full-width top band (8px height) in the status color — Teal for approved, Red for denied, Violet for blocked
- **Name:** 20px 700 weight, Ink (#1b1c1c). First thing the eye lands on.
- **Status chip:** immediately below name, matching the color band above
- **Supporting detail** (dept, ID, time): 13px Slate Mid (#4a5568) in a 2-column micro-grid
- **No shadow at rest.** shadow-md appears only when the card animates in (200ms ease-out, opacity 0→1 + translateY 4px→0)

## 6. Do's and Don'ts

### Do:
- **Do** use Regulation Navy (#000666) for primary actions only — buttons, active links, active nav. Its rarity is its authority.
- **Do** pair every status (scan result, badge, chip) with color + icon + text. Never color alone.
- **Do** use 11px as the absolute minimum text size, with 600+ weight and high-contrast color (#4a5568 or darker).
- **Do** keep shadows off resting surfaces. Add shadow-sm only on hover or sticky; shadow-md only on modals/drawers.
- **Do** maintain 4.5:1 minimum contrast for body text and 3:1 for large text and UI components (WCAG 2.1 AA).
- **Do** use Roboto Mono for QR IDs, employee codes, and pass numbers — monospace signals machine-readable data.
- **Do** pad mobile body content 56px from the bottom to clear the fixed tab bar.

### Don't:
- **Don't** use rounded cards, soft gradients, pastel illustrations, or startup-template layouts. This is not a SaaS landing page.
- **Don't** make the system feel like a bootstrapped HR tool or a government legacy system. Precision is the target register, not austerity.
- **Don't** use `border-left` greater than 1px as a colored stripe accent on cards or list items. Use full borders, background tints, or leading status chips instead.
- **Don't** use gradient text (`background-clip: text`). Single solid color only. Emphasis through weight or size.
- **Don't** apply glassmorphism (backdrop-filter blur on decorative cards). Not this system.
- **Don't** use the hero-metric template (big number, small label, gradient accent) for dashboard stats. Use dense data rows with clear hierarchy.
- **Don't** use color alone to communicate scan results. A colorblind guard must read the outcome as fast as anyone else.
- **Don't** render text below 11px at any zoom level. Gate staff often use mobile in poor lighting.
- **Don't** add a shadow to a resting card. Flat-By-Default is a rule, not a suggestion.
