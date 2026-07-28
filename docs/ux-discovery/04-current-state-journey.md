# Current-State Journey Map

**Workstream:** UX Discovery — Phase C  
**Date:** 2026-07-25  
**Evidence:** Stakeholder (PRD journeys) · Domain (public RFP practice) · Proxy (app workflows, role-based UX) · Designer inference (labeled)

This map covers the bid lifecycle **without** and **with** the product. The product should not own every stage.

Legend for product fit: **Own** · **Support** · **Complement** · **Out of scope**

---

## Stage catalogue

### 1. Opportunity received

- **Actors:** Capture / sales lead
- **Goal:** Know a solicitation exists and is worth tracking
- **Without product:** Email, portal alerts, CRM
- **With product:** Create opportunity (workspace) if pursuing
- **Fit:** Support (identity + deadline fields)
- **Pain:** Draft workspaces without customer/deadline clutter portfolio (R37)
- **Emotion:** Urgency / triage pressure

### 2. Initial qualification

- **Actors:** Capture, leadership
- **Goal:** Bid / no-bid
- **Tools outside:** Win themes, capacity, past performance
- **Fit:** Out of scope / light Support (document set later informs risk)
- **Inference:** Product must not pretend to own capture strategy

### 3. Solicitation package gathered

- **Actors:** PM / coordinator
- **Goal:** Complete source set (RFP, addenda, attachments)
- **With product:** Documents by purpose; guided upload
- **Fit:** Own (ingestion + provenance)
- **Wait:** Parse/processing
- **Risk:** Incomplete package → false readiness

### 4. RFP reviewed

- **Actors:** PM, SMEs
- **Goal:** Understand obligations
- **Without:** Print, PDF markup, shared notes
- **With:** Requirements register + evidence viewer
- **Fit:** Own (evidence-led reading aid)
- **Pain:** Volume; multi-axis status learning cost (A-06)

### 5. Addenda identified

- **Actors:** PM
- **Goal:** Know what changed and what still controls
- **With product:** Precedence axis; superseded visibility
- **Fit:** Own (precedence) · Support (downstream invalidation UX — hypothesized gap)
- **Risk:** Treating superseded as active (R2)

### 6. Requirements extracted

- **Actors:** System + human review
- **Goal:** Trustworthy requirement set
- **With product:** Candidates → verification → human decisions
- **Fit:** Own
- **Misunderstand:** Candidates mistaken for confirmed requirements

### 7. Compliance matrix created

- **Actors:** PM
- **Without:** Spreadsheet matrix
- **With:** Requirements + checklist generation
- **Fit:** Own/Support — **mental-model bridge critical** (A-03)
- **Pain:** Spreadsheet habits vs multi-object system model

### 8. Mandatory forms identified

- **Actors:** PM
- **With product:** Checklist categories; missing-form blockers (demo known answers)
- **Fit:** Own
- **Fear:** Missed form (A-04)

### 9. Owners assigned

- **Actors:** PM → contributors
- **With product:** Checklist owner assignment; My Work queue
- **Fit:** Support
- **Gap:** Display names / profiles (R35); email/Teams still primary notification (inferred)

### 10. Questions and deadlines tracked

- **Actors:** PM
- **With product:** Due dates when deterministic; ambiguity remains unresolved rather than guessed
- **Fit:** Support
- **Outside:** Q&A portals, calendars

### 11. Proposal outline created

- **Fit:** Complement / Out of scope (not a writer)

### 12. Proposal content developed

- **Fit:** Out of scope (drafting tools remain Word etc.)

### 13. Supporting evidence collected

- **Actors:** Contributors, ops, finance, HR
- **With product:** Artifact link + review states; company-proof findings
- **Fit:** Support
- **Risk:** Wrong artifact linked (R-22)

### 14. Proposal draft reviewed

- **Actors:** PM, reviewers
- **With product:** Proposal Review (Phase 6)
- **Fit:** Own (audit)
- **Need:** Side-by-side evidence (prior High debt; remediated in role-based UX — validate)

### 15. Issues corrected

- **Actors:** Authors + reviewers
- **With product:** Finding resolutions append-only; new revision = new audit
- **Fit:** Support
- **Risk:** Wrong revision reviewed

### 16. Leadership review performed

- **Actors:** Director / executive
- **With product:** Overview + Reports
- **Fit:** Own (readiness narrative)
- **Success:** &lt;30s orientation (prior criterion)

### 17. Final submission package assembled

- **Fit:** Complement — checklist tracks items; packaging often outside

### 18. Submission decision made

- **Actors:** Authorized humans
- **With product:** Explicitly **not** authorized by system; “Prepare final human review”
- **Fit:** Support (information only)

### 19. Records retained

- **With product:** Audit events, snapshots, exports with retention policy
- **Fit:** Own (provenance) · Support (enterprise records mgmt outside)

---

## Journey with product (compressed happy path)

```text
Create opportunity
→ Upload RFP/addenda
→ Wait: parse
→ Extract + verify (wait)
→ Human review requirements (decide)
→ Generate checklist
→ Assign / complete / attach (coordinate)
→ Upload proposal draft
→ Audit (wait)
→ Resolve findings (decide)
→ Generate report snapshot
→ Leadership review
→ Human submission decision (outside authority of app)
```

## Journey pain themes (synthesis)

| Theme                    | Stages  | Severity | Evidence                              |
| ------------------------ | ------- | -------- | ------------------------------------- |
| State reconstruction     | 4–16    | High     | Authorization success Qs; prior audit |
| Axis literacy            | 6–8, 14 | High     | A-06; T8 automation bias              |
| Wait ambiguity           | 3–4, 14 | Med      | Processing UI history                 |
| Handoff context loss     | 9–13    | High     | Inferred + My Work proxy              |
| Version / addendum drift | 5, 15   | Critical | R2, R41, R-32                         |
| False completion         | 8–18    | Critical | R-21, prohibited language             |

## Greatest product value concentration

**Own/high-value:** source package integrity, evidence-backed requirements, mandatory submission tracking, proposal inconsistency detection, readiness reporting with provenance.

**Stay out / light touch:** bid/no-bid strategy, prose drafting, enterprise DMS, legal opinion, submission portal execution.
