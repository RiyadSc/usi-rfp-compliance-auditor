# Phase 4 Completion Report

Date: 2026-07-18  
Status: **Complete**  
Scope: independent source verification, requirement register, evidence viewer, and human-review controls only. Phase 5 functionality was not implemented.

## Selected verification configuration

- Model: `gpt-5.5-2026-04-23`
- Reasoning: `low`
- Fingerprint: `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`
- Pass A: `verify-entailment-v7` / `verification-entailment-v5`, 1,800 output tokens
- Pass B: `verify-challenge-v4` / `verification-challenge-v4`, 1,600 output tokens
- Duplicate: `verify-duplicate-v1` / `verification-duplicate-v1`, 600 output tokens
- Facts/decision/evaluator/final: `verification-facts-v4`, `verification-decision-v6`, `verification-evaluator-v3`, `verification-final-assessment-v1`
- Relationships: `atomic-parent-child-v1`; at most two bounded evidence contexts; 90-second timeout
- Provider mode: Responses API, strict Structured Outputs and Zod, `store:false`, no tools
- Rollout: selected and pinned, but unrestricted live verification remains disabled. Only the immutable synthetic/demo harness may enable the provider pending a separate rollout decision.

## Controlled production smoke

- Supabase project: `uxmxkdjschbekkbnweby`
- Verification run: `56dc341b-71f0-4e03-b5fb-e25586ccb5b7`
- Processing job: `d9b4d184-e3e4-4f23-a43b-171f203bdac9`
- Smoke scope: `40000000-0000-4000-8000-000000000001`
- Workspace / identity / analysis run / document: `10000000-0000-4000-8000-000000000001` / `922727a8-727b-4b9e-a0ff-6e7f7f43d82c` / `10000000-0000-4000-8000-000000000003` / `10000000-0000-4000-8000-000000000002`
- Fixture: `verification-cases-v2`, 17 synthetic pages and exactly 24 immutable candidates
- Candidate/document/answer hashes: `531c03afbabe79adb9a490dc0f7e9657ff0f85013bbf0aabe64b505a94a8ac6b` / `46127bbb348db9374370921876e9adf0a1ca98971e970367e5e142188b04a44b` / `c67a347cf0c9dccabb8cb50336bd00f72b66bda9ee602e51fd98256cfbe3ba0a`
- Persisted verification-run input hash: `2ef68e32c45ebe4ab089ec34efbbfcc80722530d1b1618f7e71d4798de1a83c3`
- Outcome: passed. The prior defective hash `9c1f1750beb0bfcf6fb33e60cef24d468f889cd9105beabbf45fd4a9ae030806` is impossible through the current validated helper and was not produced.

The production worker persisted 24 findings, 24 fact envelopes, 40 pass results (24 entailment, 14 challenge, two duplicate), exact evidence, bounded retrieval chunks, three reviewable relationships, 40 model calls and spend rows, and a completion audit event. All findings are `machine_assessment_only`; no human decision exists, so the visible review state remains pending.

## All 24 expected-versus-actual results

Every source, precedence, and proof value matched. “Page” is the persisted validated evidence page; negative/parser cases correctly have no accepted quotation.

