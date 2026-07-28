# Information Value Hierarchy

**Workstream:** UX Discovery — required backbone artifact  
**Date:** 2026-07-25  
**Status:** Draft v1 — refine after Session 0 / Session 1  
**Triad:**

| Artifact                         | Asks                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| Cognitive model (`16-…`)         | What questions does the operator ask?                                  |
| Decision Confidence Map (`24-…`) | What decisions matter most, and what confidence/evidence do they need? |
| **This document**                | **What information deserves attention first?**                         |

Enterprise software often treats all information as equal. Users then prioritize under load. This hierarchy is the product’s explicit opinion about attention order.

---

## 1. How to use with the other backbones

```text
Decision Confidence Map  →  which judgments are high-stakes
Information Value Hierarchy  →  what to show first so those judgments are possible
Cognitive model  →  the question sequence the operator is already running
```

**Rule:** Level 1 information must appear before Level 3/4 on resume and overview surfaces. Level 4 must never compete with Level 1 for first-viewport attention.

**Litmus (every screen):**

> If we removed this screen entirely, what important decision would become harder to make?

- Answer **none** → demote, merge, or delete (candidate).
- Answer names a Highest / Very high / High decision (`24-…`) → screen is earning its place.
- Answer only names a Lower/Medium decision → keep only if cheap and non-competing with Level 1.

---

## 2. Hierarchy

### Level 1 — Immediate attention

Must be answerable in the **&lt;2 minute resume** probe without hunting.

| Information                                                     | Serves decisions | Cognitive Q |
| --------------------------------------------------------------- | ---------------- | ----------- |
| Submission blockers / elimination risks                         | D02, D09         | Q4          |
| Active deadline risks                                           | D02, D09         | Q4          |
| What changed (addenda, new drafts, invalidated work)            | D03, resume      | Q2          |
| Invalidated / superseded requirements still mistaken as current | D03              | Q2, Q3      |
| Human decisions pending (needs a person)                        | D05, D09         | Q8          |
| Briefing staleness vs new decisions                             | D09, D16         | Q9          |

**Surfaces:** Home resume module · Opportunity Overview first viewport · blocking groups on submission list

**Anti-pattern:** Leading with pipeline stage strips, metric wallpaper, or technical run IDs.

---

### Level 2 — Active work

After orientation: what to do next with hands on keyboard.

| Information                           | Serves decisions | Cognitive Q |
| ------------------------------------- | ---------------- | ----------- |
| Assigned tasks / waiting on me        | D13, D14         | Q5          |
| Proposal findings needing resolution  | D07, D08, D10    | Q7          |
| Missing artifacts / company documents | D08, D11         | Q6          |
| Review queues (accept/dispute/waive)  | D05, D06         | Q6, Q8      |
| Due-soon items                        | D13              | Q5          |

**Surfaces:** My Work · Checklist action groups · Proposal Review issue list · judgment queues

---

### Level 3 — Context

Supports high-confidence decisions when drilling in — available on demand, not as the default homepage.

| Information                                | Serves decisions | Cognitive Q |
| ------------------------------------------ | ---------------- | ----------- |
| Full obligation / requirement set          | D02, D04         | Q3          |
| Exact evidence (quote, page, original doc) | D04, D05, D07    | Q6          |
| Source document set and purpose            | D03, D15         | Q0, Q2      |
| Audit / decision history                   | D05, D06, D16    | Q8          |
| Relationship / supersession detail         | D03              | Q2          |

**Surfaces:** Requirement detail · evidence viewer · document detail · history panels

**Rule:** Context must be **one step from Level 1/2 actions**, not buried behind unrelated chrome.

---

### Level 4 — Reference / technical

For operators recovering failures, demo honesty, or technical reviewers — progressive disclosure only.

| Information                                  | Serves decisions   | Notes                                                     |
| -------------------------------------------- | ------------------ | --------------------------------------------------------- |
| Processing / job stage detail                | D15                | Plain-language summary at Level 1 if blocked; detail here |
| Parser internals, offsets, fingerprints      | Audit / technical  | Never first viewport for PM/Director                      |
| Model / provider / schema / cost diagnostics | Technical / budget | Technical view                                            |
| Live / coverage analysis internals           | Specialized path   | Demoted from primary PM spine                             |
| Raw hashes, prompt versions                  | Provenance audit   | Analyst / technical disclosure                            |

**Anti-pattern:** Equal visual weight with Level 1 on Overview.

---

## 3. Resume probe (usability script)

Use in Session 0 light form and in formal tests after Session 1:

> You’ve been away from this opportunity for three days. Without anyone helping you, tell me:
>
> 1. What changed?
> 2. What is still risky?
> 3. What needs your judgment?
> 4. Can leadership review this?
> 5. Where is the proof?

**Success:** Coherent answers in **&lt;2 minutes**, citing Level 1/2 information and opening Level 3 proof when asked about proof — without Level 4 required.

---

## 4. Current product vs hierarchy (gap snapshot)

| Level | Current strength                        | Gap                                   |
| ----- | --------------------------------------- | ------------------------------------- |
| 1     | Blockers / top issues relatively strong | “What changed” / invalidation weak    |
| 2     | Action groups + My Work exist           | Unified judgment queue weak           |
| 3     | Evidence paths strong when drilled      | Easy to decide without drilling       |
| 4     | Often still too visible in places       | Live Analysis / tech metadata compete |

---

## 5. Screen evaluation worksheet

```text
Screen / module:
Level 1–4 content it surfaces (list):
If removed, which Decision IDs get harder? (24-…):
Competes with Level 1 in first viewport? Yes/No
Disposition: Keep primary / Demote / Merge / Remove candidate
```

Run this on every primary route before major IA changes; run lightly before Tier 1 presentation changes that reorder attention.

---

## 6. Validation updates

| Event            | Update                                                               |
| ---------------- | -------------------------------------------------------------------- |
| Session 0        | What stakeholders attend to first during demo; what they ignore      |
| Session 1        | What operators open first in real work (may differ from our Level 1) |
| Session 2/4      | What leadership needs in the first screenful                         |
| Post-change test | Resume probe times and answer completeness                           |
