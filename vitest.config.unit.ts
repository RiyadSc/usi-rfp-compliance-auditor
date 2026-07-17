import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
