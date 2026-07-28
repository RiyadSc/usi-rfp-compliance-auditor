-- Phase 9 review acceleration: deterministic lanes, conservative duplicate
-- grouping, atomic human batch decisions, privacy-safe review activity, and
-- versioned tour completion. Additive only; immutable machine records remain
-- unchanged and the existing publication guard remains authoritative.

create table public.phase9_review_batch_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'accept_routine','reject_duplicate','mark_follow_up'
  )),
  selection_count integer not null check (selection_count > 0 and selection_count <= 500),
  selection_hash text not null check (selection_hash ~ '^[0-9a-f]{64}$'),
  reason text not null default '' check (char_length(reason) <= 1000),
  idempotency_key uuid not null,
  priority_version text not null check (priority_version='phase9-review-priority-v1'),
  policy_version text not null check (policy_version='phase9-batch-review-policy-v1'),
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  unique(workspace_id,evaluation_run_id,idempotency_key),
  unique(id,workspace_id)
);
create index phase9_review_batches_scope_idx on public.phase9_review_batch_operations(
  workspace_id,evaluation_run_id,created_at desc
);

alter table public.phase9_finding_review_decisions
  add column batch_operation_id uuid,
  add column batch_policy_version text;
alter table public.phase9_finding_review_decisions
  add constraint phase9_finding_review_batch_fk
    foreign key(batch_operation_id,workspace_id)
    references public.phase9_review_batch_operations(id,workspace_id) on delete restrict,
  add constraint phase9_finding_review_batch_version_check check (
    (batch_operation_id is null and batch_policy_version is null)
    or
    (batch_operation_id is not null and batch_policy_version='phase9-batch-review-policy-v1')
  );
create index phase9_finding_review_batch_idx
  on public.phase9_finding_review_decisions(workspace_id,batch_operation_id)
  where batch_operation_id is not null;

alter table public.phase9_findings
  add constraint phase9_findings_workspace_candidate_unique
  unique(evaluation_run_id,candidate_hash,workspace_id);

create table public.phase9_review_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  review_session_id uuid not null,
  idempotency_key uuid not null,
  event_type text not null check (event_type in (
    'review_session_started','finding_opened','source_page_opened',
    'individual_decision_recorded','batch_operation_completed',
    'coverage_exception_reviewed','publication_attempted','publication_completed'
  )),
  candidate_hash text check (candidate_hash is null or candidate_hash ~ '^[0-9a-f]{64}$'),
  source_document_id uuid,
  page_number integer check (page_number is null or page_number > 0),
  batch_operation_id uuid,
  policy_version text not null check (policy_version='phase9-review-analytics-v1'),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and pg_column_size(metadata) <= 2048
  ),
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(evaluation_run_id,candidate_hash,workspace_id)
    references public.phase9_findings(evaluation_run_id,candidate_hash,workspace_id)
    on delete restrict,
  foreign key(source_document_id,workspace_id)
    references public.documents(id,workspace_id) on delete restrict,
  foreign key(batch_operation_id,workspace_id)
    references public.phase9_review_batch_operations(id,workspace_id) on delete restrict,
  unique(workspace_id,idempotency_key),
  check (
    (event_type not in ('finding_opened','individual_decision_recorded')
      or candidate_hash is not null)
    and
    (event_type<>'source_page_opened'
      or (source_document_id is not null and page_number is not null))
    and
    (event_type<>'batch_operation_completed' or batch_operation_id is not null)
  )
);
create index phase9_review_activity_scope_idx on public.phase9_review_activity_events(
  workspace_id,evaluation_run_id,created_at
);

create table public.guided_tour_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tour_id text not null check (tour_id ~ '^[a-z0-9-]+$'),
  tour_version text not null check (tour_version='guided-product-tour-v1'),
  status text not null check (status in ('started','completed','dismissed')),
  last_completed_step integer not null default 0 check (last_completed_step >= 0),
  completed_at timestamptz,
  dismissed_at timestamptz,
  restarted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,workspace_id,tour_id,tour_version),
  unique(id,workspace_id)
);

