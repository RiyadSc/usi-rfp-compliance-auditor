# Final Project Handoff

The product is a synthetic/demo RFP decision-support application that privately ingests PDFs, extracts immutable unverified candidates, independently verifies exact source evidence, generates a deterministic checklist/readiness view, audits a proposal draft against verified requirements, and produces deterministic private reports/exports with human review and append-only provenance.

Phases 0–8 are implemented. The current deployment target is the development Supabase project `uxmxkdjschbekkbnweby`; no production rollout is included. The selected Phase 4 verification configuration is pinned `gpt-5.5-2026-04-23`, low reasoning, fingerprint `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`. General live verification is disabled and `MockProvider` remains default. Only a separately controlled synthetic harness may ever enable the selected live path.

Prepared demo:

1. Confirm `.env.local` is present but untracked and project ref is exact.
2. Run `npm run demo:provision:phase8` (idempotent).
3. Run `npm run demo:reset:phase8 -- --dry-run`, then `npm run demo:reset:phase8`.
4. Start web and worker, sign in with synthetic demo user A, and open workspace `81000000-0000-4000-8000-000000000002` at `/demo`.
5. Follow `docs/demo-runbook.md`. The fixture must show 24 candidates, Forms A-1 through E-5 missing, eight planted proposal findings, deterministic report/export, and the synthetic watermark.
6. Run the critical path with `PHASE8_REHEARSAL_INDEX=preflight PLAYWRIGHT_REUSE=0 npx playwright test --grep @demo-critical --workers=1`.

Tests: `npm run test:unit`, then `npm run test:integration` sequentially, then `npm run test:e2e:isolated`, `npm run eval:mock:phase8`, and `npm run gates`. Reports/exports are generated from the protected report UI; CSV/HTML artifacts stay in private storage and download grants last 300 seconds.

Known limits and restrictions are in the Phase 8 completion/security/performance reports. In particular: synthetic/public data only; no general live provider; no claim of compliance, approval, legal sufficiency, or formal WCAG certification; parser uncertainty requires humans; HTML/CSV only; signed grants remain bearer capabilities until expiry; retention scheduling is operational work; and the moderate PostCSS advisory is accepted pending a compatible upgrade.

Phase 8 implementation is `f1614e39d58691187981adf59fa7685552f097f9`; evaluation/demo/test evidence is `97aee01e4264827273d0c8b2e8e44320b85ca725`. The exact documentation/handoff commit is the final `HEAD` reported with this handoff.
