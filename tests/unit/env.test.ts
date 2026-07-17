import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '../../packages/config/src/server-env.js';
import { parsePublicEnv } from '../../packages/config/src/public-env.js';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
};

describe('parseServerEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseServerEnv(valid);
    expect(env.DEMO_MODE).toBe(true);
    expect(env.MAX_PAGES_PER_WORKSPACE).toBe(100);
    expect(env.MAX_MODEL_COST_USD_PER_RUN).toBe(10);
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

  it('does not require any provider or service-role secret in Phase 1', () => {
    const env = parseServerEnv(valid);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});

describe('parsePublicEnv', () => {
  it('accepts the two public values', () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it('rejects missing anon key', () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow();
  });
});
