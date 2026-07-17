-- Phase 4 follow-up: close privileged-path composite-scope gaps discovered during final diff review.

alter table public.verification_runs
  add constraint verification_runs_id_workspace_unique unique (id, workspace_id);

alter table public.requirement_relationships
  add constraint requirement_relationships_run_scope_fk
  foreign key (verification_run_id, workspace_id)
  references public.verification_runs (id, workspace_id) on delete cascade;

create or replace function public.validate_verification_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_workspace uuid; v_page integer; v_document uuid;
begin
  select workspace_id, page_number, document_id
    into v_workspace, v_page, v_document
    from public.document_pages where id = new.document_page_id;
  if v_workspace is distinct from new.workspace_id
     or v_page is distinct from new.page_number
     or v_document is distinct from new.document_id then
    raise exception 'cross-workspace, page-mismatched, or document-mismatched evidence reference';
  end if;
  select workspace_id into v_workspace from public.documents where id = new.document_id;
  if v_workspace is distinct from new.workspace_id then
    raise exception 'cross-workspace document reference';
  end if;
  return new;
end;
$$;

create or replace function public.validate_relationship_scope()
returns trigger language plpgsql set search_path = '' as $$
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
  return new;
end;
$$;

create or replace function public.validate_human_review_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.verification_findings
    where id = new.finding_id and workspace_id = new.workspace_id
  ) then raise exception 'cross-workspace human-review finding'; end if;
  if new.relationship_id is not null and not exists (
    select 1 from public.requirement_relationships
    where id = new.relationship_id and workspace_id = new.workspace_id
      and finding_id = new.finding_id
  ) then raise exception 'human-review relationship scope mismatch'; end if;
  if new.prior_decision_id is not null and not exists (
    select 1 from public.human_review_decisions
    where id = new.prior_decision_id and workspace_id = new.workspace_id
      and finding_id = new.finding_id
      and relationship_id is not distinct from new.relationship_id
  ) then raise exception 'human-review revision scope mismatch'; end if;
  return new;
end;
$$;

create trigger trg_human_review_decisions_scope
  before insert on public.human_review_decisions
  for each row execute function public.validate_human_review_scope();

create or replace function public.validate_verification_model_call_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.verification_run_id is not null and not exists (
    select 1 from public.verification_runs
    where id = new.verification_run_id
      and workspace_id = new.workspace_id
      and analysis_run_id = new.analysis_run_id
  ) then raise exception 'verification model-call scope mismatch'; end if;
  return new;
end;
$$;

create trigger trg_model_calls_verification_scope
  before insert on public.model_calls
  for each row execute function public.validate_verification_model_call_scope();
