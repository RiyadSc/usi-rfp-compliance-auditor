# UX Risk Register

**Workstream:** UX Discovery — Phase C/D  
**Date:** 2026-07-25  
**Prioritization:** Impact × Likelihood (1–5). Evidence grades noted.

Related engineering risks remain in `docs/risk-register.md`. This register focuses on **experience failures** that cause material bid harm or false confidence.

| ID     | UX failure mode                                                     | Impact | Likelihood | Priority | Linked threats/assumptions   | Current mitigation                | Residual                              |
| ------ | ------------------------------------------------------------------- | ------ | ---------- | -------- | ---------------------------- | --------------------------------- | ------------------------------------- |
| UX-R01 | Requirement missed because user never opens uncertain/partial items | 5      | 3          | P0       | A-04, R3                     | Fail-closed uncertain; blockers   | Prioritization & teach-back unproven  |
| UX-R02 | Superseded requirement treated as active                            | 5      | 2          | P0       | R2, A-12                     | Precedence labels                 | Addendum impact propagation UX weak   |
| UX-R03 | Ambiguous finding appears certain                                   | 5      | 3          | P0       | T8, A-05                     | Separate axes; machine-only label | Calibration untested with real users  |
| UX-R04 | Task completion read as compliance / safe to submit                 | 5      | 4          | P0       | R-21, BR language            | Prohibited language; copy         | Habit + skim risk high                |
| UX-R05 | Unresolved issue disappears after regenerate/nav                    | 4      | 2          | P1       | Phase 5 obsolete-not-delete  | Stable keys; history              | Comprehension of obsolete items       |
| UX-R06 | Mandatory form overlooked in dense lists                            | 5      | 3          | P0       | Demo AC forms                | Action groups “Blocking”          | Expert filter misuse                  |
| UX-R07 | Deadline misunderstood (TZ / relative)                              | 4      | 3          | P1       | Assumptions on dates         | No guessing ambiguous dates       | Display clarity                       |
| UX-R08 | Wrong proposal revision audited                                     | 5      | 2          | P1       | Phase 6 revision model       | Immutable revisions               | Entry UX still run-tinged             |
| UX-R09 | Machine finding confused with human decision                        | 5      | 3          | P0       | D-035/039                    | Labels; append-only               | Literacy                              |
| UX-R10 | Cross-workspace info via search/UI enumeration                      | 5      | 1          | P1       | T2, RLS                      | RLS; non-enumerating 404          | Must never regress                    |
| UX-R11 | Role view mistaken for authorization                                | 4      | 3          | P1       | R36, A-15                    | “View for” copy                   | Preference persistence later          |
| UX-R12 | Stale report used for leadership                                    | 4      | 3          | P1       | R-32                         | Snapshot metadata                 | Weak “decisions changed since” signal |
| UX-R13 | Live Analysis confused with verified requirements                   | 4      | 3          | P1       | A-14                         | Separate route                    | Primary nav inclusion                 |
| UX-R14 | Resume after interruption fails — user rebuilds context             | 4      | 4          | P0       | Authorization §32            | Overview activity; My Work        | No explicit “what changed since”      |
| UX-R15 | Evidence not consulted at judgment moment                           | 5      | 3          | P0       | A-16, Norman mapping         | Evidence links                    | Still optional behaviorally           |
| UX-R16 | Over-disclosure of technical metadata increases extraneous load     | 3      | 3          | P2       | Prior audit                  | Progressive disclosure            | Inconsistent across pages             |
| UX-R17 | Accessibility failure under time pressure                           | 4      | 2          | P1       | A-24                         | Skip link, focus, non-color text  | No formal inclusive study             |
| UX-R18 | False simplicity hides material axis                                | 5      | 2          | P0       | Risk R36 exec simplification | Axis cards retained               | Future redesign pressure              |

---

## Harm-prevention priority order for concepts

1. Prevent false compliance / false certainty (UX-R03, R04, R09, R18)
2. Prevent missed mandatory obligations & addendum drift (UX-R01, R02, R06)
3. Support interruption resume & version awareness (UX-R08, R12, R14)
4. Clarify IA boundaries (Live Analysis, role view) (UX-R11, R13)
5. Preserve security isolation (UX-R10) — regression only
