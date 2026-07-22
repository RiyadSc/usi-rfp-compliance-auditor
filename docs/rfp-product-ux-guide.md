# RFP Product UX Guide

Version: `role-based-ux-v1` with terminology `business-terminology-v2`.

## Product promise

The product helps a response team understand an RFP, coordinate submission work, review a proposal draft, and prepare for a final human decision. It never represents a result as compliant, approved, guaranteed, or safe to submit.

Within 30 seconds, a director should be able to answer four questions: What opportunity is this? How ready is it? What are the three most important issues? What should happen next?

## Navigation

Global navigation has five destinations:

1. **Home** — attention queue, recommended start, active opportunities, personal-work preview, and recent business context.
2. **Opportunities** — the bid portfolio, separated from prepared demos, undefined drafts, and development/test workspaces.
3. **My Work** — current user assignments, due dates, workflow state, and company-evidence needs.
4. **Reports** — deterministic readiness and proposal-review reports across authorized opportunities.
5. **Search** — grouped, workspace-authorized search across opportunities, requirements, and checklist work.

Each opportunity has six stable destinations: **Overview**, **Requirements**, **Submission Checklist**, **Proposal Review**, **Documents**, and **Reports**. Activity is contextual. Technical metadata is progressively disclosed.

## Role views

The selector changes presentation density, not authorization:

- **Director:** readiness, risk, deadline, top issues, and next decision.
- **Proposal manager:** requirements, addenda, checklist groups, owners, proposal issues, and readiness.
- **Contributor:** assigned work, due dates, evidence, artifacts, and the next workflow action.
- **Technical reviewer:** run, evaluator, schema, hash, processing, and provenance details.

Membership, RLS, and controlled server/RPC paths remain the only authorization system.

## Nine-step guided workflow

1. Create opportunity — business.
2. Collect RFP files — business.
3. Read and organize documents — processing.
4. Review RFP requirements — review.
5. Build submission checklist — business.
6. Assign and complete work — business.
7. Review proposal draft — review.
8. Resolve issues and decisions — review.
9. Prepare final human review — business.

Processing completion is not human review. Workflow completion is not source support. Source support is not bidder compliance.

## Status language

- “Backed by the RFP” means exact validated active-source evidence supports the material requirement; human review is separate.
- “Current requirement” reflects the precedence axis only.
- “Company document needed” reflects proof requirement only.
- “Team review pending” means no authorized person has accepted or disputed the machine assessment.
- “Blocked” is a deterministic workflow result, not a source finding.

The underlying Phase 4 values remain unchanged and separately visible.

## Page patterns

- One page title, one short outcome statement, and one primary action.
- No more than six executive metrics on an overview.
- Top-three issue lists before exhaustive detail.
- Saved views before advanced filters.
- Action groups—blocked, unassigned, company evidence, dated work, active work, completed—before flat checklist tables.
- Evidence order: obligation, status axes, exact quote/page, conflicting or superseding source, human action, technical provenance.
- Technical IDs, hashes, prompt/schema/model versions, and raw workflow values appear only in Technical reviewer disclosure.

## Accessibility and responsive behavior

The shell provides a skip link, semantic global and local navigation, visible focus, labeled inputs, non-color status text, reduced-motion support, horizontal overflow containment, responsive cards, and a 390-pixel contributor scenario. Status explanations are written in text; color is supplementary.

## First-run walkthrough

1. Open Home and select **Open opportunity**.
2. Read the six overview signals and the recommended next action.
3. Follow the nine-step workflow to Requirements.
4. Open a requirement and trace the exact quote to the source page.
5. Open Submission Checklist and resolve the “Blocking submission” group first.
6. Use My Work for assigned actions.
7. Open Proposal Review and compare the RFP evidence with the proposal claim.
8. Open Reports for deterministic final-review support.

The prepared Harbor City workspace remains the recommended safe onboarding environment.
