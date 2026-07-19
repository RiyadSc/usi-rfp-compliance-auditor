# Phase 7 Database and Storage

Migrations `20260718000021_phase7_reporting_exports` and `20260718000022_phase7_idempotency_hardening` are additive and applied to development project `uxmxkdjschbekkbnweby`.

## Objects

- `report_generation_runs` binds one completed Phase 4–6 run chain, source snapshot, data classification, report type, input hash, and all reporting versions. A partial unique index allows a failed run to be retried but prevents concurrent or duplicate live/completed inputs.
- `report_snapshots` stores one strict immutable aggregate and summary per run.
- `export_manifests` records format, optional CSV dataset, schema version, snapshot hash, and explicit regeneration number. An expression index treats the structured-report `NULL` dataset as a real unique value.
- `export_artifacts` stores service-only object coordinates, normalized filename, MIME type, size, SHA-256, retention, and active/revoked state. Only active-to-revoked is mutable.
- `export_download_grants` stores the actor, artifact, five-minute expiry, and policy version—not the URL or token.
- `export_access_events` stores signed-link creation, download request, denial, and revocation metadata.

Every tenant record has `workspace_id`. Composite foreign keys and `validate_phase7_scope` reject cross-workspace run, snapshot, manifest, artifact, grant, and access links even on privileged writes. Snapshots, grants, access events, and history are immutable. Run and artifact transitions are narrowly validated.

## RLS and privileges

All six tables have RLS enabled and a workspace-member SELECT policy only. No ordinary insert, update, or delete policy exists. `export_artifacts.object_path` and `bucket_id` are excluded from the authenticated column grant. Application mutations first authorize the authenticated user with the user-scoped client, then use the server-only privileged client.

## Private storage

`workspace-exports` is private, limited to 10 MiB, and accepts only `text/csv` and `text/html`. No authenticated `storage.objects` policy is created. The service owns upload, signing, revocation, and retention cleanup. Paths are `workspace/snapshot/artifact/normalized-filename`; writes never overwrite an existing object. Signed grants expire in 300 seconds. Explicit regeneration writes a new object and manifest, then revokes/removes the earlier object and marks its manifest obsolete.

Objects are retained for seven days by default. `purgeExpiredReportExportsForMaintenance` removes expired objects and records revocation/access/audit metadata while preserving immutable manifests. A copied bearer URL can remain usable until its short expiry; deletion prevents later grants and removes the backing object.
