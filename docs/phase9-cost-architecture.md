# Phase 9 Cost Architecture

## Policy

The original FAC115 acceptance keeps its immutable, lifetime `$3.00` ledger. Ordinary workspace analysis uses a separate `phase9-workspace-budget-v1` policy: each workspace has an explicit enable flag, a server-capped per-run maximum no greater than `$3.00`, and a calendar-month ceiling. Phase 3, Phase 4, public-evaluation, and remediation ledgers remain historical and are not reused as these limits.

The provider cannot be constructed until the database has atomically reserved the exact persisted call plan. Each task binds its model, tier, source blocks, candidates, prompt/schema fingerprints, maximum input/output tokens, retry allowance, cache key, escalation reason, and maximum cost.

## FAC115 plan

| Stage                    |  Calls |  Hard maximum |
| ------------------------ | -----: | ------------: |
| Coverage classification  |      2 |     $0.018112 |
| Structured extraction    |     48 |     $0.449319 |
| Independent verification |      5 |     $0.463940 |
| Exceptional ambiguity    |      3 |     $0.175820 |
| Retry reserve            |      0 |     $0.000000 |
| **Total**                | **58** | **$1.107191** |

The exact counts and totals are generated, not hand-entered, in `artifacts/evaluation/phase9-fac115-exact-call-plan-v1.json`.

The forecast is `$0.791137`. The hard maximum uses compact task-specific output ceilings and a deliberately conservative serialized-input allowance. The acceptance report records both the budget maximum and forecast-to-actual variance. Unused reservation is released by settlement.

## Enforcement

- `reserve_phase9_call_plan` serializes reservations with an advisory transaction lock.
- It accepts only a matching persisted plan and refuses cumulative settled plus reserved spend above `$3.00`.
- Duplicate reservation identities return the same reservation only when every binding matches.
- `settle_phase9_call_plan` is idempotent for the same actual value and rejects a value above the reservation.
- Provider usage is persisted per call; provider request IDs are unique.
- A planned task cannot change model, reasoning, output limit, tools, or storage behavior.
- Cache hits bypass provider construction.
- There are no automatic semantic repairs and no default retries.

For jurisdiction-neutral workspace runs, `phase9_evaluation_documents` immutably binds the selected source set and hashes to the run. Only a workspace owner can submit the application action, and the owner must confirm both data authority and a maximum spend. `reserve_phase9_call_plan` refuses provider access unless the exact persisted plan fits the enabled workspace policy. Ordinary database users can read their own policy and run history but cannot create or mutate either.

## Cost regression

The optimized maximum is a 98.8% reduction from the obsolete `$88.814280` 209-candidate brute-force plan. The saving comes from deterministic discovery and checking, compact schemas, exact deduplication, cheap coverage/extraction tiers, selective semantic verification, bounded ambiguity review, and exact cache reuse.
