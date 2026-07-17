# Decision Log

Append-only. Each entry: date, decision, rationale, reversibility, source.

## Inherited from Engineering Design §17.3 (2026-07-16)

| Decision | Rationale |
|---|---|
| Verification-first, not generation-first | Addresses stakeholder failure mode; reduces demo scope |
| Frozen synthetic/public fixture | Reliable rehearsal; no confidentiality risk |
| Page-level evidence required for verified findings | Auditable; visibly different from generic chat |
| Separate extraction, verification, deterministic rules | Reduces self-confirming model errors |
| Asynchronous jobs | Parsing/analysis exceed safe interactive request durations |
| Model provider behind interface | Avoid provider lock-in |
| No "compliant"/"safe to submit" status | Legal judgment stays human |

## Phase 0 decisions (2026-07-16)

- **D-001 — Target Supabase project.** Use `RFP demo` (`uxmxkdjschbekkbnweby`, org BabsonWealth, us-east-2, Postgres 17). Verified read-only on 2026-07-16: 0 public tables, 0 migrations, 0 auth users, 0 storage buckets — fresh and safe for this build. Other reachable projects (BTCQUANT, tradingbot) are unrelated; never touch. Reversible: no (project choice anchors data), but project is empty so risk ≈ 0.
- **D-002 — Job queue: pg-boss on Postgres.** Design offers Inngest/Trigger.dev/BullMQ. Inngest/Trigger.dev cloud = paid-service commitment (requires approval); BullMQ needs Redis infra. pg-boss gives retries, visibility, and stage jobs on the existing Supabase Postgres. Reversible: yes (queue behind small interface).
- **D-003 — Parser: `pdfjs-dist` adapter, PDF-only ingestion first.** No local pdftoppm/mutool/ghostscript; LlamaParse/Unstructured = external paid services. pdfjs-dist extracts per-page text with offsets in pure JS, sufficient for a machine-readable synthetic fixture; `ParserAdapter` interface preserves swapability; OCR out of demo scope (documented limitation, Design §2.3 assumes machine-readable). DOCX (FR-002) deferred behind the adapter until explicitly needed. Reversible: yes.
- **D-004 — Evidence page rendering via browser pdf.js from signed URLs** instead of server-side rasterization (avoids native canvas deps). Quote panel fallback per Design §9.3 when highlight anchors unavailable. Reversible: yes.
- **D-005 — Auth: Supabase Auth email/password, public signup disabled, seeded demo users.** Satisfies "authenticated or protected demo access" without SSO scope. Reversible: yes.
- **D-006 — Monorepo with npm workspaces** (pnpm not installed; avoid new global tooling). Layout per Design §4.1. Reversible: yes.
- **D-007 — Hybrid retrieval with Postgres-native tools:** FTS + pg_trgm for lexical, pgvector for semantic, both workspace-filtered. Avoids external vector store. Reversible: yes.
- **D-008 — Real model provider deferred to user decision (OQ-1).** No provider API key exists in the environment; committing to one is a paid-service decision. Until resolved: `MockProvider` (deterministic, fixture-driven) powers development, tests, and the mandated cached fallback. Phases 1–2 are unaffected; Phase 3 live-model work is blocked on the key.
- **D-009 — Git repository initialized in this folder** (was not a repo). Version control is required for migrations, docs, and CI gates. Reversible: yes.
- **D-010 — Docs conversions trusted.** The `.md` versions of the PRD and Engineering Design (converted from the PDFs) are treated as authoritative source text; PDFs retained in repo root for reference.
- **D-011 — Context7 usage.** `find-docs` skill via `npx ctx7@latest` verified working (requires full-network permission in sandbox). Used per-phase, immediately before implementing unfamiliar/security-sensitive functionality; material findings recorded here.

## External documentation decisions

(record per phase: library ID, query, what changed as a result)

- 2026-07-16: Resolved `/vercel/next.js` via Context7 (verification that CLI works). Version selection for Phase 1 to be confirmed against current stable docs at Phase 1 start.
