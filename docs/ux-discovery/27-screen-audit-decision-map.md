# Screen Audit vs Decision Confidence Map

**Date:** 2026-07-25  
**Track:** 2 (safe UX work)  
**Method:** Litmus + DCM + IVH against current primary routes  
**Hold:** No nav/IA/lifecycle changes from this audit alone

Litmus: _If we removed this screen, what important decision gets harder?_

| Screen                  | Litmus (decisions harmed if removed) | L1–L4 mix                           | Top gaps                                | Track 2 action                                         |
| ----------------------- | ------------------------------------ | ----------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| Home                    | D09 portfolio triage, D13 waiting-on | L1/L2 mixed                         | Change digest absent                    | Later Tier 2 resume                                    |
| Opportunities           | D12 light, portfolio pick            | L2                                  | —                                       | Keep                                                   |
| My Work                 | D13, D14                             | L2                                  | Context brief thin                      | Design only for now                                    |
| Search                  | Findability helper                   | L3                                  | Honest bounds OK                        | Keep                                                   |
| Login                   | Access                               | —                                   | —                                       | Keep                                                   |
| Overview                | D09, D02, D05 pending, resume        | Metrics equalized; journey L3 heavy | Blockers not first; weak “what changed” | **Reorder L1 metrics; prefer blockers in next action** |
| Documents               | D03, D15, Q0                         | L3 + processing                     | —                                       | Keep; no IA move                                       |
| Document detail         | D15, proof path                      | L3/L4                               | Recovery copy uneven                    | Later                                                  |
| Requirements            | D02, D04, D05                        | L2/L3                               | Decide-without-proof risk               | Microcopy on detail                                    |
| Requirement detail      | D04, D05, D06                        | L3 strong                           | Decision ≠ compliance                   | **Decision microcopy**                                 |
| Checklist               | D02, D09, D13, D14                   | L1 blockers good                    | —                                       | Keep grouping                                          |
| Checklist item          | D11, D14, D06                        | L2/L3                               | —                                       | Keep                                                   |
| Proposal Review list    | D07, D10                             | L2                                  | Revision clarity                        | Hold major redesign                                    |
| Proposal finding detail | D07, D08, D06                        | L2/L3                               | —                                       | Keep                                                   |
| Reports list            | D09, D16                             | L2                                  | Staleness                               | Cue on detail                                          |
| Report detail           | D09, D16, D01 boundary               | L1 content buried under meta        | **Staleness vs later decisions**        | **Staleness notice**                                   |
| Analysis run            | D15                                  | L4                                  | —                                       | Keep as recovery                                       |
| Demo                    | Credibility                          | —                                   | Session 0                               | Keep                                                   |
| Live Analysis / phase9  | Specialized accuracy proof           | L4 for PM spine                     | Competes for attention                  | **Hold nav move**; no delete                           |
| 404                     | Security                             | —                                   | —                                       | Keep                                                   |

---

## Priority Track 2 ships from this audit

1. Overview metric order + next-action blocker preference → D09, D02, resume
2. Requirement review decision microcopy → D01, D05
3. Report staleness when decisions newer than snapshot → D09, D16

Nav demotion of Live Analysis remains **Hold** (structural).
