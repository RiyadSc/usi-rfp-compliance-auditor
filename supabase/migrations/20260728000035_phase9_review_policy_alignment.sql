-- Align the production queue with the provider-free review policy after
-- end-to-end code review. This migration is additive to history: existing
-- machine findings, evidence, decisions, and provider artifacts are untouched.

-- Review decisions are frequent, provider-free workflow mutations. They use a
-- dedicated bounded policy instead of the three-call provider-verification
-- bucket, which would make a real review queue unusable.
create or replace function public.consume_phase8_rate_limit(
  p_operation text,
  p_key_hash text,
  p_workspace_id uuid default null,
  p_actor_id uuid default null
) returns table(
  allowed boolean,limit_value integer,remaining integer,retry_after_seconds integer
) language plpgsql security definer set search_path='' as $$
declare
  v_limit integer;
  v_window integer;
  v_start timestamptz;
  v_count integer;
begin
  select x.limit_value,x.window_seconds into v_limit,v_window
  from (values
    ('sign_in',60,300),('upload_initialize',12,300),('upload_finalize',12,300),
    ('parse_request',8,300),('extraction_request',4,600),('verification_request',3,600),
    ('phase9_review_workflow',600,300),
    ('checklist_generation',12,300),('checklist_workflow',60,300),('proposal_audit',8,600),
    ('proposal_resolution',30,300),('report_generation',8,300),('export_generation',12,300),
    ('signed_download',20,300),('demo_reset',3,900)
  ) as x(operation,limit_value,window_seconds) where x.operation=p_operation;
  if v_limit is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate-limit request';
  end if;
  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp())/v_window)*v_window
  );
  insert into public.operation_rate_limit_buckets(
    operation,key_hash,workspace_id,window_started_at,window_seconds,
    request_count,policy_version
  ) values (
    p_operation,p_key_hash,p_workspace_id,v_start,v_window,1,'phase8-rate-limits-v1'
  )
  on conflict(operation,key_hash,window_started_at) do update
    set request_count=public.operation_rate_limit_buckets.request_count+1,
      last_request_at=now()
    where public.operation_rate_limit_buckets.request_count<v_limit
  returning request_count into v_count;
  if v_count is null then
    select request_count into v_count
    from public.operation_rate_limit_buckets
    where operation=p_operation and key_hash=p_key_hash
      and window_started_at=v_start;
    if p_workspace_id is not null then
      insert into public.audit_events(
        workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
      ) values (
        p_workspace_id,'system',p_actor_id,'security_rate_limited',
        'workspace',p_workspace_id,
        jsonb_build_object(
          'operation',p_operation,'policy_version','phase8-rate-limits-v1'
        )
      );
    end if;
    return query select
      false,v_limit,0,greatest(
        1,ceil(extract(epoch from (
          v_start+make_interval(secs=>v_window)-clock_timestamp()
        )))::integer
      );
  else
    return query select true,v_limit,greatest(0,v_limit-v_count),v_window;
  end if;
end $$;

