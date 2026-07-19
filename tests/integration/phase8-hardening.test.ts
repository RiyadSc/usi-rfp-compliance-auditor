import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signInUser, SUPABASE_URL } from './helpers';

const scopeId = '81000000-0000-4000-8000-000000000001';
const workspaceId = '81000000-0000-4000-8000-000000000002';
const analysisRunId = '81000000-0000-4000-8000-000000000007';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let a: SupabaseClient;
let b: SupabaseClient;
let admin: SupabaseClient;

beforeAll(async () => {
  a = await signInUser('A');
  b = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

describe('Phase 8 synthetic scope and hardening integration', () => {
  it('exposes only the exact bound synthetic scope to its authorized member', async () => {
    const { data: own } = await a
      .from('phase8_demo_scopes')
      .select('id,workspace_id,synthetic_marker,fixture_version,binding')
      .eq('id', scopeId);
    expect(own).toHaveLength(1);
    expect(own![0]).toMatchObject({
      workspace_id: workspaceId,
      synthetic_marker: 'phase8-synthetic-demo-only',
      fixture_version: 'full-roadmap-known-answer-v1',
    });
    const { data: other } = await b.from('phase8_demo_scopes').select('id').eq('id', scopeId);
    expect(other).toHaveLength(0);
  });

  it('binds exactly 24 candidates, two private documents, cache, and fallback', async () => {
    const [{ count: candidates }, { count: documents }, cache, fallback] = await Promise.all([
      admin
        .from('requirement_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('analysis_run_id', analysisRunId),
      admin
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
      admin.from('phase8_demo_cache_entries').select('*').eq('scope_id', scopeId).single(),
      admin.from('phase8_demo_fallbacks').select('*').eq('scope_id', scopeId).single(),
    ]);
    expect(candidates).toBe(24);
    expect(documents).toBe(2);
    expect(cache.data?.status).toBe('valid');
    expect(fallback.data).toMatchObject({
      label: 'Prepared fallback snapshot — synthetic data',
      status: 'active',
    });
  });

  it('denies ordinary scope mutation and privileged RPC execution', async () => {
    const { data: updated } = await a
      .from('phase8_demo_scopes')
      .update({ active_mode: 'fallback' })
      .eq('id', scopeId)
      .select('id');
    expect(updated ?? []).toHaveLength(0);
    const { error: rateError } = await a.rpc('consume_phase8_rate_limit', {
      p_operation: 'report_generation',
      p_key_hash: sha(randomUUID()),
      p_workspace_id: workspaceId,
      p_actor_id: (await a.auth.getUser()).data.user!.id,
    });
    expect(rateError).not.toBeNull();
    const { error: resetError } = await a.rpc('reset_phase8_demo', {
      p_scope_id: scopeId,
      p_workspace_id: workspaceId,
      p_actor_id: (await a.auth.getUser()).data.user!.id,
      p_scope_hash: sha('not-the-binding'),
      p_dry_run: true,
    });
    expect(resetError).not.toBeNull();
  });

  it('consumes concurrent rate buckets atomically', async () => {
    const key = sha(`phase8-rate-${randomUUID()}`);
    const actorId = (await a.auth.getUser()).data.user!.id;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        admin.rpc('consume_phase8_rate_limit', {
          p_operation: 'verification_request',
          p_key_hash: key,
          p_workspace_id: workspaceId,
          p_actor_id: actorId,
        }),
      ),
    );
    expect(results.every((result) => !result.error)).toBe(true);
    const allowed = results.flatMap((result) => result.data ?? []).filter((row) => row.allowed);
    expect(allowed).toHaveLength(3);
  });

  it('reserves and settles one idempotent provider budget identity without spend', async () => {
    const actorId = (await a.auth.getUser()).data.user!.id;
    const requestKey = sha(`phase8-budget-${randomUUID()}`);
    const first = await admin.rpc('reserve_provider_budget', {
      p_request_key: requestKey,
      p_phase: 'phase4',
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_analysis_run_id: analysisRunId,
      p_kind: 'verify',
      p_requested_max_usd: 0.001,
    });
    expect(first.error).toBeNull();
    const duplicate = await admin.rpc('reserve_provider_budget', {
      p_request_key: requestKey,
      p_phase: 'phase4',
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_analysis_run_id: analysisRunId,
      p_kind: 'verify',
      p_requested_max_usd: 0.001,
    });
    expect(duplicate.data).toBe(first.data);
    const settled = await admin.rpc('settle_provider_budget', {
      p_reservation_id: first.data,
      p_actual_usd: 0,
    });
    expect(settled.error).toBeNull();
    const settledAgain = await admin.rpc('settle_provider_budget', {
      p_reservation_id: first.data,
      p_actual_usd: 0,
    });
    expect(settledAgain.data).toBe(first.data);
  });
});
