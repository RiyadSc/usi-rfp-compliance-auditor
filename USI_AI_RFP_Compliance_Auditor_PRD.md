# USI AI RFP Compliance Auditor PRD

Source: `USI_AI_RFP_Compliance_Auditor_PRD.pdf`

## Page 1

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Product Requirements Document
AI RFP Compliance Auditor - Demo Product
Version USI Document Intelligence & Verification Layer
1.0
Status Product specification for demo build
Prepared for United Security, Inc. (USI)
Date July 16, 2026
Demo-only product specification. Use synthetic or public data unless USI provides written authorization for internal documents.
Prepared for USI | July 16, 2026
1

## Page 2

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Document Control
Document owner Riyad Scally
Primary audience USI executive sponsors, product stakeholders, engineering
team, security/privacy reviewers
Product phase Demo prototype / pre-pilot discovery
Confidentiality Confidential working document; not a production security
assessment
Source inputs USI AI opportunity assessment; stakeholder discussion with
Sales & Marketing and Corporate Strategy & Operations
Decision requested Approve demo build, review scope, and identify pilot
sponsor/data owner
Contents
1. Executive Summary
2. Product Context and Opportunity
3. Product Strategy
4. Users and Stakeholders
5. Scope and Release Definition
6. User Journeys and Experience
7. Functional Requirements
8. Business Rules and Reliability Requirements
9. UX and Content Requirements
10. Demo Scenario and Script
11. Metrics and Acceptance Criteria
12. Risks, Dependencies, and Governance
13. Roadmap and Pilot Path
14. Open Questions and Decisions
Prepared for USI | July 16, 2026
2

## Page 3

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
1. Executive Summary
This PRD defines a demo product that makes AI-assisted RFP review auditable, evidence-based, and safe for human
decision-making.
Product thesis. USI does not primarily need another system that writes convincing proposal text. It needs a verification
layer that can prove what the source RFP requires, detect missing submission items, and flag unsupported claims before
a bid is submitted.
North-star outcome: A reviewer can answer “Are we missing anything, and can every critical output be traced to the
source?” in minutes rather than relying on a persuasive but potentially incorrect AI draft.
Working product name AI RFP Compliance Auditor
Platform name USI Document Intelligence & Verification Layer
Primary users Sales/proposal leads, compliance reviewers, operations
contributors, executive approvers
Demo objective Show that an evidence-first AI workflow can identify missing
forms, unsupported claims, conflicting requirements, and
submission blockers
Primary success moment The demo catches five intentionally missing forms and traces
every flagged requirement to an exact page/section
Recommended demo length 4-6 minutes
2. Product Context and Opportunity
2.1 Business context
 USI responds to document-heavy commercial and public-sector opportunities where submission completeness, insurance
terms, forms, deadlines, staffing obligations, and formatting requirements can determine eligibility.
 Stakeholders have already experimented with AI-assisted RFP review and drafting, but experienced unreliable outputs,
including invented requirements, cross-document contamination, and missed forms.
 A plausible-looking AI response can increase risk because reviewers may spend more time validating it than they would
spend reading the source manually.
 The product opportunity is therefore a reliability and auditability problem before it is a text-generation problem.
2.2 Problem statement
Problem: Proposal teams need speed, but they cannot safely trust AI-generated extraction or drafts when a single missed
form, false requirement, or unsupported claim could disqualify a bid or create contractual risk.
2.3 Why current approaches fail
Failure mode What happens Business consequence
Generic prompting A user uploads a long RFP and asks for a
summary or draft without a controlled schema.
Important requirements are omitted or merged
into narrative text.
Cross-document contamination The model incorporates similar requirements
from memory or another source.
The system invents obligations that do not exist
in the active procurement.
No evidence trail Outputs do not preserve page/section citations. Reviewers cannot quickly verify the result and
must reread the entire source.
One-pass generation The same pass extracts, interprets, and drafts. Errors compound and are difficult to isolate.
Prepared for USI | July 16, 2026
3

