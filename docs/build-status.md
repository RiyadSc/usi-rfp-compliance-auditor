# Build Status

## Current phase: Phase 7 complete — Phase 8 not started

Last updated: 2026-07-18.

## Phase 7 — Deterministic reporting and export (COMPLETE)

- `report-input-v1`, `report-aggregation-v1`, `report-schema-v1`, `executive-readiness-report-v1`, `report-csv-v1`, `report-html-v1`, and versioned language/download policies deterministically report one explicit compatible Phase 4–6 run chain. All source, precedence, proof, parser, workflow, artifact, blocker, proposal, and human-review axes remain separate.
- Applied migrations `20260718000021`–`000022` add six workspace-scoped report/export tables, strict composite scope validation, immutable history, partial-hash idempotency, unique export generations, RLS/member-SELECT-only policies, and private `workspace-exports` storage with hidden object paths.
- The application provides report history/detail, executive and detailed views, phase/severity/review/type filters, pagination, exact evidence drill-down, original-page navigation, private formula-safe CSV/escaped HTML exports, five-minute audited download grants, regeneration, revocation, and seven-day retention metadata/cleanup.
- `reporting-known-answer-v1` passes all aggregate, blocker, missing-artifact/form, review, source-coverage, evidence, provenance, export, watermark, and section metrics at `1.0`, with zero false missing artifacts, prohibited conclusions, CSV injection vulnerabilities, cross-workspace leaks, unauthorized downloads, destructive overwrites, or provider calls.
- Direct database inspection confirms RLS on all six tables, exactly one member SELECT policy per table, no authenticated `workspace-exports` object policy, a private 10 MiB CSV/HTML bucket, and both migrations recorded on project `uxmxkdjschbekkbnweby`.
- Final gates: 280 unit tests, 72 sequential Supabase integration tests, 20 passed mock Playwright tests with one opt-in live-smoke UI audit skipped, perfect Phase 6/7 deterministic evaluations, lint, formatting, type-check, production build, zero-vulnerability high-severity offline dependency audit, secret scan, and invariant checklist.
- Phase 7 made zero provider calls and spent `$0.00`. Phase 4 model/fingerprint/rollout controls are unchanged, general live verification remains disabled, and Phase 8 has not begun. Detailed evidence is in `docs/phase7-completion-report.md` and `artifacts/evaluation/phase7-reporting-known-answer-v1.json`.

## Phase 6 — Proposal draft audit (COMPLETE)

- `proposal-section-parser-v1`, `proposal-claim-segmenter-v1`, `proposal-response-matcher-v1`, `proposal-support-policy-v1`, `proposal-contradiction-v1`, `proposal-finding-severity-v1`, and `proposal-audit-evaluator-v1` provide a deterministic, evidence-first audit over immutable Phase 4 findings and Phase 5 checklist records.
- Additive migration `20260718000020_phase6_proposal_audit` creates immutable proposal revisions, audit runs, page-anchored sections, atomic claims, requirement matches, evidence, coverage assessments, findings, finding evidence, and append-only human resolutions. All ten tenant tables have RLS and workspace constraints; ordinary members receive read access only to their workspace.
- The application supports proposal-draft upload through the existing private PDF path, deterministic audit/re-audit, revision lineage, exact proposal/source page navigation, separate coverage/support/consistency/human/workflow axes, and controlled resolution history. Phase 4 and Phase 5 records are never rewritten.
- `proposal-audit-known-answer-v1` passes all 12 planted cases. Critical contradiction precision/recall, missing-response precision/recall, unsupported-claim precision, human-proof classification, insurance/date accuracy, evidence/citation validity, and wrong-procurement detection are `1.0`; false critical support, false merges, destructive merges, cross-workspace leaks, and injection influence are zero.
- Final gates: 254 unit tests, 67 sequential Supabase integration tests, 19 passed mock Playwright tests with one Phase 4 live-only test skipped, lint, formatting, type-check, production build, high-severity dependency audit, secret scan, and invariant checklist.
- The high-severity dependency gate passes. Two pre-existing moderate PostCSS advisories remain under the existing Next.js dependency; the only suggested forced fix is incompatible and remains tracked as a residual risk.
- Phase 6 made zero AI/provider calls and spent `$0.00`. General live Phase 4 verification remains disabled, `MockProvider` remains the default, and Phase 7 has not begun.
- Detailed closure evidence is in `docs/phase6-completion-report.md`; the non-secret expected-versus-actual artifact is `artifacts/evaluation/phase6-proposal-audit-known-answer-v1.json`.

## Phase 5 — Deterministic checklist and blockers (COMPLETE)

