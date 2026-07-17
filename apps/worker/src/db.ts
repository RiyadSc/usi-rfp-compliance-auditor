import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** Service-role client — worker only. Never exposed to browsers. */
export function adminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
