import { MockProvider } from '../packages/ai/src/index.ts';
import { VERIFICATION_FIXTURE_VERSION } from '../fixtures/eval/verification-cases.ts';
import { runVerificationEvaluation } from './verification-evaluation-runner.mjs';
import { scoreVerificationPipelineRun } from './verification-metrics.mjs';

const evaluation = await runVerificationEvaluation(new MockProvider());
console.log(
  JSON.stringify(
    {
      provider: 'mock',
      fixtureVersion: VERIFICATION_FIXTURE_VERSION,
      metrics: scoreVerificationPipelineRun(evaluation),
    },
    null,
    2,
  ),
);
