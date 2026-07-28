# Cognitive Model × Current Product Gap Map

**Date:** 2026-07-25  
**Method:** Map current routes to Proposal Manager Cognitive Model questions  
**Evidence:** Proxy (current IA + UX guide) · Stakeholder seeds  
**Companion:** `16-proposal-manager-cognitive-model.md`

Fitness: Primary · Secondary · Weak · Absent · Harmful

---

## Matrix

| Cognitive question         | Best current surface                      | Fitness                       | Gap                                                            |
| -------------------------- | ----------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| Q0 Incoming RFP            | Opportunities / Documents upload          | Secondary                     | Intake still “create workspace” flavored                       |
| Q1 Can we bid?             | —                                         | Absent (correctly mostly OOS) | Do not fill with fake scores                                   |
| Q2 What changed?           | Overview activity                         | **Weak**                      | Activity ≠ semantic change/addendum impact                     |
| Q3 What is mandatory?      | Requirements + Checklist                  | Secondary→Primary mix         | Split across two objects; mandatory not one question           |
| Q4 What will eliminate us? | Checklist Blocking + Overview top issues  | **Primary-ish**               | Strongest current fit; keep dominant                           |
| Q5 Who owns each piece?    | My Work + checklist owners                | Secondary                     | Profile names weak; waiting-on narrative weak                  |
| Q6 Where is proof?         | Requirement detail / evidence / artifacts | **Primary** when drilled      | Easy to decide from table without proof (behavioral risk)      |
| Q7 Proposal answering?     | Proposal Review                           | Secondary→Primary             | Still slightly run/revision technical; classification literacy |
| Q8 Still risky?            | Overview signals + pending review         | Secondary                     | No unified residual-risk inventory                             |
| Q9 Leadership trust?       | Overview + Reports                        | Secondary                     | Stale snapshot risk; director one-screen not proven with USI   |
| Q10 Submit                 | Explicit non-goal copy                    | Absent as authority (good)    | Must stay non-authoritative                                    |

---

## Surfaces that poorly earn their place (hypothesis)

| Surface                       | Cognitive questions served           | Disposition hypothesis                                               |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| Live Analysis (`/phase9`)     | None in PM spine; technical/coverage | Demote under More / Technical until a spine question owns it         |
| Analysis run pages            | Pipeline status only                 | Keep as recovery when wait/fail affects Q3–Q4; hide from primary nav |
| Role view selector            | None directly                        | Keep only if it improves Q9 density without implying auth            |
| Global Search                 | Weak helper for Q3/Q5                | Keep; don’t pretend to be “search the RFP”                           |
| Phase/hash/fingerprint panels | Audit trust for technical operators  | Progressive disclosure only                                          |

---

## Engineering-object → cognitive translation (content debt)

| Current / system language  | Cognitive question it should serve | Prefer saying                                                |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Verification run completed | Q3 / Q6                            | “Source check finished — review what the RFP requires”       |
| Requirement register       | Q3 / Q4                            | “Mandatory & other obligations” or “What the RFP requires”   |
| Parser uncertain           | Q6 / Q8                            | “We can’t prove this from the document yet”                  |
| Machine-generated          | Q6 / Q8                            | “Suggested — needs a person”                                 |
| Checklist generation       | Q3 / Q4 / Q5                       | “Build submission list” / “What’s left to submit”            |
| Proposal audit findings    | Q7 / Q8                            | “Draft issues vs the RFP”                                    |
| Ready for final review     | Q9                                 | “Ready for leadership review” + residual list (never submit) |
| Analysis / Phase 9         | (rarely Q3)                        | Only if framed as “coverage check,” else Technical           |

---

## Design implication

The next IA should be evaluated by **question coverage**, not by entity completeness.

Minimum viable cognitive coverage for a PM daily driver:

1. **Eliminate us** (Q4) — always first
2. **Changed** (Q2) — resume
3. **Mandatory + proof** (Q3+Q6) — trust
4. **Waiting on** (Q5) — coordination
5. **Draft answering** (Q7) — late stage
6. **Leadership trust** (Q9) — gate

Everything else is supporting cast.
