# San Bernardino public RFP v2 result

Date: 2026-07-20. Fixture: `sbcounty-security-public-rfp-v2`. Solicitation: `AGENCY23-PURC-5020`.

## Decision

The authorized v2 live evaluation is **incomplete and not qualified**. It must not populate application findings or be presented as a successful public-document run. No rerun occurred.

The corrected extraction architecture improved accepted known-answer extraction coverage from the v1 baseline, and the strict quotation gate rejected malformed evidence. However, bounded extraction produced a much larger candidate population than the existing Phase 4 budget could verify. The run failed closed before 187 candidate provider calls.

## What changed in practice

- Seven official sources / 81 pages were processed in 15 bounded extraction batches.
- Extraction returned 252 unique candidates instead of the v1 whole-document run's 44.
- The deterministic quotation gate rejected 35 candidates: 27 fuzzy recovery candidates and eight quotations not found on the cited page.
- Fourteen of 19 frozen answers had an accepted extracted candidate (`73.68%` accepted extraction coverage), compared with the v1 final adjudicated pass count of seven. These are not final true positives because most were not verified.
- The proposal conference, submission method, ePro registration, authorized signature, and Addendum 3 reporting requirement completed as source-supported/active.
- The earlier conference case improved from unresolved in v1 to a completed pass in v2.
- The final proposal deadline reached Pass A as entailed and deterministic precedence as active, but Pass B produced an ungrounded qualifier objection. Its semantic-changing repair was rejected, so it failed closed.
- The old deadlines and Attachment E had extracted candidates whose preliminary quotations failed the exact/normalized-exact gate. They did not become active findings.
- Attachments A/C, references, insurance affidavit/limits, and guard-card candidates were extracted, but verification did not begin because the Phase 4 ceiling stopped them.

## Completion and known-answer metrics

- Candidate verification attempted: `217`
- Completed final assessments: `28`
- Failed/no final assessment: `189`
- Budget-stopped before provider access: `187`
- Strict semantic-contract failures: `2`
- Frozen answers shown as completed passes: `5 / 19`
- Raw reported recall: `26.32%`

The raw recall is **not a valid qualification metric** because 187 accepted candidates were never assessed. Budget-stopped candidates were initially mislabeled as unsupported by the artifact scorer; the post-run audit identified them as `verification_missing`. The original artifact is preserved unchanged, and the harness now fails the process when any candidate lacks a final assessment.

## Reliability and usage

- Provider calls: `74` (`15` extraction, `30` Pass A, `29` Pass B)
- Input tokens: `253,558`
- Output tokens: `34,408`
- Reasoning tokens: `2,163`
- Cached tokens: `6,144`
- Summed call latency: `314,457 ms`
- Retries / incompletes / refusals: `0 / 0 / 0`
- Controlled repair attempts: `2`, both rejected because semantic meaning changed
- Schema/semantic adherence failures: `2`
- Actual artifact cost: `$1.43245875`
- Ledgered public-v2 cost: `$1.432462` (provider/internal rounding)

Cost split: Phase 3 extraction `$0.14822175`; Phase 4 verification `$1.284237`.

## Authoritative post-run ledgers

- Phase 3: `$0.618427 / $10.00`
- Phase 4: `$14.813639 / $15.00`
- Cumulative API: `$15.432066`

The Phase 4 ceiling was respected. Only `$0.186361` remains under that ceiling.

## Root cause and next decision

This is primarily an evaluation-orchestration and budget-sizing failure, not evidence that the 189 incomplete candidates are unsupported. Verifying every extracted obligation independently can require up to two GPT-5.5 calls per candidate; the corrected extraction produced 217 quote-valid candidates, far beyond the remaining Phase 4 verification allowance.

Before any other public-document live run, use a provider-neutral two-stage design:

1. complete extraction and deterministic quote/candidate normalization;
2. report the frozen verification population and conservative projected cost;
3. require a distinct verification authorization sized to that frozen population; and
4. fail before the first verification call if the complete population cannot fit.

Do not use expected-answer matching to cherry-pick verification candidates. Deduplication may be improved deterministically, but public-test safety metrics still require accounting for every supported/fabricated candidate.

The Massachusetts FAC115 package has not been downloaded into the repository, ingested, or sent to a provider. It requires separate approval after its fixture, conversion manifest, expected answers, and budget are frozen.
