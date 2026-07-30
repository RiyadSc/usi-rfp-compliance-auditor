-- Phase 9 review integrity hardening.
--
-- This migration preserves immutable findings, evidence, decisions, and bridge
-- history. New writes are constrained to the evaluation run's selected
-- documents and candidate seeds. Historical evidence created before explicit
-- run/document bindings existed remains immutable, but is forced into the
-- exception lane and cannot be batch accepted or published.

-- ---------------------------------------------------------------------------
-- Immutable source linkage
-- ---------------------------------------------------------------------------

-- The development database contains legacy evaluation runs created before
-- phase9_evaluation_documents existed. NOT VALID preserves that immutable
-- history while still enforcing the relationship for every new evidence row.
alter table public.phase9_source_block_coverage
  add constraint phase9_source_block_coverage_run_document_fk
  foreign key(evaluation_run_id,source_document_id)
  references public.phase9_evaluation_documents(evaluation_run_id,document_id)
  on delete restrict
  not valid;

-- Environments without legacy rows can fully validate the constraint now.
do $$
begin
  if not exists (
    select 1
    from public.phase9_source_block_coverage coverage
    left join public.phase9_evaluation_documents document
      on document.evaluation_run_id=coverage.evaluation_run_id
      and document.document_id=coverage.source_document_id
    where document.id is null
  ) then
    execute
      'alter table public.phase9_source_block_coverage ' ||
      'validate constraint phase9_source_block_coverage_run_document_fk';
  end if;
end
$$;

-- Findings are authoritative only when their immutable candidate seed exists
-- in the same workspace and evaluation run. Unlike the legacy document case,
-- an orphan finding has no safe interpretation, so migration fails closed if
-- one exists.
do $$
begin
  if exists (
    select 1
    from public.phase9_findings finding
    left join public.phase9_candidate_seeds seed
      on seed.workspace_id=finding.workspace_id
      and seed.evaluation_run_id=finding.evaluation_run_id
      and seed.candidate_hash=finding.candidate_hash
    where seed.id is null
  ) then
    raise exception
      'phase9 integrity migration refused: orphan finding lacks candidate seed';
  end if;
end
$$;

alter table public.phase9_candidate_seeds
  add constraint phase9_candidate_seeds_scope_candidate_unique
  unique(evaluation_run_id,candidate_hash,workspace_id);

alter table public.phase9_findings
  add constraint phase9_findings_candidate_seed_fk
  foreign key(evaluation_run_id,candidate_hash,workspace_id)
  references public.phase9_candidate_seeds(
    evaluation_run_id,candidate_hash,workspace_id
  )
  on delete restrict;

-- Keep the established queue shape while forcing any legacy unbound evidence
-- to fail closed. The pre-integrity view remains internal and read-only.
alter view public.phase9_review_queue_unscoped_v1
  rename to phase9_review_queue_pre_integrity_v1;
revoke all on public.phase9_review_queue_pre_integrity_v1
  from public,anon,authenticated;

create view public.phase9_review_queue_unscoped_v1
with (security_invoker=true) as
with guarded as (
  select
    queue.*,
    not exists (
      select 1
      from jsonb_array_elements_text(queue.evidence_block_hashes) block(value)
      left join public.phase9_source_block_coverage coverage
        on coverage.workspace_id=queue.workspace_id
        and coverage.evaluation_run_id=queue.evaluation_run_id
        and coverage.block_hash=block.value
      left join public.phase9_evaluation_documents document
        on document.workspace_id=queue.workspace_id
        and document.evaluation_run_id=queue.evaluation_run_id
        and document.document_id=coverage.source_document_id
      where coverage.id is null or document.id is null
    ) evidence_run_bound
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
    then guarded.canonical_candidate_hash else null end canonical_candidate_hash,
  case when guarded.evidence_run_bound
    then guarded.review_lane else 'exception' end review_lane,
  case when guarded.evidence_run_bound
    then guarded.lane_reason else 'evidence_document_not_bound_to_run' end lane_reason,
  guarded.batch_accept_eligible and guarded.evidence_run_bound
    batch_accept_eligible,
  guarded.batch_duplicate_reject_eligible and guarded.evidence_run_bound
    batch_duplicate_reject_eligible,
  guarded.priority_version,
  guarded.duplicate_policy_version
from guarded;

revoke all on public.phase9_review_queue_unscoped_v1
  from public,anon,authenticated;

create or replace view public.phase9_review_queue_v1
with (security_invoker=true) as
select queue.*
from public.phase9_review_queue_unscoped_v1 queue
where (
  nullif(current_setting('app.phase9_review_workspace_id',true),'') is null
  and nullif(current_setting('app.phase9_review_run_id',true),'') is null
) or (
  queue.workspace_id=(
    nullif(current_setting('app.phase9_review_workspace_id',true),'')
  )::uuid
  and queue.evaluation_run_id=(
    nullif(current_setting('app.phase9_review_run_id',true),'')
  )::uuid
);
grant select on public.phase9_review_queue_v1 to authenticated;

-- ---------------------------------------------------------------------------
-- Review/publication serialization
-- ---------------------------------------------------------------------------

-- Finding review decisions take the run lock before the narrower finding lock.
-- Publication takes the same run lock, so all decision IDs used to compute the
-- bridge input hash remain stable until every bridge item is persisted.
create or replace function public.enforce_phase9_review_decision_chain()
returns trigger language plpgsql set search_path='' as $$
declare
  v_latest uuid;
  v_latest_created_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||new.workspace_id::text||':'||
    new.evaluation_run_id::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    new.evaluation_run_id::text||':'||new.candidate_hash,0
  ));
  select id,created_at into v_latest,v_latest_created_at
  from public.phase9_finding_review_decisions
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.evaluation_run_id
    and candidate_hash=new.candidate_hash
  order by created_at desc,id desc
  limit 1;
  if v_latest is distinct from new.prior_decision_id then
    raise exception 'phase9 review selection is stale';
  end if;
  -- now() is fixed at transaction start and random UUID ordering is not an
  -- append sequence. Normalize the timestamp under the lock so this row is
  -- deterministically newer than the current head.
  new.created_at := greatest(
    clock_timestamp(),
    coalesce(v_latest_created_at + interval '1 microsecond',clock_timestamp())
  );
  return new;
