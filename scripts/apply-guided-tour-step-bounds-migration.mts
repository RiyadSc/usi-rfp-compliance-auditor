import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000050_guided_tour_step_bounds.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
