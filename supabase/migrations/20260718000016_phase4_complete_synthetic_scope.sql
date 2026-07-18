-- Phase 4 complete synthetic smoke scope.
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY.
--
-- This is additive. Existing immutable one-candidate scopes remain untouched and
-- are labeled legacy. Only phase4-complete-scope-v1 is eligible for the
-- production smoke harness. The complete marker is inserted later by the
-- repository-owned provisioning script after its fixture checks pass.

alter table public.phase4_synthetic_smoke_scopes
  add column if not exists scope_version text not null default 'phase4-legacy-scope-v0',
  add column if not exists document_set_hash text,
  add column if not exists expected_answers_hash text;

alter table public.phase4_synthetic_smoke_scopes
  drop constraint if exists phase4_synthetic_smoke_scopes_scope_version_check;
alter table public.phase4_synthetic_smoke_scopes
  add constraint phase4_synthetic_smoke_scopes_scope_version_check check (
    scope_version in ('phase4-legacy-scope-v0', 'phase4-complete-scope-v1')
  );

alter table public.phase4_synthetic_smoke_scopes
  drop constraint if exists phase4_synthetic_smoke_scopes_complete_hashes_check;
alter table public.phase4_synthetic_smoke_scopes
  add constraint phase4_synthetic_smoke_scopes_complete_hashes_check check (
    scope_version <> 'phase4-complete-scope-v1'
    or (
      cardinality(approved_candidate_ids) = 24
      and cardinality(approved_document_ids) = 1
      and document_set_hash ~ '^[a-f0-9]{64}$'
      and expected_answers_hash ~ '^[a-f0-9]{64}$'
    )
  );

create or replace function public.validate_phase4_synthetic_smoke_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_workspace uuid;
  v_expected_candidate_ids uuid[];
begin
  select workspace_id into v_workspace
  from public.analysis_runs
  where id = new.analysis_run_id;
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

  if new.scope_version = 'phase4-complete-scope-v1' then
    if new.workspace_id <> '10000000-0000-4000-8000-000000000001'::uuid
      or new.analysis_run_id <> '10000000-0000-4000-8000-000000000003'::uuid then
      raise exception 'complete synthetic scope has unexpected workspace or analysis run';
    end if;
    if new.fixture_version <> 'verification-cases-v2'
      or new.compatibility_fingerprint <>
        'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b'
      or new.synthetic_marker <> 'phase4-synthetic-test-only' then
      raise exception 'complete synthetic scope has incompatible fixture, fingerprint, or marker';
    end if;
    if new.approved_document_ids <>
      array['10000000-0000-4000-8000-000000000002'::uuid] then
      raise exception 'complete synthetic scope document set is not exact';
    end if;
    select array_agg(
      format('20000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid order by n
    ) into v_expected_candidate_ids from generate_series(1, 24) n;
    if (select array_agg(id order by id) from unnest(new.approved_candidate_ids) id)
      is distinct from v_expected_candidate_ids then
      raise exception 'complete synthetic scope candidate set is not exact';
    end if;
    if (
      select count(*) from public.requirement_candidates
      where analysis_run_id = new.analysis_run_id and workspace_id = new.workspace_id
    ) <> 24 then
      raise exception 'complete synthetic scope requires exactly 24 run candidates';
    end if;
    if (
      select count(*) from public.documents
      where workspace_id = new.workspace_id and deleted_at is null
    ) <> 1 then
      raise exception 'complete synthetic scope requires exact active document set';
    end if;
  end if;
  return new;
end;
$$;

-- No ordinary-user policies are added. RLS remains deny-by-default, and the
-- existing immutable trigger continues to reject UPDATE and DELETE even for
-- privileged callers.
