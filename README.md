# USI AI RFP Compliance Auditor — Demo

Evidence-first RFP review demo: extracts **candidate / unverified** requirements from uploaded RFPs (Phase 3), with Phase 4 planned for independent verification, checklists, and draft audit. **Decision support only** — never claims compliance or submission safety. Synthetic/public data only.

Start with `docs/build-status.md` (current state), `docs/invariants.md` (non-negotiables), and `docs/implementation-plan.md` (phases).

## Layout

```text
apps/web              Next.js 16 App Router application
apps/worker           pg-boss parse + extract worker (health :3001)
packages/ai           providers (Mock/OpenAI), chunking, retrieval helpers, schemas
packages/config       zod-validated environment (server/public split)
packages/documents    PDF validation, state machine, ParserAdapter
packages/domain       entities, schemas, state transitions
supabase/migrations   version-controlled SQL migrations (RLS everywhere)
fixtures/demo-rfp     synthetic PDF fixtures
fixtures/eval         known-answer planted pages for extraction eval
scripts/              secret scan, seed templates, eval harness
tests/unit            Vitest unit tests
tests/integration     live RLS/storage/document/analysis isolation tests
tests/e2e             Playwright flows
docs/                 durable build documentation
```

## Setup

1. Node ≥ 22, npm. `npm install`.
2. Copy `.env.example` → `.env.local` and fill values (never commit). Requires `SUPABASE_SERVICE_ROLE_KEY` and direct `DATABASE_URL` (port 5432).
3. Optional: `OPENAI_API_KEY` (server/worker only). If unset, MockProvider powers demos and e2e.
4. `npm run dev --workspace apps/web` and `npm run worker` (or let Playwright start both).
5. Open http://localhost:3000

## Quality gates

```bash
npm run gates              # lint + format:check + typecheck + unit + secret scan + build
npm run test:integration   # live Supabase isolation (needs .env.local)
npm run test:e2e           # Playwright (web :3000 + worker health :3001)
npx tsx scripts/eval-extraction.mjs   # Mock known-answer baseline
```

## Security posture (Phase 3)

- Private `workspace-documents` bucket; uploads only via server-minted signed URLs; deletes via service role.
- Document/page/job/intent/analysis tables: members SELECT only; writes via service role after membership checks.
- `OPENAI_API_KEY` never in client bundle, DB, or logs; Playwright clears it unless `E2E_LIVE_OPENAI=1`.
- Application spend ceiling (`PHASE3_SPEND_CEILING_USD`); also set an OpenAI project budget/alert.
- `store: false` on Responses API ≠ contractual ZDR.
- PDFs treated as hostile input; model sees delimited page evidence only, not whole files.
