import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000048_phase9_review_chain_compatibility.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
