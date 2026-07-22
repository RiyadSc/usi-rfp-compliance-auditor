-- Post-roadmap large-document ingestion. Additive only; no content backfill or delete.
-- Authorized development target: uxmxkdjschbekkbnweby.

alter table public.upload_intents add column if not exists source_format text not null default 'pdf'
  check (source_format in ('pdf','docx','xlsx','html','txt','image','zip_package'));
alter table public.documents add column if not exists source_format text not null default 'pdf'
  check (source_format in ('pdf','docx','xlsx','html','txt','image','zip_package'));
create unique index if not exists documents_id_workspace_large_ingestion_uq
  on public.documents(id,workspace_id);

create table public.document_sets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, set_hash text not null check(set_hash ~ '^[a-f0-9]{64}$'), classification_status text not null default 'review_required' check(classification_status in ('classified','review_required','conflicting')),
  version text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(workspace_id,set_hash,version), unique(id,workspace_id)
);
create table public.document_set_members (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_set_id uuid not null, document_id uuid not null, package_path text, member_hash text not null check(member_hash ~ '^[a-f0-9]{64}$'),
  document_role text not null check(document_role in ('main_solicitation','addendum','form','pricing_sheet','exhibit','insurance_schedule','appendix','reference','unknown')),
  classification_source text not null check(classification_source in ('explicit','deterministic','human_review','unknown')), order_index integer not null check(order_index>=0), created_at timestamptz not null default now(),
  foreign key(document_set_id,workspace_id) references public.document_sets(id,workspace_id) on delete cascade,
  foreign key(document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  unique(document_set_id,document_id), unique(id,workspace_id)
);

create table public.normalized_documents (
  id text primary key check(id ~ '^[a-f0-9]{64}$'), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_document_id uuid not null, source_format text not null check(source_format in ('pdf','docx','xlsx','html','txt','image','zip_package')),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'), parser_adapter text not null, parser_version text not null,
  normalization_version text not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), language text,
  status text not null check(status in ('completed','completed_with_warnings','failed')), statistics jsonb not null, warnings jsonb not null default '[]', created_at timestamptz not null default now(),
  foreign key(source_document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  unique(workspace_id,source_document_id,content_hash), unique(id,workspace_id), unique(id,workspace_id,source_document_id)
);
create table public.normalized_pages (
  id text primary key check(id ~ '^[a-f0-9]{64}$'), normalized_document_id text not null, workspace_id uuid not null, source_document_id uuid not null,
  physical_page_index integer not null check(physical_page_index>=0), displayed_page_label text, width numeric, height numeric,
  native_text_available boolean not null, ocr_applied boolean not null, parser_confidence numeric not null check(parser_confidence between 0 and 1),
  parser_state text not null check(parser_state in ('native','ocr','hybrid','partial','uncertain','failed')), source_artifact_id text, warnings jsonb not null default '[]', created_at timestamptz not null default now(),
  foreign key(normalized_document_id,workspace_id,source_document_id) references public.normalized_documents(id,workspace_id,source_document_id) on delete cascade,
  unique(normalized_document_id,physical_page_index), unique(id,workspace_id), unique(id,workspace_id,source_document_id)
);
create table public.normalized_sections (
  id text primary key, normalized_document_id text not null, workspace_id uuid not null, source_document_id uuid not null,
  title text not null, level integer not null check(level between 1 and 12), order_index integer not null check(order_index>=0), parent_section_id text,
  provenance jsonb not null, created_at timestamptz not null default now(),
  foreign key(normalized_document_id,workspace_id,source_document_id) references public.normalized_documents(id,workspace_id,source_document_id) on delete cascade,
  foreign key(parent_section_id) references public.normalized_sections(id) on delete restrict, unique(normalized_document_id,order_index), unique(id,workspace_id)
);
create table public.normalized_blocks (
  id text primary key check(id ~ '^[a-f0-9]{64}$'), normalized_document_id text not null, normalized_page_id text, workspace_id uuid not null, source_document_id uuid not null,
  section_id text, parent_block_id text, block_type text not null check(block_type in ('heading','paragraph','list','list_item','table','table_row','table_cell','image','caption','header','footer','page_break','unknown')),
  text text not null, normalized_text text not null, order_index integer not null check(order_index>=0), bounding_box jsonb,
  confidence numeric not null check(confidence between 0 and 1), provenance jsonb not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(normalized_document_id,workspace_id,source_document_id) references public.normalized_documents(id,workspace_id,source_document_id) on delete cascade,
  foreign key(normalized_page_id,workspace_id,source_document_id) references public.normalized_pages(id,workspace_id,source_document_id) on delete cascade,
  foreign key(section_id,workspace_id) references public.normalized_sections(id,workspace_id) on delete restrict,
  foreign key(parent_block_id) references public.normalized_blocks(id) on delete restrict,
  unique(normalized_document_id,normalized_page_id,order_index), unique(id,workspace_id), unique(id,workspace_id,source_document_id)
);
create index normalized_blocks_search_idx on public.normalized_blocks using gin(to_tsvector('english', normalized_text));

create table public.normalized_tables (
  id text primary key check(id ~ '^[a-f0-9]{64}$'), normalized_document_id text not null, normalized_page_id text, workspace_id uuid not null, source_document_id uuid not null,
  block_id text not null, title text, caption text, header_rows jsonb not null, row_count integer not null check(row_count>=0), column_count integer not null check(column_count>=0),
  bounding_box jsonb, confidence numeric not null check(confidence between 0 and 1), warnings jsonb not null default '[]', continuation_of_table_id text, repeated_header boolean not null default false, created_at timestamptz not null default now(),
  foreign key(normalized_document_id,workspace_id,source_document_id) references public.normalized_documents(id,workspace_id,source_document_id) on delete cascade,
  foreign key(normalized_page_id,workspace_id,source_document_id) references public.normalized_pages(id,workspace_id,source_document_id) on delete cascade,
  foreign key(block_id,workspace_id,source_document_id) references public.normalized_blocks(id,workspace_id,source_document_id) on delete restrict,
  foreign key(continuation_of_table_id) references public.normalized_tables(id) on delete restrict,
  unique(id,workspace_id), unique(id,workspace_id,source_document_id)
);
create table public.normalized_table_cells (
  id text primary key check(id ~ '^[a-f0-9]{64}$'), normalized_table_id text not null, workspace_id uuid not null, source_document_id uuid not null,
  row_index integer not null check(row_index>=0), column_index integer not null check(column_index>=0), row_span integer not null check(row_span>=1), column_span integer not null check(column_span>=1),
  raw_text text not null, normalized_text text not null, cell_role text not null check(cell_role in ('header','row_header','data','caption','unknown')),
  formula text, numeric_value numeric, date_value text, currency_code text, unit text, bounding_box jsonb, confidence numeric not null check(confidence between 0 and 1), provenance jsonb not null, created_at timestamptz not null default now(),
  foreign key(normalized_table_id,workspace_id,source_document_id) references public.normalized_tables(id,workspace_id,source_document_id) on delete cascade,
  unique(normalized_table_id,row_index,column_index), unique(id,workspace_id)
);

create table public.document_relationships_v2 (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_document_id uuid not null, target_document_id uuid not null, relationship_type text not null check(relationship_type in ('amends','supersedes','replaces','clarifies','references','attachment_of','conflicting','unknown')),
  evidence_block_id text, evidence_text text, assessment text not null check(assessment in ('explicit','proposed','conflicting','undetermined')),
  human_review_status text not null default 'pending' check(human_review_status in ('pending','accepted','rejected','needs_follow_up','waived')),
  policy_version text not null, created_at timestamptz not null default now(),
  foreign key(source_document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  foreign key(target_document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  foreign key(evidence_block_id,workspace_id) references public.normalized_blocks(id,workspace_id) on delete restrict,
  unique(workspace_id,source_document_id,target_document_id,relationship_type,policy_version), unique(id,workspace_id)
);

create table public.large_document_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_set_id uuid, source_document_id uuid, analysis_run_id uuid, mode text not null check(mode in ('quick_scan','standard_analysis','deep_audit')),
  status text not null check(status in ('running','completed','completed_with_warnings','failed_retryable','failed_terminal','cancelled')),
  orchestration_version text not null, input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), requested_by uuid not null references auth.users(id),
  current_stage text not null, progress_numerator integer not null default 0, progress_denominator integer not null default 0,
  retryable boolean not null default false, error_code text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
  foreign key(document_set_id,workspace_id) references public.document_sets(id,workspace_id) on delete restrict,
  foreign key(source_document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  unique(workspace_id,input_hash,orchestration_version), unique(id,workspace_id)
);
create table public.processing_stage_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, job_id uuid not null, stage text not null, stage_version text not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), status text not null check(status in ('running','completed','completed_with_warnings','failed_retryable','failed_terminal','cancelled')),
  attempt integer not null check(attempt>=1), progress_numerator integer not null default 0, progress_denominator integer not null default 0,
  error_code text, started_at timestamptz not null default now(), completed_at timestamptz, created_at timestamptz not null default now(),
  foreign key(job_id,workspace_id) references public.large_document_jobs(id,workspace_id) on delete cascade,
  unique(job_id,stage,input_hash,attempt), unique(id,workspace_id)
);
create table public.processing_work_units (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, job_id uuid not null, stage_run_id uuid not null,
  unit_type text not null check(unit_type in ('page_parse','ocr','table_extract','block_classify','candidate_extract','evidence_index','verification_batch')),
  unit_key text not null, version text not null, input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check(status in ('queued','leased','completed','failed_retryable','failed_terminal','cancelled','invalidated')),
  attempts integer not null default 0, max_attempts integer not null default 3, lease_owner text, lease_expires_at timestamptz,
  last_error_code text, completion_artifact jsonb, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
  foreign key(job_id,workspace_id) references public.large_document_jobs(id,workspace_id) on delete cascade,
  foreign key(stage_run_id,workspace_id) references public.processing_stage_runs(id,workspace_id) on delete cascade,
  unique(job_id,stage_run_id,unit_type,unit_key,input_hash,version), unique(id,workspace_id)
);
create index processing_work_units_claim_idx on public.processing_work_units(status,lease_expires_at,created_at);

