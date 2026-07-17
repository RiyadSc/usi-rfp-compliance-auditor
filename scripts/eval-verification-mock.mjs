import {
  DECISION_ENGINE_VERSION,
  FACT_ENVELOPE_VERSION,
  FINAL_ASSESSMENT_SCHEMA_VERSION,
  MockProvider,
} from '../packages/ai/src/index.ts';
import { VERIFICATION_FIXTURE_VERSION } from '../fixtures/eval/verification-cases.ts';
import { runVerificationEvaluation } from './verification-evaluation-runner.mjs';
import {
  scoreVerificationPipelineRun,
  VERIFICATION_EVALUATOR_VERSION,
} from './verification-metrics.mjs';

const evaluation = await runVerificationEvaluation(new MockProvider());
const metrics = scoreVerificationPipelineRun(evaluation);
console.log(
  JSON.stringify(
    {
      provider: 'mock',
      fixtureVersion: VERIFICATION_FIXTURE_VERSION,
      factEnvelopeVersion: FACT_ENVELOPE_VERSION,
      decisionEngineVersion: DECISION_ENGINE_VERSION,
      finalAssessmentSchemaVersion: FINAL_ASSESSMENT_SCHEMA_VERSION,
      evaluatorVersion: VERIFICATION_EVALUATOR_VERSION,
      metrics,
    },
    null,
    2,
  ),
);

const deterministicGatePassed =
  metrics.final.criticalFalseSupported === 0 &&
  metrics.final.criticalFalseActive === 0 &&
  metrics.final.dateAccuracy === 1 &&
  metrics.final.numberAccuracy === 1 &&
  metrics.final.precedenceAccuracy === 1 &&
  metrics.final.quoteValidity === 1 &&
  metrics.final.citationAccuracy === 1 &&
  metrics.final.falseMergeCount === 0 &&
  metrics.final.schemaAdherence === 1;
if (!deterministicGatePassed) process.exitCode = 1;
