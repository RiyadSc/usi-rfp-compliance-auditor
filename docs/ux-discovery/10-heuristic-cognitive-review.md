# Heuristic and Cognitive Review (Current Product)

**Workstream:** UX Discovery — Phase D  
**Date:** 2026-07-25  
**Method:** Expert heuristic evaluation + cognitive walkthrough against critical scenarios  
**Evidence grade:** Proxy (docs, code contracts, prior `role-based-ux-audit.md`, architecture)  
**Not:** Direct moderated usability with proposal professionals

This review evaluates the **post–role-based-ux / Evidence Intelligence** product as an implementation artifact. Prior audit findings that were remediated are marked **Addressed (verify)**; new or residual issues are marked **Open**.

---

## 1. Heuristic evaluation summary

| Heuristic                     | Assessment         | Key evidence                                                                                                     |
| ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Visibility of system state    | Mixed–Good         | Overview signals, processing pollers, mode banners; weak “what changed since last visit”                         |
| Match real-world language     | Mixed              | `business-terminology-v2` improves labels; “workspace/analysis/phase” still leak in places; Live Analysis naming |
| User control & freedom        | Good for decisions | Append-only model limits “undo”; needs clearer mental model of new decision vs edit                              |
| Consistency & standards       | Mixed              | Global 5-nav solid; opportunity nav guide says 6, runtime includes Live Analysis; brand name inconsistency       |
| Error prevention              | Good in domain     | Fail-closed uncertain; prohibited language; transition guards                                                    |
| Recognition over recall       | Mixed              | Action groups help; multi-axis still recall-heavy for novices                                                    |
| Flexibility & efficiency      | Partial            | Saved views, role density; limited power-user shortcuts                                                          |
| Aesthetic & minimalist design | N/A as visual goal | Visual redesign done; risk is false simplicity under future pressure                                             |
| Help users recover            | Mixed              | Safer empty/error copy historically state-only; some action-oriented remediation                                 |
| Help & documentation          | Partial            | Definitions exist; first-run walkthrough documented; in-product help uneven                                      |

---

## 2. Cognitive walkthrough — critical scenarios

Questions per step: Will they know what to do? See the action? Understand the result? Know what happened? Know what’s next?

### T1 Opportunity orientation

- **Path:** Home → Opportunity Overview
- **Likely success:** High for prepared demo with recommended action
- **Risk:** Returning user after days — activity list ≠ change digest
- **Verdict:** Partial pass; resume story Open (UX-R14)

### T2 Requirement verification

- **Path:** Requirements → detail → evidence/page
- **Likely success:** High if user opens detail; Med if they judge from table alone
- **Risk:** Table scanning without evidence (UX-R15)
- **Verdict:** Pass with evidence discipline; fail mode is behavioral skip

### T3 Missing-form response

- **Path:** Checklist → Blocking group → item → assign
- **Likely success:** High on Harbor City known missing forms
- **Risk:** Owner labeling; notification outside product
- **Verdict:** Pass in-product; handoff Complement Open

### T4 Addendum change

- **Path:** Documents (addendum) → precedence on requirements → checklist impact
- **Likely success:** Low–Med — superseded visible, but **downstream invalidation narrative** weak
- **Verdict:** Fail / gap relative to north star (A-12)

### T5 Proposal conflict

- **Path:** Proposal Review → finding → compare → resolve
- **Likely success:** Med–High after role-based remediation
- **Risk:** Classification literacy; wrong revision
- **Verdict:** Conditional pass — verify in baseline sessions

### T6 Company-proof need

- **Path:** Finding/checklist proof labels
- **Likely success:** Med — labels exist; easy to confuse with unsupported
- **Verdict:** Needs comprehension testing

### T7 Leadership review

- **Path:** Overview + Reports
- **Likely success:** Med–High for top issues; risk over-reading Ready
- **Verdict:** Conditional pass with trust-calibration test required

### T8 Processing failure

- **Path:** Document/analysis failed states
- **Likely success:** Med — technical detail may dominate; recovery checklist incomplete vs §56
- **Verdict:** Open

### T9 Resumption

- **Path:** My Work / Overview activity
- **Likely success:** Med for assignments; Low for “what became invalid”
- **Verdict:** Open (major opportunity area)

---

## 3. Twelve success questions — visibility audit

