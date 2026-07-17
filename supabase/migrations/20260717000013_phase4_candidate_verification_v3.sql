-- Phase 4 remediation: candidate-centered fact envelopes, two-pass semantic results,
-- deterministic final decisions, and auditable precedence relationship evidence.

alter table public.model_calls drop constraint if exists model_calls_stage_check;
alter table public.model_calls add constraint model_calls_stage_check
  check (stage in ('embed', 'extract', 'verify', 'verify_entailment', 'verify_challenge', 'verify_duplicate'));

alter table public.verification_findings
  add column if not exists decision_engine_version text not null default 'verification-decision-v2-legacy',
  add column if not exists deterministic_model_disagreement jsonb not null default '[]'::jsonb,
  add column if not exists challenge_status text not null default 'not_required';
alter table public.verification_findings drop constraint if exists verification_findings_challenge_status_check;
alter table public.verification_findings add constraint verification_findings_challenge_status_check
  check (challenge_status in ('not_required', 'completed', 'failed'));

create table public.verification_fact_envelopes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  candidate_id uuid not null,
  envelope_version text not null,
  context_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (verification_run_id, workspace_id, analysis_run_id)
    references public.verification_runs (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (candidate_id, workspace_id, analysis_run_id)
    references public.requirement_candidates (id, workspace_id, analysis_run_id) on delete cascade,
  unique (verification_run_id, candidate_id),
  unique (id, workspace_id)
);

create table public.verification_pass_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  candidate_id uuid not null,
  target_candidate_id uuid,
  pass_type text not null check (pass_type in ('entailment', 'challenge', 'duplicate')),
  status text not null check (status in ('succeeded', 'refused', 'incomplete', 'failed')),
  prompt_version text not null,
  schema_version text not null,
  model_id text not null,
  provider_request_id text,
  result jsonb,
  error_category text,
  error_detail text,
  created_at timestamptz not null default now(),
  foreign key (verification_run_id, workspace_id, analysis_run_id)
    references public.verification_runs (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (candidate_id, workspace_id, analysis_run_id)
    references public.requirement_candidates (id, workspace_id, analysis_run_id) on delete cascade,
  foreign key (target_candidate_id, workspace_id, analysis_run_id)
    references public.requirement_candidates (id, workspace_id, analysis_run_id) on delete cascade,
  check (result is null or result ->> 'machineOnly' = 'true'),
  check ((pass_type = 'duplicate' and target_candidate_id is not null) or
         (pass_type <> 'duplicate' and target_candidate_id is null)),
  unique (id, workspace_id)
);

-- NULLS DISTINCT would otherwise permit duplicate single-candidate passes. Keep the
-- one-candidate Pass A/Pass B invariant and pairwise duplicate idempotency explicit.
create unique index verification_pass_results_single_unique
  on public.verification_pass_results (verification_run_id, candidate_id, pass_type)
  where target_candidate_id is null;
create unique index verification_pass_results_pair_unique
  on public.verification_pass_results
    (verification_run_id, candidate_id, target_candidate_id, pass_type)
  where target_candidate_id is not null;

alter table public.requirement_relationships
  add column if not exists original_document_id uuid references public.documents (id),
  add column if not exists original_page_number integer check (original_page_number is null or original_page_number >= 1),
  add column if not exists addendum_document_id uuid references public.documents (id),
  add column if not exists addendum_page_number integer check (addendum_page_number is null or addendum_page_number >= 1),
  add column if not exists precedence_quote text,
  add column if not exists deterministic_metadata jsonb not null default '{}'::jsonb,
  add column if not exists relationship_version text not null default 'relationship-v1',
  add column if not exists machine_assessment text not null default 'machine_proposal_only';
alter table public.requirement_relationships drop constraint if exists requirement_relationships_machine_assessment_check;
alter table public.requirement_relationships add constraint requirement_relationships_machine_assessment_check
  check (machine_assessment = 'machine_proposal_only');

create or replace function public.validate_relationship_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_workspace uuid;
begin
  if not exists (
    select 1 from public.verification_runs
    where id = new.verification_run_id and workspace_id = new.workspace_id
  ) then raise exception 'cross-workspace verification-run relationship'; end if;
  if not exists (
    select 1 from public.verification_findings
    where id = new.finding_id and workspace_id = new.workspace_id
      and verification_run_id = new.verification_run_id
  ) then raise exception 'relationship finding/run scope mismatch'; end if;
  if not exists (
    select 1 from public.requirement_candidates
    where id = new.source_candidate_id and workspace_id = new.workspace_id
  ) or not exists (
    select 1 from public.requirement_candidates
    where id = new.target_candidate_id and workspace_id = new.workspace_id
  ) then raise exception 'cross-workspace candidate relationship'; end if;
  if new.original_document_id is not null then
    select workspace_id into v_workspace from public.documents where id = new.original_document_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'cross-workspace original relationship document'; end if;
    if new.original_page_number is null or not exists (
      select 1 from public.document_pages where document_id = new.original_document_id
        and workspace_id = new.workspace_id and page_number = new.original_page_number
    ) then raise exception 'invalid original relationship page'; end if;
  end if;
  if new.addendum_document_id is not null then
    select workspace_id into v_workspace from public.documents where id = new.addendum_document_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'cross-workspace addendum relationship document'; end if;
    if new.addendum_page_number is null or not exists (
      select 1 from public.document_pages where document_id = new.addendum_document_id
        and workspace_id = new.workspace_id and page_number = new.addendum_page_number
    ) then raise exception 'invalid addendum relationship page'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.reject_verification_intermediate_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% records are append-only', tg_table_name;
end;
$$;
create trigger trg_verification_fact_envelopes_immutable
  before update on public.verification_fact_envelopes
  for each row execute function public.reject_verification_intermediate_mutation();
create trigger trg_verification_pass_results_immutable
  before update on public.verification_pass_results
  for each row execute function public.reject_verification_intermediate_mutation();

create index idx_verification_fact_envelopes_candidate
  on public.verification_fact_envelopes (candidate_id, created_at desc);
create index idx_verification_pass_results_candidate
  on public.verification_pass_results (candidate_id, pass_type, created_at desc);

alter table public.verification_fact_envelopes enable row level security;
alter table public.verification_pass_results enable row level security;

create policy verification_fact_envelopes_select on public.verification_fact_envelopes
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy verification_pass_results_select on public.verification_pass_results
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
