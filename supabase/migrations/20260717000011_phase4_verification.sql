-- Phase 4: independent source verification, evidence provenance, relationships, human review.
-- Additive and workspace-scoped. Extraction candidates remain unverified and are never promoted in place.

-- Phase-specific spend accounting and verification model-call provenance.
alter table public.spend_ledger add column if not exists phase text not null default 'phase3';
update public.spend_ledger set phase = 'phase3' where phase is null;
alter table public.spend_ledger drop constraint if exists spend_ledger_phase_check;
alter table public.spend_ledger add constraint spend_ledger_phase_check
  check (phase in ('phase3', 'phase4'));
alter table public.spend_ledger drop constraint if exists spend_ledger_kind_check;
alter table public.spend_ledger add constraint spend_ledger_kind_check
  check (kind in ('embed', 'extract', 'verify', 'adjustment'));

alter table public.model_calls add column if not exists verification_run_id uuid;
alter table public.model_calls add column if not exists reasoning_tokens integer;
alter table public.model_calls add column if not exists cached_tokens integer;
alter table public.model_calls add column if not exists retries integer not null default 0;
alter table public.model_calls add column if not exists repair_attempts integer not null default 0;
alter table public.model_calls drop constraint if exists model_calls_stage_check;
alter table public.model_calls add constraint model_calls_stage_check
  check (stage in ('embed', 'extract', 'verify'));

alter table public.analysis_runs
  add constraint analysis_runs_scope_unique unique (id, workspace_id);

-- Immutable extraction proposals: no in-place rewriting. Service-role deletion remains available
-- only for controlled fixture/data lifecycle cleanup.
create or replace function public.reject_candidate_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'requirement_candidates are immutable';
end;
$$;
drop trigger if exists trg_requirement_candidates_immutable on public.requirement_candidates;
create trigger trg_requirement_candidates_immutable
  before update on public.requirement_candidates
  for each row execute function public.reject_candidate_update();

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'retrieving', 'verifying', 'post_validating', 'completed', 'failed', 'cancelled', 'budget_exceeded')),
  version integer not null default 1 check (version >= 1),
  input_hash text not null,
  prompt_version text not null,
  schema_version text not null,
  retrieval_version text not null,
  normalization_version text not null,
  provider text,
  model text,
  reasoning_effort text check (reasoning_effort is null or reasoning_effort in ('low', 'medium', 'high')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  error_category text,
  error_detail text,
  created_by uuid not null references auth.users (id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (analysis_run_id, input_hash, version),
  unique (id, workspace_id, analysis_run_id)
);

alter table public.verification_runs add constraint verification_runs_analysis_scope_fk
  foreign key (analysis_run_id, workspace_id) references public.analysis_runs (id, workspace_id) on delete cascade;

alter table public.requirement_candidates
  add constraint requirement_candidates_scope_unique unique (id, workspace_id, analysis_run_id);

alter table public.model_calls
  add constraint model_calls_verification_run_fk
  foreign key (verification_run_id) references public.verification_runs (id) on delete set null;

create table public.verification_retrieval_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  candidate_id uuid not null,
  chunk_id uuid,
  document_id uuid not null,
  document_page_id uuid not null,
  page_number integer not null check (page_number >= 1),
  retrieval_reason text not null,
  retrieval_rank integer not null check (retrieval_rank >= 1),
  score numeric,
  text_sha256 text not null,
  created_at timestamptz not null default now(),
  foreign key (verification_run_id, workspace_id, analysis_run_id)
    references public.verification_runs (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (candidate_id, workspace_id, analysis_run_id)
    references public.requirement_candidates (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (chunk_id) references public.document_chunks (id) on delete set null,
  foreign key (document_id) references public.documents (id) on delete cascade,
  foreign key (document_page_id) references public.document_pages (id) on delete cascade,
  unique (verification_run_id, candidate_id, document_page_id, retrieval_reason)
);

create table public.verification_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  candidate_id uuid not null,
  finding_version integer not null check (finding_version >= 1),
  source_support_status text not null check (source_support_status in
    ('supported', 'partially_supported', 'unsupported', 'contradicted', 'parser_uncertain')),
  precedence_status text not null check (precedence_status in
    ('active', 'superseded', 'conflicting', 'undetermined')),
  proof_requirement text not null check (proof_requirement in
    ('none_identified', 'requires_human_confirmation', 'requires_company_artifact',
     'requires_external_validation', 'undetermined')),
  machine_status text not null default 'machine_assessment_only'
    check (machine_status = 'machine_assessment_only'),
  rationale text not null,
  material_mismatches jsonb not null default '[]'::jsonb,
  deterministic_facts jsonb not null default '[]'::jsonb,
  parser_concerns jsonb not null default '[]'::jsonb,
  ambiguity_notes jsonb not null default '[]'::jsonb,
  prompt_version text not null,
  schema_version text not null,
  model_id text not null,
  provider_request_id text,
  created_at timestamptz not null default now(),
  foreign key (verification_run_id, workspace_id, analysis_run_id)
    references public.verification_runs (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (candidate_id, workspace_id, analysis_run_id)
    references public.requirement_candidates (id, workspace_id, analysis_run_id) on delete cascade,
  unique (candidate_id, finding_version),
  unique (verification_run_id, candidate_id),
  unique (id, workspace_id)
);

create table public.verification_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  finding_id uuid not null,
  document_id uuid not null,
  document_page_id uuid not null,
  page_number integer not null check (page_number >= 1),
  evidence_role text not null check (evidence_role in ('supporting', 'contradicting', 'addendum')),
  quote_exact text not null,
  quote_normalized text not null,
  normalization_version text not null,
  match_type text not null check (match_type in ('exact', 'normalized_exact', 'fuzzy_candidate', 'not_found')),
  start_offset integer,
  end_offset integer,
  model_proposed boolean not null default true,
  validated boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (finding_id, workspace_id) references public.verification_findings (id, workspace_id) on delete cascade,
  foreign key (document_id) references public.documents (id) on delete cascade,
  foreign key (document_page_id) references public.document_pages (id) on delete cascade
);

create table public.requirement_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  verification_run_id uuid not null references public.verification_runs (id) on delete cascade,
  finding_id uuid not null,
  source_candidate_id uuid not null references public.requirement_candidates (id) on delete cascade,
  target_candidate_id uuid not null references public.requirement_candidates (id) on delete cascade,
  relationship_type text not null check (relationship_type in
    ('exact_duplicate', 'semantic_duplicate', 'restatement', 'parent_child', 'related_distinct', 'uncertain',
     'supersedes', 'replaces', 'revises', 'conflicts_with')),
  rationale text not null,
  machine_confidence numeric(4,3) check (machine_confidence is null or machine_confidence between 0 and 1),
  human_status text not null default 'pending' check (human_status = 'pending'),
  created_at timestamptz not null default now(),
  foreign key (finding_id, workspace_id) references public.verification_findings (id, workspace_id) on delete cascade,
  check (source_candidate_id <> target_candidate_id),
  unique (verification_run_id, source_candidate_id, target_candidate_id, relationship_type)
);

