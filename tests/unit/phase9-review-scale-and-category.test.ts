import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000037_phase9_review_scale_and_category_parity.sql'),
  'utf8',
);

describe('Phase 9 review scale and category parity migration', () => {
  it('recognizes submitted questions without changing lane precedence', () => {
    expect(migration).toContain("'\\m(due|deadline|submit|submitted)\\M'");
    const exceptionIndex = migration.indexOf("when source_support_status<>'supported'");
    const criticalIndex = migration.indexOf("then 'critical'");
    const duplicateIndex = migration.indexOf("then 'duplicate'");
    const routineIndex = migration.indexOf("else 'routine'");
    expect(exceptionIndex).toBeGreaterThan(-1);
    expect(exceptionIndex).toBeLessThan(criticalIndex);
    expect(criticalIndex).toBeLessThan(duplicateIndex);
    expect(duplicateIndex).toBeLessThan(routineIndex);
  });

  it('flattens evidence and page-coverage relationships once', () => {
    expect(migration).toContain('with seed_blocks as');
    expect(migration).toContain('finding_blocks as');
    expect(migration).toContain('coverage_state as');
    expect(migration).toContain('evidence_expanded as');
    expect(migration).toContain('evidence_summary as');
    expect(migration).toContain('selected_evidence as');
    expect(migration).not.toContain(
      'select 1 from public.phase9_candidate_seeds s\n          where',
    );
  });

  it('keeps empty evidence, parser uncertainty, and unresolved coverage fail closed', () => {
    expect(migration).toContain('length(trim(expanded.evidence_text))>0');
    expect(migration).toContain("evidence.quote_match_type in ('exact','normalized_exact')");
    expect(migration).toContain("evidence.route='parser_uncertain'");
    expect(migration).toContain('not summary.unresolved_coverage_exception');
    expect(migration).toContain("then 'quotation_not_validated'");
  });

  it('adds only lookup indexes and immutable view/function replacements', () => {
    expect(migration).toContain('create index if not exists');
    expect(migration).toContain('create or replace view public.phase9_review_queue_v1');
    expect(migration).toContain('create or replace view public.phase9_coverage_exception_pages_v1');
    expect(migration).not.toMatch(/\b(update|delete from|truncate)\b/i);
  });
});
