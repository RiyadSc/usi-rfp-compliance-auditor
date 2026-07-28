# DX0 — Executive Demo Experience Optimization

**Status:** Active temporary workstream  
**Audience:** Kerry, Justin, first-time stakeholders  
**Not:** Final production UX · Not a replacement for Track 1–4 discovery

---

## Charter

The next objective is **not** production UX. It is **demo UX**.

Optimize the application for a first-time stakeholder seeing the product for the first time.

The goal is **not** to permanently redesign the application. The goal is to maximize **comprehension, trust, and perceived product maturity** during a **30–45 minute guided demonstration**.

Any DX0 change must either:

1. be **production-worthy** and survive after validation, **or**
2. be explicitly marked **`demo-only`** and removable.

During DX0, optimize for first impression, orientation, narrative flow, and stakeholder understanding **without compromising** the longer-term UX discovery process, Evidence Budget, Decision Confidence Map, or change gates for structural work.

---

## North star (DX0 only)

> **Can Kerry understand the product in the first five minutes?**

Not: Can a proposal manager work all day?

---

## Success criteria

1. A first-time stakeholder understands the product’s purpose within **60 seconds**.
2. Every transition advances a **coherent story**.
3. Every screen has **one primary message**.
4. The demo requires **minimal explanation** (assume presenter speaks as little as possible).
5. Trust is reinforced through **evidence**, not claims.
6. The product appears coherent, intentional, and operationally mature.
7. **No DX0 change** may compromise the evidence-led UX roadmap or bypass existing change gates for Tier 3 structure.

---

## Optimize for

| Focus                     | Question                                                                       |
| ------------------------- | ------------------------------------------------------------------------------ |
| Demo narrative            | Why am I looking at this? (before What can I do?)                              |
| Orientation               | Opportunity · status · in trouble? · look next — without narration             |
| Reveal sequence           | Overview → Requirement → Evidence → Checklist → Proposal → Executive readiness |
| Demo language             | Operator language; no engineering hero copy                                    |
| Eliminate “what is this?” | Every card must earn care                                                      |
| Demo density              | One obvious takeaway per screen                                                |
| Empty states              | Intentional, never placeholder-looking                                         |
| Polish                    | Alignment, spacing, terminology, loading, overflow, icons, buttons             |

---

## Reveal sequence (story, not final IA)

```text
Overview
  → Requirement (one obligation)
  → Evidence (exact quote + page)
  → Checklist (what’s missing / blocking)
  → Proposal review (draft vs RFP)
  → Executive readiness (briefing)
```

Documents and Live Analysis are supporting beats only if asked — not the spine of the Kerry/Justin story unless the meeting is FAC115-proof oriented.

---

## Change classes

| Class             | Tag             | Rule                                                               |
| ----------------- | --------------- | ------------------------------------------------------------------ |
| Production-worthy | `dx0-prod`      | Passes three questions + Evidence Budget; stays after demo         |
| Demo-only         | `dx0-demo-only` | Marked in code/docs; removable; never claimed as user-validated IA |

**Still held (not DX0):** fundamental nav redesign, object hierarchy change, lifecycle rewrite, axis collapse.

Soft nav **label** or **order** tweaks that match the story may ship as `dx0-prod` only if they also serve Decision/IVH rules; otherwise `dx0-demo-only`.

---

## Relation to other tracks

| Track                   | Continues?                                               |
| ----------------------- | -------------------------------------------------------- |
| 1 Session 0 observation | Yes — DX0 prepares the surface; Session 0 still observes |
| 2 Safe UX               | Yes — DX0 prefers overlapping with Track 2               |
| 3 Research              | Unchanged                                                |
| 4 Eng/deploy            | DX0 ships through normal test gates                      |

Prediction audit (`31-…`) still locked before demo feedback.

---

## Deliverables

- `32-dx0-charter.md` (this file)
- `33-dx0-screen-story-audit.md`
- `34-dx0-change-log.md`
- Updated demo runbook section for DX0 minimal-narration path
