# USI AI RFP Compliance Auditor — Demo

Evidence-first RFP review demo: extracts candidate requirements from uploaded RFPs, independently verifies them against page-level source evidence, tracks submission checklists and blockers, and audits proposal drafts for unsupported claims. **Decision support only** — never claims compliance or submission safety. Synthetic/public data only.

Start with `docs/build-status.md` (current state), `docs/invariants.md` (non-negotiables), and `docs/implementation-plan.md` (phases).

## Layout

```text
apps/web              Next.js 16 App Router application
packages/config       zod-validated environment (server/public split)
packages/domain       entities, schemas, state transitions
supabase/migrations   version-controlled SQL migrations (RLS everywhere)
scripts/              secret scan, seed templates
tests/unit            Vitest unit tests
tests/integration     live RLS/storage isolation tests (needs .env.local)
tests/e2e             Playwright flows (needs .env.local)
docs/                 durable build documentation
```

## Setup

1. Node ≥ 22, npm. `npm install`.
2. Copy `.env.example` → `.env.local` and fill values (never commit). Demo users are provisioned by the operator (`scripts/seed-demo-users.template.sql`); there is no signup.
3. `npm run dev --workspace apps/web` → http://localhost:3000

## Quality gates

```bash
npm run gates        # lint + format:check + typecheck + unit tests + secret scan + build
npm run test:integration   # live Supabase RLS/storage isolation (serial)
npm run test:e2e           # Playwright (starts dev server)
```

CI (`.github/workflows/ci.yml`) runs the secretless subset: lint, format, typecheck, unit tests, build, secret scan.

## Security posture (Phase 1)

- All tenant tables have RLS derived from `workspace_members`; storage bucket is private with membership-derived path policies; audit events are immutable with a controlled write path.
- No service-role or provider keys exist in the repo, client bundle, or environment; `scripts/check-secrets.mjs` enforces this.
- Uploaded documents are untrusted data (enforced progressively from Phase 2+; see `docs/security-model.md`).
