import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { evaluatePhase9NewJerseyReviewAcceleration } from './lib/phase9-review-acceleration-evaluator';

for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`phase9_review_acceleration_evaluation_refuses_live_flag:${flag}`);

const snapshot = JSON.parse(
  await readFile('fixtures/eval/phase9-review-acceleration-new-jersey-v1.json', 'utf8'),
) as unknown;
const result = evaluatePhase9NewJerseyReviewAcceleration(snapshot);

await writeFile(
  'artifacts/evaluation/phase9-review-acceleration-new-jersey-v1.json',
  await format(JSON.stringify(result), { parser: 'json', printWidth: 100 }),
  'utf8',
);
console.info(
  JSON.stringify({
    artifactVersion: result.artifactVersion,
    totalFindings: result.population.totalFindings,
    lanes: result.lanes,
    duplicateGroups: result.duplicates.groupCount,
    batchEligible: result.acceleratedReview.batchEligibleRoutineFindings,
    individualReview: result.acceleratedReview.individualReviewFindings,
    estimatedFindingInteractionsBefore: result.acceleratedReview.estimatedFindingInteractionsBefore,
    estimatedFindingInteractionsAfter: result.acceleratedReview.estimatedFindingInteractionsAfter,
    estimatedReductionInIndividualFindingDecisions:
      result.acceleratedReview.estimatedReductionInIndividualFindingDecisions,
    pageCoverageExceptions: result.exceptions.pageCoverageCount,
    providerCalls: result.safety.providerCalls,
    providerSpendUsd: result.safety.providerSpendUsd,
  }),
);
