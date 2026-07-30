import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000044_phase9_legacy_summary_scope.sql'),
  'utf8',
);

describe('Phase 9 legacy summary compatibility scope', () => {
  it('preserves the old RPC behind the bounded scope contract', () => {
    expect(migration).toContain('get_phase9_review_summary_scoped_inner_v1');
    expect(migration).toContain("'app.phase9_review_workspace_id'");
    expect(migration).toContain("'app.phase9_review_run_id'");
    expect(migration).toContain("set enable_nestloop='off'");
    expect(migration).toContain('authorized workspace member required');
  });
});
