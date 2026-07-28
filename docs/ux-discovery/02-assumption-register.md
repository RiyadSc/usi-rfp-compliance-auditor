# Assumption Register

**Workstream:** UX Discovery — Phase B  
**Date:** 2026-07-25  
**Status legend:** Known · Observed · Reported · Inferred · Unverified · Contradicted

Classification keys: **Business impact** / **User impact** / **Uncertainty** / **Cost of being wrong** → Priority P0–P3.

---

## Priority P0 (validate early)

| ID    | Assumption                                                                                                      | Source grade                                        | Confidence                                 | Impact                               | Validation method                                    | Status                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ |
| A-01  | Primary daily operator is a proposal manager (or equivalent), not a director                                    | Stakeholder PRD · Kerry ops signal · Proxy UX audit | Med                                        | High / High / High / High            | USI Session 1 contextual inquiry                     | Reported (Kerry lens); Unverified ethnographically                 |
| A-01b | Prior AI RFP tooling failed via hallucination and missed forms; trust now dominates                             | Kerry/Justin meeting (stakeholder)                  | High as reported                           | Critical / Critical / Low / Critical | Session 1 critical-incident probe                    | Reported                                                           |
| A-01c | USI wants human-in-the-loop scale, not replacement                                                              | Kerry/Justin meeting                                | High as reported                           | High / High / Low / High             | Sessions 1–4 language coding                         | Reported                                                           |
| A-02  | Directors enter infrequently and need orientation + top risks + next action in &lt;30s without technical detail | Stakeholder · Prior UX success criterion            | Med                                        | High / High / Med / High             | Timed director tasks; comprehension test             | Reported (product intent); Unverified with real directors          |
| A-03  | Users currently build compliance matrices in spreadsheets and will compare the product to that mental model     | Domain practice · Designer inference                | Med                                        | High / High / Med / High             | Artifact review; contextual inquiry                  | Inferred                                                           |
| A-04  | The most feared failure is missing a mandatory form / deadline / addendum change                                | Stakeholder thesis · Domain                         | High as business risk; Med as user ranking | High / High / Med / Critical         | Critical-incident interviews; risk ranking card sort | Reported (business); Unverified (user ranking)                     |
| A-05  | Users will over-trust “Backed by the RFP” / readiness language without evidence discipline                      | Security T8 · Risk R-21 · Proxy                     | Med–High                                   | Critical / Critical / Med / Critical | Trust-calibration tests                              | Inferred (threat model); Unverified empirically                    |
| A-06  | Multi-axis status (support / precedence / proof / human) is cognitively necessary but currently hard to learn   | Proxy audit “High” on requirements/checklist        | Med                                        | High / High / Med / High             | Comprehension testing; first-use success             | Observed (UI density debt historically); learning curve Unverified |
| A-07  | Cross-opportunity “My Work” matches how contributors receive work (vs email/Teams assignment)                   | Proxy completion report                             | Low                                        | Med / High / High / Med              | Contributor interviews; handoff mapping              | Unverified                                                         |
| A-08  | Opportunity-centered navigation is the correct primary IA                                                       | Prior UX decision D-080 era                         | Med                                        | High / High / High / High            | Card sort + tree test vs task-centered alternative   | Inferred (implemented); not competitively validated                |

---

## Priority P1

| ID   | Assumption                                                                         | Source grade               | Confidence | Impact                   | Validation method                                                          | Status                                                                  |
| ---- | ---------------------------------------------------------------------------------- | -------------------------- | ---------- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A-09 | Nine-step guided workflow matches how PMs sequence real bids                       | Proxy UX guide             | Low–Med    | Med / Med / High / Med   | Journey interviews; sequence ranking                                       | Unverified                                                              |
| A-10 | “Submission Checklist” is the right user label for Phase 5 workflow objects        | Terminology v2             | Med        | Med / Med / Med / Med    | Label comprehension; preference vs “Compliance matrix” / “Submission plan” | Unverified                                                              |
| A-11 | Proposal Review should be revision-first, not run-first                            | Prior audit remediation    | Med        | Med / High / Med / Med   | First-click + scenario test                                                | Observed as prior debt; fix Unverified with users                       |
| A-12 | Addendum changes are among the highest interruption/resume failures                | Domain · Risk R2/R41       | Med–High   | High / High / Med / High | Addendum scenario walkthrough                                              | Inferred                                                                |
| A-13 | Search is secondary; browsing + saved views dominate for experts                   | Domain · Search scope note | Med        | Med / Med / Med / Low    | Observe browse vs search in tests                                          | Inferred                                                                |
| A-14 | Live Analysis (Phase 9) in primary opportunity nav confuses the core journey       | Proxy IA inconsistency     | Med        | Med / Med / Med / Med    | First-click; IA tree test                                                  | Inferred                                                                |
| A-15 | Role-view selector is understood as “view for,” not permissions                    | Risk R36 · UI copy         | Med        | High / Med / Med / High  | Comprehension probe                                                        | Unverified                                                              |
| A-16 | Evidence one click away is necessary for trust and is currently adequate when used | PRD UX principles · Proxy  | Med–High   | High / High / Low / High | Evidence-locate tasks                                                      | Partially Observed in demo-critical tests; trust calibration Unverified |

