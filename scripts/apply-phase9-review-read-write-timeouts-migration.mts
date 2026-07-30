import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260730000057_phase9_review_read_write_timeouts.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
