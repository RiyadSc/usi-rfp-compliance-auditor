-- Phase 7: deterministic report snapshots and private exports. Additive only.
-- Upstream Phase 4-6 records remain immutable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-exports',
  'workspace-exports',
  false,
  10485760,
  array['text/csv','text/html']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'workspace-exports'
      and name = 'workspace-exports'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types @> array['text/csv','text/html']::text[]
      and cardinality(allowed_mime_types) = 2
  ) then
    raise exception 'workspace-exports bucket exists with an incompatible policy';
  end if;
end $$;

-- No authenticated storage.objects policy is created. The server validates
-- membership and uses its narrow service client for upload, signing, and removal.

alter table public.checklist_readiness_snapshots
  add constraint checklist_readiness_snapshots_id_workspace_unique unique (id, workspace_id);

create table public.report_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  checklist_generation_run_id uuid not null,
  readiness_snapshot_id uuid not null,
  proposal_audit_run_id uuid not null,
  proposal_draft_id uuid not null,
  report_type text not null check (report_type in ('executive','detailed_audit','findings','checklist','missing_artifacts','source_coverage')),
  report_version text not null,
  input_version text not null,
  aggregation_version text not null,
  schema_version text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  source_snapshot_at timestamptz not null,
  status text not null check (status in ('generating','completed','failed')),
  demo boolean not null,
  data_classification text not null check (data_classification in ('synthetic_demo','public','internal_authorized')),
  created_by uuid not null references auth.users(id),
  error_detail text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (analysis_run_id, workspace_id) references public.analysis_runs(id, workspace_id) on delete restrict,
  foreign key (verification_run_id, workspace_id) references public.verification_runs(id, workspace_id) on delete restrict,
  foreign key (checklist_generation_run_id, workspace_id) references public.checklist_generation_runs(id, workspace_id) on delete restrict,
  foreign key (readiness_snapshot_id, workspace_id) references public.checklist_readiness_snapshots(id, workspace_id) on delete restrict,
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete restrict,
  foreign key (proposal_draft_id, workspace_id) references public.proposal_drafts(id, workspace_id) on delete restrict,
  unique (workspace_id, input_hash, report_type, report_version),
  unique (id, workspace_id)
);

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  report_generation_run_id uuid not null,
  report_type text not null check (report_type in ('executive','detailed_audit','findings','checklist','missing_artifacts','source_coverage')),
  report_version text not null,
  schema_version text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  demo boolean not null,
  data_classification text not null check (data_classification in ('synthetic_demo','public','internal_authorized')),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  foreign key (report_generation_run_id, workspace_id) references public.report_generation_runs(id, workspace_id) on delete cascade,
  unique (report_generation_run_id),
  unique (id, workspace_id)
);

create table public.export_manifests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  report_snapshot_id uuid not null,
  export_format text not null check (export_format in ('csv','html')),
  csv_dataset text check (csv_dataset is null or csv_dataset in ('checklist_items','blockers','missing_artifacts','proposal_findings','proposal_claims','review_status','source_coverage')),
  manifest_version text not null,
  export_schema_version text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  regeneration_number integer not null default 1 check (regeneration_number >= 1),
  status text not null check (status in ('completed','failed','obsolete')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (report_snapshot_id, workspace_id) references public.report_snapshots(id, workspace_id) on delete restrict,
  check ((export_format = 'csv' and csv_dataset is not null) or (export_format = 'html' and csv_dataset is null)),
  unique (report_snapshot_id, export_format, csv_dataset, regeneration_number),
  unique (id, workspace_id)
);

