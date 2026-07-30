import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000054_phase9_dashboard_direct_scope.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