create table public.analysis_cache_entries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cache_key text not null check(cache_key ~ '^[a-f0-9]{64}$'), artifact_type text not null, source_document_id uuid,
  stage text not null, status text not null check(status in ('completed','completed_with_warnings','incomplete','failed','invalidated')),
  artifact_ref jsonb not null, provenance jsonb not null, dependency_hash text not null check(dependency_hash ~ '^[a-f0-9]{64}$'),
  invalidated_at timestamptz, created_at timestamptz not null default now(),
  foreign key(source_document_id,workspace_id) references public.documents(id,workspace_id) on delete restrict,
  unique(workspace_id,cache_key), unique(id,workspace_id)
);
create table public.analysis_artifact_dependencies (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, cache_entry_id uuid not null,
  dependency_type text not null, dependency_key text not null, dependency_hash text not null check(dependency_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
  foreign key(cache_entry_id,workspace_id) references public.analysis_cache_entries(id,workspace_id) on delete cascade,
  unique(cache_entry_id,dependency_type,dependency_key,dependency_hash), unique(id,workspace_id)
);
create table public.analysis_cache_invalidations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, cache_entry_id uuid not null, reason text not null,
  changed_dependency_type text not null, previous_hash text, current_hash text, invalidated_by uuid references auth.users(id), created_at timestamptz not null default now(),
  foreign key(cache_entry_id,workspace_id) references public.analysis_cache_entries(id,workspace_id) on delete restrict,
  unique(id,workspace_id)
);
create table public.analysis_cost_estimates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, job_id uuid, analysis_run_id uuid,
  mode text not null check(mode in ('quick_scan','standard_analysis','deep_audit')), estimator_version text not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), expected_low_usd numeric not null check(expected_low_usd>=0), expected_high_usd numeric not null check(expected_high_usd>=expected_low_usd),
  hard_maximum_usd numeric not null check(hard_maximum_usd>=expected_high_usd), estimated_calls_low integer not null, estimated_calls_high integer not null,
  estimated_time_ms bigint not null, largest_cost_stage text not null, stage_estimates jsonb not null, pricing_version text not null,
  execution_allowed boolean not null, block_reason text, created_at timestamptz not null default now(),
  foreign key(job_id,workspace_id) references public.large_document_jobs(id,workspace_id) on delete restrict,
  unique(workspace_id,input_hash,estimator_version,pricing_version), unique(id,workspace_id)
);

