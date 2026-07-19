import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Integration tests hit the real Supabase demo project using anon-key
// clients (RLS enforced). Requires .env.local; excluded from secretless CI.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': resolve(__dirname, 'tests/server-only-stub.ts'),
      '@': resolve(__dirname, 'apps/web/src'),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Serial execution: tests share seeded demo users.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
