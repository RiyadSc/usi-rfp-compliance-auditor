import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20260724000026_phase9_live_recovery.sql'),
  'utf8',
);

describe('Phase 9 additive migration contract', () => {
  it('targets the approved development project and creates versioned history', () => {
    expect(sql).toContain('uxmxkdjschbekkbnweby');
    for (const table of [
      'phase9_evaluation_runs',
      'phase9_source_block_coverage',
      'phase9_candidate_seeds',
      'phase9_call_plans',
      'phase9_call_plan_tasks',
      'phase9_provider_cache',
      'phase9_provider_usage',
      'phase9_findings',
      'phase9_dependency_edges',
      'phase9_budget_reservations',
    ])
      expect(sql).toContain(`public.${table}`);
  });

  it('enforces workspace RLS and service-only exact-plan budget RPCs', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('public.is_workspace_member(workspace_id)');
    expect(sql).toContain("auth.role()),'') <> 'service_role'");
    expect(sql).toContain('phase9 exact call plan required');
    expect(sql).toContain('phase9 budget exceeded');
    expect(sql).toContain('v_spent+v_reserved+p_requested_usd>3');
    expect(sql).toContain('revoke all on function public.reserve_phase9_call_plan');
  });

  it('keeps candidates unverified and findings machine-only/review-pending', () => {
    expect(sql).toContain("check (machine_status='candidate_unverified')");
    expect(sql).toContain('check (machine_only)');
    expect(sql).toContain("check (human_review_status='pending')");
    expect(sql).toContain('phase9 evaluation history is immutable');
  });
});
