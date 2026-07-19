-- Phase 5: deterministic checklist generation, blockers, readiness, and auditable workflow.
-- Additive only. Phase 4 findings remain immutable and authoritative for source assessment.

create table public.checklist_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  fixture_version text,
  eligibility_version text not null,
  category_version text not null,
  generator_version text not null,
  blocker_version text not null,
  readiness_version text not null,
  schema_version text not null,
  status text not null check (status in ('generating','completed','failed')),
  source_count integer not null default 0 check (source_count >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  created_by uuid not null references auth.users(id),
  error_detail text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, verification_run_id, input_hash, generator_version),
  unique (id, workspace_id)
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  finding_id uuid not null references public.verification_findings(id) on delete restrict,
  candidate_id uuid not null references public.requirement_candidates(id) on delete restrict,
  stable_key text not null check (stable_key ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(title) between 1 and 500),
  obligation text not null check (char_length(obligation) between 1 and 8000),
  category text not null check (category in (
    'mandatory_form','submission_deadline','question_deadline','signature','initials',
    'acknowledgment','addendum_acknowledgment','insurance','bond','certification','license',
    'attestation','attachment','staffing_plan','resume','meeting','pre_bid_conference',
    'site_visit','pricing_form','technical_response','reference','subcontractor_disclosure',
    'packaging_requirement','delivery_method','electronic_submission','physical_submission',
    'copy_count','file_format','naming_requirement','other_material_requirement')),
  mandatory boolean not null,
  eligibility_class text not null check (eligibility_class in ('ordinary_active','review_needed','unresolved_risk','excluded')),
  eligibility_reason text not null,
  contributes_to_required_total boolean not null,
  source_support_status text not null check (source_support_status in ('supported','partially_supported','unsupported','contradicted','parser_uncertain')),
  precedence_status text not null check (precedence_status in ('active','superseded','conflicting','undetermined')),
  proof_requirement text not null check (proof_requirement in ('none_identified','requires_human_confirmation','requires_company_artifact','requires_external_validation','undetermined')),
  machine_status text not null default 'machine_assessment_only' check (machine_status = 'machine_assessment_only'),
  source_human_review_status text not null check (source_human_review_status in ('pending','accepted','rejected','needs_follow_up','waived')),
  workflow_status text not null check (workflow_status in ('not_started','in_progress','ready_for_review','completed','waived','blocked','not_applicable','requires_human_proof','unresolved')),
  artifact_state text not null check (artifact_state in ('missing','uploaded','linked','pending_review','reviewed','accepted_by_waiver','requires_human_proof','rejected','not_applicable')),
  owner_id uuid references auth.users(id),
  reviewer_id uuid references auth.users(id),
  due_at timestamptz,
  due_timezone text,
  relationship_role text not null default 'atomic' check (relationship_role in ('atomic','parent','child')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','obsolete')),
  obsolete_reason text,
  source_version text not null,
  generation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, stable_key),
  unique (id, workspace_id)
);

create table public.checklist_generation_run_items (
  workspace_id uuid not null,
  generation_run_id uuid not null,
  checklist_item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (generation_run_id, checklist_item_id),
  foreign key (generation_run_id, workspace_id) references public.checklist_generation_runs(id, workspace_id) on delete cascade,
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade
);

create table public.checklist_item_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  finding_id uuid not null references public.verification_findings(id) on delete restrict,
  verification_evidence_id uuid not null references public.verification_evidence(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_page_id uuid not null references public.document_pages(id) on delete restrict,
  page_number integer not null check (page_number >= 1),
  quote_exact text not null,
  match_type text not null check (match_type in ('exact','normalized_exact')),
  parser_confidence numeric(4,3) check (parser_confidence is null or parser_confidence between 0 and 1),
  source_version text not null,
  created_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  unique (checklist_item_id, verification_evidence_id),
  unique (id, workspace_id)
);

create table public.checklist_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_item_id uuid not null,
  target_item_id uuid not null,
  requirement_relationship_id uuid references public.requirement_relationships(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('parent_child','exact_duplicate','semantic_duplicate','restatement','related_distinct','uncertain')),
  machine_proposed boolean not null default true,
  human_review_status text not null default 'pending' check (human_review_status in ('pending','accepted','rejected','needs_follow_up','waived')),
  created_at timestamptz not null default now(),
  foreign key (source_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  foreign key (target_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  check (source_item_id <> target_item_id),
  unique (source_item_id, target_item_id, relationship_type)
);

create table public.checklist_required_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  artifact_kind text not null check (artifact_kind in ('form','attachment','signature','initials','acknowledgment','certificate','license','bond','insurance','resume','staffing_plan','other')),
  label text not null check (char_length(label) between 1 and 500),
  required boolean not null default true,
  state text not null check (state in ('missing','uploaded','linked','pending_review','reviewed','accepted_by_waiver','requires_human_proof','rejected','not_applicable')),
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  unique (checklist_item_id, artifact_kind, label),
  unique (id, workspace_id)
);