- `checklist-eligibility-v1`, `checklist-category-v1`, `checklist-generator-v1`, `checklist-blockers-v1`, `checklist-readiness-v1`, and `checklist-schema-v1` deterministically project immutable Phase 4 findings into auditable workflow records. Phase 4 model/configuration contracts are unchanged and unrestricted live verification remains disabled.
- Applied additive migrations `20260718000017`–`000019` add generation runs, stable items, source links, parent/child and duplicate relationships, required artifact/link history, assignments, append-only waivers/exceptions, blockers/resolutions, readiness snapshots, RLS, cross-scope triggers, and controlled RPCs.
- The requirement checklist and detail surface support filtering, readiness counts, exact evidence and original-page navigation, owner/reviewer assignment, guarded status transitions, artifact link/review/removal, exception notes, waiver request/review, blocker resolution, and audit history. Machine status and human review remain visibly separate.
- `checklist-five-missing-forms-v1` detects all five planted forms with precision 1.0, recall 1.0, evidence/citation validity 1.0, zero false blockers, and zero false merges. Artifact: `artifacts/evaluation/phase5-five-missing-forms-v1.json`.
- Direct database inspection confirms RLS on all 12 Phase 5 tenant tables and exactly one workspace-member SELECT policy per table; ordinary users cannot fabricate machine findings. Two-user integration/browser tests pass cross-workspace denial.
- Final gates: 239 unit tests, 61 sequential Supabase integration tests, 18 passed mock Playwright tests (one opt-in Phase 4 audit skipped), lint, formatting, type-check, production build, high-severity dependency audit, secret scan, and invariant checklist.
- Dependency audit reports two transitive moderate PostCSS advisories under Next.js; the high-severity gate passes. The suggested forced remediation would install a breaking/inappropriate Next version and was not applied. This is tracked as a residual dependency risk.
- Phase 5 made zero OpenAI/provider calls and spent `$0.00`. No confidential data was used. Phase 6 is not authorized and has not begun.

## Latest Phase 4 operational result

- The fresh production application/worker smoke passed against immutable synthetic scope `40000000-0000-4000-8000-000000000001`. Verification run `56dc341b-71f0-4e03-b5fb-e25586ccb5b7` used the selected GPT-5.5/low fingerprint and the exact required input hash `2ef68e32c45ebe4ab089ec34efbbfcc80722530d1b1618f7e71d4798de1a83c3`.
- All 24 frozen findings matched source-support, precedence, and proof answers. Forty model calls (24 entailment, 14 challenge, two duplicate) completed with first-pass adherence `1.0` and zero repairs, retries, incompletes, refusals, timeouts, critical false-supported, critical false-active, false merge, or injection-influence event.
- The independent database audit passed every provenance, persistence, evidence, relationship, schema, safety, and budget gate. The UI audit rendered all 24 rows, anchored exact source text, opened PDF page 7, exposed machine/run provenance and review controls, and denied the unauthorized workspace.
- Smoke usage was 89,863 input, 5,575 output, 350 reasoning, and 20,736 cached tokens; summed model-call latency was 97.669 seconds and actual cost was `$0.523253`. Forty spend rows reconcile to model-call cost within `$0.000001`.
- Final authoritative ledgers are Phase 4 `$12.100797/$15`, remediation `$9.283190/$12`, and cumulative API `$12.509338`.
- Post-smoke gates pass: 183 unit, 57 sequential Supabase integration, 17 isolated-session mock Playwright, one read-only live-smoke UI assertion, perfect 24-candidate deterministic evaluation, lint, formatting, type-check, production build, offline dependency audit, secret scan, and the invariant checklist.
- `gpt-5.5-2026-04-23` with `low` reasoning and fingerprint `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b` is selected and pinned for Phase 4 verification. Unrestricted live verification remains disabled; only the explicit synthetic/demo harness may invoke it pending a separate rollout decision.

## Phase 4 — Independent source verification and human review (COMPLETE)

### Gate decision

- **Approved 2026-07-18.** The corrected production-path smoke, independent persistence audit, live UI audit, three-run frozen-fixture repeatability evidence, all offline regressions, and final invariant review pass. Detailed closure evidence is in `docs/phase4-completion-report.md` and the non-secret smoke artifacts under `artifacts/evaluation/phase4-production-worker-smoke-56dc341b-71f0-4e03-b5fb-e25586ccb5b7*`.
- The selected Phase 4 verification configuration is pinned, but ordinary/confidential-workspace live use remains disabled. This is a rollout constraint, not an incomplete Phase 4 engineering gate.

