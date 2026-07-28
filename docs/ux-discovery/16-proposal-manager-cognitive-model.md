# Proposal Manager Cognitive Model

**Workstream:** UX Discovery — required artifact  
**Date:** 2026-07-25  
**Status:** Draft v1 — stakeholder-seeded; **Session 0** will add observed-in-demo evidence; **Session 1** required to claim Direct contextual inquiry validation  
**This is not a persona and not a journey map.** It is the sequence of questions a proposal operator asks while moving a bid from intake to leadership trust.

### Evidence timeline

| Stage                  | What updates this model                                   |
| ---------------------- | --------------------------------------------------------- |
| Now                    | Kerry/Justin seeds + domain inference                     |
| Session 0 (demo)       | Language, trust breakpoints, confusion — directional only |
| Session 1 (watch work) | Order, tools, fears — revise spine                        |
| Sessions 2–4           | Director/SME/leadership overlays                          |

---

## 1. Why this artifact exists

Enterprise proposal software fails when screens mirror engineering objects (parse, extract, verify, register, findings) instead of the questions operators are already asking.

**Design rule:** Every primary surface must help answer at least one question in this model. If it does not, it is a candidate for removal, demotion, or progressive disclosure.

---

## 2. Stakeholder seeds (Kerry / Justin meeting)

**Evidence grade:** Stakeholder evidence (reported from USI conversation; full transcript not in repo). Treat as high-priority signals, not validated ethnography.

| Signal                                                       | Implication for cognitive model                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Kerry lives in proposal operations and sales                 | Primary daily cognition is operational, not innovation theater            |
| Justin focuses on innovation / internal tooling              | Secondary sponsor lens: scalability, trust, adoption                      |
| Already tried AI-assisted RFP review                         | Prior alternative exists; switching requires beating lived failure        |
| Experienced hallucinations                                   | Trust/calibration questions dominate automation desire                    |
| Nearly submitted incomplete proposal because AI missed forms | “What is mandatory?” and “Did we miss anything?” are existential          |
| Care more about trust than automation                        | Evidence and human control > speed features                               |
| Scale people, don’t replace them                             | Coordination and judgment support, not autonomous submit                  |
| Explicit human-in-the-loop                                   | Human decision nodes are first-class, not afterthoughts                   |
| Liked core idea enough to continue                           | Problem–solution fit hypothesis is alive; UX must not reintroduce AI risk |

**User mental language (target):**  
Did we miss anything? · Can I trust this? · What’s left? · Who’s waiting on me? · Why is this blocked? · Can we submit?

**Not user language:** parsing · verification · provider · extraction · audit run · requirement register · proposal findings (as primary vocabulary)

---

## 3. The cognitive spine

```text
Incoming RFP
    ↓
Can we bid?                          ← capture / qualification (often outside product)
    ↓
What changed?                        ← addenda, revisions, reassignments
    ↓
What is mandatory?                   ← forms, dates, signatures, must-haves
    ↓
What will eliminate us?              ← blockers, non-negotiables, fatal gaps
    ↓
Who owns each piece?                 ← assignment, waiting-on
    ↓
Where is proof?                      ← source quote/page + company artifacts
    ↓
Is the proposal actually answering?  ← draft vs RFP
    ↓
What is still risky?                 ← uncertainty, disputes, accepted risk
    ↓
Can leadership trust this?           ← briefing packet, residual judgment
    ↓
Submit                               ← human authority only; product never answers “yes, safe”
```

### Parallel loops (not strictly linear)

Real work is interrupt-driven. Operators re-enter the spine at:

- **What changed?** after meetings, addenda, new draft versions
- **Who owns each piece?** after handoffs stall
- **Where is proof?** at every acceptance / waiver / resolution
- **What is still risky?** before any leadership touchpoint

The product must support **re-entry**, not only first-pass flow.

---

## 4. Question cards (detail)

### Q0 — Incoming RFP

- **Progress sought:** Something exists and is trackable
- **Fear:** Losing the package or working the wrong version
- **Product role:** Support (opportunity identity, document set)
- **Anti-pattern:** Forcing pipeline jargon at intake

### Q1 — Can we bid?

