# San Bernardino County public RFP test report

Date: 2026-07-19. Fixture: `sbcounty-security-public-rfp-v1`. Solicitation: `AGENCY23-PURC-5020`.

## Scope and outcome

The controlled public-only evaluation used six official County PDFs (80 pages) plus the archived official solicitation page. The PDF package was hash-pinned before provider access. Extraction used `gpt-5.4-mini-2026-03-17`; candidate-centered verification used the selected `gpt-5.5-2026-04-23` with low reasoning, two contexts, Pass A `verify-entailment-v7`, Pass B `verify-challenge-v4`, facts v4, and decision v6. No tool access was available to either model.

The run is a **failed public baseline**. It must not populate an ordinary application checklist or enable unrestricted live verification. The primary causes are whole-document extraction recall on the 61-page RFP and omission of the portal-only Amendment 1 record from semantic precedence context.

## Expected versus actual

| Frozen answer                                         | Result  | Notes                                                                                                                                                           |
| ----------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final question deadline: Aug. 2, 2023 4 PM PST        | Missed  | Main-RFP extraction did not return it.                                                                                                                          |
| Final proposal deadline: Aug. 25, 2023 4 PM PST       | Pass    | Extracted and verified as supported/active.                                                                                                                     |
| Old question deadline: July 25                        | Fail    | Extracted from Q&A but assessed partially supported/active instead of superseded.                                                                               |
| Old proposal deadline: Aug. 18                        | Fail    | Extracted from Q&A but assessed partially supported/active instead of superseded.                                                                               |
| Proposal conference: July 26, not mandatory           | Partial | Both the event and Q&A non-mandatory answer were extracted, but the selected main-RFP candidate was unsupported/undetermined rather than resolved with the Q&A. |
| ePro and/or signed hard-copy submission; no email/fax | Pass    | Extracted and supported/active.                                                                                                                                 |
| ePro registration                                     | Pass    | Extracted and supported/active.                                                                                                                                 |
| Authorized proposal signature                         | Pass    | Extracted and supported/active.                                                                                                                                 |
| Attachment A completed and signed                     | Missed  | Not returned from the main RFP.                                                                                                                                 |
| Attachment C licenses/permits/certifications          | Missed  | Not returned from the main RFP.                                                                                                                                 |
| Attachment E separate submission                      | Pass    | Extracted from the cost sheet and Q&A; verified.                                                                                                                |
| Three references on Attachment F                      | Missed  | Not returned from the main RFP.                                                                                                                                 |
| Attachment J broker/agent signature                   | Missed  | Not returned from the main RFP.                                                                                                                                 |
| $5M general liability per occurrence                  | Missed  | Not returned from the main RFP.                                                                                                                                 |
| $1M/$2M automobile liability rules                    | Missed  | Not returned from the main RFP.                                                                                                                                 |
| $1M/$2M professional liability rules                  | Missed  | Not returned from the main RFP.                                                                                                                                 |
| Permanent guard card requirement                      | Missed  | Not returned from the main RFP.                                                                                                                                 |
| 35/35/10/20 evaluation weights                        | Missed  | Not returned from the main RFP.                                                                                                                                 |
| Addendum 3 reporting changes                          | Pass    | Extracted and verified from Addendum 3.                                                                                                                         |

Seven of 19 frozen answer groups were correctly recovered (`36.84%` adjudicated recall). The conference was detected but not correctly resolved and is not counted as a pass. This manual adjudication is intentionally conservative.

## Reliability and evidence

- Documents/pages: `6 / 80`
- Extracted candidates: `44`
- Independently verified priority candidates: `20`
- Provider calls: `43` in the completed run (`6` extraction, `37` verification), plus one reconciled failed-attempt extraction call
- Completed-run tokens: `176,485` input, `10,682` output, `828` reasoning, `0` cached
- Summed completed-run latency: `122,379 ms`
- Repairs/retries/incompletes/refusals/schema failures: `0 / 0 / 0 / 0 / 0`
- Verified priority results: `17 supported`, `2 partially supported`, `1 unsupported`
- Preliminary evidence quotes: `43/44` normalized-exact (`97.73%`)
- Invalid preliminary quotation: `Equipment by site`; the generated quote concatenated table fields and was not found as a contiguous normalized quotation on the cited page
- Critical false-active findings: `2` (the obsolete July 25 question deadline and August 18 proposal deadline)

## Spend

The completed run cost `$0.868308`. A first extraction call costing `$0.002618` was reconciled after the initial harness ledger insert failed. Total public-test spend is `$0.870926 / $3.00`.

Final authoritative ledger totals:

- Phase 3: `$0.470202 / $10.00`
- Phase 4: `$13.529402 / $15.00`
- Cumulative API: `$13.999604`

## Required correction before another public run

Use provider-neutral section/page chunk extraction rather than a single 61-page extraction response, include the official portal amendment record as a first-class source document, deterministically connect its explicit old/new deadlines, and validate every preliminary quote before semantic verification. Rerun only after a new provider authorization and a new frozen evaluator version. General live verification remains disabled.
