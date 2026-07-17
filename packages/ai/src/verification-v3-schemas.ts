import { z } from 'zod';

export const ENTAILMENT_PROMPT_VERSION = 'verify-entailment-v3';
export const ENTAILMENT_SCHEMA_VERSION = 'verification-entailment-v1';
export const CHALLENGE_PROMPT_VERSION = 'verify-challenge-v1';
export const CHALLENGE_SCHEMA_VERSION = 'verification-challenge-v1';
export const DUPLICATE_PROMPT_VERSION = 'verify-duplicate-v1';
export const DUPLICATE_SCHEMA_VERSION = 'verification-duplicate-v1';
export const DECISION_ENGINE_VERSION = 'verification-decision-v3';
export const FACT_ENVELOPE_VERSION = 'verification-facts-v2';

export const ENTAILMENT_CLASSES = [
  'entails',
  'partially_entails',
  'contradicts',
  'insufficient',
  'parser_uncertain',
] as const;

export const CHALLENGE_ASSESSMENTS = [
  'no_material_objection',
  'material_qualification_missing',
  'contradictory_evidence',
  'precedence_problem',
  'insufficient_evidence',
  'parser_uncertain',
] as const;

export const CHALLENGE_OBJECTION_TYPES = [
  'missing_condition',
  'overstated_scope',
  'wrong_party',
  'wrong_deadline',
  'wrong_amount_or_unit',
  'wrong_form',
  'omitted_exception',
  'superseding_addendum',
  'unresolved_conflict',
  'descriptive_not_obligatory',
  'parser_quality',
  'insufficient_evidence',
  'other',
] as const;

const evidenceReference = z
  .object({
    documentId: z.string().min(1),
    pageNumber: z.number().int().min(1),
    quote: z.string().min(1).max(500),
  })
  .strict();

export const entailmentResultSchema = z
  .object({
    candidateId: z.string().min(1),
    classification: z.enum(ENTAILMENT_CLASSES),
    rationale: z.string().min(1).max(350),
    supportingEvidence: z.array(evidenceReference).max(2),
    contradictingEvidence: z.array(evidenceReference).max(2),
    materialQualifiersPresent: z.array(z.string().max(180)).max(6),
    missingOrOverstatedQualifiers: z.array(z.string().max(180)).max(6),
    parserConcerns: z.array(z.string().max(180)).max(4),
    descriptiveOnly: z.boolean(),
    injectionInfluence: z.literal(false),
    machineOnly: z.literal(true),
  })
  .strict();

const challengeObjection = z
  .object({
    type: z.enum(CHALLENGE_OBJECTION_TYPES),
    detail: z.string().min(1).max(220),
    evidence: z.array(evidenceReference).max(1),
  })
  .strict();

export const challengeResultSchema = z
  .object({
    candidateId: z.string().min(1),
    assessment: z.enum(CHALLENGE_ASSESSMENTS),
    rationale: z.string().min(1).max(350),
    objections: z.array(challengeObjection).max(5),
    injectionInfluence: z.literal(false),
    machineOnly: z.literal(true),
  })
  .strict();

export const duplicatePairResultSchema = z
  .object({
    sourceCandidateId: z.string().min(1),
    targetCandidateId: z.string().min(1),
    relationshipType: z.enum([
      'exact_duplicate',
      'semantic_duplicate',
      'restatement',
      'parent_child',
      'related_distinct',
      'uncertain',
    ]),
    rationale: z.string().min(1).max(500),
    materialDifferences: z.array(z.string().max(250)).max(12),
    machineOnly: z.literal(true),
  })
  .strict();

export type EntailmentResult = z.infer<typeof entailmentResultSchema>;
export type ChallengeResult = z.infer<typeof challengeResultSchema>;
export type DuplicatePairResult = z.infer<typeof duplicatePairResultSchema>;

const evidenceReferenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentId: { type: 'string', minLength: 1 },
    pageNumber: { type: 'integer', minimum: 1 },
    quote: { type: 'string', minLength: 1, maxLength: 500 },
  },
  required: ['documentId', 'pageNumber', 'quote'],
} as const;

export const entailmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidateId: { type: 'string', minLength: 1 },
    classification: { type: 'string', enum: [...ENTAILMENT_CLASSES] },
    rationale: { type: 'string', minLength: 1, maxLength: 350 },
    supportingEvidence: { type: 'array', maxItems: 2, items: evidenceReferenceJsonSchema },
    contradictingEvidence: { type: 'array', maxItems: 2, items: evidenceReferenceJsonSchema },
    materialQualifiersPresent: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', maxLength: 180 },
    },
    missingOrOverstatedQualifiers: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', maxLength: 180 },
    },
    parserConcerns: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', maxLength: 180 },
    },
    descriptiveOnly: { type: 'boolean' },
    injectionInfluence: { type: 'boolean', const: false },
    machineOnly: { type: 'boolean', const: true },
  },
  required: [
    'candidateId',
    'classification',
    'rationale',
    'supportingEvidence',
    'contradictingEvidence',
    'materialQualifiersPresent',
    'missingOrOverstatedQualifiers',
    'parserConcerns',
    'descriptiveOnly',
    'injectionInfluence',
    'machineOnly',
  ],
} as const;

export const challengeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidateId: { type: 'string', minLength: 1 },
    assessment: { type: 'string', enum: [...CHALLENGE_ASSESSMENTS] },
    rationale: { type: 'string', minLength: 1, maxLength: 350 },
    objections: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: [...CHALLENGE_OBJECTION_TYPES] },
          detail: { type: 'string', minLength: 1, maxLength: 220 },
          evidence: { type: 'array', maxItems: 1, items: evidenceReferenceJsonSchema },
        },
        required: ['type', 'detail', 'evidence'],
      },
    },
    injectionInfluence: { type: 'boolean', const: false },
    machineOnly: { type: 'boolean', const: true },
  },
  required: [
    'candidateId',
    'assessment',
    'rationale',
    'objections',
    'injectionInfluence',
    'machineOnly',
  ],
} as const;

export const duplicatePairJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceCandidateId: { type: 'string', minLength: 1 },
    targetCandidateId: { type: 'string', minLength: 1 },
    relationshipType: {
      type: 'string',
      enum: [
        'exact_duplicate',
        'semantic_duplicate',
        'restatement',
        'parent_child',
        'related_distinct',
        'uncertain',
      ],
    },
    rationale: { type: 'string', minLength: 1, maxLength: 500 },
    materialDifferences: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', maxLength: 250 },
    },
    machineOnly: { type: 'boolean', const: true },
  },
  required: [
    'sourceCandidateId',
    'targetCandidateId',
    'relationshipType',
    'rationale',
    'materialDifferences',
    'machineOnly',
  ],
} as const;
