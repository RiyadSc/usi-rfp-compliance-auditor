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
