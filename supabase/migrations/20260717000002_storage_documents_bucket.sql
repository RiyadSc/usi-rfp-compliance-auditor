-- Migration 0002: private storage bucket for workspace documents
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY. Additive; no destructive operations.
-- Access model: object keys are namespaced as <workspace_id>/<...>; policies
-- derive authorization from workspace MEMBERSHIP of the path's first segment
-- (not from trusting the client-supplied path itself: a non-member simply
-- fails the membership check for that workspace_id).

insert into storage.buckets (id, name, public)
values ('workspace-documents', 'workspace-documents', false)
on conflict (id) do nothing;

-- Read: only members of the workspace encoded in the object path.
drop policy if exists workspace_documents_select on storage.objects;
create policy workspace_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-documents'
    and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

-- Upload: only members may write into their workspace prefix.
drop policy if exists workspace_documents_insert on storage.objects;
create policy workspace_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-documents'
    and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

-- Delete: members only (needed for safe deletion/reset in Phase 2).
drop policy if exists workspace_documents_delete on storage.objects;
create policy workspace_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-documents'
    and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

-- No UPDATE policy: overwriting objects is not part of the demo flow;
-- replacement is delete + re-upload, which keeps audit semantics simple.
