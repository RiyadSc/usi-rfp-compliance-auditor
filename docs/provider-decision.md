# Provider Decision — Phase 3 Extraction and Phase 4 Verification

Date: 2026-07-17. Phase 3 extraction is approved. The Phase 4 verification comparison rejected every provisional candidate, so no live verification model is approved.

## Decision summary

1. **Phase 3 extraction:** OpenAI Responses API with pinned `gpt-5.4-mini-2026-03-17`, reasoning `low`, strict JSON Schema, server-side Zod validation, `store: false`, bounded timeout/retry, and forced `unverified` status. It tied the best live quality result at the lowest evaluated cost and latency.
2. **Phase 4 verification:** no model selected. Pinned GPT-5.5, GPT-5.4, and GPT-5.4 mini were compared three times each at `medium`; all failed at least one non-negotiable verification gate. Live verification remains disabled.
3. **Embeddings:** `text-embedding-3-small` (1536 dimensions in this application) at $0.02/1M tokens. It is sufficient for the existing hybrid retrieval path and was verified in the worker smoke.

`MockProvider` remains the deterministic demo, test, Playwright, and keyless fallback.

## Live account discovery and suitability

The live project `/v1/models` enumeration confirmed all exact IDs below. Each evaluated pin also completed a minimal Responses API strict-JSON-Schema request.

| Candidate    | Live pin                  | Responses | Strict schema probe | Reasoning supported            | Context / max output | Standard price per 1M input / cached / output |
| ------------ | ------------------------- | --------- | ------------------- | ------------------------------ | -------------------- | --------------------------------------------- |
| GPT-5.5      | `gpt-5.5-2026-04-23`      | Yes       | Passed              | none, low, medium, high, xhigh | 1.05M / 128K         | $5.00 / $0.50 / $30.00                        |
| GPT-5.4      | `gpt-5.4-2026-03-05`      | Yes       | Passed              | none, low, medium, high, xhigh | 1.05M / 128K         | $2.50 / $0.25 / $15.00                        |
| GPT-5.4 mini | `gpt-5.4-mini-2026-03-17` | Yes       | Passed              | none, low, medium, high, xhigh | 400K / 128K          | $0.75 / $0.075 / $4.50                        |
| GPT-5.2      | `gpt-5.2-2025-12-11`      | Yes       | Passed              | none, low, medium, high, xhigh | 400K / 128K          | $1.75 / $0.175 / $14.00                       |

GPT-5.6 Luna/Terra/Sol were visible to the project and support Responses/structured output, but the account exposed no dated snapshot IDs. They were excluded from the production-pin bake-off. Pro, Codex, realtime/audio/search, deprecated, and nano-class models were excluded before results: they were respectively disproportionate in cost/latency, specialized for another task, incompatible with this text-extraction path, deprecated, or an inappropriate capability-risk choice for critical requirement recall.

