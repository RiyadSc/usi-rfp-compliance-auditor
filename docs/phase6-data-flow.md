# Phase 6 Data Flow — Proposal Draft Audit

```text
private proposal PDF
  → existing signed upload + PDF validation
  → asynchronous page parser
  → immutable proposal draft/revision
  → versioned section extraction
  → page-offset atomic claims
  → active Phase 5 checklist eligibility filter
  → bounded deterministic requirement matching
  → typed date/number/identity comparison
  → workspace-only source/company evidence policy
  → separate coverage/support/consistency axes
  → immutable machine findings (human pending)
  → append-only human resolution
```

## Inputs

- Parsed `proposal_draft` document and exact `document_pages` records.
- One completed Phase 5 checklist generation and its immutable Phase 4 source links.
- Reviewed same-workspace Phase 5 artifact links, when present.
- Optional explicitly linked prior proposal revision.

The service rejects any document, page, checklist item, evidence, user, or prior revision outside the requested workspace. Proposal text is untrusted data and never receives tools, secrets, prompt authority, or mutation authority.

## Deterministic engines

`proposal-section-parser-v1` and `proposal-claim-segmenter-v1` preserve page number and exact text offsets. `proposal-response-matcher-v1` matches only eligible Phase 5 obligations with identifiers, categories, material tokens, and atomic parent/child roles. `proposal-contradiction-v1` compares dates, currency, percentages, quantities, units, operators, scope, procurement identity, and explicit semantic opposition. `proposal-support-policy-v1` prevents a draft from supporting its own company assertions. `proposal-audit-evaluator-v1` emits strict `proposal-audit-schema-v1` records.

## Persistence and provenance

`proposal_drafts` creates immutable lineage/revision identity. `proposal_audit_runs` stores the stable input hash and every policy version. Sections, claims, matches, claim evidence, response coverage, findings, and finding evidence are immutable machine records. Human decisions append to `proposal_finding_resolutions`; the current workflow/human axes may change through the controlled RPC, but the claim, evidence, classification, and prior decisions do not.

Identical inputs reuse the completed audit. A new proposal document creates a new revision. Findings absent from a linked later revision produce informational correction records while prior findings remain intact.

## Status separation

- Coverage: addressed, partially addressed, missing, not applicable, parser uncertain.
- Claim support: supported, partial, unsupported, contradicted, requires human proof, parser uncertain.
- Consistency: consistent, inconsistent, undetermined, not applicable.
- Human resolution: pending, accepted, rejected, needs follow-up, waived.
- Finding workflow: open, in review, resolved, accepted risk, obsolete.

None of these fields updates Phase 4 verification or Phase 5 checklist workflow.
