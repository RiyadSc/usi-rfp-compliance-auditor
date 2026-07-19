# Phase 6 Completion Report — Proposal Draft Audit

Date: 2026-07-18  
Status: **COMPLETE**  
Phase 7: **not started**

## 1. Implementation summary

Phase 6 adds a deterministic, workspace-scoped proposal-draft audit. Parsed private proposal PDFs are segmented into page-anchored sections and atomic claims, matched against eligible Phase 5 checklist obligations, compared with exact Phase 4 evidence, and persisted as immutable machine findings with separate human-resolution history. It never rewrites a proposal, changes an upstream finding/checklist item, or represents a machine result as human approval.

The versioned implementation is:

- section parser `proposal-section-parser-v1`;
- claim segmenter `proposal-claim-segmenter-v1`;
- strict schema `proposal-audit-schema-v1`;
- requirement matcher `proposal-response-matcher-v1`;
- support policy `proposal-support-policy-v1`;
- contradiction engine `proposal-contradiction-v1`;
- severity policy `proposal-finding-severity-v1`;
- evaluator `proposal-audit-evaluator-v1`.

## 2. Stable Phase 4 and Phase 5 interfaces consumed

Phase 6 reads immutable Phase 4 `verification_findings`, validated `verification_evidence`, human decisions, exact source document/page references, and parent/child semantics. It reads Phase 5 completed generation runs, active checklist items, source links, category/eligibility/lifecycle fields, proof requirements, and reviewed artifact links. It preserves `verification-facts-v4`, `verification-decision-v6`, `verification-final-assessment-v1`, `atomic-parent-child-v1`, and every Phase 5 deterministic engine contract.

No Phase 4 or Phase 5 machine record is updated. General live verification remains disabled and `MockProvider` remains the default outside the controlled synthetic verification path.

## 3. Migrations and database changes

Additive migration `20260718000020_phase6_proposal_audit.sql` creates:

1. `proposal_drafts`;
2. `proposal_audit_runs`;
3. `proposal_sections`;
4. `proposal_claims`;
5. `proposal_claim_requirement_matches`;
6. `proposal_claim_evidence`;
7. `proposal_response_coverage`;
8. `proposal_audit_findings`;
9. `proposal_finding_evidence`;
10. `proposal_finding_resolutions`.

All records are workspace-scoped. Composite workspace foreign keys and validation triggers reject cross-workspace documents, pages, requirements, evidence, findings, and revisions. Machine structures and resolution history are immutable. The controlled `resolve_proposal_audit_finding` RPC appends a decision after membership validation and records an audit event.

The migration was applied transactionally to confirmed development project `uxmxkdjschbekkbnweby`. It performs no backfill, deletion, or update of unrelated data. Direct post-migration catalog inspection confirmed RLS enabled on all ten tables, one member-scoped SELECT policy per table, and migration history version `20260718000020`.

## 4. Draft-ingestion architecture

Proposal drafts use the existing Phase 2 private PDF upload architecture: signed object access, workspace membership, normalized filenames, MIME/extension/magic/size/page controls, SHA-256 hashing, private storage, parse state, soft deletion, and audit events. `proposal_draft` is an explicit validated document type; arbitrary values are rejected both at upload intent and finalization.

An audit starts only for an authorized, parsed, non-deleted `proposal_draft` in the requested workspace and an explicitly selected completed Phase 5 generation run. No proposal content is sent to a provider in Phase 6.

## 5. Parser and section model

The existing page-preserving PDF adapter supplies exact page text, page number, extraction status, and warnings. `proposal-section-parser-v1` creates stable sections with heading, normalized heading, page number, exact offsets, section text, parser uncertainty, and parser version. It recognizes cover/transmittal, executive, technical, management, staffing, qualifications, experience/references, pricing, forms, certifications, insurance, attachments, exceptions, and appendix-like headings while preserving unknown headings.

Image-only, empty, or warned page content remains parser-uncertain and cannot establish definitive response coverage or support.

## 6. Claim taxonomy

`proposal-claim-segmenter-v1` splits page sections into independently auditable claims and persists exact text and offsets. Types are `requirement_response`, `company_capability`, `company_credential`, `staffing_commitment`, `insurance_claim`, `deadline_statement`, `pricing_statement`, `procurement_identity`, `descriptive`, and `unknown`.

