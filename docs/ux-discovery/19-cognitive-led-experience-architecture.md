# Cognitive-Model-Led Experience Architecture (Draft)

**Date:** 2026-07-25  
**Status:** Design hypothesis guiding Tier 1/2 evolution · Major IA still prefers Session 1+ · Session 0 will refine language/priority  
**Basis:** Cognitive model v1 + gap map + Kerry/Justin trust signals  
**Parallel track:** D — continue refining; do not block product evolution on Session 1

---

## 1. Organizing principle

Navigation and page priority follow the cognitive spine, not the pipeline.

```text
Eliminate us → What changed → Mandatory + proof → Waiting on → Draft fit → Leadership trust
```

**Attention order** follows the Information Value Hierarchy (`25-…`): Level 1 before Level 2 before Level 3; Level 4 never competes in the first viewport.

Engineering stages remain backstage.

**Screen litmus:** If removing a screen makes no important decision harder, demote or remove it.

---

## 2. Proposed information architecture (hypothesis — Alt 1 evolved toward cognition)

### Global

- **Home** — personal re-entry: waiting on me, eliminating risks across bids, what changed
- **Opportunities** — portfolio
- **Briefings** (rename from global Reports if Session 4 confirms) — leadership packets
- **Search** — findability helper

### Inside an opportunity (question-labeled, stable routes underneath)

| Nav label (user language) | Cognitive Q    | Underlying capability         |
| ------------------------- | -------------- | ----------------------------- |
| Overview                  | Q2, Q4, Q8, Q9 | Decision cockpit              |
| What’s required           | Q3, Q6         | Requirements + evidence       |
| What’s left to submit     | Q4, Q5         | Checklist / blockers / owners |
| Draft vs RFP              | Q7, Q8         | Proposal review               |
| Files                     | Q0, Q2         | Documents / addenda           |
| Briefing                  | Q9             | Reports                       |

**Demoted:** Live Analysis, analysis runs, fingerprints → **Technical details** disclosure.

---

## 3. Overview composition (answers Session 4 hypothesis early)

One screen should answer, in **Level 1 → Level 2** order (`25-…`):

1. What will eliminate us? (max 3)
2. What changed since last meaningful event?
3. What’s left that is mandatory / blocked?
4. Who are we waiting on?
5. What still needs human judgment?
6. Can leadership trust this _yet_? (readiness + residual — never submit authority)

No pipeline stage strip as the hero. Nine-step guide becomes optional “How we work” disclosure (Level 3/4). Level 4 technical metadata stays collapsed.

---

## 4. Interruption recovery pattern

On return (Home or Overview):

```text
Since you were away
· Addendum / document changes
· New draft revision
· Decisions still pending that are yours
· Blockers newly opened or still open
```

This is the structural fix for Q2 weakness — may need a read-model; document as backend recommendation if validated.

---

## 5. Decision-time pattern (Q6)

Any accept / dispute / waive / resolve / complete-with-artifact control appears with:

- Exact proof (quote/page) or explicit “cannot prove yet”
- One-line meaning of the decision (what it does **not** mean)
- Next consequential action

---

## 6. Terminology shift (content model seed)

Prefer cognitive verbs/nouns in UI chrome; keep technical terms in Technical disclosure and audit exports.

| Prefer                            | Avoid as primary                         |
| --------------------------------- | ---------------------------------------- |
| What’s required                   | Requirement register                     |
| What’s left to submit             | Checklist generation run                 |
| Draft vs RFP                      | Proposal audit run                       |
| Needs a person                    | Machine assessment only                  |
| Can’t prove from the document yet | Parser uncertain (except technical view) |
| Ready for leadership review       | Ready / compliant / safe to submit       |

---

## 7. Relation to concept alternatives

- This draft is **Alternative 1 evolved** (opportunity workbench) with cognitive labeling.
- If Session 1 shows operators live in personal queues more than bid folders, pivot toward **Alternative 2** (judgment-first) without abandoning evidence workspaces.
- **Alternative 4** (matrix) remains a mid-fi experiment for Q3 comparison after PM vocabulary is known.
- **Alternative 3** (wizard-primary) still rejected.

---

## 8. What we will not do before stronger evidence

- Claim major IA as “USI-validated” from Session 0 alone
- Collapse status axes
- Add autonomous submit affordances
- Use confidential USI RFPs in the product

## 9. What we may do in parallel (non-blocking)

See `23-product-evolution-guidance.md` Tier 1/2: terminology, Overview priority, decision microcopy, staleness cues, reversible presentation improvements.
