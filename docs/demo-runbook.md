# Demo Runbook

1. Use only the protected synthetic/public demo accounts and workspace.
2. Open the requirement register and show that source support, precedence, proof, and human review are separate.
3. Open **Checklist and blockers**. Confirm the readiness banner says `Blocked by 5 required items` and exactly five mandatory-form rows are blocked.
4. Open Form A-1, show the immutable Phase 4 link, exact quotation, and original page 2 navigation.
5. Assign a same-workspace owner, move workflow to `in_progress`, link an existing allowed PDF artifact, and record an exception note.
6. Request a waiver and show the append-only pending state. Explain that it cannot remove a blocker until an authorized final decision exists.
7. Show deterministic readiness counts and audit history. State explicitly that workflow completion is not human acceptance or a source-status change.
8. Open **Proposal draft audit** and select a parsed synthetic proposal plus the completed checklist.
9. Show response coverage, atomic claims, separate support/consistency, exact source quotation, and original proposal/source page navigation.
10. Open a finding, explain the machine-only/pending label, and append a human decision. Show that the original finding and decision history remain.
11. Demonstrate a second workspace URL returns Not Found.
12. Open **Reports and exports**, select one completed synthetic Phase 4–6 run chain, and generate the executive report. Point out the source snapshot, input hash, report versions, and separate human-review denominators.
13. Show `3 of 10` required items, the five planted mandatory-form rows, the separate human-proof item, critical/blocking findings, source coverage, and the synthetic watermark.
14. Open missing Form A-1, follow its immutable Phase 4 evidence, and navigate to original page 2.
15. Generate the missing-artifacts CSV. Explain that it is stored privately, formulas are neutralized, the download link lasts five minutes, regeneration creates a new immutable generation, and revocation removes the backing object while preserving history.
16. Use report phase/severity/review/type filters and pagination, then demonstrate a second workspace report URL returns Not Found.

No Phase 5, Phase 6, or Phase 7 step invokes a paid provider. General live Phase 4 verification remains disabled.

## Phase 8 protected full-roadmap demo

### Five-minute preflight

1. Confirm project ref `uxmxkdjschbekkbnweby`, synthetic user A, and a clean worktree. Do not print environment values.
2. Run `npm run demo:provision:phase8`; expect scope `81000000-0000-4000-8000-000000000001`, workspace `...000002`, 24 candidates, two documents, and zero provider calls/spend.
3. Run `npm run demo:reset:phase8 -- --dry-run`, then `npm run demo:reset:phase8`; expected final state hash is `215f97d1472e013de82fa0e74d1f6821eabc88608ede05f516f956367fde833e`.
4. Run `PLAYWRIGHT_REUSE=0 npx playwright test --grep @demo-critical --workers=1` or inspect the last three rehearsal artifacts.
5. Start web and worker with `LIVE_PROVIDER_ENABLED=false` and `PHASE4_LIVE_VERIFICATION_ENABLED=false`.

### Presentation

Use **Executive view** for the narrated walkthrough; switch to **Analyst view** only when the audience asks for schema, model, hash, or run detail. Follow the page's suggested sequence rather than opening records at random:

1. Start with the opportunity and deadline.
2. Explain that RFP requirements are source-backed machine assessments and still distinct from human review.
3. Show the five missing forms as submission blockers.
4. Inspect one planted draft risk beside its RFP source.
5. Finish with the final-review decision brief and the explicit next action.

Use business labels in narration: `RFP-backed`, `Replaced by an addendum`, `Company document needed`, and `Team confirmation needed`. Avoid internal enum names unless explaining the audit trail. Do not describe checklist completion as procurement compliance or customer approval.

1. Sign in as synthetic user A and open workspace `81000000-0000-4000-8000-000000000002` → **Full-roadmap demo**.
2. Confirm the `Prepared synthetic demo` banner, fixture `full-roadmap-known-answer-v1`, exact Phase 4 fingerprint, and 24 immutable candidates.
3. Open Mandatory Form A-1: exact quote is on source page 18. Navigate to the original 22-page RFP.
4. Show exactly five critical missing forms: A-1/page 18, B-2/page 19, C-3/page 20, D-4/page 21, E-5/page 22. Open the first checklist/evidence view.
5. Show the eight proposal findings: unsupported fact, delivery contradiction, deadline conflict, insurance mismatch, wrong procurement reference, missing response, company proof, and injection attempt with zero influence. Open proposal page 4 and relevant RFP evidence.
6. Record one finding review and show append-only resolution history.
7. Open the executive report: show critical blockers, unresolved findings, missing artifacts, source/review denominators, provenance, and watermark.
8. Validate a short-lived private download. The UI must say it expires in 300 seconds and audit `demo_fallback_activated`; never copy a URL/token into notes or screenshots.
9. Switch to fallback only if deliberately rehearsing it. Disclose `Prepared fallback snapshot — synthetic data` and that it is not a new report.
10. In a separate user-B browser, open the demo URL and confirm uniform Not found.

Expected complete flow is about 20 seconds in the prepared environment; allow five minutes for presentation narration. Afterward, run reset again and close all signed-download tabs. Do not change RLS, storage privacy, provider flags, hashes, or fixture answers during a demo.
