# Phase 8 Performance and Reliability

Version: `phase8-performance-v1`.

Privacy-safe server instrumentation records operation, duration, bounded item/page counts, cache outcome, success/failure, and a normalized error category. It never records document or proposal text, evidence, prompts, secrets, headers, object paths, or signed URLs. Instrumented operations include checklist generation, proposal audit, report/export generation, signed grants, reset, and the route/render categories defined in `PHASE8_PERFORMANCE_BUDGET_MS`. Telemetry is best-effort and cannot turn a successful action into a product failure.

Prepared-demo budgets are 3 seconds for a single prepared workspace/register/checklist/audit/report render, 2 seconds for an evidence viewer or cached export action, 1 second for a signed grant, 30 seconds for reset, and 180 seconds for the complete presentation. The rehearsal harness measures composite browser steps. Its sign-in/workspace and report/export/audit groups each span multiple navigations/actions, so their honest composite budget is 5 seconds rather than the single-route target.

Three clean rehearsals completed in 19.735, 20.361, and 19.733 seconds (mean 19.943 seconds; 0.628-second range). Reset took 68–84 ms. The slowest composite step was report/export/audit at 3.996–4.599 seconds. No rehearsal retried, failed, called a provider, missed evidence navigation, or crossed a workspace boundary. Measurements are in `artifacts/evaluation/phase8-performance-v1.json` and the per-run artifacts under `artifacts/rehearsals/`.

After client instrumentation was enabled, prepared-workspace rows recorded page loads at 689–1,724 ms, server response at 530–1,552 ms, evidence viewer at 1,704–1,724 ms, document viewer at 865–1,724 ms, checklist rendering at 909–1,157 ms, and report rendering at 689–690 ms. These are bounded metadata only and fall within the applicable prepared-route budgets. The beacon batches at most three events into one authenticated action to avoid concurrent SSR session-cookie refresh races.

The monolithic long-lived Next development-server browser run showed session/server instability after several specs. The controlled gate therefore starts a fresh server and authentication boundary for each spec, sequentially, via `npm run test:e2e:isolated`. This is an execution-isolation control, not a product fallback; all tests still use the real application, worker, and development Supabase paths.
