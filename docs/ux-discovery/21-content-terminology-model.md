# Content and Terminology Model (D-track)

**Date:** 2026-07-25  
**Status:** Working draft for parallel evolution · Refine after Session 0 language capture · Validate in Sessions 1–4  
**Constraint:** Do not change domain enum semantics. Presentation labels only (`business-terminology-v*`).

---

## 1. Voice

- Concrete verbs and nouns
- Operator questions over pipeline nouns
- Uncertainty named without drama
- Never imply compliance, approval, or safe-to-submit as a system conclusion
- Human control visible at decision moments

---

## 2. Object names

| System / current                | Prefer (chrome)               | Avoid                         | Cognitive Q |
| ------------------------------- | ----------------------------- | ----------------------------- | ----------- |
| Workspace                       | Opportunity                   | Tenant, workspace (in PM UI)  | Q0          |
| Requirement candidate + finding | What’s required / Obligation  | Register, candidate (primary) | Q3          |
| Checklist item                  | Submission item / What’s left | Phase 5 item                  | Q4–Q5       |
| Proposal audit finding          | Draft issue                   | Audit run (primary)           | Q7          |
| Report snapshot                 | Leadership briefing           | Executive export (primary)    | Q9          |
| Evidence span                   | Source proof / Exact quote    | Span, offset                  | Q6          |
| Live Analysis / Phase 9         | Coverage analysis (Technical) | Live AI (unqualified)         | —           |

---

## 3. Status language (keep axes separate)

| Axis           | Prefer                                                                               | Must not be heard as      |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| Source support | Backed by the RFP / Partially backed / Not found in the RFP / Conflicts with the RFP | Approved, true, compliant |
| Precedence     | Current requirement / Replaced by an addendum / Conflicting instructions             | Deleted, irrelevant       |
| Proof          | Company document needed / Team confirmation needed                                   | Same as “not found”       |
| Parser         | Can’t prove this from the document yet                                               | Skip / low priority       |
| Human review   | Needs a person / Assessment accepted / Assessment disputed                           | Final legal sign-off      |
| Workflow       | Not started → In progress → Ready for team review → Task completed                   | Bid complete              |
| Blocker        | Blocking submission work                                                             | Model is unsure           |
| Readiness      | Ready for leadership review / Blocked / Human review required                        | Safe to submit            |

Definitions in UI should stay short; full glossary in Technical / Help disclosure.

---

## 4. Action labels

| Action                    | Prefer                     | Note                      |
| ------------------------- | -------------------------- | ------------------------- |
| Accept machine assessment | Accept source assessment   | Not “Approve requirement” |
| Reject machine assessment | Dispute source assessment  |                           |
| Waive                     | Record waiver              | Require reason            |
| Assign                    | Assign owner               |                           |
| Link artifact             | Attach company document    |                           |
| Resolve finding           | Record decision            | Append-only               |
| Generate report           | Create leadership briefing | Snapshot time visible     |
| Generate checklist        | Build submission list      |                           |

---

## 5. Guidance / empty / error patterns

**Empty:** What this means · What to do next (one action)  
**Error:** What happened · What was preserved · What’s affected · What you can do · Whether work can continue  
**Demo/synthetic:** Always visible when true — credibility through honesty

---

## 6. Session 0 language intake

After the demo, merge verbatim stakeholder phrases into this table. Promote terms they use spontaneously; demote ours when they bounce.

| Verbatim (Session 0) | Adopt? | Maps to |
| -------------------- | ------ | ------- |
| _(fill)_             |        |         |

---

## 7. Versioning

Bump `BUSINESS_TERMINOLOGY_VERSION` when shipping label changes. Keep prohibited-language tests green. No DB enum renames for friendliness.
