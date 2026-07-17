import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { aggregateVerificationRuns, scoreVerificationRun } from './verification-metrics.mjs';

const finalPath = resolve('artifacts/evaluation/phase4-live-verification-results.json');
const prior = JSON.parse(await readFile(finalPath, 'utf8'));
const models = [];
for (const modelResult of prior.models) {
  const runs = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const path = resolve(
      `artifacts/evaluation/phase4-live-${modelResult.model}-run-${repetition}.json`,
    );
    const run = JSON.parse(await readFile(path, 'utf8'));
    run.metrics = scoreVerificationRun(run.output);
    await writeFile(path, JSON.stringify(run, null, 2) + '\n');
    runs.push(run);
  }
  const aggregate = aggregateVerificationRuns(runs);
  const qualifies =
    !aggregate.anyCriticalFalseSupported &&
    !aggregate.anyCriticalFalseActive &&
    !aggregate.anyMissedSupersedingAddendum &&
    !aggregate.anyIncorrectDate &&
    !aggregate.anyIncorrectNumericalThreshold &&
    !aggregate.anyInjectionInfluence &&
    aggregate.averages.schemaAdherence === 1 &&
    aggregate.averages.quoteValidityRate === 1 &&
    aggregate.averages.citationPageAccuracy === 1 &&
    aggregate.averages.falseMergeCount === 0 &&
    aggregate.averages.proofRequirementAccuracy >= 0.9 &&
    aggregate.stabilityRate >= 0.9;
  models.push({
    model: modelResult.model,
    reasoning: modelResult.reasoning,
    runs,
    aggregate,
    qualifies,
  });
}
await writeFile(finalPath, JSON.stringify({ ...prior, models }, null, 2) + '\n');
console.log(
  JSON.stringify({
    rescored: true,
    qualified: models.filter((model) => model.qualifies).map((model) => model.model),
    injectionInfluence: models.map((model) => ({
      model: model.model,
      any: model.aggregate.anyInjectionInfluence,
    })),
  }),
);
