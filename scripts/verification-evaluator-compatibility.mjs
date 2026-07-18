import { createHash } from 'node:crypto';
import {
  CHALLENGE_PROMPT_VERSION,
  CHALLENGE_SCHEMA_VERSION,
  DECISION_ENGINE_VERSION,
  DUPLICATE_PROMPT_VERSION,
  DUPLICATE_SCHEMA_VERSION,
  ENTAILMENT_PROMPT_VERSION,
  ENTAILMENT_SCHEMA_VERSION,
  FACT_ENVELOPE_VERSION,
  FINAL_ASSESSMENT_SCHEMA_VERSION,
  PARENT_CHILD_RELATIONSHIP_VERSION,
} from '../packages/ai/src/index.ts';
import {
  OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS,
  OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
  VERIFICATION_FIXTURE_VERSION,
} from '../fixtures/eval/verification-cases.ts';
import {
  OUTPUT_BUDGET_PREQUALIFICATION_EVALUATOR_VERSION,
  VERIFICATION_EVALUATOR_VERSION,
} from './verification-metrics.mjs';

export const VERIFICATION_EVALUATION_OUTPUT_LIMITS = Object.freeze({
  entailment: 1800,
  challenge: 1600,
  duplicate: 600,
});
export const VERIFICATION_EVALUATION_REASONING = 'low';
export const VERIFICATION_STRUCTURED_ANSWER_MAX_TOKENS = Object.freeze({
  entailment: 500,
  challenge: 650,
});
export const VERIFICATION_EVALUATION_PROJECTED_MAXIMUM_USD = Object.freeze({
  full: Object.freeze({
    'gpt-5.5-2026-04-23': 1.35,
    'gpt-5.4-2026-03-05': 0.7,
    'gpt-5.4-mini-2026-03-17': 0.4,
  }),
  outputBudgetPrequalification: Object.freeze({
    'gpt-5.5-2026-04-23': 0.35,
    'gpt-5.4-2026-03-05': 0.18,
    'gpt-5.4-mini-2026-03-17': 0.1,
  }),
});
export const VERIFICATION_EVALUATION_TIMEOUT_MS = 90_000;

export function buildVerificationEvaluationCompatibility(options = {}) {
  const evaluationMode = options.evaluationMode ?? 'full';
  if (!['full', OUTPUT_BUDGET_PREQUALIFICATION_VERSION].includes(evaluationMode))
    throw new Error(`Unknown verification evaluation mode: ${evaluationMode}`);
  const targeted = evaluationMode === OUTPUT_BUDGET_PREQUALIFICATION_VERSION;
  return {
    evaluationMode,
    fixtureVersion: VERIFICATION_FIXTURE_VERSION,
    prequalificationFixtureVersion: targeted ? OUTPUT_BUDGET_PREQUALIFICATION_VERSION : null,
    prequalificationEvaluatorVersion: targeted
      ? OUTPUT_BUDGET_PREQUALIFICATION_EVALUATOR_VERSION
      : null,
    candidateIds: targeted ? [...OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS] : null,
    factEnvelopeVersion: FACT_ENVELOPE_VERSION,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    finalAssessmentSchemaVersion: FINAL_ASSESSMENT_SCHEMA_VERSION,
    evaluatorVersion: VERIFICATION_EVALUATOR_VERSION,
    entailmentPromptVersion: ENTAILMENT_PROMPT_VERSION,
    entailmentSchemaVersion: ENTAILMENT_SCHEMA_VERSION,
    challengePromptVersion: CHALLENGE_PROMPT_VERSION,
    challengeSchemaVersion: CHALLENGE_SCHEMA_VERSION,
    duplicatePromptVersion: DUPLICATE_PROMPT_VERSION,
    duplicateSchemaVersion: DUPLICATE_SCHEMA_VERSION,
    parentChildRelationshipVersion: PARENT_CHILD_RELATIONSHIP_VERSION,
    reasoning: VERIFICATION_EVALUATION_REASONING,
    maxContextsPerCandidate: 2,
    outputLimits: VERIFICATION_EVALUATION_OUTPUT_LIMITS,
    structuredAnswerMaxTokens: VERIFICATION_STRUCTURED_ANSWER_MAX_TOKENS,
    timeoutMs: VERIFICATION_EVALUATION_TIMEOUT_MS,
    providerContract: {
      api: 'responses',
      store: false,
      tools: false,
      maxRepairAttempts: 1,
    },
  };
}

export function fingerprintVerificationEvaluationCompatibility(compatibility) {
  return createHash('sha256').update(JSON.stringify(compatibility)).digest('hex');
}

export function isResumableRunCompatible(run, expected) {
  return (
    run?.metrics?.totals?.calls > 0 &&
    JSON.stringify(run.compatibility) === JSON.stringify(expected)
  );
}
