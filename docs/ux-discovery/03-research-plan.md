# Research Plan

**Workstream:** UX Discovery — Phase B  
**Date:** 2026-07-25  
**Updated:** 2026-07-25 — research path **A** long-term; **Session 0** demo first; **D-track** parallel; B/C deferred  
**Principle:** Choose methods for questions. Do not run methods for ceremony.  
**Operational detail:** `18-usi-discovery-sprint.md`, `20-session-0-demo-observation.md`  
**Primary design artifact:** `16-proposal-manager-cognitive-model.md`  
**Evolution policy:** `23-product-evolution-guidance.md` (do not block Tier 1/2 on Session 1)

---

## 1. Research questions

### RQ-Product fit

1. What jobs are proposal teams hiring this product to do versus spreadsheets and PDF review?
2. Which stages of the 19-stage bid journey should the product own, support, or stay out of?

### RQ-Orientation

3. Can a returning user answer the twelve success questions without reconstructing state across pages?
4. What signals define “what matters now” for directors vs proposal managers vs contributors?

### RQ-Trust & comprehension

5. Do users correctly interpret support / precedence / proof / human-review / readiness / blocked?
6. Do users over-trust machine assessments or under-use available evidence?

### RQ-IA & workflow

7. Which structural model best predicts findability: opportunity-centered, task-centered, or hybrid?
8. Where do context switches and memory burdens force errors?

### RQ-Collaboration

9. How do handoffs work today, and what context must travel with an assignment?
10. How do users resume after interruption, addenda, or new proposal revisions?

---

## 2. Participants and recruitment

### Preferred path A — USI structured discovery sprint (first)

| Session | Segment                                                    | n   | Method                       | Rationale                        |
| ------- | ---------------------------------------------------------- | --- | ---------------------------- | -------------------------------- |
| 1       | Proposal Manager (Kerry ops lens or designee)              | 1   | Contextual inquiry — no demo | Cognitive model + tool ecosystem |
| 2       | Proposal Director                                          | 1   | Decision criteria interview  | Executive UX / Q9                |
| 3       | SME / contributor                                          | 1   | Handoff interview            | Assignment context               |
| 4       | Leadership / sponsor (Justin innovation lens + bid review) | 1   | One-screen briefing exercise | True dashboard                   |

Expand beyond four only if themes conflict. Full protocol: `18-usi-discovery-sprint.md`.

Stakeholder seeds already in hand (Kerry/Justin): prior AI attempt, hallucinations, near-miss on missed forms, trust > automation, scale-not-replace, human-in-the-loop. Grade: **Stakeholder evidence**.

### Fallback if USI unavailable

**Path D only** — continue IA, journey/task decomposition, state modeling, interruption recovery, terminology, progressive disclosure, low-fi structure. **Do not** substitute B/C proxy users as primary validation at this stage.

**Exclusion:** Do not use confidential live bids. Synthetic/public fixtures only unless written authorization exists.

---

## 3. Methods by question

| Question cluster           | Method                                                                                          | Why this method                        | Materials                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| Jobs / journey ownership   | Stakeholder + PM interviews (45–60m); artifact review of anonymized matrix templates if allowed | Reveals circumstances and alternatives | Interview guide; journey stage cards               |
| Fear / priority ranking    | Closed card sort of failure modes                                                               | Prioritizes harm prevention            | Failure-mode cards                                 |
| Orientation (12 questions) | Moderated usability on current app + Harbor City                                                | Baseline measurement                   | Task script; success key                           |
| Status comprehension       | Comprehension test (forced choice + teach-back)                                                 | Detects false simplicity               | Status glossary quiz                               |
| Trust calibration          | Scenario judgments with evidence available                                                      | Measures over/under trust              | Planted supported / uncertain / contradicted items |
| IA                         | Open card sort of objects → Tree test of 2–3 nav models                                         | Structure before screens               | Card set; tree prototypes                          |
| Addendum / resume          | Cognitive walkthrough + later mid-fi prototype                                                  | High-risk interruption path            | Scenario packet                                    |
| Accessibility              | Inclusive sessions (keyboard, magnification) + existing automated checks                        | Beyond checklist                       | Critical path scripts                              |

