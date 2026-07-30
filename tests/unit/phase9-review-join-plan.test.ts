import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000043_phase9_review_join_plan.sql'),
  'utf8',
);

describe('Phase 9 bounded review join plan', () => {
  it('limits the set-based planner override to review entry points', () => {
    expect(migration.match(/set enable_nestloop='off'/g)).toHaveLength(6);
    expect(migration).toContain('public.get_phase9_review_queue');
    expect(migration).toContain('public.get_phase9_review_dashboard_v1');
    expect(migration).toContain('public.record_phase9_review_batch_v2');
    expect(migration).toContain('public.publish_phase9_reviewed_findings');
  });

  it('does not alter review records or source evidence', () => {
    expect(migration).not.toMatch(
      /\b(insert into|update|delete from|truncate|drop|grant|revoke)\b/i,
    );
  });
});
