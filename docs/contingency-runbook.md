# Contingency Runbook

- **No checklist run:** confirm a completed Phase 4 verification run exists and the user is a workspace member; generation fails closed otherwise.
- **Missing source quote:** inspect Phase 4 evidence. A supported item without validated exact evidence is review-needed, never ordinary active.
- **Unexpected blocker count:** compare generation, blocker, and readiness versions; rerun the deterministic fixture; do not hand-edit machine blockers.
- **Regeneration conflict:** preserve existing human fields, mark replaced machine structure obsolete, and review audit events. Never delete reviewed records.
- **Artifact link rejected:** confirm the document is parsed, non-deleted, PDF-validated, and belongs to the same workspace.
- **Assignment rejected:** confirm the owner/reviewer is an active member of the exact workspace.
- **RLS or cross-workspace anomaly:** stop the demo, retain audit evidence, run the integration isolation suite, and do not bypass RLS.
- **Migration discrepancy:** stop writes, compare `supabase_migrations.schema_migrations` with repository migrations, and apply only a reviewed additive correction.
- **Provider or Phase 4 issue:** keep MockProvider and general live verification controls unchanged. Phase 5 does not require a provider.
- **Proposal audit unavailable:** confirm the PDF is parsed with type `proposal_draft`, the selected checklist run is completed, and both belong to the exact workspace.
- **Unexpected missing/partial response:** open the atomic claim and exact Phase 4 source; do not hand-edit the machine match. Record a human follow-up decision and add a deterministic regression before changing matcher policy.
- **Proposal parser uncertainty:** inspect the original signed PDF page. Keep the finding unresolved until a reliable parse or human decision exists.
- **Revision conflict:** link the explicit prior draft, retain both audits, and inspect correction findings. Never delete the prior revision or resolution history.
- **Phase 6 isolation anomaly:** stop audit writes, retain the audit event trail, run the Phase 6 RLS/integration suite, and do not bypass the controlled RPC.
- **Report chain rejected:** confirm analysis, verification, checklist generation, readiness snapshot, proposal audit, and draft belong to one workspace and compatible completed run chain. Never mix run IDs to make a report succeed.
- **Report hash unexpectedly changes:** compare canonical source records, latest human decisions, upstream versions, report type, and source snapshot. Do not reuse an old snapshot under a new hash.
- **Private export unavailable:** confirm artifact state, retention, membership, and bucket policy. Generate a new short-lived grant; never expose the stored object path or make the bucket public.
- **Export regeneration fails:** retain both manifests and audit events, verify whether the predecessor object was revoked, and use the idempotency integration test. Never overwrite an existing object.
- **CSV injection regression:** stop CSV distribution, rerun `reporting-domain.test.ts` and `eval:mock:reporting`, and fix the versioned neutralizer before regenerating exports.
- **Retention cleanup not running:** deny expired grants, invoke the reviewed maintenance purge from a server-only environment, and verify revocation/access events. Do not extend URLs or add a public policy.
- **Phase 7 isolation anomaly:** stop report/export mutations, preserve audit/access evidence, run the reporting integration and RLS suites, and do not bypass membership or composite scope checks.

## Phase 8 presentation contingencies

| Scenario                                                  | Diagnosis and approved action                                                                                      | Audience disclosure / prohibited action                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Application unavailable                                   | Check local web health; restart only before the demo and rerun preflight                                           | Do not claim a live system is running; show no unvalidated screenshot as current |
| Supabase unavailable                                      | Stop mutations; use the already generated local rehearsal screenshot only as an explicitly historical illustration | Do not bypass RLS or move files public                                           |
| Parser unavailable                                        | Show parser-uncertain state and original page where available                                                      | State that human review is required; do not infer missing/support                |
| Worker/verification/checklist/proposal result unavailable | Use prepared completed cache only if exact binding validates                                                       | Disclose cached mode; never fabricate a run                                      |
| Cache miss/stale fixture                                  | Stop; reprovision via repository script and rerun exact hash preflight                                             | Do not loosen hashes, versions, workspace, or user binding                       |
| Report generation failure                                 | Activate the exact private prepared fallback                                                                       | Disclose pre-generated snapshot and original provenance                          |
| Signed download failure/expired/revoked                   | Keep report visible in app; request one new authorized grant only if service is healthy                            | Do not extend expiry, expose object paths, or make the bucket public             |
| Unexpected auth/session state                             | Close the browser context, start a fresh one, sign in again, and verify workspace identity                         | Never reuse another user's session or infer a workspace                          |
| Browser/slow network                                      | Refresh once; use cached/offline-read-only mode only if the exact cache remains valid                              | Disclose mode and stale limitations; no fake progress                            |
| Reset failure                                             | Stop; run dry-run and inspect exact scope/hash/audit                                                               | Never select an arbitrary workspace or hand-edit immutable rows                  |
| Partial interruption                                      | Resume only from a visibly validated prepared/cached screen or restart from reset                                  | Explain the restart; do not represent a partial run as complete                  |

For every case preserve auditability, authorization, private storage, uncertainty, and the language policy. If exact provenance cannot be re-established, stop the demo.

## Large-document recovery

- Format disagreement: stop; never rename or relax signature/MIME checks.
- Archive rejection: inspect bounded metadata only; never disable traversal, ratio, size, nesting, or type controls.
- Failed PDF page: retry that unit; the worker revalidates scope/hash and decodes only that page.
- Expired lease: let the service worker reclaim it; never hand-edit ownership/attempt limits.
- OCR/parser uncertainty: show original source and require review; do not infer support or absence.
- Cost blocked: use quick scan/reduce scope or seek approval; do not bypass the hard maximum.
- Cache miss: honor its reason; changed sources/addenda/versions must not reuse stale output.

# Phase 9 acceptance contingency

Do not rerun a failed Phase 9 provider execution. Preserve the evaluation run, provider usage, cache rows, reservation/settlement, and failure artifact. Complete provider-free diagnosis only, keep ordinary live verification disabled, and obtain a new explicit authorization before another provider call.

If failure occurs before provider construction, correct only repository-owned migration, provisioning, source-hash, call-plan, cache, test, or environment defects; rerun every affected offline gate and commit to a clean tree. Never loosen source evidence, expected answers, workspace isolation, model pins, strict schemas, or the `$3.00` ceiling.
