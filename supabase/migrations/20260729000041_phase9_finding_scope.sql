-- Push the explicit workspace/run scope into evidence expansion and decision
-- ranking. The outer scoped view alone cannot be pushed through all window
-- functions by PostgreSQL, so this keeps historical runs out before those
-- operations begin.

create or replace view public.phase9_review_queue_unscoped_v1
with (security_invoker=true) as
with scope as materialized (
  select
    (nullif(current_setting('app.phase9_review_workspace_id',true),''))::uuid
      workspace_id,
    (nullif(current_setting('app.phase9_review_run_id',true),''))::uuid
      evaluation_run_id
), latest_decisions as (
  select distinct on (
    decision.workspace_id,decision.evaluation_run_id,decision.candidate_hash
  )
    decision.workspace_id,decision.evaluation_run_id,decision.candidate_hash,
    decision.id latest_decision_id,decision.decision human_decision,
    decision.created_at decision_created_at
  from public.phase9_finding_review_decisions decision
  cross join scope
  where (
    scope.workspace_id is null and scope.evaluation_run_id is null
  ) or (
    decision.workspace_id=scope.workspace_id
    and decision.evaluation_run_id=scope.evaluation_run_id
  )
  order by
    decision.workspace_id,decision.evaluation_run_id,decision.candidate_hash,
    decision.created_at desc,decision.id desc
), unresolved_pages as (
  select
    exception.workspace_id,exception.evaluation_run_id,
    exception.source_document_id,exception.page_number
  from public.phase9_coverage_exception_pages_v1 exception
  where exception.latest_decision_id is null
    or exception.human_decision='needs_follow_up'
), evidence_expanded as (
  select
    finding.id finding_id,finding.workspace_id,finding.evaluation_run_id,
    finding.candidate_hash,
    jsonb_array_length(finding.evidence_block_hashes) evidence_count,
    coverage.id coverage_id,coverage.source_document_id,
    coverage.source_document_key,coverage.page_number,
    coverage.sheet_name,coverage.cell_range,coverage.block_hash,
    coverage.route,
    (unresolved.source_document_id is not null) unresolved_coverage_exception,
    seed.evidence_text,
    coalesce(page.text,'') page_text
  from public.phase9_findings finding
  cross join scope
  join public.phase9_candidate_seeds seed
    on seed.workspace_id=finding.workspace_id
    and seed.evaluation_run_id=finding.evaluation_run_id
    and seed.candidate_hash=finding.candidate_hash
  left join lateral
    jsonb_array_elements_text(finding.evidence_block_hashes) block(value) on true
  left join public.phase9_source_block_coverage coverage
    on coverage.workspace_id=finding.workspace_id
    and coverage.evaluation_run_id=finding.evaluation_run_id
    and coverage.block_hash=block.value
  left join public.document_pages page
    on page.workspace_id=finding.workspace_id
    and page.document_id=coverage.source_document_id
    and page.page_number=coverage.page_number
  left join unresolved_pages unresolved
    on unresolved.workspace_id=finding.workspace_id
    and unresolved.evaluation_run_id=finding.evaluation_run_id
    and unresolved.source_document_id=coverage.source_document_id
    and unresolved.page_number=coverage.page_number
  where (
    scope.workspace_id is null and scope.evaluation_run_id is null
  ) or (
    finding.workspace_id=scope.workspace_id
    and finding.evaluation_run_id=scope.evaluation_run_id
  )
), evidence_scored as (
  select expanded.*,
    case
      when length(trim(expanded.evidence_text))>0
        and expanded.page_number is not null
        and position(expanded.evidence_text in expanded.page_text)>0
        then 'exact'
      when length(trim(expanded.evidence_text))>0
        and expanded.page_number is not null
        and position(
          regexp_replace(trim(expanded.evidence_text),E'\s+',' ','g')
          in regexp_replace(trim(expanded.page_text),E'\s+',' ','g')
        )>0
        then 'normalized_exact'
      else 'not_found'
    end quote_match_type
  from evidence_expanded expanded
), evidence_ranked as (
  select scored.*,
    row_number() over(
      partition by scored.workspace_id,scored.evaluation_run_id,scored.finding_id
      order by
        case scored.quote_match_type
          when 'exact' then 0 when 'normalized_exact' then 1 else 2
        end,
        scored.page_number nulls last,scored.sheet_name,scored.cell_range,
        scored.block_hash
    ) evidence_rank
  from evidence_scored scored
), evidence_summary as (
  select
    evidence.workspace_id,evidence.evaluation_run_id,evidence.finding_id,
    max(evidence.evidence_count) evidence_count,
    count(evidence.coverage_id)=max(evidence.evidence_count)
      and coalesce(bool_and(
        evidence.coverage_id is not null
        and (
          evidence.page_number is not null
          or (evidence.sheet_name is not null and evidence.cell_range is not null)
        )
      ),false) page_references_complete,
    coalesce(bool_or(evidence.route='parser_uncertain'),false) parser_uncertain,
    coalesce(bool_or(evidence.unresolved_coverage_exception),false)
      unresolved_coverage_exception
  from evidence_ranked evidence
  group by evidence.workspace_id,evidence.evaluation_run_id,evidence.finding_id
), selected_evidence as (
  select
    evidence.workspace_id,evidence.evaluation_run_id,evidence.finding_id,
    evidence.source_document_id,evidence.source_document_key,
    evidence.page_number,evidence.sheet_name,evidence.cell_range,
    evidence.quote_match_type
  from evidence_ranked evidence
  where evidence.evidence_rank=1
), base as (
  select
    finding.id finding_id,finding.workspace_id,finding.evaluation_run_id,
    finding.candidate_hash,finding.source_support_status,
    finding.precedence_status,finding.proof_requirement,
    finding.evidence_block_hashes,finding.ambiguity_code,finding.machine_only,
    seed.requirement_type,seed.obligation_text,seed.evidence_text,
    seed.material_facts,
    public.phase9_review_category_v1(
      seed.requirement_type,seed.obligation_text,seed.material_facts
    ) category,
    nullif(seed.material_facts->>'formReference','') form_reference,
    case
      when coalesce(
        nullif(seed.material_facts->>'normalizedDate',''),
        nullif(seed.material_facts->>'dateValue','')
      ) ~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(
        nullif(seed.material_facts->>'normalizedDate',''),
        nullif(seed.material_facts->>'dateValue','')
      ) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$'
      then coalesce(
        nullif(seed.material_facts->>'normalizedDate',''),
        nullif(seed.material_facts->>'dateValue','')
      )
      else null
    end deadline_iso,
    case
      when seed.material_facts->>'mandatoryClass'
        in ('mandatory','optional','uncertain')
        then seed.material_facts->>'mandatoryClass'
      when seed.material_facts->>'mandatory_class'
        in ('mandatory','optional','uncertain')
        then seed.material_facts->>'mandatory_class'
      when lower(seed.obligation_text) ~ '\m(must|shall|required|mandatory)\M'
        then 'mandatory'
      else 'uncertain'
    end mandatory_class,
    evidence.source_document_id,evidence.source_document_key,evidence.page_number,
    evidence.sheet_name,evidence.cell_range,evidence.quote_match_type,
    summary.evidence_count,summary.page_references_complete,
    summary.parser_uncertain,summary.unresolved_coverage_exception,
    decision.latest_decision_id,decision.human_decision,
    decision.decision_created_at,
    case when
      finding.source_support_status='supported'
      and finding.precedence_status='active'
      and finding.machine_only
      and summary.evidence_count>0
      and summary.page_references_complete
      and evidence.source_document_id is not null
      and evidence.quote_match_type in ('exact','normalized_exact')
      and finding.ambiguity_code is null
      and not summary.parser_uncertain
      and not summary.unresolved_coverage_exception
    then public.phase9_review_duplicate_signature_v1(
      seed.obligation_text,
      public.phase9_review_category_v1(
        seed.requirement_type,seed.obligation_text,seed.material_facts
      ),
      evidence.source_document_id,finding.precedence_status,
      seed.material_facts,seed.evidence_text
    ) end duplicate_signature
  from public.phase9_findings finding
  join public.phase9_candidate_seeds seed
    on seed.workspace_id=finding.workspace_id
    and seed.evaluation_run_id=finding.evaluation_run_id
    and seed.candidate_hash=finding.candidate_hash
  join evidence_summary summary
    on summary.workspace_id=finding.workspace_id
    and summary.evaluation_run_id=finding.evaluation_run_id
    and summary.finding_id=finding.id
  left join selected_evidence evidence
    on evidence.workspace_id=finding.workspace_id
    and evidence.evaluation_run_id=finding.evaluation_run_id
    and evidence.finding_id=finding.id
  left join latest_decisions decision
    on decision.workspace_id=finding.workspace_id
    and decision.evaluation_run_id=finding.evaluation_run_id
    and decision.candidate_hash=finding.candidate_hash
), ranked as (
  select base.*,
    count(duplicate_signature) over(
      partition by workspace_id,evaluation_run_id,duplicate_signature
    ) duplicate_count,
    row_number() over(
      partition by workspace_id,evaluation_run_id,duplicate_signature
      order by page_number nulls last,candidate_hash
    ) duplicate_rank,
    first_value(candidate_hash) over(
      partition by workspace_id,evaluation_run_id,duplicate_signature
      order by page_number nulls last,candidate_hash
    ) canonical_candidate_hash
  from base
), classified as (
  select ranked.*,
    case
      when source_support_status<>'supported' then 'exception'
      when precedence_status<>'active' then 'exception'
      when not machine_only then 'exception'
      when evidence_count<1 then 'exception'
      when not page_references_complete then 'exception'
      when quote_match_type not in ('exact','normalized_exact') then 'exception'
      when ambiguity_code is not null then 'exception'
      when parser_uncertain then 'exception'
      when unresolved_coverage_exception then 'exception'
      when category in (
        'submission_deadline','question_deadline','mandatory_form','pricing_form',
        'signature','initials','attestation','acknowledgment',
        'addendum_acknowledgment','insurance','bond','license',
        'pre_bid_conference','site_visit','delivery_method',
        'electronic_submission','physical_submission','copy_count',
        'file_format','naming_requirement','packaging_requirement',
        'subcontractor_disclosure'
      ) or (
        mandatory_class='mandatory' and (
          category in ('attachment','certification')
          or lower(obligation_text) ~
          '(deadline|due date|mandatory form|required form|pricing|signature|signed|initial|attest|acknowledg|insurance|bond|license|permit|certif|pre[- ]?bid|site visit|delivery method|electronic submission|physical submission|hard copy|copies|file format|file name|package|sealed|mandatory attachment|subcontractor disclosure)'
        )
      ) or lower(obligation_text) ~
        '((failure|omission).{0,160}(reject|disqualif|nonresponsive|invalidate)|(shall|will|may)\s+be\s+(rejected|disqualified|deemed\s+nonresponsive))'
      then 'critical'
      when duplicate_count>1 and duplicate_rank>1 then 'duplicate'
      else 'routine'
    end review_lane
  from ranked
)
select classified.*,
  case
    when source_support_status<>'supported' then 'source_not_supported'
    when precedence_status<>'active' then 'precedence_not_active'
    when not machine_only then 'machine_status_ineligible'
    when evidence_count<1 then 'evidence_missing'
    when not page_references_complete then 'page_reference_incomplete'
    when quote_match_type not in ('exact','normalized_exact')
      then 'quotation_not_validated'
    when ambiguity_code is not null then 'ambiguity_present'
    when parser_uncertain then 'parser_uncertain'
    when unresolved_coverage_exception then 'coverage_exception_unresolved'
    when review_lane='critical' then 'submission_critical'
    when review_lane='duplicate' then 'deterministic_noncanonical_duplicate'
    else 'clean_routine'
  end lane_reason,
  (review_lane='routine' and latest_decision_id is null) batch_accept_eligible,
  (
    review_lane='duplicate' and duplicate_rank>1 and latest_decision_id is null
  ) batch_duplicate_reject_eligible,
  'phase9-review-priority-v1' priority_version,
  'phase9-duplicate-policy-v1' duplicate_policy_version
from classified;

revoke all on public.phase9_review_queue_unscoped_v1
  from public,anon,authenticated;
