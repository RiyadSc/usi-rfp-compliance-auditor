# Product Understanding Document

**Workstream:** UX Discovery — Phase A  
**Date:** 2026-07-25  
**Evidence grades:** Stakeholder · Domain (fixtures) · Proxy (code/docs/UI contracts) · Designer inference (labeled)

---

## 1. Purpose

The RFP Compliance Auditor is a **decision-support system** for high-stakes proposal work. It helps a response team:

- understand what a solicitation requires;
- verify where each requirement came from;
- identify what is missing or blocked;
- coordinate submission work;
- audit a proposal draft against source obligations;
- preserve human decisions and provenance;
- and prepare leadership for a final human readiness judgment.

It does **not** determine legal compliance, approve a proposal, guarantee completeness, replace proposal managers / legal / SMEs, or authorize submission.

**Product thesis (PRD):** USI does not need another proposal writer. It needs a verification layer that proves what the source requires, detects missing submission items, and flags unsupported claims before bid submission.

**North-star experience (this authorization):** A qualified user can enter, understand opportunity state, identify what matters, verify supporting evidence, and take the correct next action without needing to understand the software’s internal architecture.

---

## 2. Intended users (as currently documented)

| Documented role                              | Primary need (stakeholder / prior UX)                         | Auth reality today                       |
| -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Proposal / sales lead                        | Upload, review requirements, assign owners, manage checklist  | Membership: `owner` or `reviewer`        |
| Compliance reviewer                          | Validate citations, classify risk, accept/dispute assessments | Same membership model                    |
| Operations / finance / insurance contributor | Confirm obligations; attach artifacts; mark exceptions        | Same; ownership via checklist assignment |
| Executive / director                         | Readiness, blockers, next decision in ~30s                    | Same; presentation “Director” view only  |
| Demo / technical operator                    | Prepared demo, processing health, provenance                  | Same; “Technical reviewer” view only     |

**Critical distinction:** UI “role views” (Director, Proposal manager, Contributor, Technical) are **local presentation preferences**, not authorization roles. Workspace membership is only `owner` | `reviewer`. RLS and controlled RPCs are authoritative.

**ICP grounding status:** Roles are grounded in PRD stakeholder discussion and prior role-based UX work. They are **not** yet grounded in direct observational research with USI proposal teams. Treat persona behavior detail as **Unverified** until Phase B/C research completes.

---

## 3. Domain model (user-facing vs system)

```text
Users (auth)
→ Workspace (= Opportunity in UI)
→ Documents (RFP / addenda / attachments / proposal drafts)
→ Parsing / normalization (pages, tables, confidence, warnings)
→ Requirement candidates (extracted, immutable)
→ Verification findings (multi-axis machine assessment, immutable)
→ Human review decisions (append-only)
→ Checklist items + blockers + readiness snapshot
→ Proposal audit findings + resolutions (append-only)
→ Report snapshots + private exports
→ Audit events (immutable)
```

### Domain invariants the UX must preserve

| Distinction                                            | Why it matters                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Candidate vs verified requirement                      | Extraction is proposal; verification + rules control display of support |
| Source support vs addendum precedence                  | Backed ≠ currently controlling                                          |
| Source verification vs workflow completion             | Task done ≠ source true                                                 |
| Missing evidence vs contradiction                      | Different remediation paths                                             |
| Company documentation needed vs false claim            | Proof axis ≠ support axis                                               |
| Machine finding vs human decision                      | Append-only; never silent rewrite                                       |
| Document processing success vs human-review completion | Parsed ≠ reviewed                                                       |
| Checklist completion vs submission authorization       | Ready for final review ≠ safe to submit                                 |
| Readiness information vs compliance determination      | Prohibited language policy                                              |
| Current state vs historical audit/report state         | Snapshots are point-in-time                                             |
| Parser uncertainty vs definitive absence               | Fail-closed uncertainty                                                 |

Persisted enum values remain technical; UI projects `business-terminology-v2` labels without mutating semantics.

---

## 4. Architecture map (experience-relevant)

```text
Users
→ Opportunities (workspaces)
→ Documents
→ Parsing
→ Potential requirements (candidates)
→ Verification (source / precedence / proof / machine-only)
→ Confirmed-for-workflow inputs (eligibility after support + precedence + policy)
→ Checklist and work (owners, artifacts, waivers, blockers)
→ Proposal review (coverage / support / consistency / human resolution)
→ Human decisions (append-only)
→ Readiness reporting (immutable snapshots + exports)
```

### Components