create table public.human_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  finding_id uuid not null,
  relationship_id uuid references public.requirement_relationships (id),
  reviewer_id uuid not null references auth.users (id),
  decision text not null check (decision in ('accepted', 'rejected', 'needs_follow_up', 'waived')),
  note text not null default '',
  corrected_values jsonb not null default '{}'::jsonb,
  prior_decision_id uuid references public.human_review_decisions (id),
  created_at timestamptz not null default now(),
  foreign key (finding_id, workspace_id) references public.verification_findings (id, workspace_id) on delete cascade
);

create or replace function public.reject_verification_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% records are append-only', tg_table_name;
end;
$$;
create trigger trg_verification_findings_immutable
  before update on public.verification_findings for each row execute function public.reject_verification_mutation();
create trigger trg_human_review_decisions_immutable
  before update or delete on public.human_review_decisions for each row execute function public.reject_verification_mutation();

-- Cross-workspace references are rejected deterministically even for privileged worker writes.
create or replace function public.validate_verification_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_workspace uuid; v_page integer;
begin
  if tg_table_name = 'verification_retrieval_chunks' then
    select workspace_id, page_number into v_workspace, v_page from public.document_pages where id = new.document_page_id;
  else
    select workspace_id, page_number into v_workspace, v_page from public.document_pages where id = new.document_page_id;
  end if;
  if v_workspace is distinct from new.workspace_id or v_page is distinct from new.page_number then
    raise exception 'cross-workspace or page-mismatched evidence reference';
  end if;
  select workspace_id into v_workspace from public.documents where id = new.document_id;
  if v_workspace is distinct from new.workspace_id then
    raise exception 'cross-workspace document reference';
  end if;
  return new;
end;
$$;
create trigger trg_verification_retrieval_scope
  before insert on public.verification_retrieval_chunks for each row execute function public.validate_verification_scope();