end
$$;

-- Coverage decisions use the same run lock and a deterministic page lock. This
-- prevents two concurrent reviewers from creating competing append-only heads.
create function public.enforce_phase9_coverage_review_decision_chain_v1()
returns trigger language plpgsql set search_path='' as $$
declare
  v_latest uuid;
  v_latest_created_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||new.workspace_id::text||':'||
    new.evaluation_run_id::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-coverage-review-v1:'||new.evaluation_run_id::text||':'||
    new.source_document_id::text||':'||new.page_number::text,0
  ));
  select id,created_at into v_latest,v_latest_created_at
  from public.phase9_coverage_review_decisions
  where workspace_id=new.workspace_id
    and evaluation_run_id=new.evaluation_run_id
    and source_document_id=new.source_document_id
    and page_number=new.page_number
  order by created_at desc,id desc
  limit 1;
  if v_latest is distinct from new.prior_decision_id then
    raise exception 'phase9 coverage review selection is stale';
  end if;
  new.created_at := greatest(
    clock_timestamp(),
    coalesce(v_latest_created_at + interval '1 microsecond',clock_timestamp())
  );
  return new;
end
$$;

create trigger phase9_coverage_review_decision_chain_v1
  before insert on public.phase9_coverage_review_decisions
  for each row
  execute function public.enforce_phase9_coverage_review_decision_chain_v1();

-- The wrapper remains the only authenticated batch entry point. It obtains the
-- run lock before the underlying function takes finding locks.
create or replace function public.record_phase9_review_batch_v2(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hashes text[],
  p_action text,p_reason text,p_idempotency_key uuid,p_review_session_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan'
set enable_nestloop='off' as $$
begin
  if p_idempotency_key is null then
    raise exception 'batch idempotency key required';
  end if;
  if (select auth.uid()) is null
    or not public.is_workspace_member(p_workspace_id)
  then
    raise exception 'authorized workspace reviewer required';
  end if;
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-batch-v2:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text||':'||p_idempotency_key::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text,0
  ));
  return public.record_phase9_review_batch(
    p_workspace_id,p_evaluation_run_id,p_candidate_hashes,p_action,p_reason,
    p_idempotency_key,p_review_session_id
  );
end
$$;

revoke all on function public.record_phase9_review_batch(
  uuid,uuid,text[],text,text,uuid,uuid
) from public,anon,authenticated;
revoke all on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) to authenticated;

create or replace function public.publish_phase9_reviewed_findings(
  p_workspace_id uuid,p_evaluation_run_id uuid
) returns jsonb language plpgsql security definer set search_path=''
set plan_cache_mode='force_custom_plan'
set enable_nestloop='off' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||p_workspace_id::text||':'||
    p_evaluation_run_id::text,0
  ));
  perform set_config('app.phase9_review_workspace_id',p_workspace_id::text,true);
  perform set_config('app.phase9_review_run_id',p_evaluation_run_id::text,true);
  perform public.assert_phase9_bridge_review_completion(
    p_workspace_id,p_evaluation_run_id
  );
  return public.publish_phase9_reviewed_findings_unguarded(
    p_workspace_id,p_evaluation_run_id
  );
end
$$;

revoke all on function public.publish_phase9_reviewed_findings(uuid,uuid)
  from public,anon;
