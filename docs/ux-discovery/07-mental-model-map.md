# Mental-Model Map

**Workstream:** UX Discovery — Phase C  
**Date:** 2026-07-25  
**Evidence:** Proxy (domain objects + UI labels) · Designer inference

Goal: bridge user language and system concepts **without corrupting** domain semantics.

---

## Concept pairs

| User is likely to say   | System stores / means                                                             | Bridge strategy (hypothesis)                                           |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| “This opportunity”      | `workspaces` row                                                                  | Keep Opportunity label; hide workspace jargon                          |
| “This requirement”      | Often `requirement_candidates` + linked `verification_findings` + human decisions | Present as one obligation card with separate axes — never merge fields |
| “We verified it”        | Ambiguous: source support vs human accepted                                       | Say “Backed by the RFP” vs “Source assessment accepted”                |
| “It’s current”          | `precedence_status = active`                                                      | “Current requirement” + link to replacing addendum when superseded     |
| “We need a certificate” | `proof_requirement = requires_company_artifact` OR finding `requires_human_proof` | Keep proof axis distinct from support                                  |
| “This task is done”     | Checklist `workflow_status = completed`                                           | “Task completed” + reminder it is not submission approval              |
| “We’re blocked”         | Deterministic blocker engine                                                      | Show blocker reason + linked obligation                                |
| “The AI found an issue” | Machine finding `machine_assessment_only` + pending human                         | “Machine-generated” + required human action                            |
| “This draft is fine”    | No such state; coverage/support/consistency axes                                  | Issue counts by type/severity for a revision                           |
| “We’re ready”           | `ready_for_final_review` readiness                                                | Never “compliant”; explain residual human gate                         |
| “The report says…”      | Immutable snapshot at generation time                                             | Show generated-at + regenerate CTA when decisions changed              |
| “Live analysis”         | Phase 9 separate graph                                                            | Needs IA placement so it is not confused with Phase 4 register         |

---

## Structural mismatches

```text
User thinks: “One requirement.”
System: parent/child relationships + atomic candidates + evidence spans + optional checklist items.

User thinks: “I finished the checklist item.”
System: workflow ≠ artifact review ≠ source support ≠ human acceptance of machine assessment ≠ readiness.

User thinks: “Search the RFP.”
System: Bounded substring over authorized structured rows — not full-document semantic search (R38).

User thinks: “Director view means I’m a director.”
System: localStorage presentation preference only.
```

---

## Design principle seed (to validate)

> Show one user-facing object when users need to act on one obligation, but keep the underlying axes separable at the moment of judgment.
