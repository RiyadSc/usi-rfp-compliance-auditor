# Phase 7 Implementation Plan — Deterministic Reporting and Export

Date: 2026-07-18  
Authorized scope: deterministic reporting, CSV/HTML export, private storage, short-lived download grants, UI, tests, and documentation. Phase 8 is excluded. Provider calls are excluded.

## Stable reporting interfaces

Phase 7 reads but never updates:

- Phase 4 verification runs/findings, exact evidence, precedence/proof/parser/human axes, relationships, facts, and configuration fingerprint;
- Phase 5 generation runs, checklist items/sources, artifacts, blockers/resolutions, waivers/exceptions, readiness snapshots, assignments, and workflow history;
- Phase 6 drafts/revisions, audit runs, atomic claims, coverage/matches/evidence, findings/resolutions, and version provenance.

All source IDs are explicitly bound in `report-input-v1`. Cross-run combinations must share the same workspace, analysis run, verification run, checklist generation run, readiness snapshot, proposal audit run, and proposal draft.

## Versioned pipeline

`report-input-v1` → `report-aggregation-v1` → `executive-readiness-report-v1` → `report-schema-v1` → `export-manifest-v1`.

CSV uses `report-csv-v1`; structured HTML uses `report-html-v1`; prohibited copy uses `report-language-policy-v1`; signed downloads use `report-download-policy-v1` with a 300-second expiry.

The input hash covers sorted source records, latest decisions, every upstream/run version, report type/version, demo marker, and data classification. Identical source input and report type reuse a completed snapshot. Explicit export regeneration creates a new immutable manifest/artifact, then revokes and removes the superseded private object while preserving its manifest and audit history.

## Report taxonomy and aggregation policy

Supported report types are executive, detailed audit, findings, checklist, missing artifacts, and source coverage. Every type consumes one shared aggregate; focused reports select sections without recalculating facts.

- Critical blockers: open/reopened Phase 5 critical/blocking blockers plus unresolved Phase 6 critical/blocking findings. Records remain distinct by stable ID and phase.
- Unresolved findings: unresolved Phase 4 axes, Phase 5 unresolved/review states, and open Phase 6 support/coverage/proof/parser/human states.
- Missing artifacts: current missing/rejected/human-proof artifact states without a valid accepted final waiver. Reviewed, validly waived, not-applicable, removed, and obsolete items are excluded from the current view.
- Review completion: separately labeled Phase 4 source review, Phase 5 workflow review, and Phase 6 finding review ratios. No combined score is created.
- Source coverage: explicit denominators for active Phase 4 requirements, active checklist items, proposal claims, critical findings, and human-proof claims. Superseded records remain excluded and separately counted.

## Export and storage policy

CSV is UTF-8 with fixed versioned headers and deterministic rows. Cells beginning, after whitespace, with `=`, `+`, `-`, or `@` are prefixed with an apostrophe before RFC-compatible quoting. HTML is escaped, self-contained, immutable, and uses no private or signed URLs. Both include a manifest and trusted demo label where applicable.

Exports use a new private `workspace-exports` bucket and service-owned path `workspace/report-snapshot/export-id/filename`. The database stores the path but browser responses expose only export IDs and safe filenames. After authenticated workspace authorization, the server creates a 300-second signed URL and stores only grant metadata—not the token or URL. Download requests, revocations, and retention expiry are auditable. Revocation removes the object and marks the artifact revoked; prior manifests and audit history remain.

## Proposed additive schema

Migrations `20260718000021_phase7_reporting_exports` and `20260718000022_phase7_idempotency_hardening` create/harden:

- `report_generation_runs`;
- `report_snapshots`;
- `export_manifests`;
- `export_artifacts`;
- `export_download_grants`;
- `export_access_events`.

All tables carry `workspace_id`, use composite workspace constraints, enable member SELECT RLS, and deny ordinary direct writes. Completed snapshots/manifests/grants/access events are immutable. Export status may change only through a controlled revocation path. The migration creates the private bucket and adds bounded audit-event types; it does not backfill or mutate Phase 4–6 data.

## Threat-model additions

- Cross-workspace aggregate leakage: composite run checks, server membership, RLS, and two-user tests.
- CSV formula execution: deterministic cell neutralization and malicious-cell fixtures.
- Export URL leakage: short expiry, no persistence/logging/rendering of signed URLs, grant metadata only.
- Public artifact exposure: private bucket, no public URL path, service-only upload.
- Stale or conflicting reports: immutable snapshot/hash/version binding and visible generated time.
- Misleading workflow conclusion: centralized prohibited-language checks across summaries, HTML, CSV labels, filenames, and UI.

## Fixture and test strategy

`reporting-known-answer-v1` combines synthetic Phase 4–6 shapes: five missing forms, unresolved/parser source states, human proof, unsupported/contradicted claims, date/insurance/procurement errors, a missing response, resolved/corrected findings, reviewed/unreviewed items, reviewed/missing artifacts, valid/pending waivers, and a trusted demo marker.

Pure tests cover aggregation, every denominator, report types, provenance, CSV ordering/escaping/injection, HTML escaping/watermark, language policy, input hashing, and idempotency keys. Supabase integration covers scope compatibility, RLS, private storage, signed URL grants, revocation, regeneration, and audit history. Mock Playwright covers summary/drill-down, export creation/download controls, demo labeling, and cross-workspace denial.

## Risks and assumptions

- Direct signed URLs are bearer URLs until their 300-second expiry; revoking/deleting the export prevents future grants and object access but cannot recall a URL already copied before deletion propagation.
- HTML is the initial structured format. PDF is deferred because no safe compatible generator exists in the repository and adding one is unnecessary for the authorized demo gate.
- The latest persisted readiness snapshot is reported, not recomputed by Phase 7.
- Demo status must come from an immutable trusted fixture/synthetic marker; user-authored proposal text cannot set it.
- No provider or paid service is needed.