create table public.export_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  export_manifest_id uuid not null,
  bucket_id text not null check (bucket_id = 'workspace-exports'),
  object_path text not null check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,199}$'),
  normalized_filename text not null check (normalized_filename ~ '^[a-z0-9][a-z0-9._-]{0,199}$'),
  content_type text not null check (content_type in ('text/csv','text/html')),
  content_length integer not null check (content_length between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  demo boolean not null,
  status text not null default 'active' check (status in ('active','revoked')),
  retention_until timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (export_manifest_id, workspace_id) references public.export_manifests(id, workspace_id) on delete restrict,
  unique (export_manifest_id),
  unique (bucket_id, object_path),
  unique (id, workspace_id)
);

create table public.export_download_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  export_artifact_id uuid not null,
  actor_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  foreign key (export_artifact_id, workspace_id) references public.export_artifacts(id, workspace_id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes 5 seconds'),
  unique (id, workspace_id)
);

create table public.export_access_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  export_artifact_id uuid not null,
  download_grant_id uuid,
  actor_id uuid references auth.users(id),
  event_type text not null check (event_type in ('signed_url_created','download_recorded','access_denied','revoked')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (export_artifact_id, workspace_id) references public.export_artifacts(id, workspace_id) on delete cascade,
  foreign key (download_grant_id, workspace_id) references public.export_download_grants(id, workspace_id) on delete restrict,
  unique (id, workspace_id)
);

create or replace function public.validate_phase7_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_analysis uuid; v_verification uuid; v_checklist uuid; v_draft uuid; v_workspace uuid;
begin
  if tg_table_name = 'report_generation_runs' then
    select analysis_run_id into v_analysis from public.verification_runs
      where id = new.verification_run_id and workspace_id = new.workspace_id and status = 'completed';
    if v_analysis is distinct from new.analysis_run_id then raise exception 'report verification scope mismatch'; end if;
    select analysis_run_id, verification_run_id into v_analysis, v_verification from public.checklist_generation_runs
      where id = new.checklist_generation_run_id and workspace_id = new.workspace_id and status = 'completed';
    if v_analysis is distinct from new.analysis_run_id or v_verification is distinct from new.verification_run_id
      then raise exception 'report checklist scope mismatch'; end if;
    if not exists(select 1 from public.checklist_readiness_snapshots where id = new.readiness_snapshot_id and workspace_id = new.workspace_id and generation_run_id = new.checklist_generation_run_id)
      then raise exception 'report readiness scope mismatch'; end if;
    select checklist_generation_run_id, proposal_draft_id into v_checklist, v_draft from public.proposal_audit_runs
      where id = new.proposal_audit_run_id and workspace_id = new.workspace_id and status = 'completed';
    if v_checklist is distinct from new.checklist_generation_run_id or v_draft is distinct from new.proposal_draft_id
      then raise exception 'report proposal scope mismatch'; end if;
  elsif tg_table_name = 'report_snapshots' then
    if not exists(select 1 from public.report_generation_runs where id = new.report_generation_run_id and workspace_id = new.workspace_id and input_hash = new.input_hash and report_type = new.report_type)
      then raise exception 'report snapshot scope mismatch'; end if;
  elsif tg_table_name = 'export_manifests' then
    if not exists(select 1 from public.report_snapshots where id = new.report_snapshot_id and workspace_id = new.workspace_id and input_hash = new.input_hash)
      then raise exception 'export manifest scope mismatch'; end if;
  elsif tg_table_name = 'export_artifacts' then
    select workspace_id into v_workspace from public.export_manifests where id = new.export_manifest_id;
    if v_workspace is distinct from new.workspace_id or split_part(new.object_path, '/', 1) <> new.workspace_id::text
      then raise exception 'export artifact scope mismatch'; end if;
  elsif tg_table_name = 'export_download_grants' then
    if not exists(select 1 from public.export_artifacts where id = new.export_artifact_id and workspace_id = new.workspace_id and status = 'active')
      then raise exception 'download grant scope mismatch'; end if;
    if not exists(select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.actor_id)
      then raise exception 'download actor is not a workspace member'; end if;
  elsif tg_table_name = 'export_access_events' then
    if not exists(select 1 from public.export_artifacts where id = new.export_artifact_id and workspace_id = new.workspace_id)
      then raise exception 'export access event scope mismatch'; end if;
    if new.download_grant_id is not null and not exists(select 1 from public.export_download_grants where id = new.download_grant_id and workspace_id = new.workspace_id and export_artifact_id = new.export_artifact_id)
      then raise exception 'export access grant scope mismatch'; end if;
  end if;
  return new;
