import { z } from 'zod';

export const ENTAILMENT_PROMPT_VERSION = 'verify-entailment-v5';
export const ENTAILMENT_SCHEMA_VERSION = 'verification-entailment-v3';
export const CHALLENGE_PROMPT_VERSION = 'verify-challenge-v3';
export const CHALLENGE_SCHEMA_VERSION = 'verification-challenge-v3';
export const DUPLICATE_PROMPT_VERSION = 'verify-duplicate-v1';
export const DUPLICATE_SCHEMA_VERSION = 'verification-duplicate-v1';
export const DECISION_ENGINE_VERSION = 'verification-decision-v6';
export const FACT_ENVELOPE_VERSION = 'verification-facts-v4';
export const FINAL_ASSESSMENT_SCHEMA_VERSION = 'verification-final-assessment-v1';

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
] as const;

const semanticEvidenceReference = z
  .object({
    documentId: z.string().min(1),
    pageNumber: z.number().int().min(1),
    quote: z.string().min(1).max(240),
  })
  .strict();

export const entailmentResultSchema = z
  .object({
    candidateId: z.string().min(1),
    classification: z.enum(ENTAILMENT_CLASSES),
    rationale: z.string().min(1).max(160),
    supportingEvidence: z.array(semanticEvidenceReference).max(1),
    contradictingEvidence: z.array(semanticEvidenceReference).max(1),
    materialQualifiersPresent: z.array(z.string().min(1).max(80)).max(3),
    missingOrOverstatedQualifiers: z.array(z.string().min(1).max(100)).max(3),
    parserConcerns: z.array(z.string().min(1).max(100)).max(2),
    descriptiveOnly: z.boolean(),
    injectionInfluence: z.literal(false),
    machineOnly: z.literal(true),
  })
  .strict()
  .superRefine((result, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (result.classification === 'entails') {
      if (result.supportingEvidence.length !== 1)
        issue('supportingEvidence', 'semantic_contract.entails_requires_one_supporting_reference');
      if (result.contradictingEvidence.length)
        issue('contradictingEvidence', 'semantic_contract.entails_forbids_contradicting_evidence');
      if (result.missingOrOverstatedQualifiers.length)
        issue(
          'missingOrOverstatedQualifiers',
          'semantic_contract.entails_forbids_material_mismatches',
        );
      if (result.parserConcerns.length)
        issue('parserConcerns', 'semantic_contract.entails_forbids_parser_concerns');
      if (result.descriptiveOnly)
        issue('descriptiveOnly', 'semantic_contract.descriptive_text_cannot_entail');
    }
    if (result.classification === 'partially_entails') {
      if (result.supportingEvidence.length !== 1)
        issue('supportingEvidence', 'semantic_contract.partial_requires_one_supporting_reference');
      if (!result.missingOrOverstatedQualifiers.length)
        issue(
          'missingOrOverstatedQualifiers',
          'semantic_contract.partial_requires_material_mismatch',
        );
      if (result.descriptiveOnly)
        issue('descriptiveOnly', 'semantic_contract.descriptive_text_cannot_partially_entail');
    }
    if (result.classification === 'contradicts') {
      if (result.contradictingEvidence.length !== 1)
        issue(
          'contradictingEvidence',
          'semantic_contract.contradiction_requires_one_opposing_reference',
        );
      if (result.supportingEvidence.length)
        issue('supportingEvidence', 'semantic_contract.contradiction_forbids_supporting_evidence');
      if (result.missingOrOverstatedQualifiers.length)
        issue(
          'missingOrOverstatedQualifiers',
          'semantic_contract.contradiction_is_not_a_missing_qualifier',
        );
      if (result.descriptiveOnly)
        issue('descriptiveOnly', 'semantic_contract.descriptive_text_is_insufficient');
    }
    if (result.classification === 'insufficient') {
      if (result.supportingEvidence.length)
        issue('supportingEvidence', 'semantic_contract.insufficient_forbids_supporting_evidence');
      if (result.contradictingEvidence.length)
        issue('contradictingEvidence', 'semantic_contract.insufficient_forbids_opposing_evidence');
      if (result.missingOrOverstatedQualifiers.length)
        issue(
          'missingOrOverstatedQualifiers',
          'semantic_contract.insufficient_forbids_material_mismatches',
        );
    }
    if (result.classification === 'parser_uncertain') {
      if (!result.parserConcerns.length)
        issue('parserConcerns', 'semantic_contract.parser_uncertain_requires_limitation');
      if (result.supportingEvidence.length || result.contradictingEvidence.length)
        issue('supportingEvidence', 'semantic_contract.parser_uncertain_forbids_evidence_claims');
      if (result.missingOrOverstatedQualifiers.length)
        issue(
          'missingOrOverstatedQualifiers',
          'semantic_contract.parser_uncertain_forbids_material_mismatches',
        );
    }
  });

