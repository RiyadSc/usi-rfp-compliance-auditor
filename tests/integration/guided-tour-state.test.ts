import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

let userA: SupabaseClient;
let userB: SupabaseClient;
let admin: SupabaseClient;
let workspaceId: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  userAId = (await userA.auth.getUser()).data.user!.id;
  userBId = (await userB.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(userA, `guided tour state ${Date.now()}`);
});

describe('guided tour state isolation', () => {
  it('denies ordinary direct writes and cross-workspace reads', async () => {
    const direct = await userA.from('guided_tour_states').insert({
      user_id: userAId,
      workspace_id: workspaceId,
      tour_id: 'first-run-rfp-review',
      tour_version: 'guided-product-tour-v1',
      status: 'started',
      last_completed_step: 0,
    });
    expect(direct.error).not.toBeNull();

    const foreign = await userB
      .from('guided_tour_states')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });

  it('persists only versioned progress metadata for the signed-in user', async () => {
    const started = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'started',
      p_last_completed_step: 2,
    });
    expect(started.error).toBeNull();

    const completed = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'completed',
      p_last_completed_step: 5,
    });
    expect(completed.error).toBeNull();
    expect(completed.data).toBe(started.data);

    const row = await userA
      .from('guided_tour_states')
      .select(
        'user_id,workspace_id,tour_id,tour_version,status,last_completed_step,completed_at,dismissed_at,restarted_at',
      )
      .eq('id', completed.data)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toMatchObject({
      user_id: userAId,
      workspace_id: workspaceId,
      tour_id: 'first-run-rfp-review',
      tour_version: 'guided-product-tour-v1',
      status: 'completed',
      last_completed_step: 5,
      dismissed_at: null,
    });
    expect(row.data?.completed_at).toBeTruthy();
    expect(Object.keys(row.data ?? {})).not.toContain('document_text');
    expect(Object.keys(row.data ?? {})).not.toContain('presenter_notes');
  });

  it('allows another workspace member to keep a separate completion state', async () => {
    expect(
      (
        await admin.from('workspace_members').insert({
          workspace_id: workspaceId,
          user_id: userBId,
          role: 'reviewer',
        })
      ).error,
    ).toBeNull();
    const result = await userB.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'dismissed',
      p_last_completed_step: 1,
    });
    expect(result.error).toBeNull();
    const own = await userB
      .from('guided_tour_states')
      .select('user_id,status,last_completed_step')
      .eq('workspace_id', workspaceId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ user_id: userBId, status: 'dismissed', last_completed_step: 1 }]);
  });

  it('rejects invalid versions and workspaces where the user is not a member', async () => {
    const invalidStep = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'completed',
      p_last_completed_step: 6,
    });
    expect(invalidStep.error?.message).toContain('invalid guided tour state');
    const invalidVersion = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v0',
      p_status: 'started',
      p_last_completed_step: 0,
    });
    expect(invalidVersion.error?.message).toContain('invalid guided tour state');
    const foreignWorkspace = await createTestWorkspace(userB, `foreign tour ${Date.now()}`);
    const foreign = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: foreignWorkspace,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'started',
      p_last_completed_step: 0,
    });
    expect(foreign.error?.message).toContain('authorized workspace member required');
  });
});
