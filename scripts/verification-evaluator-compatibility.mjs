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
import { VERIFICATION_FIXTURE_VERSION } from '../fixtures/eval/verification-cases.ts';
import { VERIFICATION_EVALUATOR_VERSION } from './verification-metrics.mjs';

export const VERIFICATION_EVALUATION_OUTPUT_LIMITS = Object.freeze({
  entailment: 1200,
  challenge: 1000,
  duplicate: 600,
});
export const VERIFICATION_EVALUATION_TIMEOUT_MS = 90_000;

export function buildVerificationEvaluationCompatibility() {
  return {
    fixtureVersion: VERIFICATION_FIXTURE_VERSION,
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
    reasoning: 'medium',
    maxContextsPerCandidate: 2,
    outputLimits: VERIFICATION_EVALUATION_OUTPUT_LIMITS,
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
