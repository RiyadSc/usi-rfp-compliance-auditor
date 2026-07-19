# Phase 5 Implementation Plan — Deterministic Checklist and Blockers

Date: 2026-07-18  
Authorized scope: deterministic checklist generation, workflow, artifacts, waivers/exceptions, blockers, readiness, UI, and auditability. No Phase 6 work and no paid provider calls.

## Stable inputs and versioning

Phase 5 consumes immutable `requirement_candidates`, versioned `verification_findings`, validated `verification_evidence`, `requirement_relationships`, and latest append-only `human_review_decisions`. It never updates a Phase 4 record.

- Eligibility policy: `checklist-eligibility-v1`
- Category vocabulary: `checklist-category-v1`
- Generator: `checklist-generator-v1`
- Blocker engine: `checklist-blockers-v1`
- Readiness engine: `checklist-readiness-v1`
- Persistence schema: `checklist-schema-v1`

The generator input hash covers workspace, analysis run, verification run, finding IDs/versions, latest review decisions, eligible evidence IDs, material relationships, and all engine versions.

## Implementation sequence

1. Add strict domain schemas and pure deterministic eligibility, category, generation, blocker, readiness, transition, and prohibited-language rules.
2. Freeze the five-missing-form fixture and expected answers; prove the pure engines before database writes.
3. Add one additive Supabase migration with workspace-scoped tables, composite scope constraints, immutability/audit triggers, RLS, controlled user RPCs, and service-only generation paths.
4. Add a checklist service that reads Phase 4 inputs, computes a stable plan, persists machine structure idempotently, preserves human fields, marks obsolete rows, recalculates blockers/readiness, and writes audit events.
5. Add authorized server actions and checklist/register/detail UI with source navigation, assignments, workflow, artifact links, exceptions, waivers, blockers, readiness and audit history.
6. Add unit, integration/RLS, service, fixture, and Playwright coverage; apply the migration only to confirmed development project `uxmxkdjschbekkbnweby`.
7. Run every repository gate, inspect the final diff, update documentation, and commit by logical layer.

## Eligibility matrix

| Source support        | Precedence                      | Human review                        | Result                           | Readiness behavior                                                      |
| --------------------- | ------------------------------- | ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `supported`           | `active`                        | `accepted` or policy-valid `waived` | ordinary active item             | required when mandatory; proof/artifact and workflow rules apply        |
| `supported`           | `active`                        | `pending` or `needs_follow_up`      | review-needed item               | unresolved blocker; cannot become complete for readiness                |
| `supported`           | `active`                        | `rejected`                          | excluded/reviewable record       | excluded with reason; never an active obligation                        |
| `supported`           | `superseded`                    | any                                 | excluded record                  | no active checklist duty; replacement remains separate                  |
| `supported`           | `conflicting` or `undetermined` | any                                 | unresolved-risk item             | blocking conflict/precedence item; no controlling value guessed         |
| `partially_supported` | any                             | any                                 | review-needed item               | material-mismatch blocker; never treated as fully established           |
| `unsupported`         | any                             | any                                 | excluded record                  | audit-visible only; never an ordinary obligation                        |
| `contradicted`        | any                             | any                                 | excluded or review-needed record | contradiction blocker only when an authorized reviewer needs resolution |
| `parser_uncertain`    | any                             | any                                 | unresolved-risk item             | parser blocker; never ordinary active                                   |

`machine_assessment_only` remains provenance, not approval. Proof is orthogonal: an otherwise eligible `requires_company_artifact`, `requires_external_validation`, or `requires_human_confirmation` item is active but begins with workflow/artifact state `requires_human_proof` until acceptable proof or a reviewed waiver exists.

Parent/child findings generate separate stable item keys. Duplicate proposals never delete or merge items; an accepted exact-duplicate relationship may mark one display record as related/canonical while retaining both source links. Any difference in form, party, role, deadline, amount, site, condition, deliverable, method, or scope hard-blocks duplicate suppression.

## Proposed database schema and migration

Migration `20260718000017_phase5_checklist_blockers` is additive and does not backfill or mutate existing Phase 1–4 data.

- `checklist_generation_runs`: versioned input hash, source verification run, versions, status and counts.
- `checklist_items`: machine structure plus separate human workflow/owner/reviewer fields, due date/timezone, eligibility and exclusion reason, immutable Phase 4 source axes, active/obsolete lifecycle.
- `checklist_item_sources`: exact finding/candidate/evidence/document/page linkage and quote; immutable.
- `checklist_relationships`: parent/child, duplicate/restatement, related-distinct and canonical proposals; non-destructive.
- `checklist_required_artifacts`: required artifact type and independent artifact state.
- `checklist_artifact_links`: workspace document links; append-only link/removal history.
- `checklist_waivers`: append-only waiver requests/decisions with prior-version linkage.
- `checklist_exception_notes`: append-only/revision-linked notes.
- `checklist_blockers`: deterministic stable keys, severity, rule/version, active/resolved/reopened state without deletion.
- `checklist_blocker_resolutions`: append-only human resolution/reopen decisions.
- `checklist_readiness_snapshots`: immutable deterministic counts, status, reasons, input hash and engine version.

