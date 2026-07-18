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
} from './verification-v3-schemas';
import { PARENT_CHILD_RELATIONSHIP_VERSION } from './verification-decision-engine';

export const PHASE4_SELECTED_VERIFY_MODEL = 'gpt-5.5-2026-04-23';
export const PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT =
  'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';

export const PHASE4_QUALIFIED_COMPATIBILITY = Object.freeze({
  evaluationMode: 'full',
  fixtureVersion: 'verification-cases-v2',
  prequalificationFixtureVersion: null,
  prequalificationEvaluatorVersion: null,
  candidateIds: null,
  factEnvelopeVersion: FACT_ENVELOPE_VERSION,
  decisionEngineVersion: DECISION_ENGINE_VERSION,
  finalAssessmentSchemaVersion: FINAL_ASSESSMENT_SCHEMA_VERSION,
  evaluatorVersion: 'verification-evaluator-v3',
  entailmentPromptVersion: ENTAILMENT_PROMPT_VERSION,
  entailmentSchemaVersion: ENTAILMENT_SCHEMA_VERSION,
  challengePromptVersion: CHALLENGE_PROMPT_VERSION,
  challengeSchemaVersion: CHALLENGE_SCHEMA_VERSION,
  duplicatePromptVersion: DUPLICATE_PROMPT_VERSION,
  duplicateSchemaVersion: DUPLICATE_SCHEMA_VERSION,
  parentChildRelationshipVersion: PARENT_CHILD_RELATIONSHIP_VERSION,
  reasoning: 'low',
  maxContextsPerCandidate: 2,
  outputLimits: Object.freeze({ entailment: 1800, challenge: 1600, duplicate: 600 }),
  structuredAnswerMaxTokens: Object.freeze({ entailment: 500, challenge: 650 }),
  timeoutMs: 90_000,
  providerContract: Object.freeze({
    api: 'responses',
    store: false,
    tools: false,
    maxRepairAttempts: 1,
  }),
});

export type Phase4QualifiedCompatibility = typeof PHASE4_QUALIFIED_COMPATIBILITY;

export type Phase4ProductionRuntimeConfig = {
  model: string;
  compatibility: Phase4QualifiedCompatibility;
};

export const PHASE4_QUALIFIED_PRODUCTION_CONFIG: Phase4ProductionRuntimeConfig = Object.freeze({
  model: PHASE4_SELECTED_VERIFY_MODEL,
  compatibility: PHASE4_QUALIFIED_COMPATIBILITY,
});

export function fingerprintPhase4Compatibility(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function assertQualifiedPhase4Runtime(
  actual: Phase4ProductionRuntimeConfig,
): Phase4ProductionRuntimeConfig & { compatibilityFingerprint: string } {
  if (actual.model !== PHASE4_SELECTED_VERIFY_MODEL) {
    throw new Error(
      `phase4_runtime_incompatible:model:${actual.model || 'missing'}:${PHASE4_SELECTED_VERIFY_MODEL}`,
    );
  }
  const actualFingerprint = fingerprintPhase4Compatibility(actual.compatibility);
  if (actualFingerprint !== PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT) {
    throw new Error(
      `phase4_runtime_incompatible:fingerprint:${actualFingerprint}:${PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT}`,
    );
  }
  return { ...actual, compatibilityFingerprint: actualFingerprint };
}

// Assert the checked-in contract at module load so version drift fails tests/builds immediately.
assertQualifiedPhase4Runtime(PHASE4_QUALIFIED_PRODUCTION_CONFIG);
