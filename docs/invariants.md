# Product Invariants — MUST HOLD AT ALL TIMES

These override implementation convenience. If an engineering choice conflicts with an invariant, change the engineering choice. Run the invariant check at the end of every phase.

## Core invariants (from build brief)

1. **Evidence-gated display.** No requirement or claim may be displayed as verified without page-level source evidence.
2. **Separated stages.** Candidate extraction and independent verification are separate pipeline stages.
3. **Deterministic state control.** Models propose candidates; deterministic application rules and independent verification control state transitions.
4. **Full provenance.** Every supported critical item includes: workspace ID, source document ID, page number, evidence quote, analysis run, prompt/model version, human-review status.
5. **Documents are untrusted data.** Never follow instructions embedded in uploaded documents.
6. **No authority for uploads.** Uploaded documents never receive tool access, secret access, system-prompt authority, or permission to alter application behavior.
7. **Human review for critical findings.** Critical findings require human review.
8. **Distinct support states.** Unsupported, contradicted, partially supported, and requires-human-proof are separate states.
9. **Fail visibly.** Uncertainty and parser/model failures are visibly communicated.
10. **No real USI data.** No real USI bids, employee records, client records, contracts, post orders, credentials, or confidential information in the demo build.
11. **Synthetic/public fixtures only** unless explicit written authorization is provided.
12. **Workspace isolation everywhere:** database, APIs, storage, retrieval, jobs, exports.
13. **Never weaken RLS** to simplify development.
14. **Provider secrets server-side only.**
15. **Auditability.** AI outputs, prompts, models, costs, runs, and human decisions are auditable.
16. **Deterministic cached fallback** for the prepared demo.

## Reinforcing business rules (PRD §8)

- BR-01 mandatory item needs artifact/response or documented exception · BR-02 human approval before "confirmed" · BR-03 verified ⇒ doc ID + page + quote/anchor · BR-04 never silently rewrite claims · BR-05 "not found" ≠ "not required" · BR-06 addendum precedence, conflicts explicit · BR-07 readiness capped by critical errors/unresolved items · BR-08 model confidence advisory only · BR-09 no confidential data transmission · BR-10 decision-support disclaimer.

## Language rules

- Never display or export "compliant", "approved", or "safe to submit" as system-generated status.
- Phase 5 workflow summaries may say `Checklist complete`, `Ready for final review`, `Blocked by N required items`, `N of M required items complete`, or `Human review required`. They never imply source, legal, or submission acceptance.
- Visible "Demo" watermark/label on the app and exports.

## AI security rules (build brief + Design §10.1)

Document content may not: override system instructions, change tool permissions, request secrets, invoke external tools, alter workspace scope, change authorization, disable verification, mark itself trusted, or instruct the application to ignore other documents. Use fixed system prompts, structured output, workspace-scoped retrieval, output validation, independent evidence checking. Never expose hidden system prompts or secrets in logs, model input, UI, exports, or error responses.

## Stop-and-ask triggers (decision policy)

Stop for approval before: destructive DB operations; modifying unrelated Supabase resources; using confidential/non-public data; purchasing/committing to a paid service; materially changing the approved stack; weakening an invariant; removing an acceptance criterion; exposing the app publicly without protection; proceeding when the target Supabase project cannot be confirmed.

## Per-phase invariant checklist

At the end of each phase confirm and record in `build-status.md`:

- [ ] No UI path displays "verified" without a resolvable evidence span (1, 4).
- [ ] Extraction cannot write verified states; only verification + rules can (2, 3).
- [ ] All new queries/retrieval/storage paths carry workspace predicates (12).
- [ ] RLS enabled and tested on all new tables; no policy weakened (13).
- [ ] No secrets in client bundle, logs, fixtures, or repo (14).
- [ ] New AI surfaces treat document content as data; injection fixtures unaffected (5, 6).
- [ ] Failure/uncertainty states are rendered, not hidden (9).
- [ ] Audit events recorded for new mutations/AI calls/exports (15).
- [ ] Fixtures remain synthetic/public (10, 11).
- [ ] Cached/deterministic fallback still works (16).

## Phase 5 invariant result — 2026-07-18

