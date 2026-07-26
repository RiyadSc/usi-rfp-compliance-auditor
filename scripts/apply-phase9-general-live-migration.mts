import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
const VERSION = '20260726000028';
const NAME = 'phase9_general_workspace_live';
const migrationPath = resolve(
  'supabase/migrations/20260726000028_phase9_general_workspace_live.sql',
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !databaseUrl) throw new Error('phase9_migration_runtime_missing');
if (new URL(supabaseUrl).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_migration_project_mismatch');

const sql = await readFile(migrationPath, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const existing = await client.query<{ version: string; name: string }>(
    'select version,name from supabase_migrations.schema_migrations where version=$1',
    [VERSION],
  );
  if (existing.rows.length) {
    if (existing.rows[0]?.name !== NAME) throw new Error('phase9_migration_identity_mismatch');
    console.info(
      JSON.stringify({ projectRef: PROJECT_REF, version: VERSION, status: 'already_applied' }),
    );
  } else {
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
    console.info(JSON.stringify({ projectRef: PROJECT_REF, version: VERSION, status: 'applied' }));
  }
} finally {
  await client.end();
}
