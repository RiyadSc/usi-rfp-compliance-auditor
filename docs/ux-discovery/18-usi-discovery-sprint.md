# USI Structured Discovery Sprint

**Research path:** **A** (USI) — long-term strategy  
**Immediate next touchpoint:** **Session 0** — prototype demonstration (credibility + observation)  
**Parallel:** **D-track** — experience architecture, terminology, cognitive-model refinement (non-blocking)  
**Fallback if dedicated observation cannot be scheduled after demo:** continue **D** (not B/C proxies as primary)

**Date:** 2026-07-25  
**Updated:** 2026-07-25 — sequencing adjusted for business reality (demo before contextual inquiry)  
**Principle:** Cognitive and operational risk > technical risk. Formal Session 1 remains watch-work-first **without** a pitch demo. Session 0 is a different animal: a stakeholder demo that we instrument for learning.

---

## 0. Sequencing (business reality)

```text
Session 0  →  USI prototype demo (credibility / learning)
     ↓
Request Sessions 1–4 (dedicated workflow observation)
     ↓
Session 1  →  Proposal Manager contextual inquiry (no product pitch)
Session 2  →  Director sign-off criteria
Session 3  →  SME handoff context
Session 4  →  Leadership one-screen briefing
```

**Parallel always:** D-track specs + Tier 1/2 product evolution (`23-product-evolution-guidance.md`).  
**Do not** freeze product evolution waiting for Session 1.

Session 0 protocol: `20-session-0-demo-observation.md`.

---

## 1. Sprint goal

Validate and revise the Proposal Manager Cognitive Model, capture director/SME/leadership decision criteria, and produce evidence for IA and workflow changes.

Major structural IA still prefers Session 1+ evidence (§65). Tier 1/2 evolution may proceed in parallel under `23-…`.

**Out of sprint scope:** Live confidential RFP processing, provider enablement, substituting B/C proxies for USI observation.

---

## 2. Participant map (from Kerry / Justin signals)

| Session                | Likely fit                                                  | Role in sprint                                     |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| **0 Demo observation** | Kerry, Justin, attendees at prototype meeting               | Credibility demo + reaction/language/trust capture |
| 1 Proposal Manager     | Kerry (proposal ops / sales) or designee who runs responses | Contextual inquiry — spine of cognitive model      |
| 2 Proposal Director    | Director-level readiness owner                              | Sign-off criteria → executive UX                   |
| 3 SME / contributor    | Ops, insurance, staffing, or section owner                  | Handoff context package                            |
| 4 Leadership           | Sponsor / innovation (Justin lens) + bid-review attendee    | One-screen briefing requirements                   |

Complete **Session 0**, then recruit **Sessions 1–4**. Expand only if themes conflict.

---

## 3. Session protocols

### Session 0 — Prototype demonstration (next meeting)

**Business objective:** Credibility and stakeholder learning.  
**Discovery objective:** Observe reactions, confusion, language, trust breakpoints, workflow assumptions.  
**Not:** Formal contextual inquiry; not a substitute for Session 1.

Full protocol and closing ask: `20-session-0-demo-observation.md`.  
Operational demo steps: `docs/demo-runbook.md`.

---

### Session 1 — Proposal Manager (60–90 min)

**Do not demo/pitch the software.** (Distinct from Session 0.)

Opening:

> “Walk me through the last RFP you responded to.”

Observe and note (do not interrupt for features):

| Observe                     | Why                             |
| --------------------------- | ------------------------------- |
| Where they stop             | Friction / fear                 |
| Documents opened            | Source-of-truth hierarchy       |
| Tabs / windows              | Parallel cognition / tool stack |
| Spreadsheets                | Matrix mental model             |
| Highlights / prints         | Externalized memory             |
| What scares them            | Q4 elimination fears            |
| When they stop trusting AI  | Trust calibration triggers      |
| When they ask another human | Human-in-the-loop moments       |

Optional probes (only after narrative):

- “When did you know something was mandatory?”
- “Tell me about a time AI or a tool almost caused a miss.”
- “How do you know you’re looking at the latest addendum?”

**Outputs:** Revised cognitive spine; vocabulary list; tool ecosystem map; critical incidents.

**Data rules:** No confidential USI documents copied into this repo or demo env without written authorization. Prefer redacted process discussion or public examples.

---

### Session 2 — Proposal Director (45–60 min)

Not “Would you use this?”

Ask:

1. How do you know a proposal is actually ready?
2. What information do you personally need before signing off?
3. What makes you delay submission?
4. What would make you comfortable enough to stop reading?

**Outputs:** Leadership trust checklist → maps to Q9; defines Overview/Report content priority.

---

### Session 3 — SME (45 min)

Ask:

1. What context do you need before writing your section?
2. How do you know you’ve answered correctly?
3. What information is missing when somebody assigns you work?

**Outputs:** Assignment brief minimum fields; My Work / handoff requirements.

---

### Session 4 — Leadership (30–45 min)

Ask:

> “If I only gave you one screen before a bid review meeting, what absolutely has to be on it?”

Optional: card-rank candidate elements (blockers, owners, due dates, uncertainty, evidence links, cost, AI confidence — expect confidence to rank low).

**Outputs:** True dashboard definition; kill list for vanity metrics.

---

## 4. After each session

1. Update `16-proposal-manager-cognitive-model.md` (or director/SME supplements).
2. Update assumption register statuses (A-01–A-08 especially).
3. Log decisions in `13-decision-log.md`.
4. **Do not** jump to UI implementation from a single quote.

---

## 5. Only after Sessions 1–2: moderated product tasks

Introduce Harbor City (synthetic) for T1–T9 from `14-validation-kit.md` **after** cognitive model is revised from observation.

Reason: Watching work first prevents leading them into our IA.

---

## 6. Fallback (if Session 1+ cannot be scheduled after demo)

Continue **D-track** and Tier 1/2 product evolution.  
**Do not** substitute B/C proxy users as primary validation at this stage.  
Session 0 notes remain directional stakeholder/observed-in-demo evidence only.

---

## 7. Scheduling ask (internal)

Request to USI sponsors:

> Four short discovery conversations (PM walkthrough, Director sign-off criteria, SME handoff, Leadership one-screen). No confidential uploads required for the first round. We will not pitch features; we will watch how you already work.
