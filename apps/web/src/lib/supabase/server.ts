import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { serverEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client authenticated as the signed-in user.
 * All data access flows through RLS; there is no service-role client in
 * Phase 1 and none may ever be importable from client components.
 */
export async function createSupabaseServerClient() {
  const env = serverEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes sessions.
        }
      },
    },
  });
}
