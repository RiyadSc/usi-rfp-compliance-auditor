# Phase 9 General-Workspace Noise Remediation

Date: 2026-07-26

## Scope

This is a provider-free correction for the state-neutral workspace analysis path. It does not alter the frozen FAC115 recovery contract, historical live runs, expected answers, provider models, prompts, or stored findings.

## Demonstrated problem

The completed New Jersey armed-security run successfully found important procurement requirements, but its 471 findings included table-of-contents headings, incomplete sentence fragments, descriptive dates, and categories inferred from isolated words such as “signed,” “permit,” “insurance,” or “bid opening.”

Exact quotation proved provenance, but it did not prove that quoted text was a complete actionable obligation.

## Correction

Versions:

- Workspace plan: `phase9-workspace-plan-v2`
- Workspace evaluator: `phase9-workspace-evaluator-v2`
- Candidate refinement: `phase9-workspace-candidate-refinement-v1`

The refinement step runs after high-recall deterministic mining and before reduction, call planning, provider verification, or finding creation.

It rejects:

- dotted-leader and navigation/table-of-contents entries;
- pure not-applicable statements;
- historical or explicitly descriptive statements;
- truncated fragments and clauses ending without their material object;
- keyword matches without a modal, imperative, consequence, operational deadline, or supported meeting-attendance construction.

It reclassifies:

- deadlines only from operational question/bid/proposal/submission due language, bounded relative deadlines, or explicit no-later-than language;
- signatures only from signing, signature, signatory completion/submission, or material initials language;
- licenses only from actual license or permit-proof language;
- insurance only from coverage, policy, certificate, insured, or professional-liability language;
- required forms only from a named/form-identified artifact plus a completion/submission requirement.

AI-proposed seeds receive the same refinement before they are persisted as unverified candidates.

## New Jersey offline replay

Source: the same immutable 48-page public document previously used in live run `43e9ec62-e7f0-4ed6-aeff-b9b82091fea3`.

| Measure                      |      Result |
| ---------------------------- | ----------: |
| Source blocks                |         188 |
| High-recall mined candidates |         640 |
| Rejected before reduction    |         261 |
| Accepted before reduction    |         379 |
| Reclassified                 |          72 |
| Exact duplicates removed     |          31 |
| Final refined candidates     |         348 |
| Planned tasks                |          21 |
| Planned maximum              | `$0.540562` |

Rejection reasons:

| Reason                       | Count |
| ---------------------------- | ----: |
| No explicit obligation       |   172 |
| Incomplete fragment          |    50 |
| Table of contents/navigation |    30 |
| Historical/descriptive       |     8 |
| Pure not-applicable          |     1 |

Both frozen source facts used as a sanity check remain present:

- Electronic questions due February 15, 2008 at 5:00 PM.
- Bid submission due March 7, 2008 at 2:00 PM.

This is not a precision/recall score because the New Jersey document does not yet have a frozen, independently reviewed answer set.

## Gates

- Focused Phase 9 unit tests: `26/26`
- Full unit suite: `407/408`; one pre-existing user-owned checklist copy guard failure
- Supabase integration: `88/89` during an accidentally overlapping auth run; affected verification file rerun independently `15/15`
- Lint: pass
- Changed-file Prettier: pass
- Type-check: pass
- Production build: pass
- Secret scan: pass
- Provider calls/spend: `0 / $0.00`

## Residual limitation

The refined population is materially smaller but still large. It includes both submission obligations and contract-performance obligations. A product policy may later expose separate “bid response” and “post-award performance” views, but this remediation does not discard either class or change checklist eligibility.