Typed deterministic facts preserve dates, currency, percentages, quantities, form identifiers, normalized values, units, operators, and semantic role. Proposal identity and injection signals are stored independently of support status.

## 7. Coverage-status model

Coverage is a separate axis: `addressed`, `partially_addressed`, `missing`, `not_applicable`, or `parser_uncertain`. Only active, ordinary-eligible Phase 5 items are ordinary response obligations. Unresolved upstream source states remain uncertain; excluded, contradicted, unsupported, superseded, and obsolete items do not silently become missing obligations.

Parent and child obligations are matched atomically. A parent attachment, form, meeting, insurance requirement, or delivery method does not satisfy a distinct child content, signature, consequence, sublimit, or packaging obligation.

## 8. Support-status model

Claim support is independent of coverage and consistency: `supported`, `partially_supported`, `unsupported`, `contradicted`, `requires_human_proof`, or `parser_uncertain`.

The proposal never supports itself. Support requires an active verified requirement, exact validated source evidence, reviewed same-workspace company evidence, or an exact immutable procurement-identity match. Semantic similarity alone is insufficient. Absence of evidence is not contradiction.

## 9. Human-proof policy

Company capability, credential, staffing, experience, insurance-status, certification, license, and similar claims without reviewed company evidence become `requires_human_proof`, not false. The finding states that separate reviewed proof is needed. Reviewed Phase 5 artifact links from the same workspace may support a claim; artifact presence does not establish legal sufficiency, and human resolution remains separate.

## 10. Contradiction policy

`proposal-contradiction-v1` compares typed facts only where semantic role, unit/operator, and material scope are comparable. Exact same-role/scope date or numerical opposition produces `contradicted` and a deterministic finding. Unknown scope remains unknown; missing evidence is not contradiction. Explicit semantic opposition may also establish contradiction. Active, superseded, conflicting, and unresolved procurement states remain upstream Phase 4/5 concerns and are never collapsed.

## 11. Missing-response rules

A missing response is created only for an active, ordinary-eligible checklist obligation with reliable proposal parsing and no qualifying matched claim. Partial material coverage produces `partial_required_response`; parser uncertainty produces an unresolved/parser finding. Missing mandatory responses and unsupported factual claims are different axes and different finding types.

## 12. Wrong-procurement detection rules

Procurement-identity claims are compared with immutable audit identity fields. Exact solicitation number and customer identity establish the expected cover identity. A procurement-specific identity that matches none of the expected identity fields produces both `wrong_procurement_identity` and a copied-language review finding. Generic reusable prose does not trigger this rule.

## 13. Prompt-injection controls

Proposal text, OCR, headings, and metadata are hostile data. Deterministic parser-boundary detection records attempts to override instructions, request secrets, self-verify, suppress content, alter output, change workspace, or invoke tools. Proposal content has no prompt, tool, model, provider, secret, workspace, schema, evaluator, or persistence authority. Phase 6 makes no model calls and exposes no tools. Injection detection is separate from support and had zero influence in the frozen fixture.

## 14. Finding schema

Findings persist workspace/run/draft linkage, stable key, type, severity, title, detail, checklist item, claim, exact proposal page, exact source document/page/quote, machine-only flag, human-resolution status, workflow status, rule version, and timestamps. Separate immutable evidence rows anchor exact/normalized-exact proposal, requirement, company, and contradicting source evidence.

The taxonomy covers missing and partial responses, unsupported and contradicted claims, date and numerical mismatches, wrong procurement and copied language, parser uncertainty, prompt injection, human proof, unresolved source requirements, and revision corrections.

## 15. Severity and blocker rules

Severity is deterministic:

- `critical`: date mismatch, numerical/insurance mismatch, wrong procurement identity;
- `blocking`: mandatory missing response, mandatory contradiction, parser/source uncertainty;
- `warning`: unsupported claim, partial response, human-proof need, non-mandatory contradiction;
- `informational`: copied-language review notes, injection observation metadata, and corrected-revision history where no current blocker remains.

Phase 6 does not silently modify the Phase 5 readiness formula. Findings are audit results for human review; a later explicit versioned integration may feed them into a subsequent readiness/reporting phase.

## 16. Resolution workflow

