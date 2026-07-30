import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000046_phase9_dashboard_gate_parity.sql',
  'utf8',
).toLowerCase();

describe('Phase 9 dashboard and publication-gate parity migration', () => {
  it('uses the authoritative evidence predicate for accepted findings', () => {
    for (const fragment of [
      "review_lane in ('critical','routine')",
      "source_support_status='supported'",
      "precedence_status='active'",
      "quote_match_type in ('exact','normalized_exact')",
      'page_references_complete',
      'not queue.parser_uncertain',
      'not queue.unresolved_coverage_exception',
    ])
      expect(sql).toContain(fragment);
  });

  it('fails the dashboard closed for invalid accepted or unrepresented findings', () => {
    expect(sql).toContain("'invalidaccepted',v_invalid_accepted");
    expect(sql).toContain("'unrepresentedfindings',v_unrepresented");
    expect(sql).toContain('and v_invalid_accepted=0');
    expect(sql).toContain('and v_unrepresented=0');
    expect(sql).toContain('and v_valid_accepted>0');
  });

  it('does not recommend publication when no publishable acceptance exists', () => {
    expect(sql).toContain("v_next := 'review_team_decisions'");
    expect(sql).toContain("'publicationeligible',v_publication_eligible");
  });
});
