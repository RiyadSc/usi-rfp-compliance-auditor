# FAC115 Bid-Ops Demo Bridge Design

**Date:** 2026-07-25  
**Status:** Approved for implementation after user review of this spec  
**Workspace:** `80000000-0000-4000-8000-000000000100` (Massachusetts FAC115 Public Evaluation)  
**Audience:** Video-call demo driven by us for a Director of Sales at a physical security company (viewer does not operate the product)

## 1. Problem

Phase 9 live acceptance proved FAC115 source-grounded accuracy (23/23) under the dedicated `$3` ceiling and is visible on **Live Analysis** (`/phase9`).

The opportunity **Overview** bid journey (steps 4–9) still reads Phase 4–7 bid-operations tables (`requirement_candidates`, checklist, proposal audit, reports). Those tables are empty for FAC115, so the demo currently looks unfinished after document upload/processing even though live analysis succeeded.

For a sales proof that the product can handle a **real public RFP**, the walkthrough must show both:

1. Live Analysis as the accuracy/cost proof, and
2. The normal bid journey (requirements → checklist → illustrative proposal/report) so the story matches how a security company would work an opportunity.

## 2. Goals

- Keep `/phase9` as the authoritative Live Analysis surface (unchanged semantics).
- Project curated Phase 9 findings into bid-ops tables so Overview steps **4–6** light up with real FAC115 obligations and blockers.
- Provide thin **demo-prepared** proposal + report so steps **7–9** are not empty during the video call, with honest labeling.
- Make FAC115 source documents **downloadable** via short-lived signed URLs from the Documents page.
- One flag-gated provision command that is idempotent and reset-friendly before a call.
- Preserve fail-closed contracts: no weakening of RLS, evidence grounding, or Phase 9 ledger rules.

## 3. Non-goals

- Replacing Live Analysis with Overview.
- Bridging all ~900 Phase 9 findings into Requirements (too noisy for a Director demo).
- Claiming a real bidder proposal audit (public FAC115 package has no bidder draft).
- Enabling live provider spend for ordinary FAC115 bid-ops generation.
- Changing Harbor City Phase 8 demo behavior.

## 4. Demo narrative (click-path)

Operator-driven video call:

1. Opportunities → open **Massachusetts FAC115 Public Evaluation**
2. Overview → show lit stages (not stuck at “0 requirements”)
3. Documents → open/download real FAC115 files
4. Requirements → curated real obligations (deadlines, forms, insurance, pricing cell, superseded conference date)
5. Checklist → blockers / company proof needed
6. Live Analysis → 23/23, cost under `$3`, cache rerun `$0`
7. Optional: Proposal audit + final report as “what final review looks like” (illustrative)

Spoken honesty on the call:

- Files + requirements + checklist projection = real public RFP + live analysis
- Proposal/report = illustrative because no confidential bidder draft is in the public package
- Harbor City remains the synthetic full-roadmap sandbox; FAC115 is the real-RFP proof

## 5. Architecture

```text
Phase 9 (source of truth)
  phase9_evaluation_runs / seeds / findings / coverage
        │
        │ one-way deterministic projection (provisioner)
        ▼
Bid-ops (demo journey)
  analysis_runs → requirement_candidates
                → verification_runs → verification_findings → verification_evidence
                → checklist_* (generate or prepared)
                → synthetic proposal_draft + proposal_audit_runs
                → report_snapshots + export artifact
```

`/phase9` continues to read only `phase9_*` tables.  
Overview / Requirements / Checklist / Proposal / Reports continue to read only bid-ops tables.

## 6. Data mapping

### 6.1 Curated requirement set

Bridge approximately:

- The **23** expected-answer bindings from `artifacts/evaluation/phase9-fac115-expected-vs-actual-v1.json` / frozen expected answers, plus
- A small set of mandatory-form / company-proof seeds that create visible checklist blockers.

Do not dump the full seed/finding population into the Director UI.

### 6.2 Projection rules

For each curated item:

