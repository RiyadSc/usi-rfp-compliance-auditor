# Product Evolution Guidance (Non-Blocking)

**Date:** 2026-07-25  
**Updated:** 2026-07-25 — CEO filter: no “nice UX” without friction or high-confidence decisions; do not batch-ship Tier 1  
**Policy:** Track **A** remains the long-term research strategy. **Do not block product evolution** waiting for formal Session 1. Sequence research to business reality (Session 0 demo first).  
**Backbone:** `24-decision-confidence-map.md` · Cognitive model `16-…`

---

## 0. Implementation filter (required)

> Nothing should be implemented simply because it seems like good UX.  
> It should either **remove a documented friction point** or **support a Highest / Very high / High decision** on the Decision Confidence Map.

Also measure against the north-star moment and the Information Value Hierarchy (`25-…`):

> After three days away, &lt;2 minutes to know what changed, what is still risky, what needs judgment, and where the proof is — then resume.

**Screen litmus** (before adding or keeping UI):

> If we removed this screen entirely, what important decision would become harder to make?

**Do not** implement every Tier 1 candidate as a batch. Each change needs a decision card (see `24-…` §6).

---

## 1. Sequencing

```text
Demo (Session 0)
        ↓
Observe reactions (labeled evidence grades)
        ↓
Ask for access
        ↓
Formal workflow observation (Sessions 1–4)
        ↓
Major IA decisions
```

Parallel tracks (`26-parallel-tracks-and-change-gate.md`):

```text
Track 1 Session 0 → observe → request 1–4
Track 2 Safe UX (filter + three questions)
Track 3 Research / validation
Track 4 Eng → test → deploy
```

**Three questions every change:** Which decision? What evidence? How will we know?

**Hold:** nav, IA, object hierarchy, lifecycle, primary workflows, mental-model replacement, major dashboards.

Track 2 ships: `29-track2-change-log.md`.

### Tier 1 — Eligible when filter passes (reversible, low domain risk)

Presentation-only candidates (not an automatic backlog):

- Overview/Home information priority (blockers, judgment, due) — supports D09 + resume moment
- Decision-time microcopy clarifying non-compliance meaning — supports D01, D05, D14
- Report/briefing staleness messaging — supports D09, D16
- Label/copy toward operator language — only where it serves mapped decisions
- Error/empty recovery copy — only for documented recovery friction
- Progressive disclosure of technical metadata — reduces extraneous load on D05/D09

**Gate:** Implementation filter card + invariants + prohibited language + tests. No RLS/provider/semantics change.  
**Hold:** Do not ship the whole list “because Tier 1.”

### Tier 2 — Design now, implement with light eng review

- Resume / “Since you were away” using existing audit + assignment queries
- Nav label experiments behind clear routes (same destinations)
- Demoting Live Analysis visually/informationally without deleting capability
- Assignment brief fields in checklist item UI

**Gate:** Feasibility note; no destructive migration; §65 lite (problem, risk, metrics).

### Tier 3 — Requires Session 0+ directional evidence and explicit authorization

- Renaming global IA (Reports → Briefings) as default
- Judgment-first hybrid IA (Alt 2)
- New backend change-digest / invalidation graph
- Matrix-native primary surface
- Any axis collapse or new authority model

**Gate:** Full authorization §65; prefer Session 1 observation for Alt 2/matrix.

---

## 3. Evidence grades for shipping claims

| Claim                          | Minimum evidence                                   |
| ------------------------------ | -------------------------------------------------- |
| “Improves credibility in demo” | Session 0 reactions or rehearsal                   |
| “Matches how USI works”        | Session 1+ contextual inquiry                      |
| “Validated IA”                 | Tree/task test after model revision                |
| “Safe presentation tweak”      | Invariant/tests + designer inference OK if labeled |

Never market Tier 1 copy tweaks as completed user research.

---

## 4. Parallel ownership

| Stream                 | Owner focus                  | Cadence          |
| ---------------------- | ---------------------------- | ---------------- |
| Session 0 prep/observe | Presenter + scribe           | Next USI meeting |
| D-track specs          | UX discovery corpus          | Continuous       |
| Tier 1/2 product work  | Engineering + UX partnership | Unblocked        |
| Session 1+ scheduling  | Sponsor relationship         | After demo ask   |

---

## 5. Immediate D-track backlog (docs first; selective Tier 1)

1. Keep Decision Confidence Map current (`24-…`)
2. Session 0 scribe + 24h write-up
3. Complete implementation cards **before** any Tier 1 code
4. Prefer at most one eligible Tier 1 change at a time if shipping
5. Post-demo: revise cognitive model + decision rankings from notes
