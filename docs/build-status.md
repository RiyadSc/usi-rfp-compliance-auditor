# Build Status

## Current phase: Phase 3 complete — stop before Phase 4

Last updated: 2026-07-17.

## Phase 3 — Candidate extraction, retrieval, providers (COMPLETE)

### Provider (live account verification)

- OpenAI Responses API + embeddings verified against the live key in gitignored `.env.local`.
- Extraction model selected by live known-answer evaluation: `gpt-5.4-mini-2026-03-17` (`low` reasoning).
- Provisional Phase 4 verification model: `gpt-5.5-2026-04-23`; not approved for use until a separate Phase 4 evaluation.
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

### Out of scope (Phase 4+)

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