create table public.checklist_artifact_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  required_artifact_id uuid not null,
  document_id uuid not null references public.documents(id) on delete restrict,
  linked_by uuid not null references auth.users(id),
  state text not null default 'linked' check (state in ('linked','removed')),
  prior_link_id uuid references public.checklist_artifact_links(id),
  created_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  foreign key (required_artifact_id, workspace_id) references public.checklist_required_artifacts(id, workspace_id) on delete cascade
);

create table public.checklist_waivers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  actor_id uuid not null references auth.users(id),
  status text not null check (status in ('requested','accepted','rejected','expired')),
  reason text not null check (char_length(reason) between 5 and 4000),
  designation text not null check (designation in ('temporary','final')),
  authority_note text,
  review_note text,
  prior_waiver_id uuid references public.checklist_waivers(id),
  created_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade
);

create table public.checklist_exception_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  actor_id uuid not null references auth.users(id),
  explanation text not null check (char_length(explanation) between 1 and 4000),
  prior_note_id uuid references public.checklist_exception_notes(id),
  created_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade
);

create table public.checklist_blockers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  checklist_item_id uuid not null,
  stable_key text not null check (stable_key ~ '^[0-9a-f]{64}$'),
  blocker_type text not null,
  severity text not null check (severity in ('critical','blocking','warning','informational')),
  source text not null,
  reason text not null,
  readiness_impact text not null check (readiness_impact in ('blocks','warns','none')),
  status text not null default 'open' check (status in ('open','resolved','reopened')),
  engine_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete cascade,
  unique (workspace_id, stable_key),
  unique (id, workspace_id)
);

create table public.checklist_blocker_resolutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  blocker_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('resolved','reopened')),
  reason text not null check (char_length(reason) between 5 and 4000),
  prior_resolution_id uuid references public.checklist_blocker_resolutions(id),
  created_at timestamptz not null default now(),
  foreign key (blocker_id, workspace_id) references public.checklist_blockers(id, workspace_id) on delete cascade
);

create table public.checklist_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  generation_run_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('blocked','human_review_required','ready_for_final_review')),
  total_required integer not null check (total_required >= 0),
  completed_required integer not null check (completed_required >= 0),
  incomplete_required integer not null check (incomplete_required >= 0),
  blocked_items integer not null check (blocked_items >= 0),
  unresolved_items integer not null check (unresolved_items >= 0),
  items_requiring_human_proof integer not null check (items_requiring_human_proof >= 0),
  informational_items integer not null check (informational_items >= 0),
  active_critical_blockers integer not null check (active_critical_blockers >= 0),
  warnings integer not null check (warnings >= 0),
  excluded_items integer not null check (excluded_items >= 0),
  excluded_reasons jsonb not null default '{}'::jsonb,
  summary text not null,
  engine_version text not null,
  created_at timestamptz not null default now(),
  foreign key (generation_run_id, workspace_id) references public.checklist_generation_runs(id, workspace_id) on delete cascade
);

