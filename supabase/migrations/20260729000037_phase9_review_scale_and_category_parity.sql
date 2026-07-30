-- Keep the review queue responsive for large solicitations by expanding JSON
-- evidence relationships once per query instead of rerunning correlated page
-- and coverage checks for every finding. This migration is additive and does
-- not mutate any source, finding, evidence, or human-decision record.

create index if not exists phase9_source_coverage_review_lookup_idx
  on public.phase9_source_block_coverage(
    workspace_id,evaluation_run_id,block_hash,source_document_id,page_number
  );
create index if not exists phase9_findings_review_lookup_idx
  on public.phase9_findings(
    workspace_id,evaluation_run_id,candidate_hash
  );
create index if not exists phase9_candidate_seeds_review_lookup_idx
  on public.phase9_candidate_seeds(
    workspace_id,evaluation_run_id,candidate_hash
  );
create index if not exists document_pages_review_lookup_idx
  on public.document_pages(workspace_id,document_id,page_number);

-- Keep the TypeScript and database category contracts identical. In
-- particular, "questions must be submitted by" is a question deadline.
create or replace function public.phase9_review_category_v1(
  p_requirement_type text,p_obligation_text text,p_material_facts jsonb
) returns text language sql immutable set search_path='' as $$
  select case
    when lower(p_obligation_text) ~ '\m(question(s)?|inquir(y|ies))\M'
      and lower(p_obligation_text) ~ '\m(due|deadline|submit|submitted)\M'
      then 'question_deadline'
    when lower(p_requirement_type)='deadline'
      or lower(p_obligation_text) ~
        '\m(proposal|bid|response|submission)\M.*\m(due|deadline)\M'
      then 'submission_deadline'
    when lower(p_requirement_type)='form'
      or nullif(p_material_facts->>'formReference','') is not null
      or lower(p_obligation_text) ~ '\mform\s+[a-z0-9-]+'
      then case when lower(
        p_obligation_text||' '||coalesce(p_material_facts->>'formReference','')
      ) ~ '\m(price|pricing|cost)\M'
        then 'pricing_form' else 'mandatory_form' end
    when lower(p_obligation_text) ~
      '(\m(addendum|amendment)\M.*\m(acknowledge|acknowledgment|confirm)\M|\m(acknowledge|acknowledgment|confirm)\M.*\m(addendum|amendment)\M)'
      then 'addendum_acknowledgment'
    when lower(p_requirement_type)='signature'
      or lower(p_obligation_text) ~ '\m(sign|signature|signed)\M' then 'signature'
    when lower(p_obligation_text) ~ '\m(initial|initials|initialed)\M' then 'initials'
    when lower(p_obligation_text) ~ '\macknowledg(e|ement|ment)\M'
      then 'acknowledgment'
    when lower(p_obligation_text) ~ '\mattest(ation)?\M' then 'attestation'
    when lower(p_requirement_type)='insurance'
      or lower(p_obligation_text) ~ '\minsurance\M' then 'insurance'
    when lower(p_requirement_type)='license'
      or lower(p_obligation_text) ~ '\m(license|licence|permit)\M' then 'license'
    when lower(p_requirement_type)='meeting'
      or lower(p_obligation_text) ~ '\m(pre[- ]?bid|site visit|conference|meeting)\M'
      then case
        when lower(p_obligation_text) ~ '\msite visit\M' then 'site_visit'
        when lower(p_obligation_text) ~ '\m(pre[- ]?bid|conference)\M'
          then 'pre_bid_conference'
        else 'meeting' end
    when lower(p_requirement_type)='pricing'
      or lower(p_obligation_text) ~ '\m(pricing|cost sheet)\M' then 'pricing_form'
    when lower(p_requirement_type)='attachment'
      or lower(p_obligation_text) ~ '\mattachment\M' then 'attachment'
    when lower(p_obligation_text) ~ '\mbond\M' then 'bond'
    when lower(p_obligation_text) ~ '\m(certificate|certification)\M'
      then 'certification'
    when lower(p_requirement_type)='staffing'
      or lower(p_obligation_text) ~ '\mstaffing plan\M' then 'staffing_plan'
    when lower(p_obligation_text) ~ '\mresume\M' then 'resume'
    when lower(p_obligation_text) ~ '\mreference\M' then 'reference'
    when lower(p_obligation_text) ~
      '(\msubcontractor\M.*\m(disclose|disclosure|list|identify)\M|\m(disclose|disclosure|list|identify)\M.*\msubcontractor\M)'
      then 'subcontractor_disclosure'
    when lower(p_obligation_text) ~ '\m(electronic|portal|email)\M'
      and lower(p_obligation_text) ~ '\m(submit|deliver|upload)\M'
      then 'electronic_submission'
    when lower(p_obligation_text) ~ '\m(sealed|hard copy|hard copies|physical)\M'
      and lower(p_obligation_text) ~ '\m(submit|deliver|package)\M'
      then 'physical_submission'
    when lower(p_obligation_text) ~ '\m(copy|copies)\M' then 'copy_count'
    when lower(p_obligation_text) ~ '\m(file name|naming convention)\M'
      then 'naming_requirement'
    when lower(p_obligation_text) ~ '(file format|\.pdf|\.xlsx)'
      then 'file_format'
    when lower(p_obligation_text) ~ '\m(delivery method|deliver by|submit by)\M'
      then 'delivery_method'
    when lower(p_obligation_text) ~ '\m(package|packaging|seal|sealed|sealing)\M'
      then 'packaging_requirement'
    else 'other_material_requirement'
  end
$$;

-- The page-exception view previously searched every seed and finding JSON
-- array from inside every coverage row. Flattening those relationships once
-- gives the same result without quadratic work.
create or replace view public.phase9_coverage_exception_pages_v1
with (security_invoker=true) as
with seed_blocks as (
  select
    seed.workspace_id,seed.evaluation_run_id,seed.candidate_hash,
    block.value block_hash
  from public.phase9_candidate_seeds seed
  cross join lateral jsonb_array_elements_text(seed.source_block_hashes) block(value)
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
  group by
    coverage.workspace_id,coverage.evaluation_run_id,
    coverage.source_document_id,coverage.page_number
), expected_pages as (
  select
    document.workspace_id,document.evaluation_run_id,
    document.document_id source_document_id,
    generate_series(1,document.page_count) page_number
  from public.phase9_evaluation_documents document
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

-- Compute evidence validity, parser state, coverage state, and the selected
-- quotation occurrence in set-based CTEs. The public column contract remains
-- unchanged.
create or replace view public.phase9_review_queue_v1
with (security_invoker=true) as
with latest_decisions as (
  select distinct on (
    decision.workspace_id,decision.evaluation_run_id,decision.candidate_hash
  )
    decision.workspace_id,decision.evaluation_run_id,decision.candidate_hash,
    decision.id latest_decision_id,decision.decision human_decision,
    decision.created_at decision_created_at
  from public.phase9_finding_review_decisions decision
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

grant select on public.phase9_review_queue_v1 to authenticated;
grant select on public.phase9_coverage_exception_pages_v1 to authenticated;
