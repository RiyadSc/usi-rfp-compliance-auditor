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

for (const spec of specs) {
  console.info(`\n[playwright-isolated] ${spec}`);
  execFileSync(executable, ['test', spec, '--workers=1', '--reporter=dot'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLAYWRIGHT_REUSE: '0',
      PHASE3_LIVE_EVAL: '0',
      PHASE4_LIVE_EVAL: '0',
      PHASE4_LIVE_VERIFICATION_ENABLED: 'false',
      LIVE_PROVIDER_ENABLED: 'false',
    },
    stdio: 'inherit',
  });
}

console.info(`[playwright-isolated] ${specs.length} spec files passed`);
