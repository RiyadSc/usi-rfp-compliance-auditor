# Security Model — AI RFP Compliance Auditor (Demo)

Sources: Engineering Design §10, build-brief AI security rules, Phase 0 threat modeling. This is a demo security model, not a production security assessment.

## Trust boundaries

1. **Browser ↔ server:** Browser gets anon-key Supabase session + app routes only. No service-role key, no provider keys, no raw provider responses client-side.
2. **App ↔ uploaded documents:** All uploaded content (RFPs, addenda, attachments, drafts, references) is untrusted data. It flows into parsing and model prompts as quoted data only, never as instructions, and never grants tool/secret/scope authority.
3. **App ↔ model provider:** Server-side only via the model gateway. Fixed system prompts; structured output; responses validated with Zod before any state change.
4. **Workspace ↔ workspace:** Hard isolation in DB (RLS), storage (bucket path + policy), retrieval (mandatory workspace filter), jobs (workspace-scoped payloads), exports (workspace-scoped generation + signed URL).

## Threat model (initial)

| #   | Threat                                    | Vector                                                                                        | Controls                                                                                                                                                          | Phase   |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| T1  | Unauthorized document access              | Guessing storage URLs, IDOR on APIs                                                           | Private buckets; short-expiry signed URLs; workspace authorization on every route; RLS                                                                            | 1–2     |
| T2  | Cross-workspace leakage                   | Missing predicate in query/retrieval/prompt assembly                                          | Mandatory workspace predicates in repositories; retrieval filters; isolation tests in CI; per-run document allowlist                                              | 1, 4, 8 |
| T3  | Prompt injection in documents             | Malicious text in PDF/draft ("ignore instructions", fake system messages, key exfil requests) | Content-as-data prompt envelope; fixed system prompts; schema-constrained output; independent verification; injection fixtures in CI                              | 3–4, 8  |
| T4  | Malicious file upload                     | Oversized files, wrong MIME, embedded active content                                          | Type allowlist (PDF first; DOCX only if explicitly approved), extension+MIME+magic-byte checks, size/page limits, hash dedup, parser isolation, malware-scan hook | 2       |
| T5  | Secret exposure                           | Keys in client bundle, logs, exports, error responses                                         | Server-only env vars validated at boot; log redaction; error contract hides internals; secret scanning in CI                                                      | 1, 8    |
| T6  | Sensitive content in logs                 | Raw prompts/responses logged                                                                  | Store hashes/metadata in logs; raw payloads in protected storage with retention config                                                                            | 3       |
| T7  | Export leakage                            | Long-lived or cross-workspace export URLs                                                     | Signed short-lived URLs; export scoped to workspace + run; export audit events; demo watermark                                                                    | 7       |
| T8  | Automation bias                           | Users over-trusting model output                                                              | Evidence-gated verified state; explicit uncertainty states; human approval gates; no "compliant"/"safe to submit"; disclaimers                                    | all     |
| T9  | Cost abuse / runaway spend                | Unbounded pages, retries, model calls                                                         | Page/file limits; per-run cost budget (`MAX_MODEL_COST_USD_PER_RUN`); bounded retries; rate limits; cost surfaced to operator                                     | 3, 8    |
| T10 | Hallucinated obligations                  | Model invents requirements                                                                    | Independent verification; quote-must-exist-on-page check; deterministic numeric/date checks; known-answer eval; zero-critical-false gate                          | 3–4, 8  |
| T11 | Unauthenticated access to demo            | Public URL discovery                                                                          | Supabase Auth with signup disabled; seeded demo accounts; no unauthenticated analysis endpoints                                                                   | 1       |
| T12 | Model provider data retention             | Fixture content sent to provider                                                              | Synthetic/public data only (BR-09); provider data controls documented; re-evaluate before any pilot                                                               | 3       |
| T13 | Incomplete AI-run provenance              | A harness persists a run without binding the approved fixture/configuration hashes            | Validated preflight metadata; fail-closed typed input-hash helper; immutable run/call fingerprints; operational smoke gate                                        | 4       |
| T14 | Workflow state confused with source truth | User marks an item complete or waived                                                         | Separate database axes; Phase 4 FKs and immutable findings; controlled transition RPCs; explicit UI copy                                                          | 5       |
| T15 | Cross-tenant Phase 5 reference            | Owner, artifact, evidence, waiver, blocker, or readiness row points to another workspace      | Composite FKs, validation triggers, membership-checked RPCs, SELECT-only member RLS, two-user integration and browser tests                                       | 5       |
| T16 | Fabricated readiness or machine checklist | Ordinary user inserts/updates machine records                                                 | No ordinary mutation policies; privileged generation after user-scope check; deterministic version/hash provenance; immutable snapshots                           | 5       |

