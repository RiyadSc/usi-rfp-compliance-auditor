import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000054_phase9_dashboard_direct_scope.sql',
  'utf8',
);

describe('Phase 9 dashboard direct scope', () => {
  it('aggregates through the direct-scoped queue plan instead of historical views', () => {
    expect(sql).toContain('get_phase9_review_queue_scoped_inner_v1');
    expect(sql).toContain("set statement_timeout='60s'");
    expect(sql).not.toContain('from public.phase9_review_queue_v1');
    expect(sql).not.toContain('from public.phase9_coverage_exception_pages_v1');
    expect(sql).toContain('where coverage.workspace_id=p_workspace_id');
    expect(sql).toContain('and coverage.evaluation_run_id=p_evaluation_run_id');
  });
});
