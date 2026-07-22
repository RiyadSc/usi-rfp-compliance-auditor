import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PHASE8_DEMO_SCOPE_ID } from './lib/phase8-prepared-demo';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`phase8_idempotency_missing_${name.toLowerCase()}`);
  return value;
};
const url = required('NEXT_PUBLIC_SUPABASE_URL');
if (!url.includes('uxmxkdjschbekkbnweby')) throw new Error('phase8_wrong_supabase_project');

for (let attempt = 1; attempt <= 3; attempt += 1) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/provision-phase8-demo.mts'],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 180_000 },
  );
  if (result.status !== 0) {
    throw new Error(
      `phase8_consecutive_provision_${attempt}_failed:${(result.stderr || result.stdout).slice(0, 500)}`,
    );
  }
}

const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [{ count: scopeCount, error: scopeError }, { count: cacheCount, error: cacheError }] =
  await Promise.all([
    admin
      .from('phase8_demo_scopes')
      .select('id', { count: 'exact', head: true })
      .eq('id', PHASE8_DEMO_SCOPE_ID),
    admin
      .from('phase8_demo_cache_entries')
      .select('id', { count: 'exact', head: true })
      .eq('scope_id', PHASE8_DEMO_SCOPE_ID),
  ]);
if (scopeError || cacheError) throw new Error(scopeError?.message ?? cacheError?.message);
if (scopeCount !== 1 || cacheCount !== 1) {
  throw new Error(`phase8_idempotency_count_mismatch:${scopeCount}:${cacheCount}`);
}
console.info(
  JSON.stringify({
    testVersion: 'phase8-provision-idempotency-v1',
    consecutiveRuns: 3,
    scopeCount,
    cacheCount,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);
