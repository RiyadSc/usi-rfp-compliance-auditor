# Phase 9 Jurisdiction-Neutral Live Analysis Result

Date: 2026-07-25

## Outcome

The application and production worker now support the same controlled live-analysis workflow for an explicitly selected parsed RFP regardless of US state. The implementation is jurisdiction-neutral. It does not branch on Massachusetts, New Jersey, FAC115, an agency name, a solicitation number, or frozen expected answers.

The first New Jersey execution reached the provider through the production web/queue/worker path but did not receive a model response because the OpenAI project returned an insufficient-quota `429`. The run failed closed. A later fresh run, after provider quota was restored, completed through the same production path.

## Production path

1. A workspace owner explicitly selects one to forty parsed documents.
2. The owner attests that the material is public or otherwise authorized and accepts the displayed maximum cost.
3. The server validates membership, document types, parsing state, page limits, workspace scope, hashes, and rate limits.
4. `phase9-workspace-plan-v2` constructs the complete normalized source package, coverage map, refined candidate seeds, deterministic reduction, bounded call plan, hashes, and hard maximum.
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

This was an operational stop, not a failed model-quality score.

## Completed New Jersey run

- Evaluation run: `43e9ec62-e7f0-4ed6-aeff-b9b82091fea3`
- Status: completed
- Calls: `23`
- Tokens: `84,316` input / `28,843` output / `3,165` reasoning
- Provider latency: `174,484 ms`
- Findings: `471`
- Actual cost: `$0.432833`
- Repairs/retries/incompletes/refusals/timeouts: `0`

The run recovered the question and submission deadlines, copy-count instructions, signatory requirements, registration/source-disclosure/subcontractor forms, detective-agency permit proof, insurance certificates, security staffing duties, and pricing instructions. It also exposed a precision defect: table-of-contents entries, sentence fragments, historical dates, and isolated keywords could become findings or inappropriate categories. The run has no frozen New Jersey known-answer set, so it is not assigned a precision or recall score.

## Offline precision correction

`phase9-workspace-candidate-refinement-v1` now rejects those demonstrated noise classes and reclassifies from material obligation language. On the identical immutable source it:

- mined `640`;
- rejected `261`;
- reclassified `72`;
- reduced to `348` final candidates;
- preserved both official deadlines;
- reduced the planned run to `21` tasks / `$0.540562`.

This correction was provider-free. The completed 471-finding run remains immutable historical evidence and was not rescored or overwritten.

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

## 2026-07-27 workflow integration addendum

The corrected New Jersey run `e9dcb574-22c7-481e-b485-a2e85ad38433` completed with 21 calls, 65,868
input tokens, 24,745 output tokens, 2,021 reasoning tokens, 329 findings, and `$0.195472` actual cost.
It retained the official question and submission deadlines and the major form, licensing, insurance,
bond, signature, staffing, and pricing obligations. It still has no independent New Jersey
known-answer set, so no perfect-recall claim is made.

The application now closes the prior display and workflow gap:

- overview counts Phase 9 findings as machine findings awaiting review, not as zero work;
- the coverage page accounts for selected pages and surfaces omission/parser exceptions;
- every finding receives an append-only team decision;
- publication is locked until the complete finding set is reviewed;
- only accepted, supported, active findings with validated page evidence enter Phase 4;
- Phase 5 checklist and Phase 6 proposal audit consume those versioned records and source links.

See `phase9-coverage-review-bridge.md`.
