# Massachusetts FAC115 public RFP fixture

This fixture preserves the official closed COMMBUYS solicitation `BD-22-1080-OSD03-SRC01-70375` for a Category 1 security-guard evaluation. It contains only official public procurement materials; no bidder proposals, confidential security plans, or USI information are included.

## Live result (2026-07-21)

Extraction and expected-budget verification both completed against the frozen population.

| Item                                            |                                                              Value |
| ----------------------------------------------- | -----------------------------------------------------------------: |
| Analysis run                                    |                             `5d2401ea-f042-4c3c-a6f8-f6c3dfb94fd0` |
| Population hash                                 | `f4e4c37056de810a475852fa8816403a65c661c03a2c269fbfb8662d871a9348` |
| Accepted candidates                             |                                                                209 |
| Verification completed                          |                                                                201 |
| Verification failed (semantic contract)         |                                                                  8 |
| Incomplete / budget-stopped                     |                                                                  0 |
| Extraction spend                                |                                                        `$0.132757` |
| Verification spend                              |                                                        `$8.512031` |
| FAC115 total spend                              |                                                        `$8.644788` |
| Authorized verification cap                     |                   `$9.27` (effective `$9.248816` Phase 3 headroom) |
| Pessimistic 3× reserve (not used as start gate) |                                                       `$88.814280` |
| Known answers passed                            |                                                             5 / 22 |

Artifacts:

- Population: `artifacts/evaluation/public-rfp-fac115-population-5d2401ea-f042-4c3c-a6f8-f6c3dfb94fd0.json`
- Evaluation: `artifacts/evaluation/public-rfp-fac115-5d2401ea-f042-4c3c-a6f8-f6c3dfb94fd0.json`

The run is **not** a fully qualified pass: 8 candidates failed closed on strict semantic-contract repairs, and 17/22 known answers did not match (mostly `not_extracted` matcher/document alignment, plus one `not_source_supported`). The whole accepted population was attempted; spend stayed under the authorized expected budget.

## Fixture contents

- Eight official sources hash-pinned in `source/`
- LibreOffice PDF renditions in `renditions/`
- openpyxl workbook inspection in `inspection/`
- Frozen answers/matchers in `known-answers.json` and `known-answer-matchers-v2.json`
