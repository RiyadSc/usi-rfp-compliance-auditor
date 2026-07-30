import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000049_phase9_dashboard_single_scan.sql',
  'utf8',
).toLowerCase();

describe('Phase 9 executive dashboard single-scan aggregation', () => {
  it('materializes the scoped queue once and retains publication parity fields', () => {
    expect(sql.match(/from public\.phase9_review_queue_v1/g)).toHaveLength(1);
    expect(sql).not.toContain('get_phase9_review_dashboard_scoped_inner_v1');
    expect(sql).toContain("'invalidaccepted',invalid_accepted");
    expect(sql).toContain("'unrepresentedfindings',unrepresented_findings");
    expect(sql).toContain('and invalid_accepted=0');
    expect(sql).toContain('and unrepresented_findings=0');
    expect(sql).toContain('and valid_accepted>0');
  });

  it('keeps director priorities and page coverage separate from finding counts', () => {
    expect(sql).toContain("when unresolved_critical>0 then 'review_critical'");
    expect(sql).toContain("when unresolved_exceptions>0 then 'review_exceptions'");
    expect(sql).toContain("then 'review_coverage_exceptions'");
    expect(sql).toContain('coverage_exceptions-coverage_reviewed');
  });
});
