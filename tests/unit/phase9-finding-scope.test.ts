import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000041_phase9_finding_scope.sql'),
  'utf8',
);

describe('Phase 9 finding-population scoping', () => {
  it('filters findings and decisions before evidence and window expansion', () => {
    expect(migration).toContain('with scope as materialized');
    expect(migration).toContain('latest_decisions as');
    expect(migration).toContain('evidence_expanded as');
    expect(migration).toContain('finding.workspace_id=scope.workspace_id');
    expect(migration).toContain('decision.workspace_id=scope.workspace_id');
  });

  it('preserves fail-closed evidence and lane precedence', () => {
    const exceptionIndex = migration.indexOf("when source_support_status<>'supported'");
    const criticalIndex = migration.indexOf("then 'critical'");
    const duplicateIndex = migration.indexOf("then 'duplicate'");
    expect(migration).toContain("evidence.quote_match_type in ('exact','normalized_exact')");
    expect(exceptionIndex).toBeGreaterThan(-1);
    expect(exceptionIndex).toBeLessThan(criticalIndex);
    expect(criticalIndex).toBeLessThan(duplicateIndex);
  });
});