**Not preferred initially:** unmoderated remote tests with dense multi-axis UI (too easy to mis-measure); large surveys before interview themes stabilize.

---

## 4. Critical task set (baseline)

Use Harbor City prepared demo (provider-free) unless a public fixture is authorized.

| ID  | Scenario                 | Success criteria                                         |
| --- | ------------------------ | -------------------------------------------------------- |
| T1  | Opportunity orientation  | Correct stage, top risks, next action within time box    |
| T2  | Requirement verification | Locate exact quote/page; correct support interpretation  |
| T3  | Missing-form response    | Identify blocker, why required, assign/track             |
| T4  | Addendum change          | Identify what changed and affected work (may expose gap) |
| T5  | Proposal conflict        | Compare claim vs source; record human decision           |
| T6  | Company-proof need       | Distinguish proof need from contradiction                |
| T7  | Leadership review        | Readiness story without technical jargon                 |
| T8  | Processing failure       | Explain preserved vs affected; recovery action           |
| T9  | Resumption               | After interruption script, state what changed / remains  |

---

## 5. Metrics framework (baseline instruments)

| Dimension           | Measures                                                            | Instruments                     |
| ------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Effectiveness       | Task success, critical errors, missed blockers, correct next action | Binary success + error taxonomy |
| Efficiency          | Time to orient, time to evidence, resume time                       | Timer                           |
| Learnability        | First-use success; assistance requests                              | Count; SEQ after each task      |
| Trust               | Confidence vs correctness; evidence opened yes/no                   | Calibration plot; behavior log  |
| Satisfaction / load | Perceived ease; workload on dense review tasks                      | SEQ; optional NASA-TLX on T2/T5 |
| Comprehension       | Status/glossary accuracy                                            | Quiz score                      |

**Vanity metrics avoided:** page views, raw click counts without task context.

**Privacy:** No logging of proposal/RFP body text in analytics. Use event names and object types only if instrumentation is added later.

---

## 6. Data handling

- Record sessions only with consent; store securely; minimize retention.
- Prefer synthetic fixture content on screen share.
- Do not export private storage objects outside authorized environments.
- Anonymize quotes in notes; no PII beyond role and org type.

---

## 7. Analysis method

1. Affinity map themes (jobs, pains, trust, IA, handoffs).
2. Decision inventory update from observed decisions.
3. Mental-model mismatch table (user phrase ↔ system concept).
4. Opportunity-solution tree from outcomes, not features.
5. Assumption register status updates with evidence citations.

**Bias controls:** Separate facilitator vs notetaker when possible; pre-register success keys; avoid leading “do you like”; include failed hypotheses in decision log; distinguish frequency vs severity.

---

## 8. Decision criteria (gates)

| Gate                                       | Proceed when                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline complete                          | T1–T9 attempted with ≥5 representative or proxy sessions; metrics recorded                                                                  |
| Concept selection                          | ≥2 structural alternatives tested on IA findability + orientation tasks; preferred model wins on effectiveness without violating invariants |
| Implementation of major IA/workflow change | Authorization §65 checklist satisfied                                                                                                       |
| Small reversible fixes                     | Clear issue, low risk, no domain behavior change — may proceed earlier                                                                      |

---

## 9. Immediate research track (no user access yet)

Until participants are scheduled, continue with:

1. Current-state journey + service blueprint from docs/UI (**Proxy / Stakeholder**).
2. Heuristic + cognitive walkthrough of current app on Harbor City (**Proxy**).
3. Content audit of terminology and status teach-back keys.
4. IA inventory and findability hypotheses for card sort decks.
5. Decision inventory draft from UI controls + domain RPCs.

Label all outputs accordingly. Do not present proxy findings as direct user evidence.

---

## 10. Sample rationale

n≈12–15 across segments balances coverage with demo-stage cost. Saturation for jobs/IA themes is more important than statistical significance. Trust-calibration and comprehension can reuse the same sessions with structured probes.
