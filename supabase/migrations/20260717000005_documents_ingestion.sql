-- Migration 0005: document ingestion (upload intents, documents, pages, parse runs)
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY. Additive except for one
-- deliberate tightening: direct client storage INSERT/DELETE policies are
-- removed (uploads flow only through server-issued signed upload URLs and
-- privileged deletion paths).
-- Tenant isolation: every table carries workspace_id; RLS enabled here.
-- Trusted state rule: ordinary users get SELECT only. All writes (intents
-- excepted) happen via the service-role/worker path, so clients can never
-- set processing state, hashes, page text, or parser metadata.

-- ---------------------------------------------------------------------------
-- upload_intents
-- ---------------------------------------------------------------------------
create table if not exists public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  object_key text not null unique,
  original_filename text not null,
  normalized_filename text not null,
  declared_mime text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  document_type text not null default 'primary_rfp' check (document_type in
    ('primary_rfp', 'addendum', 'attachment', 'proposal_draft', 'reference')),
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_upload_intents_workspace on public.upload_intents (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  upload_intent_id uuid references public.upload_intents (id),
  created_by uuid not null references auth.users (id),
  document_type text not null default 'primary_rfp' check (document_type in
    ('primary_rfp', 'addendum', 'attachment', 'proposal_draft', 'reference')),
  original_filename text not null,
  normalized_filename text not null,
  mime_type text not null,
  object_key text not null unique,
  size_bytes bigint,
  sha256 text,
  status text not null default 'uploaded' check (status in
    ('uploaded', 'validating', 'validated', 'parsing', 'parsed', 'failed', 'rejected', 'deleted')),
  error_category text check (error_category in
    ('invalid_magic_bytes', 'oversized', 'duplicate', 'encrypted_pdf', 'malformed_pdf',
     'page_limit_exceeded', 'parse_timeout', 'parser_error', 'storage_error', 'internal_error')),
  page_count integer check (page_count >= 0),
  parser_name text,
  parser_version text,
  warnings jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_workspace on public.documents (workspace_id, created_at desc);
create index if not exists idx_documents_sha256 on public.documents (workspace_id, sha256) where deleted_at is null;

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- parse_runs (stage records for validate/parse; idempotency + observability)
-- ---------------------------------------------------------------------------
create table if not exists public.parse_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  stage text not null check (stage in ('validate', 'parse')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  attempt integer not null default 1 check (attempt >= 1),
  job_id text,
  parser_name text,
  parser_version text,
  error_category text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_parse_runs_document on public.parse_runs (document_id, stage, created_at desc);
-- Duplicate-delivery safety: at most one successful record per document+stage.
create unique index if not exists uq_parse_runs_succeeded
  on public.parse_runs (document_id, stage) where status = 'succeeded';

-- ---------------------------------------------------------------------------
-- document_pages
-- ---------------------------------------------------------------------------
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parse_run_id uuid not null references public.parse_runs (id),
  page_number integer not null check (page_number >= 1),
  pdf_page_index integer not null check (pdf_page_index >= 0),
  text text not null default '',
  text_sha256 text not null,
  char_count integer not null default 0 check (char_count >= 0),
  extraction_status text not null check (extraction_status in ('ok', 'empty', 'error')),
  warnings jsonb not null default '[]'::jsonb,
  parser_name text not null,
  parser_version text not null,
  created_at timestamptz not null default now()
);

-- Idempotency: a duplicate parse cannot create duplicate pages.
create unique index if not exists uq_document_pages_number
  on public.document_pages (document_id, page_number);
create index if not exists idx_document_pages_workspace on public.document_pages (workspace_id);

-- ---------------------------------------------------------------------------
-- audit event types for documents
-- ---------------------------------------------------------------------------
alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'workspace_created', 'workspace_updated', 'workspace_archived',
  'document_uploaded', 'document_validated', 'document_parsed',
  'document_rejected', 'document_parse_failed', 'document_deleted',
  'analysis_started', 'analysis_completed', 'analysis_failed',
  'requirement_reviewed', 'checklist_item_updated', 'finding_resolved',
  'export_generated', 'demo_reset'
));

-- ---------------------------------------------------------------------------
-- Row Level Security: members read; nobody writes via client APIs.
-- ---------------------------------------------------------------------------
alter table public.upload_intents enable row level security;
alter table public.documents enable row level security;
alter table public.parse_runs enable row level security;
alter table public.document_pages enable row level security;

-- upload_intents: members may read their workspace's intents. INSERT is
-- server-action-created but runs under the user's session: allow insert only
-- for self + membership. No update/delete for users (single-use marking is a
-- privileged transition).
drop policy if exists upload_intents_select on public.upload_intents;
create policy upload_intents_select on public.upload_intents
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists upload_intents_insert on public.upload_intents;
create policy upload_intents_insert on public.upload_intents
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_workspace_member(workspace_id))
  );

-- documents / parse_runs / document_pages: SELECT only for members.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists parse_runs_select on public.parse_runs;
create policy parse_runs_select on public.parse_runs
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists document_pages_select on public.document_pages;
create policy document_pages_select on public.document_pages
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------------------
-- Storage tightening: uploads only via server-issued signed upload URLs;
-- deletion only via privileged server path. Member SELECT remains for
-- signed-download/viewer access.
-- ---------------------------------------------------------------------------
drop policy if exists workspace_documents_insert on storage.objects;
drop policy if exists workspace_documents_delete on storage.objects;
