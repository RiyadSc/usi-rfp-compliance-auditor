# Interruption and State Model (D-track)

**Date:** 2026-07-25  
**Status:** Working draft · Informs Overview/Home evolution · Backend needs flagged separately  
**Cognitive anchor:** Q2 What changed? · Q5 Who owns? · Q8 Still risky?

---

## 1. Problem

RFP work is interruption-heavy. The current product shows activity and statuses but does not reliably answer:

> “I was away. What changed, what is still mine, and what became invalid?”

---

## 2. User-facing state families

Keep separate; never merge into one traffic light.

| Family         | Examples                                              | User question                     |
| -------------- | ----------------------------------------------------- | --------------------------------- |
| Processing     | uploading, parsing, failed, retryable, partial        | Can I review yet?                 |
| Source truth   | backed, partial, not found, conflict, can’t prove yet | Is the obligation real?           |
| Precedence     | current, replaced, conflicting                        | Which instruction controls?       |
| Proof          | none, company doc, confirmation, external             | What evidence do we owe?          |
| Human judgment | needs a person, accepted, disputed, follow-up, waived | Has a human decided?              |
| Workflow       | not started → completed, blocked                      | Is the task moving?               |
| Artifact       | missing, linked, pending review, reviewed             | Is the file attached/ok?          |
| Proposal issue | open, in review, resolved, accepted risk, obsolete    | Is the draft risk closed?         |
| Briefing       | current snapshot, stale vs decisions, revoked grant   | Can leadership trust this packet? |
| Mode           | prepared demo, cached, fallback, live-restricted      | How should I interpret this?      |

---

## 3. Resume card (target pattern)

On Home and Opportunity Overview, a first-viewport module:

### Since you were away

- **Changes:** new/replaced documents, addenda, new draft revision, regenerated submission list, new briefing
- **Still blocking:** count + top 3 elimination risks
- **Waiting on you:** assigned items needing action
- **Needs judgment:** pending human assessments / open draft decisions
- **Briefing freshness:** up to date | decisions since last briefing → create new

If no prior visit marker exists: “Start here” using same priority order (blockers → judgment → due → files).

**Implementation note:** Visit markers and semantic change events may require a read-model. Until backend exists, approximate with: recent audit events + open blockers + My Work + latest report timestamp vs latest human decision timestamp (document as eng recommendation).

---

## 4. Invalidation rules (experience)

| Event                         | Downstream UX effect                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| New addendum parsed           | Flag Q2; mark precedence-impacted obligations for re-review; do not silent-delete history |
| New proposal revision         | Prior audit remains historical; prompt review of new revision                             |
| Human decision after briefing | Mark briefing stale; CTA create new briefing                                              |
| Checklist regenerate          | Preserve human fields; show obsolete machine items as superseded structure                |
| Parse failure on one file     | Show affected file; allow work on ready files; don’t imply full-package readiness         |

---

## 5. Wait-state communication

While processing:

1. What is running (plain language)
2. What you can do meanwhile
3. What will unlock when finished
4. How failure will look

Directors: one sentence. Technical disclosure: stage detail.

---

## 6. Evolution without Session 1

Allowed as D-track / small reversible product steps when engineering capacity exists:

1. Overview module ordering toward blockers → judgment → due (presentation only)
2. Staleness cue when human decisions newer than report snapshot
3. Demote Live Analysis from primary stage emphasis in copy/nav presentation if low risk
4. Decision-time microcopy (“does not mean compliant”)

Requires separate eng note / §65 if route IA or data contracts change materially.
