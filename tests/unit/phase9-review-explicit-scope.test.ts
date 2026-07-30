import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000039_phase9_review_explicit_scope.sql'),
  'utf8',
);

describe('Phase 9 explicit review scope', () => {
  it('binds queue materialization to the server-validated workspace and run', () => {
    expect(migration).toContain("'app.phase9_review_workspace_id'");
    expect(migration).toContain("'app.phase9_review_run_id'");
    expect(migration).toContain('phase9_review_queue_unscoped_v1');
    expect(migration).toContain('revoke all on public.phase9_review_queue_unscoped_v1');
  });

  it('scopes queue, dashboard, analytics, batch, and publication entry points', () => {
    expect(migration.match(/set_config\('app\.phase9_review_workspace_id'/g)).toHaveLength(5);
    expect(migration.match(/set_config\('app\.phase9_review_run_id'/g)).toHaveLength(5);
    expect(migration).toContain('get_phase9_review_queue_scoped_inner_v1');
    expect(migration).toContain('get_phase9_review_dashboard_scoped_inner_v1');
    expect(migration).toContain('get_phase9_review_activity_summary_scoped_inner_v1');
  });

  it('preserves authorization, transactional batch, and publication guards', () => {
    expect(migration).toContain('authorized workspace member required');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('assert_phase9_bridge_review_completion');
    expect(migration).toContain('publish_phase9_reviewed_findings_unguarded');
  });
});
