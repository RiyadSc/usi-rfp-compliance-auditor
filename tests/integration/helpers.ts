import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Integration tests require ${name} in .env.local`);
  }
  return value;
}

export const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export function anonClient(): SupabaseClient {
  // Fresh client per user session; RLS is the enforcement layer under test.
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInUser(which: 'A' | 'B'): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: required(`DEMO_USER_${which}_EMAIL`),
    password: required(`DEMO_USER_${which}_PASSWORD`),
  });
  if (error) {
    throw new Error(`Sign-in failed for demo user ${which}: ${error.message}`);
  }
  return client;
}

export async function createTestWorkspace(client: SupabaseClient, name: string): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { data, error } = await client
    .from('workspaces')
    .insert({ name, owner_id: user.id })
    .select('id')
    .single();
  if (error || !data) throw new Error(`workspace create failed: ${error?.message}`);
  return data.id as string;
}
