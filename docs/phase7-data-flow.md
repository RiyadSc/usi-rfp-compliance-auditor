# Phase 7 Data Flow — Reporting and Export

```text
explicit Phase 4 run + exact evidence + latest source review
  + explicit Phase 5 generation/readiness + blockers/artifacts/waivers/exceptions
  + explicit Phase 6 audit/draft revision + claims/findings/resolutions
  → workspace/run compatibility validation
  → report-input-v1 + deterministic SHA-256
  → report-aggregation-v1
  → immutable report snapshot
  → report-csv-v1 or report-html-v1
  → immutable export manifest + private object
  → authorized 300-second signed download grant
```

## Axis preservation

Reports keep source support, precedence, proof, parser quality, checklist workflow, artifact state, blocker state, proposal coverage, claim support/consistency, human review, and finding resolution separate. Aggregation counts them; it never converts one into another or changes source records.

## Deterministic denominators

- Active requirement source coverage includes non-superseded Phase 4 requirements within the selected verification run and reports unresolved/conflicting/parser records separately.
- Checklist evidence coverage includes active Phase 5 items in the selected generation.
- Proposal claim page coverage includes every persisted atomic claim in the selected audit.
- Critical finding evidence coverage includes unresolved critical/blocking Phase 6 findings and requires the evidence appropriate to the finding type.
- Human-proof availability includes claims/items explicitly classified as requiring proof; missing proof stays human-proof, not false.

## Export boundary

HTML contains escaped text and stable application navigation identifiers, never signed/private object URLs. CSV neutralizes leading spreadsheet formula characters. The private `workspace-exports` object path is stored only in service-owned metadata. A signed URL is generated after membership and artifact checks, expires after 300 seconds, and is never written to an audit event, artifact, screenshot, or persistent UI.
