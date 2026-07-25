-- Phase 9: coverage-led public-RFP recovery, exact call plans, cache, and $3 ledger.
-- Target: development project uxmxkdjschbekkbnweby only. Additive and fail-closed.

alter table public.spend_ledger drop constraint if exists spend_ledger_phase_check;
alter table public.spend_ledger add constraint spend_ledger_phase_check
  check (phase in ('phase3','phase4','phase9'));
alter table public.spend_ledger drop constraint if exists spend_ledger_kind_check;
alter table public.spend_ledger add constraint spend_ledger_kind_check
  check (kind in (
    'embed','extract','verify','adjustment',
    'coverage_classification','targeted_extraction','independent_verification',
    'exception_review'
  ));

create table public.phase9_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  mode text not null check (mode in ('dry_run','acceptance_live','cached_rerun')),
  status text not null default 'planned'
    check (status in ('planned','reserved','running','completed','failed','cancelled')),
  source_package_hash text not null check (source_package_hash ~ '^[0-9a-f]{64}$'),
  expected_answer_hash text not null check (expected_answer_hash ~ '^[0-9a-f]{64}$'),
  call_plan_hash text not null check (call_plan_hash ~ '^[0-9a-f]{64}$'),
  compatibility_fingerprint text not null check (compatibility_fingerprint ~ '^[0-9a-f]{64}$'),
  versions jsonb not null check (jsonb_typeof(versions)='object'),
  planned_maximum_usd numeric(12,6) not null check (planned_maximum_usd between 0 and 3),
  actual_usd numeric(12,6) check (actual_usd between 0 and 3),
  provider_call_count integer not null default 0 check (provider_call_count >= 0),
  cache_hit_count integer not null default 0 check (cache_hit_count >= 0),
  error_category text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,source_package_hash,call_plan_hash,mode,id),
  unique(id,workspace_id)
);
create index phase9_evaluation_runs_scope_idx
  on public.phase9_evaluation_runs(workspace_id,created_at desc);

create table public.phase9_source_block_coverage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  block_hash text not null check (block_hash ~ '^[0-9a-f]{64}$'),
  source_document_id uuid not null,
  source_document_key text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  block_type text not null check (block_type in (
    'page_window','table','spreadsheet_cell','portal','native_block'
  )),
  page_number integer check (page_number is null or page_number > 0),
  sheet_name text,
  cell_range text,
  heading_path jsonb not null default '[]'::jsonb check (jsonb_typeof(heading_path)='array'),
  route text not null check (route in (
    'selected_for_deterministic_candidate','selected_for_ai_extraction',
    'selected_for_table_extraction','selected_for_spreadsheet_extraction',
    'reviewed_and_rejected_as_non_requirement','parser_uncertain',
    'duplicate_source_content','excluded_with_versioned_reason'
  )),
  deterministic_signals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(deterministic_signals)='array'),
  processing_result text not null,
  exclusion_reason text,
  coverage_version text not null check (coverage_version='phase9-source-coverage-v1'),
  created_at timestamptz not null default now(),
  unique(evaluation_run_id,block_hash),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(source_document_id,workspace_id)
    references public.documents(id,workspace_id) on delete restrict
);
create index phase9_source_block_coverage_scope_idx
  on public.phase9_source_block_coverage(workspace_id,evaluation_run_id,route);

create table public.phase9_candidate_seeds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  candidate_hash text not null check (candidate_hash ~ '^[0-9a-f]{64}$'),
  source_block_hashes jsonb not null check (
    jsonb_typeof(source_block_hashes)='array' and jsonb_array_length(source_block_hashes)>0
  ),
  requirement_type text not null,
  obligation_text text not null,
  evidence_text text not null,
  material_facts jsonb not null default '{}'::jsonb check (jsonb_typeof(material_facts)='object'),
  discovery_route text not null check (discovery_route in (
    'deterministic','table','spreadsheet','ai_targeted','coverage_sweep'
  )),
  machine_status text not null default 'candidate_unverified'
    check (machine_status='candidate_unverified'),
  miner_version text not null check (miner_version='phase9-deterministic-miner-v1'),
  created_at timestamptz not null default now(),
  unique(evaluation_run_id,candidate_hash),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);
create index phase9_candidate_seeds_scope_idx
  on public.phase9_candidate_seeds(workspace_id,evaluation_run_id);

create table public.phase9_call_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  plan_hash text not null unique check (plan_hash ~ '^[0-9a-f]{64}$'),
  source_package_hash text not null check (source_package_hash ~ '^[0-9a-f]{64}$'),
  plan jsonb not null check (jsonb_typeof(plan)='object'),
  task_count integer not null check (task_count >= 0),
  maximum_usd numeric(12,6) not null check (maximum_usd between 0 and 3),
  plan_version text not null check (plan_version='phase9-exact-call-plan-v1'),
  created_at timestamptz not null default now(),
  unique(id,workspace_id),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);

