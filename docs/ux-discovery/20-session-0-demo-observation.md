# Discovery Session 0 — Prototype Demonstration Observation

**Date:** 2026-07-25  
**Research path:** Track **A** (long-term) · Immediate next USI touchpoint  
**Purpose of the meeting (business):** Credibility and stakeholder learning  
**Purpose for UX discovery:** Structured observation — **not** formal contextual inquiry

Session 0 does **not** replace Sessions 1–4. After the demo, explicitly request dedicated workflow-observation time with proposal staff.

---

## 1. Dual-objective framing

| Audience goal                                               | Discovery goal                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Show the product is real, trustworthy, and human-controlled | Observe reactions, confusion, language, trust breakpoints, workflow assumptions |
| Teach what the system does / does not claim                 | Capture vocabulary and mental-model mismatches                                  |
| Keep conversation alive toward adoption                     | Seed Session 1–4 recruitment                                                    |

**Facilitation rule:** Present for credibility. Quietly instrument observation. Do not turn the demo into a usability test mid-pitch unless stakeholders spontaneously drive.

---

## 2. Recommended demo spine (aligned to cognitive questions)

Narrate in operator language. Prefer Harbor City full-roadmap (provider-free) unless the meeting explicitly calls for FAC115 public proof.

| Beat | Show                                                      | Cognitive Q served | Watch for                            |
| ---- | --------------------------------------------------------- | ------------------ | ------------------------------------ |
| 1    | Opportunity + deadline + “what matters now”               | Q4, Q9             | Do they lean in or glaze?            |
| 2    | Exact requirement → quote → original page                 | Q6                 | Trust inflection (“ok, that’s real”) |
| 3    | Five missing mandatory forms as blockers                  | Q3, Q4             | Recognition of near-miss story       |
| 4    | Human review distinct from machine                        | Q8, HITL           | Relief vs skepticism                 |
| 5    | Draft issue beside RFP evidence + append decision         | Q7                 | “Would we use this in review?”       |
| 6    | Leadership brief / report + explicit non-submit authority | Q9, Q10            | Comfort to stop reading?             |
| 7    | (Optional) Isolation / watermark / no confidential claim  | Trust              | Security questions                   |

Follow `docs/demo-runbook.md` for mechanical steps. Prefer business labels over phase/enum names unless asked.

**Avoid in Session 0 narration:** provider, fingerprint, schema hash, extraction pipeline as hero story. Disclose technical depth only if Justin/technical stakeholders ask.

---

## 3. Observation protocol (scribe checklist)

**Before the meeting:** Confirm predictions in `31-session-0-prediction-audit.md` are locked. Do not edit Predictions during/after the demo until Results are scored separately.

Assign a scribe if possible (presenter ≠ only observer).

### 3.1 Reactions (timestamp + beat)

- Head nods / “yes” / “we’ve had that”
- Silence / checking phone (disengagement)
- Cross-talk between Kerry/Justin (who owns which concern)
- Requests to go back to a screen

### 3.2 Confusion markers

- Questions that restate what was just shown
- Mixing “approved / compliant / safe to submit” into their summary
- Asking which role view they “are”
- Looking for spreadsheet-equivalent controls
- Losing the thread between Requirements vs Checklist vs Proposal Review

### 3.3 Language capture (exact phrases)

Record verbatim when possible:

| They say | Maps to cognitive Q? | Candidate UI term |
| -------- | -------------------- | ----------------- |
| …        | …                    | …                 |

Priority phrases: miss, form, trust, AI, hallucinate, owner, ready, submit, addendum, proof, binder/matrix.

### 3.4 Trust breakpoints

Note the moment trust rises or falls:

| Moment                                        | Direction | Trigger             | Implication             |
| --------------------------------------------- | --------- | ------------------- | ----------------------- |
| e.g. opened original PDF page                 | ↑         | Exact evidence      | Keep evidence one click |
| e.g. “machine-generated” without human action | ↓?        | Ambiguous authority | Tighten HITL copy       |

Especially watch reactions to: missing forms, hallucination framing, human-in-the-loop controls, readiness language, demo/synthetic labeling.

### 3.5 Workflow assumptions (hypotheses they voice)

Examples to listen for:

- “Our matrix already does X”
- “Sales would never open this”
- “Legal has to sign off separately”
- “We’d still email the owner”
- “Addenda kill us when they drop Friday”

Code each as: **Confirmed assumption** · **New assumption** · **Contradiction** of cognitive model v1.

---

## 4. Light probes (only if natural)

Do **not** force a research script. If conversation opens:

- “Where would this break in your last bid?”
- “What would you still need to see before you’d trust a blocker list?”
- “Who in your org would live in this day to day?”

Save deep walkthroughs for Session 1.

---

## 5. Closing ask (mandatory for Track A)

Before the meeting ends, request the next step explicitly:

> “This was a product walkthrough. Separately, we’d like one working session where someone who ran a recent RFP simply walks us through how that response actually happened—documents, spreadsheet, handoffs—without us pitching. That tells us how to fit this to your process. Can we schedule that with Kerry / proposal staff?”

Also offer Sessions 2–4 as shorter follow-ups if interest is high.

---

## 6. Post-Session 0 write-up (within 24 hours)

Create `docs/ux-discovery/session-notes/session-0-YYYY-MM-DD.md` with:

1. Attendees and roles
2. Demo path used (Harbor City / FAC115 / both)
3. Reaction log
4. Confusion log
5. Verbatim language table
6. Trust breakpoints
7. Workflow assumptions
8. Score `31-session-0-prediction-audit.md` (hit / miss / partial / not tested) — do not rewrite predictions
9. Cognitive model deltas (proposed)
10. D-track / Track 2 implications (terminology, Overview priority, demotions)
11. Scheduling status for Session 1+

Update: assumption register · decision log · cognitive model (mark Session 0 evidence grade: **Stakeholder / Observed-in-demo**, not Direct contextual inquiry).

---

## 7. What Session 0 can and cannot authorize

| Can inform                         | Cannot alone authorize               |
| ---------------------------------- | ------------------------------------ |
| Terminology candidates             | Major IA rewrite as “user-validated” |
| Which demo beats build credibility | Claiming Session 1 complete          |
| Trust copy adjustments (low risk)  | Collapsing domain axes               |
| Recruitment for Sessions 1–4       | Confidential data processing         |

Product evolution may continue on D-track hypotheses and small reversible fixes; cite Session 0 as **directional evidence**, not ethnography.
