# Phase 9 Review-Acceleration UX Change Log

**Authorization:** Focused Phase 9 Review Acceleration release  
**Scope:** Reduce human review burden without reducing the audit population or human accountability  
**Evidence:** Stakeholder trust/missed-form concern, immutable corrected New Jersey public run,
existing coverage-review bridge, deterministic fixtures  
**Status:** Implemented behind existing protected/public-data and demo controls; final sequential
release-gate rerun pending

This release does not redesign the product or claim extraction completeness. It changes how a
proposal director reaches decisions over a large machine population.

## UX-P9RA-001 — Executive review hierarchy

| Field     | Value                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Problem   | A raw “329 findings” lead does not tell a proposal director what can block the bid or what to do next.                             |
| Change    | Lead with critical obligations/deadlines, unresolved exceptions, next action, progress, and effort; total population is secondary. |
| Benefit   | Faster orientation around bid risk and action rather than system output volume.                                                    |
| Guardrail | Machine findings, team decisions, published requirements, checklist work, and company proof remain separate.                       |

## UX-P9RA-002 — Four deterministic review lanes

| Field     | Value                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Model     | Exception → critical → deterministic duplicate → routine                                                            |
| Benefit   | High-impact and uncertain work appears first; clean routine work can be handled efficiently.                        |
| Guardrail | Every finding has one lane and remains in the audit population. Critical/exception findings remain individual-only. |

## UX-P9RA-003 — Audited accelerated review

| Field     | Value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Change    | Explicit selection and confirmation for routine acceptance and non-canonical duplicate rejection.            |
| Benefit   | Reduces repetitive interactions without making an autonomous decision.                                       |
| Guardrail | Server recomputation, atomic stale-selection refusal, one append-only decision per finding, shared batch ID. |

## UX-P9RA-004 — Transparent effort estimate

| Field     | Value                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Change    | Show an approximate range from remaining individual, duplicate-group, and batch-eligible work.                         |
| Benefit   | Helps leaders plan reviewer capacity.                                                                                  |
| Guardrail | Disclosed assumptions, conservative defaults, sufficient-sample threshold for observed timing, no guaranteed duration. |

## UX-P9RA-005 — Privacy-conscious review analytics

| Field     | Value                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Change    | Append-only session/open/decision/batch/coverage/publication interaction metadata.                                      |
| Benefit   | Permits evaluation of whether the workflow saves time.                                                                  |
| Guardrail | No document/quotation/proposal content, prompt, token, or secret; analytics never changes authorization or publication. |

## UX-P9RA-006 — First-run and stakeholder tours

| Field     | Value                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Change    | Six-step first-run orientation plus a separate 14-step presenter-controlled demo over the real application.                              |
| Benefit   | A stakeholder can understand the evidence-to-checklist story in under five minutes without a fake demo UI.                               |
| Guardrail | Stable semantic targets, required-target readiness failure, optional fallback, no automatic protected action, exit/restart at all times. |

## UX-P9RA-007 — Presenter support without stakeholder clutter

| Field     | Value                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Change    | Session-only Presenter Notes, hidden by default and independently toggleable.                      |
| Benefit   | Gives the presenter concise cues while keeping stakeholder copy short and business-focused.        |
| Guardrail | Demo-only, never persisted as onboarding content, never printed/exported, never blocks the target. |

## Offline evaluation

The immutable corrected New Jersey run remains fully represented:

| Measure                                  |                       Result |
| ---------------------------------------- | ---------------------------: |
| Findings                                 |                          329 |
| Critical                                 |                           88 |
| Exception                                |                           11 |
| Deterministic non-canonical duplicate    |                            0 |
| Routine                                  |                          230 |
| Critical/exception batch-accept eligible |                            0 |
| Estimated finding interactions           | 329 → 109 (66.87% reduction) |
| Estimate including 38 page decisions     | 367 → 147 (59.95% reduction) |

The official question and submission deadlines remain critical. The estimate is a workflow-planning
comparison, not observed review time. No independently reviewed known-answer set exists, so this
work makes no precision, recall, or completeness claim.

## Still to validate with users

- Whether directors agree with the critical-category boundary in real bids.
- Whether reviewers prefer one large routine batch or smaller category-based selections.
- Whether the effort range is directionally useful after sufficient sessions.
- Whether the 14-step demo sequence fits a live stakeholder conversation without presenter coaching.
- Whether source-opening and exception-review counts correlate with trust and time saved.

Human accountability remains unchanged: the product accelerates review; it does not authorize a
submission or guarantee that extraction found every obligation.

## Release-finalization hardening — 2026-07-29

The dashboard now treats two projection discrepancies as visible, fail-closed review work: an
accepted decision that is not publication-eligible, and an immutable finding that is not represented
by the current queue. The director sees the issue instead of a misleading publication-ready state.
The normal register is scoped to the latest completed verification run, while the prepared demo's
checklist/audit/report sequence remains bound to its exact completed generation run. These changes
improve provenance clarity; they do not make a completeness claim.