## Page 4

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Failure mode What happens Business consequence
Automation bias Polished language appears authoritative. Teams over-trust incorrect output or miss subtle
gaps.
No submission gate The tool generates content but does not block
missing mandatory items.
A proposal can appear complete while required
forms remain absent.
3. Product Strategy
3.1 Vision
Build a reusable document intelligence and verification layer that begins with RFP compliance and can later
support contracts, post orders, onboarding documents, credentials, SOPs, and client reporting.
3.2 Product principles
Principle Implication for the product
Evidence before eloquence Every critical extraction and audit finding must link to a specific
source page/section.
Human authority AI recommends and flags; authorized users approve, reject, and
make final submission decisions.
Separate extraction from verification The system uses independent passes and deterministic checks
rather than trusting a single model response.
Fail visibly Low confidence, conflicts, parsing errors, and missing evidence must
be shown, not hidden.
Narrow demo, extensible architecture The demo solves one painful workflow while exposing reusable
document, retrieval, evidence, and review components.
No production claims from synthetic testing Demo results communicate feasibility, not production accuracy or
legal compliance.
3.3 Objectives
 Reduce time required to construct an initial requirements register and submission checklist.
 Make every extracted obligation traceable to the source document.
 Detect missing forms, deadlines, acknowledgments, attachments, and unresolved mandatory items.
 Audit an AI- or human-generated draft for unsupported claims and conflicts with the RFP.
 Provide a clear submission-readiness view with explicit human approval gates.
 Demonstrate an architecture that could be reused across other USI document-heavy workflows.
3.4 Non-goals
 Autonomously submitting bids or communicating with customers.
 Producing final legal, insurance, pricing, or staffing decisions.
 Replacing proposal managers, compliance reviewers, operations, finance, or counsel.
 Integrating with production USI systems during the demo phase.
 Using confidential USI documents without written authorization and approved handling controls.
 Guaranteeing that the system will find every requirement in every document format.
4. Users and Stakeholders
Role Primary need Product responsibility
Proposal / sales lead Understand requirements quickly and
coordinate a compliant response.
Upload documents, review extracted
requirements, assign owners, manage
Prepared for USI | July 16, 2026
4

## Page 5

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Role Primary need Product responsibility
submission checklist.
Compliance reviewer Confirm mandatory items and detect hidden or
conflicting obligations.
Validate citations, classify risks, approve critical
requirements.
Operations contributor Review staffing, transition, supervision, training,
and site obligations.
Confirm operational feasibility and provide
source-backed responses.
Finance / insurance reviewer Validate pricing attachments, insurance
thresholds, bonds, and commercial terms.
Approve domain-specific items; mark
exceptions.
Executive approver Know whether the bid is ready and where
material risk remains.
Review readiness report and approve final gate.
Demo operator Present the concept without exposing real data. Load synthetic/public documents and walk
through the prepared scenario.
4.1 Stakeholder map
 Executive sponsor: confirms strategic relevance and authorizes a pilot.
 Business owner: owns the RFP process, data access, reviewer participation, and success metrics.
 Technical owner: approves architecture, vendors, credentials, hosting, and model access.
 Security/privacy reviewer: approves document handling, retention, external processors, and logging.
 End-user reviewers: validate whether outputs are accurate, complete, and faster than the current process.
5. Scope and Release Definition
5.1 Demo release: Must have
Epic Included capability Priority
Document ingestion Upload one primary RFP plus optional addenda
and supporting files; parse pages and preserve
source metadata.
P0
Requirements register Extract structured obligations with category,
mandatory status, deadline, source quotation,
page, section, and confidence.
P0
Evidence viewer Open the exact source page from any
requirement and highlight supporting text.
P0
Submission checklist Track required forms, signatures,
acknowledgments, insurance, attachments,
events, and unresolved items.
P0
Draft compliance audit Upload a draft response and flag unsupported
claims, contradictions, missing responses, and
uncited assertions.
P0
Readiness report Show blockers, warnings, human approvals,
and an exportable review summary.
P0
Audit log Record analysis runs, model/config version,
user decisions, and export events.
P1
Assignment/status Assign requirement owner and mark
unreviewed, confirmed, exception, or not
applicable.
P1
5.2 Should have
 Addendum comparison that shows requirements added, removed, or changed.
Prepared for USI | July 16, 2026
5

## Page 6

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
 Bulk filter by requirement category, owner, status, confidence, or severity.
 Requirement deduplication and cross-reference detection.
 Export to CSV and a concise PDF/Word readiness report.
 Synthetic “known answer” test mode for demo quality assurance.
5.3 Later / pilot candidates
 Approved USI content library and reusable proposal language.
 Integration with SharePoint, CRM, proposal software, or contract repository.
 Collaborative comments, notifications, and workflow deadlines.
 Role-specific copilots for operations, finance, insurance, and legal reviewers.
 Cross-bid analytics, win/loss learning, and reusable compliance patterns.
