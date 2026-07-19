-- Phase 6: deterministic proposal draft audit. Additive only.
-- Phase 4 findings and Phase 5 checklist records remain immutable upstream inputs.

create table public.proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict,
  lineage_id uuid not null,
  revision_number integer not null check (revision_number >= 1),
  prior_draft_id uuid references public.proposal_drafts(id) on delete restrict,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  page_set_hash text not null check (page_set_hash ~ '^[0-9a-f]{64}$'),
  parser_name text not null,
  parser_version text not null,
  status text not null check (status in ('registered','ready','audit_failed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, document_id),
  unique (workspace_id, lineage_id, revision_number),
  unique (id, workspace_id)
);

create table public.proposal_audit_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  proposal_draft_id uuid not null,
  checklist_generation_run_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  fixture_version text,
  section_parser_version text not null,
  claim_segmenter_version text not null,
  schema_version text not null,
  matcher_version text not null,
  support_policy_version text not null,
  contradiction_version text not null,
  severity_version text not null,
  evaluator_version text not null,
  status text not null check (status in ('running','completed','failed')),
  machine_only boolean not null default true check (machine_only),
  section_count integer not null default 0 check (section_count >= 0),
  claim_count integer not null default 0 check (claim_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  created_by uuid not null references auth.users(id),
  error_detail text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (proposal_draft_id, workspace_id) references public.proposal_drafts(id, workspace_id) on delete cascade,
  foreign key (checklist_generation_run_id, workspace_id) references public.checklist_generation_runs(id, workspace_id) on delete restrict,
  unique (workspace_id, proposal_draft_id, checklist_generation_run_id, input_hash, evaluator_version),
  unique (id, workspace_id)
);

create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_audit_run_id uuid not null,
  proposal_draft_id uuid not null,
  document_page_id uuid not null references public.document_pages(id) on delete restrict,
  stable_key text not null check (stable_key ~ '^[0-9a-f]{64}$'),
  heading text not null check (char_length(heading) between 1 and 300),
  normalized_heading text not null check (char_length(normalized_heading) between 1 and 300),
  page_number integer not null check (page_number >= 1),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  section_text text not null,
  parser_uncertain boolean not null,
  parser_version text not null,
  created_at timestamptz not null default now(),
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete cascade,
  foreign key (proposal_draft_id, workspace_id) references public.proposal_drafts(id, workspace_id) on delete cascade,
  unique (proposal_audit_run_id, stable_key),
  unique (id, workspace_id)
);

create table public.proposal_claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_audit_run_id uuid not null,
  proposal_section_id uuid not null,
  stable_key text not null check (stable_key ~ '^[0-9a-f]{64}$'),
  claim_type text not null check (claim_type in ('requirement_response','company_capability','company_credential','staffing_commitment','insurance_claim','deadline_statement','pricing_statement','procurement_identity','descriptive','unknown')),
  claim_text text not null check (char_length(claim_text) between 1 and 8000),
  normalized_text text not null check (char_length(normalized_text) between 1 and 8000),
  page_number integer not null check (page_number >= 1),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  parser_uncertain boolean not null,
  injection_signals jsonb not null default '[]'::jsonb check (jsonb_typeof(injection_signals) = 'array'),
  segmenter_version text not null,
  created_at timestamptz not null default now(),
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete cascade,
  foreign key (proposal_section_id, workspace_id) references public.proposal_sections(id, workspace_id) on delete cascade,
  unique (proposal_audit_run_id, stable_key),
  unique (id, workspace_id)
);

create table public.proposal_claim_requirement_matches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_audit_run_id uuid not null,
  proposal_claim_id uuid not null,
  checklist_item_id uuid,
  match_score numeric(5,4) not null check (match_score between 0 and 1),
  match_reason text not null check (char_length(match_reason) between 1 and 500),
  support_status text not null check (support_status in ('supported','partially_supported','unsupported','contradicted','requires_human_proof','parser_uncertain')),
  consistency_status text not null check (consistency_status in ('consistent','inconsistent','undetermined','not_applicable')),
  rationale text not null check (char_length(rationale) between 1 and 1000),
  proposal_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(proposal_facts) = 'array'),
  requirement_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(requirement_facts) = 'array'),
  machine_only boolean not null default true check (machine_only),
  human_resolution_status text not null default 'pending' check (human_resolution_status = 'pending'),
  matcher_version text not null,
  created_at timestamptz not null default now(),
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete cascade,
  foreign key (proposal_claim_id, workspace_id) references public.proposal_claims(id, workspace_id) on delete cascade,
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete restrict,
  unique (proposal_audit_run_id, proposal_claim_id),
  unique (id, workspace_id)
);

