import { defineConfig } from 'vitest/config';

// Integration tests hit the real Supabase demo project using anon-key
// clients (RLS enforced). Requires .env.local; excluded from secretless CI.
export default defineConfig({
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