6. User Journeys and Experience
6.1 Journey A - Analyze a new RFP
1. 2. 3. 4. 5. 6. 7. User creates a workspace and enters opportunity name, customer/agency, response deadline, and internal owner.
User uploads the RFP and any addenda. The product displays upload status, page count, and parsing warnings.
The analysis pipeline extracts requirements and builds a structured requirements register.
User filters mandatory items and opens a requirement to view the source page and highlighted supporting text.
User confirms, edits, rejects, or marks each critical item as needing expert review.
Product builds a submission checklist and highlights missing forms, signatures, deadlines, and acknowledgments.
User exports the register or proceeds to audit a draft response.
6.2 Journey B - Audit a proposal draft
8. 9. User uploads or pastes a draft proposal response.
The system segments the draft into claims and response sections.
10. Each claim is matched against the RFP and approved reference materials.
11. The product flags unsupported claims, contradictions, missing requirement responses, and statements requiring human
proof.
12. User reviews each finding, opens the relevant source, and records a resolution.
13. The readiness score updates only after critical blockers are resolved or explicitly accepted by an authorized reviewer.
6.3 Journey C - Executive readiness review
14. Executive opens a one-page summary of completeness, risk, and unresolved approvals.
15. Product displays critical blockers first, followed by warnings and low-confidence items.
16. Executive can drill into evidence but is not required to inspect every extraction.
17. Final status remains “Not ready” until all mandatory gates are approved or an exception is documented.
7. Functional Requirements
ID Capability Requirement Priority
FR-001 Workspace creation Create a named opportunity with
deadline, owner, customer, and
optional description.
P0
FR-002 Document upload Accept PDF and DOCX for the demo;
show file name, size, hash, page
count, and parsing status.
P0
FR-003 Addenda grouping Associate addenda with the primary
RFP and preserve document
order/version.
P1
FR-004 Page-preserving parsing Store page-level text, tables where
available, coordinates or text anchors,
and parser confidence.
P0
FR-005 Structured extraction Extract requirement type, description,
mandatory flag, deadline, responsible
function, source quote, page, section,
P0
Prepared for USI | July 16, 2026
6

## Page 7

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
ID Capability Requirement Priority
and confidence.
FR-006 Requirement status Support unreviewed, confirmed,
rejected, exception, not applicable,
and superseded.
P0
FR-007 Source navigation From any requirement, open the
source page and visually identify the
supporting passage.
P0
FR-008 Missing evidence state Do not present a requirement as
verified when no source evidence is
available.
P0
FR-009 Checklist generation Generate checklist categories for
forms, signatures, attachments,
insurance, bonds, pricing, meetings,
deadlines, and acknowledgments.
P0
FR-010 Blocker detection Mark missing mandatory items,
expired deadlines, unacknowledged
addenda, and unresolved conflicts as
blockers.
P0
FR-011 Draft upload Accept a proposal draft and parse
headings, paragraphs, tables, and
claims.
P0
FR-012 Claim-to-source audit Classify claims as supported, partially
supported, unsupported, contradicted,
or requires human proof.
P0
FR-013 Cross-document isolation Constrain evidence to the active
workspace documents and identify
any claim not grounded there.
P0
FR-014 Human decision capture Allow reviewers to accept, correct,
reject, comment, assign, or waive
findings with rationale.
P0
FR-015 Readiness calculation Calculate readiness from mandatory
completeness and human approval
rules, not model confidence alone.
P0
FR-016 Export Export requirements CSV and a
PDF/DOCX readiness summary for
the demo.
P1
FR-017 Audit history Record model/config version,
timestamps, source hashes, user
changes, and approvals.
P1
FR-018 Re-analysis Allow re-analysis after document
changes while preserving prior run
history.
P1
8. Business Rules and Reliability Requirements
Rule Definition
BR-01 A mandatory requirement cannot be marked complete without either
a linked artifact/response or a documented exception.
BR-02 No AI-extracted requirement is “confirmed” until a human reviewer
approves it.
BR-03 Every verified requirement must have source document ID, page
number, and supporting quotation or anchor.
Prepared for USI | July 16, 2026
7

