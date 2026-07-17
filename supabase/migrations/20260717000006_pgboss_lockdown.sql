-- Migration 0006: lock down pg-boss schema after worker creates tables.
-- Target: RFP demo only. Idempotent grants/revokes.
-- Queue internals must never be reachable via PostgREST anon/authenticated.

revoke all on schema pgboss from public, anon, authenticated;
grant usage on schema pgboss to postgres, service_role;

do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'pgboss'
  loop
    execute format('revoke all on table pgboss.%I from public, anon, authenticated', r.tablename);
    execute format('grant all on table pgboss.%I to postgres, service_role', r.tablename);
  end loop;
end $$;