end; $$;

create trigger trg_report_run_scope before insert or update on public.report_generation_runs for each row execute function public.validate_phase7_scope();
create trigger trg_report_snapshot_scope before insert or update on public.report_snapshots for each row execute function public.validate_phase7_scope();
create trigger trg_export_manifest_scope before insert or update on public.export_manifests for each row execute function public.validate_phase7_scope();
create trigger trg_export_artifact_scope before insert or update on public.export_artifacts for each row execute function public.validate_phase7_scope();
create trigger trg_export_grant_scope before insert or update on public.export_download_grants for each row execute function public.validate_phase7_scope();
create trigger trg_export_access_scope before insert or update on public.export_access_events for each row execute function public.validate_phase7_scope();

create or replace function public.reject_phase7_immutable_mutation()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Phase 7 record is immutable'; end; $$;

create or replace function public.validate_report_run_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.workspace_id <> new.workspace_id or old.analysis_run_id <> new.analysis_run_id
    or old.verification_run_id <> new.verification_run_id
    or old.checklist_generation_run_id <> new.checklist_generation_run_id
    or old.readiness_snapshot_id <> new.readiness_snapshot_id
    or old.proposal_audit_run_id <> new.proposal_audit_run_id
    or old.proposal_draft_id <> new.proposal_draft_id or old.report_type <> new.report_type
    or old.report_version <> new.report_version or old.input_version <> new.input_version
    or old.aggregation_version <> new.aggregation_version or old.schema_version <> new.schema_version
    or old.input_hash <> new.input_hash or old.source_snapshot_at <> new.source_snapshot_at
    or old.demo <> new.demo or old.data_classification <> new.data_classification
    or old.created_by <> new.created_by or old.created_at <> new.created_at
  then raise exception 'report run immutable fields changed'; end if;
  if old.status <> 'generating' or new.status not in ('completed','failed') or new.completed_at is null
  then raise exception 'invalid report run transition'; end if;
  if new.status = 'completed' and new.error_detail is not null
  then raise exception 'completed report run cannot contain an error'; end if;
  if new.status = 'failed' and char_length(trim(coalesce(new.error_detail,''))) < 1
  then raise exception 'failed report run requires an error'; end if;
  return new;
end; $$;
create trigger trg_report_run_update before update on public.report_generation_runs for each row execute function public.validate_report_run_update();

create trigger trg_report_snapshot_immutable before update or delete on public.report_snapshots for each row execute function public.reject_phase7_immutable_mutation();
create or replace function public.validate_export_manifest_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.workspace_id <> new.workspace_id or old.report_snapshot_id <> new.report_snapshot_id
    or old.export_format <> new.export_format or old.csv_dataset is distinct from new.csv_dataset
    or old.manifest_version <> new.manifest_version or old.export_schema_version <> new.export_schema_version
    or old.input_hash <> new.input_hash or old.regeneration_number <> new.regeneration_number
    or old.created_by <> new.created_by or old.created_at <> new.created_at
  then raise exception 'export manifest immutable fields changed'; end if;
  if not (old.status = 'completed' and new.status = 'obsolete')
  then raise exception 'invalid export manifest transition'; end if;
  return new;
end; $$;
create trigger trg_export_manifest_update before update on public.export_manifests for each row execute function public.validate_export_manifest_update();
create trigger trg_export_manifest_delete before delete on public.export_manifests for each row execute function public.reject_phase7_immutable_mutation();
create trigger trg_export_grant_immutable before update or delete on public.export_download_grants for each row execute function public.reject_phase7_immutable_mutation();
create trigger trg_export_access_immutable before update or delete on public.export_access_events for each row execute function public.reject_phase7_immutable_mutation();