create table public.proposal_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_claim_match_id uuid not null,
  evidence_kind text not null check (evidence_kind in ('verification_evidence','checklist_artifact','company_artifact','human_confirmation')),
  verification_evidence_id uuid references public.verification_evidence(id) on delete restrict,
  checklist_artifact_link_id uuid references public.checklist_artifact_links(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  document_page_id uuid references public.document_pages(id) on delete restrict,
  page_number integer check (page_number is null or page_number >= 1),
  exact_quote text,
  match_type text check (match_type is null or match_type in ('exact','normalized_exact')),
  source_version text not null,
  created_at timestamptz not null default now(),
  foreign key (proposal_claim_match_id, workspace_id) references public.proposal_claim_requirement_matches(id, workspace_id) on delete cascade,
  check (verification_evidence_id is not null or checklist_artifact_link_id is not null or document_id is not null),
  unique (id, workspace_id)
);

create table public.proposal_response_coverage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_audit_run_id uuid not null,
  checklist_item_id uuid not null,
  coverage_status text not null check (coverage_status in ('addressed','partially_addressed','missing','not_applicable','parser_uncertain')),
  reason text not null check (char_length(reason) between 1 and 1000),
  matched_claim_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(matched_claim_keys) = 'array'),
  machine_only boolean not null default true check (machine_only),
  human_resolution_status text not null default 'pending' check (human_resolution_status = 'pending'),
  matcher_version text not null,
  created_at timestamptz not null default now(),
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete cascade,
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete restrict,
  unique (proposal_audit_run_id, checklist_item_id),
  unique (id, workspace_id)
);

create table public.proposal_audit_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_audit_run_id uuid not null,
  stable_key text not null check (stable_key ~ '^[0-9a-f]{64}$'),
  finding_type text not null check (finding_type in ('missing_required_response','partial_required_response','unsupported_claim','contradicted_claim','date_mismatch','numerical_mismatch','wrong_procurement_identity','copied_procurement_language','parser_uncertainty','prompt_injection_attempt','human_proof_required','unresolved_source_requirement','corrected_in_revision')),
  severity text not null check (severity in ('critical','blocking','warning','informational')),
  title text not null check (char_length(title) between 1 and 500),
  detail text not null check (char_length(detail) between 1 and 2000),
  checklist_item_id uuid,
  proposal_claim_id uuid,
  proposal_page_id uuid references public.document_pages(id) on delete restrict,
  proposal_page_number integer check (proposal_page_number is null or proposal_page_number >= 1),
  source_document_id uuid references public.documents(id) on delete restrict,
  source_page_id uuid references public.document_pages(id) on delete restrict,
  source_page_number integer check (source_page_number is null or source_page_number >= 1),
  source_quote text,
  machine_only boolean not null default true check (machine_only),
  human_resolution_status text not null default 'pending' check (human_resolution_status in ('pending','accepted','rejected','needs_follow_up','waived')),
  workflow_status text not null default 'open' check (workflow_status in ('open','in_review','resolved','accepted_risk','obsolete')),
  rule_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (proposal_audit_run_id, workspace_id) references public.proposal_audit_runs(id, workspace_id) on delete cascade,
  foreign key (checklist_item_id, workspace_id) references public.checklist_items(id, workspace_id) on delete restrict,
  foreign key (proposal_claim_id, workspace_id) references public.proposal_claims(id, workspace_id) on delete restrict,
  unique (proposal_audit_run_id, stable_key),
  unique (id, workspace_id)
);

create table public.proposal_finding_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_finding_id uuid not null,
  evidence_role text not null check (evidence_role in ('proposal_claim','requirement_source','company_evidence','contradicting_source')),
  document_id uuid not null references public.documents(id) on delete restrict,
  document_page_id uuid not null references public.document_pages(id) on delete restrict,
  page_number integer not null check (page_number >= 1),
  exact_quote text not null,
  match_type text not null check (match_type in ('exact','normalized_exact')),
  created_at timestamptz not null default now(),
  foreign key (proposal_finding_id, workspace_id) references public.proposal_audit_findings(id, workspace_id) on delete cascade,
  unique (proposal_finding_id, evidence_role, document_page_id, exact_quote),
  unique (id, workspace_id)
);

create table public.proposal_finding_resolutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_finding_id uuid not null,
  actor_id uuid not null references auth.users(id),
  human_resolution_status text not null check (human_resolution_status in ('accepted','rejected','needs_follow_up','waived')),
  workflow_status text not null check (workflow_status in ('in_review','resolved','accepted_risk','obsolete')),
  reason text not null check (char_length(reason) between 5 and 4000),
  prior_resolution_id uuid references public.proposal_finding_resolutions(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (proposal_finding_id, workspace_id) references public.proposal_audit_findings(id, workspace_id) on delete cascade,
  unique (id, workspace_id)
);

