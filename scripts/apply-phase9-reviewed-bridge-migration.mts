import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
const MIGRATIONS = [
  {
    version: '20260727000029',
    name: 'phase9_reviewed_bridge',
    path: resolve('supabase/migrations/20260727000029_phase9_reviewed_bridge.sql'),
  },
  {
    version: '20260727000030',
    name: 'phase9_bridge_completion_guard',
    path: resolve('supabase/migrations/20260727000030_phase9_bridge_completion_guard.sql'),
  },
  {
    version: '20260727000031',
    name: 'phase9_coverage_exception_reviews',
    path: resolve('supabase/migrations/20260727000031_phase9_coverage_exception_reviews.sql'),
  },
  {
    version: '20260727000032',
    name: 'phase9_bridge_reuse_guard',
    path: resolve('supabase/migrations/20260727000032_phase9_bridge_reuse_guard.sql'),
  },
] as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !databaseUrl) throw new Error('phase9_bridge_migration_runtime_missing');
if (new URL(supabaseUrl).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_bridge_migration_project_mismatch');

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const project = await client.query<{ current_database: string; server_addr: string | null }>(
    'select current_database(),inet_server_addr()::text server_addr',
  );
  for (const migration of MIGRATIONS) {
    const sql = await readFile(migration.path, 'utf8');
    const existing = await client.query<{ version: string; name: string }>(
      'select version,name from supabase_migrations.schema_migrations where version=$1',
      [migration.version],
    );
    if (existing.rows.length) {
      if (existing.rows[0]?.name !== migration.name)
        throw new Error('phase9_bridge_migration_identity_mismatch');
      console.info(
        JSON.stringify({
          projectRef: PROJECT_REF,
          database: project.rows[0]?.current_database,
          version: migration.version,
          status: 'already_applied',
        }),
      );
    } else {
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
          [migration.version, migration.name, [sql]],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
      console.info(
        JSON.stringify({
          projectRef: PROJECT_REF,
          database: project.rows[0]?.current_database,
          version: migration.version,
          status: 'applied',
        }),
      );
    }
  }
} finally {
  await client.end();
}
