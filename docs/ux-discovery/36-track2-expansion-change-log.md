# Track 2 Expansion Change Log

**Authorization:** `35-track2-expansion-authorization.md`  
**Filter:** Gate in §Implementation Gate of authorization (no IA/nav/lifecycle redesign).  
**Validation:** Every entry may be revisited after Session 1; none claim ethnography.

Companion to baseline Track 2 ships in `29-track2-change-log.md` (UX-T2-001–003) and DX0 ships in `34-dx0-change-log.md`.

---

## UX-T2X-001 — Operator CTAs and boundary microcopy

| Field     | Value                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Screens   | Checklist generate · Proposal audit controls · Finding controls · Report controls                                                          |
| Rationale | Engineering verbs (“generate”, “run audit”) hide the operator job; CTAs should name the outcome and restate human boundary                 |
| Evidence  | `24` D01/D05/D09; UX-R04; `28` P1; Kerry/Justin HITL signals                                                                               |
| Decisions | D01, D05, D09                                                                                                                              |
| Benefit   | Faster recognition of next action; reduced over-trust of machine outcomes                                                                  |
| Session 1 | Confirm CTA wording matches how PMs name the work                                                                                          |
| Files     | `checklist/generate-button.tsx`, `proposal-audit/audit-controls.tsx`, `proposal-audit/finding-controls.tsx`, `reports/report-controls.tsx` |
| Status    | Shipped                                                                                                                                    |

## UX-T2X-002 — Operational-state operator labels

| Field     | Value                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Screens   | Shared notices (parser_uncertain and related)                               |
| Rationale | Status copy must say what the operator should do, not what the pipeline did |
| Evidence  | `25` L1 trust; UX-R09; accessibility of meaning                             |
| Decisions | D02, D16                                                                    |
| Benefit   | Lower ambiguity when documents or findings need attention                   |
| Session 1 | Check whether “needs manual review” is the phrase operators use             |
| Files     | `components/operational-state.tsx`, `lib/presentation.ts`                   |
| Status    | Shipped                                                                     |

## UX-T2X-003 — Review controls: JSON correction disclosure

| Field     | Value                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Screens   | Requirement review controls                                                 |
| Rationale | Advanced correction fields competed with the primary accept/reject decision |
| Evidence  | Cognitive load; `25` L2 vs L4; `28` P1                                      |
| Decisions | D01, D05                                                                    |
| Benefit   | Primary decision is visually dominant; analyst tooling remains available    |
| Session 1 | Confirm analysts still find correction path without training                |
| Files     | `requirements/review-controls.tsx`                                          |
| Status    | Shipped                                                                     |

## UX-T2X-004 — Checklist and reports empty states

| Field     | Value                                                            |
| --------- | ---------------------------------------------------------------- |
| Screens   | Checklist list · Workspace reports list                          |
| Rationale | Empty states must educate and route to the next justified action |
| Evidence  | Empty-state checklist in authorization; UX-R14                   |
| Decisions | D09, D02                                                         |
| Benefit   | First-time users know why the screen is empty and what to do     |
| Session 1 | Observe recovery path when list is empty mid-bid                 |
| Files     | `checklist/page.tsx`, `reports/page.tsx`                         |
| Status    | Shipped                                                          |

## UX-T2X-005 — Requirement detail trust labeling

| Field     | Value                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------- |
| Screens   | Requirement detail                                                                                |
| Rationale | “Machine assessment” mislabeled team review status; breadcrumb used engineering register language |
| Evidence  | Trust / machine vs human distinction; `24` D01                                                    |
| Decisions | D01, D05                                                                                          |
| Benefit   | Clearer human vs machine boundary; orientation                                                    |
| Session 1 | Confirm “Team review status” matches mental model                                                 |
| Files     | `requirements/[requirementId]/page.tsx`                                                           |
| Status    | Shipped                                                                                           |

## UX-T2X-006 — Document detail orientation and reading language

| Field     | Value                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| Screens   | Document detail · Parse poller                                                          |
| Rationale | Missing workspace nav; “asynchronous parsing” / “parser warnings” are pipeline language |
| Evidence  | Orientation checklist; content design; `27` documents gap                               |
| Decisions | D02, D16                                                                                |
| Benefit   | Users know where they are and what waiting means                                        |
| Session 1 | Confirm “reading the document” is preferred over “processing”                           |
| Files     | `documents/[documentId]/page.tsx`, `parse-status-poller.tsx`                            |
| Status    | Shipped                                                                                 |

## UX-T2X-007 — Analysis run orientation

