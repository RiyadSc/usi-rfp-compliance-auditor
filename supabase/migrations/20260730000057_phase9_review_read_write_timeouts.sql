-- Additional review RPCs can exceed the default API statement timeout under
-- sequential gate load. Bound timeouts without changing review semantics.

alter function public.get_phase9_review_activity_summary(uuid, uuid, uuid)
  set statement_timeout = '60s';

alter function public.get_phase9_review_queue(
  uuid, uuid, text, text, text, integer, integer
) set statement_timeout = '60s';

alter function public.record_phase9_finding_review(
  uuid, uuid, text, text, text, jsonb
) set statement_timeout = '60s';

alter function public.record_phase9_coverage_review(
  uuid, uuid, uuid, integer, text, text
) set statement_timeout = '60s';
