# Role-Based UX Implementation Plan

## Sequence

1. Introduce a shared application header, five-item global navigation, role-view preference, versioned terminology map, help/glossary, and common page/metric/action primitives.
2. Separate Home from Opportunities; add My Work and authorized grouped Search using existing RLS-protected reads.
3. Reframe the opportunity overview around six executive signals, top-three issues, one next action, and a nine-step guided workflow.
4. Simplify Requirements, Submission Checklist, Proposal Review, Documents, and Reports while preserving their existing server actions and immutable evidence links.
5. Add persona-tagged workflows, accessibility/responsive checks, and fifteen stable visual-regression views using deterministic/mock data only.
6. Run repository gates, update architecture/testing/runbooks/risks/assumptions/build status, and commit the presentation, tests, and documentation separately.

## Data and migration plan

No migration is planned. Home, My Work, Search, summaries, saved URL views, and role presentation can be derived from existing workspace-scoped tables. This avoids changing stable Phase 4–8 interfaces. A future persistent profile/view-preference migration is explicitly out of scope; the current role view is an accessible local presentation preference and never grants permissions.

## Key risks

- Dense source records may still require horizontal tables on narrow screens; mobile renders action cards or compact rows where practical.
- Workspace membership lacks display-name profiles, so the UI continues to use safe team labels rather than UUIDs.
- Search is intentionally bounded and exact/substring based; it is not a new semantic or AI search system.
- Visual regression uses prepared synthetic fixtures and cannot certify every customer document layout.

## Test strategy

- Unit tests for terminology, persona views, navigation limits, business status copy, and prohibited language.
- Existing integration/RLS suites unchanged plus service-level query authorization exercised through pages.
- Persona Playwright scenarios tagged `@ux-director`, `@ux-proposal-manager`, `@ux-contributor`, and `@ux-admin`.
- Fifteen screenshots across Home, Opportunities, My Work, Search, Overview, Documents, Requirements, Requirement detail, Checklist, Checklist detail, Proposal Review, Audit detail, Reports, Report detail, and prepared demo.
- Preserve and rerun `@demo-critical`, all mock browser specs, lint, formatting, type-check, production build, dependency/secret scans, and invariant checks.
