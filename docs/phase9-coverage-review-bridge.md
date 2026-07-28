# Live-analysis coverage review and controlled requirement publication

Date: 2026-07-27

## Business outcome

The director workflow no longer treats a raw live-analysis finding count as a requirement register.
The application now presents two separate questions:

1. **Was the complete selected source package accounted for?**
2. **Which source assessments has the team accepted for operational use?**

The workflow is:

`selected RFP documents → immutable Phase 9 analysis → page coverage and exception review → append-only team decisions → owner publication → Phase 4 requirement register → Phase 5 checklist/blockers → Phase 6 proposal audit`

Machine output never skips the review boundary and never becomes a checklist merely because it is
source-quoted.

## Completeness checkpoint

`phase9-coverage-summary-v1` derives a page-level report from immutable document bindings, source
block coverage, candidate seeds, and findings. It exposes:

- total and accounted-for pages;
- pages containing findings;
- pages explicitly checked with no requirement found;
- parser-uncertain pages;
- pages with candidate seeds that did not receive a finding;
- unexamined pages;
- possible form/deadline signals without a finding;
- and a compact exception queue linked to the original page.

“All pages accounted for” is not described as perfect recall. It proves that every selected page has
a persisted route and makes omissions observable. Parser uncertainty, missing coverage, unassessed
seeds, and unmatched high-risk signals remain exceptions.

## Human-review contract

`phase9_finding_review_decisions` is append-only. A new decision links the prior decision and records
an audit event. Allowed decisions are `accepted`, `rejected`, and `needs_follow_up`.

Corrections are limited to non-material presentation fields: title, checklist category, and mandatory
classification. A material obligation change requires follow-up and a new source assessment; the
system does not silently rewrite what the model asserted.

Publication remains locked until every finding in the immutable run has a latest team decision and
no `needs_follow_up` decision remains unresolved. Rejected, unsupported, contradicted, superseded,
conflicting, and parser-uncertain findings remain in the Phase 9 history and do not become ordinary
checklist obligations.

`phase9_coverage_review_decisions` separately records whether each current page-level exception was
checked or still needs follow-up. Parser uncertainty, missing coverage, unassessed candidate seeds,
and high-risk form/deadline signals without a finding must each receive an append-only decision.
The database also blocks publication while any current coverage exception lacks a decision or
remains in follow-up.

## Publication gate

`phase9-reviewed-bridge-v1` publishes only findings satisfying all of these rules:

- latest team decision is `accepted`;
- `machine_only=true`;
- source support is `supported`;
- precedence is `active`;
- at least one evidence block exists;
- the referenced document and page belong to the same workspace;
- the exact quote is found on the stored page as `exact` or `normalized_exact`.

The owner-only `publish_phase9_reviewed_findings` RPC executes atomically. It creates one immutable
bridge run, one completed bridge analysis and verification run, immutable Phase 3-format candidates
that remain `unverified`, machine-only Phase 4 findings, validated Phase 4 evidence, accepted Phase 4
human decisions, and immutable Phase 9-to-Phase 4 mapping records.

The publication input hash binds the source evaluation run and latest accepted decisions. Identical
publication is idempotent. A changed decision set creates a new versioned bridge run instead of
mutating prior results. The idempotent reuse path rechecks the current latest finding and
page-exception decisions before returning an existing bridge; reopening any follow-up closes the
gate again.

The repository-owned implementation is split across additive migrations
`20260727000029_phase9_reviewed_bridge.sql` through
`20260727000032_phase9_bridge_reuse_guard.sql`.

## Phase 5 and proposal-audit linkage

The standard deterministic Phase 5 generator consumes the completed bridge verification run. Its
existing eligibility engine still separates source support, precedence, proof, human review,
workflow, artifact, and blocker states.

The Phase 6 audit already consumes a specific Phase 5 generation run and its immutable
`checklist_item_sources`. The proposal-audit detail view now displays when that checklist came from a
reviewed Phase 9 bridge and links back to both the requirement register and source-coverage review.

## Security

- All four new tables have RLS and member-select-only policies.
- Ordinary users cannot directly insert, update, or delete review or bridge records.
- Review writes use a scoped authenticated RPC.
- Publication requires the workspace `owner` role.
- Foreign keys and publication code revalidate workspace, run, candidate, document, page, evidence,
  and decision scope.
- No provider call, prompt, secret, or document payload is introduced by the bridge.
- General live analysis remains default-off and separately controlled.

## Known limitation

The bridge makes review coverage and omissions observable; it does not mathematically prove that a
model found every obligation in arbitrary prose. A real-RFP recall claim still requires an
independently reviewed known-answer set. The workflow reduces human work to coverage exceptions and
source decisions, but a high-stakes final submission still needs accountable human review.