|   # | Candidate                                      | Source expected / actual                  | Precedence expected / actual | Proof expected / actual                                   | Page |
| --: | ---------------------------------------------- | ----------------------------------------- | ---------------------------- | --------------------------------------------------------- | ---: |
|   1 | Mandatory meeting                              | supported / supported                     | active / active              | none_identified / none_identified                         |    7 |
|   2 | Form B-2                                       | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    6 |
|   3 | Electronic submission only                     | supported / supported                     | active / active              | none_identified / none_identified                         |   11 |
|   4 | Meeting requirement missing consequence        | partially_supported / partially_supported | active / active              | none_identified / none_identified                         |    7 |
|   5 | OSHA scope overstated                          | partially_supported / partially_supported | active / active              | requires_company_artifact / requires_company_artifact     |   10 |
|   6 | Bid bond                                       | unsupported / unsupported                 | undetermined / undetermined  | none_identified / none_identified                         |    — |
|   7 | Email submission permitted                     | contradicted / contradicted               | active / active              | none_identified / none_identified                         |   11 |
|   8 | Correct final deadline                         | supported / supported                     | active / active              | none_identified / none_identified                         |    3 |
|   9 | Incorrect final deadline                       | contradicted / contradicted               | active / active              | none_identified / none_identified                         |    3 |
|  10 | Correct liability limit                        | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    5 |
|  11 | Incorrect liability limit                      | contradicted / contradicted               | active / active              | requires_company_artifact / requires_company_artifact     |    5 |
|  12 | Old liability limit                            | supported / supported                     | superseded / superseded      | requires_company_artifact / requires_company_artifact     |    4 |
|  13 | Active replacement limit                       | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    5 |
|  14 | False ambiguous deadline conflict              | contradicted / contradicted               | active / active              | none_identified / none_identified                         |    3 |
|  15 | Staffing plan attachment original              | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    8 |
|  16 | Staffing plan attachment checklist restatement | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |   14 |
|  17 | Proposal Form A-1                              | supported / supported                     | active / active              | requires_human_confirmation / requires_human_confirmation |    6 |
|  18 | Conflict Form B-2 distinct requirement         | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    6 |
|  19 | Image-only appendix obligation                 | parser_uncertain / parser_uncertain       | undetermined / undetermined  | undetermined / undetermined                               |    — |
|  20 | Insurance certificate                          | supported / supported                     | active / active              | requires_company_artifact / requires_company_artifact     |    5 |
|  21 | Branding guide obligation                      | contradicted / contradicted               | active / active              | none_identified / none_identified                         |   12 |
|  22 | Injected secret-disclosure instruction         | unsupported / unsupported                 | undetermined / undetermined  | none_identified / none_identified                         |    — |
|  23 | North Campus Addendum 3 insurance statement    | supported / supported                     | conflicting / conflicting    | requires_company_artifact / requires_company_artifact     |   16 |
|  24 | North Campus Addendum 4 insurance statement    | supported / supported                     | conflicting / conflicting    | requires_company_artifact / requires_company_artifact     |   17 |

## Smoke metrics and provider usage

| Metric                                             |                          Result |
| -------------------------------------------------- | ------------------------------: |
| Source / precedence / proof accuracy               |               `1.0 / 1.0 / 1.0` |
| Date / number / quote / citation / parser accuracy |                       all `1.0` |
| Duplicate precision / recall                       |                     `1.0 / 1.0` |
| Pass A / Pass B / duplicate first-pass adherence   |                       all `1.0` |
| Final decision schema adherence                    |                           `1.0` |
| Repairs / retries / incomplete / refusal / timeout |             `0 / 0 / 0 / 0 / 0` |
| Critical false-supported / false-active            |                         `0 / 0` |
| False merges / injection influence                 |                         `0 / 0` |
| Calls                                              |                            `40` |
| Input / output / reasoning / cached tokens         | `89,863 / 5,575 / 350 / 20,736` |
| Summed model-call latency                          |                      `97.669 s` |
| Actual cost                                        |                     `$0.523253` |

Provider-model-call and internal spend rows reconcile within `$0.000001`. Final ledgers are Phase 4 `$12.100797/$15`, remediation `$9.283190/$12`, and cumulative API `$12.509338`.

## Persistence, UI, isolation, and security

- Independent workspace-filtered retrieval recorded no more than two contexts per candidate and did not rely only on extraction-proposed evidence.
- Exact/normalized-exact evidence resolved to the stored synthetic document and page. Candidate 1 opened PDF page 7 and displayed the exact highlighted extracted-text anchor; no pixel-level highlight was claimed.
- Explicit page 4 → page 5 `supersedes`, Form B-2 `exact_duplicate`, and staffing-plan `parent_child` proposals persisted with machine-only/human-pending relationship metadata. Distinct requirements were not merged; the genuine Addendum 3/4 conflict remained conflicting.
- Dates, times, amounts, units, operators, insurance basis, roles and material scope were checked deterministically. Semantic results could not override a material deterministic mismatch.
- The requirement register displayed all five source classes, active/superseded/conflicting/undetermined precedence, independent proof states, and review-pending labels. The evidence viewer displayed exact quote, source page, parser state, Pass A/Pass B, decision version, provenance, uncertainty, and review controls.
- Authorized synthetic identity access passed. A separate unauthorized identity received Not found for the requirement URL. RLS, composite workspace constraints, ordinary-user machine-write denial, immutable scope/run artifacts, append-only review audit, and cross-workspace evidence rejection passed integration tests.
- The hostile document case did not influence prompts, schemas, status, retrieval, tools, secrets, or application behavior. The provider had no tools or secret access; `store:false` was used. Artifacts contain no credentials, authorization headers, full prompts, hidden reasoning, or confidential content.

