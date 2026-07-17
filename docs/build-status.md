# Build Status

## Current phase: Phase 1 complete — awaiting go-ahead for Phase 2

Last updated: 2026-07-17.

## Phase 1 — Foundation (COMPLETE)

### Completed work

- npm-workspaces monorepo: `apps/web` (Next.js 16.2.10, App Router, strict TS), `packages/config` (zod env validation, server/public split), `packages/domain` (workspace + audit-event schemas). ESLint 9 (typescript-eslint), Prettier, Vitest (unit + integration configs), Playwright, GitHub Actions CI (`.github/workflows/ci.yml`, secretless).
- Supabase migrations 0001–0004 (see below) applied to `uxmxkdjschbekkbnweby` and recorded in `supabase/migrations/`. RLS enabled on all app tables in the same migration that created them.
- Auth: `@supabase/ssr` cookie-based sessions; `/login` (server action, generic errors); `proxy.ts` session refresh + redirect (UX gate only — RLS is the authorization layer). No signup surface. Two demo users seeded via documented SQL process; credentials only in gitignored `.env.local`.
- Workspace create/list/open UI with audit trail display; audit events written via `record_audit_event` RPC; workspace overview 404s identically for "missing" and "not yours".
- Secret scan script (`scripts/check-secrets.mjs`) covering tracked files + built client bundle + tracked-.env check.

### Architecture as implemented

Web app only (no worker yet — first async job lands with Phase 2 parsing). All DB access via anon-key clients under RLS; no service-role key anywhere. Environment validated at first server use (`packages/config` + `apps/web/src/lib/env.ts` behind `server-only`).

### Schema/migrations added