Every table carries `workspace_id`; source, owner, reviewer, artifact, run and relationship scope is enforced with composite foreign keys/triggers. Machine structure has authenticated SELECT only. Human mutations use narrowly granted security-definer RPCs that re-check workspace membership and valid same-workspace members/documents. RLS is enabled before exposure.

## Workflow and artifact state

Workflow: `not_started`, `in_progress`, `ready_for_review`, `completed`, `waived`, `blocked`, `not_applicable`, `requires_human_proof`, `unresolved`.

Allowed ordinary transitions are deterministic; `completed`, `waived`, and `not_applicable` require policy preconditions. A workflow change never changes verification, precedence, proof, review, artifact or blocker axes.

Artifact: `missing`, `uploaded`, `linked`, `pending_review`, `reviewed`, `accepted_by_waiver`, `requires_human_proof`, `rejected`, `not_applicable`. Links use existing private PDF document/storage controls; no new upload type or unrestricted storage path is added.

## Blocker rules and severity

- `critical`: missed mandatory deadline; unresolved authoritative conflict affecting submission; required mandatory form/attachment/signature/addendum acknowledgment absent at the deadline.
- `blocking`: incomplete mandatory item/child duty, missing required proof/artifact, unconfirmed mandatory meeting, parser uncertainty, source contradiction requiring review, invalid/unreviewed waiver.
- `warning`: imminent deadline, incomplete optional but material item, unresolved noncritical review.
- `informational`: excluded/superseded/duplicate context with no readiness effect.

Each blocker has a stable key, rule, source item/finding, creation predicate, resolution predicate, readiness effect, engine version and immutable resolution history. Regeneration changes state, never deletes history.

## Readiness formula

Inputs are the latest active, non-obsolete checklist items; latest valid artifact/waiver/blocker state; Phase 4 source/precedence/proof/review axes; and `checklist-readiness-v1`.

1. Count required, completed, incomplete, blocked, unresolved, human-proof, informational, warnings and excluded records.
2. Any active critical/blocking blocker → `blocked` and “Blocked by N required items.”
3. No blocker but unresolved/review-pending/human-proof item → `human_review_required` and “Human review required.”
4. All required items complete or policy-valid waived, with no unresolved axes → `ready_for_final_review` and “Ready for final review.”

Completion percentage is `completed required / total required`; excluded, superseded, unsupported and contradicted records are outside the denominator. The engine never emits compliance, approval, submission-safety or guarantee language.

## Regeneration and human-edit preservation

Stable item keys are derived from verification run + finding + atomic relationship role + generator version. An unchanged input hash returns the existing completed generation. Regeneration inserts new machine structure when a finding materially changes, marks prior rows `obsolete` with reason, and preserves owner, reviewer, workflow, notes, artifact links, valid waivers, exceptions and still-valid blocker resolutions on unchanged stable keys. It never deletes reviewed records or edits Phase 4 data.

## Risks and assumptions

- Human acceptance policy is required before an ordinary active obligation contributes as established; review-pending items remain visible and blocking.
- A linked artifact proves presence, not substantive correctness. Review state remains separate.
- Deadline evaluation requires explicit timezone; missing/ambiguous timezone produces unresolved review, not a guessed instant.
- The accumulated development database contains only repository-created synthetic/E2E data. The migration is additive and creates no Phase 5 rows until explicitly generated.
- General live verification remains disabled; Phase 5 has zero provider cost.

## Test strategy

- Unit: schemas, matrix, categories, transitions, dates/timezones, generator stability, parent/child and duplicate safety, blockers, readiness, prohibited language, fixture metrics.
- Integration: migration/RLS, controlled RPCs, source/evidence/workspace scope, owners/reviewers, artifacts, waivers/exceptions, blocker resolution, readiness, idempotency and human preservation.
- Service: deterministic Phase 4 load/generation/regeneration, failure states and audit events.
- Playwright: protected checklist, exactly five missing-form blockers, evidence drill-through, owner/status/exception/waiver/readiness, prohibited-language absence and unauthorized URL denial.
- Repository gates: lint, formatting, type-check, build, dependency audit, secret scan and invariant checklist.
