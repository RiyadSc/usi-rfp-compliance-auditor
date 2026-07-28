# Decision Confidence Map

**Workstream:** UX Discovery — required backbone artifact  
**Date:** 2026-07-25  
**Status:** Draft v1 — refine after Session 0 / Session 1  
**Related:** Inventory `08-…` · Cognitive spine `16-…` · **Attention order** `25-information-value-hierarchy.md`  
**CEO guidance:** Every screen should support one or more of these decisions. Rank by consequence, not by feature count.

This is **not** a workflow and **not** a journey. It is the ranked set of judgments humans make, with the confidence and evidence each requires.

**Companion:** The Information Value Hierarchy answers what to show first so these decisions are possible. Do not confuse the two.

---

## 1. Product identity (keep front and center)

This product is **not** fundamentally an AI product.

It is an **evidence-based decision support system**.

AI may propose candidates and assist retrieval; **humans make consequential decisions** with exact evidence. UX success is orientation, informed judgment, and control — not automation theater.

---

## 2. North-star moment (measurement yardstick)

> A proposal manager opens the application after being away for three days, spends **less than two minutes** understanding **what changed**, **what is still risky**, **what needs their judgment**, and **where the proof is**, then confidently resumes work.

**Usability probe** (also asks leadership readiness): see `25-information-value-hierarchy.md` §3.

Every UX change should be measurable against that moment — or against enabling one of the high-consequence decisions below.

---

## 3. Ranked decision map

Confidence needed: **Highest** · **Very high** · **High** · **Medium** · **Lower**  
Consequence severity drives sort order within bands.

| ID  | Decision                                          | Consequence if wrong                   | Confidence needed | Evidence required                                      | Primary surfaces today                     | Fitness                           |
| --- | ------------------------------------------------- | -------------------------------------- | ----------------- | ------------------------------------------------------ | ------------------------------------------ | --------------------------------- |
| D01 | **Can we submit?**                                | Bid failure / protest / brand harm     | **Highest**       | Human judgment only; product must **not** answer “yes” | Explicit non-authority; readiness language | Must stay non-authoritative       |
| D02 | Is this mandatory / a hard obligation?            | Disqualification or non-responsive bid | **Very high**     | Exact page + quote; category                           | Requirements, Checklist                    | Partial — split across objects    |
| D03 | Which addendum / instruction wins?                | Wrong submission package               | **Very high**     | Addendum evidence + precedence                         | Requirements precedence, Documents         | Partial — impact propagation weak |
| D04 | Is this a real / material requirement?            | Incomplete or wasted work; false work  | **Very high**     | Source quotation + page                                | Requirement detail                         | Partial — table-only accept risk  |
| D05 | Is the machine assessment acceptable?             | False confidence or false rejection    | **Very high**     | Exact evidence + axis meanings                         | Review controls                            | Strong control; literacy risk     |
| D06 | Grant waiver / accept residual risk?              | Hidden non-compliance                  | **Very high**     | Written rationale + authority                          | Waiver / finding resolve                   | Partial                           |
| D07 | Does the draft conflict or miss the RFP?          | Weak/wrong proposal ships              | **High**          | Side-by-side claim + RFP proof                         | Proposal Review                            | Partial–Strong                    |
| D08 | Is company documentation needed (vs false claim)? | Wrong remediation path                 | **High**          | Proof axis ≠ support axis                              | Checklist / findings                       | Partial literacy                  |
| D09 | Ready for leadership review?                      | Rework; bad meeting; false calm        | **High**          | Blockers + unresolved judgment + briefing freshness    | Overview, Reports                          | Partial — staleness weak          |
| D10 | Is this the correct proposal revision?            | Reviewing the wrong draft              | **High**          | Draft identity / version                               | Proposal Review entry                      | Partial                           |
| D11 | Is the attached artifact the right proof?         | False “complete”                       | **High**          | Doc identity + human content check                     | Checklist item                             | Partial                           |
| D12 | Can we bid? (qualify)                             | Opportunity cost / bad pursuit         | **High**          | Mostly outside product                                 | —                                          | Correctly light touch             |
| D13 | Who owns this / who are we waiting on?            | Delay; dropped balls                   | **Medium**        | Assignment + due + context                             | Checklist, My Work                         | Secondary                         |
| D14 | Mark task completed?                              | Queue lies; false progress             | **Medium**        | Workflow + artifact state (not source truth)           | Checklist                                  | Strong UX / semantic risk         |
| D15 | Continue despite partial parse / failure?         | Silent coverage gaps                   | **High**          | Warnings; what’s preserved                             | Documents / processing                     | Weak–Partial                      |
| D16 | Trust this export / briefing packet?              | External misread                       | **High**          | Snapshot time, watermark, grant rules                  | Reports                                    | Partial                           |

---

## 4. Decision → cognitive question mapping

| Decision IDs       | Cognitive Q                   |
| ------------------ | ----------------------------- |
| D12                | Q1 Can we bid?                |
| D03                | Q2 What changed? / precedence |
| D02, D04           | Q3 What is mandatory?         |
| D02, D09           | Q4 What will eliminate us?    |
| D13                | Q5 Who owns?                  |
| D04, D05, D08, D11 | Q6 Where is proof?            |
| D07, D10           | Q7 Draft answering?           |
| D06, D08, D15      | Q8 Still risky?               |
| D09, D16           | Q9 Leadership trust?          |
| D01                | Q10 Submit (human only)       |

---

## 5. Screen fitness rule (backbone)

A primary screen earns its place if it **materially improves** at least one of:

- **Highest / Very high** decisions (D01–D06), or
- The **2-minute resume** moment (change, risk, judgment, proof)

**Removal litmus:**

> If we removed this screen entirely, what important decision would become harder to make?

If **none**, it probably should not exist (or belongs at Level 4 disclosure only).

Screens that only serve Lower/Medium decisions or engineering curiosity should be demoted (Technical / progressive disclosure). Attention order: `25-…`.

---

## 6. Implementation filter (CEO rule)

> **Nothing should be implemented simply because it seems like good UX.**  
> It should either **remove a documented friction point** or **support one of the high-confidence (Highest / Very high / High) decision tasks.**

### How to use before any Tier 1/2 change

Fill this card:

```text
Change:
Documented friction (UX-R / gap / Session note) OR Decision IDs supported:
Expected effect on 2-minute resume moment:
Evidence grade available:
Tier:
Ship? Yes / No / Defer
```

### Candidate evaluation (do not auto-ship)

| Candidate                                     | Friction or decisions?          | Ship now?                                                                   |
| --------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Overview priority (blockers → judgment → due) | UX-R14; D09, D02; resume moment | **Eligible** — only if scoped as presentation reorder supporting D09/resume |
| Decision microcopy (not compliant)            | UX-R04, R09; D01, D05, D14      | **Eligible** — supports Highest/Very high misread prevention                |
| Briefing staleness cues                       | UX-R12; D09, D16                | **Eligible** — supports High leadership decisions                           |
| Other “nice” polish                           | —                               | **Defer** unless card completed                                             |

Do **not** implement the full Tier 1 list in `23-…` as a batch. Each item needs the card above.

---

## 7. Validation updates

| Event       | Update this map                                                          |
| ----------- | ------------------------------------------------------------------------ |
| Session 0   | Add/remove decisions stakeholders verbalize; capture confidence language |
| Session 1   | Re-rank by observed fear/consequence; add missing decisions              |
| Session 2/4 | Strengthen D09/D01 leadership criteria                                   |
| Session 3   | Strengthen D13 handoff context requirements                              |