| Field     | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| Screens   | Analysis run detail                                               |
| Rationale | Page lacked workspace nav and used extraction-engineering framing |
| Evidence  | Orientation; executive 2-minute comprehension                     |
| Decisions | D09                                                               |
| Benefit   | Stakeholders can place the run in the bid workflow                |
| Session 1 | Check whether Live Analysis vs extraction naming confuses         |
| Files     | `analysis/[runId]/page.tsx`                                       |
| Status    | Shipped                                                           |

## UX-T2X-008 — Documents upload truthfulness

| Field     | Value                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------- |
| Screens   | Documents list · Upload form                                                                   |
| Rationale | UI said “PDF only” while multi-format upload is supported; “Primary RFP” → operator “Main RFP” |
| Evidence  | Consistency; trust; forms checklist                                                            |
| Decisions | D02                                                                                            |
| Benefit   | Fewer failed uploads; aligned terminology with Overview                                        |
| Session 1 | Confirm preferred label Main vs Primary                                                        |
| Files     | `documents/page.tsx`, `documents/upload-form.tsx`                                              |
| Status    | Shipped                                                                                        |

## UX-T2X-009 — Global search discoverability

| Field     | Value                                                                   |
| --------- | ----------------------------------------------------------------------- |
| Screens   | App header (all authenticated pages)                                    |
| Rationale | Search hidden below `xl` removed a core account action on laptop widths |
| Evidence  | Discoverability; authorization accessibility / responsive               |
| Decisions | Efficiency / discoverability                                            |
| Benefit   | Search available without relying on route knowledge                     |
| Session 1 | Observe whether header search is used vs page search                    |
| Files     | `components/app-header.tsx`                                             |
| Status    | Shipped                                                                 |

## UX-T2X-010 — StatusAxis visible help (a11y)

| Field     | Value                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| Screens   | Checklist item · any StatusAxis consumer                                                |
| Rationale | Help lived only in `title` tooltips — invisible to keyboard / SR users and easy to miss |
| Evidence  | Accessibility standards; decision support                                               |
| Decisions | D02, D16                                                                                |
| Benefit   | Status meaning is always readable                                                       |
| Session 1 | Check density tolerance for always-visible help                                         |
| Files     | `components/status-badge.tsx`                                                           |
| Status    | Shipped                                                                                 |

## UX-T2X-011 — Checklist item operator language

| Field     | Value                                                                |
| --------- | -------------------------------------------------------------------- |
| Screens   | Checklist item detail                                                |
| Rationale | “Deterministic”, “Phase 4” leaked engineering into due/evidence copy |
| Evidence  | Content design; consistency with DX0 operator ledes                  |
| Decisions | D02, D09                                                             |
| Benefit   | Task purpose readable without phase knowledge                        |
| Session 1 | Confirm “linked requirement” is sufficient without phase numbers     |
| Files     | `checklist/[itemId]/page.tsx`                                        |
| Status    | Shipped                                                              |

## UX-T2X-012 — Extraction mode and account surfaces

| Field     | Value                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Screens   | Start extraction · My Work · Account Reports · Search empty · Home                                                 |
| Rationale | “No provider” / static “Good morning” / weak empties / Clear resetting opportunities view                          |
| Evidence  | Comprehension; consistency; authorization empty/loading checklists                                                 |
| Decisions | D09; resume moments                                                                                                |
| Benefit   | Time-aware greeting; clearer why-here; Clear preserves opportunities mode; extraction options in operator terms    |
| Session 1 | Greeting + My Work “why here” wording                                                                              |
| Files     | `documents/.../start-extraction-button.tsx`, `my-work/page.tsx`, `reports/page.tsx`, `search/page.tsx`, `page.tsx` |
| Status    | Shipped                                                                                                            |

## UX-T2X-013 — Overview / demo chrome language

| Field     | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| Screens   | Overview next-action note · Demo entry CTA                                               |
| Rationale | “Phase 9 findings” / “deterministic report” are internal names on operator-facing chrome |
| Evidence  | Terminology consistency; DX0 Final Review naming                                         |
| Decisions | D09                                                                                      |
| Benefit   | Same concepts named the same way across nav and chrome                                   |
| Session 1 | Live Analysis naming stress-test                                                         |
| Files     | `w/[workspaceId]/page.tsx`, `demo/page.tsx`                                              |
| Status    | Shipped                                                                                  |

---

## Held (still gated)

- Global navigation redesign / IA changes
- Lifecycle or opportunity-model changes
- Collapsing status axes / mental-model redesign
- Demo-only fixture fingerprint chrome (kept for rehearsal truth)
- Spend-ceiling error strings that reference phase budgets (ops truth for cost gates)

## Prior baseline (do not renumber)

UX-T2-001–003 remain in `29-track2-change-log.md`.