- Exactly one complete immutable scope now binds the source-controlled `verification-cases-v2` workspace, synthetic identity, 17-page PDF/document set, analysis run, all 24 frozen candidates, expected-answer mapping, candidate/document/answer hashes, and approved compatibility fingerprint. One-candidate test scopes remain immutable legacy records and cannot pass the complete-scope harness.
- Provisioning is repository-owned and idempotent. Migration `20260718000016_phase4_complete_synthetic_scope` adds complete-scope/hash constraints while preserving legacy rows; `scripts/provision-phase4-synthetic-scope.mts` verifies project `uxmxkdjschbekkbnweby`, generates and uploads the deterministic synthetic PDF, validates every row/hash, and inserts the marker last. A second run returned the identical scope without writes or spend.
- The smoke harness dry run accepted only scope `40000000-0000-4000-8000-000000000001`, reached `final_provider_access_boundary`, and stopped with `providerConstructed=false` and `providerCalled=false`. No OpenAI call or spend occurred; live verification remains disabled.
- Zero-live production alignment is complete. The worker now uses the exact approved GPT-5.5/low configuration with 2 contexts, 1,800/1,600/600 limits, 90-second timeout, and fingerprint `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`; any model or material configuration drift fails before provider construction.
- The fingerprint persists on `analysis_runs`, `verification_runs`, and `model_calls`. An immutable, RLS-enabled, service-only `phase4_synthetic_smoke_scopes` marker binds exact workspace, user, documents, analysis run, candidates, fixture, hash, and fingerprint. The dedicated harness has no arbitrary workspace or fallback path and sets its process-local live flag only after every preflight passes.
- Offline gates pass: 166 unit, 56 Supabase integration, 17 mock Playwright, perfect 24-candidate deterministic evaluation, lint, formatting, type-check, production build, secret scan, and invariant checklist. No provider call occurred.
- The first mock Playwright attempt exposed Phase 3 budget reads that included Phase 4 ledger rows. Phase 3 web/worker reads now explicitly filter `phase3`; the full 17-test rerun passed and both phase ceilings remain independent.
- Ledgers remain Phase 4 `$10.965484/$15`, remediation `$9.283190/$12`, and cumulative API `$11.374025`. A renewed `$0.75` controlled smoke would project `$11.715484` and `$10.033190`, but is not authorized. General live verification remains disabled and Phase 5 remains blocked.
- Two additional authorized fresh full GPT-5.5 repetitions ran sequentially after the first full pass. Each independently passed every gate under the identical full fingerprint. Across all three full repetitions, candidate status/precedence vectors were identical; every required accuracy and schema metric was `1.0`; and there were zero repairs, retries, incompletes, critical false findings, false merges, semantic changes, or injection influence.
- Three-run totals were 120 calls, 268,866 input, 16,771 output, 1,101 reasoning, 48,640 cached tokens, 269.547 seconds summed latency, and `$1.628580`. The two Stage 3 repetitions added `$1.010175`, below their combined `$2.70` authorization.
- Final authoritative ledgers are Phase 4 `$10.965484/$15`, remediation `$9.283190/$12`, and cumulative API `$11.374025`.
- The evidence supports proposing `gpt-5.5-2026-04-23` at `low` reasoning for Phase 4 verification. The model is not yet selected or enabled. A separately authorized controlled synthetic application/worker smoke and explicit selection decision remain required; Phase 5 is blocked.
- One separately authorized completely fresh full `gpt-5.5-2026-04-23` repetition passed all single-run gates under full fingerprint `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`. All 24 frozen candidates received the expected source and precedence statuses; every required accuracy, evidence, duplicate, and schema metric was `1.0`.
- The full run made 40 calls: 24 Pass A, 14 Pass B, and two duplicate classifications. It used 89,625 input, 5,676 output, 455 reported reasoning, and zero cached tokens; summed latency was 91.805 seconds. There were zero repairs, retries, incompletes, refusals, timeouts, critical false-supported/false-active findings, false merges, or injection influence. Actual cost was `$0.618405`.
- Authoritative post-run ledgers are Phase 4 `$9.955309/$15`, remediation `$8.273015/$12`, and cumulative API `$10.363850`. Two additional identical repetitions have a conservative combined maximum of `$2.70`, projecting `$12.655309/$15` and `$10.973015/$12`; they fit both ceilings but are not authorized.
- This single passing full repetition does not select the model. Repeatability repetitions, application smoke, model selection, and Phase 5 remain blocked; live verification remains disabled.
- One separately authorized fresh `gpt-5.5-2026-04-23` five-candidate probe passed under targeted fingerprint `c9976dc1127fe21900dacf0b5980a7a49dbbb8c349aa9eba347a1b1f22cab416`. All five expected source/precedence/proof axes were correct; Pass A, Pass B, and final-decision schema adherence were `1.0`; there were zero repairs, incompletes, refusals, timeouts, retries, critical false-supported/false-active findings, false merges, or injection influence.
- The meeting candidate returned `partially_entails` on its first pass, final `partially_supported/active`, and exactly one mismatch: `Failure to attend disqualifies an offeror`. Its date matched, party scope remained `unknown`, and material scope differences remained empty.
- Usage was 14,371 input, 896 output, zero reasoning, and zero cached tokens across six calls; summed latency was 16.367 seconds. Actual cost was `$0.098735`, below the authorized `$0.35`. Authoritative ledgers are Phase 4 `$9.336904/$15`, remediation `$7.654610/$12`, and cumulative API `$9.745445`.
- Passing this targeted operational probe does not qualify or select the model. No full repetition, additional probe, other model, application smoke, or Phase 5 work is authorized. Live verification remains disabled.
- The failed meeting-consequence path has been remediated offline without a provider call. `verify-entailment-v7` / `verification-entailment-v5` explicitly maps reliable exact `parent_missing_material_condition` evidence with no deterministic mismatch to `partially_entails`, requires the exact consequence once as the sole mismatch, and forbids opposing evidence or parser concerns.
- The original first-pass and repaired raw objects were not retained and were not reconstructed. The retained validator path proves the first response was structurally valid `entails` with one exact supporting reference and no missing/opposing/parser fields; exact rationale, supporting object, material-present fields, repaired fields, and field-level fingerprint differences remain unavailable.
- Root cause was prompt ambiguity and field/instruction priority, not retrieval, facts, schema expressiveness, decision logic, evaluator logic, or output exhaustion. The prompt distinguished additive children but did not explicitly state that `parent_missing_material_condition` is a material omission. Facts v4, decision v6, low reasoning, 1,800/1,600/600 limits, zero-repair qualification, semantic-fingerprint rejection, and frozen expected answers are unchanged.
- Six focused cases now pass: omitted consequence, consequence included, date mismatch, meeting not established, explicit no-meeting evidence, and matching date with unknown party scope. The frozen 24-candidate deterministic fixture and five-candidate targeted mock probe are also perfect with zero repairs.
- Current compatibility fingerprints are full `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b` and targeted `c9976dc1127fe21900dacf0b5980a7a49dbbb8c349aa9eba347a1b1f22cab416`.
- No live test is authorized. A proposed single fresh targeted GPT-5.5 probe would retain a `$0.35` maximum and project Phase 4 `$9.588169/$15` and remediation `$7.905875/$12`, subject to a new ledger/fingerprint/clean-tree preflight and separate approval.
- One separately authorized fresh `gpt-5.5-2026-04-23` targeted probe ran against `verification-output-budget-prequalification-v1` at `low` reasoning under fingerprint `9b6ed1ac483d3c3b7882374ea7fb96f780b1e931dff9bf0890f8ff4edeac1c2c`. It **did not pass** and was not rerun.
- Four of five candidates passed cleanly. The meeting-consequence candidate's first Pass A asserted complete entailment despite immutable `parent_missing_material_condition` evidence. Its one controlled repair changed the semantic fingerprint, was rejected, and produced no final assessment. Pass A first-pass/schema adherence and final-decision schema coverage were therefore `.8`; the zero-repair gate failed.
- Output-budget remediation itself was operationally effective in this probe: six calls completed with 1,380 output tokens, only 263 reasoning tokens, zero incompletes, refusals, timeouts, or retries. Pass B was clean. Deterministic numerical opposition correctly converted the `$4M` candidate against active `$3M` evidence to `contradicted`; prompt injection had no influence.
- The probe cost `$0.110807`, below the authorized `$0.35`. Authoritative ledgers are now Phase 4 `$9.238169/$15`, remediation `$7.555875/$12`, and cumulative API `$9.646710`.
- The full qualification repetition is not authorized. Live verification remains disabled, no model is selected, no application smoke ran, and Phase 5 remains blocked. Detailed bounded evidence is in `artifacts/evaluation/phase4-output-budget-prequal-gpt55-20260718a-failure-trace.json`.
- Before this probe, the user increased the authoritative Phase 4 ceiling to `$15.00` and the remediation sub-ceiling to `$12.00`; the preceding zero-live remediation left Phase 4 `$9.127362`, remediation `$7.445068`, and cumulative API `$9.535903`.
- Output-budget compatibility is now `low` reasoning with separate Pass A/Pass B limits of `1,800`/`1,600` tokens. The strict bounded schemas have conservative maximum structured-answer budgets of 500/650 tokens, leaving approximately 1,300/950 tokens for provider reasoning while avoiding the prior 1,200/1,000 shared-budget exhaustion.
- `verify-entailment-v6` / `verification-entailment-v4` structurally fixes `descriptiveOnly` to `false`. Descriptive/disclaimed non-obligations resolve to `insufficient` unless active evidence explicitly establishes the opposite proposition, so the invalid `contradicts + descriptiveOnly=true` first-pass combination is no longer representable by the strict schema.
- `verify-challenge-v4` / `verification-challenge-v4` directs a grounded, immediate decision and forbids speculative re-deliberation. Existing evidence grounding, deterministic overrides, fail-closed handling, zero-repair qualification, and frozen answers remain unchanged.
- A five-candidate `verification-output-budget-prequalification-v1` operational probe is available for a separately authorized live call. It tests prior Pass A/Pass B exhaustion, the invalid semantic combination, deterministic numerical contradiction, and injection/non-obligation handling. Passing it cannot qualify a model or replace the full 24-candidate/40-assessment repetition.
- Full and targeted compatibility fingerprints are `d0bcc149b74c284e9b67f29d66d89598c31babbe718a15fc7a2292f92f824299` and `9b6ed1ac483d3c3b7882374ea7fb96f780b1e931dff9bf0890f8ff4edeac1c2c`, respectively.

