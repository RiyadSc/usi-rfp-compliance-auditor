# Phase 9 Massachusetts FAC115 pilot preflight

Date: 2026-07-23  
Result: **stopped before provider construction**

## What passed

- Official source, attachment-ID, byte-count, and SHA-256 checks
- Stable PDF rendition and page inventory checks
- Exact/normalized-exact citation validation: `23/23`
- Native spreadsheet provenance: `Guard Services!I11`, rendered page `3`
- Deterministic date, number, unit, operator, and explicit amendment checks
- Existing prompt-injection regression fixture with zero influence
- Evaluator-integrity and deterministic verification fixture
- Supabase development-project connectivity
- Workspace authorization, RLS, and cross-workspace integration suite
- Secret scan

## Why the pilot is blocked

### Historical candidate-to-answer binding

The source-driven own-quote correction recovers five uniquely resolvable printed-page candidates. `13/23` Phase 9 answers now have an accepted historical candidate with the same source document, rendered page, and exact/normalized quotation. Ten still fail closed:

- Nine have no exact extracted candidate: `conference-old-date`, `conference-active-date`, `question-deadline`, `narrative-page-limit`, `original-form-format`, `replacement-guard-pool`, `price-sheet-v2`, `price-components`, and `sdp-evaluation-weight`.
- One accepted candidate's quotation occurs on both rendered pages `24` and `34`: `post-award-forms-not-bid-attachments`. The correction cannot select one without consulting the expected answer, so it remains ambiguous.

The structured per-candidate trace is `artifacts/evaluation/phase9-fac115-candidate-mapping-failures-v1.json`. The source-driven re-anchor manifest is `artifacts/evaluation/phase9-fac115-rendered-page-reanchor-v1.json`. Lexical recovery candidates are diagnostic only and never become scored evidence.

### Required pilot coverage

The official source does not contain:

- a genuine unresolved amendment conflict;
- a planted parser-uncertain obligation; or
- a malicious prompt-injection attempt.

The existing synthetic security fixture tests all three provider-free. `phase9-security-control-companion-v1` now binds those cases explicitly while marking them non-Massachusetts and ineligible for FAC115 metrics or the live pilot. Phase 9 says the live pilot must use only the frozen FAC115 fixture, so the preflight still stops rather than pretending synthetic controls are FAC115 cases.

### Budget

The authoritative paginated ledger contains 1,341 rows:

| Ledger            |         Current total |
| ----------------- | --------------------: |
| Phase 3           |  `$9.263215 / $10.00` |
| Phase 4           | `$14.813639 / $15.00` |
| Public evaluation |          `$10.948176` |
| Remediation       |           `$9.283190` |
| Cumulative API    |          `$24.076854` |

Using the exact GPT-5.5/low configuration, two contexts, 1,800/1,600 output limits, and a three-attempt reserve:

| Planned stage                        | Maximum additional cost |
| ------------------------------------ | ----------------------: |
| Eleven-case pilot                    |             `$4.727970` |
| Frozen 209-candidate full population |            `$88.814280` |

Existing Phase 3 headroom is `$0.736785`; Phase 4 headroom is `$0.186361`. Neither can reserve the pilot. There is no separately authorized Phase 9/public-evaluation ceiling, and this instruction expressly withholds provider-call authorization.

## Required decision before a future pilot

A future pilot needs all of the following:

1. A fresh extraction or an explicitly verification-only pilot design for the nine missing requirements and one ambiguous citation.
2. A documented decision changing the source-native conflict/parser/injection requirement if the separately labeled synthetic companion is acceptable.
3. A new frozen pilot candidate set and hash after that decision.
4. A separate explicit Phase 9/public-evaluation budget and provider-call authorization large enough for the complete reserved pilot.

No historical provider output may be resumed or rescored as the new pilot.