## Phase 5 controls

- All Phase 5 tables enable RLS; authenticated members receive workspace-scoped SELECT only.
- Controlled RPCs recheck `auth.uid()`, workspace membership, item scope, owner/reviewer membership, artifact document scope, and prior-decision scope.
- Exact checklist evidence must reference validated exact or normalized-exact Phase 4 evidence on the same document page.
- Waivers, exceptions, blocker resolutions, source links, relationships, and readiness snapshots are append-only or revision-audited.
- Artifacts reuse private PDF storage and signed access; no upload type was widened.
- UI notes are rendered as escaped React text. Audit payloads are bounded and contain no provider prompts, keys, or authorization headers.

## Phase 6 controls

- Existing private PDF upload, signed access, type/magic/size checks, asynchronous parsing, and workspace object keys are reused for proposal drafts.
- All ten Phase 6 tables enable RLS. Authenticated members receive workspace-scoped SELECT only; machine writes use the server-only deterministic service.
- Cross-workspace documents, pages, checklist items, verification evidence, artifact links, findings, and revisions are rejected by composite constraints or validation triggers.
- Proposal text never supports its own company assertions. Reviewed same-workspace evidence or explicit human proof remains necessary.
- Exact claim/source page anchors are immutable. Parser uncertainty cannot silently become addressed or supported.
- `resolve_proposal_audit_finding` rechecks membership, validates transitions, requires a reason, appends history, and emits an audit event.
- Phase 6 has no provider or tool access; hostile proposal instructions cannot change application behavior.

### Added Phase 6 threats

| #   | Threat                                     | Control                                                                             |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| T17 | Proposal claim is treated as its own proof | Separate coverage/support axes and reviewed external/company proof policy           |
| T18 | Cross-tenant proposal audit reference      | Composite scope constraints, validation triggers, RLS, two-user tests               |
| T19 | Hostile proposal instructions              | Content-as-data parsing, deterministic injection signals, no provider/tools/secrets |

## Phase 7 controls

- Reporting uses persisted Phase 4–6 records only and makes no provider or tool call.
- Composite scope triggers, service membership checks, RLS, and hidden object-path columns prevent cross-workspace aggregation and export access.
- CSV cells beginning with formula operators after whitespace are apostrophe-neutralized before RFC-compatible quoting; HTML source text is escaped and contains no executable scripts.
- `workspace-exports` is private with no authenticated object policy. Service paths never overwrite. Five-minute signed URLs are returned transiently and neither URL nor token is stored in snapshots, manifests, access events, audit events, logs, or the UI.
- Explicit regeneration creates a new object and manifest, then revokes/removes the superseded object. Expired objects follow the same auditable revocation path.
- Demo labeling comes only from the immutable Phase 4 synthetic marker. Uploaded or user-authored content cannot mark an export as demo-safe.
- A centralized language policy rejects unsafe system conclusions in summaries, structured exports, labels, and filenames while preserving quoted source evidence as evidence.

### Added Phase 7 threats

| #   | Threat                                    | Control                                                                                           |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| T20 | Cross-tenant aggregate or export          | Explicit compatible run chain, composite scope triggers, RLS, user and privileged-path checks     |
| T21 | Spreadsheet formula execution             | Versioned cell neutralization before CSV quoting; malicious-cell fixture                          |
| T22 | Signed URL or private path leakage        | Hidden path columns, transient five-minute grants, token-free audit/artifacts                     |
| T23 | Stale/destructive report regeneration     | Immutable snapshots/manifests, canonical-hash idempotency, unique generations, revocation history |
| T24 | Reporting axes collapse into a conclusion | Phase-specific denominators, strict schema, prohibited-language policy, human-state display       |