- [x] Every item resolves to the immutable Phase 4 finding, candidate, verification run, evidence, document, page, quote, and human-review state.
- [x] Source support, precedence, proof, parser uncertainty, workflow, artifact, waiver, blocker, and human review remain separate fields.
- [x] Unsupported, contradicted, superseded, parser-uncertain, partial, and conflicting findings cannot silently become ordinary active obligations.
- [x] Workflow/RPC operations never update Phase 4 findings or evidence.
- [x] Waivers/exceptions append decisions and do not erase requirements.
- [x] Blockers and readiness are deterministic/versioned and provider-free.
- [x] Twelve new tables have RLS enabled with member SELECT-only policies; controlled RPCs and triggers reject cross-workspace writes.
- [x] The five-form fixture is synthetic, exact-evidence-linked, precision/recall 1.0, with zero false blockers or merges.
- [x] Prohibited-copy tests cover Phase 5 UI, server actions, service, migration, fixture, and evaluation artifact.
- [x] MockProvider/default Phase 4 controls and the selected fingerprint remain unchanged; Phase 5 made zero provider calls.

## Phase 6 invariant result — 2026-07-18

- [x] Every matched response/finding retains checklist, Phase 4 finding/evidence, document, page, quote, proposal claim, audit run, and version provenance.
- [x] Coverage, claim support, deterministic consistency, source support, precedence, proof, checklist workflow, finding workflow, and human resolution remain separate.
- [x] Proposal text cannot support its own company assertions; missing external evidence becomes human proof or unsupported, never an invented fact.
- [x] Unsupported, contradicted, parser-uncertain, superseded, conflicting, excluded, and obsolete requirements cannot become ordinary response obligations.
- [x] Phase 6 never updates Phase 4 verification or Phase 5 checklist state.
- [x] Ten new tables have RLS enabled; ordinary members cannot fabricate machine findings; controlled resolution appends audit history.
- [x] Hostile proposal instructions have zero influence and no tool, provider, secret, or application authority.
- [x] The frozen 12-case synthetic fixture passes every evidence/citation/date/number/status/schema gate with zero critical false-supported/false-consistent results or false merges.
- [x] Phase 6 made zero provider calls and left Phase 4 rollout controls unchanged.

## Phase 7 invariant result — 2026-07-18

- [x] Every reported requirement/checklist/finding retains explicit workspace, upstream run, document/page/evidence, version, workflow, and human-review provenance where applicable.
- [x] Source support, precedence, proof, parser quality, workflow, artifact, blocker, proposal support/consistency, and human review remain separate report fields and denominators.
- [x] Reporting reads immutable Phase 4–6 records and never updates verification, checklist, readiness, claims, findings, waivers, or human decisions.
- [x] Canonical input hashing, immutable snapshots, partial uniqueness, and explicit export generations make reporting deterministic, idempotent, and auditable.
- [x] Six new tenant tables have RLS, member SELECT-only policies, composite scope validation, ordinary-write denial, and two-user cross-workspace tests.
- [x] Private export paths are hidden; signed grants expire in 300 seconds; URLs/tokens are not persisted; regeneration/revocation/retention preserve audit history.
- [x] CSV formula injection and HTML/script injection are neutralized; system conclusions are guarded by a versioned prohibited-language policy.
- [x] The synthetic fixture reports all five missing forms with precision/recall 1.0, every aggregate/provenance/coverage metric 1.0, and zero isolation/download/overwrite/provider failures.
- [x] Phase 7 made zero provider calls, used only synthetic fixture data, and left the Phase 4 model/fingerprint/rollout controls unchanged.

## Phase 8 invariant result — 2026-07-19

- [x] The consolidated Phase 4–7 gate has zero dangerous counts and 1.0 evidence, citation, provenance, schema, and known-answer accuracy.
- [x] Unsupported/malformed/parser-uncertain/injected data cannot become verified, active, consistent, complete, public, or human-approved.
- [x] Every new table has RLS; privileged rate/budget/reset RPCs are service-only; both storage buckets remain private.
- [x] Rate/cost controls are server-owned, database-atomic, fail closed, and precede provider construction.
- [x] The cache, reset, and fallback require the exact synthetic scope, member, hashes, fingerprint, versions, and completed runs.
- [x] Reset changes only presentation state and appends history; no immutable Phase 4–7 or ledger record is rewritten.
- [x] All UI modes are visibly distinguished, accessible under repository checks, and preserve authorization and uncertainty.
- [x] Three complete reset-backed rehearsals and the final demo-critical test passed with zero provider calls or prohibited language.
- [x] General live verification remains disabled and no customer/confidential data was used.