create table public.phase9_call_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  call_plan_id uuid not null,
  task_hash text not null check (task_hash ~ '^[0-9a-f]{64}$'),
  task_type text not null check (task_type in (
    'coverage_classification','targeted_extraction',
    'independent_verification','exception_review'
  )),
  model_tier text not null check (model_tier in ('tier1','tier2','tier3','tier4')),
  model_id text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  source_block_hashes jsonb not null check (jsonb_typeof(source_block_hashes)='array'),
  candidate_hashes jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_hashes)='array'),
  maximum_input_tokens integer not null check (maximum_input_tokens > 0),
  maximum_output_tokens integer not null check (maximum_output_tokens > 0),
  maximum_retries integer not null check (maximum_retries between 0 and 1),
  maximum_usd numeric(12,6) not null check (maximum_usd > 0 and maximum_usd <= 3),
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  escalation_reason text not null,
  status text not null default 'planned'
    check (status in ('planned','cached','running','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  unique(call_plan_id,task_hash),
  unique(id,workspace_id),
  foreign key(call_plan_id,workspace_id)
    references public.phase9_call_plans(id,workspace_id) on delete restrict
);

create table public.phase9_provider_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  source_package_hash text not null check (source_package_hash ~ '^[0-9a-f]{64}$'),
  task_type text not null,
  model_id text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  schema_adherent boolean not null,
  status text not null check (status in ('complete','invalid','revoked')),
  provider_request_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  cache_version text not null check (cache_version='phase9-provider-cache-v1'),
  created_at timestamptz not null default now(),
  unique(workspace_id,cache_key),
  unique(id,workspace_id)
);

create table public.phase9_provider_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  call_plan_task_id uuid not null,
  provider_request_id text not null unique,
  model_id text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  cost_usd numeric(12,6) not null check (cost_usd >= 0),
  response_status text not null check (response_status in (
    'completed','incomplete','refused','failed','timeout'
  )),
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(call_plan_task_id,workspace_id)
    references public.phase9_call_plan_tasks(id,workspace_id) on delete restrict
);

create table public.phase9_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  candidate_hash text not null check (candidate_hash ~ '^[0-9a-f]{64}$'),
  source_support_status text not null check (source_support_status in (
    'supported','partially_supported','unsupported','contradicted','parser_uncertain'
  )),
  precedence_status text not null check (precedence_status in (
    'active','superseded','conflicting','undetermined'
  )),
  proof_requirement text not null check (proof_requirement in (
    'none_identified','requires_human_confirmation','requires_company_artifact',
    'requires_external_validation','undetermined'
  )),
  evidence_block_hashes jsonb not null check (
    jsonb_typeof(evidence_block_hashes)='array'
    and (
      source_support_status <> 'supported'
      or jsonb_array_length(evidence_block_hashes) > 0
    )
  ),
  ambiguity_code text,
  machine_only boolean not null default true check (machine_only),
  human_review_status text not null default 'pending' check (human_review_status='pending'),
  decision_version text not null check (decision_version='phase9-deterministic-verification-v1'),
  created_at timestamptz not null default now(),
  unique(evaluation_run_id,candidate_hash),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);
create index phase9_findings_scope_idx
  on public.phase9_findings(workspace_id,evaluation_run_id,source_support_status);

create table public.phase9_dependency_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  source_kind text not null check (source_kind in (
    'source_block','candidate','evidence','finding','checklist_item','proposal_finding'
  )),
  source_key text not null,
  target_kind text not null check (target_kind in (
    'candidate','evidence','finding','checklist_item','proposal_finding','report'
  )),
  target_key text not null,
  dependency_version text not null check (dependency_version='phase9-dependency-graph-v1'),
  created_at timestamptz not null default now(),
  unique(evaluation_run_id,source_kind,source_key,target_kind,target_key),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);

create table public.phase9_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique check (request_key ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  call_plan_hash text not null check (call_plan_hash ~ '^[0-9a-f]{64}$'),
  reserved_usd numeric(12,6) not null check (reserved_usd > 0 and reserved_usd <= 3),
  actual_usd numeric(12,6) check (actual_usd between 0 and 3),
  status text not null default 'reserved' check (status in ('reserved','settled','released')),
  policy_version text not null check (policy_version='phase9-budget-v1'),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(id,workspace_id),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);

