import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260728000035_phase9_review_policy_alignment.sql'),
  'utf8',
);
const actions = readFileSync(resolve('apps/web/src/app/w/[workspaceId]/phase9/actions.ts'), 'utf8');
const page = readFileSync(resolve('apps/web/src/app/w/[workspaceId]/phase9/page.tsx'), 'utf8');
const service = readFileSync(resolve('apps/web/src/lib/phase9/review-service.ts'), 'utf8');

describe('Phase 9 production review-policy alignment', () => {
  it('keeps review workflow traffic separate from paid verification requests', () => {
    expect(migration).toContain("('phase9_review_workflow',600,300)");
    expect(actions.match(/operation: 'phase9_review_workflow'/g)).toHaveLength(4);
    expect(actions.match(/operation: 'verification_request'/g)).toHaveLength(1);
  });

  it('fails closed on coverage, evidence, parser, and precedence exceptions', () => {
    expect(migration).toContain("when source_support_status<>'supported' then 'exception'");
    expect(migration).toContain("when precedence_status<>'active' then 'exception'");
    expect(migration).toContain("when unresolved_coverage_exception then 'exception'");
    expect(migration).toContain('where coverage_exception.latest_decision_id is null');
    expect(migration).toContain("or coverage_exception.human_decision='needs_follow_up'");
  });

  it('keeps pricing critical and malformed dates out of bounded responses', () => {
    expect(migration.indexOf("then 'pricing_form'")).toBeLessThan(
      migration.indexOf("then 'attachment'"),
    );
    expect(migration).toContain("~ '^\\d{4}-\\d{2}-\\d{2}$'");
    expect(migration).toContain('else null\n    end deadline_iso');
  });

  it('uses authoritative batch rows for analytics and rejects fabricated decisions', () => {
    expect(migration).toContain('then coalesce(batch.selection_count,0)');
    expect(migration).not.toContain("(metadata->>'selectionCount')::integer");
    expect(migration).toContain("'authoritative review activity requires its workflow action'");
    expect(migration).toContain('phase9_default_review_batch_reason');
  });

  it('supports bounded coverage navigation and observed effort inputs', () => {
    expect(service).toContain("{ count: 'exact', head: true }");
    expect(service).toContain('const resolvedPage = Math.min(boundedPage, pageCount)');
    expect(service).toContain('.range((resolvedPage - 1) * boundedLimit');
    expect(page).toContain('Next coverage page');
    expect(page).toContain('Previous coverage page');
    expect(migration).toContain('get_phase9_review_effort_observations');
    expect(page).toContain('observedSecondsPerIndividualDecision');
  });

  it('uses the latest completed non-demo run and separates clean executive counts', () => {
    expect(page).toContain(".eq('status', 'completed')");
    expect(migration).toContain("q.review_lane='critical' and q.category='submission_deadline'");
    expect(migration).toContain("q.review_lane='critical' and q.category='question_deadline'");
  });
});
