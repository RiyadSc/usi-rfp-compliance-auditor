# Phase 5 Deterministic Checklist and Blockers

## Versioned data flow

`verification_findings` + latest `human_review_decisions` + exact validated `verification_evidence` + `requirement_relationships` → `checklist-eligibility-v1` → `checklist-category-v1` → `checklist-generator-v1` → `checklist-blockers-v1` → `checklist-readiness-v1`.

The pipeline is deterministic, workspace- and verification-run-scoped, and provider-free. Phase 4 candidates and findings are never updated. A checklist item carries the finding, candidate, verification run, source document/page/quote, source support, precedence, proof requirement, machine-only marker, and the latest Phase 4 human-review state. Workflow completion is a separate axis.

## Eligibility matrix

| Source support        | Precedence                      | Human review                        | Phase 5 result                               | Required denominator |
| --------------------- | ------------------------------- | ----------------------------------- | -------------------------------------------- | -------------------- |
| `supported`           | `active`                        | `accepted` or policy-valid `waived` | ordinary active item                         | mandatory only       |
| `supported`           | `active`                        | `pending` or `needs_follow_up`      | review-needed item + blocker                 | mandatory only       |
| `supported`           | `active`                        | `rejected`                          | excluded, retained for audit                 | no                   |
| `partially_supported` | any non-superseded              | any                                 | review-needed item + material-source blocker | mandatory only       |
| `unsupported`         | any                             | any                                 | excluded                                     | no                   |
| `contradicted`        | any                             | any                                 | excluded                                     | no                   |
| `parser_uncertain`    | any                             | any                                 | unresolved-risk item + blocker               | mandatory only       |
| `supported`           | `superseded`                    | any                                 | excluded; replacement stays separate         | no                   |
| supported/partial     | `conflicting` or `undetermined` | any                                 | unresolved-risk item + critical blocker      | mandatory only       |

An otherwise supported record without exact or normalized-exact validated Phase 4 evidence is forced to review-needed. Proof remains separate: a source-supported active requirement can require company, external, or human proof without becoming false.

## Persisted objects

Migrations `20260718000017` through `20260718000019` add generation runs, stable checklist items, run/item links, immutable source links, non-destructive relationships, required artifacts, artifact-link/review/removal history, append-only waiver and exception decisions, blockers and resolution history, guarded completion, and immutable readiness snapshots.

All tenant records carry `workspace_id`. Members have SELECT-only RLS on machine-owned records. Generation uses a privileged server path only after user-scoped membership checks. Assignment, status, artifact, waiver, exception, and blocker actions use narrow SECURITY DEFINER RPCs that repeat membership and object-scope validation. Ordinary users have no direct machine-record mutation policy.

## Workflow and artifact axes

Workflow: `not_started`, `in_progress`, `ready_for_review`, `completed`, `waived`, `blocked`, `not_applicable`, `requires_human_proof`, `unresolved`.

Artifact: `missing`, `uploaded`, `linked`, `pending_review`, `reviewed`, `accepted_by_waiver`, `requires_human_proof`, `rejected`, `not_applicable`.

A final accepted waiver is required before entering `waived`. Waiver decisions append a revision row and never alter the finding. Artifacts remain private workspace documents and use the existing PDF-only ingestion, validation, signed-access, size, and ownership controls.

## Blocker rules

Severity semantics:

- `critical`: deterministic condition creates immediate submission-workflow risk, such as a missing mandatory form, explicit missed deadline, or unresolved active conflict.
- `blocking`: work cannot advance without review, proof, or a required child action.
- `warning`: attention is needed but the rule alone does not block readiness, such as an explicit deadline within 72 hours.
- `informational`: context only.

Rules cover missing forms/attachments/signatures/initials/acknowledgments, unresolved precedence, parser uncertainty, partial support, pending source review, missing human proof, incomplete atomic children, invalid or unreviewed waivers, mandatory attendance, missed deadlines, and imminent deadlines. Resolution history is preserved; a cleared condition gets a system resolution, and a recurring condition reopens with a new history row.

## Readiness formula

1. Required denominator = active mandatory items that the eligibility policy says contribute.
2. Completed numerator = required items whose workflow is `completed` or `waived`.
3. Any open/reopened critical or blocking deterministic blocker → `blocked` and `Blocked by N required items`.
4. Otherwise, any unresolved item, outstanding human proof, pending source review, or incomplete required item → `human_review_required`.
5. Otherwise → `ready_for_final_review` and `Ready for final review`.

Snapshots expose totals for required, completed, incomplete, blocked, unresolved, human-proof, informational, critical, warning, and excluded records. They never express a compliance, legal, or submission-safety conclusion.

## Idempotency and regeneration

Generation input hashes bind sorted finding versions, latest human-review state, evidence IDs, relationship roles, and generator version. Identical inputs reuse the completed run. Stable item keys bind finding/version/relationship role/generator version. Existing stable records are reused, preserving owners, reviewers, workflow, artifact links, notes, waivers, and valid resolution history. New source findings create new stable records; prior records in the same analysis lineage are marked `obsolete` with an audit event and are never silently deleted.

## Five-missing-form fixture

`checklist-five-missing-forms-v1` has ten active, source-supported, human-reviewed mandatory forms with exact page evidence. A-1 through E-5 are missing; F-6 through J-10 are reviewed. The expected-versus-actual artifact is `artifacts/evaluation/phase5-five-missing-forms-v1.json`: precision 1.0, recall 1.0, false blockers 0, false merges 0, evidence validity 1.0, citation validity 1.0.
