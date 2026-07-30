-- Phase 9 review queue direct-scope plan.
--
-- The public queue RPC already receives an explicit workspace and evaluation
-- run. Earlier view-based plans could still materialize evidence and coverage
-- relationships from historical runs before PostgreSQL applied those values.
-- Keep the public contract unchanged while making every expensive CTE begin
-- from the two authoritative scope parameters.

create or replace function public.get_phase9_review_queue_scoped_inner_v1(
  p_workspace_id uuid,
  p_evaluation_run_id uuid,
  p_lane text default 'all',
  p_search text default '',
  p_duplicate_signature text default null,
  p_page integer default 1,
  p_page_size integer default 25
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
  v_rows jsonb;
  v_total integer;
  v_search text := replace(
    replace(replace(trim(coalesce(p_search,'')),E'\\',E'\\\\'),'%','\%'),
    '_','\_'
  );
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if p_lane not in ('critical','exception','duplicate','routine','reviewed','all')
    or p_page not between 1 and 1000000
    or p_page_size not between 1 and 50
    or char_length(coalesce(p_search,''))>160
    or (
      p_duplicate_signature is not null
      and p_duplicate_signature !~ '^[0-9a-f]{64}$'
    )
  then
    raise exception 'invalid review queue request';
  end if;

  with
  scoped_findings as materialized (
    select finding.*
    from public.phase9_findings finding
    where finding.workspace_id=p_workspace_id
      and finding.evaluation_run_id=p_evaluation_run_id
  ),
  scoped_seeds as materialized (
    select seed.*
    from public.phase9_candidate_seeds seed
    where seed.workspace_id=p_workspace_id
      and seed.evaluation_run_id=p_evaluation_run_id
  ),
  latest_decisions as materialized (
    select distinct on (decision.candidate_hash)
      decision.candidate_hash,
      decision.id latest_decision_id,
      decision.decision human_decision,
      decision.created_at decision_created_at
    from public.phase9_finding_review_decisions decision
    where decision.workspace_id=p_workspace_id
      and decision.evaluation_run_id=p_evaluation_run_id
    order by
      decision.candidate_hash,
      decision.created_at desc,
      decision.id desc
  ),
  seed_blocks as materialized (
    select
      seed.candidate_hash,
      block.value block_hash
    from scoped_seeds seed
    cross join lateral
      jsonb_array_elements_text(seed.source_block_hashes) block(value)
  ),
  unassessed_blocks as materialized (
    select distinct seed.block_hash
    from seed_blocks seed
    left join scoped_findings finding
      on finding.candidate_hash=seed.candidate_hash
    where finding.id is null
  ),
  finding_blocks as materialized (
    select distinct block.value block_hash
    from scoped_findings finding
    cross join lateral
      jsonb_array_elements_text(finding.evidence_block_hashes) block(value)
  ),
  coverage_state as materialized (
    select
      coverage.source_document_id,
      coverage.page_number,
      count(*) coverage_count,
      bool_or(coverage.route='parser_uncertain') parser_uncertain,
      bool_or(unassessed.block_hash is not null) seed_unassessed,
      bool_or(exists (
        select 1
        from jsonb_array_elements_text(
          coverage.deterministic_signals
        ) signal
        where signal ~* '(deadline|form_identifier|use_attachment|signature)'
      )) high_risk_signal,
      bool_or(finding.block_hash is not null) has_finding
    from public.phase9_source_block_coverage coverage
    left join unassessed_blocks unassessed
      on unassessed.block_hash=coverage.block_hash
    left join finding_blocks finding
      on finding.block_hash=coverage.block_hash
    where coverage.workspace_id=p_workspace_id
      and coverage.evaluation_run_id=p_evaluation_run_id
      and coverage.page_number is not null
    group by coverage.source_document_id,coverage.page_number
  ),
  expected_pages as materialized (
    select
      document.document_id source_document_id,
      generate_series(1,document.page_count) page_number
    from public.phase9_evaluation_documents document
    where document.workspace_id=p_workspace_id
      and document.evaluation_run_id=p_evaluation_run_id
  ),
  page_state as materialized (
    select
      page.source_document_id,
      page.page_number,
      coalesce(state.coverage_count,0)=0 missing_coverage,
      coalesce(state.parser_uncertain,false) parser_uncertain,
      coalesce(state.seed_unassessed,false) seed_unassessed,
      coalesce(state.high_risk_signal,false) high_risk_signal,
      coalesce(state.has_finding,false) has_finding
    from expected_pages page
    left join coverage_state state
      on state.source_document_id=page.source_document_id
      and state.page_number=page.page_number
  ),
  coverage_exceptions as materialized (
    select page.source_document_id,page.page_number
    from page_state page
    where page.missing_coverage
      or page.parser_uncertain
      or page.seed_unassessed
      or (page.high_risk_signal and not page.has_finding)
  ),
  latest_coverage_reviews as materialized (
    select distinct on (
      decision.source_document_id,
      decision.page_number
    )
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
  ),
  unresolved_pages as materialized (
    select exception.source_document_id,exception.page_number
    from coverage_exceptions exception
    left join latest_coverage_reviews review
      on review.source_document_id=exception.source_document_id
      and review.page_number=exception.page_number
    where review.latest_decision_id is null
      or review.human_decision='needs_follow_up'
  ),
  evidence_expanded as materialized (
    select
      finding.id finding_id,
      finding.candidate_hash,
      jsonb_array_length(finding.evidence_block_hashes) evidence_count,
      coverage.id coverage_id,
      bound_document.id bound_document_id,
      coverage.source_document_id,
      coverage.source_document_key,
      coverage.page_number,
      coverage.sheet_name,
      coverage.cell_range,
      coverage.block_hash,
      coverage.route,
      (unresolved.source_document_id is not null)
        unresolved_coverage_exception,
      seed.evidence_text,
      coalesce(page.text,'') page_text
    from scoped_findings finding
    join scoped_seeds seed
      on seed.candidate_hash=finding.candidate_hash
    left join lateral
      jsonb_array_elements_text(finding.evidence_block_hashes) block(value)
      on true
    left join public.phase9_source_block_coverage coverage
      on coverage.workspace_id=p_workspace_id
      and coverage.evaluation_run_id=p_evaluation_run_id
      and coverage.block_hash=block.value
    left join public.phase9_evaluation_documents bound_document
      on bound_document.workspace_id=p_workspace_id
      and bound_document.evaluation_run_id=p_evaluation_run_id
      and bound_document.document_id=coverage.source_document_id
    left join public.document_pages page
      on page.workspace_id=p_workspace_id
      and page.document_id=coverage.source_document_id
      and page.page_number=coverage.page_number
    left join unresolved_pages unresolved
      on unresolved.source_document_id=coverage.source_document_id
      and unresolved.page_number=coverage.page_number
  ),
  evidence_scored as materialized (
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
  ),
  evidence_ranked as materialized (
    select scored.*,
      row_number() over(
        partition by scored.finding_id
        order by
          case scored.quote_match_type
            when 'exact' then 0
            when 'normalized_exact' then 1
            else 2
          end,
          scored.page_number nulls last,
          scored.sheet_name,
          scored.cell_range,
          scored.block_hash
      ) evidence_rank
    from evidence_scored scored
  ),
  evidence_summary as materialized (
    select
      evidence.finding_id,
      max(evidence.evidence_count) evidence_count,
      count(evidence.coverage_id)=max(evidence.evidence_count)
        and coalesce(bool_and(
          evidence.coverage_id is not null
          and (
            evidence.page_number is not null
            or (
              evidence.sheet_name is not null
              and evidence.cell_range is not null
            )
          )
        ),false) page_references_complete,
      case
        when max(evidence.evidence_count)=0 then true
        else coalesce(bool_and(
          evidence.coverage_id is not null
          and evidence.bound_document_id is not null
        ),false)
      end evidence_run_bound,
      coalesce(bool_or(evidence.route='parser_uncertain'),false)
        parser_uncertain,
      coalesce(bool_or(evidence.unresolved_coverage_exception),false)
        unresolved_coverage_exception
    from evidence_ranked evidence
    group by evidence.finding_id
  ),
  selected_evidence as materialized (
    select
      evidence.finding_id,
      evidence.source_document_id,
      evidence.source_document_key,
      evidence.page_number,
      evidence.sheet_name,
      evidence.cell_range,
      evidence.quote_match_type
    from evidence_ranked evidence
    where evidence.evidence_rank=1
  ),
  base as materialized (
    select
      finding.id finding_id,
      p_workspace_id workspace_id,
      p_evaluation_run_id evaluation_run_id,
      finding.candidate_hash,
      finding.source_support_status,
      finding.precedence_status,
      finding.proof_requirement,
      finding.evidence_block_hashes,
      finding.ambiguity_code,
      finding.machine_only,
      seed.requirement_type,
      seed.obligation_text,
      seed.evidence_text,
      seed.material_facts,
      public.phase9_review_category_v1(
        seed.requirement_type,
        seed.obligation_text,
        seed.material_facts
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
        when lower(seed.obligation_text) ~
          '\m(must|shall|required|mandatory)\M'
          then 'mandatory'
        else 'uncertain'
      end mandatory_class,
      evidence.source_document_id,
      evidence.source_document_key,
      evidence.page_number,
      evidence.sheet_name,
      evidence.cell_range,
      evidence.quote_match_type,
      summary.evidence_count,
      summary.page_references_complete,
      summary.evidence_run_bound,
      summary.parser_uncertain,
      summary.unresolved_coverage_exception,
      decision.latest_decision_id,
      decision.human_decision,
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
          seed.requirement_type,
          seed.obligation_text,
          seed.material_facts
        ),
        evidence.source_document_id,
        finding.precedence_status,
        seed.material_facts,
        seed.evidence_text
      ) end duplicate_signature
    from scoped_findings finding
    join scoped_seeds seed
      on seed.candidate_hash=finding.candidate_hash
    join evidence_summary summary
      on summary.finding_id=finding.id
    left join selected_evidence evidence
      on evidence.finding_id=finding.id
    left join latest_decisions decision
      on decision.candidate_hash=finding.candidate_hash
  ),
  ranked as materialized (
    select base.*,
      count(duplicate_signature) over(
        partition by duplicate_signature
      ) duplicate_count,
      row_number() over(
        partition by duplicate_signature
        order by page_number nulls last,candidate_hash
      ) duplicate_rank,
      first_value(candidate_hash) over(
        partition by duplicate_signature
        order by page_number nulls last,candidate_hash
      ) canonical_candidate_hash
    from base
  ),
  classified as materialized (
    select ranked.*,
      case
        when source_support_status<>'supported' then 'exception'
        when precedence_status<>'active' then 'exception'
        when not machine_only then 'exception'
        when evidence_count<1 then 'exception'
        when not page_references_complete then 'exception'
        when quote_match_type not in ('exact','normalized_exact')
          then 'exception'
        when ambiguity_code is not null then 'exception'
        when parser_uncertain then 'exception'
        when unresolved_coverage_exception then 'exception'
        when category in (
          'submission_deadline','question_deadline','mandatory_form',
          'pricing_form','signature','initials','attestation',
          'acknowledgment','addendum_acknowledgment','insurance','bond',
          'license','pre_bid_conference','site_visit','delivery_method',
          'electronic_submission','physical_submission','copy_count',
          'file_format','naming_requirement','packaging_requirement',
          'subcontractor_disclosure'
        ) or (
          mandatory_class='mandatory' and (
            category in ('attachment','certification')
            or lower(obligation_text) ~
            '(deadline|due date|bid opening|proposal opening|mandatory form|required form|pricing|signature|signed|initial|attest|acknowledg|insurance|bond|license|permit|certif|pre[- ]?bid|site visit|delivery method|electronic submission|physical submission|hard copy|copies|file format|file name|package|sealed|mandatory attachment|subcontractor disclosure)'
          )
        ) or lower(obligation_text) ~
          '((failure|omission).{0,160}(reject|disqualif|nonresponsive|invalidate)|(shall|will|may)\s+be\s+(rejected|disqualified|deemed\s+nonresponsive))'
        then 'critical'
        when duplicate_count>1 and duplicate_rank>1 then 'duplicate'
        else 'routine'
      end review_lane
    from ranked
  ),
  guarded as materialized (
    select
      classified.finding_id,
      classified.workspace_id,
      classified.evaluation_run_id,
      classified.candidate_hash,
      classified.source_support_status,
      classified.precedence_status,
      classified.proof_requirement,
      classified.evidence_block_hashes,
      classified.ambiguity_code,
      classified.machine_only,
      classified.requirement_type,
      classified.obligation_text,
      classified.evidence_text,
      classified.material_facts,
      classified.category,
      classified.form_reference,
      classified.deadline_iso,
      classified.mandatory_class,
      classified.source_document_id,
      classified.source_document_key,
      classified.page_number,
      classified.sheet_name,
      classified.cell_range,
      classified.quote_match_type,
      classified.evidence_count,
      (
        classified.page_references_complete
        and classified.evidence_run_bound
      ) page_references_complete,
      classified.parser_uncertain,
      classified.unresolved_coverage_exception,
      classified.latest_decision_id,
      classified.human_decision,
      classified.decision_created_at,
      case when classified.evidence_run_bound
        then classified.duplicate_signature else null end duplicate_signature,
      case when classified.evidence_run_bound
        then classified.duplicate_count else 0::bigint end duplicate_count,
      case when classified.evidence_run_bound
        then classified.duplicate_rank else 1::bigint end duplicate_rank,
      case when classified.evidence_run_bound
        then classified.canonical_candidate_hash else null
      end canonical_candidate_hash,
      case when classified.evidence_run_bound
        then classified.review_lane else 'exception'
      end review_lane,
      case
        when not classified.evidence_run_bound
          then 'evidence_document_not_bound_to_run'
        when classified.source_support_status<>'supported'
          then 'source_not_supported'
        when classified.precedence_status<>'active'
          then 'precedence_not_active'
        when not classified.machine_only
          then 'machine_status_ineligible'
        when classified.evidence_count<1 then 'evidence_missing'
        when not classified.page_references_complete
          then 'page_reference_incomplete'
        when classified.quote_match_type not in ('exact','normalized_exact')
          then 'quotation_not_validated'
        when classified.ambiguity_code is not null then 'ambiguity_present'
        when classified.parser_uncertain then 'parser_uncertain'
        when classified.unresolved_coverage_exception
          then 'coverage_exception_unresolved'
        when classified.review_lane='critical' then 'submission_critical'
        when classified.review_lane='duplicate'
          then 'deterministic_noncanonical_duplicate'
        else 'clean_routine'
      end lane_reason,
      (
        classified.evidence_run_bound
        and classified.review_lane='routine'
        and classified.latest_decision_id is null
      ) batch_accept_eligible,
      (
        classified.evidence_run_bound
        and classified.review_lane='duplicate'
        and classified.duplicate_rank>1
        and classified.latest_decision_id is null
      ) batch_duplicate_reject_eligible,
      'phase9-review-priority-v1' priority_version,
      'phase9-duplicate-policy-v1' duplicate_policy_version
    from classified
  ),
  filtered as materialized (
    select queue.*
    from guarded queue
    where (
      p_lane='all'
      or (p_lane='reviewed' and queue.latest_decision_id is not null)
      or (
        p_lane in ('critical','exception','duplicate','routine')
        and queue.review_lane=p_lane
      )
    )
    and (
      p_duplicate_signature is null
      or queue.duplicate_signature=p_duplicate_signature
    )
    and (
      trim(coalesce(p_search,''))=''
      or queue.obligation_text ilike '%'||v_search||'%' escape '\'
      or coalesce(queue.form_reference,'') ilike
        '%'||v_search||'%' escape '\'
      or queue.category ilike '%'||v_search||'%' escape '\'
    )
  ),
  bounded as (
    select filtered.*,
      row_number() over(order by
        (latest_decision_id is not null),
        case review_lane
          when 'critical' then 0
          when 'exception' then 1
          when 'duplicate' then 2
          else 3
        end,
        deadline_iso asc nulls last,
        (mandatory_class='mandatory') desc,
        coalesce((
          select document.ordinal
          from public.phase9_evaluation_documents document
          where document.workspace_id=p_workspace_id
            and document.evaluation_run_id=p_evaluation_run_id
            and document.document_id=filtered.source_document_id
        ),2147483647),
        page_number asc nulls last,
        candidate_hash
      ) _queue_order
    from filtered
    order by
      (latest_decision_id is not null),
      case review_lane
        when 'critical' then 0
        when 'exception' then 1
        when 'duplicate' then 2
        else 3
      end,
      deadline_iso asc nulls last,
      (mandatory_class='mandatory') desc,
      coalesce((
        select document.ordinal
        from public.phase9_evaluation_documents document
        where document.workspace_id=p_workspace_id
          and document.evaluation_run_id=p_evaluation_run_id
          and document.document_id=filtered.source_document_id
      ),2147483647),
      page_number asc nulls last,
      candidate_hash
    limit p_page_size
    offset ((p_page-1)*p_page_size)
  )
  select
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(bounded)-'_queue_order'
          order by bounded._queue_order
        )
        from bounded
      ),
      '[]'::jsonb
    ),
    (select count(*) from filtered)
  into v_rows,v_total;

  return jsonb_build_object(
    'version','phase9-review-priority-v1',
    'page',p_page,
    'pageSize',p_page_size,
    'total',v_total,
    'rows',v_rows
  );
end
$$;

revoke all on function public.get_phase9_review_queue_scoped_inner_v1(
  uuid,uuid,text,text,text,integer,integer
) from public,anon,authenticated;
