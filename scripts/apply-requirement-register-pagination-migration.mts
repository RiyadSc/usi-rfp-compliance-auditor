import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000052_requirement_register_pagination.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
