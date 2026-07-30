-- Apply the explicit review scope inside page-coverage derivation as well as
-- the outer finding queue. This prevents a large review request from scanning
-- coverage relationships belonging to unrelated historical runs.

create or replace view public.phase9_coverage_exception_pages_v1
with (security_invoker=true) as
with seed_blocks as (
  select
    seed.workspace_id,seed.evaluation_run_id,seed.candidate_hash,
    block.value block_hash
  from public.phase9_candidate_seeds seed
  cross join lateral jsonb_array_elements_text(seed.source_block_hashes) block(value)
  where (
    nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
    and nullif(current_setting('app.phase9_review_run_id',true),'') is null
  ) or (
    seed.workspace_id=(
      nullif(current_setting('app.phase9_review_workspace_id',true),'')
    )::uuid
    and seed.evaluation_run_id=(
      nullif(current_setting('app.phase9_review_run_id',true),'')
    )::uuid
  )
), unassessed_blocks as (
  select distinct seed.workspace_id,seed.evaluation_run_id,seed.block_hash
  from seed_blocks seed
  left join public.phase9_findings finding
    on finding.workspace_id=seed.workspace_id
    and finding.evaluation_run_id=seed.evaluation_run_id
    and finding.candidate_hash=seed.candidate_hash
  where finding.id is null
), finding_blocks as (
  select distinct
    finding.workspace_id,finding.evaluation_run_id,block.value block_hash
  from public.phase9_findings finding
  cross join lateral
    jsonb_array_elements_text(finding.evidence_block_hashes) block(value)
  where (
    nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
    and nullif(current_setting('app.phase9_review_run_id',true),'') is null
  ) or (
    finding.workspace_id=(
      nullif(current_setting('app.phase9_review_workspace_id',true),'')
    )::uuid
    and finding.evaluation_run_id=(
      nullif(current_setting('app.phase9_review_run_id',true),'')
    )::uuid
  )
), coverage_state as (
  select
    coverage.workspace_id,coverage.evaluation_run_id,
    coverage.source_document_id,coverage.page_number,
    count(*) coverage_count,
    bool_or(coverage.route='parser_uncertain') parser_uncertain,
    bool_or(unassessed.block_hash is not null) seed_unassessed,
    bool_or(exists (
      select 1
      from jsonb_array_elements_text(coverage.deterministic_signals) signal
      where signal ~* '(deadline|form_identifier|use_attachment|signature)'
    )) high_risk_signal,
    bool_or(finding.block_hash is not null) has_finding
  from public.phase9_source_block_coverage coverage
  left join unassessed_blocks unassessed
    on unassessed.workspace_id=coverage.workspace_id
    and unassessed.evaluation_run_id=coverage.evaluation_run_id
    and unassessed.block_hash=coverage.block_hash
  left join finding_blocks finding
    on finding.workspace_id=coverage.workspace_id
    and finding.evaluation_run_id=coverage.evaluation_run_id
    and finding.block_hash=coverage.block_hash
  where coverage.page_number is not null
    and (
      (
        nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
        and nullif(current_setting('app.phase9_review_run_id',true),'') is null
      ) or (
        coverage.workspace_id=(
          nullif(current_setting('app.phase9_review_workspace_id',true),'')
        )::uuid
        and coverage.evaluation_run_id=(
          nullif(current_setting('app.phase9_review_run_id',true),'')
        )::uuid
      )
    )
  group by
    coverage.workspace_id,coverage.evaluation_run_id,
    coverage.source_document_id,coverage.page_number
), expected_pages as (
  select
    document.workspace_id,document.evaluation_run_id,
    document.document_id source_document_id,
    generate_series(1,document.page_count) page_number
  from public.phase9_evaluation_documents document
  where (
    nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
    and nullif(current_setting('app.phase9_review_run_id',true),'') is null
  ) or (
    document.workspace_id=(
      nullif(current_setting('app.phase9_review_workspace_id',true),'')
    )::uuid
    and document.evaluation_run_id=(
      nullif(current_setting('app.phase9_review_run_id',true),'')
    )::uuid
  )
), page_state as (
  select
    page.workspace_id,page.evaluation_run_id,page.source_document_id,page.page_number,
    coalesce(state.coverage_count,0)=0 missing_coverage,
    coalesce(state.parser_uncertain,false) parser_uncertain,
    coalesce(state.seed_unassessed,false) seed_unassessed,
    coalesce(state.high_risk_signal,false) high_risk_signal,
    coalesce(state.has_finding,false) has_finding
  from expected_pages page
  left join coverage_state state
    on state.workspace_id=page.workspace_id
    and state.evaluation_run_id=page.evaluation_run_id
    and state.source_document_id=page.source_document_id
    and state.page_number=page.page_number
), exceptions as (
  select page.*,
    case
      when missing_coverage then 'missing_coverage'
      when parser_uncertain then 'parser_uncertain'
      when seed_unassessed then 'candidate_not_assessed'
      else 'high_risk_signal_without_finding'
    end exception_reason
  from page_state page
  where missing_coverage or parser_uncertain or seed_unassessed
    or (high_risk_signal and not has_finding)
), latest_reviews as (
  select distinct on (
    decision.workspace_id,decision.evaluation_run_id,
    decision.source_document_id,decision.page_number
  )
    decision.workspace_id,decision.evaluation_run_id,
    decision.source_document_id,decision.page_number,
    decision.id latest_decision_id,decision.decision human_decision,
    decision.created_at decision_created_at
  from public.phase9_coverage_review_decisions decision
  where (
    nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
    and nullif(current_setting('app.phase9_review_run_id',true),'') is null
  ) or (
    decision.workspace_id=(
      nullif(current_setting('app.phase9_review_workspace_id',true),'')
    )::uuid
    and decision.evaluation_run_id=(
      nullif(current_setting('app.phase9_review_run_id',true),'')
    )::uuid
  )
  order by
    decision.workspace_id,decision.evaluation_run_id,
    decision.source_document_id,decision.page_number,
    decision.created_at desc,decision.id desc
)
select
  exception.*,
  review.latest_decision_id,review.human_decision,review.decision_created_at
from exceptions exception
left join latest_reviews review
  on review.workspace_id=exception.workspace_id
  and review.evaluation_run_id=exception.evaluation_run_id
  and review.source_document_id=exception.source_document_id
  and review.page_number=exception.page_number;

grant select on public.phase9_coverage_exception_pages_v1 to authenticated;

-- Preserve the established authorization error contract at the outer batch
-- boundary while still setting the explicit query scope before revalidation.
create or replace function public.record_phase9_review_batch_v2(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hashes text[],
  p_action text,p_reason text,p_idempotency_key uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan' as $$
begin
  if p_idempotency_key is null then raise exception 'batch idempotency key required'; end if;
  if (select auth.uid()) is null
    or not public.is_workspace_member(p_workspace_id)
  then raise exception 'authorized workspace reviewer required'; end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-batch-v2:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text||':'||p_idempotency_key::text,0
  ));
  return public.record_phase9_review_batch(
    p_workspace_id,p_evaluation_run_id,p_candidate_hashes,p_action,p_reason,
    p_idempotency_key,p_review_session_id
  );
end $$;
