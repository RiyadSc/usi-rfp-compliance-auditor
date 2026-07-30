import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000053_phase9_review_criticality_parity.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
