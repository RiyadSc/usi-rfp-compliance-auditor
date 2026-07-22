# Role-Based UX Audit

Date: 2026-07-22. Scope: authenticated application routes through Phase 8 plus the large-document presentation path. This audit evaluates presentation and navigation only; the Phase 4–8 data, provenance, authorization, deterministic decision, and human-review contracts remain authoritative.

## Evaluation lens

Every major route was reviewed for: user goal, primary decision, first action, information hierarchy, terminology, status clarity, technical leakage, scanability, navigation, filtering, evidence access, error/empty/loading guidance, role relevance, accessibility, responsiveness, and audit/provenance visibility.

| Surface                | Main user goal                          | UX debt                                                                                                                        | Severity | Remediation                                                                                                             |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Sign in                | Enter a protected workspace             | Clear but disconnected from the product journey                                                                                | Low      | Add concise outcome-oriented context and preserve generic errors                                                        |
| Portfolio `/`          | Decide what needs attention             | Mixes home, opportunity list, creation, test data, and sign-out; no personal work or global search                             | Critical | Separate Home and Opportunities; add global navigation, attention queue, my-work preview, and one primary CTA           |
| Opportunity overview   | Understand readiness and next action    | Good metrics, but only five coarse stages and no explicit business/processing/review distinction                               | High     | Add six-metric executive summary, top-three issues, nine-step workflow, recommended action, and role-aware content      |
| Documents              | Understand the source set and add files | Upload language is file-centric; purpose, addendum risk, and processing consequences are secondary                             | Medium   | Purpose groups, guided upload copy, business processing states, and change-review callout                               |
| Requirement register   | Decide which requirements are settled   | Seven columns are dense; four status axes are discoverable only after scanning; advanced filters are hidden by the view switch | High     | Business search, saved views, compact seven-column table, plain axis labels, side/detail hierarchy, glossary help       |
| Requirement evidence   | Validate why a requirement exists       | Strong provenance but technical metadata competes with evidence and decisions                                                  | High     | Lead with obligation and decision axes, then quote/page, contradictions/addenda, human action, technical disclosure     |
| Submission checklist   | Coordinate owners and unblock work      | Status/proof/source axes compete in one table; filters are long; tasks are not grouped by action                               | High     | Group into blocked, due soon, needs proof, unassigned, and completed; simplify visible columns and preserve full detail |
| Checklist item         | Act on one obligation                   | Comprehensive but workflow, evidence, artifacts, waivers, and history have equal weight                                        | Medium   | Put next action and blocker reason first; progressive disclosure for provenance/history                                 |
| Proposal review list   | Decide whether a draft needs attention  | Run-centric entry point; issues appear only after opening a run                                                                | High     | Lead with latest revision, issue counts by severity/type, and a clear review-new-revision action                        |
| Proposal review detail | Resolve material draft issues           | Strong finding detail but no consistently prominent side-by-side source/proposal comparison                                    | High     | Group issues, show RFP evidence beside proposal claim, keep append-only human decision controls                         |
| Reports list           | Understand final-review history         | Report generation is the first card; business meaning is secondary                                                             | Medium   | Lead with current readiness interpretation, latest report, and decision limitations                                     |
| Report detail/export   | Prepare an executive review             | Valuable content, but operational metadata and export mechanics can dominate                                                   | Medium   | Executive summary first; risks, actions, and evidence links next; technical/export metadata last                        |
| Prepared demo          | Learn the full workflow                 | Excellent coverage but long and optimized for technical proof rather than persona learning                                     | Medium   | Add role-based entry points and keep the protected known-answer route intact                                            |
| Analysis/processing    | Know whether work can continue          | Internal stage/run language appears prominently                                                                                | Medium   | Map stages to business language; put retry/technical diagnostics in Technical details                                   |
| Errors/empty states    | Recover confidently                     | Safe but often state-only rather than action-oriented                                                                          | Medium   | State what happened, what is safe, and the single next action without leaking resource existence                        |

## Persona needs

- **Director / executive:** opportunity readiness, deadline, top three risks, accountable owner, and next decision in under 30 seconds.
- **Proposal manager:** workflow stage, blockers, assignments, addendum changes, proposal issues, and deterministic readiness.
- **Contributor:** a focused personal queue with due date, reason, evidence, and one clear update action.
- **Administrator / technical reviewer:** processing health, provenance, schema/model/run versions, audit trail, isolation, and controlled remediation details.

## Navigation and terminology decisions

- Global navigation is limited to **Home**, **Opportunities**, **My Work**, **Reports**, and **Search**. Administration is not shown because the current membership model does not expose a safe, dedicated administration surface.
- Opportunity navigation is **Overview**, **Requirements**, **Submission Checklist**, **Proposal Review**, **Documents**, and **Reports**. Activity and Technical details remain contextual/progressively disclosed.
- The presentation preference is a **role view**, not an authorization role. Server-side membership and RLS remain the authority for access and mutation.
- Versioned terminology is `business-terminology-v2`; the database values remain unchanged.

## Eligibility and safety boundaries

This redesign never collapses source support, precedence, proof requirement, parser uncertainty, workflow completion, or human review. It never converts machine output into approval, changes qualified provider configuration, widens RLS, enables live providers, or exposes raw identifiers/prompts/secrets in business views.
