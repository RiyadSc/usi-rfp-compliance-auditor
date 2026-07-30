import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000048_phase9_review_chain_compatibility.sql',
  'utf8',
).toLowerCase();
const fac115 = readFileSync('scripts/phase9-fac115-live-acceptance.mts', 'utf8');

describe('Phase 9 review-chain compatibility', () => {
  it('uses linked-list heads and strictly increasing timestamps for new decisions', () => {
    expect(sql).toContain('phase9_finding_review_single_root_idx');
    expect(sql).toContain('phase9_finding_review_single_child_idx');
    expect(sql).toContain('phase9_finding_review_unique_chronology_idx');
    expect(sql).toContain('phase9_coverage_review_single_root_idx');
    expect(sql).toContain('phase9_coverage_review_single_child_idx');
    expect(sql).toContain('phase9_coverage_review_unique_chronology_idx');
    expect(sql).toContain('phase9 review-chain migration refused: finding chronology is ambiguous');
    expect(sql).toContain(
      'phase9 review-chain migration refused: coverage chronology is ambiguous',
    );
    expect(sql.match(/where child\.prior_decision_id=decision\.id/g)).toHaveLength(4);
    expect(sql.match(/clock_timestamp\(\)/g)).toHaveLength(2);
    expect(sql.match(/interval '1 microsecond'/g)).toHaveLength(2);
  });

  it('accepts only exact legacy idempotent retries without rewriting old events', () => {
    expect(sql.match(/metadata \? 'requesthash'/g)).toHaveLength(2);
    expect(sql).toContain('accelerated finding review result identity mismatch');
    expect(sql).toContain('accelerated coverage review result identity mismatch');
    expect(sql).not.toMatch(
      /update\s+public\.phase9_(review_activity_events|finding_review_decisions|coverage_review_decisions)/,
    );
  });

  it('binds every FAC115 evaluation document before inserting coverage evidence', () => {
    const binding = fac115.indexOf("admin.from('phase9_evaluation_documents').insert");
    const coverage = fac115.indexOf("admin.from('phase9_source_block_coverage').insert");
    expect(binding).toBeGreaterThan(0);
    expect(binding).toBeLessThan(coverage);
    expect(fac115).toContain('phase9_live_acceptance_document_binding_set_mismatch');
    expect(fac115).toContain('phase9_live_acceptance_document_preflight_mismatch');
  });
});