grant execute on function public.publish_phase9_reviewed_findings(uuid,uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Strict accelerated idempotency
-- ---------------------------------------------------------------------------

create function public.phase9_review_request_hash_v1(p_value jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(
    extensions.digest(
      convert_to(public.phase9_canonical_json_v1(p_value),'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;
revoke all on function public.phase9_review_request_hash_v1(jsonb)
  from public,anon,authenticated;

create or replace function public.record_phase9_finding_review_accelerated(
  p_workspace_id uuid,p_evaluation_run_id uuid,p_candidate_hash text,
  p_decision text,p_note text,p_corrections jsonb,
  p_review_session_id uuid,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_decision_id uuid;
  v_request_hash text;
  v_event public.phase9_review_activity_events%rowtype;
  v_decision public.phase9_finding_review_decisions%rowtype;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_review_session_id is null or p_idempotency_key is null then
    raise exception 'accelerated review identity is required';
  end if;
  if char_length(coalesce(p_note,''))>4000 then
    raise exception 'phase9 review note exceeds the permitted length';
  end if;
  v_request_hash := public.phase9_review_request_hash_v1(jsonb_build_object(
    'type','finding_review',
    'candidateHash',p_candidate_hash,
    'decision',p_decision,
    'note',coalesce(p_note,''),
    'corrections',coalesce(p_corrections,'{}'::jsonb)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-accelerated-review-v2:'||p_workspace_id::text||':'||
    p_idempotency_key::text,0
  ));

  select * into v_event
  from public.phase9_review_activity_events
  where workspace_id=p_workspace_id
    and idempotency_key=p_idempotency_key;
  if found then
    if v_event.evaluation_run_id<>p_evaluation_run_id
      or v_event.actor_id<>v_actor
      or v_event.review_session_id<>p_review_session_id
      or v_event.event_type<>'individual_decision_recorded'
      or v_event.candidate_hash is distinct from p_candidate_hash
      or v_event.source_document_id is not null
      or v_event.page_number is not null
      or v_event.batch_operation_id is not null
      or v_event.metadata->>'decision' is distinct from p_decision
      or (
        v_event.metadata ? 'requestHash'
        and v_event.metadata->>'requestHash' is distinct from v_request_hash
      )
      or coalesce(v_event.metadata->>'result','')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      raise exception 'accelerated finding review idempotency identity mismatch';
    end if;
    v_decision_id := (v_event.metadata->>'result')::uuid;
    select * into v_decision
    from public.phase9_finding_review_decisions
    where id=v_decision_id
      and workspace_id=p_workspace_id;
    if not found
      or v_decision.evaluation_run_id<>p_evaluation_run_id
      or v_decision.candidate_hash<>p_candidate_hash
      or v_decision.reviewer_id<>v_actor
      or v_decision.decision<>p_decision
      or v_decision.note<>coalesce(p_note,'')
      or v_decision.corrections<>coalesce(p_corrections,'{}'::jsonb)
    then
      raise exception 'accelerated finding review result identity mismatch';
    end if;
    return v_decision_id;
  end if;

  v_decision_id := public.record_phase9_finding_review(
    p_workspace_id,p_evaluation_run_id,p_candidate_hash,p_decision,p_note,
    p_corrections
  );
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,candidate_hash,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,
    p_idempotency_key,'individual_decision_recorded',p_candidate_hash,
    'phase9-review-analytics-v1',jsonb_build_object(
      'decision',p_decision,
      'result',v_decision_id::text,
      'requestHash',v_request_hash
    )
  );
  return v_decision_id;
end
$$;

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
declare
  v_actor uuid := (select auth.uid());
  v_decision_id uuid;
  v_request_hash text;
  v_event public.phase9_review_activity_events%rowtype;
  v_decision public.phase9_coverage_review_decisions%rowtype;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_review_session_id is null or p_idempotency_key is null then
    raise exception 'accelerated review identity is required';
  end if;
  if char_length(coalesce(p_note,''))>4000 then
    raise exception 'phase9 coverage note exceeds the permitted length';
  end if;
  v_request_hash := public.phase9_review_request_hash_v1(jsonb_build_object(
    'type','coverage_review',
    'documentId',p_source_document_id,
    'pageNumber',p_page_number,
    'decision',p_decision,
    'note',coalesce(p_note,'')
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-accelerated-review-v2:'||p_workspace_id::text||':'||
    p_idempotency_key::text,0
  ));

  select * into v_event
  from public.phase9_review_activity_events
  where workspace_id=p_workspace_id
    and idempotency_key=p_idempotency_key;
  if found then
    if v_event.evaluation_run_id<>p_evaluation_run_id
      or v_event.actor_id<>v_actor
      or v_event.review_session_id<>p_review_session_id
      or v_event.event_type<>'coverage_exception_reviewed'
      or v_event.candidate_hash is not null
      or v_event.source_document_id is distinct from p_source_document_id
      or v_event.page_number is distinct from p_page_number
      or v_event.batch_operation_id is not null
      or v_event.metadata->>'decision' is distinct from p_decision
      or (
        v_event.metadata ? 'requestHash'
        and v_event.metadata->>'requestHash' is distinct from v_request_hash
      )
      or coalesce(v_event.metadata->>'result','')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      raise exception 'accelerated coverage review idempotency identity mismatch';
    end if;
    v_decision_id := (v_event.metadata->>'result')::uuid;
    select * into v_decision
    from public.phase9_coverage_review_decisions
    where id=v_decision_id
      and workspace_id=p_workspace_id;
    if not found
      or v_decision.evaluation_run_id<>p_evaluation_run_id
      or v_decision.source_document_id<>p_source_document_id
      or v_decision.page_number<>p_page_number
      or v_decision.reviewer_id<>v_actor
      or v_decision.decision<>p_decision
      or v_decision.note<>coalesce(p_note,'')
    then
      raise exception 'accelerated coverage review result identity mismatch';
    end if;
    return v_decision_id;
  end if;

  v_decision_id := public.record_phase9_coverage_review(
    p_workspace_id,p_evaluation_run_id,p_source_document_id,p_page_number,
    p_decision,p_note
  );
  insert into public.phase9_review_activity_events(
    workspace_id,evaluation_run_id,actor_id,review_session_id,idempotency_key,
    event_type,source_document_id,page_number,policy_version,metadata
  ) values (
    p_workspace_id,p_evaluation_run_id,v_actor,p_review_session_id,
    p_idempotency_key,'coverage_exception_reviewed',p_source_document_id,
    p_page_number,'phase9-review-analytics-v1',jsonb_build_object(
      'decision',p_decision,
      'result',v_decision_id::text,
      'requestHash',v_request_hash
    )
  );
  return v_decision_id;
end
$$;

revoke all on function public.record_phase9_coverage_review_accelerated(
  uuid,uuid,uuid,integer,text,text,uuid,uuid
) from public,anon;
grant execute on function public.record_phase9_coverage_review_accelerated(
  uuid,uuid,uuid,integer,text,text,uuid,uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Truthful batch activity lane
-- ---------------------------------------------------------------------------

-- Existing review activity is immutable. Future batch-completion events derive
-- their lane from the exact decision rows attached to the batch instead of
-- trusting the caller/function's action shorthand.
create function public.enforce_phase9_batch_activity_lane_v1()
returns trigger language plpgsql set search_path='' as $$
declare
  v_selection_count integer;
  v_recorded_count integer;
  v_lane_count integer;
  v_first_lane text;
  v_lane text;
begin
  if new.event_type<>'batch_operation_completed' then
    return new;
  end if;
  select selection_count into v_selection_count
  from public.phase9_review_batch_operations
  where id=new.batch_operation_id
    and workspace_id=new.workspace_id
    and evaluation_run_id=new.evaluation_run_id;
  if v_selection_count is null then
    raise exception 'phase9 batch activity lacks an authoritative operation';
  end if;
  select
    count(*),
    count(distinct queue.review_lane),
    min(queue.review_lane)
  into v_recorded_count,v_lane_count,v_first_lane
  from public.phase9_finding_review_decisions decision
  join public.phase9_review_queue_v1 queue
    on queue.workspace_id=decision.workspace_id
    and queue.evaluation_run_id=decision.evaluation_run_id
    and queue.candidate_hash=decision.candidate_hash
  where decision.workspace_id=new.workspace_id
    and decision.evaluation_run_id=new.evaluation_run_id
    and decision.batch_operation_id=new.batch_operation_id;
  if v_recorded_count<>v_selection_count
    or v_lane_count not between 1 and 2
    or exists (
      select 1
      from public.phase9_finding_review_decisions decision
      join public.phase9_review_queue_v1 queue
        on queue.workspace_id=decision.workspace_id
        and queue.evaluation_run_id=decision.evaluation_run_id
        and queue.candidate_hash=decision.candidate_hash
      where decision.workspace_id=new.workspace_id
        and decision.evaluation_run_id=new.evaluation_run_id
        and decision.batch_operation_id=new.batch_operation_id
        and queue.review_lane not in ('routine','duplicate')
    )
  then
    raise exception 'phase9 batch activity selection is inconsistent';
  end if;
  v_lane := case when v_lane_count=1 then v_first_lane else 'mixed' end;
  new.metadata := jsonb_set(
    coalesce(new.metadata,'{}'::jsonb),
    '{lane}',
    to_jsonb(v_lane),
    true
  );
  return new;
end
$$;

create trigger phase9_review_activity_batch_lane_v1
  before insert on public.phase9_review_activity_events
  for each row execute function public.enforce_phase9_batch_activity_lane_v1();
