# Validation Kit — Phase G Materials

**Workstream:** UX Discovery — Phase G preparation  
**Date:** 2026-07-25  
**Use:** Moderated sessions with real users or labeled proxies. Synthetic/public fixtures only.

---

## 1. Session script (75 minutes)

### Intro (5)

- Purpose: improve decision support, not grade the person
- Consent / recording
- Think aloud
- Reminder: fixture is synthetic/public demo data

### Part A — Current product baseline (40)

Harbor City prepared opportunity (or authorized public fixture).

**Optional cold-start (2 min):** Before tasks, run the resume probe from `25-information-value-hierarchy.md` §3 (what changed / still risky / needs judgment / leadership review / where is proof). Time it.

| Task | Prompt (non-leading)                                                                               | Success key                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | “You’ve been away two days. Figure out the state of this opportunity and what you should do next.” | Names opportunity; identifies blocker or judgment item; states a next action aligned with overview recommendation or equivalent correct action |
| T2   | “Find whether the mandatory insurance requirement is backed by the RFP and show me the source.”    | Opens evidence; correct page/quote; does not call it ‘approved’                                                                                |
| T3   | “A mandatory form is missing. Show how you’d handle it.”                                           | Finds blocking item; explains why; assigns or describes assignment                                                                             |
| T5   | “Review a proposal issue that conflicts with the RFP and record a decision.”                       | Opens finding; compares; records resolution with reason                                                                                        |
| T6   | “Find something that needs company documentation rather than a contradiction.”                     | Correct classification teach-back                                                                                                              |
| T7   | “Prepare to brief a director in one minute.”                                                       | Top risks + readiness caveat without ‘compliant/safe to submit’                                                                                |
| T9   | Interrupt mid-T3 with a meeting script; return: “What changed and what’s left for you?”            | Residual work + any stated changes (may expose gap)                                                                                            |

After each task: Single Ease Question (1–7).

### Part B — Comprehension quiz (10)

See §3. No product open.

### Part C — Concept preference (15)

Show two IA trees (Alt 1 vs Alt 2) as labeled outlines. First-click / “where would you go to…” probes. Do not ask which looks prettier.

### Debrief (5)

- What felt safest?
- What would you still keep in a spreadsheet?
- Where could this mislead someone?

---

## 2. Tree-test / first-click tasks

**Trees**

**Tree A — Opportunity workbench (current-evolved)**

- Home
- Opportunities
- My Work
- Reports
- Search
- [Opportunity]
  - Overview (includes Needs judgment, What changed)
  - Requirements
  - Submission Checklist
  - Proposal Review
  - Documents
  - Reports
  - More → Live / technical analysis

**Tree B — Judgment-first hybrid**

- Home (queues: Judgment, Blockers, Due, Changes)
- My Work
- Opportunities
- Reports
- Search
- [Opportunity evidence workspace]
  - Obligations
  - Submission work
  - Draft issues
  - Files
  - Briefings

**Probes**

1. Accept a machine assessment on a requirement
2. See what an addendum invalidated
3. Find work assigned to you across bids
4. Download leadership briefing
5. Investigate a failed document parse

Record first click path and success.

---

## 3. Comprehension test (critical terms)

Forced choice + one-line teach-back. Correct keys:

| Term                         | Correct meaning (short)                                               | Common wrong answer       |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------- |
| Backed by the RFP            | Active source evidence supports the obligation; human review separate | Legally approved          |
| Task completed               | Checklist workflow finished                                           | Bid is compliant          |
| Ready for final review       | Deterministic readiness gate for human leadership review              | Safe to submit            |
| Document needs manual review | Parser uncertain — do not treat as absence                            | Low priority skim         |
| Company document needed      | Proof/artifact axis                                                   | Same as unsupported claim |
| Replaced by an addendum      | Precedence superseded                                                 | Deleted / ignore forever  |
| Machine-generated            | Assessment awaiting human decision                                    | Final truth               |
| Blocked                      | Deterministic workflow blocker                                        | Model confidence low      |
| Team review pending          | No human decision yet                                                 | Nobody owns it            |
| Conflicts with the RFP       | Contradiction classification                                          | Missing form              |

Score ≥85% provisional target after baseline.

---

## 4. Trust-calibration probes

Present three planted items (fixture-backed):

1. Strong exact support
2. Parser uncertain
3. Requires company artifact

Ask: “How sure are you this is settled?” (0–100) and “What would you do next?”  
Success: high confidence only on (1); explicit next human action on (2)(3); evidence opened.

---

## 5. Observer checklist

- [ ] Opened evidence before consequential decision?
- [ ] Used prohibited language?
- [ ] Confused role view with permissions?
- [ ] Navigated to Live Analysis unintentionally?
- [ ] Backtracked count
- [ ] Assistance requests
- [ ] Critical error (missed blocker, wrong revision, false certainty)

---

## 6. Proxy protocol (if no USI participants)

Use domain proxies (proposal managers from other orgs) or internal trained reviewers. Prefix all notes: `Proxy evidence`. Do not publish as USI user research.