## Page 8

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Rule Definition
BR-04 An unsupported or contradicted draft claim is a warning or blocker
based on configured severity; it is never silently rewritten.
BR-05 The system must distinguish “not found” from “not required.”
BR-06 Addenda take precedence over superseded language; conflicts must
be shown explicitly.
BR-07 Readiness cannot be 100% while critical parsing errors, unresolved
mandatory items, or unreviewed blockers exist.
BR-08 Model confidence is advisory; deterministic checks and human
approval govern final status.
BR-09 The demo must never transmit real confidential USI data without
approved environment and authorization.
BR-10 The product must disclose that outputs are decision support and not
legal, insurance, or contractual advice.
8.1 Reliability targets for the demo
Measure Demo target How measured
Known mandatory form recall 100% on curated demo document Seed document with 10 known forms; verify all
are detected.
Citation validity 100% for displayed verified findings Each clickable citation resolves to correct
document/page and supports the statement.
Unsupported-claim detection At least 90% on curated draft Insert known unsupported and contradictory
claims.
False requirement rate 0 critical false requirements in prepared demo Use expected-answer fixture and human
verification.
Analysis completion Under 3 minutes for prepared document set Measured from upload completion to results
ready.
Demo stability Three consecutive successful rehearsals No uncaught errors; reset flow documented.
9. UX and Content Requirements
9.1 Core screens
Screen Purpose Required elements
Opportunity list Select or create an analysis workspace. Name, customer, deadline, owner, status, last
analysis.
Upload and processing Load documents and understand processing
state.
File list, document type, progress, parser
warnings, retry.
Overview dashboard Show the state of the submission. Readiness, blockers, warnings, high-risk
clauses, missing items, review progress.
Requirements register Review and manage structured obligations. Filters, category, mandatory status, owner,
deadline, confidence, review status.
Evidence viewer Verify a finding against the source. Document/page selector, highlighted passage,
extracted field, approve/edit/reject.
Prepared for USI | July 16, 2026
8

## Page 9

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
Screen Purpose Required elements
Submission checklist Track tangible submission items. Category, item, evidence/artifact, owner, status,
due date, blocker flag.
Draft audit Review claims and response coverage. Finding severity, claim text, classification,
matched source, suggested action.
Readiness report Support final decision and export. Executive summary, blockers, exceptions,
approvals, run metadata, disclaimer.
9.2 UX principles
 Blockers are visually dominant; model-generated prose is secondary.
 Source evidence is one click away from every critical finding.
 Confidence is displayed with an explanation and never used as a substitute for evidence.
 The interface uses explicit states such as “Needs review,” “Source not found,” and “Conflict detected.”
 Users can correct AI output without rerunning the entire analysis.
 The product avoids language that implies autonomous approval or guaranteed completeness.
10. Demo Scenario and Script
10.1 Prepared fixture
 A synthetic or public security-services RFP of approximately 35-60 pages.
 Two addenda, one of which changes a deadline and adds a required acknowledgment.
 Ten known mandatory submission forms, with five intentionally omitted from the draft package.
 A draft response containing three unsupported company claims, two contradictory staffing statements, and one incorrect
insurance threshold.
 A known-answer file used only for internal demo testing.
10.2 Five-minute demo flow
Time Action Message to audience
0:00-0:30 Open the opportunity dashboard. “The goal is not to write a prettier proposal. It is
to know whether the proposal is safe to submit.”
0:30-1:15 Show documents and completed analysis. “The system preserves the primary RFP and
addenda as isolated, versioned sources.”
1:15-2:05 Open the requirements register and click a
mandatory form.
“Every verified requirement has page-level
evidence; nothing is accepted because the
model merely said so.”
2:05-2:50 Open the checklist and reveal five missing
forms.
“This is the specific failure mode the demo is
designed to prevent.”
2:50-3:45 Open draft audit findings. “The product separates unsupported,
contradicted, and human-proof claims instead of
silently rewriting them.”
3:45-4:30 Resolve one item and show readiness update. “Readiness is driven by review rules and
approvals, not model confidence.”
4:30-5:00 Export the readiness report and explain
extensibility.
“The same verification layer can later support
contracts, post orders, onboarding, credentials,
and SOPs.”
Do not say: “The AI guarantees compliance” or “This replaces proposal review.” The demo proves an evidence-first
workflow, not perfect automated interpretation.
Prepared for USI | July 16, 2026
9

