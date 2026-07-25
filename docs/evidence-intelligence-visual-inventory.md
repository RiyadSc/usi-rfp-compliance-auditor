# Evidence Intelligence — visual inventory

Presentation-only inventory of every application surface against the redesign.
Routes, server actions, permissions, and workflows are unchanged.

Status key: **done** = restyled to tokens/primitives; **n/a** = redirect or no UI.

| Route                             | Primary components                                    | Styling source       | Treatment                               | Shared primitives                       | A11y notes                  | Regression risk     |
| --------------------------------- | ----------------------------------------------------- | -------------------- | --------------------------------------- | --------------------------------------- | --------------------------- | ------------------- |
| `/login`                          | `login/page.tsx`, Brand*                              | `globals.css` + page | Editorial split hero + sign-in card     | hero texture, BrandSeal, primary-action | Form labels, alert on error | Low — auth only     |
| `/`                               | `page.tsx`, AppHeader                                 | tokens + page        | Home command center + opportunity cards | hero-panel, metric-card, surface-card   | Role view announced         | Medium — dense home |
| `/opportunities`                  | redirect → `/?view=opportunities`                     | n/a                  | n/a                                     | —                                       | —                           | None                |
| `/my-work`                        | `my-work/page.tsx`                                    | tokens + page        | Priority task list + empty art          | empty-state, surface-card               | Status badges with glyphs   | Low                 |
| `/search`                         | `search/page.tsx`                                     | tokens + page        | Search field + result list/empty        | search-field, empty-state               | Search landmark             | Low                 |
| `/reports`                        | `reports/page.tsx`                                    | tokens + page        | Global report index                     | surface-card, StatusBadge               | —                           | Low                 |
| `/w/[id]`                         | overview `page.tsx`                                   | tokens + page        | Hero summary + metrics + journey        | hero-panel, metric-card, stage-nav      | Breadcrumb, stage nav       | Medium              |
| `/w/[id]/documents`               | documents `page.tsx`, upload-form                     | tokens               | Document list + upload                  | data-frame / surface-card               | File input labeled          | Medium              |
| `/w/[id]/documents/[docId]`       | document detail, processing-panel, delete, extraction | tokens               | Detail + processing mark                | notice*, EvidenceProcessingMark         | aria-live pollers           | Medium              |
| `/w/[id]/documents/[docId]?page=` | page-viewer                                           | tokens               | Dark surround + paper page + highlight  | paper-surface, evidence-highlight       | Page controls named         | High — viewer       |
| `/w/[id]/requirements`            | requirements register                                 | tokens               | Evidence matrix table                   | data-table, filter-bar, chip            | Sticky headers, filters     | High — table        |
| `/w/[id]/requirements/[reqId]`    | requirement detail, review-controls                   | tokens               | Evidence brief + axes                   | evidence-quote, locator, StatusAxis     | Decision controls labeled   | High                |
| `/w/[id]/checklist`               | checklist page, generate-button                       | tokens               | Grouped blockers + quiet completed      | rail-critical, surface-card             | Group headings              | High                |
| `/w/[id]/checklist/[itemId]`      | item detail, item-controls                            | tokens               | Item brief + assignment                 | evidence-quote, forms                   | Form errors                 | Medium              |
| `/w/[id]/proposal-audit`          | proposal list + audit-controls                        | tokens               | Draft audit entry                       | surface-card, primary-action            | —                           | Medium              |
| `/w/[id]/proposal-audit/[runId]`  | findings + finding-controls                           | tokens               | Finding cards, dual quotes              | evidence-quote(-proposal), locator      | Decision history            | High                |
| `/w/[id]/reports`                 | reports index + report-controls                       | tokens               | Snapshot list + export controls         | surface-card, secondary-action          | Expiry states               | Medium              |
| `/w/[id]/reports/[reportId]`      | report detail                                         | tokens               | Executive brief + tables                | data-table, metric-card, surface-panel  | Provenance secondary        | High                |
| `/w/[id]/phase9`                  | phase9 page                                           | tokens               | Controlled analysis coverage            | metric-card, evidence-quote, chip       | Cost metadata secondary     | Medium              |
| `/w/[id]/demo`                    | demo page + demo-actions                              | tokens               | Guided demo walkthrough                 | hero-panel, stage-nav, action-link      | data-testid preserved       | Medium              |
| `/w/[id]/analysis/[runId]`        | analysis run                                          | tokens               | Candidate extraction status             | notice*, evidence-quote, locator        | Poller aria-live            | Medium              |
| `not-found`                       | `not-found.tsx`                                       | tokens               | Calm unavailable state                  | empty-state                             | Neutral denial              | Low                 |
| Global chrome                     | AppHeader, WorkspaceNavigation                        | tokens               | Brand lockup, global + stage nav        | BrandLockup, global-nav-link, stage-nav | aria-current                | Medium              |
| Status / ops                      | StatusBadge, OperationalStateNotice                   | tokens               | Glyph + colour status; calm notices     | badge*, notice*                         | Never colour-only           | Low                 |
| Brand / icons                     | brand.tsx, icons.tsx, icon.svg                        | SVG                  | Mark + outline icon family              | BrandMark, EmptyStateArt                | Decorative aria-hidden      | Low                 |

## Inconsistencies resolved

- Cleared default Tailwind palette so legacy `slate`/`blue`/`red` utilities emit no CSS.
- Replaced light “admin template” pages (Phase 9, demo, analysis, report tails) with shared dark surfaces.
- Unified buttons/forms/tables/badges onto named component classes in `globals.css`.
- Favicon and brand mark now share the four-corner evidence-node motif.

## Screenshot references

- Before: `artifacts/design/before/`
- After (desktop + laptop): `artifacts/design/after/`
- Capture: `node --import tsx scripts/capture-design-screens.mts --out artifacts/design/after`
