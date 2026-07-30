import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000050_guided_tour_step_bounds.sql',
  'utf8',
).toLowerCase();

describe('guided-tour zero-based step bounds', () => {
  it('allows exactly six onboarding and fourteen stakeholder steps', () => {
    expect(sql).toContain("tour_id='first-run-rfp-review' and last_completed_step between 0 and 5");
    expect(sql).toContain("tour_id='stakeholder-demo' and last_completed_step between 0 and 13");
    expect(sql).toContain('guided_tour_states_v1_step_bounds');
    expect(sql).toContain(') not valid;');
    expect(sql).toContain("raise exception 'invalid guided tour state'");
  });
});
