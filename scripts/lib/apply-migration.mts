import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

export async function applyMigration(input: { migrationFile: string; expectedProjectRef: string }) {
  loadEnv({ path: resolve('.env.local'), quiet: true });
  loadEnv({ path: resolve('.env'), quiet: true });

  const match = basename(input.migrationFile).match(/^(\d{14})_(.+)\.sql$/);
  if (!match) throw new Error('repository_migration_filename_invalid');
  const [, version, name] = match;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;
  if (!supabaseUrl || !databaseUrl) throw new Error('repository_migration_runtime_missing');
  if (new URL(supabaseUrl).hostname.split('.')[0] !== input.expectedProjectRef)
    throw new Error('repository_migration_project_mismatch');

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
      [version],
    );
    if (existing.rows.length) {
      if (existing.rows[0]?.name !== name)
        throw new Error('repository_migration_identity_mismatch');
      console.info(
        JSON.stringify({
          projectRef: input.expectedProjectRef,
          database: target.rows[0]?.current_database,
          workspaceCount: Number(target.rows[0]?.workspace_count),
          phase9RunCount: Number(target.rows[0]?.phase9_run_count),
          version,
          status: 'already_applied',
        }),
      );
      return;
    }

    const sql = await readFile(resolve(input.migrationFile), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
        [version, name, [sql]],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    console.info(
      JSON.stringify({
        projectRef: input.expectedProjectRef,
        database: target.rows[0]?.current_database,
        workspaceCount: Number(target.rows[0]?.workspace_count),
        phase9RunCount: Number(target.rows[0]?.phase9_run_count),
        version,
        status: 'applied',
      }),
    );
  } finally {
    await client.end();
  }
}