| Migration                                  | Objects                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260717000001_workspaces_members_audit`  | `workspaces`, `workspace_members`, `audit_events` tables; `is_workspace_member()`, `handle_workspace_created()` (auto-enroll owner), `set_updated_at()`, `reject_audit_event_mutation()` (immutability trigger), `record_audit_event()` RPC; RLS enabled + policies |
| `20260717000002_storage_documents_bucket`  | private bucket `workspace-documents`; select/insert/delete policies on `storage.objects` keyed on membership of path segment 1                                                                                                                                      |
| `20260717000003_workspaces_owner_select`   | SELECT policy widened to owner-OR-member (INSERT…RETURNING vs AFTER-trigger ordering; D-016)                                                                                                                                                                        |
| `20260717000004_function_grants_hardening` | revoked PUBLIC/anon EXECUTE on definer functions; schema-wide default-privilege revoke (D-017)                                                                                                                                                                      |

### Tests passing (exact commands)

- `npm run lint` — pass. `npm run format:check` — pass. `npm run typecheck` — pass (3 workspaces).
- `npm run test:unit` — 14/14 pass (env validation, workspace schema, audit-type allowlist).
- `npx vitest run --config vitest.config.integration.ts` — 23/23 pass against live project: two-user RLS isolation (workspaces, members, audit events), audit immutability + fabrication denial, storage upload/download/list/signed-URL isolation incl. unauthenticated access.
- `npx playwright test` — 5/5 pass: unauthenticated redirect, wrong-credentials error, sign-in→create→reopen workspace + audit trail, cross-user workspace URL → Not found, malformed id → Not found.
- `npm run build` — production build clean. `npm run check:secrets` — pass (69 tracked files + bundle).

### Known defects

- None functional. Supabase security advisors: 2 informational WARNs remain (intentional: `is_workspace_member` and `record_audit_event` are authenticated-callable by design); `auth_leaked_password_protection` disabled — dashboard-only setting, recorded as runbook prerequisite along with disabling public signup.
- `npm audit`: 2 moderate advisories in Next.js's bundled postcss (transitive, no non-breaking fix; monitor for Next patch release).

### Risks (updates)

- R9 (new): a workspace member can insert well-formed allowlisted audit events for their own workspace via the RPC (no service-role key exists for a stricter server-only path). Actor identity and membership are enforced; events are immutable. Acceptable for demo; revisit if a service-role key is provisioned.
- R10 (new): Auth dashboard settings (disable public signup, leaked-password protection) cannot be set via MCP; must be confirmed manually before stakeholder demo. App exposes no signup UI, mitigating exposure.

### Changed decisions

D-012…D-017 added (see decision-log.md), including Next.js 16 `proxy.ts` convention and owner-OR-member SELECT policy.

### Relevant files for next phase

`supabase/migrations/`, `apps/web/src/lib/supabase/server.ts`, `apps/web/src/app/workspaces/actions.ts`, `packages/domain/src/`, `tests/integration/helpers.ts`, `docs/implementation-plan.md` (Phase 2), Engineering Design §6 (pipeline), §5.2 (documents/document_pages schema).

### Next exact task (Phase 2 start)

1. Context7: pdfjs-dist text extraction API; pg-boss current setup; Supabase Storage signed upload URLs.
2. Migration 0005: `documents`, `document_pages`, parse-status state machine fields, RLS (membership-derived), plus pg-boss schema decision.
3. Signed upload flow (PDF-only, MIME/extension/magic-byte + size/page limits, SHA-256 dedup) → `apps/worker` parse job → page-level text persistence → document/page viewer with parse warnings; Playwright + integration coverage per testing-strategy.

### Invariant check (Phase 1)

1/4 (evidence-gated display, provenance): no findings exist yet — no path displays "verified" anything. 2/3: no extraction/verification stages yet. 5/6: no AI surface yet; no document content processed. 7/8: n/a. 9: explicit error states on login/create/list/load; generic auth errors. 10/11: only synthetic placeholder blob used in tests. 12: workspace predicates + RLS on every table/bucket; verified by 23 integration tests. 13: RLS never disabled; advisors reviewed; grants hardened. 14: no secrets in repo/bundle (scan green); anon key is public-by-design. 15: audit_events immutable + controlled write path; workspace_created recorded. 16: n/a until analysis exists. Stop-and-ask respected: only the approved project mutated; auth-user seeding went through explicit approval.

## Phase 0 — Read, inspect, plan (COMPLETE)

### Completed work

- Read both source documents in full (`USI_AI_RFP_Compliance_Auditor_PRD.md`, `USI_AI_RFP_Compliance_Auditor_Engineering_Design.md`).
- Inspected repository: was an empty folder (no git, no package config, no code) containing only the two source documents (.md + .pdf) and skill folders. Git initialized (D-009).
- Inspected toolchain: node v22.13.1, npm 10.9.2; no pnpm; Playwright CLI 1.61.1 via npx; no local PDF tools (pdftoppm/mutool/qpdf/gs absent); no supabase CLI; no model-provider API keys in environment.
- Verified skills/plugins: Context7 `find-docs` (working via `npx ctx7@latest`, needs network permission), Playwright `playwright-cli` skill, Superpowers workflow skills, Supabase MCP (read+write) — all available. No Context7 MCP server; CLI path is the documented mechanism.
- Inspected Supabase read-only: project `RFP demo` (`uxmxkdjschbekkbnweby`), org BabsonWealth, us-east-2, Postgres 17.6, ACTIVE_HEALTHY, created 2026-07-16. Empty: 0 public tables, 0 migrations, 0 auth users, 0 storage buckets, no security advisor findings. Installed extensions: plpgsql, pgcrypto, pg_stat_statements, uuid-ossp, vault. Available (not installed): vector 0.8.2, pg_trgm, pgmq, pgtap. No unrelated/sensitive data present. **No mutations performed.**
- Produced all eight handoff docs, implementation sequence, technology selections, Mermaid data-flow diagram (architecture-summary.md), threat model (security-model.md), assumptions/open questions/risk register (below), first vertical slice (implementation-plan.md).

### Architecture as implemented

None yet — no application code written (per Phase 0 rules).

### Schema/migrations added

None. `supabase/migrations/` to be created in Phase 1.

### Tests passing

None exist yet (no code).

### Known defects

None (no code). Documented environment gaps: no model API key (OQ-1), no supabase CLI installed locally (install in Phase 1 for migration tooling), no OCR capability (accepted demo limitation, D-003).

### Risks (register)

| ID  | Risk                                                          | Likelihood    | Impact | Mitigation                                                                                                                             |
| --- | ------------------------------------------------------------- | ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | No model API key available → Phase 3+ live extraction blocked | Certain today | High   | MockProvider + cached fixture path keeps everything else unblocked; ask user (OQ-1)                                                    |
| R2  | pdfjs text extraction fidelity (offsets, hyphenation, tables) | Medium        | Medium | We author the synthetic fixture ourselves → machine-readable by construction; parser confidence + warnings surfaced; adapter swappable |
| R3  | Hallucinated/missed requirements at extraction                | Medium        | High   | Independent verification, quote-on-page checks, known-answer eval, zero-critical-false gate                                            |
| R4  | Prompt injection via fixtures/drafts                          | Medium        | High   | Content-as-data envelope, structured output, injection fixtures in CI                                                                  |
| R5  | Cross-workspace leakage bug                                   | Low–Medium    | High   | RLS from day one, mandatory predicates, automated isolation tests                                                                      |
| R6  | Demo instability (network/provider)                           | Medium        | High   | Deterministic cached fallback (invariant 16), pre-generated report, three rehearsals                                                   |
| R7  | Scope creep vs 10–15 day demo estimate                        | Medium        | Medium | P0-first vertical slices; P1/should-have items only after P0 green                                                                     |
| R8  | Cost overrun on model calls                                   | Low           | Medium | Per-run budget env var, bounded retries, cost surfaced to operator                                                                     |

### Assumptions

- A1: The `.md` conversions of the two PDFs are complete and authoritative (D-010).
- A2: Supabase project `uxmxkdjschbekkbnweby` is the intended target (named "RFP demo", created today, empty).
- A3: I author the synthetic security-services RFP fixture (~35–60 pages) — permitted since fully synthetic (invariant 11).
- A4: Demo runs locally for the stakeholder presentation unless a hosting decision is made (OQ-2); no public exposure without protection.
- A5: PDF-only ingestion is acceptable for the demo; DOCX deferred behind the adapter (FR-002 lists DOCX — narrowing documented, revisit if fixture needs it).
- A6: English-language documents only.

### Open questions (non-blocking except where noted)

- **OQ-1 (blocks Phase 3 live extraction only):** Which model provider + API key? Committing is a paid-service decision requiring user approval. Options: Anthropic Claude / OpenAI (both support JSON-schema structured output). Everything through Phase 2, and all Phase 3+ development against MockProvider, proceeds regardless.
- OQ-2: Deployment target for the demo (local vs Vercel). Deferred; default local.
- OQ-3: Is there a GitHub remote/CI service, or are locally-run quality-gate scripts sufficient? Default: local scripts wired CI-ready.
- OQ-4: DOCX ingestion needed for the demo, or PDF-only acceptable? Default PDF-only (A5).

### Changed decisions

None — first phase. All Phase 0 decisions in `decision-log.md` (D-001…D-011).

### Relevant files for next phase

- `docs/implementation-plan.md` (Phase 1 scope + first vertical slice)
- `docs/invariants.md` (per-phase checklist)
- `docs/architecture-summary.md` (stack, layout, env vars)
- `docs/security-model.md` (RLS/storage/auth rules)
- Engineering Design §4 (stack), §5 (schema), §13.2 (env vars) if detail needed

### Next exact task (Phase 1 start)

1. Verify current stable Next.js + Supabase SSR auth docs via Context7 (`find-docs`).
2. Scaffold npm-workspaces monorepo (`apps/web`, `apps/worker`, `packages/*`) with strict TS, ESLint, Prettier, Vitest, Playwright, zod-validated env.
3. Write first Supabase migration (workspaces, workspace_members, audit_events + RLS) into `supabase/migrations/`, record it in repo, then apply via MCP `apply_migration` after re-confirming target project.
4. Seed two demo users (signup disabled); build minimal shell + workspace create/open; Playwright test + RLS isolation test.

### Invariant check (Phase 0)

No code, no data, no mutations — invariants 1–9, 12–16 not yet exercisable; invariants 10–11 hold (no real data used; no fixtures created yet); Supabase inspected read-only; no RLS weakened (nothing exists). Stop-and-ask triggers respected: no writes, no paid commitments.