-- Scope validation applies even to service-role writes.
create or replace function public.validate_phase5_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_workspace uuid; v_page integer; v_document uuid;
begin
  if tg_table_name = 'checklist_items' then
    if not exists (select 1 from public.verification_findings f where f.id = new.finding_id and f.workspace_id = new.workspace_id and f.verification_run_id = new.verification_run_id and f.candidate_id = new.candidate_id)
      or not exists (select 1 from public.analysis_runs a where a.id = new.analysis_run_id and a.workspace_id = new.workspace_id)
    then raise exception 'checklist item source scope mismatch'; end if;
    if new.owner_id is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = new.workspace_id and m.user_id = new.owner_id)
      then raise exception 'checklist owner must be an active workspace member'; end if;
    if new.reviewer_id is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = new.workspace_id and m.user_id = new.reviewer_id)
      then raise exception 'checklist reviewer must be an active workspace member'; end if;
  elsif tg_table_name = 'checklist_item_sources' then
    select p.workspace_id, p.page_number, p.document_id into v_workspace, v_page, v_document from public.document_pages p where p.id = new.document_page_id;
    if v_workspace is distinct from new.workspace_id or v_page is distinct from new.page_number or v_document is distinct from new.document_id
      then raise exception 'checklist evidence page scope mismatch'; end if;
    if not exists (select 1 from public.verification_evidence e where e.id = new.verification_evidence_id and e.workspace_id = new.workspace_id and e.finding_id = new.finding_id and e.document_id = new.document_id and e.document_page_id = new.document_page_id and e.validated and e.match_type in ('exact','normalized_exact'))
      then raise exception 'checklist evidence must reference validated exact Phase 4 evidence'; end if;
  elsif tg_table_name = 'checklist_artifact_links' then
    if not exists (select 1 from public.documents d where d.id = new.document_id and d.workspace_id = new.workspace_id and d.status = 'parsed' and d.deleted_at is null)
      then raise exception 'checklist artifact must be an available same-workspace document'; end if;
  elsif tg_table_name = 'checklist_relationships' then
    if new.requirement_relationship_id is not null and not exists (select 1 from public.requirement_relationships r where r.id = new.requirement_relationship_id and r.workspace_id = new.workspace_id)
      then raise exception 'checklist relationship source scope mismatch'; end if;
  end if;
  return new;
end;
$$;

create trigger trg_checklist_items_scope before insert or update on public.checklist_items for each row execute function public.validate_phase5_scope();
create trigger trg_checklist_sources_scope before insert on public.checklist_item_sources for each row execute function public.validate_phase5_scope();
create trigger trg_checklist_artifact_links_scope before insert on public.checklist_artifact_links for each row execute function public.validate_phase5_scope();
create trigger trg_checklist_relationships_scope before insert on public.checklist_relationships for each row execute function public.validate_phase5_scope();

create trigger trg_checklist_items_updated_at before update on public.checklist_items for each row execute function public.set_updated_at();
create trigger trg_checklist_required_artifacts_updated_at before update on public.checklist_required_artifacts for each row execute function public.set_updated_at();
create trigger trg_checklist_blockers_updated_at before update on public.checklist_blockers for each row execute function public.set_updated_at();

create or replace function public.reject_phase5_append_only_mutation()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception '% records are append-only', tg_table_name; end; $$;
create trigger trg_checklist_sources_immutable before update or delete on public.checklist_item_sources for each row execute function public.reject_phase5_append_only_mutation();
create trigger trg_checklist_relationships_immutable before update or delete on public.checklist_relationships for each row execute function public.reject_phase5_append_only_mutation();
create trigger trg_checklist_waivers_immutable before update or delete on public.checklist_waivers for each row execute function public.reject_phase5_append_only_mutation();
create trigger trg_checklist_exceptions_immutable before update or delete on public.checklist_exception_notes for each row execute function public.reject_phase5_append_only_mutation();
create trigger trg_checklist_resolutions_immutable before update or delete on public.checklist_blocker_resolutions for each row execute function public.reject_phase5_append_only_mutation();
create trigger trg_checklist_readiness_immutable before update or delete on public.checklist_readiness_snapshots for each row execute function public.reject_phase5_append_only_mutation();

-- Controlled human workflow operations. Each function rechecks membership and tenant scope.
create or replace function public.assign_checklist_owner(p_workspace_id uuid, p_item_id uuid, p_owner_id uuid, p_reviewer_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
  if p_owner_id is not null and not exists (select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_owner_id) then raise exception 'owner must belong to workspace'; end if;
  if p_reviewer_id is not null and not exists (select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_reviewer_id) then raise exception 'reviewer must belong to workspace'; end if;
  select owner_id into v_old from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'checklist item not found in workspace'; end if;
  update public.checklist_items set owner_id=p_owner_id, reviewer_id=p_reviewer_id where id=p_item_id and workspace_id=p_workspace_id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload)
  values(p_workspace_id,'user',v_actor,case when v_old is null then 'checklist_owner_assigned' else 'checklist_owner_reassigned' end,'checklist_item',p_item_id,jsonb_build_object('prior_owner_id',v_old,'owner_id',p_owner_id,'reviewer_id',p_reviewer_id));
end; $$;

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