- The corrected frozen fixture is `verification-cases-v2`: 17 synthetic pages and 24 deterministic candidates, including explicit supersession, a genuine unresolved addendum conflict, materially distinct similar requirements, parser damage, proof needs, and prompt injection.
- The remediated pipeline assesses one candidate at a time with unchanged `verify-entailment-v3`, conditionally challenges positive results with unchanged `verify-challenge-v1`, and lets deterministic engine `verification-decision-v5` derive and strict-Zod-validate the final machine-only status.
- Three pinned candidates completed three scored repetitions each at identical `medium` reasoning. **No model qualified.** Across nine runs there were eight critical false-active findings, one critical false-supported finding, and six runs with at least one schema/incomplete failure.
- Root cause: all eight false-active results were candidate 22. Retrieval and injection detection were correct, but decision v3 used cited-page existence alone to set `active`. The semantic calls did not control that final precedence value. The detailed trace is `artifacts/evaluation/phase4-false-active-root-cause.json`.
- The zero-live audit found that the historical date and number metrics did not measure deterministic fact accuracy: evaluator v1 counted a fact correct only when final source status and precedence both matched. It also mislabeled a conjunction of Pass A, Pass B, and duplicate-call schema adherence as “final schema”; it never validated the decision-engine result.
- Provider-neutral `verification-facts-v3`, `verification-decision-v5`, `verification-final-assessment-v1`, and `verification-evaluator-v2` now type and compare dates/numbers by semantic role, operator, unit, time/timezone, and material scope; validate the final record; score status axes independently; and reject incompatible resumed artifacts. Frozen fixture answers and both model prompts/schemas remain unchanged.
- One newly authorized, completely fresh `gpt-5.4-2026-03-05` `medium` repetition used those exact versions with one candidate and at most two contexts per assessment. It **did not qualify**: three Pass A calls ended `incomplete/max_output_tokens`, source-status accuracy was `.541667`, precedence and proof accuracy were `.875`, and Pass A/final-decision schema coverage was `.875`. There was no rerun.
- The run retained zero critical false-supported, zero critical false-active, zero injection influence, supported precision/date/number/quote/citation/parser/duplicate metrics of `1.0`, and zero false merges. Eleven candidate-level failures are traced in `artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-failure-trace.json`.
- Zero-live semantic remediation now uses `verify-entailment-v4` / `verification-entailment-v2` and `verify-challenge-v2` / `verification-challenge-v2`. Both outputs are strictly bounded, class-discriminated by Zod refinements, and post-validated against the immutable candidate, supplied exact evidence, and deterministic fact envelope before the decision engine can consume them.
- The three Stage 1 incompletes were provider-normalized `max_output_tokens`, not timeout, refusal, interruption, or context-window failure. Each used exactly 1,200 completion tokens, of which reasoning consumed 1,034 (meeting consequence), 1,011 (bid bond), and 951 (old liability), leaving only 166, 189, and 249 tokens for the formerly verbose structured object. The replacement schema ordinarily serializes in a few hundred tokens and preserves the exact incomplete reason prospectively.
- Semantic boundary definitions now distinguish complete material entailment from stylistic/synonymous/additive wording, partial entailment from explicit opposition, and insufficient evidence from contradiction. Pass B objections must be candidate- and evidence-grounded; deterministic guards reject speculative objections and facts inconsistent with the immutable envelope.
- One authorized fresh `gpt-5.5-2026-04-23` `medium` repetition then used the exact v4/v2 semantic contracts and unchanged frozen v2/v3/v5/v2/v1 compatibility fingerprint. It **did not qualify**: source-status accuracy was `.833333`, and five Pass A calls plus one Pass B call required controlled repair. It was not rerun.
- Four candidates missed source status: meeting consequence (`partially_supported` expected, `contradicted` actual), incorrect liability limit (`contradicted` expected, `partially_supported` actual), staffing-plan parent attachment (`supported` expected, `partially_supported` actual), and Addendum 4 insurance statement (`supported` expected, `partially_supported` actual). The bounded trace and mixed semantic/deterministic causes are in `artifacts/evaluation/phase4-stage1-gpt55-semantic-v4-20260718a-failure-trace.json`.
- Safety and deterministic gates held: zero critical false-supported/false-active, zero injection influence, precedence/date/number/quote/citation/parser/proof/duplicate accuracy `1.0`, zero false merges, zero incomplete/refused/timed-out results, and every post-repair schema layer valid. Six observable repairs nonetheless fail the clean structured-output qualification requirement.
- Zero-live targeted remediation now uses `verification-facts-v4`, `verification-decision-v6`, `verify-entailment-v5` / `verification-entailment-v3`, `verify-challenge-v3` / `verification-challenge-v3`, and `verification-evaluator-v3`. Date equality is independent from unknown party/scope; explicit comparable scope differences remain separately material. Exact active same-role/scope/unit numerical opposition now controls before semantic partiality. Additive parent/child obligations remain separate atomic records, while omitted material consequences force partial support. Speculative Pass B scope objections are rejected and cannot downgrade Pass A.
- The six historical first-attempt repair objects are not recoverable: `store:false` was used and only normalized validation errors plus repaired objects were retained. Five failures were forbidden Pass A field combinations; the sixth was an ungrounded Pass B evidence/scope objection. They remain non-clean calls and are not reclassified as first-pass schema-adherent. Full taxonomy and token totals are in `artifacts/evaluation/phase4-targeted-remediation-v1.json`.
- The offline frozen evaluation is 24/24 with source status, supported precision, precedence, date, number, quote, citation, parser, proof, duplicate precision/recall, and every schema layer at `1.0`; zero critical false-supported/false-active, false merges, repairs, incompletes, or injection influence.
- Historical candidate-level Pass A, Pass B, and fact envelopes were not retained. Their exact values remain explicitly unavailable rather than reconstructed. Full traces and limitations are in `artifacts/evaluation/phase4-zero-live-diagnostic-v1.json`.
- No successful prompt-injection influence or dangerous false merge occurred. All counted supported quotes were exact/normalized-exact.
- Live verification remains disabled (`PHASE4_LIVE_VERIFICATION_ENABLED=false`). `MockProvider` remains the demo fallback, and every machine finding remains human-review pending.
- Phase 4 ledger spend: `$10.965484` of `$15`; remediation spend: `$9.283190` of the authorized `$12`; cumulative API spend: `$11.374025`. The two passing Stage 3 repetitions added `$1.010175`.
- Phase 4 is **not complete**. No model is selected, no live application verification smoke was run, and Phase 5 remains blocked.

