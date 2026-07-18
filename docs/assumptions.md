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
