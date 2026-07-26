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
let documentId: string;
let planHash: string;
let actorId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  workspaceId = await createTestWorkspace(userA, `phase9 workspace live ${Date.now()}`);
  actorId = (await userA.auth.getUser()).data.user!.id;
  documentId = randomUUID();
  const sourceHash = sha(`workspace-live-document-${documentId}`);
  const document = await admin.from('documents').insert({
    id: documentId,
    workspace_id: workspaceId,
    created_by: actorId,
    document_type: 'primary_rfp',
    original_filename: 'Connecticut Security RFP.pdf',
    normalized_filename: 'Connecticut Security RFP.pdf',
    mime_type: 'application/pdf',
    object_key: `${workspaceId}/phase9-workspace-live/${documentId}.pdf`,
    size_bytes: 100,
    sha256: sourceHash,
    status: 'parsed',
    page_count: 1,
    parser_name: 'integration',
    parser_version: '1',
  });
  expect(document.error).toBeNull();

  runId = randomUUID();
  planHash = sha(`workspace-live-plan-${runId}`);
  const run = await admin.from('phase9_evaluation_runs').insert({
    id: runId,
    workspace_id: workspaceId,
    actor_id: actorId,
    mode: 'workspace_live',
    status: 'planned',
    source_package_hash: sha(`workspace-live-source-${runId}`),
    document_set_hash: sha(`workspace-live-docset-${runId}`),
    expected_answer_hash: sha(`no-expected-answers-${runId}`),
    expected_answers_used: false,
    call_plan_hash: planHash,
    compatibility_fingerprint: sha('workspace-live-config'),
    versions: { purpose: 'integration' },
    planned_maximum_usd: 0.0001,
    requested_maximum_usd: 0.1,
  });
  expect(run.error).toBeNull();
  const binding = await admin.from('phase9_evaluation_documents').insert({
    workspace_id: workspaceId,
    evaluation_run_id: runId,
    document_id: documentId,
    source_hash: sourceHash,
    ordinal: 0,
    page_count: 1,
  });
  expect(binding.error).toBeNull();
  const plan = await admin.from('phase9_call_plans').insert({
    workspace_id: workspaceId,
    evaluation_run_id: runId,
    plan_hash: planHash,
    source_package_hash: sha(`workspace-live-source-${runId}`),
    plan: { fixture: true },
    task_count: 0,
    maximum_usd: 0.0001,
    plan_version: 'phase9-exact-call-plan-v1',
  });
  expect(plan.error).toBeNull();
});

describe('Phase 9 general workspace live persistence', () => {
  it('exposes document bindings and policies only inside the owning workspace', async () => {
    const own = await userA
      .from('phase9_evaluation_documents')
      .select('document_id')
      .eq('evaluation_run_id', runId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ document_id: documentId }]);
    const foreign = await userB
      .from('phase9_evaluation_documents')
      .select('document_id')
      .eq('evaluation_run_id', runId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });

  it('denies ordinary policy and immutable-binding mutations', async () => {
    const policy = await userA.from('phase9_live_budget_policies').insert({
      workspace_id: workspaceId,
      enabled: true,
      per_run_maximum_usd: 3,
      monthly_maximum_usd: 15,
      policy_version: 'phase9-workspace-budget-v1',
      configured_by: actorId,
    });
    expect(policy.error).not.toBeNull();
    const binding = await userA
      .from('phase9_evaluation_documents')
      .update({ ordinal: 1 })
      .eq('evaluation_run_id', runId)
      .select('id,ordinal');
    expect(binding.error).toBeNull();
    expect(binding.data).toEqual([]);
  });

  it('refuses disabled live analysis, then reserves only the exact enabled workspace plan', async () => {
    const args = {
      p_request_key: sha(`workspace-live-request-${runId}`),
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_call_plan_hash: planHash,
      p_requested_usd: 0.0001,
    };
    const disabled = await admin.rpc('reserve_phase9_call_plan', args);
    expect(disabled.error?.message).toContain('phase9 workspace live analysis disabled');

    const policy = await admin.from('phase9_live_budget_policies').upsert({
      workspace_id: workspaceId,
      enabled: true,
      per_run_maximum_usd: 0.1,
      monthly_maximum_usd: 0.2,
      policy_version: 'phase9-workspace-budget-v1',
      configured_by: actorId,
    });
    expect(policy.error).toBeNull();
    const reserved = await admin.rpc('reserve_phase9_call_plan', args);
    expect(reserved.error).toBeNull();
    expect(typeof reserved.data).toBe('string');
    const release = await admin.rpc('release_phase9_call_plan', {
      p_reservation_id: reserved.data,
    });
    expect(release.error).toBeNull();
  });

  it('rejects a cross-workspace document binding at the database boundary', async () => {
    const otherWorkspace = await createTestWorkspace(userB, `phase9 foreign ${Date.now()}`);
    const cross = await admin.from('phase9_evaluation_documents').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      document_id: randomUUID(),
      source_hash: sha(otherWorkspace),
      ordinal: 2,
      page_count: 1,
    });
    expect(cross.error).not.toBeNull();
  });
});
