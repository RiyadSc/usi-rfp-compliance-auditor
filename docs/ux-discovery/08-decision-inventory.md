# Decision Inventory

**Workstream:** UX Discovery — Phase C  
**Date:** 2026-07-25  
**Evidence:** Proxy (UI controls + RPCs + domain transitions) · Stakeholder (PRD FR/BR)  
**Ranked backbone:** Use `24-decision-confidence-map.md` for prioritization and screen fitness. This file remains the expanded inventory.

Interface support ratings: **Strong** · **Partial** · **Weak** · **Absent** (relative to need, not visual quality).

---

## Source & requirements

| Decision                               | Who               | When                  | Evidence required                | Consequences                        | Reversible?         | Confidence needed | UI support                        | Likely errors                   |
| -------------------------------------- | ----------------- | --------------------- | -------------------------------- | ----------------------------------- | ------------------- | ----------------- | --------------------------------- | ------------------------------- |
| Is this a real / material requirement? | PM / reviewer     | After extract/verify  | Quote, page, category, mandatory | Enters active work or rejected      | New decision append | High              | Partial (axes + evidence)         | Accept without opening page     |
| Accept vs dispute machine assessment   | Reviewer          | Per finding           | Exact evidence + explanation     | Unlocks checklist eligibility paths | Append              | High              | Strong controls; literacy Partial | Confuse accept with legal OK    |
| Needs follow-up vs waive               | Reviewer          | Ambiguity / exception | Rationale                        | Audit trail; readiness impact       | Append              | High              | Partial                           | Waive to clear blocker casually |
| Which addendum controls?               | PM / system+human | Conflict              | Precedence evidence              | Active obligation set               | Human on conflict   | High              | Partial                           | Ignore superseded still listed  |

## Checklist & coordination

| Decision                         | Who                               | When           | Evidence required                     | Consequences                   | Reversible?                | Confidence needed | UI support                 | Likely errors                        |
| -------------------------------- | --------------------------------- | -------------- | ------------------------------------- | ------------------------------ | -------------------------- | ----------------- | -------------------------- | ------------------------------------ |
| Does this block submission work? | System proposes; human interprets | After generate | Blocker reason + source               | Prioritization                 | N/A machine; human resolve | High              | Strong grouping            | Treat blocker clear = compliant      |
| Who owns this item?              | PM                                | Planning       | Skill + due date                      | Accountability                 | Reassign                   | Med               | Partial (no profile names) | Assign wrong person / UUID confusion |
| Is uploaded artifact sufficient? | Contributor / reviewer            | Artifact link  | Correct doc identity + content review | Workflow advance               | History retained           | High              | Partial                    | Wrong PDF linked (R-22)              |
| Grant waiver / exception?        | Authorized membership             | Exception path | Written rationale                     | Removes blocker path carefully | Append                     | Very high         | Partial                    | Authority matrix too coarse (R-24)   |
| Mark task completed?             | Owner                             | After work     | Artifact/review state                 | Queue hygiene                  | Transition guards          | Med               | Strong                     | Completion ≠ source truth            |

## Proposal review

| Decision                                 | Who                   | When         | Evidence required            | Consequences           | Reversible?          | Confidence needed | UI support                  | Likely errors                 |
| ---------------------------------------- | --------------------- | ------------ | ---------------------------- | ---------------------- | -------------------- | ----------------- | --------------------------- | ----------------------------- |
| Does draft answer the requirement?       | Reviewer              | Audit        | Coverage + claim + RFP quote | Finding workflow       | Append resolution    | High              | Partial–Strong              | Miss unmatched items          |
| Conflict vs unsupported vs proof-needed? | Reviewer              | Per finding  | Classification + pages       | Remediation path       | Append               | High              | Strong if labels understood | Collapse classifications      |
| Accept risk vs resolve?                  | Reviewer / leadership | Late stage   | Severity + rationale         | Readiness denominators | Append               | Very high         | Partial                     | Accept risk without authority |
| Is this the correct revision?            | PM                    | Before audit | Draft identity / version     | Wrong findings set     | New audit on new doc | High              | Partial                     | Audit stale draft             |

## Leadership & reporting

| Decision                                             | Who                | When           | Evidence required                    | Consequences        | Reversible?       | Confidence needed | UI support                 | Likely errors            |
| ---------------------------------------------------- | ------------------ | -------------- | ------------------------------------ | ------------------- | ----------------- | ----------------- | -------------------------- | ------------------------ |
| Ready for leadership review?                         | PM                 | Pre-gate       | Readiness + open decisions           | Meeting quality     | Regenerate report | High              | Partial                    | Use stale snapshot       |
| Escalate / delay / proceed to human submit decision? | Director           | Gate           | Top blockers, uncertainty, ownership | Bid outcome         | Human only        | Very high         | Partial (Overview/Reports) | Over-read “ready”        |
| Trust this export?                                   | Director / auditor | External share | Watermark, provenance, grant expiry  | External perception | Revoke grant      | High              | Partial                    | Share expired/copied URL |

## Processing & operations

| Decision                         | Who           | When            | Evidence required            | Consequences    | Reversible?   | Confidence needed | UI support        | Likely errors            |
| -------------------------------- | ------------- | --------------- | ---------------------------- | --------------- | ------------- | ----------------- | ----------------- | ------------------------ |
| Retry failed parse/analysis?     | Operator / PM | Failure         | Stage error, preserved pages | Cost/time       | Retry bounded | Med               | Partial           | Blind retry burns budget |
| Continue with partial documents? | PM            | Partial success | Warnings list                | Coverage gaps   | Later uploads | High              | Weak–Partial      | Assume completeness      |
| Use cached/fallback demo mode?   | Demo operator | Rehearsal       | Visible mode banner          | Honesty of demo | N/A           | Med               | Strong if labeled | Present as live run      |

---

## Inventory insight

The product already exposes **many** consequential controls. The UX risk is less “missing buttons” and more **decision framing**: whether users know _which decision they are making_, _what evidence is required_, and _what the decision does not mean_.