1. Resolve Phase 9 candidate seed + finding for the completed evaluation run.
2. Map to `requirement_candidates` (title/obligation/evidence_quote/page/document).
3. Map to `verification_findings` with equivalent source/precedence/proof statuses.
4. Attach `verification_evidence` to a real `document_pages` row (backfill pages where missing for evidence-bearing docs).
5. Generate checklist (preferred) or insert prepared checklist items/blockers/readiness consistent with Harbor patterns.
6. Leave most items pending human acceptance so blockers remain visible and honest, unless a tiny “demo-cleared” subset is needed for narrative clarity.

### 6.3 Demo-prepared proposal / report

Because the public package has no bidder response:

- Insert a clearly labeled synthetic proposal document + `proposal_drafts` + minimal `proposal_audit_runs` findings.
- Insert report generation/snapshot + one HTML (or existing export type) artifact for download.
- UI copy must state these stages are illustrative for the public-evaluation workspace.

## 7. UI changes

1. **Overview** (`apps/web/src/app/w/[workspaceId]/page.tsx`): for FAC115 workspace only, show a short banner explaining projection vs illustrative proposal/report. Stage cards light from existing queries once rows exist (no separate stage taxonomy required).
2. **Documents**: add **Download original** (short-lived signed URL from `workspace-documents`) alongside view links for FAC115 (or generally if already safe).
3. **Live Analysis**: keep as-is; optionally add a one-line link back to Overview/Requirements.
4. **Home/membership**: ensure the demo operator identity can open the FAC115 workspace under RLS.

## 8. Provisioning

| Item   | Value                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| Lib    | `scripts/lib/phase9-fac115-bid-ops-bridge.ts`                                          |
| Script | `scripts/provision-phase9-fac115-bid-ops-bridge.mts`                                   |
| npm    | `provision:phase9:fac115:bid-ops`                                                      |
| Flag   | `PHASE9_BID_OPS_BRIDGE=1`                                                              |
| Guards | Project ref `uxmxkdjschbekkbnweby`; FAC115 workspace binding; refuse identity mismatch |

Deterministic UUIDs in the `80000000-…` namespace for analysis/verification/checklist/proposal/report parents. Idempotent upserts; fail closed on hash/identity drift.

## 9. Honesty / labeling requirements

- Banner on FAC115 overview.
- Synthetic proposal filename/description must not imply a real bidder submission.
- Live Analysis remains the place that cites provider spend, 23/23, and cache proof.
- Docs: update `docs/demo-runbook.md` with the FAC115 video-call click-path; keep `docs/phase9-fac115-final-live-results.md` as accuracy evidence.

## 10. Risks and mitigations

| Risk                                         | Mitigation                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| RLS blocks demo user                         | Add membership for operator/demo identity                                    |
| Missing `document_pages` breaks evidence FKs | Backfill pages for evidence-bearing docs before findings                     |
| Bridging 900 findings floods UI              | Curate ~23 + blocker set                                                     |
| Immutable tables make remapping hard         | Deterministic IDs + idempotent provision; new IDs only on intentional reset  |
| Report fingerprint requirements              | Follow existing Phase 8/report service constraints consciously for demo path |
| Overclaiming proposal audit                  | Explicit illustrative labeling                                               |

## 11. Success criteria

- FAC115 Overview steps 1–3 remain Ready; steps 4–6 show non-zero requirements/checklist state from Phase 9 projection.
- Steps 7–9 are openable with illustrative proposal/report content and clear labeling.
- Documents page can download FAC115 originals via signed URL.
- `/phase9` still shows completed live/cached acceptance metrics.
- Operator can reset/re-run one provision command before a video call.
- No live OpenAI spend required for the bridge provision.

## 12. Out-of-scope follow-ups

- Uploading a real/redacted security-company proposal to make steps 7–9 fully real.
- Auto-sync bridge on every new Phase 9 run (v1 is explicit provision).
- Merging Live Analysis into Requirements UI.