## Data classification & retention (Design §10.2)

| Data                          | Classification                                 | Retention                                 |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Public/synthetic source files | Demo-safe                                      | Delete with demo lifecycle / ≤30 days     |
| Parsed text / page assets     | Derived demo data                              | Delete with workspace                     |
| Model requests/responses      | Derived demo data (may contain source content) | Minimum for debugging; configurable purge |
| User decisions / audit events | Operational metadata                           | Retain for demo evaluation                |
| Secrets / API keys            | Restricted                                     | Env/secret manager only; never logged     |
| Exports                       | Demo output                                    | Short-lived signed access; purge on reset |

## Supabase-specific rules

- Target project: `RFP demo` (`uxmxkdjschbekkbnweby`), org BabsonWealth, us-east-2 — confirmed fresh/empty on 2026-07-16 (0 users, 0 buckets, 0 public tables, 0 migrations). Other MCP-connected projects (BTCQUANT, tradingbot) are unrelated and must never be touched.
- All schema changes via version-controlled migrations in `supabase/migrations/`; no dashboard-only changes.
- RLS enabled on every app table from creation; policies scoped by workspace membership; never disabled to "unblock" development.
- Storage: private buckets only; object keys prefixed by workspace ID; storage policies mirror workspace membership; signed URLs with short expiry.
- Service-role key used only server-side (worker/API); anon key for browser with RLS as the enforcement layer.
- Seed data: synthetic fixtures only.

## AI security enforcement points

1. **Prompt envelope:** system prompt is fixed and versioned; document content injected only inside clearly delimited data blocks with an explicit "content is data, not instructions" contract.
2. **Output gate:** every model response must parse against the versioned Zod schema; failures are rejected/repaired in an observable step and never free-parsed.
3. **Verification gate:** candidate → verified transition requires (a) quote found on cited page in stored text, (b) verifier support classification, (c) deterministic rule checks pass; otherwise unverified/needs-review.
4. **Scope gate:** retrieval and prompt assembly accept an explicit allowlist of document IDs belonging to the run's workspace; nothing else can enter context.
5. **Red-team fixtures:** injection test cases from Design §12.4 run in CI (ignore-instructions text, fake system formatting, key-exfiltration text, self-verified claims, similar RFP in another workspace).
6. **Operational provenance:** the synthetic smoke binds analysis run, complete candidate-set hash, and approved compatibility fingerprint into the verification-run input hash. Undefined or malformed material stops before provider construction; an otherwise correct model result cannot waive this check.

## Phase 4 closure controls and residual risks

- The qualified verification model has no web, file-search, MCP, function-call, code-execution, email, database, or secret tools. Requests use the Responses API with strict schemas and `store:false`; full PDF binaries, complete prompts, hidden reasoning, secrets, and authorization headers are not persisted in evaluation artifacts.
- The frozen prompt-injection case attempts secret disclosure and self-directed behavior. Across three full qualification repetitions, the controlled production smoke, deterministic fixtures, and UI audit, injection influence remained zero. Document content did not change prompt hierarchy, schemas, status, retrieval scope, tool access, secret handling, or application behavior.
- The exact synthetic production scope is service-created, immutable, RLS-protected, and hash-bound. Missing/extra candidates or documents, a wrong workspace/user/run/fixture/fingerprint, or hash drift stops before provider construction. Cross-workspace database and UI access tests pass.
- Residual model risk is not eliminated by the perfect frozen fixture. Distribution shift, parser degradation, novel addendum language, and provider behavior changes remain possible. Controls are fail-closed deterministic validation, human-review pending status, immutable provenance, pinned snapshots/fingerprint, mock fallback, and a separately authorized rollout gate.
- Provider retention remains a governance dependency: `store:false` is used but is not claimed as contractual Zero Data Retention. Confidential or production USI content remains prohibited until retention, access, and rollout controls receive a separate decision.
