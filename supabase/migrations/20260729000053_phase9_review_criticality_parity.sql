-- Phase 9 review criticality parity.
--
-- The provider-free TypeScript policy treats a mandatory bid-opening or
-- proposal-opening instruction as submission-critical. Keep the established
-- category unchanged while aligning the internal review view consumed by
-- dashboards, batch validation, and publication. The direct queue function in
-- migration 51 applies the same predicate before this migration.

create or replace view public.phase9_review_queue_unscoped_v1
with (security_invoker=true) as
with guarded as (
  select
    queue.*,
    not exists (
      select 1
      from jsonb_array_elements_text(
        queue.evidence_block_hashes
      ) block(value)
      left join public.phase9_source_block_coverage coverage
        on coverage.workspace_id=queue.workspace_id
        and coverage.evaluation_run_id=queue.evaluation_run_id
        and coverage.block_hash=block.value
      left join public.phase9_evaluation_documents document
        on document.workspace_id=queue.workspace_id
        and document.evaluation_run_id=queue.evaluation_run_id
        and document.document_id=coverage.source_document_id
      where coverage.id is null or document.id is null
    ) evidence_run_bound,
    (
      queue.review_lane in ('routine','duplicate')
      and queue.mandatory_class='mandatory'
      and lower(
        queue.obligation_text||' '||coalesce(queue.form_reference,'')
      ) ~ '\m(bid opening|proposal opening)\M'
    ) mandatory_opening
  from public.phase9_review_queue_pre_integrity_v1 queue
)
select
  guarded.finding_id,
  guarded.workspace_id,
  guarded.evaluation_run_id,
  guarded.candidate_hash,
  guarded.source_support_status,
  guarded.precedence_status,
  guarded.proof_requirement,
  guarded.evidence_block_hashes,
  guarded.ambiguity_code,
  guarded.machine_only,
  guarded.requirement_type,
  guarded.obligation_text,
  guarded.evidence_text,
  guarded.material_facts,
  guarded.category,
  guarded.form_reference,
  guarded.deadline_iso,
  guarded.mandatory_class,
  guarded.source_document_id,
  guarded.source_document_key,
  guarded.page_number,
  guarded.sheet_name,
  guarded.cell_range,
  guarded.quote_match_type,
  guarded.evidence_count,
  guarded.page_references_complete and guarded.evidence_run_bound
    page_references_complete,
  guarded.parser_uncertain,
  guarded.unresolved_coverage_exception,
  guarded.latest_decision_id,
  guarded.human_decision,
  guarded.decision_created_at,
  case when guarded.evidence_run_bound
    then guarded.duplicate_signature else null end duplicate_signature,
  case when guarded.evidence_run_bound
    then guarded.duplicate_count else 0::bigint end duplicate_count,
  case when guarded.evidence_run_bound
    then guarded.duplicate_rank else 1::bigint end duplicate_rank,
  case when guarded.evidence_run_bound
    then guarded.canonical_candidate_hash else null
  end canonical_candidate_hash,
  case
    when not guarded.evidence_run_bound then 'exception'
    when guarded.mandatory_opening then 'critical'
    else guarded.review_lane
  end review_lane,
  case
    when not guarded.evidence_run_bound
      then 'evidence_document_not_bound_to_run'
    when guarded.mandatory_opening then 'submission_critical'
    else guarded.lane_reason
  end lane_reason,
  (
    guarded.batch_accept_eligible
    and guarded.evidence_run_bound
    and not guarded.mandatory_opening
  ) batch_accept_eligible,
  (
    guarded.batch_duplicate_reject_eligible
    and guarded.evidence_run_bound
    and not guarded.mandatory_opening
  ) batch_duplicate_reject_eligible,
  guarded.priority_version,
  guarded.duplicate_policy_version
from guarded;

revoke all on public.phase9_review_queue_unscoped_v1
  from public,anon,authenticated;
