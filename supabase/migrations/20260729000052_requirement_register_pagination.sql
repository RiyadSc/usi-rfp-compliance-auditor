-- Bounded, authoritative Phase 4 requirement-register reads.
--
-- The register previously loaded every candidate in a verification scope and
-- sent the complete candidate/finding/decision ID populations through
-- PostgREST `in (...)` filters. Keep the visible contract unchanged while
-- scoping joins at the database boundary and returning at most one page.

create index if not exists requirement_candidates_register_scope_idx
  on public.requirement_candidates(
    workspace_id,analysis_run_id,created_at desc,id
  );

create or replace function public.get_requirement_register_v1(
  p_workspace_id uuid,
  p_verification_run_id uuid,
  p_source_status text default '',
  p_precedence_status text default '',
  p_proof_requirement text default '',
  p_category text default '',
  p_mandatory_class text default '',
  p_review_status text default '',
  p_search text default '',
  p_attention_only boolean default false,
  p_page integer default 1,
  p_page_size integer default 50
) returns jsonb
language plpgsql
security definer
set search_path=''
set plan_cache_mode='force_custom_plan'
stable
as $$
declare
  v_actor uuid := (select auth.uid());
  v_analysis_run_id uuid;
  v_search text := replace(
    replace(replace(trim(coalesce(p_search,'')),E'\\',E'\\\\'),'%','\%'),
    '_','\_'
  );
  v_result jsonb;
begin
  if v_actor is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'authorized workspace member required';
  end if;
  select verification.analysis_run_id into v_analysis_run_id
  from public.verification_runs verification
  where verification.id=p_verification_run_id
    and verification.workspace_id=p_workspace_id
    and verification.status='completed';
  if v_analysis_run_id is null then
    raise exception 'completed workspace verification run required';
  end if;
  if p_page not between 1 and 1000000
    or p_page_size not between 1 and 50
    or char_length(coalesce(p_search,''))>120
    or char_length(coalesce(p_category,''))>160
    or p_source_status not in (
      '','supported','partially_supported','unsupported','contradicted',
      'parser_uncertain'
    )
    or p_precedence_status not in (
      '','active','superseded','conflicting','undetermined'
    )
    or p_proof_requirement not in (
      '','none_identified','requires_human_confirmation',
      'requires_company_artifact','requires_external_validation','undetermined'
    )
    or p_mandatory_class not in ('','mandatory','optional','uncertain')
    or p_review_status not in (
      '','pending','accepted','rejected','needs_follow_up','waived'
    )
  then
    raise exception 'invalid requirement register request';
  end if;

  with
  scoped_candidates as materialized (
    select candidate.*
    from public.requirement_candidates candidate
    where candidate.workspace_id=p_workspace_id
      and candidate.analysis_run_id=v_analysis_run_id
  ),
  annotated as materialized (
    select
      candidate.id,
      candidate.analysis_run_id,
      candidate.category,
      candidate.title,
      candidate.obligation,
      candidate.mandatory_class,
      candidate.preliminary_page,
      candidate.document_id,
      candidate.created_at,
      document.normalized_filename document_name,
      finding.id finding_id,
      finding.source_support_status,
      finding.precedence_status,
      finding.proof_requirement,
      finding.created_at finding_created_at,
      finding.verification_run_id,
      coalesce(review.decision,'pending') human_review_status
    from scoped_candidates candidate
    left join public.verification_findings finding
      on finding.workspace_id=p_workspace_id
      and finding.analysis_run_id=v_analysis_run_id
      and finding.verification_run_id=p_verification_run_id
      and finding.candidate_id=candidate.id
    left join lateral (
      select decision.decision
      from public.human_review_decisions decision
      where decision.workspace_id=p_workspace_id
        and decision.finding_id=finding.id
      order by decision.created_at desc,decision.id desc
      limit 1
    ) review on true
    left join public.documents document
      on document.workspace_id=p_workspace_id
      and document.id=candidate.document_id
  ),
  filtered as materialized (
    select item.*
    from annotated item
    where (
      p_source_status='' or item.source_support_status=p_source_status
    )
      and (
        p_precedence_status=''
        or item.precedence_status=p_precedence_status
      )
      and (
        p_proof_requirement=''
        or item.proof_requirement=p_proof_requirement
      )
      and (p_category='' or item.category=p_category)
      and (
        p_mandatory_class=''
        or item.mandatory_class=p_mandatory_class
      )
      and (
        p_review_status=''
        or item.human_review_status=p_review_status
      )
      and (
        trim(coalesce(p_search,''))=''
        or item.title ilike '%'||v_search||'%' escape '\'
        or item.obligation ilike '%'||v_search||'%' escape '\'
        or item.category ilike '%'||v_search||'%' escape '\'
      )
      and (
        not p_attention_only
        or item.finding_id is null
        or item.source_support_status<>'supported'
        or item.precedence_status<>'active'
        or item.human_review_status='pending'
      )
  ),
  bounded as materialized (
    select item.*
    from filtered item
    order by item.created_at desc,item.id
    limit p_page_size
    offset ((p_page-1)*p_page_size)
  )
  select jsonb_build_object(
    'version','requirement-register-query-v1',
    'page',p_page,
    'pageSize',p_page_size,
    'total',(select count(*) from filtered),
    'summary',jsonb_build_object(
      'totalRequirements',(select count(*) from annotated),
      'needsAttention',(
        select count(*) from annotated
        where finding_id is null
          or source_support_status<>'supported'
          or precedence_status<>'active'
      ),
      'companyEvidenceRequired',(
        select count(*) from annotated
        where finding_id is not null
          and proof_requirement<>'none_identified'
      ),
      'pendingReviews',(
        select count(*) from annotated
        where human_review_status='pending'
      )
    ),
    'categories',coalesce((
      select jsonb_agg(category order by category)
      from (
        select distinct category
        from annotated
        order by category
        limit 200
      ) categories
    ),'[]'::jsonb),
    'rows',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',item.id,
          'analysisRunId',item.analysis_run_id,
          'category',item.category,
          'title',item.title,
          'obligation',item.obligation,
          'mandatoryClass',item.mandatory_class,
          'preliminaryPage',item.preliminary_page,
          'documentId',item.document_id,
          'createdAt',item.created_at,
          'documentName',item.document_name,
          'findingId',item.finding_id,
          'sourceSupportStatus',item.source_support_status,
          'precedenceStatus',item.precedence_status,
          'proofRequirement',item.proof_requirement,
          'findingCreatedAt',item.finding_created_at,
          'verificationRunId',item.verification_run_id,
          'humanReviewStatus',item.human_review_status
        )
        order by item.created_at desc,item.id
      )
      from bounded item
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_requirement_register_v1(
  uuid,uuid,text,text,text,text,text,text,text,boolean,integer,integer
) from public,anon;
grant execute on function public.get_requirement_register_v1(
  uuid,uuid,text,text,text,text,text,text,text,boolean,integer,integer
) to authenticated;
