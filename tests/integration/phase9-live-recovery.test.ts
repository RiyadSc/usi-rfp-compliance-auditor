import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
let userA: SupabaseClient;
let userB: SupabaseClient;
let admin: SupabaseClient;
let workspaceId: string;
let runId: string;
let planHash: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  workspaceId = await createTestWorkspace(userA, `phase9 integration ${Date.now()}`);
  runId = randomUUID();
  planHash = sha(`phase9-plan-${runId}`);
  const actorId = (await userA.auth.getUser()).data.user!.id;
  const run = await admin.from('phase9_evaluation_runs').insert({
    id: runId,
    workspace_id: workspaceId,
    actor_id: actorId,
    mode: 'dry_run',
    status: 'planned',
    source_package_hash: sha(`source-${runId}`),
    expected_answer_hash: sha(`answers-${runId}`),
    call_plan_hash: planHash,
    compatibility_fingerprint: sha('phase9-integration-config'),
    versions: { fixture: 'integration' },
    planned_maximum_usd: 0.0001,
  });
  expect(run.error).toBeNull();
  const plan = await admin.from('phase9_call_plans').insert({
    workspace_id: workspaceId,
    evaluation_run_id: runId,
    plan_hash: planHash,
    source_package_hash: sha(`source-${runId}`),
    plan: { fixture: true },
    task_count: 0,
    maximum_usd: 0.0001,
    plan_version: 'phase9-exact-call-plan-v1',
  });
  expect(plan.error).toBeNull();
});

describe('Phase 9 live-recovery persistence and isolation', () => {
  it('allows only the owning workspace to read a run', async () => {
    const own = await userA.from('phase9_evaluation_runs').select('id').eq('id', runId);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    const other = await userB.from('phase9_evaluation_runs').select('id').eq('id', runId);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);
  });

  it('denies ordinary-user fabrication and mutation', async () => {
    const insert = await userA.from('phase9_candidate_seeds').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      candidate_hash: sha('fabricated'),
      source_block_hashes: [sha('block')],
      requirement_type: 'form',
      obligation_text: 'fabricated',
      evidence_text: 'fabricated',
      discovery_route: 'deterministic',
      miner_version: 'phase9-deterministic-miner-v1',
    });
    expect(insert.error).not.toBeNull();
    const update = await userA
      .from('phase9_evaluation_runs')
      .update({ status: 'completed' })
      .eq('id', runId);
    expect(update.error).not.toBeNull();
  });

  it('reserves and settles the exact plan atomically and idempotently', async () => {
    const requestKey = sha(`request-${runId}`);
    const args = {
      p_request_key: requestKey,
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_call_plan_hash: planHash,
      p_requested_usd: 0.0001,
    };
    const first = await admin.rpc('reserve_phase9_call_plan', args);
    expect(first.error).toBeNull();
    const second = await admin.rpc('reserve_phase9_call_plan', args);
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);
    const settled = await admin.rpc('settle_phase9_call_plan', {
      p_reservation_id: first.data,
      p_actual_usd: 0,
    });
    expect(settled.error).toBeNull();
    const settledAgain = await admin.rpc('settle_phase9_call_plan', {
      p_reservation_id: first.data,
      p_actual_usd: 0,
    });
    expect(settledAgain.error).toBeNull();
  });
});