create or replace function public.validate_phase6_workspace_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid; v_document uuid;
begin
  if tg_table_name = 'proposal_drafts' then
    select workspace_id into v_workspace from public.documents where id=new.document_id and document_type='proposal_draft' and status='parsed' and deleted_at is null;
    if v_workspace is distinct from new.workspace_id then raise exception 'proposal document not parsed in workspace'; end if;
    if new.prior_draft_id is not null and not exists(select 1 from public.proposal_drafts where id=new.prior_draft_id and workspace_id=new.workspace_id and lineage_id=new.lineage_id and revision_number<new.revision_number) then raise exception 'invalid prior proposal revision'; end if;
  elsif tg_table_name = 'proposal_sections' then
    select p.workspace_id,p.document_id into v_workspace,v_document from public.document_pages p where p.id=new.document_page_id;
    if v_workspace is distinct from new.workspace_id or not exists(select 1 from public.proposal_drafts d where d.id=new.proposal_draft_id and d.workspace_id=new.workspace_id and d.document_id=v_document) then raise exception 'proposal section page crosses scope'; end if;
  elsif tg_table_name = 'proposal_claim_evidence' then
    if new.document_id is not null and not exists(select 1 from public.documents where id=new.document_id and workspace_id=new.workspace_id and deleted_at is null) then raise exception 'claim evidence document crosses scope'; end if;
    if new.document_page_id is not null and not exists(select 1 from public.document_pages where id=new.document_page_id and workspace_id=new.workspace_id and (new.document_id is null or document_id=new.document_id)) then raise exception 'claim evidence page crosses scope'; end if;
    if new.verification_evidence_id is not null and not exists(select 1 from public.verification_evidence where id=new.verification_evidence_id and workspace_id=new.workspace_id) then raise exception 'verification evidence crosses scope'; end if;
    if new.checklist_artifact_link_id is not null and not exists(select 1 from public.checklist_artifact_links where id=new.checklist_artifact_link_id and workspace_id=new.workspace_id) then raise exception 'artifact evidence crosses scope'; end if;
  elsif tg_table_name = 'proposal_audit_findings' then
    if new.proposal_page_id is not null and not exists(select 1 from public.document_pages where id=new.proposal_page_id and workspace_id=new.workspace_id) then raise exception 'proposal finding page crosses scope'; end if;
    if new.source_document_id is not null and not exists(select 1 from public.documents where id=new.source_document_id and workspace_id=new.workspace_id) then raise exception 'proposal finding source crosses scope'; end if;
    if new.source_page_id is not null and not exists(select 1 from public.document_pages where id=new.source_page_id and workspace_id=new.workspace_id and document_id=new.source_document_id) then raise exception 'proposal finding source page crosses scope'; end if;
  elsif tg_table_name = 'proposal_finding_evidence' then
    if not exists(select 1 from public.document_pages where id=new.document_page_id and workspace_id=new.workspace_id and document_id=new.document_id and page_number=new.page_number) then raise exception 'finding evidence crosses scope'; end if;
  end if;
  return new;
end; $$;

create trigger trg_proposal_draft_scope before insert or update on public.proposal_drafts for each row execute function public.validate_phase6_workspace_scope();
create trigger trg_proposal_section_scope before insert or update on public.proposal_sections for each row execute function public.validate_phase6_workspace_scope();
create trigger trg_proposal_claim_evidence_scope before insert or update on public.proposal_claim_evidence for each row execute function public.validate_phase6_workspace_scope();
create trigger trg_proposal_finding_scope before insert or update on public.proposal_audit_findings for each row execute function public.validate_phase6_workspace_scope();
create trigger trg_proposal_finding_evidence_scope before insert or update on public.proposal_finding_evidence for each row execute function public.validate_phase6_workspace_scope();

create or replace function public.prevent_phase6_machine_mutation()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Phase 6 machine record is immutable'; end; $$;
create trigger trg_proposal_sections_immutable before update or delete on public.proposal_sections for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_claims_immutable before update or delete on public.proposal_claims for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_matches_immutable before update or delete on public.proposal_claim_requirement_matches for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_claim_evidence_immutable before update or delete on public.proposal_claim_evidence for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_coverage_immutable before update or delete on public.proposal_response_coverage for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_finding_evidence_immutable before update or delete on public.proposal_finding_evidence for each row execute function public.prevent_phase6_machine_mutation();
create trigger trg_proposal_resolution_immutable before update or delete on public.proposal_finding_resolutions for each row execute function public.prevent_phase6_machine_mutation();

