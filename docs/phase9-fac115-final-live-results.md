# Phase 9 FAC115 Final Live Results

Status: **passed**.

## Acceptance run

| Field                                       | Value                                              |
| ------------------------------------------- | -------------------------------------------------- |
| Evaluation run                              | `2e4f79ca-1be2-43e7-8daa-d6d2173cca9a`             |
| Git commit                                  | `39c4fddafe90264565973b7879d644ba5b19be06`         |
| Project                                     | `uxmxkdjschbekkbnweby`                             |
| Workspace                                   | `80000000-0000-4000-8000-000000000100`             |
| Mode                                        | cached completion after bounded live provider work |
| Provider calls this run                     | `0`                                                |
| Cache hits this run                         | `58/58`                                            |
| Actual spend this run                       | `$0.000000`                                        |
| Phase 9 ledger total (all settled attempts) | `$0.819348`                                        |
| Dedicated ceiling                           | `$3.00`                                            |
| Offline hard maximum (pre-cache)            | `$2.027129`                                        |
| Forecast vs this-run spend                  | under-spend; overrun variance `0`                  |
| Unchanged-source rerun proof                | passed (`providerCalls: 0`, `$0` additional)       |

Artifacts:

- `artifacts/evaluation/phase9-fac115-final-live-provider-usage-v1.json`
- `artifacts/evaluation/phase9-fac115-expected-vs-actual-v1.json`
- `artifacts/evaluation/phase9-fac115-fresh-extraction-v1.json`
- `artifacts/evaluation/phase9-fac115-cache-rerun-proof-v1.json`

## FAC115 source-grounded accuracy

| Metric                        | Result          |
| ----------------------------- | --------------- |
| Expected-answer coverage      | `23/23` (`1.0`) |
| Source status accuracy        | `1.0`           |
| Precedence accuracy           | `1.0`           |
| Proof requirement accuracy    | `1.0`           |
| Date accuracy                 | `1.0`           |
| Numerical accuracy            | `1.0`           |
| Spreadsheet evidence accuracy | `1.0`           |
| Evidence validity             | `1.0`           |
| Provenance validity           | `1.0`           |
| False verified                | `0`             |
| False active                  | `0`             |

## Safety / reliability

- Repairs / retries / malformed / incomplete / refused / timeouts: all `0` on the accepted run.
- Wrong-workspace, wrong-document, and unsupported-as-verified promotions: `0` in the evaluator safety counts.
- Exact evidence remained source-grounded; invented extraction quotes are dropped rather than accepted.

## Notes

1. Initial paid provider work populated the Phase 9 cache (`58` task results; ledger `$0.819348`).
2. A deterministic finalize fix for attendance “strongly suggested” meeting language was required for the last expected answer.
3. The accepted command then completed from cache with zero additional provider spend and proved the unchanged-source rerun path.

Production deployment, ordinary live verification, and confidential-data processing remain separate, unauthorized decisions.
