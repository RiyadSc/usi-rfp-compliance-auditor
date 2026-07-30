# USI AI RFP Compliance Auditor

[![CI](https://github.com/RiyadSc/usi-rfp-compliance-auditor/actions/workflows/ci.yml/badge.svg)](https://github.com/RiyadSc/usi-rfp-compliance-auditor/actions/workflows/ci.yml)

Evidence-first RFP review software for security and other proposal teams. The application turns an RFP into source-linked findings, a reviewable requirement register, a deterministic checklist, blockers, proposal-audit findings, and reports. It is decision support: it never claims that a bid is compliant, approved, or safe to submit.

## What works today

The completed product path is:

```text
RFP files → parsed pages → candidate requirements → independent verification
→ human review → checklist and blockers → proposal audit → reports/exports
```

- **Phase 1–3:** secure workspace/document ingestion and candidate extraction. Extracted requirements remain explicitly unverified.
- **Phase 4:** independent source verification is complete for the frozen synthetic fixture. The selected configuration is `gpt-5.5-2026-04-23` with `low` reasoning, pinned by compatibility fingerprint `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`.
- **Phase 5:** deterministic checklist generation, owners, workflow states, required artifacts, waivers, blockers, and readiness summaries.
- **Phase 6:** proposal-draft audit with evidence-linked findings and human resolution history.
- **Phase 7–8:** reports/exports, security hardening, reliability controls, demo reset, accessibility states, and mock-only evaluation coverage.
- **Phase 9:** a jurisdiction-neutral workspace analysis path exists for explicitly selected public or otherwise authorized documents. Its review-acceleration workspace now puts critical obligations and source exceptions first, groups only deterministic duplicates, and permits explicit batch decisions only for clean routine findings. It remains rollout-controlled and does not prove complete recall for an arbitrary real-world RFP.

## What is demo-only, qualified, or experimental?

### Qualified and safe to demonstrate

The prepared synthetic/demo workspace is the reference demonstration. It has frozen known answers, exact source-page evidence, planted missing forms, addenda, blockers, proposal errors, reports, and audit history. The controlled Phase 4 synthetic smoke passed its production-path, persistence, isolation, provenance, and UI checks. Ordinary live verification remains disabled.

`MockProvider` is the default for normal demos, tests, and Playwright. It makes no OpenAI calls.

The prepared demo also contains a provider-free Phase 9 review population, a six-step first-run tour, and a separate 14-step presenter-controlled stakeholder tour. The tour uses the real application surfaces and never records a review, publishes requirements, assigns work, or changes protected evidence automatically.

### Controlled only

The protected synthetic Phase 4 smoke harness may call the pinned OpenAI model only with the explicitly approved synthetic scope, fingerprint, budget, and command-line opt-in. It is not a general “turn on AI for every workspace” switch.

### Experimental

Phase 9 can analyze a selected RFP from any jurisdiction, including public security solicitations, using the same evidence-first architecture. It is not yet a proof that every requirement in an arbitrary RFP was found. Public-RFP runs need an independently reviewed answer set, source coverage review, and human review before their findings should drive a bid.

## Happy-path synthetic demo

From the repository root:

```bash
npm install
npm run migrate:phase9:review-demo
npm run migrate:phase9:review-policy
npm run demo:provision:phase8
npm run demo:reset:phase8 -- --execute
npm run demo:check:tour
LIVE_PROVIDER_ENABLED=false PHASE4_LIVE_VERIFICATION_ENABLED=false npm run dev --workspace apps/web
```

In a second terminal:

```bash
LIVE_PROVIDER_ENABLED=false PHASE4_LIVE_VERIFICATION_ENABLED=false npm run worker:dev
```

Open the URL shown by Next.js, normally `http://localhost:3000`. Open the prepared synthetic workspace, then choose **Guided tour** → **Start guided demo**. Presenter Notes are optional and session-only. To restore the presentation and guided-tour starting state:

```bash
npm run demo:reset:phase8
npm run demo:reset:phase8 -- --execute
```

The director walkthrough is: see the executive review summary, start with deadlines and other submission-critical findings, inspect an exact quotation and source page, record one individual decision, review a clean routine group, show an unresolved page exception and the fail-closed publication gate, then continue to the submission checklist, proposal audit, and readiness report. Workflow state never rewrites source evidence.

## Phase 9 review acceleration

Every Phase 9 finding remains in the immutable audit population and receives exactly one deterministic review lane. Lane precedence is `exception → critical → duplicate → routine`:

- **Exceptions** include unsupported/non-active findings, evidence or page-reference failures, ambiguity, parser uncertainty, and unresolved page-coverage issues. They always need individual judgment.
- **Critical** includes clean active deadlines, forms, signatures, pricing, insurance, licensing, bonds, mandatory certifications/attachments, meetings, and submission instructions. They always need individual review.
- **Duplicates** are only conservative, explainable, non-canonical matches with identical material facts and evidence identity. Records are grouped, never deleted or merged.
- **Routine** is the only lane eligible for explicit batch acceptance, and only while every selected record remains supported, active, exact-evidence-valid, unambiguous, non-critical, current, and in the same workspace/run.

The server recomputes eligibility at confirmation. An invalid or stale selection rolls back as one transaction. Every successful batch still creates one append-only human decision per finding, linked by a shared batch ID. Publication keeps the existing fail-closed rules and remains locked until all required finding and page-exception decisions are resolved.

The executive summary emphasizes blockers, deadlines, unresolved exceptions, next action, progress, and an approximate review-effort range before showing the total population. The estimate is a planning range based on remaining individual items, duplicate groups, and batch-eligible work; it is not a guarantee.

The provider-free New Jersey replay preserved all 329 findings: 88 critical, 11 exception, 0 deterministic duplicates, and 230 routine. With bounded 25-item queue pages, the routine population needs 10 explicit batch confirmations, so estimated finding-decision interactions fall from 329 to 109 (66.87%). Including 38 unchanged page-coverage decisions, estimated interactions fall from 367 to 147 (59.95%). These are workflow estimates—not measured review duration, extraction precision/recall, or proof that every requirement was found.

The review queue is scoped to one completed analysis run. The ordinary requirement register projects the latest completed verification scope only; prior runs and rejected, uncertain, superseded, or follow-up findings remain available as immutable audit history rather than silently mixing into the current operating view. The prepared demo likewise binds checklist and downstream examples to their exact completed generation run, so a later demo reset or review population cannot change what a prepared checklist represents.

## Testing and quality gates

The complete local gate is intentionally sequential because integration and browser tests share authenticated demo state:

```bash
npm run gates
```

`npm run gates` runs the static/core gates first (lint, formatting, type-check, unit tests, deterministic evaluation, migration validation, lockfile, dependency and secret checks, and production build), then runs the Supabase integration suite and isolated Playwright suite. It requires a configured development Supabase project in `.env.local` and does not make live AI calls.

The root lockfile now pins the compatible security patch set Next `16.2.12`, PostCSS `8.5.19`, and Sharp `0.35.3`; the current dependency audit reports zero vulnerabilities. The full sequential release rerun is still required before this workstream is called closed—do not infer it from a single core, integration, or browser result.

For environments without Supabase/browser services, the static portion is explicit:

```bash
npm run gates:core
npm run test:integration       # Supabase/RLS; run separately and sequentially
npm run test:e2e:isolated      # fresh web/worker process per spec
```

Other useful deterministic checks:

```bash
npm run eval:mock:phase8
npm run check:migrations
npm run check:secrets
```

Live evaluation is never part of ordinary gates, CI, Playwright, or application startup. It requires a separately authorized, command-scoped opt-in and its own spend controls.

## CI status and branch protection

`.github/workflows/ci.yml` runs the secretless core gates automatically on pushes to `main` and pull requests. A separate controlled job runs Supabase integration and browser tests only on manual dispatch with development secrets; this prevents credentials and shared demo state from entering untrusted pull-request runs. Repository administrators must mark the `quality-gates` job as a required branch check in GitHub. The controlled job is the full-system validation path and should be run before a release or migration merge.

If GitHub shows no status for `main`, check that Actions are enabled and that the workflow's `quality-gates` job is selected in branch protection. A green `quality-gates` result means the secretless core gates passed; it does not mean the Supabase/browser job was run.

## Latest known limitations

- There is no mathematical guarantee that an arbitrary RFP produced every requirement. Completeness is reported through page coverage, parser warnings, source exceptions, and human review; a real solicitation still needs an accountable reviewer.
- Review acceleration reduces repetitive decisions over the findings that exist; it cannot discover an obligation that the source-analysis population never contained.
- Addenda, tables, scanned pages, ambiguous dates, and badly extracted PDFs can remain parser-uncertain or require follow-up.
- A finding is not a bidder-compliance decision. Company evidence such as insurance certificates, licenses, staffing proof, and signatures still needs human/company validation.
- The ordinary live path is rollout-disabled. The generic Phase 9 path is for explicitly selected public/authorized documents and remains exploratory until its source coverage and recall are independently evaluated.
- `store: false` reduces provider retention behavior but is not a contractual zero-data-retention guarantee.
- Private storage URLs are temporary bearer capabilities; retention cleanup and operational deployment controls still belong to the deployment owner.

## Repository map

```text
apps/web              Next.js App Router application
apps/worker           pg-boss parse/extract/verification worker (health :3001)
packages/ai           providers (Mock/OpenAI), chunking, retrieval, schemas
packages/config       Zod-validated server/public environment configuration
packages/documents    PDF validation, state machine, parser adapters
packages/domain       entities, deterministic engines, state transitions
supabase/migrations   version-controlled SQL migrations with RLS
fixtures/             synthetic and known-answer fixtures
scripts/              provisioning, gates, scans, and evaluation harnesses
tests/unit            Vitest unit tests
tests/integration     Supabase/RLS/storage/isolation tests
tests/e2e              Playwright flows
docs/                 build status, invariants, decisions, runbooks, and reports
```

Start with [`docs/build-status.md`](docs/build-status.md), [`docs/invariants.md`](docs/invariants.md), and [`docs/architecture-summary.md`](docs/architecture-summary.md) when you need the detailed engineering record.

## Security posture

- Private `workspace-documents` storage; uploads use server-minted signed URLs.
- Workspace, document, evidence, checklist, report, and audit records are RLS-scoped; privileged writes use controlled server/worker paths.
- `OPENAI_API_KEY` is server/worker-only and is never intentionally stored in client bundles, database rows, or routine logs.
- PDFs and retrieved passages are treated as hostile input. Provider calls use bounded, delimited evidence, strict schemas, no tools, and `store: false`.
- Unsupported, contradicted, superseded, parser-uncertain, or human-review-pending findings cannot silently become ordinary active checklist obligations.