### Implemented Phase 4 scope

- Independent asynchronous `requirements-verify` worker stage with separate run/job/prompt/schema/model-call/retry/UI states.
- Candidate-centered bounded retrieval, immutable typed `verification-facts-v4`, separate Pass A/Pass B calls, strict `verification-final-assessment-v1`, deterministic final status, explicit addendum and atomic parent/child relationships, and conservative pairwise duplicate proposals.
- Multi-axis model: source support, precedence, proof requirement, and append-only human review decisions remain distinct.
- Immutable extraction candidate proposals; append-only/versioned machine findings; machine-only status cannot become compliant/approved/ready.
- Workspace/run/candidate-scoped retrieval including cited/neighbor pages, lexical hybrid retrieval, exact keywords, addenda/amendments, conflicts, dates, numbers, definitions, and repeats; every supplied page is recorded.
- NFKC/quote/whitespace normalization with exact, normalized-exact, fuzzy-candidate, and not-found outcomes. Fuzzy evidence never qualifies as validated quotation evidence.
- Deterministic date/number parsing, units/operators/original strings, explicit addendum/ambiguity handling, and non-destructive duplicate relationships with false-merge guards.
- Requirement register filters and evidence viewer with original PDF page, text-level anchor, conflicting/addendum evidence, parser warnings, machine provenance, review controls, and review history.
- RLS SELECT-only machine tables, service-role worker writes, controlled authenticated review RPC, cross-workspace evidence triggers, and append-only review/audit records.

