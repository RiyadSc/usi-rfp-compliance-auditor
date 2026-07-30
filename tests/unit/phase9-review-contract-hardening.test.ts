import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260728000036_phase9_review_contract_hardening.sql'),
  'utf8',
);

describe('Phase 9 review contract hardening migration', () => {
  it('serializes concurrent batch delivery and retires the unguarded entry point', () => {
    expect(migration).toContain('create or replace function public.record_phase9_review_batch_v2');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("'phase9-review-batch-v2:'");
    expect(migration).toMatch(
      /revoke all on function public\.record_phase9_review_batch\([\s\S]*?\) from authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.record_phase9_review_batch_v2\([\s\S]*?\) to authenticated;/,
    );
  });

  it('exposes only observational activity and authoritative owner publication activity', () => {
    expect(migration).toMatch(
      /revoke all on function public\.record_phase9_review_activity\([\s\S]*?\) from authenticated;/,
    );
    expect(migration).toContain(
      'create or replace function public.record_phase9_observational_activity_v1',
    );
    expect(migration).toContain("'review_session_started','finding_opened','source_page_opened'");
    expect(migration).toContain('only observational review activity is permitted');
    expect(migration).toContain(
      'create or replace function public.record_phase9_publication_activity_v1',
    );
    expect(migration).toContain("if v_actor is null or v_role<>'owner'");
    expect(migration).toContain('publication result is not authoritative');
    expect(migration).toContain("'publication_attempted','publication_completed'");
    expect(migration).toContain("'phase8-rate-limits-v1:phase9_review_workflow:'");
    expect(migration).toContain('review activity rate limit exceeded');
  });

  it('requires non-empty exact or normalized-exact evidence in the authoritative queue', () => {
    expect(migration).toMatch(
      /(?:nullif\(trim\(s\.evidence_text\),''\) is not null|(?:char_)?length\(trim\(s\.evidence_text\)\)\s*>\s*0)/,
    );
    expect(migration).toContain("when quote_match_type not in ('exact','normalized_exact')");
    expect(migration).toContain("then 'quotation_not_validated'");
    expect(migration).toContain('left join public.document_pages page_text');
  });

  it('publishes only authoritative queue rows and verifies bridge count parity', () => {
    expect(migration).toContain(
      'create or replace function public.publish_phase9_reviewed_findings_unguarded',
    );
    expect(migration).toContain("queue.review_lane in ('critical','routine')");
    expect(migration).toContain("queue.quote_match_type in ('exact','normalized_exact')");
    expect(migration).toContain('and not queue.unresolved_coverage_exception');
    expect(migration).toContain('accepted phase9 finding is not publishable');
    expect(migration).toContain('published phase9 bridge count mismatch');
    expect(migration).toContain('queue.source_document_id');
    expect(migration).toContain('queue.page_number');
  });

  it('serves one bounded page and one consolidated executive aggregate', () => {
    expect(migration).toContain('with filtered as materialized');
    expect(migration).toContain('p_page not between 1 and 1000000');
    expect(migration).toContain('limit p_page_size offset ((p_page-1)*p_page_size)');
    expect(migration).toContain('create or replace function public.get_phase9_review_dashboard_v1');
    expect(migration).toContain('with queue as materialized');
    expect(migration).toContain("'nextRecommendedAction'");
  });

  it('uses a canonical duplicate signature with stable JSON object and array ordering', () => {
    expect(migration).toContain(
      'create or replace function public.phase9_review_duplicate_signature_v1',
    );
    expect(migration).toContain('public.phase9_canonical_json_v1');
    expect(migration).toContain('order by entry.key');
    expect(migration).toContain('order by entry.ordinality');
    expect(migration).toContain("'phase9-duplicate-policy-v1|'");
  });

  it('keeps lane classification fail closed before critical and duplicate classification', () => {
    const exceptionIndex = migration.indexOf("when source_support_status<>'supported'");
    const criticalIndex = migration.indexOf("then 'critical'");
    const duplicateIndex = migration.indexOf("then 'duplicate'");
    const routineIndex = migration.indexOf("else 'routine'");
    expect(exceptionIndex).toBeGreaterThan(-1);
    expect(exceptionIndex).toBeLessThan(criticalIndex);
    expect(criticalIndex).toBeLessThan(duplicateIndex);
    expect(duplicateIndex).toBeLessThan(routineIndex);
  });
});
