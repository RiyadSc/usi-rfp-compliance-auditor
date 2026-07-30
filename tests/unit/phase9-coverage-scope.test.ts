import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000040_phase9_coverage_scope.sql'),
  'utf8',
);

describe('Phase 9 page-coverage scoping', () => {
  it('scopes every expensive coverage population before expansion', () => {
    expect(migration).toContain('with seed_blocks as');
    expect(migration).toContain('finding_blocks as');
    expect(migration).toContain('coverage_state as');
    expect(migration).toContain('expected_pages as');
    expect(migration.match(/app\.phase9_review_workspace_id/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration.match(/app\.phase9_review_run_id/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('preserves the outer batch authorization contract', () => {
    expect(migration).toContain('authorized workspace reviewer required');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('public.record_phase9_review_batch(');
  });
});