| #   | Question                | Currently answerable without reconstruction?    | Where                                                |
| --- | ----------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| 1   | What opportunity?       | Yes                                             | Header / overview                                    |
| 2   | What stage?             | Partial                                         | Nine-step; coarse vs real bid stage                  |
| 3   | What next?              | Yes on overview when recommended action present | Overview                                             |
| 4   | What missing?           | Partial                                         | Checklist blockers; not unified across proposal gaps |
| 5   | What blocked?           | Yes                                             | Blocker groups / readiness                           |
| 6   | What needs my judgment? | Partial                                         | Pending review filters; not a unified judgment queue |
| 7   | Assigned to me?         | Yes if assignments used                         | My Work                                              |
| 8   | Due soon?               | Partial                                         | When due_at populated                                |
| 9   | What changed?           | Weak                                            | Activity ≠ semantic change feed                      |
| 10  | Where from?             | Yes if user drills                              | Evidence/page                                        |
| 11  | How confident?          | Partial                                         | Axes exist; calibration literacy Open                |
| 12  | Review before forward?  | Partial                                         | Reports + pending human; stale snapshot risk         |

---

## 4. Information architecture assessment

**Strengths**

- Clear global vs opportunity split after role-based UX
- Opportunity-centered model matches “bid folder” metaphor for many teams (hypothesis A-08)
- Search is honest about bounds

**Weaknesses**

- Live Analysis placement vs documented six-destination model
- “Requirements” packs candidate+finding+review cognitively
- Reports duplicated globally and locally — OK if explained; easy to miss staleness
- Phase/analysis routes remain escape hatches with engineering vocabulary

**Findability hypotheses for tree testing**

1. Current opportunity-centered IA
2. Task-centered (“My judgment / My blockers / Shared files”) primary with opportunity secondary
3. Hybrid: Home = tasks; Opportunity = evidence workspace

---

## 5. Content audit (sample)

| Term                         | User may hear          | System means                 | Ambiguity | Action                                  |
| ---------------------------- | ---------------------- | ---------------------------- | --------- | --------------------------------------- |
| Backed by the RFP            | Approved               | Source support               | High      | Keep + teach at decision                |
| Task completed               | Done/compliant         | Workflow                     | High      | Pair with non-goals microcopy sparingly |
| Ready for final review       | Ship it                | Deterministic gate           | Critical  | Never escalate language                 |
| Document needs manual review | Skim later             | Parser uncertain fail-closed | High      | Elevate when blocking                   |
| Machine-generated            | Ignore / trust blindly | Needs human                  | Med       | Pair with required action               |
| Live Analysis                | Same as requirements   | Phase 9 graph                | High      | Rename or relocate after test           |
| View for: Director           | I am director          | Density preference           | Med       | Strengthen non-auth cue                 |

---

## 6. Accessibility assessment (functional)

**Present (proxy):** skip link, semantic nav, focus, labeled inputs, non-color status text, reduced-motion support, responsive containment, contributor 390px scenario in tests.

**Gaps:** No formal WCAG certification (documented assumption); no moderated sessions with assistive-tech users; cognitive load under time pressure unmeasured; dense tables may fail magnification without horizontal strategy validation on all pages.

---

## 7. Workflow review

| Issue                                                            | Severity | Notes                                             |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------- |
| Context switch requirement ↔ document page ↔ checklist           | Med      | Evidence links help; comparison tasks still split |
| Judgment work scattered across Requirements + Proposal + My Work | High     | No single “needs my judgment” spine               |
| Interruption recovery                                            | High     | Missing change digest                             |
| Dead ends                                                        | Low–Med  | Improving; processing failures still uneven       |
| Hidden dependency: checklist needs eligible verification         | Med      | Generate preconditions must stay visible          |

---

## 8. Baseline usability report status

**Formal baseline (timed tasks T1–T9 with SEQ):** Not yet run — blocked on participant/proxy sessions (see research plan).

**Proxy baseline substitutes available now:**

- `@demo-critical` Playwright path
- `@ux-director` / `@ux-proposal-manager` / `@ux-contributor` / `@ux-admin` scenarios
- Prior role-based completion gates

These prove **scripted task executability**, not **comprehension or calibrated trust**.

---

## 9. Phase D interim conclusions

1. The product is stronger as an **evidence and blocker workbench** than as an **interruption-resilient decision cockpit**.
2. Greatest UX risks are **false certainty** and **missed mandatory work**, not navigation chrome.
3. Structural alternatives should compete on: unified judgment queue, change/resume model, addendum impact, and IA placement of Live Analysis — **before** more visual polish.
4. Do not collapse axes to simplify.
