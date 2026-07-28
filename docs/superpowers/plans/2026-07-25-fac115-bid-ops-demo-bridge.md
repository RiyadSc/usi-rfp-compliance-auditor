# FAC115 Bid-Ops Demo Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Project curated Phase 9 FAC115 live-run findings into bid-ops tables so Overview steps 4–9 work for a video-call demo, keep `/phase9` as Live Analysis, and add document downloads.

**Architecture:** One-way provisioner maps completed `phase9_*` rows → `analysis_runs` / candidates / findings / checklist / thin synthetic proposal+report. UI banner + signed download buttons. No live provider spend.

**Tech stack:** TypeScript provision scripts, Supabase service role, Next.js overview/documents pages, existing checklist/report patterns from Phase 8.

---

## File map

| File                                                                    | Responsibility                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `scripts/lib/phase9-fac115-bid-ops-bridge.ts`                           | Deterministic IDs, curated answer mapping, row builders |
| `scripts/provision-phase9-fac115-bid-ops-bridge.mts`                    | Flag-gated provisioner                                  |
| `package.json`                                                          | `provision:phase9:fac115:bid-ops` script                |
| `apps/web/src/app/w/[workspaceId]/page.tsx`                             | FAC115 honesty banner                                   |
| `apps/web/src/app/w/[workspaceId]/documents/page.tsx` + download action | Signed URL download buttons                             |
| `docs/demo-runbook.md`                                                  | Video-call click-path                                   |

---

### Task 1: Bridge constants + curated mapping lib

**Files:**

- Create: `scripts/lib/phase9-fac115-bid-ops-bridge.ts`

**Steps:**

1. Export frozen parent IDs in `80000000-…` namespace (analysis, verification, checklist, proposal, report, export).
2. Export `PHASE4_SELECTED_FINGERPRINT` reuse for report compatibility.
3. Load curated answer IDs from expected-vs-actual artifact (23 rows) + helper to resolve Phase 9 seed/finding/block → candidate/finding/evidence drafts.
4. Unit-testable pure helpers for ID derivation from `candidate_hash`.

### Task 2: Provision script

**Files:**

- Create: `scripts/provision-phase9-fac115-bid-ops-bridge.mts`
- Modify: `package.json`

**Steps:**

1. Require `PHASE9_BID_OPS_BRIDGE=1`, project ref, service role.
2. Ensure DEMO_USER_A membership on FAC115 workspace.
3. Backfill missing `document_pages` for evidence docs.
4. Upsert analysis/verification runs, curated candidates/findings/evidence.
5. Generate or insert checklist + blockers + readiness.
6. Insert synthetic proposal + audit + report + export artifact (Harbor-mini pattern).
7. Print summary JSON (counts, no secrets).

### Task 3: Documents download UI

**Files:**

- Modify documents page / add server action for signed download

**Steps:**

1. Server action: verify workspace membership, mint short-lived signed URL for `workspace-documents` object_key.
2. Per-document Download button.

### Task 4: Overview banner

**Files:**

- Modify `apps/web/src/app/w/[workspaceId]/page.tsx`

**Steps:**

1. If workspace id is FAC115 (or description contains `phase9-public-evaluation-only`), show banner about projection vs illustrative proposal/report.
2. Prefer next action toward Requirements/Live Analysis when Phase 9 run exists.

### Task 5: Verify + docs

**Steps:**

1. Run provisioner against `uxmxkdjschbekkbnweby`.
2. Confirm Overview steps 4–6 non-zero; 7–9 openable; `/phase9` intact; downloads work.
3. Update `docs/demo-runbook.md`.

---

## Demo click-path (acceptance)

1. Open FAC115 opportunity
2. Overview shows requirements/checklist activity
3. Documents downloadable
4. Requirements show curated FAC115 obligations
5. Checklist shows blockers
6. Live Analysis still shows 23/23 acceptance
7. Proposal/report open with illustrative content