Authorized reviewers may append accepted, rejected, needs-follow-up, or waived decisions and move finding workflow through guarded states (`open`, `in_review`, `resolved`, `accepted_risk`, `obsolete`). Each RPC decision records actor, timestamp, reason, prior decision, new state, and audit event. Original findings and evidence remain immutable. Proof artifacts remain managed through the existing same-workspace Phase 5 artifact workflow and are linked into a new audit rather than mutating an old assessment.

## 17. Proposal revision and re-audit behavior

Each proposal document has immutable hash, lineage, revision number, prior-draft link, uploader, parser identity, and audit run. The effective input hash covers proposal/page hashes, source checklist data, evidence state, optional prior revision, and all Phase 6 versions. Identical inputs reuse a completed audit without duplicate claims/findings. A changed document creates a new revision and new claims; prior findings and decisions remain queryable. `corrected_in_revision` records resolved prior issues without deleting or rewriting history.

## 18. Known-answer expected-versus-actual results

Fixture: `proposal-audit-known-answer-v1` (synthetic/public only).

| Case                             | Expected                                 | Actual                                                               | Result |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- | ------ |
| Supported Form A-1 response      | `addressed`                              | `addressed`, claim `supported`                                       | Pass   |
| Conflicting deadline             | claim `contradicted`; date mismatch      | `partially_addressed`, `contradicted`; page 3 → source page 2        | Pass   |
| Incorrect insurance value        | claim `contradicted`; numerical mismatch | `partially_addressed`, `contradicted`; page 4 → source page 3        | Pass   |
| Partial staffing attachment      | `partially_addressed`                    | `partially_addressed`, `partially_supported`; page 2 → source page 4 | Pass   |
| Source contradiction             | claim `contradicted`                     | `partially_addressed`, `contradicted`; page 3 → source page 5        | Pass   |
| Missing internal license proof   | `requires_human_proof`                   | `addressed`, `requires_human_proof`; page 5 → source page 6          | Pass   |
| Missing signed Form B-2          | `missing`                                | `missing`; source page 7                                             | Pass   |
| Parser-damaged appendix          | `parser_uncertain`                       | `parser_uncertain`; source page 8                                    | Pass   |
| Unsupported zero-incidents claim | `unsupported`                            | `unsupported`; proposal page 5                                       | Pass   |
| Wrong Metro County procurement   | `contradicted`; wrong identity           | `contradicted`; proposal page 6                                      | Pass   |
| Embedded hostile instructions    | injection finding, zero influence        | injection finding on page 7; zero influence                          | Pass   |
| Corrected revision               | correction history retained              | `corrected_in_revision`; prior date finding retained                 | Pass   |

Artifact: `artifacts/evaluation/phase6-proposal-audit-known-answer-v1.json`.

## 19. Required evaluation metrics

| Metric                                      |      Result |
| ------------------------------------------- | ----------: |
| Case, coverage, and support accuracy        |       `1.0` |
| Critical contradiction precision / recall   | `1.0 / 1.0` |
| Missing-response precision / recall         | `1.0 / 1.0` |
| Unsupported-claim precision                 |       `1.0` |
| Human-proof classification accuracy         |       `1.0` |
| Insurance/date accuracy                     |       `1.0` |
| Evidence validity / citation validity       | `1.0 / 1.0` |
| Wrong-procurement detection accuracy        |       `1.0` |
| Strict schema adherence                     |       `1.0` |
| Critical false-supported / false-consistent |     `0 / 0` |
| False/destructive merges                    |     `0 / 0` |
| Injection influence / cross-workspace leaks |     `0 / 0` |

## 20. UI and evidence-navigation results

The workspace exposes a Proposal audit entry. The audit index lets an authorized member select a parsed proposal, completed checklist generation, and optional prior revision. The detail surface shows run provenance, response coverage, categories and parent/child role, atomic claim text, separate support/consistency axes, proposal page links, source requirement links, exact source quotes, original RFP page links, severity, machine/human states, resolution controls, and append-only decision history.

Mock Playwright exercised protected sign-in, prepared workspace, audit display, claims/findings, date/insurance/procurement/missing/human-proof/injection states, exact proposal and RFP navigation, human resolution history, revision history, prohibited-language absence, and unauthorized workspace denial.

## 21. RLS and authorization results

All ten Phase 6 tables have RLS. Ordinary users may read only rows for workspaces where they hold membership and cannot fabricate or modify machine structures. Machine writes use the narrowly scoped server path. Human decisions use the controlled RPC, which rechecks workspace membership and appends rather than overwrites.