create or replace function public.phase9_review_category_v1(
  p_requirement_type text,p_obligation_text text,p_material_facts jsonb
) returns text language sql immutable set search_path='' as $$
  select case
    when lower(p_requirement_type)='deadline'
      and lower(p_obligation_text) ~ '(question|inquir)' then 'question_deadline'
    when lower(p_requirement_type)='deadline'
      or lower(p_obligation_text) ~ '(proposal|bid|response|submission).*(due|deadline)'
      then 'submission_deadline'
    when lower(p_requirement_type)='form'
      or nullif(p_material_facts->>'formReference','') is not null
      or lower(p_obligation_text) ~ '\mform\s+[a-z0-9-]+'
      then case when lower(p_obligation_text) ~ '(price|pricing|cost)'
        then 'pricing_form' else 'mandatory_form' end
    when lower(p_requirement_type)='signature'
      or lower(p_obligation_text) ~ '\m(sign|signature|signed)\M' then 'signature'
    when lower(p_obligation_text) ~ '\minitial(s|ed)?\M' then 'initials'
    when lower(p_obligation_text) ~ '(addendum|amendment).*(acknowledg|confirm)'
      then 'addendum_acknowledgment'
    when lower(p_obligation_text) ~ '\macknowledg(e|ment)\M' then 'acknowledgment'
    when lower(p_obligation_text) ~ '\mattest(ation)?\M' then 'attestation'
    when lower(p_requirement_type)='insurance'
      or lower(p_obligation_text) ~ '\minsurance\M' then 'insurance'
    when lower(p_requirement_type)='license'
      or lower(p_obligation_text) ~ '\m(license|licence|permit)\M' then 'license'
    when lower(p_requirement_type)='meeting'
      or lower(p_obligation_text) ~ '(pre[- ]?bid|site visit|conference|meeting)'
      then case
        when lower(p_obligation_text) ~ 'site visit' then 'site_visit'
        when lower(p_obligation_text) ~ '(pre[- ]?bid|conference)' then 'pre_bid_conference'
        else 'meeting' end
    -- Pricing remains submission-critical even when the source calls the
    -- pricing schedule an attachment.
    when lower(p_requirement_type)='pricing'
      or lower(p_obligation_text) ~ '(price|pricing|cost sheet)' then 'pricing_form'
    when lower(p_requirement_type)='attachment'
      or lower(p_obligation_text) ~ '\mattachment\M' then 'attachment'
    when lower(p_obligation_text) ~ '\mbond\M' then 'bond'
    when lower(p_obligation_text) ~ '\m(certification|certificate)\M' then 'certification'
    when lower(p_obligation_text) ~ '\m(subcontractor).*(disclos|list|identify)'
      then 'subcontractor_disclosure'
    when lower(p_obligation_text) ~ '(electronic|portal|email)'
      and lower(p_obligation_text) ~ '\m(submit|deliver|upload)\M'
      then 'electronic_submission'
    when lower(p_obligation_text) ~ '(sealed|hard cop(y|ies)|physical)'
      and lower(p_obligation_text) ~ '\m(submit|deliver|package)\M'
      then 'physical_submission'
    when lower(p_obligation_text) ~ '\m(copy|copies)\M' then 'copy_count'
    when lower(p_obligation_text) ~ '(file name|naming convention)' then 'naming_requirement'
    when lower(p_obligation_text) ~ '(file format|\.pdf|\.xlsx)' then 'file_format'
    when lower(p_obligation_text) ~ '(delivery method|deliver by|submit by)' then 'delivery_method'
    when lower(p_obligation_text) ~ '(package|packaging|seal)' then 'packaging_requirement'
    else 'other_material_requirement'
  end
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
    case when lower(s.obligation_text) ~ '\m(must|shall|required|mandatory)\M'
      then 'mandatory' else 'uncertain' end mandatory_class,
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
        when c.page_number is not null
          and position(s.evidence_text in coalesce(page_text.text,''))>0 then 'exact'
        when c.page_number is not null
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
        when c.page_number is not null
          and position(s.evidence_text in coalesce(page_text.text,''))>0 then 0
        when c.page_number is not null
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
          '(deadline|due date|mandatory form|required form|pricing|signature|signed|initial|attest|acknowledg|insurance|bond|license|permit|certif|pre[- ]?bid|site visit|delivery method|electronic submission|physical submission|hard copy|copies|file format|file name|package|sealed|mandatory attachment|subcontractor disclosure|shall be rejected|will be rejected|disqualif)'
        )
      ) then 'critical'
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
    or p_page<1 or p_page_size not between 1 and 50
    or char_length(coalesce(p_search,''))>160
    or (
      p_duplicate_signature is not null
      and p_duplicate_signature !~ '^[0-9a-f]{64}$'
    )
  then raise exception 'invalid review queue request'; end if;

  with filtered as (
    select q.*
    from public.phase9_review_queue_v1 q
    where q.workspace_id=p_workspace_id
      and q.evaluation_run_id=p_evaluation_run_id
      and (
        p_lane='all'
        or (p_lane='reviewed' and q.latest_decision_id is not null)
        or (p_lane in ('critical','exception','duplicate','routine')
          and q.review_lane=p_lane)
      )
      and (
        p_duplicate_signature is null
        or q.duplicate_signature=p_duplicate_signature
      )
      and (
        trim(coalesce(p_search,''))=''
        or q.obligation_text ilike '%'||v_search||'%' escape '\'
        or coalesce(q.form_reference,'') ilike
          '%'||v_search||'%' escape '\'
        or q.category ilike '%'||v_search||'%' escape '\'
      )
  ), bounded as (
    select * from filtered
    order by
      (latest_decision_id is not null),
      case review_lane when 'critical' then 0 when 'exception' then 1
        when 'duplicate' then 2 else 3 end,
      deadline_iso asc nulls last,
      (mandatory_class='mandatory') desc,
      coalesce((
        select d.ordinal from public.phase9_evaluation_documents d
        where d.workspace_id=filtered.workspace_id
          and d.evaluation_run_id=filtered.evaluation_run_id
          and d.document_id=filtered.source_document_id
      ),2147483647),
      page_number asc nulls last,
      candidate_hash
    limit p_page_size offset ((p_page-1)*p_page_size)
  )
  select coalesce(jsonb_agg(to_jsonb(bounded)),'[]'::jsonb)
    into v_rows from bounded;
  select count(*) into v_total from public.phase9_review_queue_v1 q
  where q.workspace_id=p_workspace_id
    and q.evaluation_run_id=p_evaluation_run_id
    and (
      p_lane='all'
      or (p_lane='reviewed' and q.latest_decision_id is not null)
      or (p_lane in ('critical','exception','duplicate','routine') and q.review_lane=p_lane)
    )
    and (
      p_duplicate_signature is null
      or q.duplicate_signature=p_duplicate_signature
    )
    and (
      trim(coalesce(p_search,''))=''
      or q.obligation_text ilike '%'||v_search||'%' escape '\'
      or coalesce(q.form_reference,'') ilike
        '%'||v_search||'%' escape '\'
      or q.category ilike '%'||v_search||'%' escape '\'
    );
  return jsonb_build_object(
    'version','phase9-review-priority-v1','page',p_page,'pageSize',p_page_size,
    'total',v_total,'rows',v_rows
  );
