-- Phase 9 director dashboard single-scan aggregation.
--
-- The prior parity wrapper called the original aggregate and then scanned the
-- scoped review population a second time. At 1,000 findings that redundant
-- materialization could reach the database statement timeout. Compute every
-- executive and publication-gate metric from one bounded run-scoped queue
-- materialization instead.

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
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.phase9_evaluation_runs
    where id=p_evaluation_run_id
      and workspace_id=p_workspace_id
      and status='completed'
  ) then
    raise exception 'completed phase9 run required';
  end if;

  with queue as materialized (
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
    from public.phase9_review_queue_v1 queue
    where queue.workspace_id=p_workspace_id
      and queue.evaluation_run_id=p_evaluation_run_id
  ), queue_stats as (
    select
      count(*) total_findings,
      count(*) filter(where review_lane='critical') critical,
      count(*) filter(where review_lane='exception') exceptions,
      count(*) filter(where review_lane='duplicate') duplicates,
      count(*) filter(where review_lane='routine') routine,
      count(*) filter(
        where review_lane='critical' and latest_decision_id is null
      ) unresolved_critical,
      count(*) filter(
        where review_lane='exception' and latest_decision_id is null
      ) unresolved_exceptions,
      count(*) filter(
        where review_lane='duplicate' and latest_decision_id is null
      ) unresolved_duplicates,
      count(*) filter(
        where review_lane='routine' and latest_decision_id is null
      ) unresolved_routine,
      count(*) filter(where latest_decision_id is not null) reviewed,
      count(*) filter(
        where human_decision='accepted' and publishable
      ) valid_accepted,
      count(*) filter(
        where human_decision='accepted' and not publishable
      ) invalid_accepted,
      count(*) filter(
        where human_decision='accepted' and not publishable
          and review_lane='exception'
      ) invalid_accepted_exceptions,
      count(*) filter(
        where human_decision='accepted' and not publishable
          and review_lane='duplicate'
      ) invalid_accepted_duplicates,
      count(*) filter(where human_decision='needs_follow_up') follow_up,
      count(*) filter(where batch_accept_eligible) batch_eligible,
      count(*) filter(
        where latest_decision_id is null
          and review_lane in ('critical','exception')
      ) individual_review_remaining,
      count(distinct duplicate_signature) filter(
        where duplicate_count>1
      ) duplicate_groups,
      count(distinct duplicate_signature) filter(
        where review_lane='duplicate' and latest_decision_id is null
      ) unresolved_duplicate_groups,
      count(*) filter(
        where review_lane='critical' and category='submission_deadline'
      ) submission_deadlines,
      count(*) filter(
        where review_lane='critical' and category='question_deadline'
      ) question_deadlines,
      count(*) filter(
        where review_lane='critical'
          and category in ('mandatory_form','pricing_form')
      ) required_forms,
      count(*) filter(
        where review_lane='critical'
          and category in (
            'signature','initials','attestation','acknowledgment',
            'addendum_acknowledgment'
          )
      ) signatures_acknowledgments,
      count(*) filter(
        where review_lane='critical'
          and category in ('insurance','bond','license','certification')
      ) insurance_bond_licensing,
      count(*) filter(
        where review_lane='critical' and category='pricing_form'
      ) pricing,
      count(*) filter(
        where proof_requirement<>'none_identified'
      ) bidder_evidence_required
    from queue
  ), coverage_stats as (
    select
      count(*) coverage_exceptions,
      count(*) filter(where latest_decision_id is not null) coverage_reviewed,
      count(*) filter(where human_decision='needs_follow_up') coverage_follow_up
    from public.phase9_coverage_exception_pages_v1
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), published as (
    select coalesce(max(published_count),0) published_requirements
    from public.phase9_bridge_runs
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), source_population as (
    select count(*) finding_count
    from public.phase9_findings
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), combined as (
    select
      queue_stats.*,
      coverage_stats.*,
      published.published_requirements,
      greatest(source_population.finding_count-queue_stats.total_findings,0)
        unrepresented_findings
    from queue_stats
    cross join coverage_stats
    cross join published
    cross join source_population
  )
  select jsonb_build_object(
    'version','phase9-review-priority-v1',
    'totalFindings',total_findings,
    'critical',critical,
    'exceptions',exceptions,
    'duplicates',duplicates,
    'routine',routine,
    'unresolvedCritical',unresolved_critical,
    'unresolvedExceptions',unresolved_exceptions,
    'unresolvedDuplicates',unresolved_duplicates,
    'unresolvedRoutine',unresolved_routine,
    'reviewed',reviewed,
    'publishableAccepted',valid_accepted,
    'invalidAccepted',invalid_accepted,
    'unrepresentedFindings',unrepresented_findings,
    'followUp',follow_up,
    'batchEligible',batch_eligible,
    'individualReviewRemaining',individual_review_remaining,
    'duplicateGroups',duplicate_groups,
    'unresolvedDuplicateGroups',unresolved_duplicate_groups,
    'submissionDeadlines',submission_deadlines,
    'questionDeadlines',question_deadlines,
    'requiredForms',required_forms,
    'signaturesAcknowledgments',signatures_acknowledgments,
    'insuranceBondLicensing',insurance_bond_licensing,
    'pricing',pricing,
    'coverageExceptions',coverage_exceptions,
    'coverageReviewed',coverage_reviewed,
    'coverageFollowUp',coverage_follow_up,
    'unresolvedCoverageExceptions',
      coverage_exceptions-coverage_reviewed,
    'publishedRequirements',published_requirements,
    'bidderEvidenceRequired',bidder_evidence_required,
    'reviewCompletionPercentage',
      case
        when total_findings+coverage_exceptions=0 then 0
        else round(
          (
            (reviewed+coverage_reviewed)::numeric /
            (total_findings+coverage_exceptions)::numeric
          )*100,
          1
        )
      end,
    'publicationEligible',
      total_findings>0
      and reviewed=total_findings
      and follow_up=0
      and invalid_accepted=0
      and unrepresented_findings=0
      and valid_accepted>0
      and coverage_reviewed=coverage_exceptions
      and coverage_follow_up=0,
    'nextRecommendedAction',
      case
        when unresolved_critical>0 then 'review_critical'
        when unresolved_exceptions>0 then 'review_exceptions'
        when coverage_reviewed<coverage_exceptions
          then 'review_coverage_exceptions'
        when follow_up+coverage_follow_up>0 then 'resolve_follow_up'
        when unresolved_duplicates>0 then 'review_duplicates'
        when unresolved_routine>0 then 'accelerate_routine_review'
        when unrepresented_findings>0 or invalid_accepted_exceptions>0
          then 'review_exceptions'
        when invalid_accepted_duplicates>0 then 'review_duplicates'
        when invalid_accepted>0 or valid_accepted=0
          then 'review_team_decisions'
        when published_requirements=0 then 'publish_reviewed_requirements'
        else 'open_submission_checklist'
      end
  ) into v_result
  from combined;

  return coalesce(v_result,'{}'::jsonb);
end
$$;

revoke all on function public.get_phase9_review_dashboard_scoped_inner_v2(
  uuid,uuid
) from public,anon,authenticated;
