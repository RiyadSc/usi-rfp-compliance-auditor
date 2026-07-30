import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000051_phase9_review_queue_direct_scope.sql',
  'utf8',
).toLowerCase();
const wrapperSql = readFileSync(
  'supabase/migrations/20260729000039_phase9_review_explicit_scope.sql',
  'utf8',
).toLowerCase();

describe('Phase 9 review queue direct scope', () => {
  it('scopes every expensive population before evidence and window work', () => {
    expect(sql).toContain(
      'create or replace function public.get_phase9_review_queue_scoped_inner_v1',
    );
    expect(sql).toContain('scoped_findings as materialized');
    expect(sql).toContain('scoped_seeds as materialized');
    expect(sql).toContain('finding.workspace_id=p_workspace_id');
    expect(sql).toContain('finding.evaluation_run_id=p_evaluation_run_id');
    expect(sql).toContain('seed.workspace_id=p_workspace_id');
    expect(sql).toContain('seed.evaluation_run_id=p_evaluation_run_id');
    expect(sql).not.toContain('current_setting(');
    expect(sql).not.toContain('phase9_review_queue_v1');
    expect(sql).not.toContain('phase9_review_queue_unscoped_v1');
    expect(sql).not.toContain('phase9_coverage_exception_pages_v1');
  });

  it('retains evidence-run integrity and the established queue contract', () => {
    expect(sql).toContain('bound_document.evaluation_run_id=p_evaluation_run_id');
    expect(sql).toContain("'evidence_document_not_bound_to_run'");
    expect(sql).toContain("evidence.quote_match_type in ('exact','normalized_exact')");
    expect(sql).toContain("'phase9-review-priority-v1'");
    expect(sql).toContain("'phase9-duplicate-policy-v1'");
    expect(sql).toContain("'page',p_page");
    expect(sql).toContain("'pagesize',p_page_size");
    expect(sql).toContain("'total',v_total");
    expect(sql).toContain("'rows',v_rows");
  });

  it('preserves bounded input validation and internal-only execution', () => {
    expect(sql).toContain(
      "p_lane not in ('critical','exception','duplicate','routine','reviewed','all')",
    );
    expect(sql).toContain('p_page_size not between 1 and 50');
    expect(sql).toContain("set plan_cache_mode='force_custom_plan'");
    expect(sql).toContain("set enable_nestloop='off'");
    expect(sql).toContain('from public,anon,authenticated');
  });

  it('replaces the exact inner function invoked by the authorized public wrapper', () => {
    expect(wrapperSql).toContain('return public.get_phase9_review_queue_scoped_inner_v1(');
    expect(wrapperSql).toContain(
      'revoke all on function public.get_phase9_review_queue_scoped_inner_v1(',
    );
    expect(sql).toContain(
      'create or replace function public.get_phase9_review_queue_scoped_inner_v1(',
    );
    expect(sql).toContain('revoke all on function public.get_phase9_review_queue_scoped_inner_v1(');
  });
});
