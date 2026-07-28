-- A checklist may not be built from a partially reviewed live-analysis run.
-- Every finding needs a latest human decision and unresolved follow-up blocks publication.

create or replace function public.validate_phase9_bridge_review_completion()
returns trigger language plpgsql set search_path='' as $$
declare
  v_finding_count integer;
  v_reviewed_count integer;
  v_follow_up_count integer;
begin
  select count(*) into v_finding_count from public.phase9_findings
  where workspace_id=new.workspace_id and evaluation_run_id=new.evaluation_run_id;

  with latest as (
    select distinct on (candidate_hash) candidate_hash,decision
    from public.phase9_finding_review_decisions
    where workspace_id=new.workspace_id and evaluation_run_id=new.evaluation_run_id
    order by candidate_hash,created_at desc,id desc
  )
  select count(*),count(*) filter (where decision='needs_follow_up')
  into v_reviewed_count,v_follow_up_count from latest;

  if v_finding_count=0 or v_reviewed_count<>v_finding_count then
    raise exception 'all phase9 findings require a team decision before publication (% of % reviewed)',
      v_reviewed_count,v_finding_count;
  end if;
  if v_follow_up_count>0 then
    raise exception 'phase9 follow-up decisions must be resolved before publication (%)',
      v_follow_up_count;
  end if;
  return new;
end $$;

create trigger phase9_bridge_review_completion_guard
  before insert on public.phase9_bridge_runs
  for each row execute function public.validate_phase9_bridge_review_completion();

revoke all on function public.validate_phase9_bridge_review_completion()
  from public,anon,authenticated;
