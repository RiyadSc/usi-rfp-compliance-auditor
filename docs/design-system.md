# Evidence Intelligence — design system

The visual language for the RFP Compliance Auditor. This document is the source of truth for
tokens, primitives, and the rules that keep every screen coherent.

It is a **presentation** system only. Nothing here changes routes, server actions, permissions,
state machines, business rules, or copy.

---

## 1. Design philosophy

The product supports high-stakes decisions on public procurement responses. The interface must feel
like a controlled intelligence system: dark analytical space, precise evidence, illuminated
relationships, structured confidence, and calm decision support.

Five operating principles:

1. **Selective emphasis.** Most of the interface is neutral. Colour is spent only on priority and
   state. If everything is emphasised, nothing is.
2. **Evidence is the hero.** Quotations, page locators, and source links get the most distinctive
   surface treatment in the product.
3. **Consequential, not decorative.** Texture, gradient, and motion appear only where they carry
   meaning or mark a brand moment.
4. **Calm density.** Operational screens are information-dense but quiet: thin borders, generous
   row height, one accent per row.
5. **Never colour alone.** Every status carries a shape, icon, or text label in addition to hue.

---

## 2. Colour tokens

All colour lives in `apps/web/src/app/globals.css` under `@theme`. The default Tailwind palette is
**cleared** (`--color-*: initial`), so `bg-slate-200`, `text-blue-700`, and friends generate no CSS.
This is deliberate: it makes legacy styling greppable and prevents drift.

### Canvas — the page floor

| Token        | Value     | Use                          |
| ------------ | --------- | ---------------------------- |
| `canvas-950` | `#0b0d0d` | Body background              |
| `canvas-900` | `#101313` | Sticky headers, table header |
| `canvas-850` | `#141818` | Input surfaces               |
| `canvas-800` | `#192020` | Focused input, tooltip       |

### Surface — elevated content

| Token         | Value     | Use                         |
| ------------- | --------- | --------------------------- |
| `surface-900` | `#111515` | Panels, table body, drawers |
| `surface-850` | `#171c1d` | Standard card, dialog       |
| `surface-800` | `#1d2425` | Secondary button, badge     |
| `surface-750` | `#242c2d` | Hover on secondary button   |

### Mist — light surfaces and primary action

`mist-50 #f4f7f7` · `mist-100 #e8eff0` · `mist-200 #d4e0e1` · `mist-300 #b8cacc`

Primary buttons are `mist-200` with `onlight` text; hover lifts to `mist-50`.

### Brand teal — evidence and affordance

`teal-300 #9bbdba` · `teal-400 #7fa7a5` · `teal-500 #608b89` · `teal-600 #466f6e`

Used for links, focus rings, evidence accents, progress, and the brand mark.

### Steel — the proposal side and quiet data

`steel-300 #95a9ae` · `steel-400 #738a90` · `steel-500 #587178` · `steel-600 #405b62`

### Text

| Token                           | Value     | Use                              |
| ------------------------------- | --------- | -------------------------------- |
| `ink`                           | `#f3f6f6` | Primary text                     |
| `ink-soft`                      | `#b9c4c5` | Body, secondary text             |
| `ink-muted`                     | `#7f8d8e` | Metadata, labels                 |
| `ink-faint`                     | `#586263` | Disabled, placeholder            |
| `onlight`                       | `#111414` | Text on mist and paper           |
| `onlight-soft`, `onlight-muted` |           | Secondary text on light surfaces |

### Semantic state

| Family     | Shades          | Reserved for                                                                   |
| ---------- | --------------- | ------------------------------------------------------------------------------ |
| `critical` | 400 / 500 / 600 | True blockers, destructive actions, failed processing, conflicts, urgent dates |
| `warning`  | 400 / 500 / 600 | Needs review, uncertainty, follow-up, near deadlines                           |
| `success`  | 400 / 500 / 600 | Completed **workflow** states only — never "compliant"                         |
| `info`     | 400 / 500 / 600 | In progress, informational, cached/prepared modes                              |

**Coral discipline.** Coral is the only high-attention colour. It marks the specific conflicting
value, not the whole panel. Never tint an entire comparison or page with it.

**Green discipline.** Green means a task finished, never that an obligation is legally satisfied.

### Paper — document and report surfaces

`paper-50 #f8f8f6` · `paper-100 #eeeeea` · `paper-200 #dcdcd6` · `paper-ink #16191a`

Document pages and printable report bodies stay light so scanned source material reads correctly.

### Lines

`line-subtle` (0.08 alpha) · `line-default` (0.14) · `line-strong` (0.26) · `line-onlight`

Structure comes from thin borders, not shadows.

---

## 3. Typography

