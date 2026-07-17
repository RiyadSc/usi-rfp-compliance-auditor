-- Migration 0003: allow workspace owners to select their own workspaces.
-- Rationale: INSERT ... RETURNING evaluates the SELECT policy before the
-- AFTER INSERT membership trigger runs, so a pure membership-based SELECT
-- policy rejects the RETURNING row at creation time. Owners are always
-- members (trigger-enforced), so this does not widen effective access.
-- Additive policy replacement; no destructive operations.

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_workspace_member(id))
  );