create or replace function public.resolve_proposal_audit_finding(p_workspace_id uuid,p_finding_id uuid,p_human_status text,p_workflow_status text,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior uuid; v_old_workflow text;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then raise exception 'authorized workspace member required'; end if;
  if p_human_status not in ('accepted','rejected','needs_follow_up','waived') then raise exception 'invalid human resolution status'; end if;
  if p_workflow_status not in ('in_review','resolved','accepted_risk','obsolete') then raise exception 'invalid proposal finding workflow'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 5 then raise exception 'resolution reason required'; end if;
  select workflow_status into v_old_workflow from public.proposal_audit_findings where id=p_finding_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'proposal finding not found in workspace'; end if;
  if not ((v_old_workflow='open' and p_workflow_status in ('in_review','resolved','accepted_risk')) or (v_old_workflow='in_review' and p_workflow_status in ('resolved','accepted_risk')) or (v_old_workflow in ('resolved','accepted_risk') and p_workflow_status in ('in_review','obsolete'))) then raise exception 'forbidden proposal finding transition'; end if;
  select id into v_prior from public.proposal_finding_resolutions where proposal_finding_id=p_finding_id order by created_at desc limit 1;
  insert into public.proposal_finding_resolutions(workspace_id,proposal_finding_id,actor_id,human_resolution_status,workflow_status,reason,prior_resolution_id) values(p_workspace_id,p_finding_id,v_actor,p_human_status,p_workflow_status,left(trim(p_reason),4000),v_prior) returning id into v_id;
  update public.proposal_audit_findings set human_resolution_status=p_human_status,workflow_status=p_workflow_status,updated_at=now() where id=p_finding_id and workspace_id=p_workspace_id;
  insert into public.audit_events(workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload) values(p_workspace_id,'user',v_actor,'proposal_finding_resolved','proposal_audit_finding',p_finding_id,jsonb_build_object('resolution_id',v_id,'prior_workflow',v_old_workflow,'workflow_status',p_workflow_status,'human_resolution_status',p_human_status));
  return v_id;
end; $$;

revoke all on function public.resolve_proposal_audit_finding(uuid,uuid,text,text,text) from public;
grant execute on function public.resolve_proposal_audit_finding(uuid,uuid,text,text,text) to authenticated;

create index idx_proposal_drafts_workspace on public.proposal_drafts(workspace_id,lineage_id,revision_number desc);
create index idx_proposal_audit_runs_workspace on public.proposal_audit_runs(workspace_id,created_at desc);
create index idx_proposal_sections_run on public.proposal_sections(proposal_audit_run_id,page_number);
create index idx_proposal_claims_run on public.proposal_claims(proposal_audit_run_id,page_number);
create index idx_proposal_matches_item on public.proposal_claim_requirement_matches(workspace_id,checklist_item_id);
create index idx_proposal_coverage_run on public.proposal_response_coverage(proposal_audit_run_id,coverage_status);
create index idx_proposal_findings_run on public.proposal_audit_findings(proposal_audit_run_id,severity,workflow_status);

alter table public.proposal_drafts enable row level security;
alter table public.proposal_audit_runs enable row level security;
alter table public.proposal_sections enable row level security;
alter table public.proposal_claims enable row level security;
alter table public.proposal_claim_requirement_matches enable row level security;
alter table public.proposal_claim_evidence enable row level security;
alter table public.proposal_response_coverage enable row level security;
alter table public.proposal_audit_findings enable row level security;
alter table public.proposal_finding_evidence enable row level security;
alter table public.proposal_finding_resolutions enable row level security;

create policy proposal_drafts_select on public.proposal_drafts for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_audit_runs_select on public.proposal_audit_runs for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_sections_select on public.proposal_sections for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_claims_select on public.proposal_claims for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_matches_select on public.proposal_claim_requirement_matches for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_claim_evidence_select on public.proposal_claim_evidence for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_coverage_select on public.proposal_response_coverage for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_findings_select on public.proposal_audit_findings for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_finding_evidence_select on public.proposal_finding_evidence for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy proposal_resolutions_select on public.proposal_finding_resolutions for select to authenticated using ((select public.is_workspace_member(workspace_id)));

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
 'workspace_created','workspace_updated','workspace_archived','document_uploaded','document_validated','document_parsed','document_rejected','document_parse_failed','document_deleted',
 'analysis_started','analysis_completed','analysis_failed','verification_started','verification_completed','verification_failed','verification_reviewed','requirement_reviewed','checklist_item_updated','finding_resolved','export_generated','demo_reset',
 'checklist_generated','checklist_regenerated','checklist_item_created','checklist_item_obsoleted','checklist_owner_assigned','checklist_owner_reassigned','checklist_status_changed','checklist_artifact_linked','checklist_artifact_reviewed','checklist_artifact_removed','checklist_waiver_requested','checklist_waiver_decided','checklist_exception_created','checklist_exception_revised','checklist_blocker_created','checklist_blocker_resolved','checklist_blocker_reopened','checklist_readiness_calculated',
 'proposal_draft_registered','proposal_audit_started','proposal_audit_completed','proposal_audit_failed','proposal_finding_created','proposal_finding_resolved','proposal_revision_linked'
));