create trigger phase9_review_batch_operations_immutable
  before update or delete on public.phase9_review_batch_operations
  for each row execute function public.reject_phase9_immutable_mutation();
create trigger phase9_review_activity_events_immutable
  before update or delete on public.phase9_review_activity_events
  for each row execute function public.reject_phase9_immutable_mutation();

alter table public.phase9_review_batch_operations enable row level security;
alter table public.phase9_review_activity_events enable row level security;
alter table public.guided_tour_states enable row level security;

create policy phase9_review_batch_operations_select
  on public.phase9_review_batch_operations for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy phase9_review_activity_events_select
  on public.phase9_review_activity_events for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy guided_tour_states_select
  on public.guided_tour_states for select to authenticated
  using (
    user_id=(select auth.uid())
    and (select public.is_workspace_member(workspace_id))
  );

grant select on public.phase9_review_batch_operations,
  public.phase9_review_activity_events,public.guided_tour_states to authenticated;

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
    when lower(p_requirement_type)='attachment'
      or lower(p_obligation_text) ~ '\mattachment\M' then 'attachment'
    when lower(p_requirement_type)='pricing'
      or lower(p_obligation_text) ~ '(pricing|cost sheet)' then 'pricing_form'
    when lower(p_obligation_text) ~ '\mbond\M' then 'bond'
    when lower(p_obligation_text) ~ '\m(certification|certificate)\M' then 'certification'
    when lower(p_obligation_text) ~ '\m(subcontractor).*(disclos|list|identify)' then 'subcontractor_disclosure'
    when lower(p_obligation_text) ~ '(electronic|portal|email).*(submit|deliver)' then 'electronic_submission'
    when lower(p_obligation_text) ~ '(sealed|hard cop(y|ies)|physical).*(submit|deliver|package)' then 'physical_submission'
    when lower(p_obligation_text) ~ '\m(copy|copies)\M' then 'copy_count'
    when lower(p_obligation_text) ~ '(file name|naming convention)' then 'naming_requirement'
    when lower(p_obligation_text) ~ '(file format|\.pdf|\.xlsx)' then 'file_format'
    when lower(p_obligation_text) ~ '(delivery method|deliver by|submit by)' then 'delivery_method'
    when lower(p_obligation_text) ~ '(package|packaging|seal)' then 'packaging_requirement'
    else 'other_material_requirement'
  end
$$;

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
        p_precedence_status || '|' || coalesce(p_material_facts,'{}'::jsonb)::text || '|' ||
        lower(regexp_replace(trim(p_evidence_text),E'\s+',' ','g')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

-- Serialize all individual and batch decisions for the same immutable finding.
-- The append-only prior pointer must name the current head under the lock.
create or replace function public.enforce_phase9_review_decision_chain()
returns trigger language plpgsql set search_path='' as $$
declare v_latest uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    new.evaluation_run_id::text||':'||new.candidate_hash,0
  ));
  select id into v_latest from public.phase9_finding_review_decisions
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.evaluation_run_id
    and candidate_hash=new.candidate_hash
  order by created_at desc,id desc limit 1;
  if v_latest is distinct from new.prior_decision_id then
    raise exception 'phase9 review selection is stale';
  end if;
  return new;
end $$;

create trigger phase9_finding_review_decision_chain
  before insert on public.phase9_finding_review_decisions
  for each row execute function public.enforce_phase9_review_decision_chain();

