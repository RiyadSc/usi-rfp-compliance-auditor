import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const models = [
  'gpt-5.5-2026-04-23',
  'gpt-5.4-2026-03-05',
  'gpt-5.4-mini-2026-03-17',
  'gpt-5.2-2025-12-11',
];
const reports = await Promise.all(
  models.map(async (model) =>
    JSON.parse(
      await readFile(resolve(`artifacts/evaluation/phase3-live-results-${model}.json`), 'utf8'),
    ),
  ),
);
const actualEvaluationCostUsd = Number(
  reports.reduce((sum, report) => sum + report.actualEvaluationCostUsd, 0).toFixed(8),
);
const cumulativePhase3SpendUsd = Math.max(
  ...reports.map((report) => report.cumulativePhase3SpendUsd),
);
const combined = {
  ...reports[0],
  artifactVersion: 'phase3-live-eval-v2-combined',
  generatedAt: new Date().toISOString(),
  spentBeforeUsd: Number((cumulativePhase3SpendUsd - actualEvaluationCostUsd).toFixed(8)),
  estimatedMaximumUsd: Number(
    reports.reduce((sum, report) => sum + report.estimatedMaximumUsd, 0).toFixed(8),
  ),
  actualEvaluationCostUsd,
  cumulativePhase3SpendUsd,
  results: reports.flatMap((report) => report.results),
};
await writeFile(
  resolve('artifacts/evaluation/phase3-live-results.json'),
  `${JSON.stringify(combined, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(JSON.stringify(combined, null, 2));