create or replace function public.create_checklist_waiver(p_workspace_id uuid,p_item_id uuid,p_reason text,p_designation text,p_authority_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
 if p_designation not in ('temporary','final') or char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'valid waiver reason and designation required'; end if;
 if not exists(select 1 from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id) then raise exception 'checklist item not found in workspace'; end if;
 insert into public.checklist_waivers(workspace_id,checklist_item_id,actor_id,status,reason,designation,authority_note) values(p_workspace_id,p_item_id,v_actor,'requested',left(p_reason,4000),p_designation,left(p_authority_note,2000)) returning id into v_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_waiver_requested','checklist_item',p_item_id,jsonb_build_object('waiver_id',v_id,'designation',p_designation)); return v_id;
end; $$;

create or replace function public.review_checklist_waiver(p_workspace_id uuid,p_waiver_id uuid,p_status text,p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_item uuid; v_designation text; v_reason text; v_authority text; v_id uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace reviewer required'; end if;
 if p_status not in ('accepted','rejected','expired') or char_length(trim(coalesce(p_note,'')))<5 then raise exception 'valid waiver decision and note required'; end if;
 select checklist_item_id,designation,reason,authority_note into v_item,v_designation,v_reason,v_authority from public.checklist_waivers where id=p_waiver_id and workspace_id=p_workspace_id and status='requested';
 if not found then raise exception 'pending waiver not found in workspace'; end if;
 insert into public.checklist_waivers(workspace_id,checklist_item_id,actor_id,status,reason,designation,authority_note,review_note,prior_waiver_id) values(p_workspace_id,v_item,v_actor,p_status,v_reason,v_designation,v_authority,left(p_note,4000),p_waiver_id) returning id into v_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_waiver_decided','checklist_item',v_item,jsonb_build_object('waiver_id',v_id,'prior_waiver_id',p_waiver_id,'status',p_status)); return v_id;
end; $$;

create or replace function public.create_checklist_exception(p_workspace_id uuid,p_item_id uuid,p_explanation text,p_prior_note_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
 if char_length(trim(coalesce(p_explanation,'')))<1 then raise exception 'exception explanation required'; end if;
 if not exists(select 1 from public.checklist_items where id=p_item_id and workspace_id=p_workspace_id) then raise exception 'checklist item not found in workspace'; end if;
 if p_prior_note_id is not null and not exists(select 1 from public.checklist_exception_notes where id=p_prior_note_id and workspace_id=p_workspace_id and checklist_item_id=p_item_id) then raise exception 'prior exception note scope mismatch'; end if;
 insert into public.checklist_exception_notes(workspace_id,checklist_item_id,actor_id,explanation,prior_note_id) values(p_workspace_id,p_item_id,v_actor,left(p_explanation,4000),p_prior_note_id) returning id into v_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,case when p_prior_note_id is null then 'checklist_exception_created' else 'checklist_exception_revised' end,'checklist_item',p_item_id,jsonb_build_object('exception_id',v_id,'prior_note_id',p_prior_note_id)); return v_id;
end; $$;

create or replace function public.link_checklist_artifact(p_workspace_id uuid,p_item_id uuid,p_required_artifact_id uuid,p_document_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
 if not exists(select 1 from public.checklist_required_artifacts where id=p_required_artifact_id and workspace_id=p_workspace_id and checklist_item_id=p_item_id) then raise exception 'required artifact not found in workspace'; end if;
 if not exists(select 1 from public.documents where id=p_document_id and workspace_id=p_workspace_id and status='parsed' and deleted_at is null) then raise exception 'artifact document not available in workspace'; end if;
 insert into public.checklist_artifact_links(workspace_id,checklist_item_id,required_artifact_id,document_id,linked_by) values(p_workspace_id,p_item_id,p_required_artifact_id,p_document_id,v_actor) returning id into v_id;
 update public.checklist_required_artifacts set state='linked' where id=p_required_artifact_id;
 update public.checklist_items set artifact_state='linked' where id=p_item_id and workspace_id=p_workspace_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'checklist_artifact_linked','checklist_item',p_item_id,jsonb_build_object('artifact_link_id',v_id,'document_id',p_document_id,'required_artifact_id',p_required_artifact_id)); return v_id;
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

create or replace function public.resolve_checklist_blocker(p_workspace_id uuid,p_blocker_id uuid,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_item uuid; v_prior uuid;
begin
 if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
 if p_action not in ('resolved','reopened') or char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'valid blocker action and reason required'; end if;
 select checklist_item_id into v_item from public.checklist_blockers where id=p_blocker_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'blocker not found in workspace'; end if;
 select id into v_prior from public.checklist_blocker_resolutions where blocker_id=p_blocker_id order by created_at desc limit 1;
 insert into public.checklist_blocker_resolutions(workspace_id,blocker_id,actor_id,action,reason,prior_resolution_id) values(p_workspace_id,p_blocker_id,v_actor,p_action,left(p_reason,4000),v_prior) returning id into v_id;
 update public.checklist_blockers set status=case when p_action='resolved' then 'resolved' else 'reopened' end where id=p_blocker_id;
 insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,case when p_action='resolved' then 'checklist_blocker_resolved' else 'checklist_blocker_reopened' end,'checklist_blocker',p_blocker_id,jsonb_build_object('resolution_id',v_id,'reason',left(p_reason,1000))); return v_id;
end; $$;

revoke all on function public.assign_checklist_owner(uuid,uuid,uuid,uuid) from public;
revoke all on function public.update_checklist_status(uuid,uuid,text,text) from public;
revoke all on function public.create_checklist_waiver(uuid,uuid,text,text,text) from public;
revoke all on function public.review_checklist_waiver(uuid,uuid,text,text) from public;
revoke all on function public.create_checklist_exception(uuid,uuid,text,uuid) from public;
revoke all on function public.link_checklist_artifact(uuid,uuid,uuid,uuid) from public;
revoke all on function public.review_checklist_artifact(uuid,uuid,uuid,text,text) from public;
revoke all on function public.remove_checklist_artifact(uuid,uuid,uuid,text) from public;
revoke all on function public.resolve_checklist_blocker(uuid,uuid,text,text) from public;
grant execute on function public.assign_checklist_owner(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.update_checklist_status(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_checklist_waiver(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.review_checklist_waiver(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_checklist_exception(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.link_checklist_artifact(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.review_checklist_artifact(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.remove_checklist_artifact(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.resolve_checklist_blocker(uuid,uuid,text,text) to authenticated;

create index idx_checklist_runs_workspace on public.checklist_generation_runs(workspace_id,created_at desc);
create index idx_checklist_items_workspace on public.checklist_items(workspace_id,lifecycle_status,category,workflow_status);
create index idx_checklist_items_owner on public.checklist_items(workspace_id,owner_id);
create index idx_checklist_sources_item on public.checklist_item_sources(checklist_item_id);
create index idx_checklist_blockers_item on public.checklist_blockers(checklist_item_id,status,severity);
create index idx_checklist_readiness_run on public.checklist_readiness_snapshots(generation_run_id,created_at desc);

alter table public.checklist_generation_runs enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_generation_run_items enable row level security;
alter table public.checklist_item_sources enable row level security;
alter table public.checklist_relationships enable row level security;
alter table public.checklist_required_artifacts enable row level security;
alter table public.checklist_artifact_links enable row level security;
alter table public.checklist_waivers enable row level security;
alter table public.checklist_exception_notes enable row level security;
alter table public.checklist_blockers enable row level security;
alter table public.checklist_blocker_resolutions enable row level security;
alter table public.checklist_readiness_snapshots enable row level security;

create policy checklist_runs_select on public.checklist_generation_runs for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_items_select on public.checklist_items for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_run_items_select on public.checklist_generation_run_items for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_sources_select on public.checklist_item_sources for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_relationships_select on public.checklist_relationships for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_required_artifacts_select on public.checklist_required_artifacts for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_artifact_links_select on public.checklist_artifact_links for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_waivers_select on public.checklist_waivers for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_exceptions_select on public.checklist_exception_notes for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_blockers_select on public.checklist_blockers for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_resolutions_select on public.checklist_blocker_resolutions for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy checklist_readiness_select on public.checklist_readiness_snapshots for select to authenticated using ((select public.is_workspace_member(workspace_id)));

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
 'workspace_created','workspace_updated','workspace_archived','document_uploaded','document_validated','document_parsed','document_rejected','document_parse_failed','document_deleted',
 'analysis_started','analysis_completed','analysis_failed','verification_started','verification_completed','verification_failed','verification_reviewed','requirement_reviewed','checklist_item_updated','finding_resolved','export_generated','demo_reset',
 'checklist_generated','checklist_regenerated','checklist_item_created','checklist_item_obsoleted','checklist_owner_assigned','checklist_owner_reassigned','checklist_status_changed','checklist_artifact_linked','checklist_artifact_reviewed','checklist_artifact_removed','checklist_waiver_requested','checklist_waiver_decided','checklist_exception_created','checklist_exception_revised','checklist_blocker_created','checklist_blocker_resolved','checklist_blocker_reopened','checklist_readiness_calculated'
));
