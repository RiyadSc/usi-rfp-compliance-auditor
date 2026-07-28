# Track 2 Change Log

**Filter:** Decision ID + evidence + success measure required.  
**Also answer:** Which decision? What evidence? How will we know?

---

## UX-T2-001 — Overview Level-1 metric order + blocker-first next action

| Field             | Value                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Decision improved | D09, D02; resume moment (what is risky / needs action)                                                                     |
| Evidence          | `25` L1; `27` Overview gap; UX-R14                                                                                         |
| Success measure   | First health metrics are blockers/judgment/proof; next action prefers open blockers over uncertain sources when both exist |
| Files             | `apps/web/src/app/w/[workspaceId]/page.tsx`                                                                                |
| Status            | Shipped                                                                                                                    |

## UX-T2-002 — Requirement review decision microcopy

| Field             | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Decision improved | D01, D05 (accept ≠ submit/compliant)                                                              |
| Evidence          | UX-R04, UX-R09; `24` D01/D05; `28` P1                                                             |
| Success measure   | Decision form states recording a team assessment does not authorize submission or mean compliance |
| Files             | `apps/web/src/app/w/[workspaceId]/requirements/review-controls.tsx`                               |
| Status            | Shipped                                                                                           |

## UX-T2-003 — Report briefing staleness cue

| Field             | Value                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| Decision improved | D09, D16                                                                              |
| Evidence          | UX-R12; `28` P3; `27` report gap                                                      |
| Success measure   | Notice when human_review_decisions or proposal resolutions exist after `generated_at` |
| Files             | `apps/web/src/app/w/[workspaceId]/reports/[reportId]/page.tsx`                        |
| Status            | Shipped                                                                               |

---

Held (not in this batch): Live Analysis nav demotion, full resume module, IA renames, major dashboard redesign.
