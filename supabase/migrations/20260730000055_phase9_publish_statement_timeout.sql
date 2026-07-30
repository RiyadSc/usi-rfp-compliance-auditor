-- Under sequential gate load, publish_phase9_reviewed_findings can exceed the
-- default API statement timeout while still completing correctly. Bound the
-- timeout explicitly on the callable wrapper without changing publish semantics.

alter function public.publish_phase9_reviewed_findings(uuid, uuid)
  set statement_timeout = '60s';
