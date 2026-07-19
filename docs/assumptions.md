# Assumptions

Last updated: 2026-07-18 after Phase 4 closure.

- Phase 4 verifies what the uploaded source set requires; it does not determine whether the bidder complies.
- Extraction candidates remain immutable machine proposals. Verification findings are linked and versioned; human decisions do not overwrite them.
- A Phase 5 checklist may treat a requirement as an authoritative checklist input only when source support is sufficient, precedence is active, and the applicable human-review policy has been satisfied. `partially_supported`, `unsupported`, `contradicted`, `parser_uncertain`, `superseded`, `conflicting`, `undetermined`, or review-pending records cannot silently become complete.
- Proof requirements are independent of source support. A supported active insurance, license, staffing, or experience obligation may still require a company artifact, external validation, or human confirmation.
- The selected snapshot and compatibility fingerprint are immutable qualification inputs. Prompt, schema, facts, decision, evaluator, context, output, timeout, API, storage, or tool changes require a new fingerprint and proportional requalification.
- The current provider path is authorized only for the immutable synthetic/public fixture. No real USI or user-provided confidential content may be sent without a separate rollout and data-governance authorization.
- `store:false` reduces provider-side storage but is not treated as contractual Zero Data Retention.
- Phase 5 can be designed and implemented with deterministic/mock data and no paid provider calls. Any new live evaluation or provider call requires explicit authorization and a dedicated budget.
- Phase 5 is provider-free and operates only on persisted Phase 4 results; no paid-service authorization is needed.
- A Phase 4 `parent_child` relationship treats `source_candidate_id` as parent and `target_candidate_id` as child; the records remain atomic.
- A mandatory form, signature, initial, acknowledgment, attachment, response, resume, staffing plan, bond, certification, or license implies an artifact workflow even when Phase 4 proof status is `none_identified`.
- Deadlines enter Phase 5 only when Phase 4 deterministic facts provide an unambiguous normalized instant. Missing timezone or relative/ambiguous dates remain unresolved rather than guessed.
- Workspace membership roles currently authorize workflow review actions; a finer-grained enterprise authority matrix remains a rollout concern.
- Phase 6 audits only parsed PDFs explicitly typed `proposal_draft` and one explicitly selected completed Phase 5 checklist generation in the same workspace.
- Proposal text is a response surface, never independent proof of a company credential, capability, insurance policy, past performance, or other external fact.
- Deterministic proposal matching favors precision. A missing or uncertain match is shown for human review rather than guessed.
- A linked proposal revision is a new immutable document/audit. Prior claims, findings, evidence, and human resolutions remain retained.
- Phase 6 requires no paid model call; `MockProvider` and Phase 4 live-verification rollout controls remain unchanged.

## Phase 7 assumptions — 2026-07-18

- Phase 7 reports one explicitly selected compatible Phase 4–6 run chain; it does not blend multiple analyses, checklist generations, or proposal revisions.
- Persisted upstream records and latest append-only human decisions are the reporting source of truth. Phase 7 does not recompute verification, readiness, or proposal findings.
- Self-contained HTML satisfies the structured-report requirement for this phase. PDF remains a separate later format decision.
- CSV is intended for analysis, not round-trip import. Every dataset has a fixed versioned header and formula-neutralized cells.
- A Phase 4 immutable synthetic marker is the only trusted source for demo watermarking. Other workspaces are classified `internal_authorized` unless a future reviewed public-data marker is added.
- Export objects use seven-day retention and five-minute signed grants. Deployment must schedule the provided maintenance purge before a broader rollout.
- Phase 7 uses no model provider. The selected Phase 4 model and its rollout restriction are unchanged.
