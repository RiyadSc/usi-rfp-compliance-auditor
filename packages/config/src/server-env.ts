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
  MAX_PAGES_PER_WORKSPACE: z.coerce.number().int().positive().max(2_000).default(500),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024)
    .default(100 * 1024 * 1024),
  MAX_MODEL_COST_USD_PER_RUN: z.coerce.number().positive().default(10),
  PHASE3_SPEND_CEILING_USD: z.coerce.number().positive().max(10).default(10),
  PHASE4_SPEND_CEILING_USD: z.coerce.number().positive().max(15).default(15),
  MAX_EXTRACT_PAGES_PER_RUN: z.coerce.number().int().positive().max(500).default(500),
  OCR_CONCURRENCY: z.coerce.number().int().positive().max(2).default(1),
  EMBED_CONCURRENCY: z.coerce.number().int().positive().max(4).default(2),
  CLASSIFICATION_CONCURRENCY: z.coerce.number().int().positive().max(4).default(2),
  EXTRACTION_CONCURRENCY: z.coerce.number().int().positive().max(2).default(1),
  VERIFICATION_CONCURRENCY: z.coerce.number().int().positive().max(2).default(1),
  REPORT_CONCURRENCY: z.coerce.number().int().positive().max(2).default(1),
  MAX_MODEL_CALLS_PER_RUN: z.coerce.number().int().positive().default(20),
  MAX_INPUT_TOKENS_PER_CALL: z.coerce.number().int().positive().default(12000),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4000),
  PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  PARSE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length >= 20 ? v.trim() : undefined)),
  OPENAI_EXTRACT_MODEL: z.string().default('gpt-5.4-mini-2026-03-17'),
  OPENAI_EMBED_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_VERIFY_MODEL: z.string().default('gpt-5.5-2026-04-23'),
  OPENAI_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  PHASE4_LIVE_VERIFICATION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
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