| Layer                   | Responsibility                                     | UX implication                               |
| ----------------------- | -------------------------------------------------- | -------------------------------------------- |
| Next.js app             | Auth shell, navigation, evidence viewers, controls | All wait/decision/error presentation         |
| Server actions / RPCs   | Authorized mutations                               | Failures must explain effect on work         |
| Worker / pg-boss        | Parse, extract, verify, checklist, audit, report   | Users wait; need progress + recovery         |
| Parser adapters         | Page/table/OCR-selective normalization             | Uncertainty states visible                   |
| Model gateway           | Extraction / Phase 9 semantic tasks                | Live path restricted; demo often mock/cached |
| Supabase Postgres + RLS | Tenant data                                        | Isolation; no cross-workspace search index   |
| Private storage         | Sources, exports                                   | Signed short-lived downloads                 |
| Deterministic engines   | Checklist, proposal audit, reporting               | Trust from rules + evidence, not “AI said”   |

### Frontend route inventory (current)

**Global:** `/` Home · `/?view=opportunities` · `/my-work` · `/reports` · `/search` · `/login`

**Opportunity:** Overview · Requirements (+ detail) · Checklist (+ item) · Proposal Review (+ run) · Documents (+ detail) · Reports (+ snapshot) · Live Analysis (`/phase9`) · Analysis run · Demo

**Nav contract note:** `docs/rfp-product-ux-guide.md` describes six opportunity destinations; runtime nav currently also surfaces **Live Analysis** (Phase 9). This is an IA inconsistency to diagnose in Phase D.

---

## 5. Workflows (system)

### Pipeline stages

```text
validate → parse → normalize → index → extract → verify
→ build_checklist → audit_draft → generate_report
```

Phase 5–7 engines are provider-free consumers of upstream immutable records. Phase 8 adds demo cache/fallback/rate/budget controls. Phase 9 is a separate coverage-led public/live analysis path that does not rewrite Phase 3–4 records.

### Product journeys (PRD)

1. **Analyze a new RFP** — create → upload → process → extract/verify → human review → checklist → export/continue
2. **Audit a proposal draft** — upload draft → match → findings → resolve → readiness updates after human gates
3. **Executive readiness review** — blockers first → evidence drill-down → never “compliant”

### Nine-step guided workflow (current UI)

Business / processing / review kinds: Create opportunity → Collect files → Read & organize → Review requirements → Build checklist → Assign & complete → Review draft → Resolve issues → Prepare final human review.

---

## 6. Where users must wait

| Moment                           | What happens                      | User risk if poorly communicated          |
| -------------------------------- | --------------------------------- | ----------------------------------------- |
| Upload finalize + parse          | Pages/text extracted              | Assume “uploaded” means “ready to review” |
| Extraction analysis run          | Candidates produced               | Treat candidates as verified              |
| Verification run                 | Multi-axis findings               | Over-trust machine support                |
| Checklist generation             | Deterministic items/blockers      | Confuse regenerate with lost human edits  |
| Proposal audit                   | Findings for a revision           | Review wrong revision                     |
| Report generation / export grant | Snapshot + short-lived URL        | Treat stale snapshot as current           |
| Phase 9 live analysis            | Coverage + planned provider tasks | Cost/wait confusion; false completeness   |
| Large-document retries           | Page-level leases                 | Partial readiness misunderstood           |

---

## 7. Where users must decide

| Decision                                               | Typical actor         | Evidence needed                | Reversibility              |
| ------------------------------------------------------ | --------------------- | ------------------------------ | -------------------------- |
| Accept / dispute / follow-up / waive source assessment | Reviewer / PM         | Quote, page, precedence, proof | Append-only new decision   |
| Assign owner / change checklist workflow               | PM                    | Obligation + blocker reason    | Transition-guarded         |
| Link / review artifact                                 | Contributor / PM      | Correct document identity      | History retained           |
| Record waiver / exception                              | Authorized membership | Rationale                      | Append-only                |
| Resolve proposal finding                               | Reviewer              | RFP evidence + claim           | Append-only                |
| Generate new report snapshot                           | PM / Director         | Compatible run chain           | Old snapshot remains audit |
| Proceed despite uncertainty                            | Human only            | Explicit uncertainty states    | Must not be silent         |

Full inventory expands in Phase C/E (`decision-inventory`).

---

## 8. Where the system may be uncertain

- `parser_uncertain` / partial parse / OCR gaps
- `partially_supported` material conditions
- `conflicting` / `undetermined` precedence
- `undetermined` proof requirement
- Proposal `requires_human_proof` / missing match (precision-first)
- Ambiguous repeated quotations (`evidence_location_ambiguous`)
- Operational contingency: cached, fallback, stale, revoked, budget, rate-limited

