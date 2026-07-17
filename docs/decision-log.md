# Decision Log

Append-only. Each entry: date, decision, rationale, reversibility, source.

## Inherited from Engineering Design §17.3 (2026-07-16)

| Decision                                               | Rationale                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Verification-first, not generation-first               | Addresses stakeholder failure mode; reduces demo scope     |
| Frozen synthetic/public fixture                        | Reliable rehearsal; no confidentiality risk                |
| Page-level evidence required for verified findings     | Auditable; visibly different from generic chat             |
| Separate extraction, verification, deterministic rules | Reduces self-confirming model errors                       |
| Asynchronous jobs                                      | Parsing/analysis exceed safe interactive request durations |
| Model provider behind interface                        | Avoid provider lock-in                                     |
| No "compliant"/"safe to submit" status                 | Legal judgment stays human                                 |

## Phase 0 decisions (2026-07-16)

- **D-001 — Target Supabase project.** Use `RFP demo` (`uxmxkdjschbekkbnweby`, org BabsonWealth, us-east-2, Postgres 17). Verified read-only on 2026-07-16: 0 public tables, 0 migrations, 0 auth users, 0 storage buckets — fresh and safe for this build. Other reachable projects (BTCQUANT, tradingbot) are unrelated; never touch. Reversible: no (project choice anchors data), but project is empty so risk ≈ 0.
- **D-002 — Job queue: pg-boss on Postgres.** Design offers Inngest/Trigger.dev/BullMQ. Inngest/Trigger.dev cloud = paid-service commitment (requires approval); BullMQ needs Redis infra. pg-boss gives retries, visibility, and stage jobs on the existing Supabase Postgres. Reversible: yes (queue behind small interface).
- **D-003 — Parser: `pdfjs-dist` adapter, PDF-only ingestion first.** No local pdftoppm/mutool/ghostscript; LlamaParse/Unstructured = external paid services. pdfjs-dist extracts per-page text with offsets in pure JS, sufficient for a machine-readable synthetic fixture; `ParserAdapter` interface preserves swapability; OCR out of demo scope (documented limitation, Design §2.3 assumes machine-readable). DOCX (FR-002) deferred behind the adapter until explicitly needed. Reversible: yes.
- **D-004 — Evidence page rendering via browser pdf.js from signed URLs** instead of server-side rasterization (avoids native canvas deps). Quote panel fallback per Design §9.3 when highlight anchors unavailable. Reversible: yes.
- **D-005 — Auth: Supabase Auth email/password, public signup disabled, seeded demo users.** Satisfies "authenticated or protected demo access" without SSO scope. Reversible: yes.
- **D-006 — Monorepo with npm workspaces** (pnpm not installed; avoid new global tooling). Layout per Design §4.1. Reversible: yes.
- **D-007 — Hybrid retrieval with Postgres-native tools:** FTS + pg_trgm for lexical, pgvector for semantic, both workspace-filtered. Avoids external vector store. Reversible: yes.
- **D-008 — Real model provider deferred to user decision (OQ-1).** No provider API key exists in the environment; committing to one is a paid-service decision. Until resolved: `MockProvider` (deterministic, fixture-driven) powers development, tests, and the mandated cached fallback. Phases 1–2 are unaffected; Phase 3 live-model work is blocked on the key.
- **D-009 — Git repository initialized in this folder** (was not a repo). Version control is required for migrations, docs, and CI gates. Reversible: yes.
- **D-010 — Docs conversions trusted.** The `.md` versions of the PRD and Engineering Design (converted from the PDFs) are treated as authoritative source text; PDFs retained in repo root for reference.
- **D-011 — Context7 usage.** `find-docs` skill via `npx ctx7@latest` verified working (requires full-network permission in sandbox). Used per-phase, immediately before implementing unfamiliar/security-sensitive functionality; material findings recorded here.

## Phase 1 decisions (2026-07-17)

