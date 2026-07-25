-- Fix Phase 9 reservation insert: policy_version is NOT NULL and must be set.
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
    request_key,workspace_id,evaluation_run_id,call_plan_hash,reserved_usd,policy_version
  ) values (
    p_request_key,p_workspace_id,p_evaluation_run_id,p_call_plan_hash,p_requested_usd,
    'phase9-budget-v1'
  ) returning id into v_id;
  update public.phase9_evaluation_runs set status='reserved'
    where id=p_evaluation_run_id and workspace_id=p_workspace_id and status='planned';
  return v_id;
end $$;