UX requirement: **calibrated trust** — visible uncertainty without visual noise that trains users to ignore it.

---

## 9. Where errors occur

Upload validation · parse failure · extraction/verification failure · budget/rate limits · unauthorized access · export grant expiry · wrong workspace membership · regenerate after human decisions · Phase 9 plan/reservation failures.

Recovery pattern required (authorization §56): what happened, what preserved, what affected, what user can do, what system will do, whether review required, whether work can continue, how to get help.

---

## 10. Where data becomes immutable

- `requirement_candidates`, `verification_findings`, proposal machine structures, report snapshots/manifests, `audit_events`
- Human paths append (`human_review_decisions`, proposal resolutions, waivers)
- Checklist regeneration obsoletes machine structure; preserves human fields
- Demo reset mutates **presentation state only**

UX must not imply “undo” of machine findings; it must explain **new decision / new revision / new snapshot**.

---

## 11. Misunderstanding hotspots (hypotheses)

| User may think                            | System actually means                            | Risk                       | Evidence grade           |
| ----------------------------------------- | ------------------------------------------------ | -------------------------- | ------------------------ |
| “Backed by the RFP” = approved            | Source support only; human review separate       | Automation bias            | Stakeholder (T8) · Proxy |
| “Task completed” = compliant              | Workflow axis only                               | R-21                       | Stakeholder              |
| “Ready for final review” = safe to submit | Deterministic readiness gate language            | Prohibited-language policy | Stakeholder              |
| “Requirements” = verified obligations     | Often candidates + findings composite            | IA                         | Proxy (code)             |
| Role view = permission                    | Presentation density only                        | R36                        | Stakeholder              |
| Latest report includes today’s decisions  | Point-in-time snapshot                           | R-32                       | Stakeholder              |
| Live Analysis = same as verified register | Separate Phase 9 graph                           | Architecture               | Proxy                    |
| Brand “RFP Response Hub” = product name   | Layout still “USI RFP Compliance Auditor — Demo” | Brand/IA                   | Proxy                    |

---

## 12. Security and trust boundaries (UX-relevant)

- Documents are untrusted data (prompt injection treated as content).
- Workspace isolation everywhere; search is bounded substring over authorized rows.
- Evidence-gated verified display; no verified without page-level evidence.
- Automation bias is an explicit threat (T8); UX is a control surface.
- Exports: private bucket, ~300s grants, no persisted URLs in artifacts.
- No confidential USI data in demo; general live verification disabled outside controlled public/synthetic paths.

---

## 13. Constraints on UX change

**Hard constraints:** invariants, RLS, provenance, append-only decisions, prohibited language, provider/cost gates, no confidential data without authorization.

**Current implementation (not hard constraints):** route names, nav item count, nine-step labels, Home vs Opportunities split, action-group taxonomy, Executive/Analyst toggle, role-view selector, Live Analysis placement.

**Estimated effort / design preference:** defer until concepts are validated (Phases F–G).

---

## 14. Open questions (Phase A → B)

1. Who are the real primary daily users at USI (or ICP orgs), and how often does each role enter the product?
2. What artifacts do teams currently trust for compliance matrices (spreadsheet, Word, SharePoint), and what must the product replace vs complement?
3. Which of the twelve success questions (§3 of authorization) are answered today without reconstruction?
4. Does “Live Analysis” belong in primary opportunity nav, secondary admin, or a separate mode?
5. Is opportunity-centered IA correct, or should task-centered / deadline-centered models compete?
6. What is the minimum evidence density directors need vs proposal managers?
7. How should addendum change propagation be experienced when downstream work is invalidated?
8. What direct-user access is available for moderated research; what proxies are authorized if none?

---

## 15. Sources consulted

- `docs/product-summary.md`, `docs/architecture-summary.md`, `docs/invariants.md`, `docs/assumptions.md`, `docs/security-model.md`, `docs/risk-register.md`, `docs/decision-log.md`
- `docs/rfp-product-ux-guide.md`, `docs/role-based-ux-audit.md`, `docs/role-based-ux-completion-report.md`
- `apps/web/src/lib/presentation.ts`, `apps/web/src/lib/ux-contract.ts`
- Codebase route/domain/schema survey (Phase A architecture exploration)
- PRD / Engineering Design summaries as stakeholder evidence

---

## 16. Phase A completion criterion

Product purpose, architecture, invariants, wait/decision/uncertainty/error/immutable points, user/auth distinction, and open questions are documented. **Ready for Phase B.**