end $$;

create or replace function public.get_phase9_review_coverage_summary(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare v_actor uuid := (select auth.uid()); v_result jsonb;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  select jsonb_build_object(
    'version','phase9-review-priority-v1',
    'coverageExceptions',count(*),
    'coverageReviewed',count(*) filter(where latest_decision_id is not null),
    'coverageFollowUp',count(*) filter(where human_decision='needs_follow_up'),
    'unresolvedDuplicateGroups',(
      select count(distinct duplicate_signature)
      from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='duplicate'
        and q.latest_decision_id is null
    ),
    'submissionDeadlines',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical' and q.category='submission_deadline'
    ),
    'questionDeadlines',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical' and q.category='question_deadline'
    ),
    'requiredForms',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical'
        and q.category in ('mandatory_form','pricing_form')
    ),
    'signaturesAcknowledgments',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical'
        and q.category in (
          'signature','initials','attestation','acknowledgment',
          'addendum_acknowledgment'
        )
    ),
    'insuranceBondLicensing',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical'
        and q.category in ('insurance','bond','license','certification')
    ),
    'pricing',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.review_lane='critical' and q.category='pricing_form'
    )
  ) into v_result
  from public.phase9_coverage_exception_pages_v1
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;
  return v_result;
end $$;