### Phase 4 migrations

| Migration                                         | Objects                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260717000011_phase4_verification`              | `verification_runs`, `verification_retrieval_chunks`, `verification_findings`, `verification_evidence`, `requirement_relationships`, `human_review_decisions`; Phase 4 ledger/model-call fields; review RPC; RLS and scope/immutability triggers |
| `20260717000012_phase4_scope_hardening`           | Composite verification-run/workspace relationship key; page/document evidence consistency; relationship, human-review revision, and model-call scope triggers                                                                                    |
| `20260717000013_phase4_candidate_verification_v3` | Deterministic fact envelopes, Pass A/Pass B intermediate state, challenge status, versioned final-decision metadata, and relationship evidence hardening                                                                                         |
| `20260717000014_phase4_incomplete_reason`         | Observable normalized provider incomplete reason on model-call records                                                                                                                                                                           |
| `20260718000015_phase4_production_alignment`      | Qualified compatibility fingerprints on analysis/verification/model-call records; immutable service-only synthetic smoke scopes; workspace/identity/document/candidate validation                                                                |
| `20260718000016_phase4_complete_synthetic_scope`  | Complete-scope version, document-set and expected-answer hashes, exact 24-candidate/one-document constraints, and legacy-scope exclusion                                                                                                         |

### Phase 4 invariant check

- [x] No UI path displays machine-supported as human-approved while review is pending.
- [x] Extraction candidates remain `unverified`; verification creates linked versioned findings and cannot rewrite candidates.
- [x] All new tables, retrieval rows, evidence references, actions, and routes carry workspace scope; cross-workspace tests pass.
- [x] RLS is enabled on every Phase 4 table; ordinary users cannot fabricate or edit machine findings.
- [x] Document content remains untrusted data; verifier has no tools, secrets, web, file search, MCP, code, email, or database access.
- [x] Parser uncertainty, unsupported, contradicted, partial support, precedence conflict, proof needs, and review-pending states are separate and visible.
- [x] Review decisions are append-only/revision-linked and generate immutable audit events.
- [x] Fixtures are synthetic only; live calls used `store:false` and no real USI documents.
- [x] Deterministic MockProvider fallback remains operational and injection-inert.
- [x] Verification model qualification gate passed across three fresh full GPT-5.5 repetitions; production path now matches the approved fingerprint.
- [x] Corrected controlled synthetic application/worker smoke passed with the exact complete-scope input hash, 24/24 findings, persisted provenance, UI/source navigation, ledger reconciliation, and zero safety/reliability failures.

### Phase 4 closure

All verification-specific live qualification, repeatability, production-path, immutable provenance, persistence, UI, security/isolation, financial, regression, documentation, and invariant gates pass. Detailed evidence is in `docs/phase4-completion-report.md`. General live verification remains rollout-disabled; controlled synthetic/demo verification and deterministic mock/human review remain available.

### Phase 4 regression gate

- Unit: 183 passed, including complete 24-candidate, date/number/scope, semantic contracts, malformed/failure paths, provenance hashes, exact/extra/missing scope, and provider-boundary controls.
- Integration: 57 passed sequentially against the confirmed Supabase project, including exact complete-scope binding, RLS no-op denial, privileged append-only enforcement, worker limits, fingerprint persistence, ownership, cross-workspace rejection, provider failures, budget cancellation and parent/child persistence.
- Mock Playwright: 17 passed in four isolated fresh-server/session runs with `E2E_LIVE_OPENAI=0`; the separate read-only completed-smoke UI audit also passed.
- Lint, formatting verification, strict type-check, production Next.js build, offline dependency audit (zero vulnerabilities), secret scan, and invariant review passed.
- Secret scan: passed across tracked files and the client bundle.
- Targeted five-candidate mock probe: 5/5 candidates and six calls passed with clean first-pass Pass A/Pass B, zero repairs, exact expected statuses, and no injection influence.
- Deterministic semantic/facts-v4/decision-v6/evaluator-v3 fixture: Pass A and Pass B metrics, source status, precedence, date, number, quote, citation, proof, duplicate, and every schema layer are 1.0; zero critical false-supported, false-active, false merges, incompletes, repairs, or injection influence. It remains a fallback/regression result, not a live qualification.
- Invariant checklist above: passed; no Phase 4 completion gate remains pending.

## Phase 3 — Candidate extraction, retrieval, providers (COMPLETE)

### Provider (live account verification)

- OpenAI Responses API + embeddings verified against the live key in gitignored `.env.local`.
- Extraction model selected by live known-answer evaluation: `gpt-5.4-mini-2026-03-17` (`low` reasoning).
- GPT-5.5/low passed the Phase 4-specific qualification and corrected production smoke, and is fingerprint-pinned for verification; general live verification remains disabled pending a separate rollout decision.
- Embeddings: `text-embedding-3-small` (1536-d).
- Strict `json_schema` structured output + Zod re-validation; `store: false` on Responses calls.
- **Do not claim ZDR** from `store: false` alone; account-level ZDR must be verified separately.
- Missing/`OPENAI_API_KEY` empty → `MockProvider` (demo and Playwright default).
- App-side ceiling: `PHASE3_SPEND_CEILING_USD=10` + `spend_ledger`. Final cumulative Phase 3 ledger spend: `$0.408541`.
- Full comparison and operational evidence: `docs/provider-decision.md` and `artifacts/evaluation/`.

### Completed work

- `@usi/ai`: schemas, MockProvider, OpenAIProvider, chunking, hybrid score/keyword/page-window helpers, cost/budget, retries, prompts with untrusted evidence delimiters.
- Worker `document-extract` job: index chunks → embed (RPC insert) → extract → persist unverified candidates + model_calls + spend.
- Web: start extraction action, analysis run UI with queued/running/completed/failed/budget_exceeded, **candidate / unverified** labeling, source-page links.
- Hybrid retrieval: FTS + pg_trgm indexes; `search_chunks_hybrid` RPC (workspace + analysis_run scoped); keyword scan + page-window expansion in TS.
- Known-answer eval harness: frozen 15-page/20-obligation synthetic fixture; four pinned live candidates plus Mock baseline.
- Live worker smoke: completed analysis/job, model metadata and ledger persisted, 22 candidates all `unverified`, source pages/UI presentation safe.
- Migrations `analysis_extraction` + `hybrid_retrieval_rpc`.

### Schema/migrations added

| Migration                             | Objects                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260717000009_analysis_extraction`  | `analysis_runs`, `document_chunks`, `chunk_embeddings`, `requirement_candidates`, `model_calls`, `spend_ledger`; vector/trgm; RLS SELECT for members; candidates status=`unverified` only |
| `20260717000010_hybrid_retrieval_rpc` | `search_chunks_hybrid`, `insert_chunk_embedding` (service_role only)                                                                                                                      |