create view public.phase9_review_queue_v1
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
    nullif(s.material_facts->>'normalizedDate','') deadline_iso,
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
      left join lateral (
        select decision from public.phase9_coverage_review_decisions cr
        where cr.workspace_id=f.workspace_id
          and cr.evaluation_run_id=f.evaluation_run_id
          and cr.source_document_id=c.source_document_id
          and cr.page_number=c.page_number
        order by cr.created_at desc,cr.id desc limit 1
      ) coverage_review on true
      where c.page_number is not null and coverage_review.decision='needs_follow_up'
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
        join public.phase9_source_block_coverage c
          on c.workspace_id=f.workspace_id
          and c.evaluation_run_id=f.evaluation_run_id and c.block_hash=h.value
        where c.route='parser_uncertain'
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
        mandatory_class='mandatory' and lower(obligation_text) ~
        '(deadline|due date|mandatory form|required form|pricing|signature|signed|initial|attest|acknowledg|insurance|bond|license|permit|certif|pre[- ]?bid|site visit|delivery method|electronic submission|physical submission|hard copy|copies|file format|file name|package|sealed|mandatory attachment|subcontractor disclosure|shall be rejected|will be rejected|disqualif)'
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
  (
    review_lane='routine' and latest_decision_id is null
  ) batch_accept_eligible,
  (
    review_lane='duplicate' and duplicate_rank>1 and latest_decision_id is null
  ) batch_duplicate_reject_eligible,
  'phase9-review-priority-v1' priority_version,
  'phase9-duplicate-policy-v1' duplicate_policy_version
from classified;

grant select on public.phase9_review_queue_v1 to authenticated;

create view public.phase9_coverage_exception_pages_v1
with (security_invoker=true) as
with expected_pages as (
  select
    d.workspace_id,d.evaluation_run_id,d.document_id source_document_id,
    generate_series(1,d.page_count) page_number
  from public.phase9_evaluation_documents d
), page_state as (
  select
    ep.workspace_id,ep.evaluation_run_id,ep.source_document_id,ep.page_number,
    count(c.block_hash)=0 missing_coverage,
    coalesce(bool_or(c.route='parser_uncertain'),false) parser_uncertain,
    coalesce(bool_or(
      exists (
        select 1 from public.phase9_candidate_seeds s
        where s.workspace_id=ep.workspace_id
          and s.evaluation_run_id=ep.evaluation_run_id
          and s.source_block_hashes ? c.block_hash
          and not exists (
            select 1 from public.phase9_findings f
            where f.workspace_id=ep.workspace_id
              and f.evaluation_run_id=ep.evaluation_run_id
              and f.candidate_hash=s.candidate_hash
          )
      )
    ),false) seed_unassessed,
    coalesce(bool_or(
      exists (
        select 1 from jsonb_array_elements_text(c.deterministic_signals) signal
        where signal ~* '(deadline|form_identifier|use_attachment|signature)'
      )
    ),false) high_risk_signal,
    coalesce(bool_or(
      exists (
        select 1 from public.phase9_findings f
        where f.workspace_id=ep.workspace_id
          and f.evaluation_run_id=ep.evaluation_run_id
          and f.evidence_block_hashes ? c.block_hash
      )
    ),false) has_finding
  from expected_pages ep
  left join public.phase9_source_block_coverage c
    on c.workspace_id=ep.workspace_id
    and c.evaluation_run_id=ep.evaluation_run_id
    and c.source_document_id=ep.source_document_id
    and c.page_number=ep.page_number
  group by
    ep.workspace_id,ep.evaluation_run_id,ep.source_document_id,ep.page_number
), exceptions as (
  select *,
    case
      when missing_coverage then 'missing_coverage'
      when parser_uncertain then 'parser_uncertain'
      when seed_unassessed then 'candidate_not_assessed'
      else 'high_risk_signal_without_finding'
    end exception_reason
  from page_state
  where missing_coverage or parser_uncertain or seed_unassessed
    or (high_risk_signal and not has_finding)
)
select e.*,
  latest.id latest_decision_id,
  latest.decision human_decision,
  latest.created_at decision_created_at
from exceptions e
left join lateral (
  select d.id,d.decision,d.created_at
  from public.phase9_coverage_review_decisions d
  where d.workspace_id=e.workspace_id
    and d.evaluation_run_id=e.evaluation_run_id
    and d.source_document_id=e.source_document_id
    and d.page_number=e.page_number
  order by d.created_at desc,d.id desc limit 1
) latest on true;

