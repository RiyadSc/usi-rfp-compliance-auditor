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

Only `8/23` Phase 9 answers have an accepted historical candidate with the same source document, rendered page, and exact/normalized quotation. Fifteen fail closed:

- Nine have no exact extracted candidate: `conference-old-date`, `conference-active-date`, `question-deadline`, `narrative-page-limit`, `original-form-format`, `replacement-guard-pool`, `price-sheet-v2`, `price-components`, and `sdp-evaluation-weight`.
- Five were extracted using the RFR's printed internal page label and then correctly rejected by the rendered-page quote gate: `security-company-experience`, `watch-guard-license-attachment`, `armed-personnel-license`, `references-three-to-five`, and `geographic-coverage`.
- One accepted candidate uses printed page `34` while the frozen citation is rendered page `24`: `post-award-forms-not-bid-attachments`. It is not silently rebased.

The structured per-candidate trace is `artifacts/evaluation/phase9-fac115-candidate-mapping-failures-v1.json`. Lexical recovery candidates are diagnostic only and never become scored evidence.

### Required pilot coverage

The official source does not contain:

- a genuine unresolved amendment conflict;
- a planted parser-uncertain obligation; or
- a malicious prompt-injection attempt.

The existing synthetic security fixtures test all three provider-free, but Phase 9 says the live pilot must use only the frozen FAC115 fixture. Adding hostile or conflicting text would alter that fixture. The preflight therefore stops rather than pretending those controls are FAC115 cases.

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

1. A provider-neutral correction for rendered-page binding that does not rewrite the frozen answers or accept fuzzy citations.
2. A documented resolution of the impossible source-native conflict/parser/injection coverage requirement, such as a separately labeled synthetic security-control companion that is not represented as Commonwealth content.
3. A new frozen pilot candidate set and hash after those offline corrections.
4. A separate explicit Phase 9/public-evaluation budget and provider-call authorization large enough for the complete reserved pilot.

No historical provider output may be resumed or rescored as the new pilot.