create or replace function public.reserve_phase9_call_plan(
  p_request_key text,
  p_workspace_id uuid,
  p_evaluation_run_id uuid,
  p_call_plan_hash text,
  p_requested_usd numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_existing public.phase9_budget_reservations%rowtype;
  v_plan public.phase9_call_plans%rowtype;
  v_spent numeric;
  v_reserved numeric;
  v_id uuid;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'phase9 service role required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phase9-budget-v1',0));
  select * into v_existing from public.phase9_budget_reservations
    where request_key=p_request_key;
  if found then
    if v_existing.workspace_id<>p_workspace_id
      or v_existing.evaluation_run_id<>p_evaluation_run_id
      or v_existing.call_plan_hash<>p_call_plan_hash
      or v_existing.reserved_usd<>p_requested_usd
    then raise exception 'phase9 reservation identity mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_plan from public.phase9_call_plans
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and plan_hash=p_call_plan_hash;
  if not found or v_plan.maximum_usd<>p_requested_usd or p_requested_usd>3 then
    raise exception 'phase9 exact call plan required';
  end if;
  select coalesce(sum(actual_usd),0) into v_spent
    from public.phase9_budget_reservations where status='settled';
  select coalesce(sum(reserved_usd),0) into v_reserved
    from public.phase9_budget_reservations where status='reserved';
  if v_spent+v_reserved+p_requested_usd>3 then
    raise exception 'phase9 budget exceeded';
  end if;
  insert into public.phase9_budget_reservations(
    request_key,workspace_id,evaluation_run_id,call_plan_hash,reserved_usd
  ) values (
    p_request_key,p_workspace_id,p_evaluation_run_id,p_call_plan_hash,p_requested_usd
  ) returning id into v_id;
  update public.phase9_evaluation_runs set status='reserved'
    where id=p_evaluation_run_id and workspace_id=p_workspace_id and status='planned';
  return v_id;
end $$;

create or replace function public.settle_phase9_call_plan(
  p_reservation_id uuid,
  p_actual_usd numeric
) returns void language plpgsql security definer set search_path='' as $$
declare v_row public.phase9_budget_reservations%rowtype;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'phase9 service role required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phase9-budget-v1',0));
  select * into v_row from public.phase9_budget_reservations where id=p_reservation_id for update;
  if not found then raise exception 'phase9 reservation missing'; end if;
  if p_actual_usd<0 or p_actual_usd>v_row.reserved_usd then
    raise exception 'phase9 settlement exceeds reservation';
  end if;
  if v_row.status='settled' then
    if v_row.actual_usd<>p_actual_usd then raise exception 'phase9 settlement mismatch'; end if;
    return;
  end if;
  if v_row.status<>'reserved' then raise exception 'phase9 reservation not active'; end if;
  update public.phase9_budget_reservations set
    status='settled',actual_usd=p_actual_usd,settled_at=now()
    where id=p_reservation_id;
  insert into public.spend_ledger(
    workspace_id,kind,estimated_cost_usd,note,phase
  ) values (
    v_row.workspace_id,'verify',p_actual_usd,
    'phase9 FAC115 final acceptance; reservation='||p_reservation_id::text,'phase9'
  );
end $$;

create or replace function public.release_phase9_call_plan(p_reservation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'phase9 service role required';
  end if;
  update public.phase9_budget_reservations set status='released',settled_at=now()
    where id=p_reservation_id and status='reserved';
end $$;

revoke all on function public.reserve_phase9_call_plan(text,uuid,uuid,text,numeric)
  from public,anon,authenticated;
revoke all on function public.settle_phase9_call_plan(uuid,numeric)
  from public,anon,authenticated;
revoke all on function public.release_phase9_call_plan(uuid)
  from public,anon,authenticated;
grant execute on function public.reserve_phase9_call_plan(text,uuid,uuid,text,numeric)
  to service_role;
grant execute on function public.settle_phase9_call_plan(uuid,numeric)
  to service_role;
grant execute on function public.release_phase9_call_plan(uuid)
  to service_role;

do $$ declare t text; begin
  foreach t in array array[
    'phase9_evaluation_runs','phase9_source_block_coverage','phase9_candidate_seeds',
    'phase9_call_plans','phase9_call_plan_tasks','phase9_provider_cache',
    'phase9_provider_usage','phase9_findings','phase9_dependency_edges',
    'phase9_budget_reservations'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_workspace_member(workspace_id)))',
      t||'_select',t
    );
  end loop;
end $$;

grant select on public.phase9_evaluation_runs,public.phase9_source_block_coverage,
  public.phase9_candidate_seeds,public.phase9_call_plans,public.phase9_call_plan_tasks,
  public.phase9_provider_cache,public.phase9_provider_usage,public.phase9_findings,
  public.phase9_dependency_edges to authenticated;

create or replace function public.reject_phase9_immutable_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'phase9 evaluation history is immutable'; end $$;

do $$ declare t text; begin
  foreach t in array array[
    'phase9_source_block_coverage','phase9_candidate_seeds','phase9_call_plans',
    'phase9_call_plan_tasks','phase9_provider_usage','phase9_findings',
    'phase9_dependency_edges'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.reject_phase9_immutable_mutation()',
      t||'_immutable',t
    );
  end loop;
end $$;
