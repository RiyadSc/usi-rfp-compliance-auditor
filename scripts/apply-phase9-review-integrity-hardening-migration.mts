import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000045_phase9_review_integrity_hardening.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
