import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260729000047_guided_tour_identity_scope.sql',
  'utf8',
);
const layout = readFileSync('apps/web/src/app/w/[workspaceId]/layout.tsx', 'utf8');

describe('guided-tour synthetic identity scope', () => {
  it('requires the immutable prepared-demo identity in the server RPC', () => {
    expect(migration).toContain("p_tour_id='stakeholder-demo'");
    expect(migration).toContain('authorized_identity_id=v_actor');
    expect(migration).toContain("synthetic_marker='phase8-synthetic-demo-only'");
    expect(migration).toContain('authorized prepared demo identity required');
  });

  it('does not expose demo controls to another workspace member', () => {
    expect(layout).toContain(".eq('authorized_identity_id', user.id)");
    expect(layout).toContain(".eq('synthetic_marker', 'phase8-synthetic-demo-only')");
  });
});
