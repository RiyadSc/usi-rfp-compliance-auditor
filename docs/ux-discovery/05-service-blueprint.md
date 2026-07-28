# Service Blueprint

**Workstream:** UX Discovery — Phase C  
**Date:** 2026-07-25  
**Evidence:** Architecture docs · domain packages · security model · Proxy UI

---

## Frontstage (what users see)

| Touchpoint           | User intent                 | Visible states                                             |
| -------------------- | --------------------------- | ---------------------------------------------------------- |
| Sign-in              | Enter protected demo        | Auth error (generic)                                       |
| Home / Opportunities | Choose what needs attention | Attention queue, portfolio buckets, demos/drafts collapsed |
| My Work              | Act on assignments          | Due, workflow, proof needs                                 |
| Search               | Find authorized objects     | Grouped substring results                                  |
| Overview             | Orient + next action        | Readiness signals, top issues, nine-step journey           |
| Documents            | Complete source set         | Purpose groups, processing, upload                         |
| Requirements         | Judge obligations           | Multi-axis statuses, saved views, evidence                 |
| Requirement detail   | Verify source               | Quote, page, contradictions, human controls                |
| Checklist            | Coordinate submission work  | Action groups, blockers, generate                          |
| Checklist item       | Complete one obligation     | Next action, artifact, waiver                              |
| Proposal Review      | Assess draft vs RFP         | Revision/issues, findings, resolutions                     |
| Reports              | Leadership / audit package  | Snapshot meaning, export/download                          |
| Live Analysis        | Phase 9 coverage path       | Separate graph; human review pending                       |
| Demo                 | Rehearse known answers      | Cached/fallback labels                                     |
| Errors / empty       | Recover                     | Variable action guidance quality                           |

---

## Backstage (what the system does)

| Frontstage moment            | Backstage                                                           | Supporting systems              |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Upload                       | Intent → signed upload → finalize (magic/size/hash) → enqueue parse | Storage, Postgres, pg-boss      |
| Processing panel             | Parser adapters → pages/tables/warnings → normalize/index           | `@usi/documents`, jobs          |
| Start extraction             | Analysis run → model or mock → candidates immutable                 | Model gateway / MockProvider    |
| Verification                 | Retrieval + Pass A/B + deterministic rules → findings               | pgvector/FTS, fingerprint gates |
| Human review control         | Append `human_review_decisions` + audit event                       | SECURITY DEFINER RPC            |
| Generate checklist           | Eligibility → items/blockers/readiness snapshot                     | Deterministic Phase 5 engines   |
| Workflow / artifact / waiver | Transition guards; append history                                   | Checklist RPCs                  |
| Start proposal audit         | Segment claims → match → findings                                   | Phase 6 engines                 |
| Resolve finding              | Append resolution                                                   | RPC                             |
| Generate report              | Bind Phase 4–6 chain → immutable snapshot                           | Phase 7                         |
| Export                       | Private object + 300s grant                                         | Storage; no URL persistence     |
| Demo reset                   | Presentation state only                                             | Phase 8 scope hashes            |
| Live Analysis                | Coverage ledger → planned tasks → findings                          | Phase 9; budget reservation     |

---

## Line of visibility — what to show users

| Backstage detail               | Show when                            | Hide by default                      |
| ------------------------------ | ------------------------------------ | ------------------------------------ |
| Job/stage progress             | Affects whether work can continue    | Raw stage enum soup for directors    |
| Parser warnings                | Affects confidence in absence claims | Low-level PDF.js internals           |
| Model/provider/fingerprint     | Technical reviewer / incident        | Executive default view               |
| Exact quote + page             | Always at judgment                   | —                                    |
| Input hashes / schema versions | Audit / technical disclosure         | Business views                       |
| Spend / rate limits            | Before/when blocked                  | Continuous cost telemetry in PM path |
| Cache / fallback mode          | Always if active (honesty)           | Implementation of cache keys         |

---

## Critical blueprint moments

### Wait states

Parse · extract · verify · checklist generate · proposal audit · report generate · Phase 9 tasks · export grant countdown.

**UX need:** progress, what’s safe to do meanwhile, what becomes available next.

### Failure states

Upload reject · parse fail · budget · rate limit · unauthorized · stale snapshot · expired grant · partial large-doc unit failure.

**UX need:** eight-question recovery pattern (authorization §56).

### Handoff states

Owner assigned · ready_for_review · company evidence needed · human review pending · report ready for leadership.

**UX need:** ownership ≠ approval authority; context travels with task.

### Irreversible / append-only moments

Machine findings · report snapshots · human decisions · export generation numbers · demo reset (non-destructive to findings).

**UX need:** language of “new decision / new revision / new report,” not “edit the AI.”

---

## Failure points (service)

| #   | Failure                              | Frontstage risk          | Control                               |
| --- | ------------------------------------ | ------------------------ | ------------------------------------- |
| F1  | Incomplete source package            | False confidence         | Document purpose gaps; readiness caps |
| F2  | Parser uncertain treated as absence  | Missed obligation        | Fail-closed uncertain state           |
| F3  | Automation bias                      | Premature acceptance     | Evidence gate; separate human axis    |
| F4  | Superseded treated as active         | Wrong obligation         | Precedence visibility                 |
| F5  | Workflow complete ≈ compliant        | Submission error         | Copy + axis separation                |
| F6  | Stale report used in meeting         | Wrong leadership picture | Snapshot time + regenerate            |
| F7  | Cross-workspace leakage              | Security incident        | RLS (non-negotiable)                  |
| F8  | Live Analysis confused with register | Split mental model       | IA placement / labeling               |

---

## Blueprint summary diagram

```text
[User actions]
  upload / review / assign / resolve / export
        │
[Frontstage UI]
  evidence · statuses · queues · reports
        │
[Application API / RPCs]
  authorize · validate · append decisions
        │
[Workers + deterministic engines]
  parse · extract · verify · checklist · audit · report
        │
[Supabase Postgres + Storage + Auth]
  RLS · private objects · audit_events
        │
[Model gateway — restricted]
  Mock default · fingerprinted live only when authorized
```
