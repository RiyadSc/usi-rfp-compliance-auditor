# Phase 9 Jurisdiction-Neutral Live Analysis Result

Date: 2026-07-25

## Outcome

The application and production worker now support the same controlled live-analysis workflow for an explicitly selected parsed RFP regardless of US state. The implementation is jurisdiction-neutral. It does not branch on Massachusetts, New Jersey, FAC115, an agency name, a solicitation number, or frozen expected answers.

The first New Jersey execution reached the provider through the production web/queue/worker path but did not receive a model response because the OpenAI project returned an insufficient-quota `429`. The run failed closed. No extraction or verification quality conclusion can be drawn from that attempt.

## Production path

1. A workspace owner explicitly selects one to forty parsed documents.
2. The owner attests that the material is public or otherwise authorized and accepts the displayed maximum cost.
3. The server validates membership, document types, parsing state, page limits, workspace scope, hashes, and rate limits.
4. `phase9-workspace-plan-v1` constructs the complete normalized source package, coverage map, candidate seeds, deterministic reduction, bounded call plan, hashes, and hard maximum.
5. The application persists an immutable run and its exact document bindings before queueing `phase9-workspace-analysis`.
6. The worker rehydrates and revalidates every material input, reserves the complete maximum atomically, and only then constructs the strict Phase 9 gateway.
7. Valid results remain `candidate_unverified`, `machineOnly=true`, and `humanReviewStatus=pending`. Operational or schema failure produces no supported finding.

## New Jersey public run

- Workspace: `90000000-0000-4000-8000-000000000100`
- Document: New Jersey `08-X-39231`, Armed Security Guard Services for DMVA
- Pages: `48`
- Evaluation run: `ac0ff690-f8d8-474d-a1ce-45bc97a9df4d`
- Planned tasks: `23`
- Planned maximum: `$0.967652`
- Model calls completed: `0`
- Input/output/reasoning tokens: `0 / 0 / 0`
- Findings persisted: `0`
- Actual cost: `$0.00`
- Normalized failure: `provider_quota_exceeded`
- Reservation: released
- Retry: none

This is an operational stop, not a failed model-quality score and not a successful RFP analysis.

## Controls

- Feature flag default: disabled
- Authorization: workspace owner
- Data: selected public or explicitly authorized documents only
- Provider API: Responses
- Provider storage: disabled
- Provider tools: none
- Queue concurrency: one
- Automatic retries: zero
- Evidence contexts: bounded by the exact plan
- Budget: server-owned per-run and monthly workspace policy
- Expected answers: absent from application analysis
- Cross-workspace references: rejected by application validation, RLS, and database constraints

## Validation

- Focused Phase 9 unit tests: `34/34` pass
- Full Supabase integration tests: `89/89` pass
- Type-check: pass
- Production build: pass
- Generic Phase 9 browser control: pass
- Lint: pass
- Secret scan: pass
- Changed-file formatting: pass

Repository-wide caveats outside this change:

- One unit source-copy guard fails on pre-existing uncommitted checklist UX wording containing prohibited approval/safe-submission terms.
- The global formatting check reports pre-existing uncommitted UX and discovery files; the jurisdiction-neutral files pass Prettier.
- `npm audit` reports existing high-severity advisories in the current Next.js and ESLint dependency trees. A breaking forced upgrade was not applied.

## Rollout status

This path is capable of accepting a parsed Connecticut, New Jersey, Massachusetts, or other-state RFP without state-specific code. It is not unrestricted or autonomous: the feature remains default-off, the document must be explicitly authorized, account quota must be available, and every machine result still requires human review.