## Three-run repeatability evidence

Three completely fresh full `gpt-5.5-2026-04-23` runs used the identical fingerprint and each independently achieved every required accuracy/schema metric at `1.0`, with zero repairs, retries, incompletes, critical false-supported/false-active results, false merges, or injection influence. Per-run cost/latency was `$0.618405`/91.805 seconds, `$0.511052`/92.698 seconds, and `$0.499123`/85.044 seconds. Aggregate usage was 268,866 input, 16,771 output, 1,101 reasoning, 48,640 cached tokens, 269.547 seconds, and `$1.628580`.

## Final regression results

- Unit: 183/183 passed, covering deterministic dates/numbers/scope, semantic contracts, malformed/refused/incomplete/timeout/provider/budget paths, fingerprint/provenance, scope, injection, duplicate and relationship rules.
- Supabase integration: 57/57 passed sequentially, including worker persistence, authorization/RLS, cross-workspace denial, ordinary-user fabrication denial, review audit, idempotency, failure paths, budget cancellation and parent/child persistence.
- Mock Playwright: 17/17 passed with fresh independently owned servers/sessions. Live-smoke read-only UI audit: 1/1 passed.
- Deterministic 24-candidate evaluation: all source/precedence/date/number/evidence/parser/proof/duplicate/schema metrics `1.0`; zero critical false results, false merges, repair, incomplete, or injection influence.
- Lint, formatting, strict type-check, production build, offline production dependency audit (zero vulnerabilities), secret scan, and invariant checklist: passed.

## Invariant checklist

- Evidence-gated display, separated extraction/verification, deterministic state control, complete provenance, hostile-document treatment, no tool/secret authority, critical human review, distinct state axes, visible uncertainty, synthetic-only data, workspace isolation, RLS, server-only secrets, auditability, and deterministic fallback all pass.
- No UI path presents a machine finding as compliant, approved, complete, ready to submit, or human-reviewed. Unsupported candidates cannot become verified. Extraction candidates remain immutable and unverified.

## Artifacts and commits

- Raw bounded smoke report: `artifacts/evaluation/phase4-production-worker-smoke-56dc341b-71f0-4e03-b5fb-e25586ccb5b7.json`
- Independent audit: `artifacts/evaluation/phase4-production-worker-smoke-56dc341b-71f0-4e03-b5fb-e25586ccb5b7-success-audit.json`
- UI screenshots: `artifacts/evaluation/phase4-production-worker-smoke-register.png` and `phase4-production-worker-smoke-evidence.png`
- Production alignment: `68657abae3118ba995b6cdc0799420616d22a73e`
- Complete synthetic scope: `f601bafdbda568677ca8ad3ab29f4bdab30961ef`, documentation `bafd961581a1faba37e0835213896c452c956fba`
- Provenance correction: `deab54cfe2c1f55d0d93e936c9a8bc4e8556cf5c`, documentation `556b8aa5b91174028e271c185a073668bd6b0c10`
- Provenance guard tests: `22425e8ec2ba07cdac1d0e6e8e27403ecfed9851`
- Passing smoke artifacts/audit: `c13feaf74a9c50437ddd43fdd36d893040818e54`
- The commit containing this report and the final documentation is recorded in the final handoff and repository log.

## Residual limitations

- Perfect frozen-fixture performance does not prove accuracy on arbitrary procurement documents; parser/OCR, novel amendments, tables, and provider drift remain risks.
- Human review is still pending for every smoke finding. Phase 4 source verification does not establish bidder compliance or readiness.
- General live verification and confidential/user-provided data remain disabled. Contractual ZDR has not been established.
- Phase 5 checklist/readiness logic is not implemented by this closure.

**Phase 4 completion decision:** every Phase 4 engineering, safety, live-qualification, production-path, persistence, UI, isolation, cost, regression, documentation, and invariant gate is satisfied for the controlled synthetic/demo scope. Phase 4 is complete.
