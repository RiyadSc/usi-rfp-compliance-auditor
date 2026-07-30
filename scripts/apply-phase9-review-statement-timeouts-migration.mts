import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260730000056_phase9_review_statement_timeouts.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
