-- Phase 8: provider-free final hardening. Additive only.

create table public.operation_rate_limit_buckets (
  operation text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  request_count integer not null check (request_count > 0),
  last_request_at timestamptz not null default now(),
  policy_version text not null check (policy_version = 'phase8-rate-limits-v1'),
  primary key(operation,key_hash,window_started_at)
);
create index operation_rate_limit_cleanup_idx on public.operation_rate_limit_buckets(last_request_at);

create table public.provider_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (request_key ~ '^[0-9a-f]{64}$'),
  phase text not null check (phase in ('phase3','phase4')),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  analysis_run_id uuid not null references public.analysis_runs(id) on delete restrict,
  kind text not null check (kind in ('embed','extract','verify')),
  reserved_usd numeric(12,6) not null check (reserved_usd > 0),
  actual_usd numeric(12,6) check (actual_usd >= 0),
  status text not null default 'reserved' check (status in ('reserved','settled','released')),
  policy_version text not null check (policy_version = 'phase8-cost-controls-v1'),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(id,workspace_id)
);
create index provider_budget_reservations_scope_idx
  on public.provider_budget_reservations(phase,workspace_id,actor_id,status);

create table public.provider_budget_adjustments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.provider_budget_reservations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  amount_usd numeric(12,6) not null check (amount_usd <> 0),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.spend_ledger
  add column if not exists budget_reservation_id uuid unique
  references public.provider_budget_reservations(id) on delete restrict;

create table public.performance_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in (
    'page_load','server_response','workspace_load','document_viewer','requirement_register',
    'evidence_viewer','checklist_generation','checklist_render','proposal_audit',
    'proposal_audit_render','report_generation','report_render','export_generation',
    'signed_download','demo_reset'
  )),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  item_count integer check (item_count between 0 and 100000),
  page_count integer check (page_count between 0 and 10000),
  cache_outcome text check (cache_outcome in ('hit','miss','not_applicable','rejected')),
  status text not null check (status in ('success','failure')),
  error_category text check (error_category in (
    'authorization','rate_limited','budget_exceeded','invalid_input','stale_cache','storage',
    'parser','provider','timeout','unavailable','internal'
  )),
  policy_version text not null check (policy_version = 'phase8-performance-v1'),
  created_at timestamptz not null default now()
);
create index performance_events_scope_idx on public.performance_events(workspace_id,created_at desc);

create table public.phase8_demo_scopes (
  id uuid primary key,
  workspace_id uuid not null unique references public.workspaces(id) on delete restrict,
  authorized_identity_id uuid not null references auth.users(id) on delete restrict,
  source_document_id uuid not null references public.documents(id) on delete restrict,
  proposal_document_id uuid not null references public.documents(id) on delete restrict,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  checklist_generation_run_id uuid not null,
  readiness_snapshot_id uuid not null,
  proposal_audit_run_id uuid not null,
  proposal_draft_id uuid not null,
  report_snapshot_id uuid not null,
  fixture_version text not null check (fixture_version = 'full-roadmap-known-answer-v1'),
  fixture_hash text not null check (fixture_hash ~ '^[0-9a-f]{64}$'),
  document_set_hash text not null check (document_set_hash ~ '^[0-9a-f]{64}$'),
  compatibility_fingerprint text not null check (compatibility_fingerprint = 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b'),
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  report_input_hash text not null check (report_input_hash ~ '^[0-9a-f]{64}$'),
  binding jsonb not null,
  synthetic_marker text not null check (synthetic_marker = 'phase8-synthetic-demo-only'),
  scope_version text not null check (scope_version = 'phase8-prepared-demo-v1'),
  active_mode text not null default 'prepared' check (active_mode in ('prepared','cached','fallback','offline_read_only')),
  created_at timestamptz not null default now(),
  unique(id,workspace_id),
  foreign key(workspace_id,analysis_run_id) references public.analysis_runs(workspace_id,id) on delete restrict,
  foreign key(workspace_id,verification_run_id) references public.verification_runs(workspace_id,id) on delete restrict,
  foreign key(workspace_id,checklist_generation_run_id) references public.checklist_generation_runs(workspace_id,id) on delete restrict,
  foreign key(workspace_id,readiness_snapshot_id) references public.checklist_readiness_snapshots(workspace_id,id) on delete restrict,
  foreign key(workspace_id,proposal_audit_run_id) references public.proposal_audit_runs(workspace_id,id) on delete restrict,
  foreign key(workspace_id,proposal_draft_id) references public.proposal_drafts(workspace_id,id) on delete restrict,
  foreign key(workspace_id,report_snapshot_id) references public.report_snapshots(workspace_id,id) on delete restrict
);

create or replace function public.validate_phase8_demo_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=new.authorized_identity_id)
    or not exists(select 1 from public.documents where id=new.source_document_id and workspace_id=new.workspace_id and status='parsed' and deleted_at is null)
    or not exists(select 1 from public.documents where id=new.proposal_document_id and workspace_id=new.workspace_id and status='parsed' and deleted_at is null)
    or new.binding->>'workspaceId' is distinct from new.workspace_id::text
    or new.binding->>'authorizedIdentityId' is distinct from new.authorized_identity_id::text
    or new.binding->>'sourceDocumentId' is distinct from new.source_document_id::text
    or new.binding->>'proposalDocumentId' is distinct from new.proposal_document_id::text
    or new.binding->>'compatibilityFingerprint' is distinct from new.compatibility_fingerprint
    or new.binding->>'fixtureHash' is distinct from new.fixture_hash
    or new.binding->>'documentSetHash' is distinct from new.document_set_hash
    or new.binding->>'cacheKey' is distinct from new.cache_key
  then raise exception 'phase8 demo scope binding mismatch'; end if;
  return new;
