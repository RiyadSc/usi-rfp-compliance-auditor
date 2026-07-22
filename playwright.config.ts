import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const webPort = Number.parseInt(process.env.E2E_WEB_PORT ?? '3100', 10);
const workerHealthPort = Number.parseInt(process.env.E2E_WORKER_HEALTH_PORT ?? '3101', 10);
if (!Number.isSafeInteger(webPort) || webPort < 1024 || webPort > 65_535) {
  throw new Error('E2E_WEB_PORT must be an integer between 1024 and 65535');
}
if (
  !Number.isSafeInteger(workerHealthPort) ||
  workerHealthPort < 1024 ||
  workerHealthPort > 65_535
) {
  throw new Error('E2E_WORKER_HEALTH_PORT must be an integer between 1024 and 65535');
}
const webBaseUrl = process.env.APP_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const isolatedProductionServer = process.env.E2E_ISOLATED_BUILD === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npm run ${isolatedProductionServer ? 'start' : 'dev'} --workspace apps/web -- --port ${webPort}`,
      url: `${webBaseUrl}/login`,
      reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE !== '0',
      timeout: 120_000,
      env: {
        ...process.env,
        // Keep fixtures under the limit; oversized e2e creates max+1 bytes cheaply.
        MAX_UPLOAD_BYTES: process.env.E2E_MAX_UPLOAD_BYTES ?? '65536',
        // Default e2e uses MockProvider to avoid live spend unless explicitly enabled.
        OPENAI_API_KEY: process.env.E2E_LIVE_OPENAI === '1' ? process.env.OPENAI_API_KEY : '',
      },
    },
    {
      // Dedicated health port so reuse of the web app does not skip the worker.
      command: 'npm run start --workspace apps/worker',
      url: `http://127.0.0.1:${workerHealthPort}/`,
      reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE !== '0',
      timeout: 120_000,
      env: {
        ...process.env,
        WORKER_HEALTH_PORT: String(workerHealthPort),
        OPENAI_API_KEY: process.env.E2E_LIVE_OPENAI === '1' ? process.env.OPENAI_API_KEY : '',
      },
    },
  ],
});
