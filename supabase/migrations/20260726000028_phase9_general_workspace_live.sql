-- Phase 9: jurisdiction-neutral live analysis for explicitly selected workspace documents.
-- Additive, workspace-scoped, service-written, and disabled unless an application
-- server explicitly provisions an enabled workspace budget policy.

alter table public.phase9_evaluation_runs
  drop constraint if exists phase9_evaluation_runs_mode_check;
alter table public.phase9_evaluation_runs
  add constraint phase9_evaluation_runs_mode_check
  check (mode in ('dry_run','acceptance_live','cached_rerun','workspace_live'));

alter table public.phase9_evaluation_runs
  add column if not exists document_set_hash text
    check (document_set_hash is null or document_set_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists expected_answers_used boolean not null default true,
  add column if not exists requested_maximum_usd numeric(12,6)
    check (requested_maximum_usd is null or requested_maximum_usd between 0 and 3);

alter table public.phase9_call_plans
  drop constraint if exists phase9_call_plans_plan_hash_key;
alter table public.phase9_call_plans
  drop constraint if exists phase9_call_plans_evaluation_run_id_key;
alter table public.phase9_call_plans
  add constraint phase9_call_plans_evaluation_run_id_key unique(evaluation_run_id);

alter table public.phase9_budget_reservations
  drop constraint if exists phase9_budget_reservations_policy_version_check;
alter table public.phase9_budget_reservations
  add constraint phase9_budget_reservations_policy_version_check
  check (policy_version in ('phase9-budget-v1','phase9-workspace-budget-v1'));

create table public.phase9_evaluation_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  document_id uuid not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  ordinal integer not null check (ordinal >= 0),
  page_count integer not null check (page_count > 0),
  created_at timestamptz not null default now(),
  unique(evaluation_run_id,document_id),
  unique(evaluation_run_id,ordinal),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(document_id,workspace_id)
    references public.documents(id,workspace_id) on delete restrict
);
create index phase9_evaluation_documents_scope_idx
  on public.phase9_evaluation_documents(workspace_id,evaluation_run_id,ordinal);

create table public.phase9_live_budget_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  enabled boolean not null default false,
  per_run_maximum_usd numeric(12,6) not null
    check (per_run_maximum_usd > 0 and per_run_maximum_usd <= 3),
  monthly_maximum_usd numeric(12,6) not null
    check (monthly_maximum_usd > 0 and monthly_maximum_usd <= 100),
  policy_version text not null
    check (policy_version='phase9-workspace-budget-v1'),
  configured_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_phase9_live_budget_policies_updated_at
  on public.phase9_live_budget_policies;
create trigger trg_phase9_live_budget_policies_updated_at
  before update on public.phase9_live_budget_policies
  for each row execute function public.set_updated_at();

alter table public.phase9_evaluation_documents enable row level security;
alter table public.phase9_live_budget_policies enable row level security;

create policy phase9_evaluation_documents_select
  on public.phase9_evaluation_documents for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy phase9_live_budget_policies_select
  on public.phase9_live_budget_policies for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.phase9_evaluation_documents,public.phase9_live_budget_policies
  to authenticated;

create trigger phase9_evaluation_documents_immutable
  before update or delete on public.phase9_evaluation_documents
  for each row execute function public.reject_phase9_immutable_mutation();

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
  v_run public.phase9_evaluation_runs%rowtype;
  v_policy public.phase9_live_budget_policies%rowtype;
  v_spent numeric;
  v_reserved numeric;
  v_id uuid;
  v_policy_version text;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'phase9 service role required';
  end if;

  select * into v_run from public.phase9_evaluation_runs
    where id=p_evaluation_run_id and workspace_id=p_workspace_id;
  if not found then raise exception 'phase9 evaluation run missing'; end if;

  if v_run.mode='workspace_live' then
    perform pg_advisory_xact_lock(
      hashtextextended('phase9-workspace-budget-v1:'||p_workspace_id::text,0)
    );
    select * into v_policy from public.phase9_live_budget_policies
      where workspace_id=p_workspace_id;
    if not found or not v_policy.enabled then
      raise exception 'phase9 workspace live analysis disabled';
    end if;
    if p_requested_usd>v_policy.per_run_maximum_usd then
      raise exception 'phase9 workspace per-run budget exceeded';
    end if;
    v_policy_version := 'phase9-workspace-budget-v1';
  else
    perform pg_advisory_xact_lock(hashtextextended('phase9-budget-v1',0));
    v_policy_version := 'phase9-budget-v1';
  end if;

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

  if v_run.mode='workspace_live' then
    select coalesce(sum(actual_usd),0) into v_spent
      from public.phase9_budget_reservations
      where workspace_id=p_workspace_id
        and policy_version='phase9-workspace-budget-v1'
        and status='settled'
        and created_at>=date_trunc('month',now());
    select coalesce(sum(reserved_usd),0) into v_reserved
      from public.phase9_budget_reservations
      where workspace_id=p_workspace_id
        and policy_version='phase9-workspace-budget-v1'
        and status='reserved'
        and created_at>=date_trunc('month',now());
    if v_spent+v_reserved+p_requested_usd>v_policy.monthly_maximum_usd then
      raise exception 'phase9 workspace monthly budget exceeded';
    end if;
  else
    select coalesce(sum(actual_usd),0) into v_spent
      from public.phase9_budget_reservations
      where policy_version='phase9-budget-v1' and status='settled';
    select coalesce(sum(reserved_usd),0) into v_reserved
      from public.phase9_budget_reservations
      where policy_version='phase9-budget-v1' and status='reserved';
    if v_spent+v_reserved+p_requested_usd>3 then
      raise exception 'phase9 budget exceeded';
    end if;
  end if;

  insert into public.phase9_budget_reservations(
    request_key,workspace_id,evaluation_run_id,call_plan_hash,reserved_usd,policy_version
  ) values (
    p_request_key,p_workspace_id,p_evaluation_run_id,p_call_plan_hash,p_requested_usd,
    v_policy_version
  ) returning id into v_id;
  update public.phase9_evaluation_runs set status='reserved'
    where id=p_evaluation_run_id and workspace_id=p_workspace_id and status='planned';
  return v_id;
end $$;

create or replace function public.settle_phase9_call_plan(
  p_reservation_id uuid,
  p_actual_usd numeric
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_row public.phase9_budget_reservations%rowtype;
  v_note text;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'phase9 service role required';
  end if;
  select * into v_row from public.phase9_budget_reservations
    where id=p_reservation_id for update;
  if not found then raise exception 'phase9 reservation missing'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_row.policy_version||':'||v_row.workspace_id::text,0)
  );
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
  v_note := case
    when v_row.policy_version='phase9-workspace-budget-v1'
      then 'phase9 workspace live analysis; reservation='
    else 'phase9 FAC115 final acceptance; reservation='
  end || p_reservation_id::text;
  insert into public.spend_ledger(
    workspace_id,kind,estimated_cost_usd,note,phase
  ) values (v_row.workspace_id,'verify',p_actual_usd,v_note,'phase9');
end $$;

revoke all on function public.reserve_phase9_call_plan(text,uuid,uuid,text,numeric)
  from public,anon,authenticated;
revoke all on function public.settle_phase9_call_plan(uuid,numeric)
  from public,anon,authenticated;
grant execute on function public.reserve_phase9_call_plan(text,uuid,uuid,text,numeric)
  to service_role;
grant execute on function public.settle_phase9_call_plan(uuid,numeric)
  to service_role;