| Role          | Class            | Spec                                                      |
| ------------- | ---------------- | --------------------------------------------------------- |
| Display       | `.display-title` | `clamp(2.2rem, 4vw, 4.75rem)` / 0.94 / `-0.045em` / 500   |
| Page title    | `.page-title`    | `clamp(1.75rem, 2.4vw, 2.6rem)` / 1.05 / `-0.035em` / 550 |
| Section title | `.section-title` | `1.05rem` / 1.25 / 600                                    |
| Body          | body default     | `0.9375rem` / 1.55                                        |
| Table text    | `.data-table`    | `0.8125rem` / 1.45                                        |
| Metadata      | `.text-metadata` | `0.75rem` / 1.35                                          |
| Micro label   | `.text-micro`    | `0.6875rem` uppercase, tracked — short labels only        |

Families: **Inter** (`--font-sans`) for all functional UI, **Instrument Serif** (`--font-serif`) for
editorial accents only, and the system monospace stack (`--font-mono`) for IDs, hashes, and page
locators. Both webfonts are self-hosted by `next/font`, so there is no runtime third-party request.

Nothing essential renders below `11px`. Use `.mono` / `.tabular` for aligned numerals.

**Serif is allowed only** in a display headline accent (`.display-accent`), a report-cover
statement, a meaningful empty-state phrase, or the evidence quotation mark. Never in tables,
navigation, forms, badges, or dense screens.

---

## 4. Spacing, radius, depth

Spacing is the default 4px scale: `4 8 12 16 20 24 32 40 48 64 80`.

- Page padding: `.page-shell` → 24px mobile, 40px desktop
- Card padding: 20–24px (`p-5` / `p-6`)
- Table cells: 16px horizontal, 14px vertical
- Section rhythm: 32–48px

Radius: `--radius-xs 6px` · `sm 9px` · `md 13px` · `lg 18px` · `xl 24px` · `rounded-full` for pills.
Buttons and inputs use `rounded-sm`; cards and tables `rounded-lg`; hero surfaces `rounded-xl`.
Small controls are not pill-shaped.

Depth: `shadow-card` for standard cards, `shadow-raised` for hero/major panels, `shadow-overlay` for
dialogs and drawers, `shadow-paper` for document pages. Hover raises a card by **1px** at most.

---

## 5. Component vocabulary

Use these classes rather than re-deriving styles inline. All are defined in `globals.css`
under `@layer components`, so Tailwind utilities still override them.

### Layout

`.page-shell` `.page-shell-narrow` `.page-header` `.page-eyebrow` `.page-title` `.page-lede`
`.page-actions` `.section-kicker` `.section-title` `.section-lede` `.text-metadata` `.text-micro`
`.mono` `.tabular`

### Surfaces

| Class             | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `.surface-card`   | Standard card. Add `.surface-card-interactive` when clickable              |
| `.surface-panel`  | Quieter grouped panel                                                      |
| `.surface-inset`  | Recessed area inside a card                                                |
| `.surface-raised` | Elevated secondary surface                                                 |
| `.hero-panel`     | Editorial hero with atmosphere. Sign-in, first-run, overview, reports only |
| `.paper-surface`  | Light document / printable report body                                     |

### Buttons

`.primary-action` (mist fill, dark text) · `.secondary-action` (dark surface, border) ·
`.tertiary-action` (transparent) · `.danger-action` (coral outline). Sizes: `.btn-sm` 32px, default
38px, `.btn-lg` 44px. One primary action per view. Icon-only buttons require an accessible name.

Links: `.action-link` for forward navigation, `.quiet-link` for secondary.

### Status

`.badge` plus `.badge-neutral` `.badge-info` `.badge-positive` `.badge-warning` `.badge-danger`.
Always rendered through `<StatusBadge>`, which adds a tone glyph so status is never colour-only.

`.notice` plus `.notice-critical` `.notice-warning` `.notice-info`, with `.notice-title` for the
heading row. `.rail-critical` / `.rail-warning` / `.rail-teal` / `.rail-steel` add a 2px left rail
as a redundant, non-colour cue.

### Metrics

`.metric-card` `.metric-label` `.metric-value` `.metric-note`. One value, one supporting line. No
decorative chart unless the data warrants it.

### Tables

```
.data-frame          outer container, clipped corners
  .data-scroll       horizontal scroll region
    .data-table      the table (thead/tbody styled by descendant rules)
```

Header cells are sticky, 11px, uppercase, tracked. Rows get a top border only — no zebra striping,
no vertical grid lines. `.cell-primary` for the identifying column, `.cell-numeric` for right
aligned tabular figures, `.row-selected` for selection, `.data-table-dense` for deliberately
technical tables. One badge and at most one metadata line per cell.

### Forms

`.field` `.field-label` `.field-hint` `.field-error` `.filter-bar` `.chip` / `.chip-active`
`.search-field`.

Native `input`, `select`, and `textarea` are styled at the element level in `@layer base`, so no
form control anywhere can fall back to the light user-agent appearance. Focus ring:
`0 0 0 1px teal-300, 0 0 0 4px rgba(155,189,186,.14)`; the error ring swaps in coral.

