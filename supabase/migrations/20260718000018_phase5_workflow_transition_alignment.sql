-- Align the controlled database transition path with checklist-generator-v1.
-- Additive function replacement only; no table data is changed.

create or replace function public.update_checklist_status(p_workspace_id uuid, p_item_id uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old text;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
  if p_status not in ('not_started','in_progress','ready_for_review','completed','waived','blocked','not_applicable','requires_human_proof','unresolved') then raise exception 'invalid workflow status'; end if;
  select workflow_status into v_old from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'checklist item not found in workspace'; end if;
  if not ((v_old='not_started' and p_status in ('in_progress','ready_for_review','waived','blocked','requires_human_proof','unresolved')) or
    (v_old='in_progress' and p_status in ('not_started','ready_for_review','waived','blocked','requires_human_proof','unresolved')) or
    (v_old='ready_for_review' and p_status in ('in_progress','completed','waived','blocked','requires_human_proof','unresolved')) or
    (v_old='completed' and p_status in ('in_progress','blocked','unresolved')) or
    (v_old='waived' and p_status in ('blocked','unresolved')) or
    (v_old='blocked' and p_status in ('in_progress','ready_for_review','waived','requires_human_proof','unresolved')) or
    (v_old='not_applicable' and p_status='unresolved') or
    (v_old='requires_human_proof' and p_status in ('in_progress','ready_for_review','waived','blocked','unresolved')) or
    (v_old='unresolved' and p_status in ('in_progress','waived','blocked','requires_human_proof')) or v_old=p_status)
    then raise exception 'forbidden workflow transition from % to %',v_old,p_status; end if;
  if p_status='waived' and not exists (
    select 1 from public.checklist_waivers w where w.workspace_id=p_workspace_id and w.checklist_item_id=p_item_id
      and w.status='accepted' and w.designation='final'
  ) then raise exception 'accepted final waiver required'; end if;
  if p_status in ('ready_for_review','completed') and not exists (
    select 1 from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id and eligibility_class='ordinary_active'
  ) then raise exception 'source state prevents workflow completion'; end if;
  if p_status='completed' and exists (
    select 1 from public.checklist_required_artifacts where checklist_item_id=p_item_id and workspace_id=p_workspace_id
      and required and state not in ('reviewed','accepted_by_waiver','not_applicable')
  ) then raise exception 'required artifact is not reviewed'; end if;
  update public.checklist_items set workflow_status=p_status where id=p_item_id and workspace_id=p_workspace_id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
  values(p_workspace_id,'user',v_actor,'checklist_status_changed','checklist_item',p_item_id,jsonb_build_object('prior_status',v_old,'status',p_status,'note',left(coalesce(p_note,''),1000)));
end; $$;

revoke all on function public.update_checklist_status(uuid,uuid,text,text) from public;
grant execute on function public.update_checklist_status(uuid,uuid,text,text) to authenticated;
