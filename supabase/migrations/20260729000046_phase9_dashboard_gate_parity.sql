-- Keep the director dashboard and next-action recommendation aligned with the
-- authoritative fail-closed publication contract. A reviewed row is not enough:
-- accepted rows must still be publishable, at least one publishable acceptance
-- must exist, and every immutable finding must be represented in the queue.

create or replace function public.get_phase9_review_dashboard_scoped_inner_v2(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
set plan_cache_mode='force_custom_plan'
set enable_nestloop='off'
stable
as $$
declare
  v_base jsonb;
  v_valid_accepted integer;
  v_invalid_accepted integer;
  v_invalid_accepted_exceptions integer;
  v_invalid_accepted_duplicates integer;
  v_queue_count integer;
  v_finding_count integer;
  v_unrepresented integer;
  v_publication_eligible boolean;
  v_next text;
begin
  v_base := public.get_phase9_review_dashboard_scoped_inner_v1(
    p_workspace_id,
    p_evaluation_run_id
  );

  with queue as materialized (
    select *
    from public.phase9_review_queue_v1
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), classified as (
    select
      queue.*,
      (
        queue.review_lane in ('critical','routine')
        and queue.source_support_status='supported'
        and queue.precedence_status='active'
        and queue.machine_only
        and queue.evidence_count>0
        and queue.page_references_complete
        and queue.quote_match_type in ('exact','normalized_exact')
        and length(trim(queue.evidence_text))>0
        and queue.source_document_id is not null
        and queue.page_number is not null
        and queue.ambiguity_code is null
        and not queue.parser_uncertain
        and not queue.unresolved_coverage_exception
      ) publishable
    from queue
  )
  select
    count(*),
    count(*) filter(
      where human_decision='accepted' and publishable
    ),
    count(*) filter(
      where human_decision='accepted' and not publishable
    ),
    count(*) filter(
      where human_decision='accepted' and not publishable
        and review_lane='exception'
    ),
    count(*) filter(
      where human_decision='accepted' and not publishable
        and review_lane='duplicate'
    )
  into
    v_queue_count,
    v_valid_accepted,
    v_invalid_accepted,
    v_invalid_accepted_exceptions,
    v_invalid_accepted_duplicates
  from classified;

  select count(*)
  into v_finding_count
  from public.phase9_findings
  where workspace_id=p_workspace_id
    and evaluation_run_id=p_evaluation_run_id;
  v_unrepresented := greatest(v_finding_count-v_queue_count,0);

  v_publication_eligible :=
    coalesce((v_base->>'totalFindings')::integer,0)>0
    and coalesce((v_base->>'reviewed')::integer,0)
      =coalesce((v_base->>'totalFindings')::integer,0)
    and coalesce((v_base->>'followUp')::integer,0)=0
    and v_invalid_accepted=0
    and v_unrepresented=0
    and v_valid_accepted>0
    and coalesce((v_base->>'coverageReviewed')::integer,0)
      =coalesce((v_base->>'coverageExceptions')::integer,0)
    and coalesce((v_base->>'coverageFollowUp')::integer,0)=0;

  v_next := v_base->>'nextRecommendedAction';
  if v_next in ('publish_reviewed_requirements','open_submission_checklist') then
    if v_unrepresented>0 or v_invalid_accepted_exceptions>0 then
      v_next := 'review_exceptions';
    elsif v_invalid_accepted_duplicates>0 then
      v_next := 'review_duplicates';
    elsif v_invalid_accepted>0 or v_valid_accepted=0 then
      v_next := 'review_team_decisions';
    end if;
  end if;

  return v_base || jsonb_build_object(
    'publishableAccepted',v_valid_accepted,
    'invalidAccepted',v_invalid_accepted,
    'unrepresentedFindings',v_unrepresented,
    'publicationEligible',v_publication_eligible,
    'nextRecommendedAction',v_next
  );
end
$$;

revoke all on function public.get_phase9_review_dashboard_scoped_inner_v2(
  uuid,uuid
) from public,anon,authenticated;

create or replace function public.get_phase9_review_dashboard_v1(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
set plan_cache_mode='force_custom_plan'
set enable_nestloop='off'
stable
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  return public.get_phase9_review_dashboard_scoped_inner_v2(
    p_workspace_id,
    p_evaluation_run_id
  );
end
$$;

revoke all on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  to authenticated;
