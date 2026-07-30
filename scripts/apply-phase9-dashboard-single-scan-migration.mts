import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000049_phase9_dashboard_single_scan.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
