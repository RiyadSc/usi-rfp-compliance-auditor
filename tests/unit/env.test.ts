import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '../../packages/config/src/server-env.js';
import { parsePublicEnv } from '../../packages/config/src/public-env.js';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
  SUPABASE_SERVICE_ROLE_KEY: 'b'.repeat(40),
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
};

describe('parseServerEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseServerEnv(valid);
    expect(env.DEMO_MODE).toBe(true);
    expect(env.MAX_PAGES_PER_WORKSPACE).toBe(500);
    expect(env.MAX_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
    expect(env.MAX_MODEL_COST_USD_PER_RUN).toBe(10);
    expect(env.PHASE3_SPEND_CEILING_USD).toBe(10);
    expect(env.PHASE4_SPEND_CEILING_USD).toBe(15);
    expect(env.OPENAI_REASONING_EFFORT).toBe('low');
    expect(env.OPENAI_EXTRACT_MODEL).toBe('gpt-5.4-mini-2026-03-17');
  });

  it('rejects a missing Supabase URL', () => {
    expect(() =>
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY }),
    ).toThrow(/Invalid server environment/);
  });

  it('rejects a non-URL Supabase URL', () => {
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrow();
  });

  it('rejects non-numeric page limits', () => {
    expect(() => parseServerEnv({ ...valid, MAX_PAGES_PER_WORKSPACE: 'many' })).toThrow();
  });

  it('rejects a Phase 3 ceiling above the authoritative $10 limit', () => {
    expect(() => parseServerEnv({ ...valid, PHASE3_SPEND_CEILING_USD: '10.01' })).toThrow();
  });

  it('rejects a Phase 4 ceiling above the authoritative $15 limit', () => {
    expect(() => parseServerEnv({ ...valid, PHASE4_SPEND_CEILING_USD: '15.01' })).toThrow();
  });

  it('requires service-role and database URL for Phase 2 privileged paths', () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).toThrow(/Invalid server environment/);
  });
});

describe('parsePublicEnv', () => {
  it('accepts the two public values', () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  });

  it('rejects missing anon key', () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow();
  });
});