create or replace function public.validate_export_artifact_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.workspace_id <> new.workspace_id or old.export_manifest_id <> new.export_manifest_id
    or old.bucket_id <> new.bucket_id or old.object_path <> new.object_path
    or old.normalized_filename <> new.normalized_filename or old.content_type <> new.content_type
    or old.content_length <> new.content_length or old.sha256 <> new.sha256
    or old.demo <> new.demo or old.retention_until <> new.retention_until
    or old.created_by <> new.created_by or old.created_at <> new.created_at
    then raise exception 'export artifact immutable fields changed'; end if;
  if not (old.status = 'active' and new.status = 'revoked' and new.revoked_at is not null and char_length(trim(coalesce(new.revocation_reason,''))) >= 5)
    then raise exception 'invalid export revocation'; end if;
  return new;
end; $$;
create trigger trg_export_artifact_update before update on public.export_artifacts for each row execute function public.validate_export_artifact_update();
create trigger trg_export_artifact_delete before delete on public.export_artifacts for each row execute function public.reject_phase7_immutable_mutation();

create index idx_report_runs_workspace on public.report_generation_runs(workspace_id, created_at desc);
create index idx_report_snapshots_workspace on public.report_snapshots(workspace_id, generated_at desc);
create index idx_export_artifacts_workspace on public.export_artifacts(workspace_id, created_at desc);
create index idx_export_grants_artifact on public.export_download_grants(export_artifact_id, expires_at desc);

alter table public.report_generation_runs enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.export_manifests enable row level security;
alter table public.export_artifacts enable row level security;
alter table public.export_download_grants enable row level security;
alter table public.export_access_events enable row level security;

create policy report_runs_select on public.report_generation_runs for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy report_snapshots_select on public.report_snapshots for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy export_manifests_select on public.export_manifests for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy export_artifacts_select on public.export_artifacts for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy export_download_grants_select on public.export_download_grants for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy export_access_events_select on public.export_access_events for select to authenticated using ((select public.is_workspace_member(workspace_id)));

-- Object paths are service-only metadata. Authenticated PostgREST clients can
-- read safe artifact columns but cannot select bucket_id or object_path.
revoke select on public.export_artifacts from authenticated;
grant select (id,workspace_id,export_manifest_id,normalized_filename,content_type,content_length,sha256,demo,status,retention_until,revoked_at,revocation_reason,created_by,created_at)
  on public.export_artifacts to authenticated;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
 'workspace_created','workspace_updated','workspace_archived','document_uploaded','document_validated','document_parsed','document_rejected','document_parse_failed','document_deleted',
 'analysis_started','analysis_completed','analysis_failed','verification_started','verification_completed','verification_failed','verification_reviewed','requirement_reviewed','checklist_item_updated','finding_resolved','export_generated','demo_reset',
 'checklist_generated','checklist_regenerated','checklist_item_created','checklist_item_obsoleted','checklist_owner_assigned','checklist_owner_reassigned','checklist_status_changed','checklist_artifact_linked','checklist_artifact_reviewed','checklist_artifact_removed','checklist_waiver_requested','checklist_waiver_decided','checklist_exception_created','checklist_exception_revised','checklist_blocker_created','checklist_blocker_resolved','checklist_blocker_reopened','checklist_readiness_calculated',
 'proposal_draft_registered','proposal_audit_started','proposal_audit_completed','proposal_audit_failed','proposal_finding_created','proposal_finding_resolved','proposal_revision_linked',
 'report_generation_requested','report_generation_completed','report_generation_failed','report_export_csv_created','report_export_html_created','report_export_regenerated','report_export_obsoleted','report_download_url_created','report_export_accessed','report_export_revoked','report_export_permission_denied'
));