---

## Priority P2

| ID   | Assumption                                                                                    | Source grade                     | Confidence | Impact                 | Validation method                   | Status                                        |
| ---- | --------------------------------------------------------------------------------------------- | -------------------------------- | ---------- | ---------------------- | ----------------------------------- | --------------------------------------------- |
| A-17 | Users will use the product alongside Word, email, shared drives; it will not replace drafting | PRD non-goals · Domain           | High       | Med / Med / Low / Low  | Ecosystem mapping                   | Known (product scope); boundary UX Unverified |
| A-18 | Executive reports are consumed as HTML/print, not live app deep-dives                         | Phase 7 assumptions              | Med        | Med / Med / Med / Med  | Director interview                  | Inferred                                      |
| A-19 | Assignment without real display names reduces contributor adoption                            | Risk R35                         | Med        | Med / Med / Low / Med  | Preference test when profiles exist | Known limitation                              |
| A-20 | Empty/error states that only describe state (not next action) slow recovery                   | Prior audit                      | Med        | Med / Med / Low / Med  | Error recovery scenarios            | Observed (audit); outcomes Unverified         |
| A-21 | First-run needs guided task + evidence demo more than a product tour                          | UX guide walkthrough             | Med        | Med / High / Med / Med | First-use A/B concept test          | Inferred                                      |
| A-22 | Dense tables beat cards for requirement comparison                                            | Prior remediation kept 7 columns | Med        | Med / High / Med / Med | Comparison task prototype           | Inferred                                      |

---

## Priority P3

| ID   | Assumption                                                                         | Source grade     | Confidence                         | Impact                 | Validation method            | Status                                      |
| ---- | ---------------------------------------------------------------------------------- | ---------------- | ---------------------------------- | ---------------------- | ---------------------------- | ------------------------------------------- |
| A-23 | Brand naming inconsistency (Response Hub vs Compliance Auditor) harms learnability | Proxy            | Low                                | Low / Low / Med / Low  | Naming preference            | Observed inconsistency                      |
| A-24 | Reduced-motion / keyboard users can complete critical paths                        | Repo a11y checks | Med for checks; Low for WCAG claim | Med / High / Med / Med | Inclusive usability sessions | Proxy (automated); not formal certification |

---

## Users — who they are / what they do (compressed)

| Topic                         | Current best statement                                                  | Status                |
| ----------------------------- | ----------------------------------------------------------------------- | --------------------- |
| Who users are                 | USI proposal/sales, compliance, ops/finance, executives; demo operators | Reported              |
| What they do                  | Review RFPs, build matrices, assign work, audit drafts, gate readiness  | Reported              |
| What is difficult             | Volume, addenda, missing forms, unsupported claims, coordination        | Reported / Inferred   |
| What they trust               | Exact quotes, page refs, original PDF, human sign-off                   | Stakeholder           |
| What they remember            | Owners, due dates, open blockers, “why we decided X”                    | Inferred              |
| Current tools                 | Spreadsheets, Word, PDF, email/Teams, shared drives                     | Domain / Inferred     |
| Error causes                  | Missed addendum, wrong version, over-trust AI, incomplete handoff       | Domain / Threat model |
| Delay causes                  | Waiting on SMEs, artifact collection, review cycles, parse failures     | Inferred              |
| Delegate vs review personally | Directors delegate detail; PMs own matrix; SMEs own sections            | Inferred              |
| Fear of getting wrong         | Non-responsive bid / protest risk / internal blame                      | Domain / Inferred     |

---

## Explicitly contradicted or constrained

| Item                                     | Note                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| “AI can approve submission”              | Contradicted by product policy                       |
| “Role view authorizes actions”           | Contradicted by D-080 / security model               |
| “Workflow complete = source supported”   | Contradicted by multi-axis model                     |
| “Current UX IA is proven with end users” | Not established; prior work used proxy/persona tests |

---

## Next validation batch (recommended)

1. A-01, A-02, A-04 — role frequency and fear ranking (interviews)
2. A-05, A-06 — trust + axis comprehension (moderated tasks on Harbor City fixture)
3. A-08, A-14 — IA alternatives (card sort / tree test)
4. A-12 — addendum change scenario (cognitive walkthrough + prototype later)
