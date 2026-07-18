# Phase 5 Kickoff Report

Date: 2026-07-18  
Status: ready for a separately authorized implementation kickoff. No Phase 5 code was added under the Phase 4 authorization.

## Stable Phase 4 interfaces

Phase 5 may depend on immutable `requirement_candidates` and versioned `verification_findings`, `verification_evidence`, `verification_fact_envelopes`, `verification_pass_results`, `requirement_relationships`, and `human_review_decisions`. Every lookup must remain scoped by workspace, analysis run, verification run, and candidate. Evidence links resolve by document/page; machine and human records remain separate and auditable.

The active requirement input contract should expose:

```ts
type Phase5RequirementInput = {
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  candidateId: string;
  findingId: string;
  findingVersion: number;
  title: string;
  category: string;
  mandatory: boolean;
  sourceSupportStatus:
    'supported' | 'partially_supported' | 'unsupported' | 'contradicted' | 'parser_uncertain';
  precedenceStatus: 'active' | 'superseded' | 'conflicting' | 'undetermined';
  proofRequirement:
    | 'none_identified'
    | 'requires_human_confirmation'
    | 'requires_company_artifact'
    | 'requires_external_validation'
    | 'undetermined';
  humanReviewStatus: 'pending' | 'accepted' | 'rejected' | 'needs_follow_up' | 'waived';
  evidence: Array<{ documentId: string; pageNumber: number; quote: string; validated: true }>;
  relationships: Array<{ type: string; targetCandidateId: string; humanStatus: string }>;
};
```

An “active verified-requirement” Phase 5 view must be derived, never stored by rewriting the candidate: source-supported, precedence active, valid page evidence, and the required human-review policy satisfied. Superseded items remain visible but do not generate an active checklist duty. Conflicting/undetermined precedence, partial support, parser uncertainty, or review follow-up remain unresolved inputs, not guessed requirements.

## Checklist generation inputs and readiness constraints

- Generate checklist candidates only from atomic active requirements and their validated structured values. Preserve parent/child obligations as distinct items when they represent a deliverable plus required contents.
- Map categories to forms, signatures, attachments, insurance, bonds, pricing, meetings, deadlines, acknowledgments, staffing/proof artifacts and unresolved source issues.
- Proof status determines the expected evidence class; it does not change source support. Company artifacts, external validation, or human confirmation must be separately linked.
- Duplicate relationships may suppress redundant presentation only after the approved relationship policy; they never destructively merge records or discard evidence.
- Readiness must be deterministic and human-governed. It cannot be `READY_FOR_FINAL_HUMAN_REVIEW` while any mandatory artifact is missing, critical source/parser/precedence conflict is unresolved, required review is pending/follow-up/rejected, or required approval/exception is absent.
- Never emit “compliant,” “safe,” “approved for submission,” “guaranteed,” or an autonomous final-approval state.

## Five-missing-form fixture plan

Extend the synthetic/public fixture with ten active, source-supported, human-accepted mandatory form obligations. Provide five correctly linked form artifacts and intentionally omit five. Expected results should identify exactly the five missing forms as critical checklist blockers, preserve form number/signature/addendum distinctions, link every item back to its Phase 4 finding and source page, and keep all five blockers unresolved until a human attaches an artifact or records an authorized documented exception.

Include negative cases: a superseded form, a conflicting form revision, a similarly numbered but distinct form, a form present without a required signature, and a prompt-injection string inside an attachment. The fixture and expected answers must be frozen before any live evaluation.

## Proposed implementation sequence

1. Define the Phase 5 checklist/readiness domain schemas and forbidden state transitions; document how human-accepted Phase 4 findings enter the register.
2. Add workspace-scoped, RLS-protected, versioned checklist items, artifact links, exceptions/waivers, readiness snapshots and audit events through migrations.
3. Build deterministic checklist generation from the Phase 4 contract; make delivery idempotent and replayable without modifying findings.
4. Implement the five-missing-form known-answer fixture and mock provider path.
5. Add checklist UI, artifact/evidence drill-through, ownership/status controls, exception reasons and immutable audit history.
6. Implement deterministic blocker/readiness calculation and explainable inputs. Do not add proposal-draft audit or generation.
7. Run security, RLS, cross-workspace, injection, provenance, deterministic metrics, Playwright and invariant gates; use live evaluation only if separately authorized and technically necessary.

## Proposed tests

- Unit: active-input selection, superseded/conflicting exclusion, proof mapping, parent/child items, duplicate suppression, five missing forms, signatures, exceptions, readiness transitions, stale versions, idempotency, and forbidden compliance labels.
- Integration: worker checklist insertion, workspace/run/finding/evidence linkage, RLS denial, cross-workspace artifact rejection, ordinary-user machine generation denial, authorized item updates, append-only audit, replay/versioning, and budget/provider absence.
- Playwright: exactly five missing form blockers, source evidence navigation, attach/exception flows, pending human review distinction, conflict/parser states, filters, audit history, unauthorized URLs, and no live calls by default.
- Invariants: no checklist completion without the required artifact/response or documented exception; no readiness improvement from model confidence alone; no unsupported/superseded/conflicting finding silently becomes an active duty.

## Risks and assumptions

- Checklist atomicity may expose category-specific edge cases; preserve source links and prefer an extra reviewable item over destructive merging.
- A company artifact proves an attachment exists, not that its substantive content is valid; later validation must remain explicit.
- Readiness policy needs authorized business ownership for waiver and approval rules.
- Phase 4 snapshot/fingerprint changes must not silently alter existing Phase 5 checklist snapshots; pin the verification run and finding version.
- The current synthetic PDF has one document containing addendum pages; future multi-document addenda require the same document-set and precedence controls.

## Provider and authorization outlook

The proposed Phase 5 checklist and readiness slice can begin with deterministic code, frozen fixtures, and `MockProvider`; projected provider spend is `$0`. Therefore implementation can begin without paid-service authorization, provided the user separately authorizes Phase 5 implementation itself. Any live model evaluation, confidential data processing, general live-verification rollout, or new paid service requires explicit authorization and a new budget/preflight.
