-- Cross-workspace and cross-document hardening for nested normalized evidence.
-- Additive constraints only; no content mutation. One transactional DO block
-- also permits deterministic application through the repository migration tool.

do $scope_hardening$
begin
  execute 'create unique index if not exists analysis_runs_id_workspace_large_document_uq on public.analysis_runs(id, workspace_id)';
  execute 'create unique index if not exists normalized_sections_id_workspace_document_uq on public.normalized_sections(id, workspace_id, source_document_id)';

  alter table public.normalized_sections drop constraint if exists normalized_sections_parent_section_id_fkey;
  if not exists (select 1 from pg_constraint where conname='normalized_sections_parent_scoped_fkey') then
    alter table public.normalized_sections add constraint normalized_sections_parent_scoped_fkey
      foreign key(parent_section_id,workspace_id,source_document_id)
      references public.normalized_sections(id,workspace_id,source_document_id) on delete restrict;
  end if;

  alter table public.normalized_blocks drop constraint if exists normalized_blocks_section_id_workspace_id_fkey;
  if not exists (select 1 from pg_constraint where conname='normalized_blocks_section_scoped_fkey') then
    alter table public.normalized_blocks add constraint normalized_blocks_section_scoped_fkey
      foreign key(section_id,workspace_id,source_document_id)
      references public.normalized_sections(id,workspace_id,source_document_id) on delete restrict;
  end if;

  alter table public.normalized_blocks drop constraint if exists normalized_blocks_parent_block_id_fkey;
  if not exists (select 1 from pg_constraint where conname='normalized_blocks_parent_scoped_fkey') then
    alter table public.normalized_blocks add constraint normalized_blocks_parent_scoped_fkey
      foreign key(parent_block_id,workspace_id,source_document_id)
      references public.normalized_blocks(id,workspace_id,source_document_id) on delete restrict;
  end if;

  alter table public.normalized_tables drop constraint if exists normalized_tables_continuation_of_table_id_fkey;
  if not exists (select 1 from pg_constraint where conname='normalized_tables_continuation_scoped_fkey') then
    alter table public.normalized_tables add constraint normalized_tables_continuation_scoped_fkey
      foreign key(continuation_of_table_id,workspace_id,source_document_id)
      references public.normalized_tables(id,workspace_id,source_document_id) on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname='large_document_jobs_analysis_run_scoped_fkey') then
    alter table public.large_document_jobs add constraint large_document_jobs_analysis_run_scoped_fkey
      foreign key(analysis_run_id,workspace_id) references public.analysis_runs(id,workspace_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='analysis_cost_estimates_analysis_run_scoped_fkey') then
    alter table public.analysis_cost_estimates add constraint analysis_cost_estimates_analysis_run_scoped_fkey
      foreign key(analysis_run_id,workspace_id) references public.analysis_runs(id,workspace_id) on delete restrict;
  end if;
end
$scope_hardening$;
