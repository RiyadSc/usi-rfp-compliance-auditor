-- Phase 5 follow-up: enforce artifact/source completion guards and add auditable artifact review/removal.

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
  if p_status='waived' and not exists (select 1 from public.checklist_waivers where workspace_id=p_workspace_id and checklist_item_id=p_item_id and status='accepted' and designation='final') then raise exception 'accepted final waiver required'; end if;
  if p_status in ('ready_for_review','completed') and not exists (select 1 from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id and eligibility_class='ordinary_active') then raise exception 'source state prevents workflow completion'; end if;
  if p_status='completed' and exists (select 1 from public.checklist_required_artifacts where checklist_item_id=p_item_id and workspace_id=p_workspace_id and required and state not in ('reviewed','accepted_by_waiver','not_applicable')) then raise exception 'required artifact is not reviewed'; end if;
  update public.checklist_items set workflow_status=p_status where id=p_item_id and workspace_id=p_workspace_id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_status_changed','checklist_item',p_item_id,jsonb_build_object('prior_status',v_old,'status',p_status,'note',left(coalesce(p_note,''),1000)));
end; $$;

create or replace function public.review_checklist_artifact(p_workspace_id uuid,p_item_id uuid,p_required_artifact_id uuid,p_state text,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace reviewer required'; end if;
 if p_state not in ('pending_review','reviewed','rejected') then raise exception 'invalid artifact review state'; end if;
 if not exists(select 1 from public.checklist_required_artifacts where id=p_required_artifact_id and workspace_id=p_workspace_id and checklist_item_id=p_item_id) then raise exception 'required artifact not found in workspace'; end if;
 update public.checklist_required_artifacts set state=p_state where id=p_required_artifact_id;
 update public.checklist_items set artifact_state=p_state where id=p_item_id and workspace_id=p_workspace_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_artifact_reviewed','checklist_item',p_item_id,jsonb_build_object('required_artifact_id',p_required_artifact_id,'state',p_state,'note',left(coalesce(p_note,''),1000)));
end; $$;

create or replace function public.remove_checklist_artifact(p_workspace_id uuid,p_item_id uuid,p_link_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_document uuid; v_required uuid; v_id uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
 if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'artifact removal reason required'; end if;
 select document_id,required_artifact_id into v_document,v_required from public.checklist_artifact_links where id=p_link_id and workspace_id=p_workspace_id and checklist_item_id=p_item_id and state='linked';
 if not found then raise exception 'active artifact link not found in workspace'; end if;
 insert into public.checklist_artifact_links(workspace_id,checklist_item_id,required_artifact_id,document_id,linked_by,state,prior_link_id) values(p_workspace_id,p_item_id,v_required,v_document,v_actor,'removed',p_link_id) returning id into v_id;
 update public.checklist_required_artifacts set state='missing' where id=v_required;
 update public.checklist_items set artifact_state='missing' where id=p_item_id and workspace_id=p_workspace_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_artifact_removed','checklist_item',p_item_id,jsonb_build_object('artifact_link_id',v_id,'prior_link_id',p_link_id,'reason',left(p_reason,1000))); return v_id;
end; $$;

revoke all on function public.update_checklist_status(uuid,uuid,text,text) from public;
revoke all on function public.review_checklist_artifact(uuid,uuid,uuid,text,text) from public;
revoke all on function public.remove_checklist_artifact(uuid,uuid,uuid,text) from public;
grant execute on function public.update_checklist_status(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_checklist_artifact(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.remove_checklist_artifact(uuid,uuid,uuid,text) to authenticated;

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
 'workspace_created','workspace_updated','workspace_archived','document_uploaded','document_validated','document_parsed','document_rejected','document_parse_failed','document_deleted',
 'analysis_started','analysis_completed','analysis_failed','verification_started','verification_completed','verification_failed','verification_reviewed','requirement_reviewed','checklist_item_updated','finding_resolved','export_generated','demo_reset',
 'checklist_generated','checklist_regenerated','checklist_item_created','checklist_item_obsoleted','checklist_owner_assigned','checklist_owner_reassigned','checklist_status_changed','checklist_artifact_linked','checklist_artifact_reviewed','checklist_artifact_removed','checklist_waiver_requested','checklist_waiver_decided','checklist_exception_created','checklist_exception_revised','checklist_blocker_created','checklist_blocker_resolved','checklist_blocker_reopened','checklist_readiness_calculated'
));