- **D-012 — OQ resolutions (user-approved).** OQ-1: live model provider deferred until immediately before Phase 3; MockProvider only in Phases 1–2. OQ-2: local development target, deployment-portable; hosted demo decided at hardening. OQ-3: local gates are source of truth + GitHub Actions workflow (install, lint, format check, typecheck, unit tests, build, secret scan — no secret-dependent tests). OQ-4: PDF-only approved; DOCX recorded as post-demo scope behind the parser adapter.
- **D-013 — Auth session handling via `@supabase/ssr` cookie clients** (browser/server/proxy patterns from official docs). Next.js 16 renamed `middleware.ts` → `proxy.ts`; we use the new convention. Route protection in proxy is UX only; authorization lives in RLS.
- **D-014 — Audit event writes via `record_audit_event` SECURITY DEFINER RPC** rather than a service-role client (no service-role key is present in the environment, and Phase 1 needs no other privileged path). The function pins `actor_id = auth.uid()`, requires workspace membership, and allowlists event types; the table has no INSERT policy and an UPDATE/DELETE-blocking trigger (immutable even for service role). Residual risk documented in build-status R9. Reversible: yes (server-side system events can move to service role later).
- **D-015 — Demo users seeded via SQL** (`scripts/seed-demo-users.template.sql`) with locally generated random passwords stored only in gitignored `.env.local` and Supabase's auth store. No Management-API auth-config access via MCP, so "disable public signup" and "leaked password protection" are dashboard settings recorded as runbook prerequisites; the app itself exposes no signup surface.
- **D-016 — Owner-OR-member SELECT policy on workspaces** (migration 0003): `INSERT ... RETURNING` evaluates SELECT policies before the AFTER-INSERT membership trigger commits its row, so pure membership SELECT broke workspace creation. Owners are always members (trigger), so scope is unchanged.
- **D-017 — Function grant hardening** (migration 0004) after Supabase security advisors flagged PUBLIC/anon EXECUTE on SECURITY DEFINER functions: trigger functions revoked from all API roles; RPCs restricted to `authenticated`; default function EXECUTE for PUBLIC revoked schema-wide.

## External documentation decisions

(record per phase: library ID, query, what changed as a result)

- 2026-07-16: Resolved `/vercel/next.js` via Context7 (verification that CLI works). Version selection for Phase 1 to be confirmed against current stable docs at Phase 1 start.
- 2026-07-17: `/vercel/next.js` — server/client boundaries + `server-only` marker package semantics; also v16 `middleware.ts` → `proxy.ts` migration (adopted, D-013).
- 2026-07-17: `/supabase/ssr` — `createServerClient`/`createBrowserClient` cookie patterns for App Router + middleware/proxy session refresh (adopted in `apps/web/src/lib/supabase/server.ts`, `apps/web/src/proxy.ts`).
- 2026-07-17: `/supabase/supabase` — RLS best practices: SECURITY DEFINER membership helper to avoid recursive policies; wrap `auth.uid()`/helpers in `(select ...)` for initplan caching (adopted in migrations 0001/0003).
- 2026-07-17: `/supabase/supabase` — Storage RLS on `storage.objects` with `storage.foldername(name)[1]` path-prefix policies; private buckets require JWT download or signed URLs (adopted in migration 0002).

## Phase 2 decisions (2026-07-17)

- **D-018 — Schema alignment to live `documents_ingestion`.** A prior migration created `upload_intents` / `documents` / `document_pages` / `parse_runs` with column names (`original_filename`, `status`, `size_bytes`, `extraction_status` ∈ ok|empty|error). A parallel draft migration `documents_upload_parse` used `IF NOT EXISTS` and was largely a no-op for table shapes; app code and later policies follow the live ingestion schema. `processing_jobs` remains for pg-boss observability alongside `parse_runs`.
- **D-019 — pg-boss adopted in schema `pgboss`.** Confirmed PG 13+ (project is 17), Node 22.12+, SKIP LOCKED claim path, `useListenNotify: false`, **direct** `DATABASE_URL` (port 5432, not pooler 6543). Tables revoked from `anon`/`authenticated`; not exposed via PostgREST. Enqueue path uses `migrate: false`.
- **D-020 — Server-authorized signed upload.** Intent (service-role insert) → `createSignedUploadUrl` → client `uploadToSignedUrl` → finalize downloads/inspects object (magic bytes, size, hash, dedup) before registering `documents` + enqueue. No authenticated Storage INSERT/DELETE policies.
- **D-021 — Soft delete for demo documents.** `status=deleted` + `deleted_at`; SELECT hides deleted rows; storage object removed via service role; queued jobs cancelled; pages deleted; audit `document_deleted`.
- **D-022 — Malware scan interface only.** `NoopMalwareScanner` documented as production hardening; not claimed as protection.
- **D-023 — PDF.js hardening.** `isEvalSupported: false`, `disableAutoFetch`, `disableStream`, `disableFontFace`; encrypted PDFs rejected; empty pages still recorded. Parser imported only from `@usi/documents/parser` so Next does not bundle pdfjs into RSC actions.
- **D-024 — Worker health port for Playwright.** Worker serves `127.0.0.1:3001` so Playwright does not skip the worker when reusing the web server on :3000.

## External documentation decisions (Phase 2)