end $$;
create trigger phase8_demo_scope_validate before insert on public.phase8_demo_scopes
for each row execute function public.validate_phase8_demo_scope();

create table public.phase8_demo_cache_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  scope_id uuid not null,
  cache_key text not null unique check (cache_key ~ '^[0-9a-f]{64}$'),
  report_snapshot_id uuid not null,
  binding_hash text not null check (binding_hash ~ '^[0-9a-f]{64}$'),
  fixture_hash text not null check (fixture_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'valid' check (status in ('valid','stale','revoked')),
  cache_version text not null check (cache_version = 'phase8-demo-cache-v1'),
  created_at timestamptz not null default now(),
  foreign key(scope_id,workspace_id) references public.phase8_demo_scopes(id,workspace_id) on delete restrict,
  foreign key(workspace_id,report_snapshot_id) references public.report_snapshots(workspace_id,id) on delete restrict
);

create table public.phase8_demo_fallbacks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  scope_id uuid not null,
  report_snapshot_id uuid not null,
  export_artifact_id uuid not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  label text not null check (label = 'Prepared fallback snapshot — synthetic data'),
  status text not null default 'active' check (status in ('active','revoked')),
  fallback_version text not null check (fallback_version = 'phase8-report-fallback-v1'),
  created_at timestamptz not null default now(),
  unique(scope_id,report_snapshot_id),
  foreign key(scope_id,workspace_id) references public.phase8_demo_scopes(id,workspace_id) on delete restrict,
  foreign key(workspace_id,report_snapshot_id) references public.report_snapshots(workspace_id,id) on delete restrict,
  foreign key(workspace_id,export_artifact_id) references public.export_artifacts(workspace_id,id) on delete restrict
);

create table public.phase8_demo_reset_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  scope_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  dry_run boolean not null,
  status text not null check (status in ('validated','completed','failed')),
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  final_state_hash text check (final_state_hash ~ '^[0-9a-f]{64}$'),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  reset_version text not null check (reset_version = 'phase8-demo-reset-v1'),
  error_category text,
  created_at timestamptz not null default now(),
  foreign key(scope_id,workspace_id) references public.phase8_demo_scopes(id,workspace_id) on delete restrict
);

create table public.phase8_demo_presentation_state (
  scope_id uuid primary key,
  workspace_id uuid not null,
  mode text not null check (mode in ('prepared','cached','fallback','offline_read_only')),
  state jsonb not null check (jsonb_typeof(state)='object'),
  state_version text not null check (state_version='phase8-demo-reset-v1'),
  reset_count integer not null default 0 check (reset_count >= 0),
  updated_at timestamptz not null default now(),
  foreign key(scope_id,workspace_id) references public.phase8_demo_scopes(id,workspace_id) on delete restrict
);

create or replace function public.reject_phase8_immutable_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'phase8 history is immutable'; end $$;

