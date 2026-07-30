-- Phase 9 review RPCs are intentionally parameterized by workspace and run.
-- PostgreSQL may switch frequently called PL/pgSQL statements to a generic
-- cached plan, which can prevent those predicates from being pushed through
-- the review view and cause unrelated historical runs to be scanned. Force a
-- parameter-aware plan for the bounded review paths. Authorization, evidence,
-- review, and publication semantics remain unchanged.

alter function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) set plan_cache_mode='force_custom_plan';

alter function public.get_phase9_review_dashboard_v1(
  uuid,uuid
) set plan_cache_mode='force_custom_plan';

alter function public.get_phase9_review_activity_summary(
  uuid,uuid,uuid
) set plan_cache_mode='force_custom_plan';

alter function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) set plan_cache_mode='force_custom_plan';

alter function public.publish_phase9_reviewed_findings(
  uuid,uuid
) set plan_cache_mode='force_custom_plan';

alter function public.publish_phase9_reviewed_findings_unguarded(
  uuid,uuid
) set plan_cache_mode='force_custom_plan';
