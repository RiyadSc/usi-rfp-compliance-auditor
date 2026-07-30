-- Phase 9 dashboard direct-scope aggregation.
--
-- The director dashboard previously aggregated through phase9_review_queue_v1 and
-- phase9_coverage_exception_pages_v1. Those views can seq-scan historical runs
-- before scope filters apply and were timing out under concurrent demo load.
-- Reuse the authoritative direct-scoped queue plan and count coverage pages from
-- the same workspace/run parameters.

create or replace function public.get_phase9_review_dashboard_scoped_inner_v2(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
set plan_cache_mode='force_custom_plan'
set enable_nestloop='off'
set statement_timeout='60s'
stable
as $$
declare
  v_page integer := 1;
  v_page_size integer := 50;
  v_total integer := 0;
  v_chunk jsonb;
  v_rows jsonb := '[]'::jsonb;
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

  loop
    v_chunk := public.get_phase9_review_queue_scoped_inner_v1(
      p_workspace_id,
      p_evaluation_run_id,
      'all',
      '',
      null,
      v_page,
      v_page_size
    );
    v_total := coalesce((v_chunk->>'total')::integer,0);
    v_rows := v_rows || coalesce(v_chunk->'rows','[]'::jsonb);
    exit when v_total=0 or v_page*v_page_size>=v_total;
    v_page := v_page+1;
    if v_page>1000 then
      raise exception 'phase9 dashboard page limit exceeded';
    end if;
  end loop;

  with queue as materialized (
    select *
    from jsonb_to_recordset(v_rows) as row(
      review_lane text,
      latest_decision_id uuid,
      human_decision text,
      source_support_status text,
      precedence_status text,
      machine_only boolean,
      evidence_count integer,
      page_references_complete boolean,
      quote_match_type text,
      evidence_text text,
      source_document_id uuid,
      page_number integer,
      ambiguity_code text,
      parser_uncertain boolean,
      unresolved_coverage_exception boolean,
      batch_accept_eligible boolean,
      duplicate_signature text,
      duplicate_count bigint,
      category text,
      proof_requirement text
    )
  ), queue_enriched as materialized (
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
        and length(trim(coalesce(queue.evidence_text,'')))>0
        and queue.source_document_id is not null
        and queue.page_number is not null
        and queue.ambiguity_code is null
        and not coalesce(queue.parser_uncertain,false)
        and not coalesce(queue.unresolved_coverage_exception,false)
      ) publishable
    from queue
  ), queue_stats as (
    select
      count(*)::integer total_findings,
      count(*) filter(where review_lane='critical')::integer critical,
      count(*) filter(where review_lane='exception')::integer exceptions,
      count(*) filter(where review_lane='duplicate')::integer duplicates,
      count(*) filter(where review_lane='routine')::integer routine,
      count(*) filter(
        where review_lane='critical' and latest_decision_id is null
      )::integer unresolved_critical,
      count(*) filter(
        where review_lane='exception' and latest_decision_id is null
      )::integer unresolved_exceptions,
      count(*) filter(
        where review_lane='duplicate' and latest_decision_id is null
      )::integer unresolved_duplicates,
      count(*) filter(
        where review_lane='routine' and latest_decision_id is null
      )::integer unresolved_routine,
      count(*) filter(where latest_decision_id is not null)::integer reviewed,
      count(*) filter(
        where human_decision='accepted' and publishable
      )::integer valid_accepted,
      count(*) filter(
        where human_decision='accepted' and not publishable
      )::integer invalid_accepted,
      count(*) filter(
        where human_decision='accepted' and not publishable
          and review_lane='exception'
      )::integer invalid_accepted_exceptions,
      count(*) filter(
        where human_decision='accepted' and not publishable
          and review_lane='duplicate'
      )::integer invalid_accepted_duplicates,
      count(*) filter(where human_decision='needs_follow_up')::integer follow_up,
      count(*) filter(where batch_accept_eligible)::integer batch_eligible,
      count(*) filter(
        where latest_decision_id is null
          and review_lane in ('critical','exception')
      )::integer individual_review_remaining,
      count(distinct duplicate_signature) filter(
        where duplicate_count>1
      )::integer duplicate_groups,
      count(distinct duplicate_signature) filter(
        where review_lane='duplicate' and latest_decision_id is null
      )::integer unresolved_duplicate_groups,
      count(*) filter(
        where review_lane='critical' and category='submission_deadline'
      )::integer submission_deadlines,
      count(*) filter(
        where review_lane='critical' and category='question_deadline'
      )::integer question_deadlines,
      count(*) filter(
        where review_lane='critical'
          and category in ('mandatory_form','pricing_form')
      )::integer required_forms,
      count(*) filter(
        where review_lane='critical'
          and category in (
            'signature','initials','attestation','acknowledgment',
            'addendum_acknowledgment'
          )
      )::integer signatures_acknowledgments,
      count(*) filter(
        where review_lane='critical'
          and category in ('insurance','bond','license','certification')
      )::integer insurance_bond_licensing,
      count(*) filter(
        where review_lane='critical' and category='pricing_form'
      )::integer pricing,
      count(*) filter(
        where proof_requirement<>'none_identified'
      )::integer bidder_evidence_required
    from queue_enriched
  ), coverage_state as materialized (
    select
      coverage.source_document_id,
      coverage.page_number,
      count(*) coverage_count,
      bool_or(coverage.route='parser_uncertain') parser_uncertain,
      bool_or(exists (
        select 1
        from public.phase9_candidate_seeds seed
        cross join lateral jsonb_array_elements_text(
          seed.source_block_hashes
        ) block(value)
        left join public.phase9_findings finding
          on finding.workspace_id=p_workspace_id
          and finding.evaluation_run_id=p_evaluation_run_id
          and finding.candidate_hash=seed.candidate_hash
        where seed.workspace_id=p_workspace_id
          and seed.evaluation_run_id=p_evaluation_run_id
          and block.value=coverage.block_hash
          and finding.id is null
      )) seed_unassessed,
      bool_or(exists (
        select 1
        from jsonb_array_elements_text(
          coverage.deterministic_signals
        ) signal
        where signal ~* '(deadline|form_identifier|use_attachment|signature)'
      )) high_risk_signal,
      bool_or(exists (
        select 1
        from public.phase9_findings finding
        cross join lateral jsonb_array_elements_text(
          finding.evidence_block_hashes
        ) block(value)
        where finding.workspace_id=p_workspace_id
          and finding.evaluation_run_id=p_evaluation_run_id
          and block.value=coverage.block_hash
      )) has_finding
    from public.phase9_source_block_coverage coverage
    where coverage.workspace_id=p_workspace_id
      and coverage.evaluation_run_id=p_evaluation_run_id
      and coverage.page_number is not null
    group by coverage.source_document_id,coverage.page_number
  ), expected_pages as materialized (
    select
      document.document_id source_document_id,
      generate_series(1,document.page_count) page_number
    from public.phase9_evaluation_documents document
    where document.workspace_id=p_workspace_id
      and document.evaluation_run_id=p_evaluation_run_id
  ), latest_coverage_decisions as materialized (
    select distinct on (decision.source_document_id,decision.page_number)
      decision.source_document_id,
      decision.page_number,
      decision.id latest_decision_id,
      decision.decision human_decision
    from public.phase9_coverage_review_decisions decision
    where decision.workspace_id=p_workspace_id
      and decision.evaluation_run_id=p_evaluation_run_id
    order by
      decision.source_document_id,
      decision.page_number,
      decision.created_at desc,
      decision.id desc
  ), coverage_exceptions as materialized (
    select
      expected.source_document_id,
      expected.page_number,
      review.latest_decision_id,
      review.human_decision
    from expected_pages expected
    left join coverage_state state
      on state.source_document_id=expected.source_document_id
      and state.page_number=expected.page_number
    left join latest_coverage_decisions review
      on review.source_document_id=expected.source_document_id
      and review.page_number=expected.page_number
    where coalesce(state.coverage_count,0)=0
      or coalesce(state.parser_uncertain,false)
      or coalesce(state.seed_unassessed,false)
      or (
        coalesce(state.high_risk_signal,false)
        and not coalesce(state.has_finding,false)
      )
  ), coverage_stats as (
    select
      count(*)::integer coverage_exceptions,
      count(*) filter(where latest_decision_id is not null)::integer
        coverage_reviewed,
      count(*) filter(where human_decision='needs_follow_up')::integer
        coverage_follow_up
    from coverage_exceptions
  ), published as (
    select coalesce(max(published_count),0)::integer published_requirements
    from public.phase9_bridge_runs
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), source_population as (
    select count(*)::integer finding_count
    from public.phase9_findings
    where workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ), combined as (
    select
      queue_stats.*,
      coverage_stats.*,
      published.published_requirements,
      greatest(
        source_population.finding_count-queue_stats.total_findings,0
      )::integer unrepresented_findings
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
end;
$$;

alter function public.get_phase9_review_dashboard_v1(uuid,uuid)
  set statement_timeout='60s';
