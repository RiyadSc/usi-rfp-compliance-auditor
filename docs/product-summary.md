# Product Summary — AI RFP Compliance Auditor (Demo)

Condensed from `USI_AI_RFP_Compliance_Auditor_PRD.md` (v1.0, 2026-07-16). This summary must not silently narrow the PRD; when in doubt, consult the source sections cited.

## Thesis (PRD §1–2)

USI does not need another proposal writer. It needs a **verification layer** that proves what a source RFP requires, detects missing submission items, and flags unsupported claims before a bid is submitted. North-star: a reviewer can answer "Are we missing anything, and can every critical output be traced to the source?" in minutes.

The product is **decision support**, never an autonomous writer, and must never claim a submission is legally compliant or safe to submit.

## Users (PRD §4)

- Proposal/sales lead — upload docs, review requirements, assign owners, manage checklist.
- Compliance reviewer — validate citations, classify risks, approve critical requirements.
- Operations contributor — confirm staffing/transition/supervision/training/site obligations.
- Finance/insurance reviewer — validate pricing, insurance thresholds, bonds; mark exceptions.
- Executive approver — readiness report, final gate.
- Demo operator — presents with synthetic/public data only.

## Demo scope: Must have (P0) (PRD §5.1)

| Epic | Capability |
|---|---|
| Document ingestion | Upload primary RFP + addenda + supporting files; parse pages; preserve source metadata |
| Requirements register | Structured obligations: category, mandatory status, deadline, source quote, page, section, confidence |
| Evidence viewer | Open exact source page from any requirement; highlight supporting text |
| Submission checklist | Forms, signatures, acknowledgments, insurance, attachments, events, unresolved items |
| Draft compliance audit | Flag unsupported claims, contradictions, missing responses, uncited assertions |
| Readiness report | Blockers, warnings, human approvals, exportable summary |

P1: audit log, assignment/status. Should-have (§5.2): addendum comparison, bulk filters, dedup/cross-reference, CSV + PDF/Word export, known-answer test mode. Later/pilot (§5.3): content library, integrations, collaboration, copilots, analytics.

## Non-goals (PRD §3.4)

No autonomous submission, no final legal/insurance/pricing/staffing decisions, no replacing reviewers, no production USI integrations, no confidential USI documents without written authorization, no guarantee of finding every requirement.

## User journeys (PRD §6)

- **A — Analyze a new RFP:** create workspace → upload RFP/addenda (status, page count, parse warnings) → pipeline extracts requirements → filter mandatory, open requirement, see source page + highlighted text → confirm/edit/reject/expert-review → checklist with missing forms/signatures/deadlines/acknowledgments → export or continue.
- **B — Audit a proposal draft:** upload/paste draft → segment into claims/sections → match claims against RFP + approved references → flag unsupported/contradicted/missing/human-proof → reviewer opens source and records resolution → readiness updates only after critical blockers resolved or explicitly accepted by an authorized reviewer.
- **C — Executive readiness review:** one-page summary; critical blockers first; drill into evidence; status stays "Not ready" until all mandatory gates approved or exception documented.

## Functional requirements (PRD §7) — abbreviated

FR-001 workspace creation · FR-002 PDF+DOCX upload w/ name, size, hash, page count, parse status · FR-003 addenda grouping/order (P1) · FR-004 page-preserving parsing (text, tables, anchors, parser confidence) · FR-005 structured extraction (type, description, mandatory, deadline, function, quote, page, section, confidence) · FR-006 requirement statuses: unreviewed/confirmed/rejected/exception/not_applicable/superseded · FR-007 source navigation · FR-008 no requirement shown verified without evidence · FR-009 checklist categories (forms, signatures, attachments, insurance, bonds, pricing, meetings, deadlines, acknowledgments) · FR-010 blocker detection (missing mandatory, expired deadlines, unacknowledged addenda, unresolved conflicts) · FR-011 draft upload/parse · FR-012 claim classification: supported/partially_supported/unsupported/contradicted/requires_human_proof · FR-013 cross-document isolation to active workspace · FR-014 human decision capture (accept/correct/reject/comment/assign/waive + rationale) · FR-015 readiness from mandatory completeness + human approval rules, not model confidence · FR-016 CSV + readiness summary export (P1) · FR-017 audit history (P1) · FR-018 re-analysis preserving run history (P1).

## Business rules (PRD §8)

- BR-01 Mandatory item not complete without linked artifact/response or documented exception.
- BR-02 No AI-extracted requirement is "confirmed" until a human approves it.
- BR-03 Every verified requirement has source document ID, page number, quote/anchor.
- BR-04 Unsupported/contradicted claims are warnings/blockers by severity; never silently rewritten.
- BR-05 Distinguish "not found" from "not required."
- BR-06 Addenda take precedence; conflicts shown explicitly.
- BR-07 Readiness never 100% with critical parse errors, unresolved mandatory items, or unreviewed blockers.
- BR-08 Model confidence is advisory; deterministic checks + human approval govern final status.
- BR-09 Never transmit real confidential USI data without approved environment/authorization.
- BR-10 Disclose outputs are decision support, not legal/insurance/contractual advice.

## Reliability targets for demo (PRD §8.1)

| Measure | Target |
|---|---|
| Known mandatory form recall | 100% on curated fixture (10 known forms) |
| Citation validity | 100% for displayed verified findings |
| Unsupported-claim detection | ≥90% on curated draft |
| False critical requirements | 0 in prepared demo |
| Analysis completion | < 3 minutes for prepared set |
| Demo stability | 3 consecutive successful rehearsals |

## Prepared fixture (PRD §10.1)

- Synthetic/public security-services RFP, ~35–60 pages.
- Two addenda; one changes a deadline and adds a required acknowledgment.
- Ten known mandatory submission forms; **five intentionally omitted** from the draft package.
- Draft response with **three unsupported claims**, **two contradictory staffing statements**, **one incorrect insurance threshold**.
- Known-answer file for internal testing only.

## Demo flow (~5 min) (PRD §10.2)

Dashboard → documents/analysis → requirements register + click mandatory form (page-level evidence) → checklist reveals 5 missing forms → draft audit findings (unsupported vs contradicted vs human-proof) → resolve one item, readiness updates → export readiness report. Never say "AI guarantees compliance" or "this replaces proposal review."

## Acceptance criteria (PRD §11.2)

- AC-01 Fixture RFP + addenda upload without error; page-level text preserved.
- AC-02 System produces the expected 10 mandatory form requirements.
- AC-03 Each mandatory requirement opens correct source page + passage.
- AC-04 Checklist shows the 5 intentionally missing forms as critical blockers.
- AC-05 Draft audit flags all 3 unsupported claims and both contradictions.
- AC-06 Reviewer can correct an extracted field; audit log records it.
- AC-07 Readiness remains "Not ready" while any critical blocker unresolved.
- AC-08 Readiness report exports with source refs, unresolved items, approvals, run date, disclaimer.
- AC-09 Demo resets and repeats without manual DB editing.
- AC-10 No real USI confidential data in demo environment.

## UX principles (PRD §9)

Screens: opportunity list, upload/processing, overview dashboard, requirements register, evidence viewer, submission checklist, draft audit, readiness report. Blockers visually dominant; evidence one click away; confidence explained, never a substitute for evidence; explicit states ("Needs review", "Source not found", "Conflict detected"); correct AI output without full rerun; no language implying autonomous approval or guaranteed completeness.
