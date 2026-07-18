-- Phase 4 production-path alignment: qualified runtime provenance and immutable synthetic smoke scopes.

alter table public.analysis_runs
  add column if not exists verification_compatibility_fingerprint text;
alter table public.verification_runs
  add column if not exists compatibility_fingerprint text;
alter table public.model_calls
  add column if not exists compatibility_fingerprint text;

alter table public.analysis_runs drop constraint if exists analysis_runs_verification_fingerprint_check;
alter table public.analysis_runs add constraint analysis_runs_verification_fingerprint_check
  check (verification_compatibility_fingerprint is null or
    verification_compatibility_fingerprint ~ '^[a-f0-9]{64}$');
alter table public.verification_runs drop constraint if exists verification_runs_fingerprint_check;
alter table public.verification_runs add constraint verification_runs_fingerprint_check
  check (compatibility_fingerprint is null or compatibility_fingerprint ~ '^[a-f0-9]{64}$');
alter table public.model_calls drop constraint if exists model_calls_fingerprint_check;
alter table public.model_calls add constraint model_calls_fingerprint_check
  check (compatibility_fingerprint is null or compatibility_fingerprint ~ '^[a-f0-9]{64}$');

create table public.phase4_synthetic_smoke_scopes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  authenticated_user_id uuid not null references auth.users (id),
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  fixture_version text not null check (fixture_version = 'verification-cases-v2'),
  compatibility_fingerprint text not null
    check (compatibility_fingerprint ~ '^[a-f0-9]{64}$'),
  approved_document_ids uuid[] not null check (cardinality(approved_document_ids) > 0),
  approved_candidate_ids uuid[] not null check (cardinality(approved_candidate_ids) > 0),
  candidate_set_hash text not null check (candidate_set_hash ~ '^[a-f0-9]{64}$'),
  synthetic_marker text not null check (synthetic_marker = 'phase4-synthetic-test-only'),
  created_at timestamptz not null default now(),
  unique (workspace_id, analysis_run_id),
  unique (id, workspace_id)
);

create or replace function public.validate_phase4_synthetic_smoke_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from public.analysis_runs where id = new.analysis_run_id;
  if v_workspace is distinct from new.workspace_id then
    raise exception 'cross-workspace synthetic smoke analysis run';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = new.workspace_id and user_id = new.authenticated_user_id
  ) then
    raise exception 'synthetic smoke identity lacks workspace access';
  end if;
  if exists (
    select 1 from unnest(new.approved_document_ids) document_id
    where not exists (
      select 1 from public.documents
      where id = document_id and workspace_id = new.workspace_id and deleted_at is null
        and parser_name = 'synthetic-fixture'
    )
  ) then raise exception 'cross-workspace synthetic smoke document'; end if;
  if exists (
    select 1 from unnest(new.approved_candidate_ids) candidate_id
    where not exists (
      select 1 from public.requirement_candidates
      where id = candidate_id and workspace_id = new.workspace_id
        and analysis_run_id = new.analysis_run_id
    )
  ) then raise exception 'cross-workspace synthetic smoke candidate'; end if;
  return new;
end;
$$;

create trigger trg_phase4_synthetic_smoke_scope_validate
  before insert on public.phase4_synthetic_smoke_scopes
  for each row execute function public.validate_phase4_synthetic_smoke_scope();
create trigger trg_phase4_synthetic_smoke_scope_immutable
  before update or delete on public.phase4_synthetic_smoke_scopes
  for each row execute function public.reject_verification_intermediate_mutation();

alter table public.phase4_synthetic_smoke_scopes enable row level security;
-- Deliberately no ordinary-user policy: marker creation and reads are service-role-only.
