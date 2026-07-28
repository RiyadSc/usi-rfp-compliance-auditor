import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
const VERSION = '20260728000033';
const NAME = 'phase9_review_acceleration';
const PATH = resolve('supabase/migrations/20260728000033_phase9_review_acceleration.sql');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !databaseUrl) throw new Error('phase9_review_migration_runtime_missing');
if (new URL(supabaseUrl).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_review_migration_project_mismatch');

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const target = await client.query<{
    current_database: string;
    workspace_count: string;
    phase9_run_count: string;
  }>(`
    select
      current_database(),
      (select count(*)::text from public.workspaces) workspace_count,
      (select count(*)::text from public.phase9_evaluation_runs) phase9_run_count
  `);
  const existing = await client.query<{ version: string; name: string }>(
    'select version,name from supabase_migrations.schema_migrations where version=$1',
    [VERSION],
  );
  if (existing.rows.length) {
    if (existing.rows[0]?.name !== NAME)
      throw new Error('phase9_review_migration_identity_mismatch');
    console.info(
      JSON.stringify({
        projectRef: PROJECT_REF,
        database: target.rows[0]?.current_database,
        workspaceCount: Number(target.rows[0]?.workspace_count),
        phase9RunCount: Number(target.rows[0]?.phase9_run_count),
        version: VERSION,
        status: 'already_applied',
      }),
    );
  } else {
    const sql = await readFile(PATH, 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
        [VERSION, NAME, [sql]],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    console.info(
      JSON.stringify({
        projectRef: PROJECT_REF,
        database: target.rows[0]?.current_database,
        workspaceCount: Number(target.rows[0]?.workspace_count),
        phase9RunCount: Number(target.rows[0]?.phase9_run_count),
        version: VERSION,
        status: 'applied',
      }),
    );
  }
} finally {
  await client.end();
}