const challengeObjection = z
  .object({
    type: z.enum(CHALLENGE_OBJECTION_TYPES),
    candidateProposition: z.string().min(1).max(120),
    qualifierOrConflict: z.string().min(1).max(100),
    materialEffect: z.string().min(1).max(140),
    evidence: z.array(semanticEvidenceReference).length(1),
  })
  .strict();

export const challengeResultSchema = z
  .object({
    candidateId: z.string().min(1),
    assessment: z.enum(CHALLENGE_ASSESSMENTS),
    rationale: z.string().min(1).max(160),
    objections: z.array(challengeObjection).max(2),
    injectionInfluence: z.literal(false),
    machineOnly: z.literal(true),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.assessment === 'no_material_objection' && result.objections.length)
      context.addIssue({
        code: 'custom',
        path: ['objections'],
        message: 'semantic_contract.no_objection_forbids_objections',
      });
    if (result.assessment !== 'no_material_objection' && !result.objections.length)
      context.addIssue({
        code: 'custom',
        path: ['objections'],
        message: 'semantic_contract.material_assessment_requires_objection',
      });
    const allowedByAssessment = {
      no_material_objection: [],
      material_qualification_missing: [
        'missing_condition',
        'overstated_scope',
        'wrong_party',
        'wrong_deadline',
        'wrong_amount_or_unit',
        'wrong_form',
        'omitted_exception',
      ],
      contradictory_evidence: [
        'wrong_party',
        'wrong_deadline',
        'wrong_amount_or_unit',
        'wrong_form',
        'omitted_exception',
        'descriptive_not_obligatory',
      ],
      precedence_problem: ['superseding_addendum', 'unresolved_conflict'],
      insufficient_evidence: ['insufficient_evidence'],
      parser_uncertain: ['parser_quality'],
    } as const;
    const allowed = allowedByAssessment[result.assessment] as readonly string[];
    for (let index = 0; index < result.objections.length; index += 1)
      if (!allowed.includes(result.objections[index]!.type))
        context.addIssue({
          code: 'custom',
          path: ['objections', index, 'type'],
          message: 'semantic_contract.objection_type_does_not_match_assessment',
        });
  });

