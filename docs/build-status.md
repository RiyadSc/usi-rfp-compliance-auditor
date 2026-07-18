# Build Status

## Current phase: Phase 4 output-budget remediation complete offline — live requalification not authorized

Last updated: 2026-07-18.

## Phase 4 — Independent source verification and human review (GATE NOT COMPLETE)

### Gate decision

- The user increased the authoritative Phase 4 ceiling to `$15.00` and the remediation sub-ceiling to `$12.00`. The authoritative ledgers remain Phase 4 `$9.127362`, remediation `$7.445068`, and cumulative API `$9.535903`; this remediation made no provider call.
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
- Phase 4 ledger spend: `$9.127362` of `$15`; remediation spend: `$7.445068` of the authorized `$12`; cumulative API spend: `$9.535903`. No live call occurred during the output-budget remediation.
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
- [ ] Verification model gate passed — **NO; Phase 4 remains incomplete.**

### Remaining gate before Phase 4 can close

The most recent fresh GPT-5.5 repetition failed and was not rerun. The authorized zero-live output-budget remediation changed reasoning effort, split output budgets, prompt concision, and a forbidden schema combination without changing the frozen fixture, expected answers, retrieval, deterministic facts, decision rules, or qualification thresholds. No targeted probe, full live requalification, other model, application smoke, selection, or Phase 5 work is authorized. Live verification remains disabled; human-only review with deterministic mock findings remains the demo mode.

### Phase 4 regression gate

- Lint, formatting verification, and type-check: passed on the output-budget-remediation state. The production Next.js build also passed with process binding permitted.
- Unit: 132 passed, including 20 targeted-remediation, 23 semantic-contract, 19 typed date/number, and 6 evaluator-integrity tests.
- Integration: 54 passed against the configured Supabase project, including semantic-contract rejection, atomic parent/child persistence, plus Phase 4 RLS, linkage, immutability, idempotency, audit, failure paths, budget cancellation, and isolation.
- Mock Playwright: 17 passed with `PHASE4_LIVE_VERIFICATION_ENABLED=false` and `E2E_LIVE_OPENAI=0`; no live model calls occurred.
- Secret scan: passed across tracked files and the client bundle.
- Targeted five-candidate mock probe: 5/5 candidates and six calls passed with clean first-pass Pass A/Pass B, zero repairs, exact expected statuses, and no injection influence.
- Deterministic semantic/facts-v4/decision-v6/evaluator-v3 fixture: Pass A and Pass B metrics, source status, precedence, date, number, quote, citation, proof, duplicate, and every schema layer are 1.0; zero critical false-supported, false-active, false merges, incompletes, repairs, or injection influence. It remains a fallback/regression result, not a live qualification.
- Invariant checklist above: passed except the explicitly failed live verification-model gate.

## Phase 3 — Candidate extraction, retrieval, providers (COMPLETE)

### Provider (live account verification)

- OpenAI Responses API + embeddings verified against the live key in gitignored `.env.local`.
- Extraction model selected by live known-answer evaluation: `gpt-5.4-mini-2026-03-17` (`low` reasoning).
- The former provisional Phase 4 model did not pass the Phase 4-specific gate; no live verification model is approved.
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