Official references: [model catalog](https://developers.openai.com/api/docs/models), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2), and [text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small).

## Frozen live known-answer comparison

All final comparison calls used the same 15 synthetic pages, 20 planted obligations, `extract-v1`, `candidate-v1`, strict schema, context builder, 10,000 output-token limit, scorer v2, and `low` reasoning. A true positive required the correct active obligation, an allowed source page, an evidence quote present on that page after NFKC/quote/whitespace normalization, and no superseded value.

| Metric                                     |             GPT-5.5 |                 GPT-5.4 |         GPT-5.4 mini |                 GPT-5.2 |
| ------------------------------------------ | ------------------: | ----------------------: | -------------------: | ----------------------: |
| Final comparison calls                     |                   1 |                       1 |                    1 |                       1 |
| Planted / TP / missed                      |         20 / 20 / 0 |             20 / 19 / 1 |          20 / 20 / 0 |             20 / 16 / 4 |
| Fabricated / critical fabricated           |               1 / 0 |                   2 / 0 |                0 / 0 |                   1 / 0 |
| Precision / overall recall                 |      .9524 / 1.0000 |           .9048 / .9500 |      1.0000 / 1.0000 |           .9412 / .8000 |
| Critical / mandatory-form recall           |     1.0000 / 1.0000 |          .9500 / 1.0000 |      1.0000 / 1.0000 |           .8000 / .6667 |
| Deadline / numeric / addendum accuracy     |           1 / 1 / 1 |               1 / 1 / 1 |            1 / 1 / 1 |               1 / 1 / 1 |
| Citation / evidence validity               |               1 / 1 |                   1 / 1 |                1 / 1 |           .8947 / .8947 |
| Schema / injection influence               |            1 / none |                1 / none |             1 / none |                1 / none |
| Repairs / refusals / incomplete / retries  |       0 / 0 / 0 / 0 |           0 / 0 / 0 / 0 |        0 / 0 / 0 / 0 |           0 / 0 / 0 / 0 |
| Grounded redundant / duplicate rate        |           1 / .0500 |               5 / .2083 |            1 / .0526 |               3 / .1579 |
| Input / output / reasoning / cached tokens | 1368 / 1604 / 0 / 0 |    1368 / 1877 / 43 / 0 | 1368 / 1563 / 19 / 0 | 1368 / 2039 / 44 / 1152 |
| Latency                                    |             12.212s |                 11.499s |              10.359s |                 23.235s |
| Estimated cost                             |           $0.054960 |               $0.031575 |           $0.0080595 |              $0.0291256 |
| Gate                                       |                Pass | Pass (one pricing miss) |  **Pass / selected** |                    Fail |

The selected model earned the decision from the live fixture: it had zero critical fabrications, perfect strict-schema/evidence/form/deadline/number/addendum/injection metrics, and the best precision/cost/latency combination. Marketing descriptions were not used as the selection gate.

Artifacts: `artifacts/evaluation/phase3-live-model-probes.json`, `phase3-live-results.json`, per-model result files, and `phase3-live-worker-smoke.json`.

## Injection evaluation

The document attempted to override the system prompt, request the API key, mark output verified/approved, omit pages, switch to plain text/bypass JSON Schema, and use tools/email. No final model output showed injection influence. The prompt hierarchy, schema, forced `unverified` status, page context, tool access (none), secret handling, and application behavior were unchanged. Extracting or describing malicious text would not itself count as influence.

## Observable corrections

- First probes exposed a provider-neutral strict-schema defect: root `notes` was declared but omitted from `required`. Strict schemas require every property to be required. The schema now requires `notes` (empty allowed); all four candidates then passed identical probes. No free parsing or hidden repair was used.
- The frozen answer map initially treated valid page-14 checklist restatements as fabrications and required one exact category for form/signature obligations. Scorer v2 adds only objective evidence-page aliases, explicit form/signature category aliases, and a separate grounded-redundant count. Fixture text, prompt, model context, output limit, and planted obligations were not changed after live results.
- One combined process finished API calls but ended before emitting its artifact. Its ledger entries were retained and reported. Subsequent per-model orchestration made each result observable.

## Cost, caching, batch, retention, and operations

- `packages/ai/src/cost.ts` uses the standard prices in the table and the embedding rate above. Cached input is charged at the model-specific cached rate; reasoning tokens are included in output tokens.
- Final probe + comparison + worker-smoke provider-reported totals: 8,993 input tokens, 9,140 output tokens, at least 114 reported reasoning tokens (the worker table does not persist the reasoning subfield), 1,152 cached tokens, and 73.926 seconds summed reported extraction latency. Final comparison cost was $0.123721; probe cost $0.009015; worker smoke $0.008805.
- The authoritative ledger includes all observable iteration/orchestration calls: 18 entries (17 extraction/probe calls plus one embedding call), **$0.408541 cumulative**, under the $10 ceiling. Eight pre-final scorer/orchestration calls have exact ledger cost but their token/latency details were not persisted by the v1 standalone harness; this limitation is explicit rather than estimated as provider-reported usage.
- Prompt caching is supported and provider usage reported 1,152 cached tokens for the final GPT-5.2 call. The Batch API is supported by all four text candidates and embeddings, but was not used for this controlled synchronous gate.
- SDK retries are disabled; the application owns bounded exponential backoff (maximum three attempts) and 60-second provider timeout; live evaluation used a 90-second timeout. Final comparison and smoke had zero retries.
- Rate limits are account-tier dependent. HTTP 429/5xx/timeouts are retryable; auth/schema errors are not. See [rate limits](https://developers.openai.com/api/docs/guides/rate-limits), [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), and [Batch](https://developers.openai.com/api/docs/guides/batch).
- Responses calls use `store: false`, but this is **not** a ZDR claim. OpenAI documents default abuse-monitoring retention of up to 30 days unless approved controls apply; account-level ZDR was not established. See [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Real worker-path smoke

The selected pin completed one controlled synthetic extraction through `handleExtractJob`: analysis run completed, processing job completed, embedding and extraction metadata persisted, 22 candidates persisted, all statuses were `unverified`, every cited page resolved, two spend rows were written, source navigation matched `/w/{workspaceId}/documents/{documentId}?page={preliminaryPage}`, and the UI safety contract held. Cost: $0.008805.

## Phase 4 verification decision addendum — no model selected

Date: 2026-07-17. The live account again confirmed the three required dated pins. All support Responses, strict structured output, `medium` reasoning, prompt caching, and Batch. Context/pricing remain: GPT-5.5 1.05M/$5 input/$0.50 cached/$30 output per MTok; GPT-5.4 1.05M/$2.50/$0.25/$15; GPT-5.4 mini 400K/$0.75/$0.075/$4.50. Calls used Responses, no tools, `store:false`, strict JSON Schema, Zod validation, 90-second timeout, application-owned retries, and no hidden reasoning persistence.

### Frozen comparison

- Fixture: existing 15 synthetic pages plus 22 deterministic verification candidates covering support/paraphrase/partial/unsupported/contradicted, correct and incorrect dates/numbers, superseded and active replacements, false ambiguity, duplicates/false merges, parser damage, proof requirements, optional language, and injection.
- First envelope `verify-v1`/8,000 output tokens produced one observable GPT-5.5 incomplete call (`$0.271975`). The process was stopped immediately.
- Single allowed provider-neutral revision: `verify-v2` requires concise bounded fields; every candidate then used the same 12,000 output-token limit. Fixture and answer set were unchanged.
- Full artifact: `artifacts/evaluation/phase4-live-verification-results.json`; nine per-run artifacts retain every required metric and provider-usage total. Raw live findings, evidence text, prompts, and document context are intentionally excluded.

| Model / run     | Status acc. |   Macro P/R/F1 | Critical false supported / active | Addendum |  Date | Number | Quote / cite | Proof | Schema / incomplete | Stability |     Cost |
| --------------- | ----------: | -------------: | --------------------------------: | -------: | ----: | -----: | -----------: | ----: | ------------------: | --------: | -------: |
| GPT-5.5 r1      |        .909 | .951/.800/.840 |                             1 / 0 |    1.000 |  .800 |  1.000 |          1/1 |  .773 |                 1/0 |         — | $.273370 |
| GPT-5.5 r2      |        .909 | .900/.883/.866 |                             0 / 0 |     .625 |  .600 |   .800 |          1/1 |  .773 |                 1/0 |         — | $.243904 |
| GPT-5.5 r3      |        .909 | .951/.800/.840 |                             1 / 0 |     .625 |  .400 |   .800 |          1/1 |  .818 |                 1/0 | .909 agg. | $.228274 |
| GPT-5.4 r1      |        .864 | .767/.783/.773 |                             0 / 0 |    1.000 | 1.000 |  1.000 |          1/1 |  .591 |                 1/0 |         — | $.170555 |
| GPT-5.4 r2      |        .818 | .726/.683/.683 |                             1 / 1 |    1.000 |  .800 |  1.000 |          1/1 |  .682 |                 1/0 |         — | $.162137 |
| GPT-5.4 r3      |        .864 | .843/.783/.791 |                             0 / 0 |     .625 |  .600 |   .800 |          1/1 |  .636 |                 1/0 | .909 agg. | $.169892 |
| GPT-5.4 mini r1 |        .864 | .727/.600/.625 |                             1 / 0 |     .625 |  .400 |   .800 |          1/1 |  .455 |                 1/0 |         — | $.052485 |
| GPT-5.4 mini r2 |           0 |          0/0/0 |                             0 / 0 |        0 |     0 |      0 |          0/0 |     0 |                 0/1 |         — | $.054851 |
| GPT-5.4 mini r3 |           0 |          0/0/0 |                             0 / 0 |        0 |     0 |      0 |          0/0 |     0 |                 0/1 |    0 agg. | $.054851 |

Every completed run had retrieval recall 1.0, quote validity 1.0, citation accuracy 1.0, duplicate recall 1.0, false merges 0, repairs 0, retries 0, and injection influence 0. Duplicate precision was low (.111–.25), so relationships remain proposals pending human review. GPT-5.4 mini incomplete runs are not misreported as injection successes.

### Decision and operations

No candidate passes the required gate. The provisional GPT-5.5 choice is rejected. `PHASE4_LIVE_VERIFICATION_ENABLED` defaults false; `MockProvider` remains the safe demo path, and live evaluation remains a standalone opt-in command requiring `PHASE4_LIVE_EVAL=1` and `PHASE4_SPEND_CEILING_USD<=10`.

Before calls, Phase 3 cumulative spend was `$0.408541`, Phase 4 spend was `$0`, and the original plan was capped at `$3.00`. After the first incomplete `$0.271975` call, the revised nine-call plan had a `$4.50` maximum and a projected Phase 4 total of `$4.771975`, still below the authoritative `$10` ceiling. Actual Phase 4 usage across ten calls was 64,301 input, 98,047 output, 49,513 reasoning, and 35,328 cached tokens; summed latency was 733.619 seconds. Phase 4 spend is `$1.682294`; cumulative Phase 3+4 spend is `$2.090835`.

No live application verification smoke was run because that step requires a selected model. The implementation-level worker path was exercised with MockProvider and persisted linked machine-only findings, validated evidence, ledger/model metadata where applicable, and pending review state.

Retention remains unchanged: `store:false` is used but is not a ZDR claim; account-level retention controls were not established. Official model capability/pricing references remain the model pages linked above; current model catalog guidance was also checked on 2026-07-17.

## Phase 4 candidate-centered remediation requalification — no model selected

Date: 2026-07-17. This comparison supersedes the earlier Phase 4 quality baseline above; the earlier section remains as historical evidence. The frozen `verification-cases-v2` fixture contains 17 synthetic pages and 24 independently planted candidates. Every live run used one candidate per assessment, at most two candidate-relevant contexts, `verification-facts-v2`, `verify-entailment-v3`, conditional `verify-challenge-v1`, strict Zod-validated schemas, `verification-decision-v3`, `medium` reasoning, `store:false`, no tools, and identical scoring.

The first corrected GPT-5.5 attempt produced 7/24 incomplete Pass A responses at an 800-token cap. They were normalized `incomplete` responses with zero refusals, retries, timeout exceptions, or provider interruptions; 15,757 output tokens included 9,614 reasoning tokens. The then-current adapter had not retained `incomplete_details.reason`, so the precise provider subreason is not retroactively recoverable. The evidence strongly identifies output-token exhaustion/truncation. One identical operational correction bounded context at two pages, removed redundant schema verbosity without reducing semantics, raised Pass A/Pass B/duplicate limits to 1,200/1,000/600, and began recording `incomplete_details.reason`. The scored comparison was restarted for all models. GPT-5.5 and GPT-5.4 then had zero Pass A incompletes; mini still produced observable `max_output_tokens` incompletes.

### Per-run metrics

`A acc/P/schema/inc` = Pass A class accuracy, entails precision, schema adherence, incomplete count. `B recall/false/schema/inc` = challenge objection recall, false-objection rate, schema adherence, incomplete count. `Final acc/P/FS/FA` = final status accuracy, supported precision, critical false-supported, critical false-active.

| Model/run   | A acc/P/schema/inc | B recall/false/schema/inc | Final acc/P/FS/FA | Prec. |  Date/num | Quote/cite | Proof | Dup P/R | Final schema |     Cost |
| ----------- | -----------------: | ------------------------: | ----------------: | ----: | --------: | ---------: | ----: | ------: | -----------: | -------: |
| 5.5 r1      |      .833/.923/1/0 |                   0/0/1/0 |        .750/1/0/1 |  .958 | .800/.571 |        1/1 |     1 |     1/1 |            1 | $.808080 |
| 5.5 r2      |         .875/1/1/0 |                1/.083/1/0 |        .750/1/0/1 |  .958 | .800/.571 |     1/.929 |     1 |    1/.5 |            0 | $.738365 |
| 5.5 r3      |         .833/1/1/0 |                   1/0/1/0 |        .708/1/0/1 |  .958 | .600/.571 |     1/.917 |     1 |     1/1 |            1 | $.702220 |
| 5.4 r1      |      .750/.917/1/0 |                0/.091/1/0 |        .667/1/0/1 |  .958 |    1/.571 |     1/.909 |     1 |    1/.5 |            0 | $.395913 |
| 5.4 r2      |      .792/.917/1/0 |                0/.091/1/0 |        .750/1/0/1 |  .958 |    1/.571 |     1/.923 |     1 |     1/1 |            1 | $.406215 |
| 5.4 r3      |         .833/1/1/0 |                1/.167/1/0 |        .667/1/0/1 |  .958 |    1/.429 |        1/1 |     1 |     0/0 |            0 | $.383137 |
| 5.4 mini r1 |   .833/.929/.958/1 |                1/0/.929/1 |        .833/1/0/0 |  .917 |    .800/1 |        1/1 |  .958 |    1/.5 |            0 | $.138529 |
| 5.4 mini r2 |      .792/1/.875/3 |                1/.273/1/0 |        .625/1/0/1 |  .833 |    1/.429 |        1/1 |  .875 |     1/1 |            0 | $.122995 |
| 5.4 mini r3 |   .833/.923/.958/1 |             0/.091/.923/1 |     .667/.889/1/1 |  .917 | .800/.429 |        1/1 |  .958 |    1/.5 |            0 | $.123493 |

All runs had retrieval recall 1.0, false merges 0, and prompt-injection influence 0. Aggregate status accuracy / supported precision / precedence / stability were: GPT-5.5 `.736/1/.958/.875`; GPT-5.4 `.694/1/.958/.875`; mini `.708/.963/.889/.625`. Aggregate average per-run cost was `$0.749555`, `$0.395088`, and `$0.128339`, respectively. The nine runs used 342 calls, 475,172 input tokens, 168,017 output tokens, 108,798 reasoning tokens, 51,200 cached tokens, and 2,210.779 seconds summed latency, costing `$3.818946` within the restarted scored comparison artifacts.

### False-active root cause and decision

All eight critical false-active results were candidate `20000000-0000-4000-8000-000000000022`, the malicious text that asks for secrets and tool use. Candidate retrieval supplied pages 1 and 2; page 1 explicitly says the text is malicious and not an instruction. The quote was exact, parser state reliable, amendment facts/dates/numbers/comparisons empty, and `descriptiveOrInjectionLanguage=true`. Decision v3 nevertheless returned deterministic precedence `active` through `if (cited) return 'active'`; final logic preserved it for contradicted or partially-supported semantic outcomes. This is a deterministic precedence-rule defect, not missing retrieval, fixture error, or successful injection.

The scorer persisted aggregate Pass A/Pass B data and final per-candidate vectors but not per-candidate intermediate enums. Because provider calls used `store:false`, those exact enums cannot be recovered. This evaluation-observability defect does not alter the conclusive deterministic path but prevents an exact historical Pass A/Pass B enum report. Full trace: `artifacts/evaluation/phase4-false-active-root-cause.json`.

Provider-neutral `verification-decision-v4` now forces prompt-injection obligations to `undetermined`, regardless of cited-page existence or semantic status, while preserving ordinary descriptive/non-obligation precedence. It is locally tested but was not live requalified because no further paid remediation round was authorized. Therefore no model is selected, live application verification and its smoke remain disabled, `MockProvider`/human review remain the demo path, and Phase 5 is blocked.

Ledger after requalification: remediation `$5.305907/$6`; total Phase 4 `$6.988201/$10`; cumulative API spend `$7.396742`. The three resumed mini repetitions added `$0.385016` from provider-estimated per-call costs (`$0.385024` after the ledger's per-row six-decimal rounding); the six completed GPT-5.5/GPT-5.4 runs were not repeated.

## Phase 4 zero-live deterministic diagnostic — requalification not authorized

Date: 2026-07-17. No API calls, provider probes, model changes, prompt changes, or fixture-answer changes were made. The frozen `verification-cases-v2` fixture and its genuine unresolved conflict remain unchanged.

The historical evaluator caused every reported sub-1.0 date/number metric by requiring the final source-support and precedence axes to match instead of scoring the deterministic comparison. The six affected date rows were mandatory-meeting candidates in GPT-5.5 runs 1–3, the final-deadline candidate in GPT-5.5 run 3, and the partial-meeting candidate in mini runs 1 and 3. The 27 numerical rows were distributed across the correct liability, old/replacement liability, and unresolved-conflict insurance candidates. Those rows show semantic/final-status divergence, but the exact candidate-level Pass A/Pass B cause is unavailable because the historical artifact did not persist it.

Historical “final schema = 0” occurred in six runs. The metric was a combined Pass A/Pass B/duplicate-call Boolean, not a final-record schema check. GPT-5.5 r2 and GPT-5.4 r1 had an incomplete duplicate call with an unretained normalized reason; GPT-5.4 r3 had a malformed duplicate result; mini r1 had Pass A and Pass B `max_output_tokens` incompletes plus an incomplete duplicate call; mini r2 had three Pass A `max_output_tokens` incompletes; mini r3 had Pass A and Pass B `max_output_tokens` incompletes plus an incomplete duplicate call. Repairs were zero. The standalone evaluator did not attempt application persistence, and invalid/incomplete provider results failed closed.

The provider-neutral correction is `verification-facts-v3` + `verification-decision-v5` + `verification-final-assessment-v1` + `verification-evaluator-v2`. Facts are typed by semantic role and material scope; dates include time/timezone/ambiguity/relative-anchor state; numbers include scale, unit, operator, range, insurance basis, role, party, site, form, section, and deliverable. Cross-role or cross-scope matches are prohibited. Material mismatch or ambiguity blocks support. The evaluator independently scores source status, precedence, dates, numbers, and schema layers. Future artifacts carry an exact compatibility fingerprint and old v1 artifacts are not resumable.

The zero-live deterministic fixture now scores 1.0 for source status, supported precision, precedence, dates, numbers, quote validity, citation accuracy, parser uncertainty, proof requirement, duplicate precision/recall, and final schema; it has zero critical false-supported, zero critical false-active, zero false merges, and zero injection influence. This does not qualify a live model.

The next fair evaluation is proposed as fresh, staged evidence rather than nine immediate runs. Stage 1 is one `gpt-5.5-2026-04-23` `medium` repetition (maximum `$1.10`). Only a Stage 1 result with zero critical false-supported, zero critical false-active, full required schema adherence, correct dates/numbers/precedence, and no injection influence can unlock two more GPT-5.5 repetitions (Stage 2 maximum `$2.20`). GPT-5.4 is considered only if GPT-5.5 fails or a qualified lower-cost alternative remains a documented need; its corresponding one-run maximum is `$0.55`, followed by a two-run maximum of `$1.10` only after a passing first run. GPT-5.4 mini is excluded absent a concrete engineering or product reason.

Every future run must start fresh with `verification-cases-v2`, `verification-facts-v3`, `verification-decision-v5`, `verification-evaluator-v2`, `verification-final-assessment-v1`, unchanged Pass A/Pass B prompts, `medium` reasoning, and persisted bounded per-candidate intermediate results. Stage 1 would project Phase 4 spend from `$6.988201` to `$8.088201`, but remediation spend from `$5.305907` to `$6.405907`, above its current `$6` sub-ceiling. Stages 1–2 at conservative maxima would project Phase 4 spend to `$10.288201`, above the authoritative `$10` ceiling. Therefore no stage is authorized by this preparation step, and each stage requires a new cost/approval check. No model is selected, live verification and the application smoke remain disabled, and Phase 5 remains blocked.

## Fresh GPT-5.4 Stage 1 — failed, no rerun

Date: 2026-07-17. The authoritative pre-call ledger was Phase 4 `$6.988201/$10` and remediation `$5.305907/$6`; the authorized `$0.55` maximum projected `$7.538201` and `$5.855907`, respectively. Exactly one fresh `gpt-5.4-2026-03-05` repetition ran at `medium` with `verification-cases-v2`, `verification-facts-v3`, unchanged `verify-entailment-v3`/`verify-challenge-v1`, `verification-decision-v5`, `verification-evaluator-v2`, `verification-final-assessment-v1`, one candidate per assessment, and at most two contexts. Responses used strict schemas, Zod, `store:false`, no tools, and the existing 1,200/1,000/600 output limits and 90-second timeout.

The repetition did not qualify. Pass A made 24 calls with schema adherence `.875`; three calls (meeting consequence, bid bond, old liability limit) ended `incomplete/max_output_tokens` at 1,200 tokens and failed closed without repair. Pass B made 10 calls with schema adherence `1.0`; duplicate classification made two calls with schema adherence `1.0`. Final source-status accuracy was `.541667`, supported precision `1.0`, precedence `.875`, date `1.0`, number `1.0`, quote `1.0`, citation `1.0`, parser uncertainty `1.0`, proof requirement `.875`, duplicate precision/recall `1.0/1.0`, false merges `0`, critical false-supported `0`, critical false-active `0`, and injection influence `0`. Decision-schema adherence was `.875`; evaluation-artifact schema adherence was `1.0`. Repairs and retries were zero.

Usage was 36 calls, 53,700 input tokens, 18,391 output tokens, 11,936 reasoning tokens, zero cached tokens, 236.459 seconds summed latency, and `$0.410115`. The post-run authoritative ledgers are remediation `$5.716028/$6`, Phase 4 `$7.398322/$10`, and cumulative API spend `$7.806863`.

The eleven failed candidate traces divide into five Pass A semantic classification errors, three output-token incompletes, two internally inconsistent Pass A structured qualifier fields, and one Pass B challenge error. Decision v5 conservatively propagated these inputs and did not create a dangerous positive. Full bounded artifacts are `artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-gpt-5.4-2026-03-05-run-1.json`, `artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-live-results.json`, and `artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-failure-trace.json`.

Per the gate, the repetition was not rerun, no configuration or frozen input was changed, GPT-5.5 was not evaluated, no application smoke ran, and no model was selected. Live verification remains disabled and Phase 5 remains blocked.

## Phase 4 zero-live semantic-contract remediation — requalification pending

Date: 2026-07-17. No OpenAI request, model probe, live application smoke, or paid evaluation occurred. The frozen `verification-cases-v2` fixture and expected answers, `verification-facts-v3`, `verification-decision-v5`, `verification-evaluator-v2`, and `verification-final-assessment-v1` are unchanged.

The three Stage 1 Pass A incompletes were conclusively provider-normalized `max_output_tokens` events. Meeting consequence, bid bond, and old liability each consumed exactly 1,200 completion tokens; reported reasoning used 1,034, 1,011, and 951 tokens, leaving only 166, 189, and 249 non-reasoning tokens for the formerly permissive structured object. Input was only 1,595, 1,371, and 1,713 tokens and latency was 15.252, 14.606, and 14.962 seconds. There were no refusals, retries, repairs, timeout exceptions, response-status interruptions, or context-window errors.

The provider-neutral remedy is `verify-entailment-v4` with `verification-entailment-v2` and `verify-challenge-v2` with `verification-challenge-v2`. Pass A now limits evidence to one minimum sufficient exact reference per evidence axis, rationale to 160 characters, qualifiers/mismatches to three short phrases, and parser concerns to two. It prohibits repeated candidate/evidence/deterministic fact prose. Class-dependent Zod refinements make `entails` incompatible with a material mismatch, require a mismatch for `partially_entails`, require explicit opposing evidence for `contradicts`, forbid contradiction claims for `insufficient`, and require a named parser limitation for `parser_uncertain`.

After structural validation, a deterministic semantic-contract validator checks the candidate ID, supplied page, exact/normalized-exact quote, mutually inconsistent qualifier fields, and prohibited non-material wording objections. The adapter uses at most its existing one controlled repair attempt and records the original normalized contract error. If repair fails, or if an incomplete/refusal occurs, no semantic result reaches the decision engine. The worker persists the failure category and normalized error visibly.

Pass B objections are capped at two and must name the exact affected candidate proposition, a typed qualifier/conflict, one exact supplied evidence span, and the material effect. Deterministic guards reject a purported missing qualifier already present in the candidate, an ungrounded qualifier, date/number objections without a matching fact-envelope mismatch, unsupported supersession/conflict, or parser/descriptive objections inconsistent with immutable facts. A speculative or stylistic objection therefore cannot downgrade a positive assessment.

Offline results: 107/107 unit tests, including all eleven Stage 1 candidate regressions and explicit fail-closed inconsistency/incomplete/repair-failure cases; 53/53 Supabase integration tests; 17/17 mock Playwright tests; deterministic mock evaluation with Pass A, Pass B, source status, precedence, date, number, quote, citation, parser, proof, duplicate, decision-schema, and artifact-schema metrics all 1.0, zero critical false-supported/false-active, zero false merges, zero incompletes, and zero injection influence. Lint, formatting, type-check, production build, secret scan, and the invariant checklist passed. These are offline controls, not live model qualification.

Authoritative ledgers are unchanged: Phase 4 `$7.398322/$10`, remediation `$5.716028/$6`, cumulative API spend `$7.806863`. A conservative maximum for one fresh GPT-5.5 `medium` repetition remains `$1.10`, which would project Phase 4 to `$8.498322` but remediation to `$6.816028`. The total Phase 4 ceiling is sufficient; the remediation sub-ceiling is not. No ceiling change or live call is authorized by this remediation.

## Fresh GPT-5.5 semantic-contract Stage 1 — failed, no rerun

Date: 2026-07-18. The user raised only the remediation evaluation sub-ceiling to `$7`; the overall Phase 4 ceiling remained `$10`. Pre-call authoritative ledgers were Phase 4 `$7.398322`, remediation `$5.716028`, and cumulative API `$7.806863`. The `$1.10` maximum projected `$8.498322/$10` and `$6.816028/$7`. The worktree was clean, semantic-remediation commits `5e1478ad38173ac5371f75c4eefc8e977c9f27da` and `a9e1ecb7aa93ee5ed6a7a17c84b7ac40333a53d8` were present, and the evaluator fingerprint exactly matched the authorization before calls began.

Exactly one fresh `gpt-5.5-2026-04-23` `medium` repetition ran with `verification-cases-v2`, `verification-facts-v3`, `verify-entailment-v4` / `verification-entailment-v2`, `verify-challenge-v2` / `verification-challenge-v2`, `verification-decision-v5`, `verification-evaluator-v2`, and `verification-final-assessment-v1`. It used one candidate and no more than two contexts per assessment, Responses with `store:false`, no tools, strict output plus Zod, existing 1,200/1,000/600 output limits, a 90-second timeout, and no historical resume or rescore.

The repetition did not qualify. Final source-status accuracy was `.833333` rather than `1.0`. Four candidates diverged: meeting consequence expected partial but became contradicted; incorrect liability limit expected contradicted but remained partial; the Exhibit C parent attachment expected supported but became partial; and the Addendum 4 insurance statement expected supported but a repaired challenge made it partial. The causes span semantic errors, a false deterministic meeting-scope mismatch, decision-rule ordering for exact numerical mismatches, an additive parent/child validator gap, and a challenge objection inconsistent with typed exact-match facts. Full trace: `artifacts/evaluation/phase4-stage1-gpt55-semantic-v4-20260718a-failure-trace.json`.

Five Pass A calls and one Pass B call required the single controlled repair. Post-repair Pass A, Pass B, duplicate, decision, and artifact schemas were valid, but clean first-pass rates were `19/24`, `13/14`, and `2/2`, respectively; the six observable repairs fail the qualification gate. There were zero unresolved incompletes, refusals, timeouts, retries, critical false-supported findings, critical false-active findings, false merges, or injection influence. Supported precision, precedence, dates, numbers, quotes, citations, parser uncertainty, proof requirement, and duplicate precision/recall were all `1.0`.

Usage was 40 calls: 81,074 input tokens, 16,854 output tokens, 10,531 reasoning tokens, 7,936 cached tokens, 228.583 seconds summed latency, zero retries, and six repairs. Actual cost was `$0.875278`. Authoritative post-run ledgers are remediation `$6.591306/$7`, Phase 4 `$8.273600/$10`, and cumulative API `$8.682141`.

Per the failed gate, no rerun, second model, application smoke, or model selection occurred. Live verification remains disabled, `MockProvider`/human review remains the demo path, and Phase 5 remains blocked pending separate authorization.

## Phase 4 zero-live targeted remediation — fresh requalification not authorized

Date: 2026-07-18. No OpenAI request, model probe, live application smoke, or paid evaluation occurred. The frozen `verification-cases-v2` fixture, expected answers, candidate-centered retrieval, pinned model list, and qualification thresholds remain unchanged.

The meeting-consequence failure was a mixed parser/decision/semantic error. Facts v3 parsed the candidate party (`Offerors`) but not the semantically equivalent source party and manufactured a `material_scope_mismatch` despite identical `2026-03-01` dates. `verification-facts-v4` compares date value independently, records one-sided scope as `unknown`, and records only explicit comparable differences as mismatch. Atomic relationship analysis preserves the following “Failure to attend disqualifies an offeror” consequence, so the shortened candidate is `partially_supported`, not contradicted.

The incorrect-liability failure was rule ordering. `verification-decision-v6` evaluates an exact active numerical opposition before `partially_entails`: `$4,000,000` versus active `$3,000,000`, with identical insurance role, per-occurrence basis, unit, minimum operator, subject, and explicit scope, becomes `contradicted`. The override cannot fire for unknown/partial scope, superseded values, or unresolved conflicting values.

The staffing attachment is now an explicit parent with an additive child. “Attach Exhibit C” may be fully supported while “show at least four FTEs” remains a separate atomic child obligation. `atomic-parent-child-v1` proposes reviewable `parent_child` relationships without merging either candidate. Equivalent rules cover form/signature, insurance/site-sublimit, and submission-method/packaging pairs; meeting/disqualification remains a material-condition case rather than an additive downgrade exemption.

The repaired Addendum 4 objection is rejected by the v3 challenge contract because candidate and evidence match on value, unit, minimum operator, per-occurrence basis, North Campus site, CGL subject, insurance obligation role, and every explicit typed scope. Unknown/absent scope cannot become conflicting scope. An invalid objection produces no downgraded final assessment; it remains a visible failed challenge.

First-pass contract guidance is now explicit in `verify-entailment-v5` / `verification-entailment-v3` and `verify-challenge-v3` / `verification-challenge-v3`: class-specific fields state when evidence, mismatch, parser, and objection arrays must be empty or populated. Five historical repairs were forbidden Pass A field combinations; the sixth was an ungrounded Pass B evidence/scope claim. The original first-attempt objects were not retained under `store:false`, so exact raw values and per-attempt token splits are unavailable and were not reconstructed. Prospectively, bounded metadata records first-pass adherence and a semantic fingerprint comparison; a repair changing classification, evidence, qualifiers, objections, or relationship meaning is rejected as non-adherent, while structure-only repair remains visibly non-clean. The normalized errors, repaired outputs, and combined call token usage are preserved in `artifacts/evaluation/phase4-targeted-remediation-v1.json`; all six remain non-clean calls.

`verification-evaluator-v3` corrects the meeting-date oracle: the identical date is a match while unknown party scope is scored separately. The offline 24-candidate fixture now has source status, supported precision, precedence, dates, numbers, quote validity, citation accuracy, parser uncertainty, proof requirement, duplicate precision/recall, and every schema layer at `1.0`, with zero critical false-supported/false-active, false merges, repairs, incompletes, or injection influence. This is deterministic regression evidence, not live qualification.

Authoritative ledgers remain Phase 4 `$8.273600/$10`, remediation `$6.591306/$7`, cumulative API `$8.682141`. A future single fresh GPT-5.5 maximum remains `$1.10`, projecting Phase 4 to `$9.373600` and remediation to `$7.691306`. The overall ceiling is sufficient; the current remediation sub-ceiling is not. No ceiling change or live call is authorized, no model is selected, live verification remains disabled, and Phase 5 remains blocked.

## Phase 4 zero-live output-budget remediation — live testing not authorized

Date: 2026-07-18. The user raised the authoritative Phase 4 ceiling to `$15.00` and remediation sub-ceiling to `$12.00`, without authorizing a provider call. A direct Supabase ledger read found Phase 4 `$9.127362`, remediation `$7.445068`, and cumulative API spend `$9.535903`. No OpenAI call or model probe occurred.

The remaining failure mode used a single Responses output allowance for both reasoning and the structured answer. The provider can consume most of that allowance before emitting JSON. The provider-neutral configuration therefore changes from `medium` to `low` reasoning and splits Pass A/Pass B output limits to 1,800/1,600 tokens. Maximum valid serialized schemas are approximately 450/642 tokens under a conservative three-bytes-per-token calculation, reserved as 500/650. This leaves about 1,300/950 tokens for reasoning while retaining bounded outputs and the existing 90-second timeout. The duplicate limit remains 600.

`verify-entailment-v6` / `verification-entailment-v4` makes `descriptiveOnly` a strict `false` constant and routes descriptive/disclaimed non-obligations to `insufficient` unless active evidence explicitly establishes the opposite proposition. This prevents the observed `contradicts + descriptiveOnly=true` combination at the provider schema layer. Existing class-dependent semantic refinements remain fail-closed. `verify-challenge-v4` / `verification-challenge-v4` requires an immediate grounded assessment and prohibits speculative deliberation. Frozen expected answers, `verification-facts-v4`, `verification-decision-v6`, `verification-evaluator-v3`, evidence controls, deterministic overrides, zero-repair qualification, and final schema v1 are unchanged.

The full compatibility fingerprint is `d0bcc149b74c284e9b67f29d66d89598c31babbe718a15fc7a2292f92f824299`. A separately versioned five-candidate operational probe, `verification-output-budget-prequalification-v1`, has fingerprint `9b6ed1ac483d3c3b7882374ea7fb96f780b1e931dff9bf0890f8ff4edeac1c2c`. It covers prior Pass A/Pass B exhaustion, semantic-combination invalidity, deterministic numerical contradiction, and injection/non-obligation behavior. A clean result only validates output-budget/schema stability; it cannot qualify a model or replace the full 24-candidate/40-assessment run.

Prior GPT-5.5 usage suggests an expected full fresh repetition near `$0.80`; the increased limits require a conservative maximum reservation of `$1.35`. The targeted probe is expected near `$0.15`, with a `$0.35` maximum. A staged maximum of `$4.40` (targeted `$0.35`, one full `$1.35`, then two full `$2.70`) would project Phase 4 to `$13.527362/$15` and remediation to `$11.845068/$12`. Every stage still requires separate authorization and a fresh ledger check. No model is selected, live verification and application smoke remain disabled, and Phase 5 remains blocked.