- 2026-07-17: `/timgit/pg-boss` (prior) + pg-boss README — schema option, SKIP LOCKED, migrate/createSchema, listen/notify off for poolers.
- 2026-07-17: `/supabase/supabase-js` — `createSignedUploadUrl` / `uploadToSignedUrl` (token auth; no bucket INSERT RLS required for the signed path).
- 2026-07-17: `/mozilla/pdf.js` — `getDocument({ data })`, password/encrypted handling; DocumentInitParameters (`disableFontFace`, `isEvalSupported`, fetch/stream flags).
- 2026-07-17: Node `crypto.createHash('sha256')` for content hashing; Next.js server actions for intent/finalize (request bodies stay small; bytes stay in Storage).

## Phase 3 decisions (2026-07-17)

- **D-025 — Live provider: OpenAI.** First adapter uses Responses API + Embeddings. Key via server-only `OPENAI_API_KEY`; absent → MockProvider. Never `NEXT_PUBLIC_*`, never DB, never logs.
- **D-026 — Model pins from live account and evaluation.** Extraction: `gpt-5.4-mini-2026-03-17` selected from a four-pin live bake-off. Provisional future verification: `gpt-5.5-2026-04-23` pending Phase 4-specific evaluation. Embeddings: `text-embedding-3-small`.
- **D-027 — Strict structured output.** Responses API `text.format.json_schema` strict + Zod re-validation; refusals/incomplete captured distinctly; free-form JSON not trusted for critical outputs.
- **D-028 — `store: false` ≠ ZDR.** Requests set `store: false`; documentation must not claim contractual Zero Data Retention unless org ZDR is separately verified.
- **D-029 — Phase 3 spend ceiling $10.** App ledger `spend_ledger` + `PHASE3_SPEND_CEILING_USD`; config validation rejects a higher value and workers cancel as `budget_exceeded`. Does not replace OpenAI project billing limits/alerts.
- **D-030 — Candidates always unverified.** DB check constraint + Zod literal; UI labels `candidate / unverified`. Verification is Phase 4.
- **D-031 — Hybrid retrieval, not vectors alone.** Page-aware chunks + FTS/trgm + keyword/page-window expansion + optional vectors; search RPC requires workspace_id + analysis_run_id.
- **D-032 — Extraction and verification remain separate.** Even when both use the same provider or model family, they require separate calls/prompts/schemas/runs/outputs (verification is not implemented in Phase 3).
- **D-033 — Live model gate completed.** GPT-5.4 mini tied the best quality result (20/20 planted, zero critical fabrications, perfect evidence/form/date/number/addendum/injection metrics) at the lowest evaluated cost and latency. GPT-5.2 failed the gate.
- **D-034 — Live evaluation is explicit and standalone.** `PHASE3_LIVE_EVAL=1` is required; live commands are absent from CI, normal gates, Playwright, and application startup.

## External documentation decisions (Phase 3)

- 2026-07-17: Context7 `/websites/developers_openai_api` — Responses API structured outputs (`json_schema` strict), embeddings create, `store` parameter semantics, rate-limit/retry guidance.
- 2026-07-17: Live account enumeration/probes confirmed four evaluated dated pins plus `text-embedding-3-small`; GPT-5.6 variants were visible without dated pins.
- 2026-07-17: Official model, pricing, retention, caching, batch, and rate-limit references are recorded in `docs/provider-decision.md`.

## Phase 4 decisions (2026-07-17)

