-- Keep the provider-free domain policy, production queue, workflow analytics,
-- and concurrent delivery behavior under one fail-closed review contract.
-- Existing findings, evidence, decisions, provider artifacts, and audit rows
-- remain immutable.

create or replace function public.phase9_review_category_v1(
  p_requirement_type text,p_obligation_text text,p_material_facts jsonb
) returns text language sql immutable set search_path='' as $$
  select case
    when lower(p_obligation_text) ~ '\m(question(s)?|inquir(y|ies))\M'
      and lower(p_obligation_text) ~ '\m(due|deadline|submit)\M'
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

create or replace function public.phase9_canonical_json_v1(p_value jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{'||coalesce(string_agg(
        to_json(entry.key)::text||':'||
          public.phase9_canonical_json_v1(entry.value),
        ',' order by entry.key
      ),'')||'}' into v_result
      from jsonb_each(p_value) entry;
    when 'array' then
      select '['||coalesce(string_agg(
        public.phase9_canonical_json_v1(entry.value),
        ',' order by entry.ordinality
      ),'')||']' into v_result
      from jsonb_array_elements(p_value) with ordinality entry(value,ordinality);
    else v_result := p_value::text;
  end case;
  return v_result;
end $$;

create or replace function public.phase9_review_duplicate_signature_v1(
  p_obligation_text text,p_category text,p_source_document_id uuid,
  p_precedence_status text,p_material_facts jsonb,p_evidence_text text
) returns text language sql immutable set search_path='' as $$
  select encode(
    extensions.digest(
      convert_to(
        'phase9-duplicate-policy-v1|' ||
        lower(regexp_replace(trim(p_obligation_text),E'\s+',' ','g')) || '|' ||
        p_category || '|' || p_source_document_id::text || '|' ||
        p_precedence_status || '|' ||
        public.phase9_canonical_json_v1(coalesce(p_material_facts,'{}'::jsonb)) || '|' ||
        lower(regexp_replace(trim(p_evidence_text),E'\s+',' ','g')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace view public.phase9_review_queue_v1
with (security_invoker=true) as
with base as (
  select
    f.id finding_id,f.workspace_id,f.evaluation_run_id,f.candidate_hash,
    f.source_support_status,f.precedence_status,f.proof_requirement,
    f.evidence_block_hashes,f.ambiguity_code,f.machine_only,
    s.requirement_type,s.obligation_text,s.evidence_text,s.material_facts,
    public.phase9_review_category_v1(
      s.requirement_type,s.obligation_text,s.material_facts
    ) category,
    nullif(s.material_facts->>'formReference','') form_reference,
    case
      when coalesce(
        nullif(s.material_facts->>'normalizedDate',''),
        nullif(s.material_facts->>'dateValue','')
      ) ~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(
        nullif(s.material_facts->>'normalizedDate',''),
        nullif(s.material_facts->>'dateValue','')
      ) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$'
      then coalesce(
        nullif(s.material_facts->>'normalizedDate',''),
        nullif(s.material_facts->>'dateValue','')
      )
      else null
    end deadline_iso,
    case
      when s.material_facts->>'mandatoryClass' in ('mandatory','optional','uncertain')
        then s.material_facts->>'mandatoryClass'
      when s.material_facts->>'mandatory_class' in ('mandatory','optional','uncertain')
        then s.material_facts->>'mandatory_class'
      when lower(s.obligation_text) ~ '\m(must|shall|required|mandatory)\M'
        then 'mandatory'
      else 'uncertain'
    end mandatory_class,
    evidence.source_document_id,evidence.source_document_key,evidence.page_number,
    evidence.sheet_name,evidence.cell_range,evidence.quote_match_type,
    jsonb_array_length(f.evidence_block_hashes) evidence_count,
    not exists (
      select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
      left join public.phase9_source_block_coverage c
        on c.workspace_id=f.workspace_id
        and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
      where c.id is null or (
        c.page_number is null and (c.sheet_name is null or c.cell_range is null)
      )
    ) page_references_complete,
    exists (
      select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
      join public.phase9_source_block_coverage c
        on c.workspace_id=f.workspace_id
        and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
      where c.route='parser_uncertain'
    ) parser_uncertain,
    exists (
      select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
      join public.phase9_source_block_coverage c
        on c.workspace_id=f.workspace_id
        and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
      join public.phase9_coverage_exception_pages_v1 coverage_exception
        on coverage_exception.workspace_id=f.workspace_id
        and coverage_exception.evaluation_run_id=f.evaluation_run_id
        and coverage_exception.source_document_id=c.source_document_id
        and coverage_exception.page_number=c.page_number
      where coverage_exception.latest_decision_id is null
        or coverage_exception.human_decision='needs_follow_up'
    ) unresolved_coverage_exception,
    latest.id latest_decision_id,latest.decision human_decision,
    latest.created_at decision_created_at,
    case when
      f.source_support_status='supported'
      and f.precedence_status='active'
      and f.machine_only
      and evidence.source_document_id is not null
      and evidence.quote_match_type in ('exact','normalized_exact')
      and f.ambiguity_code is null
      and not exists (
        select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
        left join public.phase9_source_block_coverage c
          on c.workspace_id=f.workspace_id
          and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
        where c.id is null or (
          c.page_number is null and (c.sheet_name is null or c.cell_range is null)
        ) or c.route='parser_uncertain'
      )
      and not exists (
        select 1 from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
        join public.phase9_source_block_coverage c
          on c.workspace_id=f.workspace_id
          and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
        join public.phase9_coverage_exception_pages_v1 coverage_exception
          on coverage_exception.workspace_id=f.workspace_id
          and coverage_exception.evaluation_run_id=f.evaluation_run_id
          and coverage_exception.source_document_id=c.source_document_id
          and coverage_exception.page_number=c.page_number
        where coverage_exception.latest_decision_id is null
          or coverage_exception.human_decision='needs_follow_up'
      )
    then public.phase9_review_duplicate_signature_v1(
        s.obligation_text,
        public.phase9_review_category_v1(s.requirement_type,s.obligation_text,s.material_facts),
        evidence.source_document_id,f.precedence_status,s.material_facts,s.evidence_text
      )
    end duplicate_signature
  from public.phase9_findings f
  join public.phase9_candidate_seeds s
    on s.workspace_id=f.workspace_id and s.evaluation_run_id=f.evaluation_run_id
    and s.candidate_hash=f.candidate_hash
  left join lateral (
    select
      c.source_document_id,c.source_document_key,c.page_number,c.sheet_name,c.cell_range,
      case
        when length(trim(s.evidence_text))>0
          and c.page_number is not null
          and position(s.evidence_text in coalesce(page_text.text,''))>0 then 'exact'
        when length(trim(s.evidence_text))>0
          and c.page_number is not null
          and position(
            regexp_replace(trim(s.evidence_text),E'\s+',' ','g')
            in regexp_replace(trim(coalesce(page_text.text,'')),E'\s+',' ','g')
          )>0 then 'normalized_exact'
        else 'not_found'
      end quote_match_type
    from jsonb_array_elements_text(f.evidence_block_hashes) h(value)
    join public.phase9_source_block_coverage c
      on c.workspace_id=f.workspace_id and c.evaluation_run_id=f.evaluation_run_id
      and c.block_hash=h.value
    left join public.document_pages page_text
      on page_text.workspace_id=f.workspace_id
      and page_text.document_id=c.source_document_id
      and page_text.page_number=c.page_number
    order by
      case
        when length(trim(s.evidence_text))>0
          and c.page_number is not null
          and position(s.evidence_text in coalesce(page_text.text,''))>0 then 0
        when length(trim(s.evidence_text))>0
          and c.page_number is not null
          and position(
            regexp_replace(trim(s.evidence_text),E'\s+',' ','g')
            in regexp_replace(trim(coalesce(page_text.text,'')),E'\s+',' ','g')
          )>0 then 1
        else 2
      end,
      c.page_number nulls last,c.sheet_name,c.cell_range,c.block_hash
    limit 1
  ) evidence on true
  left join lateral (
    select d.id,d.decision,d.created_at
    from public.phase9_finding_review_decisions d
    where d.workspace_id=f.workspace_id and d.evaluation_run_id=f.evaluation_run_id
      and d.candidate_hash=f.candidate_hash
    order by d.created_at desc,d.id desc limit 1
  ) latest on true
), ranked as (
  select base.*,
    count(duplicate_signature) over(
      partition by evaluation_run_id,duplicate_signature
    ) duplicate_count,
    row_number() over(
      partition by evaluation_run_id,duplicate_signature
      order by page_number nulls last,candidate_hash
    ) duplicate_rank,
    first_value(candidate_hash) over(
      partition by evaluation_run_id,duplicate_signature
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
        'signature','initials','attestation','acknowledgment','addendum_acknowledgment',
        'insurance','bond','license','pre_bid_conference','site_visit',
        'delivery_method','electronic_submission','physical_submission','copy_count',
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
    when quote_match_type not in ('exact','normalized_exact') then 'quotation_not_validated'
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

-- One bounded queue request materializes the filtered population once, then
-- derives both the page and total from that authoritative snapshot.
create or replace function public.get_phase9_review_queue(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_lane text default 'all',
  p_search text default '',p_duplicate_signature text default null,
  p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql security definer set search_path='' stable as $$
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
  then raise exception 'invalid review queue request'; end if;

  with filtered as materialized (
    select queue.*
    from public.phase9_review_queue_v1 queue
    where queue.workspace_id=p_workspace_id
      and queue.evaluation_run_id=p_evaluation_run_id
      and (
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
  ), bounded as (
    select filtered.*,
      row_number() over(order by
        (latest_decision_id is not null),
        case review_lane when 'critical' then 0 when 'exception' then 1
          when 'duplicate' then 2 else 3 end,
        deadline_iso asc nulls last,
        (mandatory_class='mandatory') desc,
        coalesce((
          select document.ordinal from public.phase9_evaluation_documents document
          where document.workspace_id=filtered.workspace_id
            and document.evaluation_run_id=filtered.evaluation_run_id
            and document.document_id=filtered.source_document_id
        ),2147483647),
        page_number asc nulls last,candidate_hash
      ) _queue_order
    from filtered
    order by
      (latest_decision_id is not null),
      case review_lane when 'critical' then 0 when 'exception' then 1
        when 'duplicate' then 2 else 3 end,
      deadline_iso asc nulls last,
      (mandatory_class='mandatory') desc,
      coalesce((
        select document.ordinal from public.phase9_evaluation_documents document
        where document.workspace_id=filtered.workspace_id
          and document.evaluation_run_id=filtered.evaluation_run_id
          and document.document_id=filtered.source_document_id
      ),2147483647),
      page_number asc nulls last,candidate_hash
    limit p_page_size offset ((p_page-1)*p_page_size)
  )
  select
    coalesce(
      (select jsonb_agg(to_jsonb(bounded)-'_queue_order' order by _queue_order)
       from bounded),
      '[]'::jsonb
    ),
    (select count(*) from filtered)
  into v_rows,v_total;
  return jsonb_build_object(
    'version','phase9-review-priority-v1','page',p_page,
    'pageSize',p_page_size,'total',v_total,'rows',v_rows
  );
end $$;

-- The executive page consumes one aggregate RPC. Queue and coverage
-- populations are each scanned once, even for large real solicitations.
create or replace function public.get_phase9_review_dashboard_v1(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare
  v_actor uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if not exists (
    select 1 from public.phase9_evaluation_runs
    where id=p_evaluation_run_id and workspace_id=p_workspace_id
      and status='completed'
  ) then raise exception 'completed phase9 run required'; end if;

  with queue as materialized (
    select * from public.phase9_review_queue_v1
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
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
        where human_decision='accepted' and review_lane in ('critical','routine')
      ) publishable_accepted,
      count(*) filter(where human_decision='needs_follow_up') follow_up,
      count(*) filter(where batch_accept_eligible) batch_eligible,
      count(*) filter(
        where latest_decision_id is null and review_lane in ('critical','exception')
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
        where review_lane='critical' and category in (
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
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
  ), published as (
    select coalesce(max(published_count),0) published_requirements
    from public.phase9_bridge_runs
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
  )
  select jsonb_build_object(
    'version','phase9-review-priority-v1',
    'totalFindings',queue_stats.total_findings,
    'critical',queue_stats.critical,
    'exceptions',queue_stats.exceptions,
    'duplicates',queue_stats.duplicates,
    'routine',queue_stats.routine,
    'unresolvedCritical',queue_stats.unresolved_critical,
    'unresolvedExceptions',queue_stats.unresolved_exceptions,
    'unresolvedDuplicates',queue_stats.unresolved_duplicates,
    'unresolvedRoutine',queue_stats.unresolved_routine,
    'reviewed',queue_stats.reviewed,
    'publishableAccepted',queue_stats.publishable_accepted,
    'followUp',queue_stats.follow_up,
    'batchEligible',queue_stats.batch_eligible,
    'individualReviewRemaining',queue_stats.individual_review_remaining,
    'duplicateGroups',queue_stats.duplicate_groups,
    'unresolvedDuplicateGroups',queue_stats.unresolved_duplicate_groups,
    'submissionDeadlines',queue_stats.submission_deadlines,
    'questionDeadlines',queue_stats.question_deadlines,
    'requiredForms',queue_stats.required_forms,
    'signaturesAcknowledgments',queue_stats.signatures_acknowledgments,
    'insuranceBondLicensing',queue_stats.insurance_bond_licensing,
    'pricing',queue_stats.pricing,
    'coverageExceptions',coverage_stats.coverage_exceptions,
    'coverageReviewed',coverage_stats.coverage_reviewed,
    'coverageFollowUp',coverage_stats.coverage_follow_up,
    'unresolvedCoverageExceptions',
      coverage_stats.coverage_exceptions-coverage_stats.coverage_reviewed,
    'publishedRequirements',published.published_requirements,
    'bidderEvidenceRequired',queue_stats.bidder_evidence_required,
    'reviewCompletionPercentage',
      case
        when queue_stats.total_findings+coverage_stats.coverage_exceptions=0 then 0
        else round(
          (
            (queue_stats.reviewed+coverage_stats.coverage_reviewed)::numeric /
            (queue_stats.total_findings+coverage_stats.coverage_exceptions)::numeric
          )*100,
          1
        )
      end,
    'publicationEligible',
      queue_stats.total_findings>0
      and queue_stats.reviewed=queue_stats.total_findings
      and queue_stats.follow_up=0
      and coverage_stats.coverage_reviewed=coverage_stats.coverage_exceptions
      and coverage_stats.coverage_follow_up=0,
    'nextRecommendedAction',
      case
        when queue_stats.unresolved_critical>0 then 'review_critical'
        when queue_stats.unresolved_exceptions>0 then 'review_exceptions'
        when coverage_stats.coverage_reviewed<coverage_stats.coverage_exceptions
          then 'review_coverage_exceptions'
        when queue_stats.follow_up+coverage_stats.coverage_follow_up>0
          then 'resolve_follow_up'
        when queue_stats.unresolved_duplicates>0 then 'review_duplicates'
        when queue_stats.unresolved_routine>0 then 'accelerate_routine_review'
        when published.published_requirements=0 then 'publish_reviewed_requirements'
        else 'open_submission_checklist'
      end
  ) into v_result
  from queue_stats cross join coverage_stats cross join published;
  return coalesce(v_result,'{}'::jsonb);
end $$;

revoke all on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_dashboard_v1(uuid,uuid)
  to authenticated;

create or replace function public.get_phase9_review_activity_summary(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare v_actor uuid := (select auth.uid()); v_result jsonb;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  select jsonb_build_object(
    'version','phase9-review-analytics-v1',
    'elapsedSeconds',case when count(*)<2 then 0 else
      greatest(0,extract(epoch from max(event.created_at)-min(event.created_at))::integer)
      end,
    'individualDecisions',count(*) filter(
      where event.event_type='individual_decision_recorded'
    ),
    'batchOperations',count(*) filter(
      where event.event_type='batch_operation_completed'
    ),
    'batchDecisions',coalesce(sum(
      case when event.event_type='batch_operation_completed'
        then coalesce(batch.selection_count,0) else 0 end
    ),0),
    'sourceOpenings',count(*) filter(
      where event.event_type='source_page_opened'
    ),
    'decisionsPerMinute',case
      when count(*)<2 or max(event.created_at)=min(event.created_at) then 0
      else round((
        count(*) filter(where event.event_type='individual_decision_recorded')
        + coalesce(sum(
          case when event.event_type='batch_operation_completed'
            then coalesce(batch.selection_count,0) else 0 end
        ),0)
      )::numeric / greatest(
        extract(epoch from max(event.created_at)-min(event.created_at))/60,0.0167
      ),2)
    end,
    'remainingWork',(
      select count(*) from public.phase9_review_queue_v1 queue
      where queue.workspace_id=p_workspace_id
        and queue.evaluation_run_id=p_evaluation_run_id
        and (
          queue.latest_decision_id is null
          or queue.human_decision='needs_follow_up'
        )
    )+(
      select count(*) from public.phase9_coverage_exception_pages_v1 coverage
      where coverage.workspace_id=p_workspace_id
        and coverage.evaluation_run_id=p_evaluation_run_id
        and (
          coverage.latest_decision_id is null
          or coverage.human_decision='needs_follow_up'
        )
    )
  ) into v_result
  from public.phase9_review_activity_events event
  left join public.phase9_review_batch_operations batch
    on batch.id=event.batch_operation_id
    and batch.workspace_id=event.workspace_id
    and batch.evaluation_run_id=event.evaluation_run_id
  where event.workspace_id=p_workspace_id
    and event.evaluation_run_id=p_evaluation_run_id
    and event.review_session_id=p_review_session_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;

-- Serialize duplicate deliveries before the existing transactional function
-- checks its idempotency row. The underlying function still revalidates every
-- finding and writes one append-only decision per selected record.
create or replace function public.record_phase9_review_batch_v2(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hashes text[],
  p_action text,p_reason text,p_idempotency_key uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_idempotency_key is null then raise exception 'batch idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-batch-v2:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text||':'||p_idempotency_key::text,0
  ));
  return public.record_phase9_review_batch(
    p_workspace_id,p_evaluation_run_id,p_candidate_hashes,p_action,p_reason,
    p_idempotency_key,p_review_session_id
  );
end $$;

revoke all on function public.record_phase9_review_batch(
  uuid,uuid,text[],text,text,uuid,uuid
) from authenticated;
revoke all on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) to authenticated;

-- The broad helper is no longer directly callable. Observational events use
-- this narrow wrapper; publication events use the owner-only function below.
revoke all on function public.record_phase9_review_activity(
  uuid,uuid,text,uuid,uuid,text,uuid,integer,uuid,jsonb
) from authenticated;

create or replace function public.record_phase9_observational_activity_v1(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_event_type text,
  p_review_session_id uuid,p_idempotency_key uuid,
  p_candidate_hash text default null,p_source_document_id uuid default null,
  p_page_number integer default null,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_key_hash text;
  v_allowed boolean;
begin
  if p_event_type not in (
    'review_session_started','finding_opened','source_page_opened'
  ) then raise exception 'only observational review activity is permitted'; end if;
  if v_actor is null then raise exception 'signed-in reviewer required'; end if;
  if exists (
    select 1 from public.phase9_review_activity_events
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key
  ) then
    return public.record_phase9_review_activity(
      p_workspace_id,p_evaluation_run_id,p_event_type,p_review_session_id,
      p_idempotency_key,p_candidate_hash,p_source_document_id,p_page_number,
      null,p_metadata
    );
  end if;
  v_key_hash := encode(
    extensions.digest(
      convert_to(
        'phase8-rate-limits-v1:phase9_review_workflow:'||
        v_actor::text||':'||p_workspace_id::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  select allowed into v_allowed
  from public.consume_phase8_rate_limit(
    'phase9_review_workflow',v_key_hash,p_workspace_id,v_actor
  );
  if not coalesce(v_allowed,false) then
    raise exception 'review activity rate limit exceeded';
  end if;
  return public.record_phase9_review_activity(
    p_workspace_id,p_evaluation_run_id,p_event_type,p_review_session_id,
    p_idempotency_key,p_candidate_hash,p_source_document_id,p_page_number,
    null,p_metadata
  );
end $$;

revoke all on function public.record_phase9_observational_activity_v1(
  uuid,uuid,text,uuid,uuid,text,uuid,integer,jsonb
) from public,anon;
grant execute on function public.record_phase9_observational_activity_v1(
  uuid,uuid,text,uuid,uuid,text,uuid,integer,jsonb
) to authenticated;

create or replace function public.record_phase9_publication_activity_v1(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_event_type text,
  p_review_session_id uuid,p_idempotency_key uuid,p_bridge_run_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_id uuid;
  v_existing public.phase9_review_activity_events%rowtype;
  v_metadata jsonb;
begin
  select role into v_role from public.workspace_members
  where workspace_id=p_workspace_id and user_id=v_actor;
  if v_actor is null or v_role<>'owner' then
    raise exception 'workspace owner required for publication activity';
  end if;
  if p_event_type not in ('publication_attempted','publication_completed')
    or p_review_session_id is null or p_idempotency_key is null
  then raise exception 'invalid publication activity'; end if;
  if not exists (
    select 1 from public.phase9_evaluation_runs
    where id=p_evaluation_run_id and workspace_id=p_workspace_id
  ) then raise exception 'publication run is outside the workspace'; end if;
  if p_event_type='publication_attempted' and p_bridge_run_id is not null then
    raise exception 'publication attempt cannot name a result';
  end if;
  if p_event_type='publication_completed' and not exists (
    select 1 from public.phase9_bridge_runs
    where id=p_bridge_run_id and workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ) then raise exception 'publication result is not authoritative'; end if;
  v_metadata := case p_event_type
    when 'publication_attempted' then jsonb_build_object('publicationState','attempted')
    else jsonb_build_object(
      'publicationState','completed','result',p_bridge_run_id
    ) end;
  select * into v_existing from public.phase9_review_activity_events
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.evaluation_run_id<>p_evaluation_run_id
      or v_existing.actor_id<>v_actor
      or v_existing.review_session_id<>p_review_session_id
      or v_existing.event_type<>p_event_type
      or v_existing.metadata<>v_metadata
    then raise exception 'publication activity idempotency identity mismatch'; end if;
    return v_existing.id;
  end if;
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,p_idempotency_key,
    p_event_type,'phase9-review-analytics-v1',v_metadata
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.record_phase9_publication_activity_v1(
  uuid,uuid,text,uuid,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_publication_activity_v1(
  uuid,uuid,text,uuid,uuid,uuid
) to authenticated;

grant execute on function public.phase9_canonical_json_v1(jsonb)
  to authenticated,service_role;

-- Publish only the exact authoritative queue population and use the same
-- validated evidence occurrence selected by that queue. This replaces the
-- historical internal implementation without changing its public guarded
-- entry point or any immutable source records.
create or replace function public.publish_phase9_reviewed_findings_unguarded(
  p_workspace_id uuid,
  p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_run public.phase9_evaluation_runs%rowtype;
  v_primary_document_id uuid;
  v_analysis_run_id uuid := gen_random_uuid();
  v_verification_run_id uuid := gen_random_uuid();
  v_bridge_run_id uuid := gen_random_uuid();
  v_input_material text;
  v_input_hash text;
  v_invalid_candidate_hash text;
  v_count integer;
  v_inserted_count integer;
  v_candidate_id uuid;
  v_finding_id uuid;
  v_evidence_id uuid;
  v_bridge_item_id uuid;
  v_page_id uuid;
  v_page_text text;
  v_quote text;
  v_quote_normalized text;
  v_page_normalized text;
  v_match_type text;
  v_title text;
  v_category text;
  v_mandatory text;
  v_existing public.phase9_bridge_runs%rowtype;
  r record;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  select role into v_role from public.workspace_members
  where workspace_id=p_workspace_id and user_id=v_actor;
  if v_role<>'owner' then
    raise exception 'workspace owner required to publish requirements';
  end if;
  select * into v_run from public.phase9_evaluation_runs
  where id=p_evaluation_run_id and workspace_id=p_workspace_id;
  if not found or v_run.status<>'completed' then
    raise exception 'completed phase9 evaluation run required';
  end if;
  select document_id into v_primary_document_id
  from public.phase9_evaluation_documents
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
  order by ordinal limit 1;
  if v_primary_document_id is null then
    raise exception 'phase9 document binding missing';
  end if;

  with latest as (
    select distinct on (candidate_hash) id,candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    order by candidate_hash,created_at desc,id desc
  )
  select latest.candidate_hash into v_invalid_candidate_hash
  from latest
  join public.phase9_review_queue_v1 queue
    on queue.workspace_id=p_workspace_id
    and queue.evaluation_run_id=p_evaluation_run_id
    and queue.candidate_hash=latest.candidate_hash
    and queue.latest_decision_id=latest.id
  where latest.decision='accepted' and not (
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
  )
  order by latest.candidate_hash limit 1;
  if v_invalid_candidate_hash is not null then
    raise exception 'accepted phase9 finding is not publishable:%',
      v_invalid_candidate_hash;
  end if;

  with latest as (
    select distinct on (candidate_hash) id,candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    order by candidate_hash,created_at desc,id desc
  ), accepted as (
    select latest.id,latest.candidate_hash
    from latest
    join public.phase9_review_queue_v1 queue
      on queue.workspace_id=p_workspace_id
      and queue.evaluation_run_id=p_evaluation_run_id
      and queue.candidate_hash=latest.candidate_hash
      and queue.latest_decision_id=latest.id
    where latest.decision='accepted'
      and queue.review_lane in ('critical','routine')
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
  )
  select count(*),
    string_agg(id::text||':'||candidate_hash,',' order by candidate_hash)
  into v_count,v_input_material from accepted;
  if v_count=0 then
    raise exception 'no accepted publishable phase9 findings';
  end if;

  v_input_hash := encode(
    extensions.digest(
      convert_to(
        'phase9-reviewed-bridge-v1:'||p_evaluation_run_id::text||':'||
        v_input_material,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  select * into v_existing from public.phase9_bridge_runs
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    and input_hash=v_input_hash and bridge_version='phase9-reviewed-bridge-v1';
  if found then
    select count(*) into v_inserted_count from public.phase9_bridge_items
    where workspace_id=p_workspace_id and bridge_run_id=v_existing.id;
    if v_inserted_count<>v_existing.published_count
      or v_inserted_count<>v_count then
      raise exception 'published phase9 bridge count mismatch';
    end if;
    return jsonb_build_object(
      'bridgeRunId',v_existing.id,'analysisRunId',v_existing.analysis_run_id,
      'verificationRunId',v_existing.verification_run_id,
      'publishedCount',v_existing.published_count,'reused',true
    );
  end if;

  insert into public.analysis_runs(
    id,workspace_id,document_id,status,stage,created_by,provider_name,extract_model,
    prompt_version,schema_version,candidate_count,input_hash,completed_at
  ) values (
    v_analysis_run_id,p_workspace_id,v_primary_document_id,'completed','complete',v_actor,
    'phase9-reviewed-bridge','phase9-tiered-live-analysis','phase9-reviewed-bridge-v1',
    'candidate-v1',v_count,v_input_hash,now()
  );
  insert into public.verification_runs(
    id,workspace_id,analysis_run_id,status,version,input_hash,prompt_version,schema_version,
    retrieval_version,normalization_version,provider,model,reasoning_effort,candidate_count,
    finding_count,created_by,completed_at,compatibility_fingerprint
  ) values (
    v_verification_run_id,p_workspace_id,v_analysis_run_id,'completed',1,v_input_hash,
    'phase9-reviewed-bridge-v1','verification-final-assessment-v1',
    'phase9-persisted-evidence-v1','evidence-nfkc-v1','phase9-reviewed-bridge',
    'phase9-tiered-live-analysis','low',v_count,v_count,v_actor,now(),
    v_run.compatibility_fingerprint
  );
  insert into public.phase9_bridge_runs(
    id,workspace_id,evaluation_run_id,analysis_run_id,verification_run_id,input_hash,
    source_count,published_count,bridge_version,source_compatibility_fingerprint,created_by
  ) values (
    v_bridge_run_id,p_workspace_id,p_evaluation_run_id,v_analysis_run_id,
    v_verification_run_id,v_input_hash,v_count,v_count,'phase9-reviewed-bridge-v1',
    v_run.compatibility_fingerprint,v_actor
  );

  for r in
    with latest as (
      select distinct on (candidate_hash) *
      from public.phase9_finding_review_decisions
      where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      order by candidate_hash,created_at desc,id desc
    )
    select
      latest.id review_id,latest.note,latest.corrections,
      queue.candidate_hash,queue.source_support_status,queue.precedence_status,
      queue.proof_requirement,queue.requirement_type,queue.obligation_text,
      queue.evidence_text,queue.material_facts,queue.source_document_id,
      queue.page_number,queue.category,queue.mandatory_class
    from latest
    join public.phase9_review_queue_v1 queue
      on queue.workspace_id=p_workspace_id
      and queue.evaluation_run_id=p_evaluation_run_id
      and queue.candidate_hash=latest.candidate_hash
      and queue.latest_decision_id=latest.id
    where latest.decision='accepted'
      and queue.review_lane in ('critical','routine')
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
    order by queue.candidate_hash
  loop
    v_page_id := null;
    v_page_text := null;
    select id,text into v_page_id,v_page_text from public.document_pages
    where workspace_id=p_workspace_id and document_id=r.source_document_id
      and page_number=r.page_number
    order by created_at desc limit 1;
    if v_page_id is null then
      raise exception 'published phase9 evidence page missing:%',r.candidate_hash;
    end if;
    v_quote := r.evidence_text;
    v_quote_normalized := regexp_replace(trim(v_quote),E'\\s+',' ','g');
    v_page_normalized := regexp_replace(trim(v_page_text),E'\\s+',' ','g');
    if length(trim(v_quote))=0 then
      raise exception 'published phase9 evidence quote empty:%',r.candidate_hash;
    elsif position(v_quote in v_page_text)>0 then
      v_match_type := 'exact';
    elsif position(v_quote_normalized in v_page_normalized)>0 then
      v_match_type := 'normalized_exact';
    else
      raise exception 'published phase9 evidence quote not found:%',r.candidate_hash;
    end if;

    v_title := coalesce(
      nullif(trim(r.corrections->>'title'),''),
      left(regexp_replace(trim(r.obligation_text),E'\\s+',' ','g'),500)
    );
    v_category := coalesce(
      nullif(r.corrections->>'category',''),r.category
    );
    v_mandatory := coalesce(
      nullif(r.corrections->>'mandatoryClass',''),r.mandatory_class
    );
    v_candidate_id := gen_random_uuid();
    v_finding_id := gen_random_uuid();
    v_evidence_id := gen_random_uuid();
    v_bridge_item_id := gen_random_uuid();

    insert into public.requirement_candidates(
      id,workspace_id,analysis_run_id,document_id,category,title,obligation,
      mandatory_class,preliminary_page,evidence_quote,confidence,ambiguity_notes,status,
      prompt_version,schema_version,model_id
    ) values (
      v_candidate_id,p_workspace_id,v_analysis_run_id,r.source_document_id,v_category,
      v_title,r.obligation_text,v_mandatory,r.page_number,v_quote,1,'[]'::jsonb,'unverified',
      'phase9-reviewed-bridge-v1','candidate-v1','phase9-tiered-live-analysis'
    );
    insert into public.verification_findings(
      id,workspace_id,analysis_run_id,verification_run_id,candidate_id,finding_version,
      source_support_status,precedence_status,proof_requirement,machine_status,rationale,
      material_mismatches,deterministic_facts,parser_concerns,ambiguity_notes,prompt_version,
      schema_version,model_id,decision_engine_version,challenge_status
    ) values (
      v_finding_id,p_workspace_id,v_analysis_run_id,v_verification_run_id,v_candidate_id,1,
      r.source_support_status,r.precedence_status,r.proof_requirement,
      'machine_assessment_only',
      'Published after human acceptance of source-grounded Phase 9 finding '||
        r.candidate_hash||'.',
      '[]'::jsonb,jsonb_build_array(r.material_facts),'[]'::jsonb,'[]'::jsonb,
      'phase9-reviewed-bridge-v1','verification-final-assessment-v1',
      'phase9-tiered-live-analysis','phase9-deterministic-verification-v1','completed'
    );
    insert into public.verification_evidence(
      id,workspace_id,finding_id,document_id,document_page_id,page_number,evidence_role,
      quote_exact,quote_normalized,normalization_version,match_type,model_proposed,validated
    ) values (
      v_evidence_id,p_workspace_id,v_finding_id,r.source_document_id,v_page_id,r.page_number,
      'supporting',v_quote,v_quote_normalized,'evidence-nfkc-v1',v_match_type,true,true
    );
    insert into public.human_review_decisions(
      workspace_id,finding_id,reviewer_id,decision,note,corrected_values
    ) values (
      p_workspace_id,v_finding_id,v_actor,'accepted',
      left('Phase 9 review accepted. '||coalesce(r.note,''),4000),r.corrections
    );
    insert into public.phase9_bridge_items(
      id,workspace_id,bridge_run_id,evaluation_run_id,candidate_hash,review_decision_id,
      requirement_candidate_id,verification_finding_id,verification_evidence_id
    ) values (
      v_bridge_item_id,p_workspace_id,v_bridge_run_id,p_evaluation_run_id,r.candidate_hash,
      r.review_id,v_candidate_id,v_finding_id,v_evidence_id
    );
  end loop;

  select count(*) into v_inserted_count from public.phase9_bridge_items
  where workspace_id=p_workspace_id and bridge_run_id=v_bridge_run_id;
  if v_inserted_count<>v_count then
    raise exception 'published phase9 bridge count mismatch';
  end if;
  insert into public.audit_events(
    workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
  ) values (
    p_workspace_id,'user',v_actor,'verification_completed','phase9_bridge_run',
    v_bridge_run_id,jsonb_build_object(
      'evaluation_run_id',p_evaluation_run_id,'analysis_run_id',v_analysis_run_id,
      'verification_run_id',v_verification_run_id,'published_count',v_count,
      'input_hash',v_input_hash,'bridge_version','phase9-reviewed-bridge-v1'
    )
  );
  return jsonb_build_object(
    'bridgeRunId',v_bridge_run_id,'analysisRunId',v_analysis_run_id,
    'verificationRunId',v_verification_run_id,
    'publishedCount',v_count,'reused',false
  );
end $$;

revoke all on function public.publish_phase9_reviewed_findings_unguarded(uuid,uuid)
  from public,anon,authenticated;
