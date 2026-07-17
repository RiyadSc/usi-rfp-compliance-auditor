-- Migration 0008: align documents SELECT with soft-delete semantics.
-- Live policy already hides deleted rows; version-control the definition.

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    deleted_at is null
    and (select public.is_workspace_member(workspace_id))
  );
