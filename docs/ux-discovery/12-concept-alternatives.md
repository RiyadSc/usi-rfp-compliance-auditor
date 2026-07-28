# Concept Alternatives (Phase F — Structural)

**Workstream:** UX Discovery — Phase F  
**Date:** 2026-07-25  
**Status:** Concepts only — **not authorized for implementation** until gates in authorization §65 and research validation

No high-fidelity screens. Structure and sequencing only.

---

## Evaluation criteria

User impact · evidence strength · complexity · domain risk · architecture impact · reversibility · testability

---

## Alternative 1 — Opportunity workbench (evolve current)

**Idea:** Keep opportunity-centered IA. Strengthen Overview as decision cockpit; keep object nav (Requirements, Checklist, Proposal, Documents, Reports).

**Changes vs today (conceptual)**

- Add “Needs judgment” and “What changed” modules on Overview
- Relocate Live Analysis out of primary stage nav
- Stronger staleness on Reports
- Contextual axis literacy at decision controls

**Pros:** Lowest migration cost; matches prior role-based investment; reversible  
**Cons:** May not fix scattered judgment; still object-browsing heavy  
**Recommendation lean:** Strong default if research confirms A-08

## Alternative 2 — Judgment-first hybrid

**Idea:** Primary spine is queues: **Needs my judgment · Blockers · Due · Assigned · Changes**. Opportunity pages become evidence workspaces opened from a queue item.

**Pros:** Matches interruption-heavy work; answers Q3–Q9 directly  
**Cons:** Higher IA change; risk of hiding provenance hierarchy; more engineering for cross-object queues  
**Domain risk:** Low if queues are projections  
**Test:** Tree test + T1/T9

## Alternative 3 — Process-guided rail (wizard-ish)

**Idea:** Nine-step workflow becomes the primary navigation; object pages are steps.

**Pros:** Learnability for novices; clear sequencing  
**Cons:** Frustrates experts; real bids are parallel not linear; local optimization risk  
**Recommendation lean:** Reject as primary; keep as optional guided overlay

## Alternative 4 — Matrix-native metaphor

**Idea:** Center UX on a compliance-matrix surface (rows = obligations, columns = source / owner / artifact / draft status / decision) with drawers for evidence.

**Pros:** Matches spreadsheet mental model (A-03); comparison-friendly  
**Cons:** Hard on mobile; risk of over-compressing axes into columns; engineering heavy  
**Test:** Mid-fi with PM comparison tasks before committing

---

## Cross-cutting concept choices (orthogonal)

| Question | Options                                  | Tentative lean (hypothesis)                                 |
| -------- | ---------------------------------------- | ----------------------------------------------------------- |
| Landing  | Universal Home vs role landings          | Universal Home + density preference (avoids auth confusion) |
| Evidence | Embedded vs dedicated evidence workspace | Embedded at judgment + full page available                  |
| Review   | Central review queue vs in-context only  | Hybrid: queue entry → in-context decide                     |
| Director | Separate app mode vs same IA filtered    | Same IA, stricter progressive disclosure                    |

---

## What will be prototyped first (plan)

1. Low-fi IA trees for Alternatives 1, 2, and 4 (not 3 as primary)
2. Overview modules for judgment + changes (Alt 1 enhancement)
3. Addendum impact sketch (Opportunity D)
4. Comprehension panels for axis literacy (Opportunity C)

Hardest/riskiest first: **resume/change**, **addendum impact**, **judgment spine**, **trust calibration** — not login polish.

---

## Implementation gate reminder

No production IA rewrite until: problem documented · evidence · alternatives considered · risks · concept tested · semantics preserved · engineering feasibility · metrics defined.
