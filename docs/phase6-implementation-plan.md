# Phase 6 Implementation Plan — Proposal Draft Audit

Date: 2026-07-18  
Authorized scope: deterministic proposal-draft audit, findings, human resolution, revisions, UI, and auditability. Phase 7 is excluded. No paid provider calls are authorized.

## Stable upstream contracts

Phase 6 consumes, but never updates, these completed interfaces:

- Phase 4 `verification_findings`, `verification_evidence`, `human_review_decisions`, and requirement relationships.
- Phase 5 `checklist_generation_runs`, active `checklist_items`, exact item sources, required-artifact state, blocker/readiness state, and human workflow decisions.
- Phase 2 private PDF ingestion, parsing, page text, signed source access, workspace ownership, and file validation.

The selected Phase 4 fingerprint and models remain unchanged. General live verification stays disabled and `MockProvider` stays the default. Phase 6 uses no model provider.

## Versioned deterministic policy

- Section parser: `proposal-section-parser-v1`
- Atomic claim segmenter: `proposal-claim-segmenter-v1`
- Audit schema: `proposal-audit-schema-v1`
- Requirement matcher: `proposal-response-matcher-v1`
- Support policy: `proposal-support-policy-v1`
- Contradiction engine: `proposal-contradiction-v1`
- Finding severity: `proposal-finding-severity-v1`
- Evaluator: `proposal-audit-evaluator-v1`

Uploaded proposal text is hostile data. It has no tool, secret, prompt, authorization, workspace, or state-transition authority. The deterministic segmenter stores exact page offsets; malformed or uncertain parsing is rendered as uncertainty and cannot silently establish coverage or support.

## Separate status axes

| Axis              | Values                                                                                                        | Meaning                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Response coverage | `addressed`, `partially_addressed`, `missing`, `not_applicable`, `parser_uncertain`                           | Whether the proposal responds to an eligible Phase 5 obligation |
| Claim support     | `supported`, `partially_supported`, `unsupported`, `contradicted`, `requires_human_proof`, `parser_uncertain` | Whether allowed evidence supports an atomic proposal claim      |
| Consistency       | `consistent`, `inconsistent`, `undetermined`, `not_applicable`                                                | Deterministic cross-source date/number/identity consistency     |
| Human resolution  | `pending`, `accepted`, `rejected`, `needs_follow_up`, `waived`                                                | Append-only reviewer decision                                   |
| Workflow          | `open`, `in_review`, `resolved`, `accepted_risk`, `obsolete`                                                  | Finding-handling workflow only                                  |

No axis rewrites Phase 4 verification or Phase 5 workflow. A waiver or resolution appends a decision and never erases the original claim or finding.

## Requirement response eligibility and matching

Only active Phase 5 items with `ordinary_active` eligibility are ordinary response obligations. Review-needed or unresolved items may be audited as unresolved risks but cannot be silently treated as established requirements. Excluded, contradicted, unsupported, superseded, obsolete, and unresolved-conflict records are excluded from ordinary response coverage with a persisted reason.

Matching is deterministic and bounded by stable category, explicit form/section identifiers, normalized obligation tokens, typed material facts, and parent/child role. Parent and child obligations remain atomic. Duplicate proposals never destructively merge claims or requirements.

## Support and contradiction policy

Proposal text never supports itself. Support may come only from workspace-scoped, explicitly linked evidence:

- validated Phase 4 source evidence for what the procurement requires;
- reviewed Phase 5 artifact links and human decisions for company/proposal proof;
- deterministic proposal-to-requirement comparison for coverage;
- explicit synthetic company evidence supplied to the evaluator fixture.

Company assertions without permitted evidence are `requires_human_proof`, not false. Exact typed facts are compared only when semantic role, unit/operator, and material scope are compatible. Explicit same-role/scope opposition produces `contradicted`; missing evidence alone produces `unsupported` or `requires_human_proof`. Ambiguous parsing produces `parser_uncertain`.

## Database and migration plan

One additive migration creates workspace-scoped tables for proposal drafts/revisions, sections, atomic claims, audit runs, claim-to-requirement matches, evidence links, response coverage, findings, finding evidence, and append-only resolutions. Composite workspace foreign keys and validation triggers prevent cross-workspace references. Machine-owned structures have authenticated member SELECT only. Controlled security-definer RPCs permit authorized finding workflow and resolution actions after rechecking membership. RLS is enabled on every new table before exposure.

The development target is only project `uxmxkdjschbekkbnweby`. Read-only inspection on 2026-07-18 confirmed accumulated synthetic/E2E data, so the migration performs no backfill, deletion, or update of upstream records.

## Revisions and idempotency

An audit input hash covers workspace, proposal document hash, parse/page hashes, source checklist generation, stable requirement fields, linked evidence state, and all Phase 6 versions. Identical inputs return the existing completed run. New proposal documents create linked immutable revisions. Prior findings remain preserved and may be marked obsolete only by an explicit later audit relationship; reviewer resolutions remain append-only.

## Known-answer fixture and gates

The frozen synthetic fixture includes 12 planted cases: unsupported company claim, conflicting deadline, incorrect insurance, wrong procurement identity, missing response, source contradiction, prompt injection, human-proof claim, supported response, partial response, parser uncertainty, and corrected revision. Expected-versus-actual evaluation requires perfect status/precedence/date/number/evidence/citation metrics, zero critical false-supported or false-consistent results, zero false merges, and zero injection influence.

Testing proceeds from pure domain fixtures to integration/RLS/service tests, then mock-only Playwright and repository gates. No live AI/provider call is part of Phase 6.

## Risks and assumptions

- PDF text parsing may not preserve visual tables; uncertain pages fail visibly and require human review.
- Deterministic matching deliberately favors precision and may produce review-needed/missing results for unusual prose.
- Linked company evidence demonstrates presence, not legal sufficiency; critical decisions stay human-pending.
- Phase 5 active items are the response-obligation contract; source-state disputes remain Phase 4/5 concerns and are not rewritten here.
- Existing private storage accepts only validated PDFs; Phase 6 adds no unrestricted upload type.
