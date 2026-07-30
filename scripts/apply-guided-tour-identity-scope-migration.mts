import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000047_guided_tour_identity_scope.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