create or replace function public.get_phase9_review_effort_observations(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare v_actor uuid := (select auth.uid()); v_result jsonb;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  with ordered as (
    select
      e.*,
      lag(e.created_at) over(
        partition by e.actor_id,e.review_session_id order by e.created_at,e.id
      ) previous_at
    from public.phase9_review_activity_events e
    where e.workspace_id=p_workspace_id
      and e.evaluation_run_id=p_evaluation_run_id
  ), decisions as (
    select
      ordered.event_type,
      extract(epoch from ordered.created_at-ordered.previous_at) elapsed_seconds,
      coalesce(batch.selection_count,0) batch_selection_count
    from ordered
    left join public.phase9_review_batch_operations batch
      on batch.id=ordered.batch_operation_id
      and batch.workspace_id=ordered.workspace_id
      and batch.evaluation_run_id=ordered.evaluation_run_id
    where ordered.event_type in (
      'individual_decision_recorded','batch_operation_completed'
    )
      and ordered.previous_at is not null
      and extract(epoch from ordered.created_at-ordered.previous_at) between 2 and 600
  )
  select jsonb_build_object(
    'version','phase9-review-effort-v1',
    'observedSecondsPerIndividualDecision',round(avg(elapsed_seconds) filter(
      where event_type='individual_decision_recorded'
    )::numeric,2),
    'observedSecondsPerBatchItem',round(avg(
      elapsed_seconds/nullif(batch_selection_count,0)
    ) filter(where event_type='batch_operation_completed')::numeric,2),
    'observedIndividualDecisionCount',count(*) filter(
      where event_type='individual_decision_recorded'
    ),
    'observedBatchOperationCount',count(*) filter(
      where event_type='batch_operation_completed'
    )
  ) into v_result from decisions;
  return coalesce(v_result,'{}'::jsonb);
end $$;

create or replace function public.phase9_default_review_batch_reason()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.action='accept_routine' and trim(coalesce(new.reason,''))='' then
    new.reason :=
      'Selected findings were in the routine lane and passed the server-owned batch policy.';
  end if;
  return new;
end $$;

create trigger phase9_review_batch_reason
  before insert on public.phase9_review_batch_operations
  for each row execute function public.phase9_default_review_batch_reason();

-- Public activity recording accepts only observational events. Decision,
-- coverage, and batch events are written by their authoritative transactional
-- functions, so a client cannot inflate workflow analytics.
create or replace function public.record_phase9_review_activity(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_event_type text,
  p_review_session_id uuid,p_idempotency_key uuid,
  p_candidate_hash text default null,p_source_document_id uuid default null,
  p_page_number integer default null,p_batch_operation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_existing public.phase9_review_activity_events%rowtype;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if p_event_type not in (
    'review_session_started','finding_opened','source_page_opened',
    'publication_attempted','publication_completed'
  ) then raise exception 'authoritative review activity requires its workflow action'; end if;
  if p_review_session_id is null or p_idempotency_key is null then
    raise exception 'review activity identity is required';
  end if;
  if p_batch_operation_id is not null then
    raise exception 'observational review activity cannot attach a batch'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object'
    or pg_column_size(coalesce(p_metadata,'{}'::jsonb))>2048
    or exists (
      select 1 from jsonb_each(coalesce(p_metadata,'{}'::jsonb)) entry
      where entry.key not in (
        'lane','result','source','remainingWork','publicationState','route'
      )
      or jsonb_typeof(entry.value) not in ('string','number','boolean','null')
      or (
        jsonb_typeof(entry.value)='string'
        and char_length(entry.value#>>'{}')>120
      )
    )
  then raise exception 'review activity metadata is not permitted'; end if;
  if p_candidate_hash is not null and not exists (
    select 1 from public.phase9_findings
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and candidate_hash=p_candidate_hash
  ) then raise exception 'review activity finding is outside the workspace run'; end if;
  if p_source_document_id is not null and not exists (
    select 1 from public.phase9_evaluation_documents
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and document_id=p_source_document_id
      and (p_page_number is null or p_page_number between 1 and page_count)
  ) then raise exception 'review activity source is outside the workspace run'; end if;
  select * into v_existing from public.phase9_review_activity_events
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.evaluation_run_id<>p_evaluation_run_id
      or v_existing.actor_id<>v_actor
      or v_existing.review_session_id<>p_review_session_id
      or v_existing.event_type<>p_event_type
      or v_existing.candidate_hash is distinct from p_candidate_hash
      or v_existing.source_document_id is distinct from p_source_document_id
      or v_existing.page_number is distinct from p_page_number
      or v_existing.batch_operation_id is not null
      or v_existing.metadata<>coalesce(p_metadata,'{}'::jsonb)
    then raise exception 'review activity idempotency identity mismatch'; end if;
    return v_existing.id;
  end if;
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,candidate_hash,
    source_document_id,page_number,batch_operation_id,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,p_idempotency_key,
    p_event_type,p_candidate_hash,
    p_source_document_id,p_page_number,null,
    'phase9-review-analytics-v1',coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;

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
      greatest(0,extract(epoch from max(e.created_at)-min(e.created_at))::integer) end,
    'individualDecisions',count(*) filter(
      where e.event_type='individual_decision_recorded'
    ),
    'batchOperations',count(*) filter(
      where e.event_type='batch_operation_completed'
    ),
    'batchDecisions',coalesce(sum(
      case when e.event_type='batch_operation_completed'
        then coalesce(batch.selection_count,0) else 0 end
    ),0),
    'sourceOpenings',count(*) filter(where e.event_type='source_page_opened'),
    'decisionsPerMinute',case
      when count(*)<2 or max(e.created_at)=min(e.created_at) then 0
      else round((
        count(*) filter(where e.event_type='individual_decision_recorded')
        + coalesce(sum(
          case when e.event_type='batch_operation_completed'
            then coalesce(batch.selection_count,0) else 0 end
        ),0)
      )::numeric / greatest(
        extract(epoch from max(e.created_at)-min(e.created_at))/60,0.0167
      ),2)
    end,
    'remainingWork',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.latest_decision_id is null
    )
  ) into v_result
  from public.phase9_review_activity_events e
  left join public.phase9_review_batch_operations batch
    on batch.id=e.batch_operation_id
    and batch.workspace_id=e.workspace_id
    and batch.evaluation_run_id=e.evaluation_run_id
  where e.workspace_id=p_workspace_id
    and e.evaluation_run_id=p_evaluation_run_id
    and e.review_session_id=p_review_session_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;

revoke all on function public.get_phase9_review_coverage_summary(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_coverage_summary(uuid,uuid)
  to authenticated;
revoke all on function public.get_phase9_review_effort_observations(uuid,uuid)
  from public,anon;
grant execute on function public.get_phase9_review_effort_observations(uuid,uuid)
  to authenticated;

revoke all on function public.phase9_review_category_v1(text,text,jsonb)
  from public,anon;
grant execute on function public.phase9_review_category_v1(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.phase9_review_duplicate_signature_v1(
  text,text,uuid,text,jsonb,text
) to authenticated,service_role;
