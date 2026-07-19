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
