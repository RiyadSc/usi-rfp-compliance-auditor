-- Evidence expansion starts from the immutable block hashes named by each
-- finding. Put that join key first so PostgreSQL performs one narrow lookup
-- instead of rescanning every block in the run for every finding.

create index if not exists phase9_source_coverage_block_lookup_idx
  on public.phase9_source_block_coverage(
    block_hash,evaluation_run_id,workspace_id
  )
  include (
    source_document_id,source_document_key,page_number,sheet_name,cell_range,route
  );

analyze public.phase9_source_block_coverage;
