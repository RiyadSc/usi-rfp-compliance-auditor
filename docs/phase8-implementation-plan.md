# Phase 8 Implementation Plan — Final Hardening

Date: 2026-07-19

Scope: evaluation, security, reliability, accessibility, performance, and protected-demo hardening. No paid provider calls, production rollout, confidential data, or post-roadmap features.

## Preserved contracts

- Phase 4 verification remains fingerprint-pinned to `c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b`; general live verification remains disabled.
- Phase 5 eligibility, checklist, blocker, readiness, workflow, waiver, and artifact axes remain deterministic and separate.
- Phase 6 proposal revisions, claims, coverage, support, consistency, findings, and resolutions remain immutable or append-only as designed.
- Phase 7 report snapshots and export manifests remain deterministic, private, immutable, short-lived, and provenance-bound.

## Implementation sequence

1. Add provider-free Phase 8 domain contracts for rate policies, cost reservations, performance events, cache bindings, reset plans, fallback manifests, failure classes, and the consolidated evaluation manifest.
2. Add one additive migration for database-atomic rate buckets and budget reservations, privacy-safe performance events, and immutable synthetic demo scope/cache/fallback/reset records. Preserve member-scoped RLS and deny ordinary mutation.
3. Add server enforcement at every sensitive operation boundary. Client input cannot set limits, ceilings, windows, phases, or scope.
4. Provision one separately marked full-roadmap synthetic scope. It binds exact documents/hashes, Phase 4–7 run/version identities, the selected Phase 4 fingerprint, fixture hash, cache key, private fallback artifact, and authorized demo identity.
5. Add deterministic dry-run/executed reset, exact-scope validation, cache validation, fallback activation, explicit mode labels, and performance instrumentation.
6. Consolidate existing known-answer, injection, parser-failure, malformed-output, precedence, date/number, isolation, report, and export checks into one versioned evaluation artifact.
7. Add component-state and `@demo-critical` browser coverage, contingency simulations, and CI scripts that remain provider-free.
8. Run all gates, reset and rehearse the exact demo flow three times sequentially, measure performance, update all operational/security documentation, and commit logically.

## Consolidated test matrix

| Layer       | Phase 8 additions                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Cache/provenance hashes, reset safety, rate windows, cost projections, failure classes, performance metadata, parser failures, injection corpus, prohibited language, fallback validation |
| Component   | Loading, empty, partial, uncertain, unauthorized, failed, stale, expired, revoked, cached, fallback, and mode banners rendered with semantic status/alert markup                          |
| Service     | Authorization, scope/version validation, rate consumption, budget reservation/settlement, performance recording, cache hit/miss, fallback grant, reset dry-run/execution                  |
| Integration | Atomic rate/cost concurrency, RLS, ordinary-write denial, immutable demo bindings, cross-workspace rejection, reset idempotency, private fallback, audit history                          |
| Evaluation  | One manifest referencing Phase 4–7 fixtures; every required accuracy/evidence/provenance/schema metric `1.0`; every dangerous count `0`                                                   |
| Browser     | Complete mock-only suite plus one stable `@demo-critical` flow; three sequential rehearsals from a verified reset                                                                         |
| Static      | Formatting, lint, TypeScript, build, dependency audit, lockfile integrity, secret/artifact/bundle scan, invariant checklist                                                               |

## Threat-model changes

- Add distributed rate-limit races, client-controlled limits, and resource-existence leaks.
- Add budget-reservation races, duplicate accounting, malformed usage, and cross-phase ledger contamination.
- Add stale or cross-workspace cache acceptance and fallback content masquerading as current output.
- Add over-broad reset scope, immutable-history loss, and arbitrary-workspace discovery.
- Add privacy leakage through performance events, traces, screenshots, fallback artifacts, and signed URL material.

All new controls fail before privileged work, preserve bounded audit metadata, and never relax RLS, storage privacy, evidence gates, or source-state semantics.

## Rate-limit policy

Version `phase8-rate-limits-v1` uses fixed server-owned limits and database-atomic buckets. Keys are SHA-256 hashes of operation + authenticated actor + workspace, or normalized login discriminator before authentication. Responses are generic and reveal no object existence. Operations cover sign-in, upload init/finalize, parse/extract/verify, checklist generation/workflow, proposal audit/resolution, report/export/download, and demo reset. Overrides require a repository configuration/version change, migration review, and retest.

## Cost policy

Version `phase8-cost-controls-v1` keeps phase-specific ledger totals independent and adds atomic pending reservations before provider construction. Phase, ceiling, per-run maximum, workspace/actor maximum, and rounding to six decimal places are server-owned. Settlement is idempotent by reservation/call identity. Adjustments/refunds append records; malformed usage fails closed. Phase 8 itself has a zero-dollar policy and performs no provider construction.

## Performance budget

Version `phase8-performance-v1` records operation, bounded duration, counts, cache outcome, success/failure, and normalized error category only. It never records source/proposal text, quotes, prompts, secrets, headers, object paths, or signed URLs.

Prepared-demo budgets:

- workspace landing, requirement register, checklist, proposal audit, and report: `< 3,000 ms` each;
- evidence viewer and cached export readiness: `< 2,000 ms`;
- signed grant creation: `< 1,000 ms`;
- deterministic report/export generation: `< 2,000 ms`;
- verified reset: `< 30,000 ms`;
- complete rehearsal: `< 180,000 ms`.

## Demo-state lifecycle

The Phase 8 scope is separate from the immutable Phase 4 smoke scope and is marked `phase8-synthetic-demo-only`. Provisioning is repository-owned and idempotent. The active mode is one of `prepared`, `cached`, `fallback`, or `offline_read_only`; every mode preserves authorization and displays its status. Cache hits require exact workspace, identity, document/hash, run, version, fingerprint, fixture, and completed-state matches. Fallback requires the exact approved private Phase 7 artifact, retains original provenance, uses a 300-second authorized grant, and is visibly labeled prepared fallback content.

Reset validates the entire binding and fixture hash before mutation. Dry-run performs no write. Execution changes only mutable presentation state for the exact marked synthetic scope, appends history/audit records, never deletes immutable source/provider/spend history, and verifies the final state hash. Identical reset input is idempotent.

## Completion criteria

Phase 8 closes only when the consolidated artifact passes, the complete sequential test matrix is green, the database/RLS inspection is clean, the full `@demo-critical` flow passes three times from reset with no manual intervention/provider call, contingency simulations fail safely, performance budgets are measured, documentation is complete, and the Git worktree is clean.

## Context7 decision

Current Supabase documentation was consulted through `/supabase/supabase`. Phase 8 follows database-atomic locking/upsert patterns, fixed SECURITY DEFINER search paths, revoked public/anonymous function execution, and least-privilege service access for rate and cost controls.
