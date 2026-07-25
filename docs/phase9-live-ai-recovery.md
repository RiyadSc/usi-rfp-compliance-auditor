# Phase 9 Live AI Recovery

Status: offline implementation complete; final FAC115 acceptance pending the database/network gates.

## Purpose

Phase 9 replaces the failed all-candidate verification design with a coverage-led, source-structured, selectively paid pipeline. It is limited to the frozen public Massachusetts FAC115 package. It does not enable ordinary live verification, authorize confidential data, or change the qualified Phase 4 contract.

## Versioned pipeline

1. `phase9-source-coverage-v1` assigns every normalized block exactly one processing route.
2. `phase9-deterministic-miner-v1` mines atomic source-derived candidates with exact page, heading, table, or workbook provenance.
3. `phase9-candidate-reduction-v1` removes only proven exact duplicates and preserves all contributing evidence.
4. Coverage classification and targeted extraction use compact strict schemas with `gpt-5.4-mini-2026-03-17`.
5. Only bounded semantic cases reach `gpt-5.5-2026-04-23`; exceptional ambiguity is a separately planned tier.
6. `phase9-deterministic-verification-v1` validates quotations, source locations, native workbook cells, parser state, proof needs, and explicit amendment precedence.
7. Findings remain `machine_only=true` and `human_review_status=pending`.

The Responses API is used with `store:false`, reasoning `low`, no tools, strict JSON Schema, strict Zod validation, zero semantic repair, and no persistent provider conversation.

## Coverage and evaluation separation

FAC115 measures public-source discovery, evidence, citations, dates, values, forms, workbook cells, and addenda. Prompt injection, malformed provider output, parser failure, and genuine unresolved conflict remain separate synthetic regression gates. Their absence from the Commonwealth documents is not reported as a source failure.

Production source preparation cannot import or read the expected-answer fixture. The evaluator is dynamically loaded only after extraction and verification finish. Tests scan the production modules for expected-answer dependencies.

## Offline FAC115 result

- Source blocks: 699
- Coverage records: 699
- Raw deterministic seeds: 1,197
- Atomic reduced seeds: 1,073
- Exact duplicates removed: 124
- Frozen expected answers represented: 23/23
- Expected evidence locations represented: 23/23
- Native workbook regression: `Guard Services!I11`
- Planned provider tasks: 58
- Hard planned maximum: `$1.107191`
- Forecast cost: `$0.791137`
- Obsolete brute-force maximum: `$88.814280`
- Provider calls during remediation: 0

The repeated quotation case retains every valid same-document location and the `evidence_location_ambiguous` code rather than selecting an arbitrary page.

## Runtime controls

The acceptance command is:

```bash
PHASE9_FAC115_LIVE_ACCEPTANCE=1 PHASE9_SPEND_CEILING_USD=3 \
  npm run phase9:fac115:live-acceptance
```

Before provider construction it requires a clean Git tree, exact source and rendition hashes, a passing offline artifact, the approved Supabase project, the dedicated public-only workspace, a complete cache probe, a complete call plan, and a successful atomic reservation. The gateway rejects unplanned tasks, models, token limits, output limits, tools, `store:true`, malformed results, unknown IDs, fabricated quotations, unsupported positive findings, and usage exceeding the plan.

## Persistence

Migration `20260724000026_phase9_live_recovery.sql` adds workspace-scoped evaluation runs, coverage, immutable candidates, exact call plans/tasks, provider cache, provider usage, machine findings, dependency edges, and dedicated budget reservations. Ordinary members have workspace-filtered read access only. Machine history is immutable. Reservation, settlement, and release RPCs are service-role-only and enforce a cumulative `$3.00` Phase 9 ceiling.

## Cache and incremental behavior

Cache identity includes workspace, source package, source block hashes, parser, normalization, table model, prompt, schema, task type, model, reasoning, and evaluator. Only complete, schema-adherent, hash-valid entries are reused. A completed run proves an unchanged replay by validating every cached bounded result without constructing the provider; required calls and added spend are both zero.

Dependency edges record `source block → candidate → finding`, allowing later source changes to invalidate only dependent work.

## Remaining stop gate

The final live run is not allowed until the additive migration is applied to project `uxmxkdjschbekkbnweby`, the public-only workspace is provisioned reproducibly, sequential Supabase/RLS tests pass, all repository gates pass, and the committed worktree is clean.