## Page 10

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
11. Metrics and Acceptance Criteria
11.1 Product success metrics
Metric Definition Demo/pilot direction
Time to first requirements register Elapsed time from completed upload to
reviewable structured output.
Demo <3 minutes; pilot benchmark against
manual process.
Reviewer verification time Time to confirm or reject extracted critical items. Decrease because citations open exact source
pages.
Mandatory-item recall Share of known mandatory items identified. Demo 100% on fixture; pilot target established
with business owner.
False critical findings Critical requirements shown without supporting
source.
Demo zero on fixture.
Blocked submission defects Missing forms or contradictions found before
finalization.
Track count and severity during pilot.
Adoption / trust Reviewers willing to use output as first-pass
decision support.
Qualitative interviews and repeat usage.
Economic value Hours saved plus avoided bid
disqualification/rework.
Estimate after a real shadow-mode pilot.
11.2 Release acceptance criteria
ID Acceptance criterion
AC-01 Prepared RFP and addenda upload without error and preserve page-
level text.
AC-02 The system produces the expected ten mandatory form requirements
from the fixture.
AC-03 Each mandatory requirement opens the correct source page and
supporting passage.
AC-04 The checklist shows the five intentionally missing forms as critical
blockers.
AC-05 The draft audit flags all three unsupported claims and both
contradictions in the prepared scenario.
AC-06 A reviewer can correct an extracted field and the audit log records
the change.
AC-07 Readiness remains “Not ready” while any critical blocker is
unresolved.
AC-08 A final readiness report exports with source references, unresolved
items, approvals, run date, and disclaimer.
AC-09 The demo can be reset and repeated without manual database
editing.
AC-10 No real USI confidential data is used in the demo environment.
Prepared for USI | July 16, 2026
10

## Page 11

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
12. Risks, Dependencies, and Governance
Risk Impact Mitigation
Complex PDFs / scanned pages Parser may miss text, forms, or tables. Show parser confidence; OCR fallback;
preserve page images; manual correction.
Hallucinated extraction False obligations may mislead reviewers. Constrained schema, source quotation required,
independent verifier, human confirmation.
Missed requirements Incomplete checklist may create false
confidence.
Known-answer tests, multiple extraction
strategies, low-confidence queue, explicit non-
guarantee.
Sensitive bid data External processing may violate policy or
customer terms.
Synthetic/public data for demo; vendor/security
approval before internal pilot; encryption and
retention controls.
Overbuilding before validation Time is spent on integrations instead of proving
value.
Demo uses isolated upload workflow and
curated scenario.
Executive misinterpretation Prototype is treated as production-ready. Visible “Demo” label, limitations, readiness
checklist, and pilot prerequisites.
No business owner Project stalls after demo. Require sponsor, process owner, reviewer
cohort, and pilot decision date.
Unclear budget / scope Interest does not convert to project. Present fixed pilot options with deliverables,
duration, and decision gates after demo.
12.1 Pilot prerequisites
 Named executive sponsor and business process owner.
 Approved data classification and document-handling rules.
 Sample historical RFPs and known submission outcomes, redacted where necessary.
 Access to 2-4 experienced reviewers for expected-answer labeling and evaluation.
 Agreement on shadow-mode operation: the tool advises; existing review remains authoritative.
 Defined pilot budget, time box, success metrics, and go/no-go decision.
13. Roadmap and Pilot Path
Phase Duration Deliverables Decision gate
Demo prototype 10-15 working days Prepared fixture, P0 screens,
evidence links, checklist, draft audit,
readiness export.
Does leadership see the problem and
value clearly?
Discovery + evaluation design 1-2 weeks Workflow map, data policy, historical
sample set, baseline timing,
expected-answer rubric.
Is there an approved owner and safe
data path?
Shadow-mode pilot 4-6 weeks Run against selected real RFPs
without changing submission
authority; measure time and defects.
Does the tool improve speed or
quality with acceptable risk?
Controlled production pilot 6-10 weeks User accounts, integrations,
monitoring, support, security review,
formal SOP.
Approve scale, redesign, or stop.
Platform expansion Quarterly Contracts, post orders, onboarding,
credentials, client reports.
Prioritize by ROI and data readiness.
Prepared for USI | July 16, 2026
11

## Page 12

USI AI RFP Compliance Auditor - Product Requirements | Confidential working document
14. Open Questions and Decisions
Question Owner Required before
Which team is the formal business owner for the
first pilot?
USI leadership Pilot approval
Which historical RFPs can be used, and what
must be redacted?
Business owner + security/privacy Evaluation dataset
What proposal/RFP tools are already used and
should remain authoritative?
Sales/marketing Integration design
Which document categories are highest risk:
forms, insurance, staffing, pricing, legal clauses,
or deadlines?
Proposal reviewers Scoring rules
What model/vendor and data residency
requirements apply?
Cyber/security Architecture approval
Who may approve or waive critical findings? Process owner RBAC and readiness rules
What level of accuracy would justify a paid
pilot?
Executive sponsor Go/no-go metrics
Should the initial engagement be internship,
project contract, or consulting pilot?
USI leadership/HR Commercial structure
Final product decision: Approve a demo build only if it remains evidence-first, uses synthetic/public data, and is presented
as a decision-support prototype rather than a production compliance system.
Prepared for USI | July 16, 2026
12

