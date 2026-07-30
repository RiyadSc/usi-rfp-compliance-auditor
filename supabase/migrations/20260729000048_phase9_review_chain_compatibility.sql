-- Phase 9 append-only review-chain and legacy idempotency compatibility.
--
-- New decisions are serialized at the run and record boundary. This migration
-- makes the linked-list head authoritative even when an older transaction used
-- transaction-scoped now() timestamps, guarantees a strictly increasing
-- created_at value for future records, and permits exact retries of legacy
-- accelerated-review events that predate requestHash metadata. Immutable
-- decision and activity history is not rewritten.

-- Existing immutable history must already agree with linked-list chronology.
-- If it does not, stop rather than guessing which decision is current.
do $$
begin
  if exists (
    select 1
    from public.phase9_finding_review_decisions child
    join public.phase9_finding_review_decisions parent
      on parent.id=child.prior_decision_id
    where child.created_at<=parent.created_at
  ) then
    raise exception
      'phase9 review-chain migration refused: finding chronology is ambiguous';
  end if;
  if exists (
    select 1
    from public.phase9_coverage_review_decisions child
    join public.phase9_coverage_review_decisions parent
      on parent.id=child.prior_decision_id
    where child.created_at<=parent.created_at
  ) then
    raise exception
      'phase9 review-chain migration refused: coverage chronology is ambiguous';
  end if;
end
$$;

-- A decision chain may have one root and one child for every prior decision.
create unique index phase9_finding_review_single_root_idx
  on public.phase9_finding_review_decisions(
    workspace_id,evaluation_run_id,candidate_hash
  )
  where prior_decision_id is null;
create unique index phase9_finding_review_single_child_idx
  on public.phase9_finding_review_decisions(prior_decision_id)
  where prior_decision_id is not null;
create unique index phase9_finding_review_unique_chronology_idx
  on public.phase9_finding_review_decisions(
    workspace_id,evaluation_run_id,candidate_hash,created_at
  );
create unique index phase9_coverage_review_single_root_idx
  on public.phase9_coverage_review_decisions(
    workspace_id,evaluation_run_id,source_document_id,page_number
  )
  where prior_decision_id is null;
create unique index phase9_coverage_review_single_child_idx
  on public.phase9_coverage_review_decisions(prior_decision_id)
  where prior_decision_id is not null;
create unique index phase9_coverage_review_unique_chronology_idx
  on public.phase9_coverage_review_decisions(
    workspace_id,evaluation_run_id,source_document_id,page_number,created_at
  );

create or replace function public.enforce_phase9_review_decision_chain()
returns trigger language plpgsql set search_path='' as $$
declare
  v_latest uuid;
  v_latest_created_at timestamptz;
  v_head_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||new.workspace_id::text||':'||
    new.evaluation_run_id::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    new.evaluation_run_id::text||':'||new.candidate_hash,0
  ));
  select count(*) into v_head_count
  from public.phase9_finding_review_decisions decision
  where decision.workspace_id=new.workspace_id
    and decision.evaluation_run_id=new.evaluation_run_id
    and decision.candidate_hash=new.candidate_hash
    and not exists (
      select 1
      from public.phase9_finding_review_decisions child
      where child.prior_decision_id=decision.id
    );
  if v_head_count>1 then
    raise exception 'phase9 review decision chain has multiple heads';
  end if;
  select decision.id,decision.created_at into v_latest,v_latest_created_at
  from public.phase9_finding_review_decisions decision
  where decision.workspace_id=new.workspace_id
    and decision.evaluation_run_id=new.evaluation_run_id
    and decision.candidate_hash=new.candidate_hash
    and not exists (
      select 1
      from public.phase9_finding_review_decisions child
      where child.prior_decision_id=decision.id
    )
  limit 1;
  if v_latest is distinct from new.prior_decision_id then
    raise exception 'phase9 review selection is stale';
  end if;
  new.created_at := greatest(
    clock_timestamp(),
    coalesce(v_latest_created_at + interval '1 microsecond','-infinity'::timestamptz)
  );
  return new;
end
$$;

create or replace function public.enforce_phase9_coverage_review_decision_chain_v1()
returns trigger language plpgsql set search_path='' as $$
declare
  v_latest uuid;
  v_latest_created_at timestamptz;
  v_head_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-review-run-v1:'||new.workspace_id::text||':'||
    new.evaluation_run_id::text,0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'phase9-coverage-review-v1:'||new.evaluation_run_id::text||':'||
    new.source_document_id::text||':'||new.page_number::text,0
  ));
  select count(*) into v_head_count
  from public.phase9_coverage_review_decisions decision
  where decision.workspace_id=new.workspace_id
    and decision.evaluation_run_id=new.evaluation_run_id
    and decision.source_document_id=new.source_document_id
    and decision.page_number=new.page_number
    and not exists (
      select 1
      from public.phase9_coverage_review_decisions child
      where child.prior_decision_id=decision.id
    );
  if v_head_count>1 then
    raise exception 'phase9 coverage review decision chain has multiple heads';
  end if;
  select decision.id,decision.created_at into v_latest,v_latest_created_at
  from public.phase9_coverage_review_decisions decision
  where decision.workspace_id=new.workspace_id
    and decision.evaluation_run_id=new.evaluation_run_id
    and decision.source_document_id=new.source_document_id
    and decision.page_number=new.page_number
    and not exists (
      select 1
      from public.phase9_coverage_review_decisions child
      where child.prior_decision_id=decision.id
    )
  limit 1;
  if v_latest is distinct from new.prior_decision_id then
    raise exception 'phase9 coverage review selection is stale';
  end if;
  new.created_at := greatest(
    clock_timestamp(),
    coalesce(v_latest_created_at + interval '1 microsecond','-infinity'::timestamptz)
  );
  return new;
end
$$;

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