- **Progress sought:** Qualification decision
- **Usually outside product** (capacity, past performance, strategy)
- **Product role:** Out of scope / light support later via risk signals
- **Anti-pattern:** Fake go/no-go AI score

### Q2 — What changed?

- **Progress sought:** Know delta since last session / last addendum / last draft
- **Fear:** Working obsolete instructions
- **Product role:** Own (addendum precedence + change digest — currently weak)
- **Success signal:** Operator names what invalidated downstream work

### Q3 — What is mandatory?

- **Progress sought:** Complete set of must-dos with source
- **Fear:** Missing a form (Kerry/Justin near-miss)
- **Product role:** Own
- **Success signal:** Mandatory set explained with evidence, not model confidence

### Q4 — What will eliminate us?

- **Progress sought:** Fatal gaps first
- **Fear:** False confidence from “mostly done”
- **Product role:** Own (blockers dominant)
- **Success signal:** Elimination risks visually and cognitively first

### Q5 — Who owns each piece?

- **Progress sought:** Clear waiting-on; no orphan work
- **Fear:** “I thought you had it”
- **Product role:** Support (assignment + My Work; notifications often outside)
- **Success signal:** Owner + due + why, without UUID theater

### Q6 — Where is proof?

- **Progress sought:** Exact source and/or company artifact
- **Fear:** Hallucinated obligation; wrong certificate
- **Product role:** Own (evidence at judgment)
- **Success signal:** Decision cannot feel “done” without proof path or explicit uncertainty

### Q7 — Is the proposal actually answering?

- **Progress sought:** Draft responds to obligations; conflicts surfaced
- **Fear:** Unsupported claims shipping
- **Product role:** Own (proposal review)
- **Success signal:** Classification in human language (missing / conflicts / needs company proof)

### Q8 — What is still risky?

- **Progress sought:** Residual uncertainty inventory
- **Fear:** Unknown unknowns
- **Product role:** Own
- **Success signal:** Uncertain / disputed / waived / stale report are visible and distinct

### Q9 — Can leadership trust this?

- **Progress sought:** Briefing without drowning in pipeline
- **Fear:** Looking overconfident or unprepared
- **Product role:** Own (executive composition)
- **Success signal:** One-screen briefing answers readiness, gaps, owners, residual judgment — never “safe to submit”

### Q10 — Submit

- **Progress sought:** Human authorization outside system claim
- **Product role:** Explicit non-authority; support package assembly tracking only
- **Anti-pattern:** Green “submit” system status

---

## 5. Cognitive work types mapped to questions

| Cognitive work    | Primary questions |
| ----------------- | ----------------- |
| Scan / triage     | Q2, Q4, Q8        |
| Compare           | Q6, Q7            |
| Remember / resume | Q2, Q5            |
| Prioritize        | Q3, Q4            |
| Verify            | Q6                |
| Coordinate        | Q5                |
| Calibrate trust   | Q6, Q8, Q9        |
| Decide under risk | Q4, Q8, Q10       |

---

## 6. Screen fitness rule

For each primary route/surface, score:

| Score     | Meaning                                         |
| --------- | ----------------------------------------------- |
| Primary   | Directly answers the question as main job       |
| Secondary | Helps if user already knows where to look       |
| Weak      | Data exists but question is hard to answer      |
| Absent    | Question not supported                          |
| Harmful   | Encourages wrong answer (e.g., false certainty) |

Surfaces that are only Secondary/Weak for all spine questions should be demoted (Technical / More / progressive disclosure).

---

## 7. Validation plan for this model

**Session 1 (Proposal Manager) — do not demo software.**  
Prompt: “Walk me through the last RFP you responded to.”

Observe whether their narrative hits these questions, in what order, which they skip, which they obsess over, and what tools appear at each step.

**Update rules after Session 1:**

- Add missing questions they actually ask
- Remove or demote questions they never ask
- Reorder if their spine differs
- Capture exact vocabulary for content model

Until then, this model is **Inferred + Stakeholder-seeded**, not Direct user evidence.

**Companion backbone:** Ranked decisions and the 2-minute resume yardstick live in `24-decision-confidence-map.md`. Attention order lives in `25-information-value-hierarchy.md`. Keep the triad cross-linked when any document changes.
