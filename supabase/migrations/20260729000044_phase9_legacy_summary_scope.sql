-- Preserve the established summary RPC for existing callers while routing it
-- through the same explicit workspace/run scope as the new dashboard.

alter function public.get_phase9_review_summary(uuid,uuid)
  rename to get_phase9_review_summary_scoped_inner_v1;
revoke all on function public.get_phase9_review_summary_scoped_inner_v1(
  uuid,uuid
) from public,anon,authenticated;

create function public.get_phase9_review_summary(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' set enable_nestloop='off' stable as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  return public.get_phase9_review_summary_scoped_inner_v1(
    p_workspace_id,p_evaluation_run_id
  );
end $$;

revoke all on function public.get_phase9_review_summary(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_summary(uuid,uuid)
  to authenticated;
