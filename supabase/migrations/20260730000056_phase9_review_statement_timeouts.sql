-- Batch and accelerated review RPCs can exceed the default API statement timeout
-- under sequential gate load. Bound timeouts without changing review semantics.

alter function public.record_phase9_review_batch_v2(
  uuid, uuid, text[], text, text, uuid, uuid
) set statement_timeout = '60s';

alter function public.record_phase9_finding_review_accelerated(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) set statement_timeout = '60s';

alter function public.record_phase9_coverage_review_accelerated(
  uuid, uuid, uuid, integer, text, text, uuid, uuid
) set statement_timeout = '60s';
