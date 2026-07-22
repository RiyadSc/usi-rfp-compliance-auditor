import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const excludeDemoCritical = process.argv.includes('--exclude-demo-critical');
const requested = process.argv
  .slice(2)
  .filter((argument) => argument !== '--exclude-demo-critical');
const allSpecs = (await readdir('tests/e2e'))
  .filter((name) => name.endsWith('.spec.ts'))
  .sort()
  .map((name) => join('tests/e2e', name));
const specs = (requested.length > 0 ? requested : allSpecs).filter(
  (spec) => !excludeDemoCritical || !spec.endsWith('demo-critical.spec.ts'),
);
const executable =
  process.platform === 'win32'
    ? 'node_modules/.bin/playwright.cmd'
    : 'node_modules/.bin/playwright';
const isolatedEnvironment = {
  ...process.env,
  E2E_ISOLATED_BUILD: '1',
  E2E_WEB_PORT: process.env.E2E_WEB_PORT ?? '3100',
  E2E_WORKER_HEALTH_PORT: process.env.E2E_WORKER_HEALTH_PORT ?? '3101',
  PLAYWRIGHT_REUSE: '0',
  PHASE3_LIVE_EVAL: '0',
  PHASE4_LIVE_EVAL: '0',
  PHASE4_LIVE_VERIFICATION_ENABLED: 'false',
  LIVE_PROVIDER_ENABLED: 'false',
};

console.info('[playwright-isolated] building isolated production server');
execFileSync('npm', ['run', 'build', '--workspace', 'apps/web'], {
  cwd: process.cwd(),
  env: isolatedEnvironment,
  stdio: 'inherit',
});

for (const spec of specs) {
  console.info(`\n[playwright-isolated] ${spec}`);
  execFileSync(executable, ['test', spec, '--workers=1', '--reporter=dot'], {
    cwd: process.cwd(),
    env: isolatedEnvironment,
    stdio: 'inherit',
  });
}

console.info(`[playwright-isolated] ${specs.length} spec files passed`);