Integration tests passed same-workspace persistence, service-role insertion, ordinary-user machine-finding denial, cross-workspace read denial, cross-workspace evidence rejection, cross-workspace revision rejection, append-only decisions, and unauthorized resolution denial. UI routes return not found for an unauthorized workspace audit.

## 22. Idempotency and preservation results

The integration suite proved identical inputs reuse the same completed audit/run and do not duplicate claims, coverage, evidence, or findings. New proposal documents create linked revisions. Prior findings remain unchanged; corrected findings are added to the later run. Finding resolutions are append-only. Upstream Phase 4 findings, Phase 5 items, parent/child roles, and exact evidence remain unchanged.

## 23. Audit-history results

Audit events cover proposal audit run creation/completion, section and claim creation, requirement/support matches, finding creation, resolution, revision, and re-audit behavior. Resolution rows retain actor, reason, status, workflow, prior-decision link, and timestamp. Logs and artifacts omit credentials, authorization headers, full prompts, provider payloads, and unrelated document content.

## 24. Complete regression results

- Unit: **254/254 passed** across 14 files; Phase 6 domain contributes 15 focused tests.
- Supabase integration: **67/67 passed sequentially** across 6 files; Phase 6 contributes 6 service/RLS/revision tests.
- Mock Playwright: **19 passed**, one separately opt-in Phase 4 live audit skipped; 20 tests discovered.
- Phase 6 deterministic known-answer evaluation: all required metrics passed.
- Lint: passed.
- Formatting verification: passed.
- Type-check: passed for all workspaces.
- Production build: passed. The initial sandbox-only process-binding restriction was rerun in the authorized unrestricted build environment.
- Dependency audit at `high`: passed; two pre-existing moderate PostCSS advisories remain documented as risk R-25.
- Secret scan: passed across 281 tracked files, 3 then-untracked commit candidates, and the client bundle.
- Invariant checklist and `git diff --check`: passed.

## 25. Provider calls and spend

Phase 6 provider calls: **0**. Phase 6 provider spend: **$0.00**. The authoritative historical ledgers remain Phase 3 `$0.408541`, Phase 4 `$12.100797`, and cumulative API `$12.509338`. Phase 6 neither invokes nor changes the selected Phase 4 model configuration.

## 26. Residual risks

- PDF text extraction may lose visual table/layout semantics; parser uncertainty fails closed and requires a reviewer.
- Precision-first deterministic matching may mark unusual prose partial, missing, or unsupported rather than infer equivalence.
- Reviewed artifact presence is evidence availability, not legal or factual sufficiency.
- Phase 6 findings do not yet feed Phase 5 readiness automatically; that requires a separately versioned later-phase integration.
- Two moderate PostCSS dependency advisories remain; the available forced remediation is incompatible and was not applied.

## 27. Assumptions

- Phase 5 active checklist items are the authoritative response inventory.
- Only parsed private PDFs are proposal-draft inputs in this phase.
- Procurement number plus customer is sufficient deterministic identity for a correct cover reference; mismatches require procurement-specific text.
- Human reviewers remain responsible for company-proof sufficiency, exceptions, and final submission decisions.
- Synthetic/public data is the only approved demo/evaluation content.

## 28. Git commit hashes

- Core/domain/service/migration/evaluation: `6c72720de8352822d078b50c81a585e40491fe6f`.
- Review UI and automated tests: `e47f485d21a9663c1c2473749c30cc9867998331`.
- Documentation and final sign-off: recorded in the final handoff because this report is part of that commit.

## 29. Clean-worktree confirmation

The final handoff records the documentation commit and confirms the worktree after all commits. No provider payload, secret, generated environment file, or confidential document is included.

## 30. Explicit Phase 6 completion status

Every Phase 6 completion criterion passes. Proposal ingestion, parsing, atomic claims, coverage, missing-response detection, support/contradiction/human-proof rules, deterministic date and insurance comparison, wrong-procurement detection, prompt-injection resistance, immutable evidence, append-only resolution, revisions, RLS/isolation, idempotency, UI navigation, known-answer metrics, regression gates, documentation, and repository hygiene are complete.

**Phase 6 is complete. Phase 7 has not begun.**
