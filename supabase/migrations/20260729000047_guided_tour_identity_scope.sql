-- Bind the presenter-controlled guided demo to the immutable synthetic identity.
-- Normal per-user onboarding state remains workspace-member scoped, while the
-- prepared stakeholder demonstration requires the exact Phase 8 scope identity.

create or replace function public.save_guided_tour_state(
  p_workspace_id uuid,
  p_tour_id text,
  p_tour_version text,
  p_status text,
  p_last_completed_step integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if p_tour_version<>'guided-product-tour-v1'
    or p_tour_id not in ('first-run-rfp-review','stakeholder-demo')
    or p_status not in ('started','completed','dismissed')
    or p_last_completed_step<0
    or (
      p_tour_id='first-run-rfp-review' and p_last_completed_step>5
    )
    or (
      p_tour_id='stakeholder-demo' and p_last_completed_step>14
    )
  then
    raise exception 'invalid guided tour state';
  end if;
  if p_tour_id='stakeholder-demo' and not exists (
    select 1
    from public.phase8_demo_scopes
    where workspace_id=p_workspace_id
      and authorized_identity_id=v_actor
      and synthetic_marker='phase8-synthetic-demo-only'
  )
  then
    raise exception 'authorized prepared demo identity required';
  end if;

  insert into public.guided_tour_states(
    user_id,
    workspace_id,
    tour_id,
    tour_version,
    status,
    last_completed_step,
    completed_at,
    dismissed_at,
    restarted_at
  ) values (
    v_actor,
    p_workspace_id,
    p_tour_id,
    p_tour_version,
    p_status,
    p_last_completed_step,
    case when p_status='completed' then now() end,
    case when p_status='dismissed' then now() end,
    case when p_status='started' then now() end
  )
  on conflict(user_id,workspace_id,tour_id,tour_version) do update set
    status=excluded.status,
    last_completed_step=excluded.last_completed_step,
    completed_at=case
      when excluded.status='completed' then now()
      else public.guided_tour_states.completed_at
    end,
    dismissed_at=case
      when excluded.status='dismissed' then now()
      else public.guided_tour_states.dismissed_at
    end,
    restarted_at=case
      when excluded.status='started' then now()
      else public.guided_tour_states.restarted_at
    end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) from public,anon;
grant execute on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) to authenticated;
