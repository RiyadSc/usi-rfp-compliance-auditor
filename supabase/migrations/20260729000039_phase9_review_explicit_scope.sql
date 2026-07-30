-- Make the bounded review RPC scope part of the database query itself. The
-- underlying deterministic population remains available for internal
-- maintenance, while ordinary review paths can only materialize the explicit
-- workspace/run pair established by their server-owned wrapper.

alter view public.phase9_review_queue_v1
  rename to phase9_review_queue_unscoped_v1;
revoke all on public.phase9_review_queue_unscoped_v1 from public,anon,authenticated;

create view public.phase9_review_queue_v1
with (security_invoker=true) as
select queue.*
from public.phase9_review_queue_unscoped_v1 queue
where (
  nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
  and nullif(current_setting('app.phase9_review_run_id',true),'') is null
) or (
  queue.workspace_id=(
    nullif(current_setting('app.phase9_review_workspace_id',true),'')
  )::uuid
  and queue.evaluation_run_id=(
    nullif(current_setting('app.phase9_review_run_id',true),'')
  )::uuid
);
grant select on public.phase9_review_queue_v1 to authenticated;

alter function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) rename to get_phase9_review_queue_scoped_inner_v1;
revoke all on function public.get_phase9_review_queue_scoped_inner_v1(
  uuid,uuid,text,text,text,integer,integer
) from public,anon,authenticated;

create function public.get_phase9_review_queue(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_lane text default 'all',
  p_search text default '',p_duplicate_signature text default null,
  p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' stable as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  return public.get_phase9_review_queue_scoped_inner_v1(
    p_workspace_id,p_evaluation_run_id,p_lane,p_search,p_duplicate_signature,
    p_page,p_page_size
  );
end $$;
revoke all on function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) from public,anon;
grant execute on function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) to authenticated;

alter function public.get_phase9_review_dashboard_v1(uuid,uuid)
  rename to get_phase9_review_dashboard_scoped_inner_v1;
revoke all on function public.get_phase9_review_dashboard_scoped_inner_v1(
  uuid,uuid
) from public,anon,authenticated;

create function public.get_phase9_review_dashboard_v1(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' stable as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  return public.get_phase9_review_dashboard_scoped_inner_v1(
    p_workspace_id,p_evaluation_run_id
  );
end $$;
revoke all on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  to authenticated;

alter function public.get_phase9_review_activity_summary(uuid,uuid,uuid)
  rename to get_phase9_review_activity_summary_scoped_inner_v1;
revoke all on function public.get_phase9_review_activity_summary_scoped_inner_v1(
  uuid,uuid,uuid
) from public,anon,authenticated;

create function public.get_phase9_review_activity_summary(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' stable as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  return public.get_phase9_review_activity_summary_scoped_inner_v1(
    p_workspace_id,p_evaluation_run_id,p_review_session_id
  );
end $$;
revoke all on function public.get_phase9_review_activity_summary(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_activity_summary(uuid,uuid,uuid)
  to authenticated;

-- Batch and publication paths use the same explicit scope before their
-- existing transactional and fail-closed implementations revalidate records.
create or replace function public.record_phase9_review_batch_v2(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hashes text[],
  p_action text,p_reason text,p_idempotency_key uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' as $$
begin
  if p_idempotency_key is null then raise exception 'batch idempotency key required'; end if;
  if (select auth.uid()) is null
    or not public.is_workspace_member(p_workspace_id)
  then raise exception 'authorized workspace member required'; end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-batch-v2:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text||':'||p_idempotency_key::text,0
  ));
  return public.record_phase9_review_batch(
    p_workspace_id,p_evaluation_run_id,p_candidate_hashes,p_action,p_reason,
    p_idempotency_key,p_review_session_id
  );
end $$;

create or replace function public.publish_phase9_reviewed_findings(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  perform public.assert_phase9_bridge_review_completion(
    p_workspace_id,p_evaluation_run_id
  );
  return public.publish_phase9_reviewed_findings_unguarded(
    p_workspace_id,p_evaluation_run_id
  );
end $$;

revoke all on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) to authenticated;
revoke all on function public.publish_phase9_reviewed_findings(uuid,uuid)
  from public,anon;
grant execute on function public.publish_phase9_reviewed_findings(uuid,uuid)
  to authenticated;
