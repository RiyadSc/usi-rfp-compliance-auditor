import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  retries: 0,
  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev --workspace apps/web',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Dedicated health port so reuse of the web app does not skip the worker.
      command: 'WORKER_HEALTH_PORT=3001 npm run start --workspace apps/worker',
      url: 'http://127.0.0.1:3001/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