create trigger trg_verification_evidence_scope
  before insert on public.verification_evidence for each row execute function public.validate_verification_scope();

create or replace function public.validate_relationship_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.requirement_candidates where id = new.source_candidate_id and workspace_id = new.workspace_id)
     or not exists (select 1 from public.requirement_candidates where id = new.target_candidate_id and workspace_id = new.workspace_id) then
    raise exception 'cross-workspace candidate relationship';
  end if;
  return new;
end;
$$;
create trigger trg_requirement_relationship_scope
  before insert on public.requirement_relationships for each row execute function public.validate_relationship_scope();

-- Controlled append-only human decision path. Machine finding remains unchanged.
create or replace function public.record_human_review_decision(
  p_workspace_id uuid,
  p_finding_id uuid,
  p_decision text,
  p_note text default '',
  p_corrected_values jsonb default '{}'::jsonb,
  p_relationship_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_prior uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_decision not in ('accepted', 'rejected', 'needs_follow_up', 'waived') then
    raise exception 'invalid review decision';
  end if;
  if p_decision = 'waived' and char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'waiver requires a reason';
  end if;
  if not exists (select 1 from public.verification_findings where id = p_finding_id and workspace_id = p_workspace_id) then
    raise exception 'finding not found in workspace';
  end if;
  if p_relationship_id is not null and not exists (
    select 1 from public.requirement_relationships where id = p_relationship_id and workspace_id = p_workspace_id and finding_id = p_finding_id
  ) then raise exception 'relationship not found in workspace'; end if;
  select id into v_prior from public.human_review_decisions
    where finding_id = p_finding_id and relationship_id is not distinct from p_relationship_id
    order by created_at desc limit 1;
  insert into public.human_review_decisions
    (workspace_id, finding_id, relationship_id, reviewer_id, decision, note, corrected_values, prior_decision_id)
  values
    (p_workspace_id, p_finding_id, p_relationship_id, v_actor, p_decision,
     left(coalesce(p_note, ''), 4000), coalesce(p_corrected_values, '{}'::jsonb), v_prior)
  returning id into v_id;
  insert into public.audit_events (workspace_id, actor_type, actor_id, event_type, entity_type, entity_id, payload)
  values (p_workspace_id, 'user', v_actor, 'verification_reviewed', 'verification_finding', p_finding_id,
    jsonb_build_object('decision_id', v_id, 'decision', p_decision, 'prior_decision_id', v_prior, 'relationship_id', p_relationship_id));
  return v_id;
end;
$$;
revoke all on function public.record_human_review_decision(uuid, uuid, text, text, jsonb, uuid) from public;
grant execute on function public.record_human_review_decision(uuid, uuid, text, text, jsonb, uuid) to authenticated;

create index idx_verification_runs_workspace on public.verification_runs (workspace_id, created_at desc);
create index idx_verification_findings_workspace on public.verification_findings (workspace_id, created_at desc);
create index idx_verification_findings_candidate on public.verification_findings (candidate_id, finding_version desc);
create index idx_verification_evidence_finding on public.verification_evidence (finding_id);
create index idx_requirement_relationships_source on public.requirement_relationships (source_candidate_id);
create index idx_human_review_decisions_finding on public.human_review_decisions (finding_id, created_at desc);

alter table public.verification_runs enable row level security;
alter table public.verification_retrieval_chunks enable row level security;
alter table public.verification_findings enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.requirement_relationships enable row level security;
alter table public.human_review_decisions enable row level security;

create policy verification_runs_select on public.verification_runs for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy verification_retrieval_chunks_select on public.verification_retrieval_chunks for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy verification_findings_select on public.verification_findings for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy verification_evidence_select on public.verification_evidence for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy requirement_relationships_select on public.requirement_relationships for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy human_review_decisions_select on public.human_review_decisions for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'workspace_created', 'workspace_updated', 'workspace_archived',
  'document_uploaded', 'document_validated', 'document_parsed',
  'document_rejected', 'document_parse_failed', 'document_deleted',
  'analysis_started', 'analysis_completed', 'analysis_failed',
  'verification_started', 'verification_completed', 'verification_failed', 'verification_reviewed',
  'requirement_reviewed', 'checklist_item_updated', 'finding_resolved',
  'export_generated', 'demo_reset'
));

alter table public.processing_jobs drop constraint if exists processing_jobs_stage_check;
alter table public.processing_jobs add constraint processing_jobs_stage_check
  check (stage in ('validate', 'parse', 'index', 'extract', 'verify'));
