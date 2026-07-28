# New Jersey Phase 9 Review-Acceleration Evaluation

Status: provider-free offline evaluation complete  
Evaluation: `phase9-review-acceleration-new-jersey-v1`  
Source snapshot: `phase9-review-acceleration-snapshot-v1`  
Priority policy: `phase9-review-priority-v1`  
Batch policy: `phase9-batch-review-policy-v1`

## Outcome

The deterministic review policy preserves all 329 findings from corrected New Jersey run
`e9dcb574-22c7-481e-b485-a2e85ad38433` while changing the order and interaction model:

| Review lane                           | Findings |
| ------------------------------------- | -------: |
| Critical                              |       79 |
| Exception                             |       11 |
| Deterministic non-canonical duplicate |        0 |
| Routine                               |      239 |
| **Total**                             |  **329** |

Both official operational dates remain critical:

- electronic questions: February 15, 2008 at 5:00 PM;
- bid submission: March 7, 2008 at 2:00 PM.

The 79 critical findings include submission and question deadlines, named forms, signatures,
insurance, licensing, bonds, and pricing instructions. The 11 exceptions are seven unsupported
machine findings and four findings with unresolved ambiguity. None is eligible for batch
acceptance.

The strict duplicate policy found no New Jersey duplicate group. It did not manufacture a group
from similar wording. Every source occurrence and immutable finding remains represented.

## Estimated review-interaction change

Before acceleration, the finding population implies 329 individual finding-decision interactions.
With the new policy:

- 90 findings remain individual review work: 79 critical plus 11 exceptions;
- 239 clean routine findings are eligible for an explicit, server-revalidated batch;
- one routine batch confirmation is sufficient for this 239-item population if eligibility remains
  unchanged at confirmation;
- the estimated finding-decision interaction count is therefore 91;
- the estimated reduction in individual finding-decision interactions is approximately 72.3%.

Thirty-eight page-coverage exceptions remain separate, required human decisions. They are not
hidden, excluded, or treated as routine findings. Including those unchanged page decisions, the
planning comparison is 367 interactions before and 129 after, approximately a 64.9% reduction.

These are deterministic interaction estimates, not measured human-review times. Actual effort will
vary with reviewer judgment, source complexity, filtering, and any findings that become stale or
ineligible before confirmation.

## Safety results

- Original findings represented: `329 / 329`
- Critical findings batch-accept eligible: `0`
- Exception findings batch-accept eligible: `0`
- Findings excluded from evaluation: `0`
- Publication rule changes: `0`
- Automatic machine acceptance introduced: `0`
- Provider calls: `0`
- Provider spend: `$0.00`

Batch confirmation remains a human decision. A successful routine batch must still create one
append-only human-decision row per finding. Page exceptions continue to block publication under the
existing rule until reviewed.

## Evidence and reproducibility

The evaluator reads
`fixtures/eval/phase9-review-acceleration-new-jersey-v1.json`, a sanitized, hash-bound export of
the immutable public run. The exporter performs read-only selects and excludes provider payloads,
provider responses, tokens, secrets, authorization headers, and workspace-member data.

Machine-readable results are in
`artifacts/evaluation/phase9-review-acceleration-new-jersey-v1.json`.

Run the provider-free evaluation with:

```text
npm run eval:phase9:review-acceleration
```

## Independent benchmark preparation

The separate package under `benchmarks/new-jersey-08-x-39231/` was authored from the immutable
source-page export only. Its source exporter reads only `documents` and `document_pages`; the
answer-authoring process never loads candidates, machine findings, review lanes, or evaluation
results.

`critical-obligations-draft-v1.json` contains 25 draft critical obligations with unique exact
source-page citations covering deadlines, forms, signatures, licensing, insurance, bond, pricing,
staffing, submission instructions, addenda, and disqualifying conditions. Every case remains
`pending` independent human subject-matter review and `runtimeEligible=false`.

The application does not import the benchmark. Unit tests prove prioritization output is identical
when the benchmark is absent, present, or modified.

## Limitation

This evaluation measures review-lane behavior and estimated interactions. It does not measure
extraction precision or recall and does not prove that all RFP requirements were discovered. The
draft benchmark is not an independent known-answer set until a qualified human reviewer completes
and records a source-only review.
