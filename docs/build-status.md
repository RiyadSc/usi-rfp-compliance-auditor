# Build Status

## Current phase: Phase 2 complete — awaiting go-ahead for Phase 3

Last updated: 2026-07-17.

## Phase 2 — Document ingestion and page parsing (COMPLETE)

### Disk cleanup

- Before Phase 2 work: ~18–19 GB free (already recovered from an earlier ~98% full disk).
- After regenerable-cache cleanup and build/test artifacts discipline: **~22 GB free** (`df` 2026-07-17).
- `.gitignore` covers `.next/`, `coverage/`, `playwright-report/`, `test-results/`, `.tmp/`, parser/upload temps.
- Target ≥10 GB free: met. No repository sources, git history, or `.env.local` deleted.

### Completed work

- `@usi/documents`: filename/MIME/magic/size/page validation, SHA-256, state machine, error normalization, `ParserAdapter` + `PdfJsParserAdapter`, noop malware interface.
- Server-authorized upload: create intent → signed upload URL → finalize (independent object inspection) → `processing_jobs` + pg-boss enqueue.
- `apps/worker`: pg-boss consumer on `document-parse`; writes `parse_runs` + idempotent `document_pages`; health on `:3001`.
- Documents UI: upload form with status, list, viewer (signed PDF iframe + escaped extracted text), poller, soft delete.
- Migrations 0005–0008 (ingestion schema + upload_parse additive + pgboss lockdown + policy alignment + soft-delete SELECT).
- Unit / integration / Playwright coverage including Phase 1 regressions.

### Schema/migrations added

| Migration                                     | Objects                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `20260717000005_documents_ingestion`          | `upload_intents`, `documents`, `parse_runs`, `document_pages`; SELECT RLS; Storage INSERT/DELETE policies dropped |
| `20260717000005_documents_upload_parse`       | `processing_jobs` (+ IF NOT EXISTS stubs; live columns from ingestion)                                            |
| `20260717000006_pgboss_lockdown`              | revoke `anon`/`authenticated` on `pgboss`                                                                         |
| `20260717000007_align_documents_policies`     | drop `upload_intents_insert` (service-role writes only)                                                           |
| `20260717000008_documents_soft_delete_select` | `documents` SELECT requires `deleted_at IS NULL`                                                                  |

### Tests (exact results)

- `npm run gates` — lint, format:check, typecheck, unit (30), secret scan, build — pass.
- `npx vitest run --config vitest.config.integration.ts` — **34/34** pass.
- `npx playwright test` — **9/9** pass (5 Phase 1 workspace + 4 document flows).

### Deviations

- Aligned to pre-existing ingestion column/status names (D-018).
- Malware scan = interface/noop only (D-022).
- OCR deferred. Exact size match required on finalize (declared vs stored).
- Oversized e2e is accept-attribute coverage when `MAX_UPLOAD_BYTES` is large (25 MiB default).

### Invariant check (Phase 2)

1/4: no verified findings UI. 2/3: no extraction/verification stages. 5/6: PDFs treated as hostile; no tool/secret authority from content. 9: parse failed/empty/warning states visible. 10/11: fixtures under `fixtures/demo-rfp/` only. 12/13: workspace_id + RLS on all new tables; Storage private; cross-workspace denied in integration + e2e. 14: service role + DATABASE_URL server-only; secret scan green. 15: `document_uploaded` / `document_deleted` audit events. 16: n/a until analysis. Stop-and-ask: only `RFP demo` mutated.

### Next exact task (Phase 3 — do not start without approval)

Provider decision required (see Phase 2 report §15). Then: embeddings + hybrid retrieval + MockProvider extraction behind interfaces — still no live model until keys approved.

## Phase 1 — Foundation (COMPLETE)

### Completed work

- npm-workspaces monorepo: `apps/web` (Next.js 16.2.10, App Router, strict TS), `packages/config` (zod env validation, server/public split), `packages/domain` (workspace + audit-event schemas). ESLint 9 (typescript-eslint), Prettier, Vitest (unit + integration configs), Playwright, GitHub Actions CI (`.github/workflows/ci.yml`, secretless).
- Supabase migrations 0001–0004 (see below) applied to `uxmxkdjschbekkbnweby` and recorded in `supabase/migrations/`. RLS enabled on all app tables in the same migration that created them.
- Auth: `@supabase/ssr` cookie-based sessions; `/login` (server action, generic errors); `proxy.ts` session refresh + redirect (UX gate only — RLS is the authorization layer). No signup surface. Two demo users seeded via documented SQL process; credentials only in gitignored `.env.local`.
- Workspace create/list/open UI with audit trail display; audit events written via `record_audit_event` RPC; workspace overview 404s identically for "missing" and "not yours".
- Secret scan script (`scripts/check-secrets.mjs`) covering tracked files + built client bundle + tracked-.env check.

### Architecture as implemented

Web app + parse worker (Phase 2). Privileged paths use service-role + direct DATABASE_URL; ordinary reads use anon-key clients under RLS.

### Schema/migrations added (Phase 1)

| Migration                                  | Objects                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260717000001_workspaces_members_audit`  | `workspaces`, `workspace_members`, `audit_events` tables; `is_workspace_member()`, `handle_workspace_created()` (auto-enroll owner), `set_updated_at()`, `reject_audit_event_mutation()` (immutability trigger), `record_audit_event()` RPC; RLS enabled + policies |
| `20260717000002_storage_documents_bucket`  | private bucket `workspace-documents`; select/insert/delete policies on `storage.objects` keyed on membership of path segment 1                                                                                                                                      |
| `20260717000003_workspaces_owner_select`   | SELECT policy widened to owner-OR-member (INSERT…RETURNING vs AFTER-trigger ordering; D-016)                                                                                                                                                                        |
| `20260717000004_function_grants_hardening` | revoked PUBLIC/anon EXECUTE on definer functions; schema-wide default-privilege revoke (D-017)                                                                                                                                                                      |

## Phase 0 — Read, inspect, plan (COMPLETE)

See prior entries / `docs/implementation-plan.md`.
