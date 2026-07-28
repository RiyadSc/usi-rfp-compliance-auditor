# UX Discovery Workstream — Index

**Authorization:** Master UX Discovery and Product Experience Authorization (2026-07-25)  
**Status:** Four parallel tracks + temporary **DX0** + **Track 2 Expansion** (pre-Session 0). Discovery process locked; execute.  
**Visual redesign:** Treated as complete presentation layer; this workstream evaluates mental model, IA, workflow, and decision support — not visual polish.

**DX0:** `32-dx0-charter.md` · `33-dx0-screen-story-audit.md` · `34-dx0-change-log.md` · runbook DX0 path  
**Track 2 Expansion:** `35-track2-expansion-authorization.md` · inventory `36a-…` · change log `36-…`  
**Phase 9 Review Acceleration:** `37-phase9-review-acceleration-change-log.md`
**Operating cadence:** `26-parallel-tracks-and-change-gate.md`  
**Track 2 baseline log:** `29-track2-change-log.md`  
**Screen audit:** `27-screen-audit-decision-map.md`  
**Eng patterns:** `28-interaction-patterns.md`

## Evidence posture

| Grade                | Meaning                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Direct user evidence | Observations or tests with intended end users                                            |
| Stakeholder evidence | PRD, sponsor inputs, product decisions                                                   |
| Domain evidence      | Procurement / proposal practice literature and public RFP procedures                     |
| Behavioral evidence  | Privacy-preserving product telemetry or task metrics                                     |
| Proxy evidence       | Synthetic personas, fixture demos, tagged Playwright scenarios, expert review of docs/UI |
| Designer inference   | Hypotheses not yet validated                                                             |

**Current primary grades available:** Stakeholder, Domain (public RFP fixtures), Proxy (role-based UX audit/completion, persona e2e tags, demo rehearsals), Designer inference.  
**Stakeholder seeds in hand:** Kerry/Justin meeting signals (trust, missed forms, HITL) — see `16-…` and `18-…`.  
**Not yet available:** Direct observational sessions with USI; production behavioral analytics for this product.

No stop condition is met: valid proxies exist. Conclusions based only on inference remain hypotheses.

## Phase status

| Phase | Name                           | Status                         | Primary deliverables                                                |
| ----- | ------------------------------ | ------------------------------ | ------------------------------------------------------------------- |
| A     | Product comprehension          | Complete                       | `01-product-understanding.md`                                       |
| B     | Research framing               | Complete (draft)               | `02-assumption-register.md`, `03-research-plan.md`                  |
| C     | Current-state study            | Complete (proxy)               | `04-current-state-journey.md`, `05-service-blueprint.md`, `06`–`08` |
| D     | Experience diagnosis           | Complete (expert/proxy)        | `09-ux-risk-register.md`, `10-heuristic-cognitive-review.md`        |
| E     | Opportunity definition         | Complete (provisional)         | `11-experience-principles-and-opportunities.md`                     |
| F     | Concept generation             | Complete (concepts only)       | `12-concept-alternatives.md`                                        |
| G     | Validation                     | Session 0 next; 1–4 after demo | `20-session-0-demo-observation.md`, `18-…`, `14-…`                  |
| H     | Detailed design                | D-track in progress            | `19-…`, `21-…`, `22-…`, `23-…`                                      |
| I     | Implementation partnership     | Tier 1/2 unblocked per `23-…`  | Eng partnership when scheduled                                      |
| J     | Post-implementation validation | Not started                    | Outcome measurement                                                 |

**Required cognitive artifact:** `16-proposal-manager-cognitive-model.md` · gap map `17-…`  
**Decision backbone:** `24-decision-confidence-map.md`  
**Attention backbone:** `25-information-value-hierarchy.md` · **Evidence Budget:** `30-evidence-budget.md`  
**Session 0:** `20-session-0-demo-observation.md` · **Predictions (lock before demo):** `31-session-0-prediction-audit.md`  
**Evolution policy:** `23-product-evolution-guidance.md` (filter: friction or high-confidence decisions only)

**Process triad:** questions (`16`) · decisions (`24`) · attention (`25` + `30`).

**Cadence lock (UX-D018):** Stop expanding the process framework. Execute Session 0 + Track 2. Next major learning = Kerry/Justin demo, then contextual inquiry.

**Track 2 Expansion (UX-D020):** Session 0 is not a blocker for justified non-structural UX ships. Full surface pass logged in `36-…`.

See also: `13-decision-log.md`, `15-interim-synthesis.md`.

## Hard constraints (never weakened)

Authentication · workspace isolation · RLS · private storage · exact evidence · audit history · immutable machine findings · append-only human decisions · provider restrictions · cost controls · prohibited-language policy · human decision boundaries.

## Relation to prior UX work

`role-based-ux-v1` and the Evidence Intelligence visual redesign improved presentation, navigation separation, terminology projection, and role-density views. This workstream **re-opens** whether that structure matches real proposal work — it does not treat current routes or nav as final product definition.
