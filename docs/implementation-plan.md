# Implementation Plan — AI RFP Compliance Auditor (Demo)

Progressive vertical slices. Each phase ends with: docs updated (`build-status.md`), invariant checklist run, quality gates green, phase report. Detailed task-level plans are written per-phase (superpowers `writing-plans` style) at `docs/superpowers/plans/` when a phase begins.

## Technology selections (proposed, see decision-log.md)

- Next.js App Router (latest stable at Phase 1 start; verify via Context7) + strict TypeScript + React + Tailwind + Radix-based accessible components.
- Supabase: Postgres 17 (project `uxmxkdjschbekkbnweby`), Auth (email/password, signup disabled), private Storage, pgvector + FTS/pg_trgm hybrid retrieval, version-controlled migrations.
- pg-boss job queue in `apps/worker` (Postgres-backed; no new paid service).
- `pdfjs-dist` parser adapter behind a `ParserAdapter` interface; browser pdf.js for page rendering in the evidence viewer.
- `ModelGateway` interface with deterministic `MockProvider` (tests + cached fallback) and one real provider (blocked on OQ-1 API key).
- Zod for all model I/O and env validation; Vitest; Playwright; ESLint + Prettier; gates via npm scripts (CI service optional, OQ-3).
- npm workspaces monorepo per Design §4.1.

## Phase sequence

### Phase 0 — Read, inspect, plan (COMPLETE — see build-status.md)

### Phase 1 — Foundation

Strict TS config; repo conventions; env validation (zod, server-only); lint/format; Vitest; Playwright; quality-gate scripts; Supabase Auth with seeded demo users and signup disabled; workspace creation (table + RLS + UI); private storage bucket + policies; initial migrations; workspace-scoped authorization helpers; `audit_events` foundation; minimal accessible app shell.
**Exit:** build/typecheck/lint/tests pass; two test workspaces cannot read each other's records/files (automated test); no secrets in browser bundle or logs; Playwright creates and opens a workspace.

### Phase 2 — Secure document ingestion

Signed private upload flow; PDF-only (DOCX deferred unless approved); MIME/extension/magic-byte validation; size and page limits; SHA-256 + duplicate detection; document classification (primary_rfp/addendum/attachment/proposal_draft/reference); parse-status state machine; `ParserAdapter`; page-level text persistence with stable page numbers; page render/viewer; parser confidence + warnings surfaced; safe delete/reset.
**Gate before any AI use of content:** authorization verified, document belongs to workspace, validation passed, parsing complete, analysis run explicitly references workspace + document set.
**Exit:** Playwright covers upload, processing states, page navigation, unauthorized access, error handling.

### Phase 3 — Candidate requirement extraction

Versioned prompt set; `ModelGateway`; schema-constrained extraction (RequirementCandidate); strict Zod validation with controlled repair step; all Design §17.1 categories; preliminary evidence candidates; model-call metadata (tokens/latency/cost); bounded retry/timeout; everything lands as `unverified`.
**Fixture:** author synthetic known-answer RFP (~35–60 pages) + 2 addenda with planted: 10 mandatory forms, submission deadline, question deadline, insurance limits, signatures, meetings, attachments, staffing, pricing instructions, evaluation criteria, addendum changes (deadline change + added acknowledgment).
**Exit:** extraction metrics reported vs known answers; no path from extraction to verified state.

### Phase 4 — Independent verification and provenance

Separate verification stage: workspace-filtered hybrid retrieval; quote-exists-on-page validation; support classification (supported/partial/unsupported/contradicted/requires_human_proof/parser-uncertain/superseded); addendum precedence; deterministic date/number validation; dedup; full provenance preserved. Requirement register UI + evidence viewer (title, structured fields, source status, exact quote, document, page, original page view, confidence, run metadata, human decision controls).
**Exit:** known-answer precision, critical false findings (target 0), citation validity (target 100%) reported.

### Phase 5 — Deterministic checklist and blockers

Checklist generated from active verified requirements: forms, deadlines, signatures, acknowledgments, insurance, certifications, attachments, meetings, instructions; owner/status; waivers/exception notes; blockers; deterministic readiness calculation (Design §7.6 statuses only).
**Fixture:** submission package with 5 intentionally missing required forms.
**Exit:** all 5 missing forms detected as critical blockers; no "compliant/approved/safe to submit" language anywhere.

### Phase 6 — Proposal draft audit

Draft upload + parsing; section extraction; atomic claim segmentation; support matching; contradiction detection; missing-response detection; `requires_human_proof` classification (never "false" merely because company evidence is absent); evidence-linked findings; resolution workflow; audit history.
**Tests:** unsupported factual claims; conflicting dates; incorrect insurance values; claims copied from another procurement; missing mandatory responses; contradictory source documents; prompt injection embedded in draft.

### Phase 7 — Reporting and export (COMPLETE — see phase7-completion-report.md)

Executive readiness summary; critical blockers; unresolved findings; missing artifacts; review completion; source coverage; analysis metadata; CSV export; report export; private short-lived download URLs; export audit events; demo watermark. No cross-workspace leakage in exports.

### Phase 8 — Evaluation, security, demo hardening

Full test pyramid (unit/service/Supabase integration/authorization/isolation); prompt-injection fixtures; parser-failure fixtures; malformed-model-output tests; addendum-precedence tests; numeric/date tests; known-answer evaluation vs Design §12.2 thresholds; cost + rate limits; dependency + secret scanning; accessibility states; performance instrumentation; stable demo reset; cached completed analysis; pre-generated report fallback; `@demo-critical` Playwright test covering the 11-step presentation flow; three rehearsals; demo runbook + contingency runbook.

## First vertical slice (Phase 1 detail)

Thin end-to-end proof: authenticated demo user → creates workspace → row lands in RLS-protected table → private bucket exists with workspace-scoped policy → audit event recorded → Playwright verifies create/open + isolation. This exercises auth, DB, RLS, storage policy, env validation, and E2E harness before any AI or parsing work.

## Definition of done (build-level)

Prepared demo flow works; known-answer fixture passes thresholds (form recall 1.00, citation validity 1.00, critical false requirements 0, unsupported-claim recall ≥0.90); five planted missing forms detected; human review gates function; isolation tested; injection fixtures inert; expiring private file access; all gates pass; three successful Playwright rehearsals; cached fallback available.
