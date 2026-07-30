import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260730000055_phase9_publish_statement_timeout.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
