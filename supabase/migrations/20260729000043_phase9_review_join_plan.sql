-- Evidence blocks are expanded as a set. With large runs PostgreSQL can
-- otherwise choose a nested-loop plan that rescans the scoped block population
-- once per finding. The scoped review entry points use hash/merge joins for
-- this bounded analytical workload; unrelated application queries keep their
-- normal planner settings.

alter function public.get_phase9_review_queue(
  uuid,uuid,text,text,text,integer,integer
) set enable_nestloop='off';

alter function public.get_phase9_review_dashboard_v1(
  uuid,uuid
) set enable_nestloop='off';

alter function public.get_phase9_review_activity_summary(
  uuid,uuid,uuid
) set enable_nestloop='off';

alter function public.record_phase9_review_batch_v2(
  uuid,uuid,text[],text,text,uuid,uuid
) set enable_nestloop='off';

alter function public.publish_phase9_reviewed_findings(
  uuid,uuid
) set enable_nestloop='off';

alter function public.publish_phase9_reviewed_findings_unguarded(
  uuid,uuid
) set enable_nestloop='off';