### Data policy (Phase 3)

- Synthetic/public fixtures only; no real USI / PII / client / government-sensitive docs.
- United States API processing assumed for the demo account.
- No whole-PDF uploads to the model — page text → normalize → chunk → bounded extract.

### Out of scope when Phase 3 closed

Independent verification, verified status, checklist generation, proposal-draft auditing.

### Invariant check (Phase 3)

- [x] No UI path displays verified without evidence.
- [x] Extraction schema, DB constraint, worker mapping, live results, and smoke can write only `unverified`.
- [x] Workspace predicates and RLS remain on runs, chunks, calls, candidates, and retrieval.
- [x] Secret scan/key runtime checks passed; no key, headers, prompts, or document payloads are committed.
- [x] Injection fixture did not alter prompt hierarchy, schema, status, context, tools, secrets, or behavior.
- [x] Failure/refusal/incomplete/budget states remain explicit.
- [x] Model calls and spend are auditable; cumulative Phase 3 spend is `$0.408541` of `$10`.
- [x] Fixtures and smoke data are synthetic only.
- [x] MockProvider remains functional for keyless demo and ordinary Playwright.

### Final regression gate

- Lint: passed.
- Formatting verification: passed.
- Type-check: passed for all workspaces.
- Unit: 46 passed.
- Integration: 42 passed with live Supabase; the initial sandbox DNS failure was rerun with network access.
- Mock Playwright: 16 passed with `E2E_LIVE_OPENAI=0` and fresh owned servers.
- MockProvider fixture evaluation: completed, schema adherence and unverified-only invariant passed.
- Production build: passed; the initial sandbox-only Turbopack `EPERM` was rerun outside the sandbox.
- Secret scan: passed across tracked files and the client bundle.
- Evaluation artifacts: seven valid JSON files; no key, authorization header, full prompt envelope, or unredacted payload was detected.

