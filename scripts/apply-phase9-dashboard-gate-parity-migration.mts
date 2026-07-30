import { applyMigration } from './lib/apply-migration.mts';

await applyMigration({
  migrationFile: 'supabase/migrations/20260729000046_phase9_dashboard_gate_parity.sql',
  expectedProjectRef: 'uxmxkdjschbekkbnweby',
});
