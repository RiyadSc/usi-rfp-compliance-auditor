/**
 * Client-safe environment values only. The Supabase URL and anon/publishable
 * key are designed to be public; authorization is enforced by RLS.
 * Nothing else may be added here without a security review.
 */
import { z } from 'zod';

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error('Invalid public environment: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing');
  }
  return result.data;
}
