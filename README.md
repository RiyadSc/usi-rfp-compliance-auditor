# USI AI RFP Compliance Auditor — Demo

Evidence-first RFP review demo: extracts candidate requirements from uploaded RFPs, independently verifies them against page-level source evidence, tracks submission checklists and blockers, and audits proposal drafts for unsupported claims. **Decision support only** — never claims compliance or submission safety. Synthetic/public data only.

Start with `docs/build-status.md` (current state), `docs/invariants.md` (non-negotiables), and `docs/implementation-plan.md` (phases).

## Layout

```text
apps/web              Next.js 16 App Router application
apps/worker           pg-boss PDF parse worker (health :3001)
packages/config       zod-validated environment (server/public split)
packages/documents    PDF validation, state machine, ParserAdapter
packages/domain       entities, schemas, state transitions
supabase/migrations   version-controlled SQL migrations (RLS everywhere)
fixtures/demo-rfp     synthetic PDF fixtures
scripts/              secret scan, seed templates
tests/unit            Vitest unit tests
tests/integration     live RLS/storage/document isolation tests
tests/e2e             Playwright flows
docs/                 durable build documentation
```

## Setup

1. Node ≥ 22, npm. `npm install`.
2. Copy `.env.example` → `.env.local` and fill values (never commit). Requires `SUPABASE_SERVICE_ROLE_KEY` and direct `DATABASE_URL` (port 5432) for Phase 2.
3. `npm run dev --workspace apps/web` and `npm run worker` (or let Playwright start both).
4. Open http://localhost:3000

## Quality gates

```bash
npm run gates              # lint + format:check + typecheck + unit + secret scan + build
npm run test:integration   # live Supabase isolation (needs .env.local)
npm run test:e2e           # Playwright (web :3000 + worker health :3001)
```

## Security posture (Phase 2)

- Private `workspace-documents` bucket; uploads only via server-minted signed URLs; deletes via service role.
- Document/page/job/intent tables: members SELECT only; writes via service role after membership checks.
- PDFs treated as hostile input: magic-byte validation, size/page limits, no remote fetch in parser, escaped text rendering.
- pg-boss schema locked down from PostgREST roles.