- **D-035 — Verification is multi-axis and append-only.** Source support, precedence, proof requirement, and human review are separate fields/tables. Extraction candidates are immutable proposals; machine findings and human decisions are versioned/append-only rather than overwritten.
- **D-036 — Independent verification queue.** `requirements-verify` has a separate run, job, prompt (`verify-v2`), schema (`verification-finding-v1`), retrieval record, model call, cost row, failure state, and UI. Extraction output is never reused as verification judgment.
- **D-037 — Exact evidence gate.** Only exact or NFKC/quote/whitespace normalized-exact page matches can validate quotation evidence. Fuzzy matches remain recovery candidates and cannot silently qualify support.
- **D-038 — Non-destructive relationships.** Duplicate/addendum relationships are proposals; no machine merge deletes candidates or evidence. Material date, amount, party, form, role, condition, location, deliverable, and scope differences force related-distinct/uncertain handling.
- **D-039 — Human review RPC.** Authorized members append accepted/rejected/needs-follow-up/waived decisions through a scoped SECURITY DEFINER RPC. Waiver requires a reason, revisions link the prior decision, and each decision creates an immutable audit event.
- **D-040 — Phase 4 live model gate failed.** Three dated pins × three `medium` repetitions were scored. No candidate met zero-critical-false and consistency gates. GPT-5.5 provisional status is revoked; Phase 5 is blocked.
- **D-041 — Live verification disabled by default.** `PHASE4_LIVE_VERIFICATION_ENABLED=false` forces MockProvider for the application verification worker even when the extraction key is present. Live bake-off requires the standalone `PHASE4_LIVE_EVAL=1` command and a Phase 4 ceiling no greater than $10.
- **D-042 — One provider-neutral prompt revision consumed.** The 8K `verify-v1` envelope produced an incomplete GPT-5.5 response. `verify-v2` bounds rationale/evidence/facts and uses a uniform 12K output limit; all three candidates were rerun three times with the fixture/answers unchanged.
- **D-043 — Composite database scope is enforced on privileged verification writes.** Final diff inspection found that simple foreign keys did not prove every same-workspace document/page and verification-run/relationship pairing. Additive migration `20260717000012` enforces composite run/workspace scope and trigger-level evidence, relationship, review-revision, and model-call consistency without weakening RLS or rewriting the applied Phase 4 migration.
- **D-044 — Candidate-centered semantic verification.** Frozen fixture `verification-cases-v2` is evaluated one candidate at a time with `verify-entailment-v3`, conditional `verify-challenge-v1`, immutable `verification-facts-v2`, and deterministic `verification-decision-v3`; unrelated evidence is not batched.
- **D-045 — Phase 4 remediation requalification failed.** GPT-5.5, GPT-5.4, and GPT-5.4 mini each completed three identical `medium` repetitions. No model passed: eight critical false-active events, one critical false-supported event, and six schema-failed runs occurred. Live verification remains disabled and no application smoke was authorized.
- **D-046 — False-active root cause and fail-closed v4.** Every false-active event was the malicious-text candidate. Decision v3 returned `active` from cited-page existence despite deterministic injection detection and no precedence evidence. Decision v4 forces prompt-injection obligations to `undetermined` while preserving ordinary descriptive/non-obligation precedence. It is unit-tested but not live-qualified; Phase 4 remains incomplete.
- **D-047 — Evaluation trace limitation.** Scored artifacts retained aggregate Pass A/Pass B metrics and final per-candidate vectors but not per-candidate intermediate enums. Because calls used `store:false`, those exact enums are not recoverable. The deterministic cause remains conclusive, but future live evaluation must persist a bounded non-secret intermediate trace.
- **D-048 — Typed deterministic facts v3.** Dates and numbers are typed by semantic role, operator, unit, time/timezone, ambiguity, and material scope. Cross-role/scope comparisons are prohibited; material mismatch or uncertainty prevents source-supported status. Frozen live fixture answers and semantic prompts are unchanged.
- **D-049 — Decision v5 owns and validates final state.** `verification-decision-v5` remains fail-closed for injection/precedence and now validates every final machine-only, human-review-pending assessment with strict `verification-final-assessment-v1` before it can leave the deterministic layer.
- **D-050 — Evaluator v2 separates axes.** Historical date/number scores incorrectly depended on final source status plus precedence, and historical “final schema” combined three provider-call layers. `verification-evaluator-v2` scores deterministic facts independently and reports Pass A, Pass B, duplicate, decision, and artifact schemas separately.
- **D-051 — Evaluation artifacts are version-locked.** Future resumable runs require an exact fixture/fact/decision/final-schema/evaluator/prompt/schema/reasoning/context fingerprint. The v1 historical runs lack that fingerprint and cannot be rescored or resumed under v2 semantics.
- **D-052 — Requalification is fresh and staged.** No historical artifact may be resumed. A future approval may authorize one fresh GPT-5.5 `medium` repetition first; two additional GPT-5.5 repetitions require a clean Stage 1, and GPT-5.4 is considered only after GPT-5.5 failure or a documented need for a qualified lower-cost alternative. GPT-5.4 mini is excluded absent a concrete engineering or product reason. Each stage must independently pass its projected-cost check before calls.

## External documentation decisions (Phase 4)

- 2026-07-17: Context7 `/supabase/supabase` — explicit function EXECUTE revocation/grants, SECURITY DEFINER membership authorization, and RLS minimum-privilege patterns informed the review RPC and SELECT-only machine tables.
- 2026-07-17: Official OpenAI model pages/catalog — confirmed Responses, structured output, reasoning settings, dated pins, context, pricing, caching, Batch, and account-tier rate-limit behavior. The official docs MCP was registered but requires a Codex restart before it is callable in-session; official OpenAI web docs were used as the documented fallback.
- 2026-07-17 zero-live diagnostic: no new external documentation was required; remediation was limited to repository-owned deterministic parsing, decision, schema, evaluator, and artifact-compatibility behavior.
