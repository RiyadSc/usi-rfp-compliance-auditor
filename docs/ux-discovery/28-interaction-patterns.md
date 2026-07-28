# Interaction Patterns for Engineering

**Date:** 2026-07-25  
**Track:** 2 — documentation for implementation partnership  
**Constraint:** Preserve multi-axis semantics, RLS, append-only decisions, prohibited language.

---

## Pattern P1 — Decision with proof

**When:** Accept / dispute / waive / resolve / complete-with-artifact

**Required UI:**

1. Decision control
2. Exact proof (quote/page) or explicit “can’t prove yet” within same view
3. One-line **non-meaning** (“Does not authorize submission / does not mean compliant”)
4. Reason/note when policy requires
5. Success = append-only confirmation, not overwrite

**A11y:** label decision purpose; status via text not color alone.

---

## Pattern P2 — Level-1 attention strip

**When:** Overview, Home opportunity cards, resume modules

**Order:**

1. Blockers / elimination risks
2. Deadline risk
3. Pending human judgment
4. Proof/company evidence needed
5. Then secondary metrics

**Never lead with:** pipeline stage, hash, provider, completion % alone.

---

## Pattern P3 — Snapshot freshness

**When:** Any immutable briefing/report

**Rule:** If any material human decision (requirement review, proposal resolution, waiver finalization) has `created_at` **after** `generated_at`, show warning:

> This briefing is older than newer team decisions. Create a new briefing before leadership review.

CTA → generate/list reports. Do not mutate the old snapshot.

---

## Pattern P4 — Wait / failure

**Eight answers:** what happened · preserved · affected · user can do · system will do · human review needed? · can work continue? · how to get help

Directors see plain language; technical detail in disclosure.

---

## Pattern P5 — Evidence drill

From any Level 1/2 obligation or finding: one action to quote + original page. Return path preserves context (back to same item).

---

## Pattern P6 — Non-authority readiness

Any “ready for leadership review” / checklist complete copy must sit beside residual blockers/judgment OR explicit “human submission decision is outside this system.”