grant select on public.phase9_coverage_exception_pages_v1 to authenticated;

create or replace function public.get_phase9_review_summary(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare
  v_actor uuid := (select auth.uid());
  v_result jsonb;
  v_coverage_total integer;
  v_coverage_reviewed integer;
  v_coverage_follow_up integer;
  v_total integer;
  v_reviewed integer;
  v_finding_follow_up integer;
  v_unresolved_critical integer;
  v_unresolved_exception integer;
  v_unresolved_duplicate integer;
  v_unresolved_routine integer;
  v_published integer;
  v_next_action text;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if not exists (
    select 1 from public.phase9_evaluation_runs
    where id=p_evaluation_run_id and workspace_id=p_workspace_id and status='completed'
  ) then raise exception 'completed phase9 run required'; end if;
  select
    count(*),count(*) filter(where latest_decision_id is not null),
    count(*) filter(where human_decision='needs_follow_up'),
    count(*) filter(where review_lane='critical' and latest_decision_id is null),
    count(*) filter(where review_lane='exception' and latest_decision_id is null),
    count(*) filter(where review_lane='duplicate' and latest_decision_id is null),
    count(*) filter(where review_lane='routine' and latest_decision_id is null)
  into
    v_total,v_reviewed,v_finding_follow_up,v_unresolved_critical,
    v_unresolved_exception,v_unresolved_duplicate,v_unresolved_routine
  from public.phase9_review_queue_v1
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;

  select count(*),count(*) filter(where latest_decision_id is not null),
    count(*) filter(where human_decision='needs_follow_up')
  into v_coverage_total,v_coverage_reviewed,v_coverage_follow_up
  from public.phase9_coverage_exception_pages_v1
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;

  select coalesce(max(published_count),0) into v_published
  from public.phase9_bridge_runs
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;

  v_next_action := case
    when v_unresolved_critical>0 then 'review_critical'
    when v_unresolved_exception>0 then 'review_exceptions'
    when v_unresolved_duplicate>0 then 'review_duplicates'
    when v_unresolved_routine>0 then 'accelerate_routine_review'
    when v_coverage_reviewed<v_coverage_total then 'review_coverage_exceptions'
    when v_finding_follow_up+v_coverage_follow_up>0 then 'resolve_follow_up'
    when v_published=0 then 'publish_reviewed_requirements'
    else 'open_submission_checklist'
  end;

  select jsonb_build_object(
    'version','phase9-review-priority-v1',
    'totalFindings',count(*),
    'critical',count(*) filter(where review_lane='critical'),
    'exceptions',count(*) filter(where review_lane='exception'),
    'duplicates',count(*) filter(where review_lane='duplicate'),
    'routine',count(*) filter(where review_lane='routine'),
    'unresolvedCritical',v_unresolved_critical,
    'unresolvedExceptions',v_unresolved_exception,
    'unresolvedDuplicates',v_unresolved_duplicate,
    'unresolvedRoutine',v_unresolved_routine,
    'reviewed',count(*) filter(where latest_decision_id is not null),
    'publishableAccepted',count(*) filter(
      where human_decision='accepted'
        and source_support_status='supported'
        and precedence_status='active'
        and machine_only
        and evidence_count>0
        and page_references_complete
        and quote_match_type in ('exact','normalized_exact')
    ),
    'followUp',count(*) filter(where human_decision='needs_follow_up'),
    'batchEligible',count(*) filter(where batch_accept_eligible),
    'individualReviewRemaining',count(*) filter(
      where latest_decision_id is null and review_lane in ('critical','exception')
    ),
    'duplicateGroups',count(distinct duplicate_signature) filter(
      where duplicate_count>1
    ),
    'submissionDeadlines',count(*) filter(where category='submission_deadline'),
    'questionDeadlines',count(*) filter(where category='question_deadline'),
    'requiredForms',count(*) filter(where category in ('mandatory_form','pricing_form')),
    'signaturesAcknowledgments',count(*) filter(
      where category in ('signature','initials','attestation','acknowledgment','addendum_acknowledgment')
    ),
    'insuranceBondLicensing',count(*) filter(
      where category in ('insurance','bond','license','certification')
    ),
    'pricing',count(*) filter(where category='pricing_form')
    ,'unresolvedCoverageExceptions',v_coverage_total-v_coverage_reviewed
    ,'coverageExceptions',v_coverage_total
    ,'coverageReviewed',v_coverage_reviewed
    ,'publishedRequirements',v_published
    ,'bidderEvidenceRequired',count(*) filter(
      where proof_requirement<>'none_identified'
    )
    ,'reviewCompletionPercentage',case when v_total=0 then 0
      else round((v_reviewed::numeric/v_total::numeric)*100,1) end
    ,'publicationEligible',
      v_total>0 and v_reviewed=v_total and v_finding_follow_up=0
      and v_coverage_reviewed=v_coverage_total and v_coverage_follow_up=0
    ,'nextRecommendedAction',v_next_action
  ) into v_result
  from public.phase9_review_queue_v1
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;

revoke all on function public.get_phase9_review_summary(uuid,uuid) from public,anon;
grant execute on function public.get_phase9_review_summary(uuid,uuid) to authenticated;

create or replace function public.get_phase9_review_queue(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_lane text default 'all',
  p_search text default '',p_duplicate_signature text default null,
  p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql security definer set search_path='' stable as $$
declare
  v_actor uuid := (select auth.uid());
  v_rows jsonb;
  v_total integer;
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
        or q.obligation_text ilike '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
        or coalesce(q.form_reference,'') ilike
          '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
        or q.category ilike '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
      )
  ), bounded as (
    select * from filtered
    order by
      (latest_decision_id is not null),
      case review_lane when 'critical' then 0 when 'exception' then 1
        when 'duplicate' then 2 else 3 end,
      deadline_iso asc nulls last,
      (mandatory_class='mandatory') desc,
      page_number asc nulls last,
      candidate_hash
    limit p_page_size offset ((p_page-1)*p_page_size)
  )
  select coalesce(jsonb_agg(to_jsonb(bounded)),'[]'::jsonb) into v_rows from bounded;
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
      or q.obligation_text ilike '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
      or coalesce(q.form_reference,'') ilike
        '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
      or q.category ilike '%'||replace(trim(p_search),'%','\%')||'%' escape '\'
    );
  return jsonb_build_object(
    'version','phase9-review-priority-v1','page',p_page,'pageSize',p_page_size,
    'total',v_total,'rows',v_rows
  );
