/**
 * Server-only environment validation. Never import from client components:
 * apps/web wraps this behind `server-only` (see apps/web/src/lib/env.ts).
 *
 * Service-role and DATABASE_URL are required for Phase 2 upload finalize /
 * worker paths. They must never reach the client bundle.
 */
import { z } from 'zod';

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().min(20),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MAX_PAGES_PER_WORKSPACE: z.coerce.number().int().positive().default(100),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  MAX_MODEL_COST_USD_PER_RUN: z.coerce.number().positive().default(10),
  PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  PARSE_CONCURRENCY: z.coerce.number().int().positive().default(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    // Fail fast at startup; never render a partially-configured app.
    throw new Error(`Invalid server environment:\n${missing.join('\n')}`);
  }
  return result.data;
}
