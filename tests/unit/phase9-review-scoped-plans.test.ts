import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260729000038_phase9_review_scoped_plans.sql'),
  'utf8',
);

describe('Phase 9 parameter-aware review plans', () => {
  it('keeps bounded queue and dashboard plans scoped to their runtime parameters', () => {
    expect(migration).toContain('alter function public.get_phase9_review_queue(');
    expect(migration).toContain('alter function public.get_phase9_review_dashboard_v1(');
    expect(migration.match(/set plan_cache_mode='force_custom_plan'/g)).toHaveLength(6);
  });

  it('does not change data, permissions, or review semantics', () => {
    expect(migration).not.toMatch(
      /\b(insert into|update|delete from|truncate|drop|grant|revoke)\b/i,
    );
  });
});
