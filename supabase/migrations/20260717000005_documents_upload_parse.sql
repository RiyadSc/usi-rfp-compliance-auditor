-- Migration 0005: upload intents, documents, document_pages, processing_jobs
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY. Additive; no destructive ops.
-- Tenant isolation: every table has workspace_id + RLS from membership.
-- Ordinary users may SELECT only. Writes go through server/worker (service role).
-- Storage INSERT for authenticated is revoked; uploads use server-minted signed URLs.

-- ---------------------------------------------------------------------------
-- upload_intents
-- ---------------------------------------------------------------------------
create table if not exists public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  object_key text not null unique,
  filename_normalized text not null,
  declared_mime text not null,
  declared_byte_size bigint not null check (declared_byte_size > 0),
  status text not null default 'pending'
    check (status in ('pending', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint upload_intents_pending_expiry check (
    status <> 'pending' or expires_at > created_at
  )
);

create index if not exists idx_upload_intents_workspace
  on public.upload_intents (workspace_id, created_at desc);
create index if not exists idx_upload_intents_created_by
  on public.upload_intents (created_by, status);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  upload_intent_id uuid references public.upload_intents (id),
  document_type text not null default 'primary_rfp'
    check (document_type in (
      'primary_rfp', 'addendum', 'attachment', 'proposal_draft', 'reference', 'expected_answer'
    )),
  filename text not null,
  mime_type text not null,
  object_key text not null unique,
  sha256 text not null,
  byte_size bigint not null check (byte_size > 0),
  page_count integer,
  parse_status text not null default 'accepted'
    check (parse_status in (
      'accepted', 'parsing', 'parsed', 'failed', 'deleted'
    )),
  parse_error_category text,
  parser_name text,
  parser_version text,
  parse_run_id uuid,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Active (non-deleted) documents are unique per workspace+hash for dedup.
  constraint documents_sha256_hex check (sha256 ~ '^[a-f0-9]{64}$')
);

create unique index if not exists idx_documents_workspace_sha256_active
  on public.documents (workspace_id, sha256)
  where deleted_at is null;

create index if not exists idx_documents_workspace
  on public.documents (workspace_id, created_at desc);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- document_pages (one row per source page; empty pages still recorded)
-- ---------------------------------------------------------------------------
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  pdf_page_index integer not null check (pdf_page_index >= 0),
  text text not null default '',
  text_sha256 text not null,
  extraction_status text not null
    check (extraction_status in ('text', 'empty', 'image_only', 'failed')),
  warnings jsonb not null default '[]'::jsonb,
  parser_name text not null,
  parser_version text not null,
  parse_run_id uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, page_number),
  unique (document_id, pdf_page_index)
);

create index if not exists idx_document_pages_workspace
  on public.document_pages (workspace_id, document_id);

-- ---------------------------------------------------------------------------
-- processing_jobs (observable stage records; queue is pg-boss in pgboss schema)
-- ---------------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  stage text not null check (stage in ('validate', 'parse')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3,
  input_hash text not null,
  error_category text,
  error_detail text,
  parser_version text,
  queue_job_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, stage, input_hash)
);

create index if not exists idx_processing_jobs_workspace
  on public.processing_jobs (workspace_id, created_at desc);
create index if not exists idx_processing_jobs_document
  on public.processing_jobs (document_id, stage);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default; members SELECT only. No client writes.
-- ---------------------------------------------------------------------------
alter table public.upload_intents enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.processing_jobs enable row level security;

drop policy if exists upload_intents_select on public.upload_intents;
create policy upload_intents_select on public.upload_intents
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    deleted_at is null
    and (select public.is_workspace_member(workspace_id))
  );

drop policy if exists document_pages_select on public.document_pages;
create policy document_pages_select on public.document_pages
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists processing_jobs_select on public.processing_jobs;
create policy processing_jobs_select on public.processing_jobs
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------------------
-- Storage: revoke direct authenticated INSERT (signed uploads via service role)
-- ---------------------------------------------------------------------------
drop policy if exists workspace_documents_insert on storage.objects;

-- Keep select/delete for members (download + client cleanup of own workspace).
-- Delete still requires membership of path segment 1.

-- ---------------------------------------------------------------------------
-- pgboss schema placeholder note: worker creates/migrates via pg-boss start()
-- with schema='pgboss'. Lock down API access immediately after creation
-- (migration 0006 runs after worker first-start, or we create empty schema now).
-- ---------------------------------------------------------------------------
create schema if not exists pgboss;
revoke all on schema pgboss from public, anon, authenticated;
grant usage on schema pgboss to postgres, service_role;
alter default privileges in schema pgboss revoke all on tables from public, anon, authenticated;
alter default privileges in schema pgboss revoke all on sequences from public, anon, authenticated;
alter default privileges in schema pgboss revoke all on functions from public, anon, authenticated;