end $$;

revoke all on function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) from public,anon;
grant execute on function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) to authenticated;

create or replace function public.record_phase9_review_batch(
  p_workspace_id uuid,
  p_evaluation_run_id uuid,
  p_candidate_hashes text[],
  p_action text,
  p_reason text,
  p_idempotency_key uuid,
  p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_count integer;
  v_valid integer;
  v_selection_hash text;
  v_batch_id uuid := gen_random_uuid();
  v_existing public.phase9_review_batch_operations%rowtype;
  v_decision text;
  v_hash text;
  v_prior uuid;
  v_decision_id uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_action not in ('accept_routine','reject_duplicate','mark_follow_up') then
    raise exception 'invalid phase9 batch action';
  end if;
  if p_candidate_hashes is null or cardinality(p_candidate_hashes) not between 1 and 500 then
    raise exception 'batch selection must contain between 1 and 500 findings';
  end if;
  if exists (
    select 1 from unnest(p_candidate_hashes) h
    where h !~ '^[0-9a-f]{64}$'
  ) then raise exception 'invalid candidate hash'; end if;
  select count(distinct h) into v_count from unnest(p_candidate_hashes) h;
  if v_count<>cardinality(p_candidate_hashes) then
    raise exception 'batch selection contains duplicate findings';
  end if;
  if p_action in ('reject_duplicate','mark_follow_up')
    and char_length(trim(coalesce(p_reason,'')))<5 then
    raise exception 'batch action requires a reason';
  end if;
  if char_length(coalesce(p_reason,''))>1000 then
    raise exception 'batch reason exceeds the permitted length';
  end if;
  if p_review_session_id is null then
    raise exception 'review session is required';
  end if;

  select encode(
    extensions.digest(
      convert_to(
        p_action||':'||array_to_string(
          array(select unnest(p_candidate_hashes) order by 1),','
        )||':'||coalesce(p_reason,''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_selection_hash;

  select * into v_existing from public.phase9_review_batch_operations
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.selection_hash<>v_selection_hash or v_existing.action<>p_action then
      raise exception 'batch idempotency identity mismatch';
    end if;
    return jsonb_build_object(
      'batchOperationId',v_existing.id,'selectionCount',v_existing.selection_count,
      'action',v_existing.action,'reused',true
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_evaluation_run_id::text||':'||locked_hash,0)
  )
  from (
    select unnest(p_candidate_hashes) locked_hash order by 1
  ) locked;

  select count(*) into v_valid from public.phase9_review_queue_v1 q
  where q.workspace_id=p_workspace_id and q.evaluation_run_id=p_evaluation_run_id
    and q.candidate_hash=any(p_candidate_hashes)
    and q.latest_decision_id is null
    and case
      when p_action='accept_routine' then q.batch_accept_eligible
      when p_action='reject_duplicate' then q.batch_duplicate_reject_eligible
      else q.review_lane in ('routine','duplicate')
    end;
  if v_valid<>v_count then
    raise exception 'batch selection is stale or contains an ineligible finding';
  end if;

  insert into public.phase9_review_batch_operations(
    id,workspace_id,evaluation_run_id,actor_id,action,selection_count,
    selection_hash,reason,idempotency_key,priority_version,policy_version
  ) values (
    v_batch_id,p_workspace_id,p_evaluation_run_id,v_actor,p_action,v_count,
    v_selection_hash,coalesce(p_reason,''),p_idempotency_key,
    'phase9-review-priority-v1','phase9-batch-review-policy-v1'
  );
  v_decision := case p_action
    when 'accept_routine' then 'accepted'
    when 'reject_duplicate' then 'rejected'
    else 'needs_follow_up'
  end;

  foreach v_hash in array p_candidate_hashes loop
    select id into v_prior from public.phase9_finding_review_decisions
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and candidate_hash=v_hash
    order by created_at desc,id desc limit 1;
    if v_prior is not null then
      raise exception 'batch selection became stale';
    end if;
    insert into public.phase9_finding_review_decisions(
      workspace_id,evaluation_run_id,candidate_hash,reviewer_id,decision,note,
      corrections,prior_decision_id,review_version,batch_operation_id,batch_policy_version
    ) values (
      p_workspace_id,p_evaluation_run_id,v_hash,v_actor,v_decision,
      left(coalesce(p_reason,''),4000),'{}'::jsonb,null,
      'phase9-finding-review-v1',v_batch_id,'phase9-batch-review-policy-v1'
    ) returning id into v_decision_id;
    insert into public.audit_events(
      workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
    ) values (
      p_workspace_id,'user',v_actor,'verification_reviewed','phase9_finding',v_decision_id,
      jsonb_build_object(
        'evaluation_run_id',p_evaluation_run_id,'candidate_hash',v_hash,
        'decision',v_decision,'batch_operation_id',v_batch_id,
        'policy_version','phase9-batch-review-policy-v1'
      )
    );
  end loop;
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,batch_operation_id,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,p_idempotency_key,
    'batch_operation_completed',v_batch_id,'phase9-review-analytics-v1',
    jsonb_build_object(
      'lane',case p_action when 'accept_routine' then 'routine' else 'duplicate' end,
      'decision',v_decision,'selectionCount',v_count
    )
  );
  return jsonb_build_object(
    'batchOperationId',v_batch_id,'selectionCount',v_count,'action',p_action,'reused',false
  );
end $$;

revoke all on function public.record_phase9_review_batch(
  uuid,uuid,text[],text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_review_batch(
  uuid,uuid,text[],text,text,uuid,uuid
) to authenticated;

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
    'individual_decision_recorded','batch_operation_completed',
    'coverage_exception_reviewed','publication_attempted','publication_completed'
  ) then raise exception 'invalid review activity event'; end if;
  if p_review_session_id is null or p_idempotency_key is null then
    raise exception 'review activity identity is required';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object'
    or pg_column_size(coalesce(p_metadata,'{}'::jsonb))>2048
    or exists (
      select 1 from jsonb_each(coalesce(p_metadata,'{}'::jsonb)) entry
      where entry.key not in (
        'lane','decision','selectionCount','result','source','remainingWork',
        'publicationState','route'
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
  if p_batch_operation_id is not null and not exists (
    select 1 from public.phase9_review_batch_operations
    where id=p_batch_operation_id and workspace_id=p_workspace_id
      and evaluation_run_id=p_evaluation_run_id
  ) then raise exception 'review activity batch is outside the workspace run'; end if;
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
      or v_existing.batch_operation_id is distinct from p_batch_operation_id
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
    p_source_document_id,p_page_number,p_batch_operation_id,
    'phase9-review-analytics-v1',coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.record_phase9_review_activity(
  uuid,uuid,text,uuid,uuid,text,uuid,integer,uuid,jsonb
) from public,anon;
grant execute on function public.record_phase9_review_activity(
  uuid,uuid,text,uuid,uuid,text,uuid,integer,uuid,jsonb
) to authenticated;

create or replace function public.record_phase9_finding_review_accelerated(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hash text,
  p_decision text,p_note text,p_corrections jsonb,
  p_review_session_id uuid,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_decision_id uuid; v_existing uuid;
begin
  select (metadata->>'result')::uuid into v_existing
  from public.phase9_review_activity_events
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key
    and actor_id=v_actor and evaluation_run_id=p_evaluation_run_id
    and review_session_id=p_review_session_id
    and event_type='individual_decision_recorded';
  if v_existing is not null then return v_existing; end if;
  v_decision_id := public.record_phase9_finding_review(
    p_workspace_id,p_evaluation_run_id,p_candidate_hash,p_decision,p_note,p_corrections
  );
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,candidate_hash,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,p_idempotency_key,
    'individual_decision_recorded',p_candidate_hash,'phase9-review-analytics-v1',
    jsonb_build_object('decision',p_decision,'result',v_decision_id::text)
  );
  return v_decision_id;
end $$;

revoke all on function public.record_phase9_finding_review_accelerated(
  uuid,uuid,text,text,text,jsonb,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_finding_review_accelerated(
  uuid,uuid,text,text,text,jsonb,uuid,uuid
) to authenticated;

create or replace function public.record_phase9_coverage_review_accelerated(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_source_document_id uuid,
  p_page_number integer,p_decision text,p_note text,
  p_review_session_id uuid,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_decision_id uuid; v_existing uuid;
begin
  select (metadata->>'result')::uuid into v_existing
  from public.phase9_review_activity_events
  where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key
    and actor_id=v_actor and evaluation_run_id=p_evaluation_run_id
    and review_session_id=p_review_session_id
    and event_type='coverage_exception_reviewed';
  if v_existing is not null then return v_existing; end if;
  v_decision_id := public.record_phase9_coverage_review(
    p_workspace_id,p_evaluation_run_id,p_source_document_id,p_page_number,
    p_decision,p_note
  );
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,source_document_id,page_number,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,p_idempotency_key,
    'coverage_exception_reviewed',p_source_document_id,p_page_number,
    'phase9-review-analytics-v1',
    jsonb_build_object('decision',p_decision,'result',v_decision_id::text)
  );
  return v_decision_id;
end $$;

revoke all on function public.record_phase9_coverage_review_accelerated(
  uuid,uuid,uuid,integer,text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_coverage_review_accelerated(
  uuid,uuid,uuid,integer,text,text,uuid,uuid
) to authenticated;

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
      greatest(0,extract(epoch from max(created_at)-min(created_at))::integer) end,
    'individualDecisions',count(*) filter(
      where event_type='individual_decision_recorded'
    ),
    'batchOperations',count(*) filter(
      where event_type='batch_operation_completed'
    ),
    'batchDecisions',coalesce(sum(
      case when event_type='batch_operation_completed'
        then (metadata->>'selectionCount')::integer else 0 end
    ),0),
    'sourceOpenings',count(*) filter(where event_type='source_page_opened'),
    'decisionsPerMinute',case
      when count(*)<2 or max(created_at)=min(created_at) then 0
      else round((
        count(*) filter(where event_type in (
          'individual_decision_recorded','batch_operation_completed'
        ))
      )::numeric / greatest(
        extract(epoch from max(created_at)-min(created_at))/60,0.0167
      ),2)
    end,
    'remainingWork',(
      select count(*) from public.phase9_review_queue_v1 q
      where q.workspace_id=p_workspace_id
        and q.evaluation_run_id=p_evaluation_run_id
        and q.latest_decision_id is null
    )
  ) into v_result
  from public.phase9_review_activity_events
  where workspace_id=p_workspace_id
    and evaluation_run_id=p_evaluation_run_id
    and review_session_id=p_review_session_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;

revoke all on function public.get_phase9_review_activity_summary(
  uuid,uuid,uuid
) from public,anon;
grant execute on function public.get_phase9_review_activity_summary(
  uuid,uuid,uuid
) to authenticated;

create or replace function public.save_guided_tour_state(
  p_workspace_id uuid,p_tour_id text,p_tour_version text,p_status text,
  p_last_completed_step integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  if p_tour_version<>'guided-product-tour-v1'
    or p_tour_id not in ('first-run-rfp-review','stakeholder-demo')
    or p_status not in ('started','completed','dismissed')
    or p_last_completed_step<0
    or (
      p_tour_id='first-run-rfp-review' and p_last_completed_step>5
    )
    or (
      p_tour_id='stakeholder-demo' and p_last_completed_step>14
    ) then
    raise exception 'invalid guided tour state';
  end if;
  if p_tour_id='stakeholder-demo' and not exists (
    select 1 from public.phase8_demo_scopes
    where workspace_id=p_workspace_id
      and synthetic_marker='phase8-synthetic-demo-only'
  ) then raise exception 'prepared demo workspace required'; end if;
  insert into public.guided_tour_states(
    user_id,workspace_id,tour_id,tour_version,status,last_completed_step,
    completed_at,dismissed_at,restarted_at
  ) values (
    v_actor,p_workspace_id,p_tour_id,p_tour_version,p_status,p_last_completed_step,
    case when p_status='completed' then now() end,
    case when p_status='dismissed' then now() end,
    case when p_status='started' then now() end
  )
  on conflict(user_id,workspace_id,tour_id,tour_version) do update set
    status=excluded.status,last_completed_step=excluded.last_completed_step,
    completed_at=case when excluded.status='completed' then now()
      else public.guided_tour_states.completed_at end,
    dismissed_at=case when excluded.status='dismissed' then now()
      else public.guided_tour_states.dismissed_at end,
    restarted_at=case when excluded.status='started' then now()
      else public.guided_tour_states.restarted_at end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) from public,anon;
grant execute on function public.save_guided_tour_state(
  uuid,text,text,text,integer
) to authenticated;

revoke all on function public.phase9_review_category_v1(text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.phase9_review_duplicate_signature_v1(
  text,text,uuid,text,jsonb,text
) from public,anon,authenticated;
