import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Service-role client for privileged server paths only.
 * Never import from client components. Always verify membership with the
 * user-scoped client before using this for workspace-scoped writes.
 */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
