-- General Phase 9 -> Phase 4/5 bridge.
-- Machine findings remain immutable. Human decisions are append-only. Only an
-- explicit, evidence-backed, accepted supported+active finding can be published.

create table public.phase9_finding_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  candidate_hash text not null check (candidate_hash ~ '^[0-9a-f]{64}$'),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('accepted','rejected','needs_follow_up')),
  note text not null default '' check (char_length(note) <= 4000),
  corrections jsonb not null default '{}'::jsonb check (jsonb_typeof(corrections)='object'),
  prior_decision_id uuid references public.phase9_finding_review_decisions(id) on delete restrict,
  review_version text not null check (review_version='phase9-finding-review-v1'),
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(evaluation_run_id,candidate_hash)
    references public.phase9_findings(evaluation_run_id,candidate_hash) on delete restrict,
  unique(id,workspace_id)
);
create index phase9_finding_reviews_scope_idx
  on public.phase9_finding_review_decisions(
    workspace_id,evaluation_run_id,candidate_hash,created_at desc
  );

create table public.phase9_bridge_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  evaluation_run_id uuid not null,
  analysis_run_id uuid not null,
  verification_run_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  source_count integer not null check (source_count > 0),
  published_count integer not null check (published_count > 0),
  bridge_version text not null check (bridge_version='phase9-reviewed-bridge-v1'),
  source_compatibility_fingerprint text not null
    check (source_compatibility_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(evaluation_run_id,workspace_id)
    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict,
  foreign key(analysis_run_id,workspace_id)
    references public.analysis_runs(id,workspace_id) on delete restrict,
  foreign key(verification_run_id,workspace_id,analysis_run_id)
    references public.verification_runs(id,workspace_id,analysis_run_id) on delete restrict,
  unique(workspace_id,evaluation_run_id,input_hash,bridge_version),
  unique(id,workspace_id)
);
create index phase9_bridge_runs_scope_idx
  on public.phase9_bridge_runs(workspace_id,evaluation_run_id,created_at desc);

create table public.phase9_bridge_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  bridge_run_id uuid not null,
  evaluation_run_id uuid not null,
  candidate_hash text not null,
  review_decision_id uuid not null,
  requirement_candidate_id uuid not null,
  verification_finding_id uuid not null,
  verification_evidence_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(bridge_run_id,workspace_id)
    references public.phase9_bridge_runs(id,workspace_id) on delete restrict,
  foreign key(review_decision_id,workspace_id)
    references public.phase9_finding_review_decisions(id,workspace_id) on delete restrict,
  foreign key(evaluation_run_id,candidate_hash)
    references public.phase9_findings(evaluation_run_id,candidate_hash) on delete restrict,
  foreign key(requirement_candidate_id)
    references public.requirement_candidates(id) on delete restrict,
  foreign key(verification_finding_id,workspace_id)
    references public.verification_findings(id,workspace_id) on delete restrict,
  foreign key(verification_evidence_id)
    references public.verification_evidence(id) on delete restrict,
  unique(bridge_run_id,candidate_hash),
  unique(requirement_candidate_id),
  unique(verification_finding_id),
  unique(verification_evidence_id)
);
create index phase9_bridge_items_scope_idx
  on public.phase9_bridge_items(workspace_id,bridge_run_id);

create trigger phase9_finding_review_decisions_immutable
  before update or delete on public.phase9_finding_review_decisions
  for each row execute function public.reject_phase9_immutable_mutation();
create trigger phase9_bridge_runs_immutable
  before update or delete on public.phase9_bridge_runs
  for each row execute function public.reject_phase9_immutable_mutation();
create trigger phase9_bridge_items_immutable
  before update or delete on public.phase9_bridge_items
  for each row execute function public.reject_phase9_immutable_mutation();

alter table public.phase9_finding_review_decisions enable row level security;
alter table public.phase9_bridge_runs enable row level security;
alter table public.phase9_bridge_items enable row level security;

create policy phase9_finding_review_decisions_select
  on public.phase9_finding_review_decisions for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy phase9_bridge_runs_select
  on public.phase9_bridge_runs for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
create policy phase9_bridge_items_select
  on public.phase9_bridge_items for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.phase9_finding_review_decisions,public.phase9_bridge_runs,
  public.phase9_bridge_items to authenticated;

