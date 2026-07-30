import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const directQueue = readFileSync(
  'supabase/migrations/20260729000051_phase9_review_queue_direct_scope.sql',
  'utf8',
).toLowerCase();
const viewParity = readFileSync(
  'supabase/migrations/20260729000053_phase9_review_criticality_parity.sql',
  'utf8',
).toLowerCase();

describe('Phase 9 bid-opening criticality parity', () => {
  it.each(['bid opening', 'proposal opening'])(
    'keeps mandatory %s instructions critical in direct and view paths',
    (phrase) => {
      expect(directQueue).toContain(phrase);
      expect(viewParity).toContain(phrase);
    },
  );

  it('preserves category meaning and excludes opening instructions from batch acceptance', () => {
    expect(viewParity).not.toContain("then 'submission_deadline'");
    expect(viewParity).toContain("then 'critical'");
    expect(viewParity).toContain("then 'submission_critical'");
    expect(viewParity.match(/and not guarded\.mandatory_opening/g)).toHaveLength(2);
    expect(viewParity).toContain("queue.review_lane in ('routine','duplicate')");
  });

  it('retains integrity-first lane precedence', () => {
    const integrity = viewParity.indexOf("when not guarded.evidence_run_bound then 'exception'");
    const critical = viewParity.indexOf("when guarded.mandatory_opening then 'critical'");
    expect(integrity).toBeGreaterThan(-1);
    expect(critical).toBeGreaterThan(integrity);
  });
});