const finalEvidenceReference = z
  .object({
    documentId: z.string().min(1),
    pageNumber: z.number().int().min(1),
    quote: z.string().min(1).max(500),
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

export const finalMachineAssessmentSchema = z
  .object({
    candidateId: z.string().min(1),
    sourceSupportStatus: z.enum([
      'supported',
      'partially_supported',
      'unsupported',
      'contradicted',
      'parser_uncertain',
    ]),
    precedenceStatus: z.enum(['active', 'superseded', 'conflicting', 'undetermined']),
    proofRequirement: z.enum([
      'none_identified',
      'requires_human_confirmation',
      'requires_company_artifact',
      'requires_external_validation',
      'undetermined',
    ]),
    rationale: z.string().min(1).max(2000),
    supportingEvidence: z.array(finalEvidenceReference).max(2),
    contradictingEvidence: z.array(finalEvidenceReference).max(2),
    materialMismatches: z.array(z.string().min(1).max(500)).max(30),
    parserConcerns: z.array(z.string().min(1).max(500)).max(20),
    ambiguityNotes: z.array(z.string().min(1).max(500)).max(20),
    deterministicModelDisagreement: z.array(z.string().min(1).max(500)).max(20),
    challengeStatus: z.enum(['not_required', 'completed', 'failed']),
    humanReviewStatus: z.literal('pending'),
    machineOnly: z.literal(true),
  })
  .strict();

export type EntailmentResult = z.infer<typeof entailmentResultSchema>;
export type ChallengeResult = z.infer<typeof challengeResultSchema>;
export type DuplicatePairResult = z.infer<typeof duplicatePairResultSchema>;
export type FinalMachineAssessmentResult = z.infer<typeof finalMachineAssessmentSchema>;

const evidenceReferenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentId: { type: 'string', minLength: 1 },
    pageNumber: { type: 'integer', minimum: 1 },
    quote: { type: 'string', minLength: 1, maxLength: 240 },
  },
  required: ['documentId', 'pageNumber', 'quote'],
} as const;

export const entailmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidateId: { type: 'string', minLength: 1 },
    classification: {
      type: 'string',
      enum: [...ENTAILMENT_CLASSES],
      description:
        'entails=complete material meaning; partially_entails=central obligation plus a material mismatch; contradicts=explicit opposite; insufficient=neither proposition established; parser_uncertain=parser limitation blocks assessment.',
    },
    rationale: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      description: 'One concise sentence. Do not repeat the candidate or evidence quote.',
    },
    supportingEvidence: {
      type: 'array',
      maxItems: 1,
      description:
        'Exactly one item only for entails or partially_entails; otherwise an empty array.',
      items: evidenceReferenceJsonSchema,
    },
    contradictingEvidence: {
      type: 'array',
      maxItems: 1,
      description: 'Exactly one item only for contradicts; otherwise an empty array.',
      items: evidenceReferenceJsonSchema,
    },
    materialQualifiersPresent: {
      type: 'array',
      maxItems: 3,
      description: 'Short present qualifiers only; never repeat full candidate or evidence text.',
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    missingOrOverstatedQualifiers: {
      type: 'array',
      maxItems: 3,
      description:
        'Required and non-empty only for partially_entails. MUST be [] for entails, contradicts, insufficient, and parser_uncertain.',
      items: { type: 'string', minLength: 1, maxLength: 100 },
    },
    parserConcerns: {
      type: 'array',
      maxItems: 2,
      description: 'Required only for parser_uncertain; otherwise use [].',
      items: { type: 'string', minLength: 1, maxLength: 100 },
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
    assessment: {
      type: 'string',
      enum: [...CHALLENGE_ASSESSMENTS],
      description:
        'Use no_material_objection unless at least one grounded objection has an exact candidate proposition, exact evidence, and an explicit material difference.',
    },
    rationale: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      description: 'One concise sentence; do not repeat candidate or evidence.',
    },
    objections: {
      type: 'array',
      maxItems: 2,
      description:
        'MUST be [] for no_material_objection. Every objection must be grounded in an explicit comparable difference; unknown scope is not a difference.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: [...CHALLENGE_OBJECTION_TYPES] },
          candidateProposition: { type: 'string', minLength: 1, maxLength: 120 },
          qualifierOrConflict: { type: 'string', minLength: 1, maxLength: 100 },
          materialEffect: { type: 'string', minLength: 1, maxLength: 140 },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: evidenceReferenceJsonSchema,
          },
        },
        required: [
          'type',
          'candidateProposition',
          'qualifierOrConflict',
          'materialEffect',
          'evidence',
        ],
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
