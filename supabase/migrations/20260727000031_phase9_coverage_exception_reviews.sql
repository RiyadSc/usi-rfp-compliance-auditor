-- Page-level omission exceptions require append-only human disposition before
-- reviewed Phase 9 findings may enter the Phase 4 register.

create table public.phase9_coverage_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  source_document_id uuid not null,
  page_number integer not null check (page_number > 0),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('accepted','needs_follow_up')),
  note text not null default '' check (char_length(note) <= 4000),
  prior_decision_id uuid references public.phase9_coverage_review_decisions(id) on delete restrict,
  review_version text not null check (review_version='phase9-coverage-review-v1'),
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(source_document_id,workspace_id)
    references public.documents(id,workspace_id) on delete restrict,
  foreign key(evaluation_run_id,source_document_id)
    references public.phase9_evaluation_documents(evaluation_run_id,document_id) on delete restrict,
  unique(id,workspace_id)
);
create index phase9_coverage_reviews_scope_idx
  on public.phase9_coverage_review_decisions(
    workspace_id,evaluation_run_id,source_document_id,page_number,created_at desc
  );

create trigger phase9_coverage_review_decisions_immutable
  before update or delete on public.phase9_coverage_review_decisions
  for each row execute function public.reject_phase9_immutable_mutation();

alter table public.phase9_coverage_review_decisions enable row level security;
create policy phase9_coverage_review_decisions_select
  on public.phase9_coverage_review_decisions for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
grant select on public.phase9_coverage_review_decisions to authenticated;

create or replace function public.record_phase9_coverage_review(
  p_workspace_id uuid,
  p_evaluation_run_id uuid,
  p_source_document_id uuid,
  p_page_number integer,
  p_decision text,
  p_note text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_prior uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_decision not in ('accepted','needs_follow_up') then
    raise exception 'invalid phase9 coverage review decision';
  end if;
  if p_decision='needs_follow_up' and char_length(trim(coalesce(p_note,''))) < 5 then
    raise exception 'coverage follow-up requires a reason';
  end if;
  if not exists (
    select 1 from public.phase9_evaluation_documents
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and document_id=p_source_document_id and p_page_number between 1 and page_count
  ) then raise exception 'phase9 coverage page not found in workspace run'; end if;

  select id into v_prior from public.phase9_coverage_review_decisions
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    and source_document_id=p_source_document_id and page_number=p_page_number
  order by created_at desc,id desc limit 1;

  insert into public.phase9_coverage_review_decisions(
    workspace_id,evaluation_run_id,source_document_id,page_number,reviewer_id,
    decision,note,prior_decision_id,review_version
  ) values (
    p_workspace_id,p_evaluation_run_id,p_source_document_id,p_page_number,v_actor,
    p_decision,left(coalesce(p_note,''),4000),v_prior,'phase9-coverage-review-v1'
  ) returning id into v_id;

  insert into public.audit_events(
    workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
  ) values (
    p_workspace_id,'user',v_actor,'verification_reviewed','phase9_coverage_page',v_id,
    jsonb_build_object(
      'evaluation_run_id',p_evaluation_run_id,'document_id',p_source_document_id,
      'page_number',p_page_number,'decision',p_decision,'prior_decision_id',v_prior,
      'review_version','phase9-coverage-review-v1'
    )
  );
  return v_id;
end $$;

revoke all on function public.record_phase9_coverage_review(
  uuid,uuid,uuid,integer,text,text
) from public,anon;
grant execute on function public.record_phase9_coverage_review(
  uuid,uuid,uuid,integer,text,text
) to authenticated;

create or replace function public.validate_phase9_bridge_review_completion()
returns trigger language plpgsql set search_path='' as $$
declare
  v_finding_count integer;
  v_reviewed_count integer;
  v_follow_up_count integer;
  v_exception_count integer;
  v_exception_reviewed_count integer;
  v_exception_follow_up_count integer;
begin
  select count(*) into v_finding_count from public.phase9_findings
  where workspace_id=new.workspace_id and evaluation_run_id=new.evaluation_run_id;

  with latest as (
    select distinct on (candidate_hash) candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=new.workspace_id and evaluation_run_id=new.evaluation_run_id
    order by candidate_hash,created_at desc,id desc
  )
  select count(*),count(*) filter (where decision='needs_follow_up')
  into v_reviewed_count,v_follow_up_count from latest;

  if v_finding_count=0 or v_reviewed_count<>v_finding_count then
    raise exception 'all phase9 findings require a team decision before publication (% of % reviewed)',
      v_reviewed_count,v_finding_count;
  end if;
  if v_follow_up_count>0 then
    raise exception 'phase9 follow-up decisions must be resolved before publication (%)',
      v_follow_up_count;
  end if;

  with expected_pages as (
    select d.document_id source_document_id,generate_series(1,d.page_count) page_number
    from public.phase9_evaluation_documents d
    where d.workspace_id=new.workspace_id and d.evaluation_run_id=new.evaluation_run_id
  ), page_state as (
    select ep.source_document_id,ep.page_number,
      count(c.block_hash)=0 missing_coverage,
      coalesce(bool_or(c.route='parser_uncertain'),false) parser_uncertain,
      coalesce(bool_or(
        exists (
          select 1 from public.phase9_candidate_seeds s
          where s.workspace_id=new.workspace_id
            and s.evaluation_run_id=new.evaluation_run_id
            and s.source_block_hashes ? c.block_hash
            and not exists (
              select 1 from public.phase9_findings f
              where f.workspace_id=new.workspace_id
                and f.evaluation_run_id=new.evaluation_run_id
                and f.candidate_hash=s.candidate_hash
            )
        )
      ),false) seed_unassessed,
      coalesce(bool_or(
        exists (
          select 1 from jsonb_array_elements_text(c.deterministic_signals) signal
          where signal ~* '(deadline|form_identifier|use_attachment|signature)'
        )
      ),false) high_risk_signal,
      coalesce(bool_or(
        exists (
          select 1 from public.phase9_findings f
          where f.workspace_id=new.workspace_id
            and f.evaluation_run_id=new.evaluation_run_id
            and f.evidence_block_hashes ? c.block_hash
        )
      ),false) has_finding
    from expected_pages ep
    left join public.phase9_source_block_coverage c
      on c.workspace_id=new.workspace_id
      and c.evaluation_run_id=new.evaluation_run_id
      and c.source_document_id=ep.source_document_id
      and c.page_number=ep.page_number
    group by ep.source_document_id,ep.page_number
  ), exceptions as (
    select source_document_id,page_number from page_state
    where missing_coverage or parser_uncertain or seed_unassessed
      or (high_risk_signal and not has_finding)
  ), latest_reviews as (
    select distinct on (source_document_id,page_number)
      source_document_id,page_number,decision
    from public.phase9_coverage_review_decisions
    where workspace_id=new.workspace_id and evaluation_run_id=new.evaluation_run_id
    order by source_document_id,page_number,created_at desc,id desc
  )
  select count(*),count(lr.source_document_id),
    count(*) filter (where lr.decision='needs_follow_up')
  into v_exception_count,v_exception_reviewed_count,v_exception_follow_up_count
  from exceptions e
  left join latest_reviews lr using(source_document_id,page_number);

  if v_exception_reviewed_count<>v_exception_count then
    raise exception 'all phase9 coverage exceptions require a team decision before publication (% of % reviewed)',
      v_exception_reviewed_count,v_exception_count;
  end if;
  if v_exception_follow_up_count>0 then
    raise exception 'phase9 coverage follow-up decisions must be resolved before publication (%)',
      v_exception_follow_up_count;
  end if;
  return new;
end $$;
