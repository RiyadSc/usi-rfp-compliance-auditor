-- Phase 3: analysis runs, chunks, embeddings, candidates, spend ledger
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY.
-- Candidates are always unverified; no verified status writable here.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Ensure search_path can resolve vector/trgm operators for this migration
create schema if not exists extensions;

-- ---------------------------------------------------------------------------
-- analysis_runs
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'budget_exceeded')),
  stage text not null default 'extract'
    check (stage in ('index', 'extract', 'complete')),
  created_by uuid not null references auth.users (id),
  provider_name text,
  extract_model text,
  embed_model text,
  prompt_version text,
  schema_version text,
  error_category text,
  error_detail text,
  candidate_count integer check (candidate_count is null or candidate_count >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0,
  input_hash text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analysis_runs_workspace
  on public.analysis_runs (workspace_id, created_at desc);
create index if not exists idx_analysis_runs_document
  on public.analysis_runs (document_id, created_at desc);

drop trigger if exists trg_analysis_runs_updated_at on public.analysis_runs;
create trigger trg_analysis_runs_updated_at
  before update on public.analysis_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- document_chunks (page-aware; provenance preserved)
-- ---------------------------------------------------------------------------
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  char_start integer not null default 0 check (char_start >= 0),
  char_end integer not null default 0 check (char_end >= 0),
  text text not null,
  text_sha256 text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  parser_name text,
  parse_run_id uuid,
  fts tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored,
  created_at timestamptz not null default now(),
  unique (analysis_run_id, document_id, page_number, chunk_index)
);

create index if not exists idx_document_chunks_workspace
  on public.document_chunks (workspace_id);
create index if not exists idx_document_chunks_fts
  on public.document_chunks using gin (fts);
create index if not exists idx_document_chunks_trgm
  on public.document_chunks using gin (text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- chunk_embeddings
-- ---------------------------------------------------------------------------
create table if not exists public.chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  chunk_id uuid not null references public.document_chunks (id) on delete cascade unique,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chunk_embeddings_workspace
  on public.chunk_embeddings (workspace_id);
-- ivfflat/hnsw optional; for demo scale sequential + cosine is fine. Add hnsw when useful.
create index if not exists idx_chunk_embeddings_hnsw
  on public.chunk_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- requirement_candidates (ALWAYS unverified in Phase 3)
-- ---------------------------------------------------------------------------
create table if not exists public.requirement_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  category text not null,
  title text not null,
  obligation text not null,
  mandatory_class text not null
    check (mandatory_class in ('mandatory', 'optional', 'uncertain')),
  preliminary_page integer not null check (preliminary_page >= 1),
  evidence_quote text not null default '',
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  ambiguity_notes jsonb not null default '[]'::jsonb,
  status text not null default 'unverified'
    check (status = 'unverified'),
  prompt_version text not null,
  schema_version text not null,
  model_id text not null,
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_requirement_candidates_workspace
  on public.requirement_candidates (workspace_id, analysis_run_id);
create index if not exists idx_requirement_candidates_run
  on public.requirement_candidates (analysis_run_id);

-- ---------------------------------------------------------------------------
-- model_calls (provenance)
-- ---------------------------------------------------------------------------
create table if not exists public.model_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  stage text not null check (stage in ('embed', 'extract')),
  provider text not null,
  model text not null,
  provider_request_id text,
  prompt_version text,
  schema_version text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  estimated_cost_usd numeric(12, 6) not null default 0,
  status text not null check (status in ('succeeded', 'failed', 'refused', 'incomplete', 'cancelled')),
  error_category text,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_calls_run on public.model_calls (analysis_run_id);

-- ---------------------------------------------------------------------------
-- spend_ledger (application-side Phase 3 ceiling; not a substitute for account billing)
-- ---------------------------------------------------------------------------
create table if not exists public.spend_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  kind text not null check (kind in ('embed', 'extract', 'adjustment')),
  estimated_cost_usd numeric(12, 6) not null check (estimated_cost_usd >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_spend_ledger_created on public.spend_ledger (created_at desc);

-- ---------------------------------------------------------------------------
-- Audit event types for analysis
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
-- RLS: members SELECT only; writes via service role / worker
-- ---------------------------------------------------------------------------
alter table public.analysis_runs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chunk_embeddings enable row level security;
alter table public.requirement_candidates enable row level security;
alter table public.model_calls enable row level security;
alter table public.spend_ledger enable row level security;

drop policy if exists analysis_runs_select on public.analysis_runs;
create policy analysis_runs_select on public.analysis_runs
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists document_chunks_select on public.document_chunks;
create policy document_chunks_select on public.document_chunks
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists chunk_embeddings_select on public.chunk_embeddings;
create policy chunk_embeddings_select on public.chunk_embeddings
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists requirement_candidates_select on public.requirement_candidates;
create policy requirement_candidates_select on public.requirement_candidates
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists model_calls_select on public.model_calls;
create policy model_calls_select on public.model_calls
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

-- spend_ledger: no authenticated access (service role only) — intentional
-- (no SELECT policy ⇒ denied for authenticated/anon)

-- processing_jobs stage allow extract
alter table public.processing_jobs drop constraint if exists processing_jobs_stage_check;
alter table public.processing_jobs add constraint processing_jobs_stage_check
  check (stage in ('validate', 'parse', 'index', 'extract'));