### Evidence

| Class                      | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `.evidence-card`           | Mist-toned evidence surface                          |
| `.evidence-quote`          | Exact quotation, teal rail, quotation-mark motif     |
| `.evidence-quote-conflict` | Quotation containing the conflict (coral rail)       |
| `.evidence-quote-proposal` | Proposal-side quotation (steel rail)                 |
| `.locator`                 | `RFP · Page 118` — monospace, tabular, clickable     |
| `.evidence-highlight`      | In-page highlight; `-critical` / `-warning` variants |

### Overlays and disclosure

`.dialog-surface` `.drawer-surface` `.menu-surface` `.tooltip-surface` `.disclosure` +
`.disclosure-body` (styled `<details>` with a chevron that rotates on open).

Drawer widths: compact details 420–480px, evidence 520–640px, complex review 640–760px; full width
on small screens.

### Progress

`.progress-track` + `.progress-fill` (`-critical`, `-warning`), or `.stage-track` +
`.stage-segment` (`-done`, `-active`) for staged work. Numeric labels accompany bars. Progress never
implies compliance.

### Empty and loading

`.empty-state` `.empty-state-title` `.empty-state-body`, with `<EmptyStateArt>` for artwork.
`.skeleton` matches final layout geometry. `.reveal` for panel entry, `.pulse-once` for
newly-opened evidence.

### Texture

`.texture-nodes` (evidence-node grid) · `.texture-halftone` · `.texture-grid`. Each renders through
`::before`, so the host element needs `relative` and `overflow-hidden`.

Permitted only on: authentication, empty states, large hero summary panels, loading screens, report
cover previews. **Never behind dense tables.**

---

## 6. Brand motif

An original mark: **four converging document corners enclosing a single evidence node**. It reads as
a verification seal, is legible at favicon size, monochrome-compatible, and animatable.

Components in `apps/web/src/components/brand.tsx`:

- `BrandMark` — the mark, inherits `currentColor`
- `BrandLockup` — mark plus product name for headers
- `BrandSeal` — oversized editorial treatment with a node halo
- `EvidenceProcessingMark` — corners settle inward in sequence during processing (not a spinner)
- `EvidenceField` — node-and-link constellation for hero surfaces
- `EmptyStateArt` — corners around an absent node

Used sparingly: logo, favicon (`app/icon.svg`), loading, empty states, report covers, sign-in, and
subtle background texture. The mark is never used as a generic icon.

---

## 7. Iconography

One family only: `apps/web/src/components/icons.tsx`. 24×24 viewBox, 1.6 stroke, round caps and
joins, minimal interior detail, sized at 14/15/16/18/20px. Icons are `aria-hidden` by default; pass
`title` only when the icon is the sole label for a control.

Do not mix in emoji, filled Material glyphs, or a second icon library.

---

## 8. Motion

| Interaction        | Duration |
| ------------------ | -------- |
| Micro              | 120ms    |
| Control transition | 160ms    |
| Panel transition   | 210ms    |
| Route transition   | 260ms    |

Easing is always `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease`, `ease-precise`).

Motion is permitted for revealing panels, opening dialogs, tab transitions, highlighting newly
opened evidence, status updates, loading, and confirming completion. No bouncing, elastic motion,
long fades, rotating brand marks, parallax, or animated gradients. `prefers-reduced-motion` disables
animation and the card hover lift.

---

## 9. Accessibility requirements

- Body text meets WCAG AA on its surface: `ink` and `ink-soft` on canvas/surface exceed 7:1 and
  4.5:1; `ink-muted` is reserved for metadata at 12px+ and clears 4.5:1 on `canvas-950`.
- Focus is visible everywhere: 2px `teal-300` outline with 2px offset, plus the input focus ring.
  Outlines are never removed.
- Status is communicated by icon or shape as well as colour.
- Icon-only controls carry an accessible name; decorative SVG is `aria-hidden`.
- Semantic HTML is preserved: real headings, `<table>` with `<th scope>`, labels bound to controls,
  `aria-live` regions for operational states, `aria-current` for navigation.
- Tap targets stay at least 44px on touch layouts.
- Reduced motion is honoured globally.

---

## 10. Rules of the road

1. Never introduce a raw hex value in a component. Add or use a token.
2. Never use a cleared palette utility (`slate`, `blue`, `red`, `emerald`, `amber`, …). CI-style
   grep: `rg -o '\b(?:bg|text|border|divide|ring)-(?:slate|gray|blue|red|amber|emerald|…)-\d'`
   must return nothing under `apps/web/src`.
3. Don't put texture behind tables, or gradients on every card.
4. Don't stack four badges, three metadata lines, and five icons in one cell.
5. Don't add copy. Restyle what exists.
6. One primary action per view.
7. Every interactive element needs hover, focus, active, and disabled states.
