# Demo Runbook

## DX0 — Kerry / Justin guided path (minimal narration)

**Workstream:** `docs/ux-discovery/32-dx0-charter.md`
**North star:** Can a first-time stakeholder understand the product in five minutes?
**Assume you speak as little as possible** — let the UI carry orientation.

### Preflight

Same as Phase 8 protected full-roadmap demo (provision + reset + live flags off). Use **View for: Director** and Executive view.

### Reveal sequence (click path)

1. **Home** → open Harbor City Full-Roadmap Synthetic Demo.
2. **Overview** — pause. Let them read: opportunity name, whether blocked, recommended next action. Do not explain the optional stage list unless asked.
3. **Requirements** → open one mandatory form obligation → show **exact quote** → open **original page**.
4. **Submission Checklist** → **Blocking submission** group (five missing forms).
5. **Proposal Review** → open latest run → one conflict/unsupported finding beside RFP evidence → record one human decision if time.
6. **Final Review** → open briefing → blockers + “human decisions remain separate” + staleness if applicable. Stop.

Skip Documents / Live Analysis unless asked. Skip technical fingerprints unless Justin asks.

### Spoken lines (optional, short)

- “This is decision support with exact source proof — not an autopilot.”
- “Accepting an assessment is not approving a bid.”
- “Prepared synthetic demo” stays visible on purpose.

### Observation

Run Session 0 scribe (`20-…`) and score predictions (`31-…`) after the meeting.

---

## Role-based director walkthrough

Start at Home, leave **View for: Director**, and open the Harbor City Full-Roadmap Synthetic Demo. On Overview, explain the six readiness signals, three decision signals, and recommended next action. Follow the nine-step journey to Requirements; open one requirement, its exact quote, and the original PDF page. In Submission Checklist, show the five items under **Blocking submission**. Switch to **Proposal manager** for requirements/checklist depth, **Contributor** for My Work, and **Technical reviewer** only when showing provenance. End in Reports. Never describe a workflow status as compliance or approval.

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

### Controlled Phase 4 synthetic re-verification

The live smoke requires an explicit `--verification-version`. The requested value must be exactly one greater than the highest existing version for the immutable analysis-run/input-hash pair. The dry-run provider-boundary check validates this before provider construction. Duplicate, stale, skipped, fractional, or missing versions fail closed; the database uniqueness constraint remains the final race-condition guard. Never delete an earlier verification run to make a version reusable.

Processing-job identities also include the verification version, preventing a fresh immutable run from colliding with an earlier job. If setup fails after creating a run but before provider construction, the harness records a failed setup audit. The explicit `--reconcile-setup-only` mode may close an older queued setup row only after proving it has no model calls, findings, pass results, job, spend, or completion audit; it cannot resume or erase provider work.

### Prepared 420-page demonstration

Run `npm run demo:provision:large-document`, start web/worker with live flags disabled, and open **Harbor City 420-page Large RFP Demo**. Show exact progress/cost, page 40 table evidence, pages 50–51 split table, page 275 uncertainty, and pages 390/409–411 addendum changes. The script asserts exactly 420 pages, 8 tables, 48 cells, 430 work units, one cost estimate, and one cache entry. Disclose that the history is prepared and provider-free.

# Phase 9 stored public-result walkthrough

After a successful controlled FAC115 acceptance, open the explicitly provisioned public workspace and choose **Live Analysis**. Show source-block coverage, planned versus actual cost, cache reuse, machine-only/review-pending labels, exact PDF evidence, native `Guard Services!I11` evidence, and the duplicate-location ambiguity. Do not represent the result as bidder compliance, human approval, or permission to use confidential data.

Ordinary demos continue to use the prepared deterministic Phase 8 workspace and MockProvider. Never enable general live flags for a presentation.

## FAC115 video-call demo (Director of Sales)

Use this path when the prospect watches while you drive. FAC115 is the **real public RFP** proof; Harbor City remains the synthetic full-roadmap sandbox.

### Preflight

1. Confirm project `uxmxkdjschbekkbnweby`, web running with `LIVE_PROVIDER_ENABLED=false` and `PHASE4_LIVE_VERIFICATION_ENABLED=false`.
2. Ensure FAC115 documents exist (`npm run provision:phase9:fac115` only if the workspace/docs are missing).
3. Project bid-ops journey rows: `npm run provision:phase9:fac115:bid-ops` (requires `PHASE9_BID_OPS_BRIDGE=1`). Expect 23 candidates, open blockers, one illustrative proposal/report, zero provider calls.
4. Sign in as the protected demo operator that can open workspace `80000000-0000-4000-8000-000000000100`.

### Click-path

1. Opportunities → **Massachusetts FAC115 Public Evaluation**.
2. Overview → amber honesty banner; stages 4–6 lit from the Phase 9 projection; proposal/report present but labeled illustrative.
3. Documents → open/download official FAC115 files (short-lived signed URLs).
4. Requirements → curated obligations (deadlines, forms, insurance, pricing cell, superseded conference date).
5. Checklist → blockers / company proof still needed.
6. **Live Analysis** → 23/23 acceptance, cost under `$3`, cache rerun `$0`.
7. Optional: Proposal audit + report as “what final review looks like” with explicit disclosure that no real bidder draft is in the public package.

### Spoken honesty

- Files + requirements + checklist projection = real public RFP + accepted live analysis.
- Proposal/report = illustrative only.
- Do not claim bidder compliance, human approval, or confidential data use.
