-- Phase 3: hybrid chunk search + service-role embedding insert helper.
-- Target: RFP demo (uxmxkdjschbekkbnweby) ONLY.
-- Workspace/analysis-run filters are mandatory; RLS still applies for INVOKER search.

create or replace function public.search_chunks_hybrid(
  p_workspace_id uuid,
  p_analysis_run_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table (
  chunk_id uuid,
  page_number integer,
  chunk_index integer,
  text text,
  text_sha256 text,
  fts_rank real,
  trgm_sim real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    c.page_number,
    c.chunk_index,
    c.text,
    c.text_sha256,
    coalesce(ts_rank_cd(c.fts, plainto_tsquery('english', coalesce(p_query, ''))), 0)::real as fts_rank,
    coalesce(similarity(c.text, coalesce(p_query, '')), 0)::real as trgm_sim
  from public.document_chunks c
  where c.workspace_id = p_workspace_id
    and c.analysis_run_id = p_analysis_run_id
    and length(trim(coalesce(p_query, ''))) > 0
    and (
      c.fts @@ plainto_tsquery('english', p_query)
      or c.text % p_query
      or c.text ilike '%' || p_query || '%'
    )
  order by (
    0.7 * coalesce(ts_rank_cd(c.fts, plainto_tsquery('english', p_query)), 0)
    + 0.3 * coalesce(similarity(c.text, p_query), 0)
  ) desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.search_chunks_hybrid(uuid, uuid, text, integer) from public;
grant execute on function public.search_chunks_hybrid(uuid, uuid, text, integer)
  to authenticated, service_role;

-- Service-role only: cast text vector literal into extensions.vector reliably.
create or replace function public.insert_chunk_embedding(
  p_workspace_id uuid,
  p_analysis_run_id uuid,
  p_chunk_id uuid,
  p_model text,
  p_dimensions integer,
  p_embedding text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'insert_chunk_embedding is service_role only';
  end if;

  insert into public.chunk_embeddings (
    workspace_id, analysis_run_id, chunk_id, model, dimensions, embedding
  ) values (
    p_workspace_id,
    p_analysis_run_id,
    p_chunk_id,
    p_model,
    p_dimensions,
    p_embedding::extensions.vector
  )
  on conflict (chunk_id) do update
    set model = excluded.model,
        dimensions = excluded.dimensions,
        embedding = excluded.embedding
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_chunk_embedding(uuid, uuid, uuid, text, integer, text) from public;
grant execute on function public.insert_chunk_embedding(uuid, uuid, uuid, text, integer, text)
  to service_role;