create trigger phase8_demo_scopes_immutable before update or delete on public.phase8_demo_scopes
for each row execute function public.reject_phase8_immutable_mutation();
create trigger phase8_demo_cache_immutable before update or delete on public.phase8_demo_cache_entries
for each row execute function public.reject_phase8_immutable_mutation();
create trigger phase8_demo_fallbacks_immutable before update or delete on public.phase8_demo_fallbacks
for each row execute function public.reject_phase8_immutable_mutation();
create trigger phase8_demo_reset_runs_immutable before update or delete on public.phase8_demo_reset_runs
for each row execute function public.reject_phase8_immutable_mutation();
create trigger performance_events_immutable before update or delete on public.performance_events
for each row execute function public.reject_phase8_immutable_mutation();
create trigger provider_budget_adjustments_immutable before update or delete on public.provider_budget_adjustments
for each row execute function public.reject_phase8_immutable_mutation();

create or replace function public.reset_phase8_demo(
  p_scope_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_scope_hash text,
  p_dry_run boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_scope public.phase8_demo_scopes%rowtype;
  v_expected_hash text;
  v_state jsonb := jsonb_build_object(
    'mode','prepared',
    'selectedRequirementKey',null,
    'selectedFindingKey',null,
    'findingReviewDemonstrated',false,
    'exportGrantDemonstrated',false
  );
  v_final_hash text;
  v_started timestamptz := clock_timestamp();
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$' then raise exception 'demo reset unavailable'; end if;
  select * into v_scope from public.phase8_demo_scopes
    where id=p_scope_id and workspace_id=p_workspace_id
      and authorized_identity_id=p_actor_id
      and synthetic_marker='phase8-synthetic-demo-only';
  if v_scope.id is null or not exists(
    select 1 from public.workspace_members
      where workspace_id=p_workspace_id and user_id=p_actor_id
  ) then raise exception 'demo reset unavailable'; end if;
  select binding_hash into v_expected_hash from public.phase8_demo_cache_entries
    where scope_id=p_scope_id and workspace_id=p_workspace_id and status='valid';
  if v_expected_hash is distinct from p_scope_hash then raise exception 'demo reset unavailable'; end if;
  v_final_hash := encode(extensions.digest(convert_to(v_state::text,'UTF8'),'sha256'),'hex');
  if p_dry_run then
    return jsonb_build_object('dryRun',true,'scopeHash',p_scope_hash,'finalStateHash',v_final_hash,'mutated',false);
  end if;
  insert into public.phase8_demo_presentation_state(scope_id,workspace_id,mode,state,state_version,reset_count)
  values(p_scope_id,p_workspace_id,'prepared',v_state,'phase8-demo-reset-v1',1)
  on conflict(scope_id) do update set
    mode='prepared',state=excluded.state,state_version=excluded.state_version,
    reset_count=public.phase8_demo_presentation_state.reset_count+1,updated_at=now()
  where public.phase8_demo_presentation_state.workspace_id=excluded.workspace_id;
  if not found then raise exception 'demo reset unavailable'; end if;
  insert into public.phase8_demo_reset_runs(workspace_id,scope_id,actor_id,dry_run,status,scope_hash,final_state_hash,duration_ms,reset_version)
  values(p_workspace_id,p_scope_id,p_actor_id,false,'completed',p_scope_hash,v_final_hash,
    greatest(0,(extract(epoch from (clock_timestamp()-v_started))*1000)::integer),'phase8-demo-reset-v1');
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
  values(p_workspace_id,'system',p_actor_id,'demo_reset_completed','phase8_demo_scope',p_scope_id,
    jsonb_build_object('reset_version','phase8-demo-reset-v1','scope_hash',p_scope_hash));
  return jsonb_build_object('dryRun',false,'scopeHash',p_scope_hash,'finalStateHash',v_final_hash,'mutated',true);
end $$;

create or replace function public.consume_phase8_rate_limit(
  p_operation text,
  p_key_hash text,
  p_workspace_id uuid default null,
  p_actor_id uuid default null
) returns table(allowed boolean, limit_value integer, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_window integer;
  v_start timestamptz;
  v_count integer;
begin
  select x.limit_value,x.window_seconds into v_limit,v_window
  from (values
    ('sign_in',60,300),('upload_initialize',12,300),('upload_finalize',12,300),
    ('parse_request',8,300),('extraction_request',4,600),('verification_request',3,600),
    ('checklist_generation',12,300),('checklist_workflow',60,300),('proposal_audit',8,600),
    ('proposal_resolution',30,300),('report_generation',8,300),('export_generation',12,300),
    ('signed_download',20,300),('demo_reset',3,900)
  ) as x(operation,limit_value,window_seconds) where x.operation=p_operation;
  if v_limit is null or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid rate-limit request'; end if;
  v_start := to_timestamp(floor(extract(epoch from clock_timestamp())/v_window)*v_window);
  insert into public.operation_rate_limit_buckets(operation,key_hash,workspace_id,window_started_at,window_seconds,request_count,policy_version)
  values(p_operation,p_key_hash,p_workspace_id,v_start,v_window,1,'phase8-rate-limits-v1')
  on conflict(operation,key_hash,window_started_at) do update
    set request_count=public.operation_rate_limit_buckets.request_count+1,last_request_at=now()
    where public.operation_rate_limit_buckets.request_count < v_limit
  returning request_count into v_count;
  if v_count is null then
    select request_count into v_count from public.operation_rate_limit_buckets
      where operation=p_operation and key_hash=p_key_hash and window_started_at=v_start;
    if p_workspace_id is not null then
      insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
      values(p_workspace_id,'system',p_actor_id,'security_rate_limited','workspace',p_workspace_id,
        jsonb_build_object('operation',p_operation,'policy_version','phase8-rate-limits-v1'));
    end if;
    return query select false,v_limit,0,greatest(1,ceil(extract(epoch from (v_start+make_interval(secs=>v_window)-clock_timestamp())))::integer);
  else
    return query select true,v_limit,greatest(0,v_limit-v_count),v_window;
  end if;
end $$;

create or replace function public.reserve_provider_budget(
  p_request_key text,p_phase text,p_workspace_id uuid,p_actor_id uuid,p_analysis_run_id uuid,
  p_kind text,p_requested_max_usd numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_phase_ceiling numeric;
  v_run_max numeric;
  v_spent numeric;
  v_pending numeric;
  v_workspace numeric;
  v_actor numeric;
  v_id uuid;
begin
  if p_request_key !~ '^[0-9a-f]{64}$' or p_requested_max_usd <= 0 then raise exception 'invalid budget reservation'; end if;
  if p_phase='phase3' then v_phase_ceiling:=10; v_run_max:=1;
  elsif p_phase='phase4' then v_phase_ceiling:=15; v_run_max:=1.35;
  else raise exception 'invalid provider phase'; end if;
  if p_requested_max_usd > v_run_max then raise exception 'provider per-run maximum exceeded'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id) then raise exception 'provider budget scope denied'; end if;
  if not exists(select 1 from public.analysis_runs where id=p_analysis_run_id and workspace_id=p_workspace_id) then raise exception 'provider budget run denied'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provider-budget:'||p_phase,0));
  select id into v_id from public.provider_budget_reservations where request_key=p_request_key;
  if v_id is not null then return v_id; end if;
  select coalesce(sum(estimated_cost_usd),0) into v_spent from public.spend_ledger where phase=p_phase;
  select coalesce(sum(reserved_usd),0) into v_pending from public.provider_budget_reservations where phase=p_phase and status='reserved';
  select coalesce(sum(estimated_cost_usd),0) into v_workspace from public.spend_ledger where phase=p_phase and workspace_id=p_workspace_id;
  select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into v_actor from public.provider_budget_reservations where phase=p_phase and actor_id=p_actor_id and status in ('reserved','settled');
  if v_spent+v_pending+p_requested_max_usd > v_phase_ceiling or v_workspace+p_requested_max_usd > v_phase_ceiling or v_actor+p_requested_max_usd > v_phase_ceiling then raise exception 'provider budget exceeded'; end if;
  insert into public.provider_budget_reservations(request_key,phase,workspace_id,actor_id,analysis_run_id,kind,reserved_usd,policy_version)
  values(p_request_key,p_phase,p_workspace_id,p_actor_id,p_analysis_run_id,p_kind,p_requested_max_usd,'phase8-cost-controls-v1') returning id into v_id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
  values(p_workspace_id,'system',p_actor_id,'provider_budget_reserved','provider_budget_reservation',v_id,
    jsonb_build_object('phase',p_phase,'maximum_usd',p_requested_max_usd,'policy_version','phase8-cost-controls-v1'));
  return v_id;
end $$;

create or replace function public.settle_provider_budget(
  p_reservation_id uuid,p_actual_usd numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.provider_budget_reservations%rowtype;
begin
  select * into v from public.provider_budget_reservations where id=p_reservation_id for update;
  if v.id is null or p_actual_usd < 0 or p_actual_usd > v.reserved_usd then raise exception 'invalid provider settlement'; end if;
  if v.status='settled' then
    if v.actual_usd<>p_actual_usd then raise exception 'provider settlement conflict'; end if;
    return v.id;
  end if;
  if v.status<>'reserved' then raise exception 'provider reservation not active'; end if;
  update public.provider_budget_reservations set status='settled',actual_usd=p_actual_usd,settled_at=now() where id=v.id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
  values(v.workspace_id,'system',v.actor_id,'provider_budget_settled','provider_budget_reservation',v.id,
    jsonb_build_object('phase',v.phase,'actual_usd',p_actual_usd,'policy_version','phase8-cost-controls-v1'));
  return v.id;
end $$;

revoke all on function public.consume_phase8_rate_limit(text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.reserve_provider_budget(text,text,uuid,uuid,uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.settle_provider_budget(uuid,numeric) from public,anon,authenticated;
revoke all on function public.reset_phase8_demo(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.consume_phase8_rate_limit(text,text,uuid,uuid) to service_role;
grant execute on function public.reserve_provider_budget(text,text,uuid,uuid,uuid,text,numeric) to service_role;
grant execute on function public.settle_provider_budget(uuid,numeric) to service_role;
grant execute on function public.reset_phase8_demo(uuid,uuid,uuid,text,boolean) to service_role;

alter table public.operation_rate_limit_buckets enable row level security;
alter table public.provider_budget_reservations enable row level security;
alter table public.provider_budget_adjustments enable row level security;
alter table public.performance_events enable row level security;
alter table public.phase8_demo_scopes enable row level security;
alter table public.phase8_demo_cache_entries enable row level security;
alter table public.phase8_demo_fallbacks enable row level security;
alter table public.phase8_demo_reset_runs enable row level security;
alter table public.phase8_demo_presentation_state enable row level security;

create policy performance_events_select on public.performance_events for select to authenticated
using (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy phase8_demo_scopes_select on public.phase8_demo_scopes for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy phase8_demo_cache_select on public.phase8_demo_cache_entries for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy phase8_demo_fallbacks_select on public.phase8_demo_fallbacks for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy phase8_demo_reset_runs_select on public.phase8_demo_reset_runs for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy phase8_demo_presentation_state_select on public.phase8_demo_presentation_state for select to authenticated
using (public.is_workspace_member(workspace_id));

grant select on public.performance_events,public.phase8_demo_scopes,public.phase8_demo_cache_entries,
  public.phase8_demo_fallbacks,public.phase8_demo_reset_runs to authenticated;
grant select on public.phase8_demo_presentation_state to authenticated;
revoke all on public.operation_rate_limit_buckets,public.provider_budget_reservations,
  public.provider_budget_adjustments from anon,authenticated;

revoke all on function public.reject_phase8_immutable_mutation() from public,anon,authenticated;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
 'workspace_created','workspace_updated','workspace_archived','document_uploaded','document_validated','document_parsed','document_rejected','document_parse_failed','document_deleted',
 'analysis_started','analysis_completed','analysis_failed','verification_started','verification_completed','verification_failed','verification_reviewed','requirement_reviewed','checklist_item_updated','finding_resolved','export_generated','demo_reset',
 'checklist_generated','checklist_regenerated','checklist_item_created','checklist_item_obsoleted','checklist_owner_assigned','checklist_owner_reassigned','checklist_status_changed','checklist_artifact_linked','checklist_artifact_reviewed','checklist_artifact_removed','checklist_waiver_requested','checklist_waiver_decided','checklist_exception_created','checklist_exception_revised','checklist_blocker_created','checklist_blocker_resolved','checklist_blocker_reopened','checklist_readiness_calculated',
 'proposal_draft_registered','proposal_audit_started','proposal_audit_completed','proposal_audit_failed','proposal_finding_created','proposal_finding_resolved','proposal_revision_linked',
 'report_generation_requested','report_generation_completed','report_generation_failed','report_export_csv_created','report_export_html_created','report_export_regenerated','report_export_obsoleted','report_download_url_created','report_export_accessed','report_export_revoked','report_export_permission_denied',
 'security_rate_limited','provider_budget_reserved','provider_budget_settled','provider_budget_adjusted','performance_recorded','demo_cache_used','demo_cache_rejected','demo_fallback_activated','demo_reset_dry_run','demo_reset_completed','demo_reset_failed'
));
