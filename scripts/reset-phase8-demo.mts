import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { assertValidPhase8Binding, planPhase8Reset, sha256Canonical } from '@usi/domain';
import { PHASE8_DEMO_SCOPE_ID, PHASE8_DEMO_WORKSPACE_ID } from './lib/phase8-prepared-demo';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
const execute = process.argv.includes('--execute');
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`phase8_reset_missing_${name.toLowerCase()}`);
  return value;
};
const url = required('NEXT_PUBLIC_SUPABASE_URL');
if (!url.includes('uxmxkdjschbekkbnweby')) throw new Error('phase8_wrong_supabase_project');
const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: scope, error } = await admin
  .from('phase8_demo_scopes')
  .select('workspace_id,authorized_identity_id,synthetic_marker,binding')
  .eq('id', PHASE8_DEMO_SCOPE_ID)
  .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
  .maybeSingle();
if (error || !scope || scope.synthetic_marker !== 'phase8-synthetic-demo-only')
  throw new Error('phase8_reset_scope_unavailable');
const binding = assertValidPhase8Binding(scope.binding);
const plan = planPhase8Reset({
  binding,
  requestedWorkspaceId: PHASE8_DEMO_WORKSPACE_ID,
  requestedIdentityId: scope.authorized_identity_id,
  dryRun: !execute,
});
const { data, error: resetError } = await admin.rpc('reset_phase8_demo', {
  p_scope_id: PHASE8_DEMO_SCOPE_ID,
  p_workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  p_actor_id: scope.authorized_identity_id,
  p_scope_hash: sha256Canonical(binding),
  p_dry_run: !execute,
});
if (resetError) throw new Error(`phase8_reset_failed:${resetError.message}`);
console.info(JSON.stringify({ ...plan, result: data, providerCalls: 0, providerSpendUsd: 0 }));