## Phase 2 — Document ingestion and page parsing (COMPLETE)

### Playwright coverage map (gate-verified)

See `tests/e2e/documents.spec.ts` header comment. Scenarios: successful PDF upload, processing states, listing, page navigation, text/warnings, invalid extension, fake PDF, oversized, parse-failure, unauthorized URL, cross-workspace denial, deletion. Async waits use Playwright expect polling (no fixed sleeps).

### Completed work

- `@usi/documents`: filename/MIME/magic/size/page validation, SHA-256, state machine, error normalization, `ParserAdapter` + `PdfJsParserAdapter`, noop malware interface.
- Server-authorized upload: create intent → signed upload URL → finalize → `processing_jobs` + pg-boss enqueue.
- `apps/worker`: pg-boss `document-parse`; pages; health `:3001`.
- Documents UI: upload, list, viewer, soft delete.
- Migrations 0005–0008.

### Schema/migrations (Phase 2)

| Migration                                     | Objects                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `20260717000005_documents_ingestion`          | `upload_intents`, `documents`, `parse_runs`, `document_pages`; SELECT RLS; Storage INSERT/DELETE policies dropped |
| `20260717000005_documents_upload_parse`       | `processing_jobs`                                                                                                 |
| `20260717000006_pgboss_lockdown`              | revoke `anon`/`authenticated` on `pgboss`                                                                         |
| `20260717000007_align_documents_policies`     | drop `upload_intents_insert`                                                                                      |
| `20260717000008_documents_soft_delete_select` | `documents` SELECT requires `deleted_at IS NULL`                                                                  |

## Phase 1 — Foundation (COMPLETE)

See prior entries. Migrations 0001–0004; auth; workspaces; secret scan.

## Phase 0 — Read, inspect, plan (COMPLETE)

See `docs/implementation-plan.md`.
