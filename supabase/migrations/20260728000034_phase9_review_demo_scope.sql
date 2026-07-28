-- Provider-free prepared demo binding for the Phase 9 review workflow.
-- Machine records remain immutable; reset creates a fresh copy of the
-- synthetic template run and moves only the presentation pointer.

create table public.phase9_review_demo_scopes (
  id uuid primary key,
  workspace_id uuid not null unique references public.workspaces(id) on delete restrict,
  phase8_scope_id uuid not null,
  template_evaluation_run_id uuid not null,
  synthetic_marker text not null
    check (synthetic_marker='phase9-review-acceleration-demo-only'),
  scope_version text not null check (scope_version='phase9-review-demo-v1'),
  source_package_hash text not null check (source_package_hash ~ '^[0-9a-f]{64}$'),
  document_set_hash text not null check (document_set_hash ~ '^[0-9a-f]{64}$'),
  expected_answer_hash text not null check (expected_answer_hash ~ '^[0-9a-f]{64}$'),
  compatibility_fingerprint text not null
    check (compatibility_fingerprint ~ '^[0-9a-f]{64}$'),
  candidate_set_hash text not null check (candidate_set_hash ~ '^[0-9a-f]{64}$'),
  source_block_set_hash text not null
    check (source_block_set_hash ~ '^[0-9a-f]{64}$'),
  finding_count integer not null check (finding_count=25),
  candidate_seed_count integer not null check (candidate_seed_count=26),
  source_block_count integer not null check (source_block_count=22),
  coverage_exception_count integer not null check (coverage_exception_count=3),
  created_at timestamptz not null default now(),
  unique(id,workspace_id),
  foreign key(phase8_scope_id,workspace_id)
    references public.phase8_demo_scopes(id,workspace_id) on delete restrict,
  foreign key(template_evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);

create or replace function public.validate_phase9_review_demo_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_run public.phase9_evaluation_runs%rowtype;
  v_count integer;
  v_hash text;
begin
  select * into v_run from public.phase9_evaluation_runs
  where id=new.template_evaluation_run_id and workspace_id=new.workspace_id;
  if not found or v_run.status<>'completed'
    or v_run.actual_usd is distinct from 0::numeric
    or v_run.provider_call_count<>0 or v_run.expected_answers_used
    or v_run.source_package_hash<>new.source_package_hash
    or v_run.document_set_hash is distinct from new.document_set_hash
    or v_run.expected_answer_hash<>new.expected_answer_hash
    or v_run.compatibility_fingerprint<>new.compatibility_fingerprint
  then raise exception 'prepared phase9 review template binding mismatch'; end if;
  if (select count(*) from public.phase9_evaluation_documents
      where workspace_id=new.workspace_id
        and evaluation_run_id=new.template_evaluation_run_id)<>1
    or not exists (
      select 1 from public.phase9_evaluation_documents d
      join public.phase8_demo_scopes s
        on s.id=new.phase8_scope_id and s.workspace_id=new.workspace_id
        and s.source_document_id=d.document_id
      where d.workspace_id=new.workspace_id
        and d.evaluation_run_id=new.template_evaluation_run_id
        and d.source_hash=(
          select sha256 from public.documents
          where id=d.document_id and workspace_id=d.workspace_id
        )
    )
  then raise exception 'prepared phase9 review document binding mismatch'; end if;

  select count(*),encode(extensions.digest(
    convert_to(coalesce(string_agg(candidate_hash,E'\n' order by candidate_hash),''),
      'UTF8'),'sha256'),'hex')
  into v_count,v_hash from public.phase9_candidate_seeds
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.template_evaluation_run_id;
  if v_count<>new.candidate_seed_count or v_hash<>new.candidate_set_hash then
    raise exception 'prepared phase9 review candidate population mismatch';
  end if;

  select count(*),encode(extensions.digest(
    convert_to(coalesce(string_agg(block_hash,E'\n' order by block_hash),''),
      'UTF8'),'sha256'),'hex')
  into v_count,v_hash from public.phase9_source_block_coverage
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.template_evaluation_run_id;
  if v_count<>new.source_block_count or v_hash<>new.source_block_set_hash then
    raise exception 'prepared phase9 review source population mismatch';
  end if;

  select count(*) into v_count from public.phase9_findings
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.template_evaluation_run_id;
  if v_count<>new.finding_count then
    raise exception 'prepared phase9 review finding population mismatch';
  end if;

  if exists (
    select 1 from public.phase9_findings f
    where f.workspace_id=new.workspace_id
      and f.evaluation_run_id=new.template_evaluation_run_id
      and (
        not exists (
          select 1 from public.phase9_candidate_seeds s
          where s.workspace_id=f.workspace_id
            and s.evaluation_run_id=f.evaluation_run_id
            and s.candidate_hash=f.candidate_hash
        )
        or exists (
          select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
          where not exists (
            select 1 from public.phase9_source_block_coverage c
            where c.workspace_id=f.workspace_id
              and c.evaluation_run_id=f.evaluation_run_id
              and c.block_hash=h.value
          )
        )
      )
  ) then raise exception 'prepared phase9 review provenance is incomplete'; end if;

  select count(*) into v_count from public.phase9_coverage_exception_pages_v1
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.template_evaluation_run_id;
  if v_count<>new.coverage_exception_count then
    raise exception 'prepared phase9 review coverage population mismatch';
  end if;
  if exists (
    select 1 from public.phase9_provider_usage
    where workspace_id=new.workspace_id
      and evaluation_run_id=new.template_evaluation_run_id
  ) then raise exception 'prepared phase9 review template must be provider free'; end if;
  return new;
end $$;

create trigger phase9_review_demo_scopes_validate
  before insert on public.phase9_review_demo_scopes
  for each row execute function public.validate_phase9_review_demo_scope();

create table public.phase9_review_demo_states (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  demo_scope_id uuid not null,
  active_evaluation_run_id uuid not null,
  reset_count integer not null default 0 check (reset_count>=0),
  state_version text not null check (state_version='phase9-review-demo-state-v1'),
  updated_at timestamptz not null default now(),
  foreign key(demo_scope_id,workspace_id)
    references public.phase9_review_demo_scopes(id,workspace_id) on delete restrict,
  foreign key(active_evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict
);

create trigger phase9_review_demo_scopes_immutable
  before update or delete on public.phase9_review_demo_scopes
  for each row execute function public.reject_phase9_immutable_mutation();

alter table public.phase9_review_demo_scopes enable row level security;
alter table public.phase9_review_demo_states enable row level security;

create policy phase9_review_demo_scopes_select
  on public.phase9_review_demo_scopes for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy phase9_review_demo_states_select
  on public.phase9_review_demo_states for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.phase9_review_demo_scopes,public.phase9_review_demo_states
  to authenticated;

create or replace function public.reset_phase9_review_demo(
  p_workspace_id uuid,p_demo_scope_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text;
  v_scope public.phase9_review_demo_scopes%rowtype;
  v_template public.phase9_evaluation_runs%rowtype;
  v_run_id uuid := gen_random_uuid();
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'prepared demo service role required';
  end if;
  if p_actor_id is null then raise exception 'prepared demo owner required'; end if;
  select role into v_role from public.workspace_members
  where workspace_id=p_workspace_id and user_id=p_actor_id;
  if v_role<>'owner' then raise exception 'prepared demo owner required'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended('phase9-review-demo-v1:'||p_workspace_id::text,0)
  );
  select * into v_scope from public.phase9_review_demo_scopes
  where id=p_demo_scope_id and workspace_id=p_workspace_id
    and synthetic_marker='phase9-review-acceleration-demo-only'
    and scope_version='phase9-review-demo-v1';
  if not found then raise exception 'prepared phase9 review demo unavailable'; end if;
  if not exists (
    select 1 from public.phase8_demo_scopes
    where id=v_scope.phase8_scope_id and workspace_id=p_workspace_id
      and authorized_identity_id=p_actor_id
      and synthetic_marker='phase8-synthetic-demo-only'
  ) then raise exception 'prepared demo identity binding mismatch'; end if;
  select * into v_template from public.phase9_evaluation_runs
  where id=v_scope.template_evaluation_run_id and workspace_id=p_workspace_id
    and status='completed' and actual_usd=0 and provider_call_count=0;
  if not found then raise exception 'prepared phase9 review template unavailable'; end if;
  if (select count(*) from public.phase9_candidate_seeds
      where workspace_id=p_workspace_id
        and evaluation_run_id=v_scope.template_evaluation_run_id)
      <> v_scope.candidate_seed_count
    or (select count(*) from public.phase9_findings
      where workspace_id=p_workspace_id
        and evaluation_run_id=v_scope.template_evaluation_run_id)
      <> v_scope.finding_count
    or (select count(*) from public.phase9_source_block_coverage
      where workspace_id=p_workspace_id
        and evaluation_run_id=v_scope.template_evaluation_run_id)
      <> v_scope.source_block_count
  then raise exception 'prepared phase9 review template population drift'; end if;

  insert into public.phase9_evaluation_runs(
    id,workspace_id,actor_id,mode,status,source_package_hash,expected_answer_hash,
    call_plan_hash,compatibility_fingerprint,versions,planned_maximum_usd,actual_usd,
    provider_call_count,cache_hit_count,started_at,completed_at,document_set_hash,
    expected_answers_used,requested_maximum_usd
  ) values (
    v_run_id,p_workspace_id,p_actor_id,'cached_rerun','completed',
    v_template.source_package_hash,v_template.expected_answer_hash,
    v_template.call_plan_hash,v_template.compatibility_fingerprint,v_template.versions,
    0,0,0,0,now(),now(),v_template.document_set_hash,
    v_template.expected_answers_used,0
  );

  insert into public.phase9_evaluation_documents(
    workspace_id,evaluation_run_id,document_id,source_hash,ordinal,page_count
  )
  select workspace_id,v_run_id,document_id,source_hash,ordinal,page_count
  from public.phase9_evaluation_documents
  where workspace_id=p_workspace_id
    and evaluation_run_id=v_scope.template_evaluation_run_id;

  insert into public.phase9_source_block_coverage(
    workspace_id,evaluation_run_id,block_hash,source_document_id,
    source_document_key,source_hash,block_type,page_number,sheet_name,cell_range,
    heading_path,route,deterministic_signals,processing_result,exclusion_reason,
    coverage_version
  )
  select
    workspace_id,v_run_id,block_hash,source_document_id,source_document_key,
    source_hash,block_type,page_number,sheet_name,cell_range,heading_path,route,
    deterministic_signals,processing_result,exclusion_reason,coverage_version
  from public.phase9_source_block_coverage
  where workspace_id=p_workspace_id
    and evaluation_run_id=v_scope.template_evaluation_run_id;

  insert into public.phase9_candidate_seeds(
    workspace_id,evaluation_run_id,candidate_hash,source_block_hashes,
    requirement_type,obligation_text,evidence_text,material_facts,
    discovery_route,machine_status,miner_version
  )
  select
    workspace_id,v_run_id,candidate_hash,source_block_hashes,requirement_type,
    obligation_text,evidence_text,material_facts,discovery_route,machine_status,
    miner_version
  from public.phase9_candidate_seeds
  where workspace_id=p_workspace_id
    and evaluation_run_id=v_scope.template_evaluation_run_id;

  insert into public.phase9_findings(
    workspace_id,evaluation_run_id,candidate_hash,source_support_status,
    precedence_status,proof_requirement,evidence_block_hashes,ambiguity_code,
    machine_only,human_review_status,decision_version
  )
  select
    workspace_id,v_run_id,candidate_hash,source_support_status,precedence_status,
    proof_requirement,evidence_block_hashes,ambiguity_code,machine_only,
    human_review_status,decision_version
  from public.phase9_findings
  where workspace_id=p_workspace_id
    and evaluation_run_id=v_scope.template_evaluation_run_id;

  insert into public.phase9_review_demo_states(
    workspace_id,demo_scope_id,active_evaluation_run_id,reset_count,state_version
  ) values (
    p_workspace_id,p_demo_scope_id,v_run_id,1,'phase9-review-demo-state-v1'
  )
  on conflict(workspace_id) do update set
    active_evaluation_run_id=excluded.active_evaluation_run_id,
    reset_count=public.phase9_review_demo_states.reset_count+1,
    updated_at=now();

  if (select count(*) from public.phase9_candidate_seeds
      where workspace_id=p_workspace_id and evaluation_run_id=v_run_id)
      <> v_scope.candidate_seed_count
    or (select count(*) from public.phase9_findings
      where workspace_id=p_workspace_id and evaluation_run_id=v_run_id)
      <> v_scope.finding_count
    or (select count(*) from public.phase9_source_block_coverage
      where workspace_id=p_workspace_id and evaluation_run_id=v_run_id)
      <> v_scope.source_block_count
  then raise exception 'prepared phase9 review reset population mismatch'; end if;

  delete from public.guided_tour_states
  where workspace_id=p_workspace_id and user_id=p_actor_id
    and tour_id='first-run-rfp-review'
    and tour_version='guided-product-tour-v1';

  insert into public.audit_events(
    workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
  ) values (
    p_workspace_id,'user',p_actor_id,'demo_reset','phase9_review_demo',v_run_id,
    jsonb_build_object(
      'demo_scope_id',p_demo_scope_id,'template_evaluation_run_id',
      v_scope.template_evaluation_run_id,'provider_calls',0,
      'state_version','phase9-review-demo-state-v1'
    )
  );
  return jsonb_build_object(
    'activeEvaluationRunId',v_run_id,'providerCalls',0,'reset',true
  );
end $$;

revoke all on function public.reset_phase9_review_demo(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.reset_phase9_review_demo(uuid,uuid,uuid)
  to service_role;

-- Correct the first-run completion boundary: the current version has six
-- onboarding steps. Presenter mode remains fourteen and session-only.
create or replace function public.save_guided_tour_state(
  p_workspace_id uuid,p_tour_id text,p_tour_version text,p_status text,
  p_last_completed_step integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if p_tour_version<>'guided-product-tour-v1'
    or p_tour_id not in ('first-run-rfp-review','stakeholder-demo')
    or p_status not in ('started','completed','dismissed')
    or p_last_completed_step<0
    or (p_tour_id='first-run-rfp-review' and p_last_completed_step>6)
    or (p_tour_id='stakeholder-demo' and p_last_completed_step>14) then
    raise exception 'invalid guided tour state';
  end if;
  if p_tour_id='stakeholder-demo' and not exists (
    select 1 from public.phase8_demo_scopes
    where workspace_id=p_workspace_id
      and synthetic_marker='phase8-synthetic-demo-only'
  ) then raise exception 'prepared demo workspace required'; end if;
  insert into public.guided_tour_states(
    user_id,workspace_id,tour_id,tour_version,status,last_completed_step,
    completed_at,dismissed_at,restarted_at
  ) values (
    v_actor,p_workspace_id,p_tour_id,p_tour_version,p_status,p_last_completed_step,
    case when p_status='completed' then now() end,
    case when p_status='dismissed' then now() end,
    case when p_status='started' then now() end
  )
  on conflict(user_id,workspace_id,tour_id,tour_version) do update set
    status=excluded.status,last_completed_step=excluded.last_completed_step,
    completed_at=case when excluded.status='completed' then now()
      else public.guided_tour_states.completed_at end,
    dismissed_at=case when excluded.status='dismissed' then now()
      else public.guided_tour_states.dismissed_at end,
    restarted_at=case when excluded.status='started' then now()
      else public.guided_tour_states.restarted_at end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) from public,anon;
grant execute on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) to authenticated;
