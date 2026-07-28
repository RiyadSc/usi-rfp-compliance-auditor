# Experience North Star, Principles, and Opportunity Map

**Workstream:** UX Discovery — Phase E  
**Date:** 2026-07-25  
**Evidence:** Synthesis of Phases A–D (proxy/stakeholder). Principles are **provisional** until interview validation.

---

## 1. Experience north star

**Product identity:** An **evidence-based decision support system** — not an AI product that users must supervise for its own sake. AI may assist; humans decide with proof.

**Moment we design toward:**

> A proposal manager opens the application after three days away, spends less than two minutes understanding what changed, what is still risky, what needs their judgment, and where the proof is, then confidently resumes work.

A qualified member of a proposal team can open an opportunity (or their personal queue), immediately see **what matters now**, open **exact source evidence** at the moment of judgment, distinguish **machine assessment from human decision**, and take the **next consequential action** — without learning the pipeline architecture, without mistaking readiness for compliance, and without losing provenance.

The product should feel like a **disciplined extension of the compliance-matrix and draft-review process**, not like supervising an AI, browsing a database, or operating an engineering console.

**Backbone artifacts:** Cognitive model (`16-…`) · Decision Confidence Map (`24-…`) · Information Value Hierarchy (`25-…`). Every primary screen must support a ranked decision or the resume moment, and respect attention levels.

---

## 2. Product-specific experience principles

Derived from risks UX-R01–R18, jobs J-F1–F6, and invariants.

1. **Evidence at the moment of judgment**  
   If a user is accepting, disputing, assigning, waiving, or resolving, the controlling quote/page (or explicit uncertainty) must be reachable without leaving the decision context.

2. **Axes stay separate; presentation may layer**  
   Support, precedence, proof, workflow, blocker, and human review never collapse. Summaries are allowed; silent merges are not.

3. **Next consequential action over equalized data**  
   Default views prioritize blockers, judgment-needed items, due work, and changes — not complete inventories.

4. **Calibrated trust, not confidence theater**  
   Strength of evidence and uncertainty are visible; language never implies legal compliance or submission safety.

5. **Working context survives interruption**  
   Returning users get what changed, what remains theirs, and what became invalid — not only a static dashboard.

6. **Ownership is not approval**  
   Assignment, workflow completion, human acceptance of a machine assessment, and leadership submission decisions are different speech acts.

7. **Honesty about system modes**  
   Cached, fallback, partial, stale, and live-restricted states are labeled when they affect interpretation.

8. **Complement the ecosystem**  
   Design for handoffs to Word, email/Teams, and shared drives rather than pretending the app is the only workplace.

9. **Decisions over decorations**  
   Ship only what removes documented friction or supports a high-consequence decision (`24-decision-confidence-map.md`). No “nice UX” accumulation.

10. **Attention is a product opinion**  
    Level 1 information (`25-information-value-hierarchy.md`) outranks context and technical reference. If a screen’s removal makes no important decision harder, it should not occupy primary attention.

---

## 3. Opportunity-solution tree (abridged)

**Desired outcomes**

- Reduce missed mandatory obligations
- Reduce false confidence in machine output
- Reduce time-to-orient and time-to-evidence
- Improve resume-after-interruption success
- Preserve domain semantics and security

### Opportunity A — Unified “needs judgment” spine

- **Problem:** Judgment work scattered (UX review §7)
- **Directions:** (1) Global Judgment queue; (2) Opportunity-scoped Judgment tab; (3) Smart Home only
- **Eval notes:** Impact high; domain risk low if read-models only; test with T1/T6/T7

### Opportunity B — Change & resume model

- **Problem:** UX-R14, weak Q9
- **Directions:** (1) Since-last-visit digest; (2) Addendum impact view; (3) Invalidation badges on checklist/requirements
- **Eval notes:** May need backend read models — document separately if so

### Opportunity C — Axis literacy without clutter

- **Problem:** A-06, UX-R03/R09
- **Directions:** (1) Progressive teach-back on first decision; (2) Decision-time checklist of meanings; (3) Glossary drawer
- **Eval notes:** Prefer contextual over tours

### Opportunity D — Addendum impact experience

- **Problem:** T4 fail; A-12
- **Directions:** (1) Impact report after new addendum parse; (2) Side-by-side before/after obligation; (3) Forced re-review queue
- **Eval notes:** High harm prevention; feasibility depends on relationship data

### Opportunity E — IA clarification for Live Analysis / technical routes

- **Problem:** A-14, UX-R13
- **Directions:** (1) Move under Technical; (2) Rename; (3) Mode switch “Standard review / Coverage analysis”
- **Eval notes:** Tree test before shipping

### Opportunity F — Leadership packet freshness

- **Problem:** UX-R12
- **Directions:** (1) Staleness banner when decisions diverge from snapshot; (2) One-click regenerate; (3) “Briefing mode” live read-model (careful with immutability story)

### Opportunity G — Handoff packages for contributors

- **Problem:** Context loss outside app
- **Directions:** (1) Copyable assignment brief; (2) Deeper My Work detail; (3) Email integration (out of scope unless authorized)

---

## 4. Measurable outcome targets (provisional)

Targets finalize after baseline sessions. Placeholders:

| Outcome                              | Baseline source | Provisional target direction                 |
| ------------------------------------ | --------------- | -------------------------------------------- |
| Orient (T1) success                  | TBD sessions    | ≥90% correct next action without assistance  |
| Evidence consulted on accept/dispute | TBD             | ≥80% open evidence before decision           |
| Status comprehension quiz            | TBD             | ≥85% on critical terms                       |
| Critical false-certainty rate        | TBD             | Near zero on planted uncertain items         |
| Resume (T9) success                  | TBD             | Majority identify top change without hunting |

Do not treat these numbers as committed SLAs until baseline exists.
