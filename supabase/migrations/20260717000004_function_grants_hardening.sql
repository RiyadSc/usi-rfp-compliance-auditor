-- Migration 0004: tighten function EXECUTE grants (security advisor findings).
-- Default Postgres privileges grant EXECUTE to PUBLIC on new functions, which
-- exposed them to the anon role via PostgREST RPC. Additive hardening only.

-- Trigger functions must not be callable via RPC by anyone.
revoke all on function public.handle_workspace_created() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.reject_audit_event_mutation() from public, anon, authenticated;

-- Membership check and audit RPC: signed-in users only (defense in depth;
-- record_audit_event already rejects null auth.uid()).
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

revoke all on function public.record_audit_event(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.record_audit_event(uuid, text, text, uuid, jsonb) to authenticated;

-- Prevent future functions from defaulting to PUBLIC execute in this schema.
alter default privileges in schema public revoke execute on functions from public;
