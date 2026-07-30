import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000042_phase9_evidence_block_lookup.sql'),
  'utf8',
);

describe('Phase 9 evidence-block lookup', () => {
  it('indexes the immutable evidence key before run and workspace filters', () => {
    expect(migration).toContain(
      'on public.phase9_source_block_coverage(\n    block_hash,evaluation_run_id,workspace_id',
    );
    expect(migration).toContain('include (');
    expect(migration).toContain('analyze public.phase9_source_block_coverage');
  });
});
