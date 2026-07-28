-- Idempotent reuse must re-check the complete current review state. A later
-- finding or page follow-up may not silently reuse an earlier bridge run.

create or replace function public.assert_phase9_bridge_review_completion(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_finding_count integer;
  v_reviewed_count integer;
  v_follow_up_count integer;
  v_exception_count integer;
  v_exception_reviewed_count integer;
  v_exception_follow_up_count integer;
begin
  select count(*) into v_finding_count from public.phase9_findings
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;

  with latest as (
    select distinct on (candidate_hash) candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
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
    where d.workspace_id=p_workspace_id and d.evaluation_run_id=p_evaluation_run_id
  ), page_state as (
    select ep.source_document_id,ep.page_number,
      count(c.block_hash)=0 missing_coverage,
      coalesce(bool_or(c.route='parser_uncertain'),false) parser_uncertain,
      coalesce(bool_or(
        exists (
          select 1 from public.phase9_candidate_seeds s
          where s.workspace_id=p_workspace_id
            and s.evaluation_run_id=p_evaluation_run_id
            and s.source_block_hashes ? c.block_hash
            and not exists (
              select 1 from public.phase9_findings f
              where f.workspace_id=p_workspace_id
                and f.evaluation_run_id=p_evaluation_run_id
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
          where f.workspace_id=p_workspace_id
            and f.evaluation_run_id=p_evaluation_run_id
            and f.evidence_block_hashes ? c.block_hash
        )
      ),false) has_finding
    from expected_pages ep
    left join public.phase9_source_block_coverage c
      on c.workspace_id=p_workspace_id
      and c.evaluation_run_id=p_evaluation_run_id
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
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
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
end $$;

revoke all on function public.assert_phase9_bridge_review_completion(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.validate_phase9_bridge_review_completion()
returns trigger language plpgsql set search_path='' as $$
begin
  perform public.assert_phase9_bridge_review_completion(
    new.workspace_id,new.evaluation_run_id
  );
  return new;
end $$;

alter function public.publish_phase9_reviewed_findings(uuid,uuid)
  rename to publish_phase9_reviewed_findings_unguarded;
revoke all on function public.publish_phase9_reviewed_findings_unguarded(uuid,uuid)
  from public,anon,authenticated;

create function public.publish_phase9_reviewed_findings(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform public.assert_phase9_bridge_review_completion(
    p_workspace_id,p_evaluation_run_id
  );
  return public.publish_phase9_reviewed_findings_unguarded(
    p_workspace_id,p_evaluation_run_id
  );
end $$;

revoke all on function public.publish_phase9_reviewed_findings(uuid,uuid)
  from public,anon;
grant execute on function public.publish_phase9_reviewed_findings(uuid,uuid)
  to authenticated;

