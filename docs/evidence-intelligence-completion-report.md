# Evidence Intelligence — completion report

Visual redesign of the RFP Compliance Auditor UI. Presentation only.

## 1. Executive summary

The product now uses a single dark **Evidence Intelligence** visual language: near-black analytical canvas, mist primary actions, teal affordances, steel proposal-side cues, and coral reserved for true blockers. Shared tokens and primitives in `apps/web/src/app/globals.css` drive every route. Backend logic, routes, RLS, providers, and workflows are unchanged.

## 2. Inspiration synthesis

Combined three directional qualities without copying branded assets:

1. Premium brand board — extreme black/mist contrast, rounded modules, breathing room, controlled brand moments.
2. Dark intelligence map — atmospheric depth, thin technical lines, selective coral alerts, quiet peripheral data.
3. Editorial generative composition — one bold focal point, restrained texture, occasional serif accent, confident whitespace.

## 3. Original visual problems

- Light generic SaaS/admin template look across most screens.
- Inconsistent colour (default Tailwind slate/blue/red) and competing emphasis.
- Weak brand presence; sign-in was an unbranded form.
- Tables and evidence lacked a distinctive, precise treatment.
- Dense screens felt like developer consoles rather than executive decision tools.

## 4. Final visual direction

Dark analytical space with selective emphasis. Evidence quotations and locators are the most distinctive surfaces. Texture and hero atmosphere appear only on sign-in, overview, empty states, and report covers.

## 5. Brand motif

**Four converging document corners enclosing a single evidence node** (`BrandMark`, favicon `app/icon.svg`). Used sparingly for logo, loading, empty states, report/sign-in moments. Not used as a generic icon.

## 6. Colour system

Documented in `docs/design-system.md` and implemented under `@theme` in `globals.css`. Default Tailwind palette cleared so legacy utilities emit no CSS.

## 7. Typography

Inter for functional UI; Instrument Serif for rare editorial accents; system monospace for IDs and page locators. Roles: display, page title, section, body, table, metadata, micro.

## 8. Layout

`page-shell` padding (16–40px), 4px spacing scale, card padding 20–24px, table cells 12–16px. Hero panels limited to brand moments.

## 9. Navigation

Global header restyled with brand lockup and quiet active states. Workspace stage nav uses a compact rail with `aria-current`. Destinations and order unchanged.

## 10. Components

See `docs/evidence-intelligence-component-inventory.md`.

## 11. Tables

`data-frame` / `data-scroll` / `data-table`: sticky micro headers, horizontal dividers only, hover/selected states, cell hierarchy (`cell-primary`, `cell-numeric`).

## 12. Evidence viewer

Dark surround, `paper-surface` pages, translucent `evidence-highlight` variants, `evidence-quote` / proposal / conflict rails, `locator` page links.

## 13. Checklist

Blocking group uses coral rail cues; completed items recede; filters and generate action preserved.

## 14. Proposal review

Finding cards with severity left rails; RFP (teal) vs proposal (steel) quotes; coral only on severity/conflict accents.

## 15. Reports

Executive metric summary, polished tables, quiet export controls, provenance in secondary `surface-panel`.

## 16. Responsive behaviour

Desktop (1440) and laptop (1280) captures under `artifacts/design/after/`. Toolbars wrap; drawers/tables scroll horizontally where needed. Existing mobile behaviour preserved where present.

## 17. Accessibility

Focus rings (teal), skip link, status glyphs, labelled icon controls, `aria-live` operational notices, `prefers-reduced-motion` honoured. No certification claimed.

## 18. Performance impact

No new animation libraries, images, or canvas. Texture via CSS/SVG data URLs. Fonts self-hosted via `next/font`. Production build succeeded.

## 19. Visual-regression results

Captured with `scripts/capture-design-screens.mts` using Phase 8 synthetic fixtures only:

- Before: `artifacts/design/before/` (23 screens)
- After desktop + laptop: `artifacts/design/after/`
- Inventories: visual / screen / before-after docs in `docs/`

## 20. Functional-regression results

| Gate                       | Result                                     |
| -------------------------- | ------------------------------------------ |
| `npm run typecheck`        | pass                                       |
| `npm run lint`             | pass                                       |
| `npm run test:unit`        | pass (34 files / 397 tests)                |
| `npm run build`            | pass                                       |
| Prettier on redesign files | pass                                       |
| `@demo-critical`           | pass (localhost:3100, providers off, ~35s) |
| Backend migrations         | none added                                 |
| Live provider calls        | none enabled for redesign work             |

Presentation-tied Playwright selectors were adjusted only where heading substring matching became ambiguous (`exact: true`) and where an ephemeral client status is cleared by existing `revalidatePath` (assert durable `resolution-history` instead). Behavior expectations are unchanged.

## 21. Files changed

Primary:

- `apps/web/src/app/globals.css` — tokens + component layer
- `apps/web/src/app/layout.tsx` — Inter + Instrument Serif, demo strip
- `apps/web/src/app/icon.svg`, `components/brand.tsx`, `components/icons.tsx`
- All listed `apps/web/src/app/**/page.tsx` and control components in git status
- Shared chrome: `app-header`, `workspace-navigation`, `status-badge`, `operational-state`, `view-mode-toggle`
- `vitest.config.unit.ts` — `@` alias + automatic JSX for component tests
- `scripts/capture-design-screens.mts`
- Docs under `docs/design-system.md` and `docs/evidence-intelligence-*.md`
- Artifacts under `artifacts/design/`

## 22. Git commit hashes

- `2caa35bac5f0e91305a1243ccbf57638c62f976b` — design system foundations
- `0e37f3ed0f42f241238a54c57804fa4beefadcbe` — product surface restyle
- `bdbe13ae13e4c4222b0f7b4d44d4827ef9494692` — docs and visual artifacts

Tip of the redesign series (includes this completion-report hash note): see `git log --oneline --grep='Evidence Intelligence'`.

## 23. Clean-worktree confirmation

Confirmed (`git status` clean after the commits above).

## 24. Backend and UX behaviour

**Explicit statement:** No backend schema, RLS, API contracts, server-action logic, routes, authentication, permissions, status meanings, filters, sorting, search behaviour, report generation, exports, document processing, provider logic, AI pipeline, evidence persistence, or test fixtures were changed for product behaviour. Tests were updated only where presentation imports required Vitest path/JSX resolution. Selectors tied to business behaviour remain intact.

---

Supporting docs:

- `docs/design-system.md`
- `docs/evidence-intelligence-visual-inventory.md`
- `docs/evidence-intelligence-component-inventory.md`
- `docs/evidence-intelligence-screen-inventory.md`
- `docs/evidence-intelligence-before-after.md`