create or replace function public.claim_large_document_work_unit(p_workspace_id uuid,p_worker_id text,p_lease_seconds integer default 120)
returns setof public.processing_work_units language plpgsql security definer set search_path='' as $$
begin
  if p_lease_seconds < 15 or p_lease_seconds > 900 then raise exception 'invalid lease'; end if;
  return query
  with candidate as (
    select id from public.processing_work_units
    where workspace_id=p_workspace_id and attempts<max_attempts and
      (status in ('queued','failed_retryable') or (status='leased' and lease_expires_at<=now()))
    order by created_at for update skip locked limit 1
  )
  update public.processing_work_units u set status='leased',lease_owner=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),attempts=u.attempts+1,started_at=coalesce(u.started_at,now())
  from candidate where u.id=candidate.id returning u.*;
end $$;
revoke all on function public.claim_large_document_work_unit(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_large_document_work_unit(uuid,text,integer) to service_role;

alter table public.document_sets enable row level security; alter table public.document_set_members enable row level security;
alter table public.normalized_documents enable row level security; alter table public.normalized_pages enable row level security; alter table public.normalized_sections enable row level security; alter table public.normalized_blocks enable row level security; alter table public.normalized_tables enable row level security; alter table public.normalized_table_cells enable row level security;
alter table public.document_relationships_v2 enable row level security; alter table public.large_document_jobs enable row level security; alter table public.processing_stage_runs enable row level security; alter table public.processing_work_units enable row level security;
alter table public.analysis_cache_entries enable row level security; alter table public.analysis_artifact_dependencies enable row level security; alter table public.analysis_cache_invalidations enable row level security; alter table public.analysis_cost_estimates enable row level security;

do $$ declare t text; begin foreach t in array array['document_sets','document_set_members','normalized_documents','normalized_pages','normalized_sections','normalized_blocks','normalized_tables','normalized_table_cells','document_relationships_v2','large_document_jobs','processing_stage_runs','processing_work_units','analysis_cache_entries','analysis_artifact_dependencies','analysis_cache_invalidations','analysis_cost_estimates'] loop execute format('create policy %I on public.%I for select to authenticated using ((select public.is_workspace_member(workspace_id)))',t||'_select',t); end loop; end $$;
grant select on public.document_sets,public.document_set_members,public.normalized_documents,public.normalized_pages,public.normalized_sections,public.normalized_blocks,public.normalized_tables,public.normalized_table_cells,public.document_relationships_v2,public.large_document_jobs,public.processing_stage_runs,public.processing_work_units,public.analysis_cache_entries,public.analysis_artifact_dependencies,public.analysis_cache_invalidations,public.analysis_cost_estimates to authenticated;