create or replace function public.record_phase9_finding_review(
  p_workspace_id uuid,
  p_evaluation_run_id uuid,
  p_candidate_hash text,
  p_decision text,
  p_note text default '',
  p_corrections jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_prior uuid;
  v_allowed_categories text[] := array[
    'mandatory_form','submission_deadline','question_deadline','signature','initials',
    'acknowledgment','addendum_acknowledgment','insurance','bond','certification','license',
    'attestation','attachment','staffing_plan','resume','meeting','pre_bid_conference',
    'site_visit','pricing_form','technical_response','reference','subcontractor_disclosure',
    'packaging_requirement','delivery_method','electronic_submission','physical_submission',
    'copy_count','file_format','naming_requirement','other_material_requirement'
  ];
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace reviewer required';
  end if;
  if p_decision not in ('accepted','rejected','needs_follow_up') then
    raise exception 'invalid phase9 review decision';
  end if;
  if p_decision <> 'accepted' and char_length(trim(coalesce(p_note,''))) < 5 then
    raise exception 'rejection or follow-up requires a reason';
  end if;
  if not exists (
    select 1 from public.phase9_findings
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
      and candidate_hash=p_candidate_hash
  ) then raise exception 'phase9 finding not found in workspace'; end if;
  if jsonb_typeof(coalesce(p_corrections,'{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(coalesce(p_corrections,'{}'::jsonb)) key
      where key not in ('title','category','mandatoryClass')
    )
  then raise exception 'invalid phase9 review corrections'; end if;
  if p_decision <> 'accepted' and coalesce(p_corrections,'{}'::jsonb) <> '{}'::jsonb then
    raise exception 'corrections require accepted source assessment';
  end if;
  if p_corrections ? 'title' and (
    jsonb_typeof(p_corrections->'title') <> 'string'
    or char_length(trim(p_corrections->>'title')) not between 1 and 500
  ) then raise exception 'invalid corrected title'; end if;
  if p_corrections ? 'category' and not ((p_corrections->>'category') = any(v_allowed_categories))
  then raise exception 'invalid corrected category'; end if;
  if p_corrections ? 'mandatoryClass'
    and p_corrections->>'mandatoryClass' not in ('mandatory','optional','uncertain')
  then raise exception 'invalid corrected mandatory class'; end if;

  select id into v_prior from public.phase9_finding_review_decisions
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    and candidate_hash=p_candidate_hash
  order by created_at desc,id desc limit 1;

  insert into public.phase9_finding_review_decisions(
    workspace_id,evaluation_run_id,candidate_hash,reviewer_id,decision,note,
    corrections,prior_decision_id,review_version
  ) values (
    p_workspace_id,p_evaluation_run_id,p_candidate_hash,v_actor,p_decision,
    left(coalesce(p_note,''),4000),coalesce(p_corrections,'{}'::jsonb),v_prior,
    'phase9-finding-review-v1'
  ) returning id into v_id;

  insert into public.audit_events(
    workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
  ) values (
    p_workspace_id,'user',v_actor,'verification_reviewed','phase9_finding',v_id,
    jsonb_build_object(
      'evaluation_run_id',p_evaluation_run_id,'candidate_hash',p_candidate_hash,
      'decision',p_decision,'prior_decision_id',v_prior,'review_version','phase9-finding-review-v1'
    )
  );
  return v_id;
end $$;

revoke all on function public.record_phase9_finding_review(
  uuid,uuid,text,text,text,jsonb
) from public,anon;
grant execute on function public.record_phase9_finding_review(
  uuid,uuid,text,text,text,jsonb
) to authenticated;

create or replace function public.publish_phase9_reviewed_findings(
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
  v_count integer;
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
  if v_role <> 'owner' then raise exception 'workspace owner required to publish requirements'; end if;

  select * into v_run from public.phase9_evaluation_runs
    where id=p_evaluation_run_id and workspace_id=p_workspace_id;
  if not found or v_run.status <> 'completed' then
    raise exception 'completed phase9 evaluation run required';
  end if;

  select document_id into v_primary_document_id
  from public.phase9_evaluation_documents
  where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
  order by ordinal limit 1;
  if v_primary_document_id is null then raise exception 'phase9 document binding missing'; end if;

  with latest as (
    select distinct on (candidate_hash) id,candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=p_workspace_id and evaluation_run_id=p_evaluation_run_id
    order by candidate_hash,created_at desc,id desc
  ), accepted as (
    select l.id,l.candidate_hash
    from latest l join public.phase9_findings f
      on f.evaluation_run_id=p_evaluation_run_id and f.candidate_hash=l.candidate_hash
    where l.decision='accepted'
      and f.workspace_id=p_workspace_id
      and f.machine_only=true
      and f.source_support_status='supported'
      and f.precedence_status='active'
      and jsonb_array_length(f.evidence_block_hashes)>0
  )
  select count(*),
    string_agg(id::text||':'||candidate_hash,',' order by candidate_hash)
  into v_count,v_input_material from accepted;
  if v_count=0 then raise exception 'no accepted publishable phase9 findings'; end if;

  v_input_hash := encode(
    extensions.digest(
      convert_to(
        'phase9-reviewed-bridge-v1:'||p_evaluation_run_id::text||':'||v_input_material,
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
      l.id review_id,l.note,l.corrections,
      f.candidate_hash,f.source_support_status,f.precedence_status,f.proof_requirement,
      f.evidence_block_hashes,
      s.requirement_type,s.obligation_text,s.evidence_text,s.material_facts,
      c.source_document_id,c.page_number
    from latest l
    join public.phase9_findings f
      on f.evaluation_run_id=p_evaluation_run_id and f.candidate_hash=l.candidate_hash
    join public.phase9_candidate_seeds s
      on s.evaluation_run_id=p_evaluation_run_id and s.candidate_hash=f.candidate_hash
    join public.phase9_source_block_coverage c
      on c.evaluation_run_id=p_evaluation_run_id
      and c.block_hash=(f.evidence_block_hashes->>0)
    where l.decision='accepted' and f.workspace_id=p_workspace_id
      and f.source_support_status='supported' and f.precedence_status='active'
    order by f.candidate_hash
  loop
    select id,text into v_page_id,v_page_text from public.document_pages
      where workspace_id=p_workspace_id and document_id=r.source_document_id
        and page_number=r.page_number
      order by created_at desc limit 1;
    if v_page_id is null or r.page_number is null then
      raise exception 'published phase9 evidence page missing:%',r.candidate_hash;
    end if;
    v_quote := r.evidence_text;
    v_quote_normalized := regexp_replace(trim(v_quote),E'\\s+',' ','g');
    v_page_normalized := regexp_replace(trim(v_page_text),E'\\s+',' ','g');
    if char_length(v_quote)=0 then
      raise exception 'published phase9 evidence quote empty:%',r.candidate_hash;
    elsif position(v_quote in v_page_text)>0 then v_match_type := 'exact';
    elsif position(v_quote_normalized in v_page_normalized)>0 then
      v_match_type := 'normalized_exact';
    else raise exception 'published phase9 evidence quote not found:%',r.candidate_hash;
    end if;

    v_title := coalesce(
      nullif(trim(r.corrections->>'title'),''),
      left(regexp_replace(trim(r.obligation_text),E'\\s+',' ','g'),500)
    );
    v_category := coalesce(
      nullif(r.corrections->>'category',''),
      case
        when lower(r.requirement_type)='deadline'
          and lower(r.obligation_text) ~ '(question|inquir)' then 'question_deadline'
        when lower(r.requirement_type)='deadline' then 'submission_deadline'
        when lower(r.requirement_type)='form' or r.material_facts->>'formReference' is not null
          then case when lower(r.obligation_text) ~ '(price|pricing|cost)'
            then 'pricing_form' else 'mandatory_form' end
        when lower(r.requirement_type)='signature' then 'signature'
        when lower(r.requirement_type)='insurance' then 'insurance'
        when lower(r.requirement_type)='license' then 'license'
        when lower(r.requirement_type)='staffing' then 'staffing_plan'
        when lower(r.requirement_type)='meeting' then 'meeting'
        when lower(r.requirement_type)='attachment' then 'attachment'
        when lower(r.requirement_type)='pricing' then 'pricing_form'
        when lower(r.obligation_text) ~ '\mbond\M' then 'bond'
        when lower(r.obligation_text) ~ '\m(certification|certificate)\M' then 'certification'
        else 'other_material_requirement'
      end
    );
    v_mandatory := coalesce(
      nullif(r.corrections->>'mandatoryClass',''),
      case when lower(r.obligation_text) ~ '\m(must|shall|required|mandatory)\M'
        then 'mandatory' else 'uncertain' end
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
      'Published after human acceptance of source-grounded Phase 9 finding '||r.candidate_hash||'.',
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

  insert into public.audit_events(
    workspace_id,actor_type,actor_id,event_type,entity_type,entity_id,payload
  ) values (
    p_workspace_id,'user',v_actor,'verification_completed','phase9_bridge_run',v_bridge_run_id,
    jsonb_build_object(
      'evaluation_run_id',p_evaluation_run_id,'analysis_run_id',v_analysis_run_id,
      'verification_run_id',v_verification_run_id,'published_count',v_count,
      'input_hash',v_input_hash,'bridge_version','phase9-reviewed-bridge-v1'
    )
  );
  return jsonb_build_object(
    'bridgeRunId',v_bridge_run_id,'analysisRunId',v_analysis_run_id,
    'verificationRunId',v_verification_run_id,'publishedCount',v_count,'reused',false
  );
end $$;

revoke all on function public.publish_phase9_reviewed_findings(uuid,uuid)
  from public,anon;
grant execute on function public.publish_phase9_reviewed_findings(uuid,uuid)
  to authenticated;
