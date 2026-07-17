import { z } from 'zod';

export const VERIFICATION_SCHEMA_VERSION = 'verification-finding-v1';
export const MAX_VERIFICATION_SCHEMA_REPAIRS = 1;

export const SOURCE_SUPPORT_STATUSES = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
] as const;

export const PRECEDENCE_STATUSES = ['active', 'superseded', 'conflicting', 'undetermined'] as const;

export const PROOF_REQUIREMENTS = [
  'none_identified',
  'requires_human_confirmation',
  'requires_company_artifact',
  'requires_external_validation',
  'undetermined',
] as const;

export const HUMAN_REVIEW_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'needs_follow_up',
  'waived',
] as const;

export const EVIDENCE_MATCH_TYPES = [
  'exact',
  'normalized_exact',
  'fuzzy_candidate',
  'not_found',
] as const;

export const RELATIONSHIP_TYPES = [
  'exact_duplicate',
  'semantic_duplicate',
  'restatement',
  'parent_child',
  'related_distinct',
  'uncertain',
] as const;

export const evidenceReferenceSchema = z.object({
  documentId: z.string().min(1),
  pageNumber: z.number().int().min(1),
  quote: z.string().min(1).max(2000),
});

export const deterministicFactProposalSchema = z.object({
  kind: z.enum([
    'date',
    'time',
    'currency',
    'percentage',
    'count',
    'duration',
    'form_identifier',
    'other',
  ]),
  sourceString: z.string().min(1).max(300),
  candidateValue: z.string().max(300),
  sourceValue: z.string().max(300),
  unit: z.string().max(80),
  comparisonOperator: z.enum(['eq', 'gte', 'lte', 'gt', 'lt', 'unknown']),
});

export const duplicateProposalSchema = z.object({
  candidateId: z.string().min(1),
  relationshipType: z.enum(RELATIONSHIP_TYPES),
  rationale: z.string().min(1).max(500),
});

export const modelVerificationFindingSchema = z.object({
  candidateId: z.string().min(1),
  sourceSupportStatus: z.enum(SOURCE_SUPPORT_STATUSES),
  precedenceStatus: z.enum(PRECEDENCE_STATUSES),
  proofRequirement: z.enum(PROOF_REQUIREMENTS),
  rationale: z.string().min(1).max(2000),
  supportingEvidence: z.array(evidenceReferenceSchema).max(12),
  contradictingEvidence: z.array(evidenceReferenceSchema).max(12),
  addendumEvidence: z.array(evidenceReferenceSchema).max(12),
  materialMismatches: z.array(z.string().max(500)).max(20),
  deterministicFacts: z.array(deterministicFactProposalSchema).max(30),
  duplicateProposals: z.array(duplicateProposalSchema).max(20),
  parserConcerns: z.array(z.string().max(500)).max(20),
  ambiguityNotes: z.array(z.string().max(500)).max(20),
  machineOnly: z.literal(true),
});

export const modelVerificationOutputSchema = z.object({
  findings: z.array(modelVerificationFindingSchema).max(100),
  notes: z.string().max(2000),
});

export type ModelVerificationFinding = z.infer<typeof modelVerificationFindingSchema>;
export type ModelVerificationOutput = z.infer<typeof modelVerificationOutputSchema>;

const evidenceReferenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentId: { type: 'string', minLength: 1 },
    pageNumber: { type: 'integer', minimum: 1 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
  },
  required: ['documentId', 'pageNumber', 'quote'],
} as const;

export const modelVerificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          candidateId: { type: 'string', minLength: 1 },
          sourceSupportStatus: { type: 'string', enum: [...SOURCE_SUPPORT_STATUSES] },
          precedenceStatus: { type: 'string', enum: [...PRECEDENCE_STATUSES] },
          proofRequirement: { type: 'string', enum: [...PROOF_REQUIREMENTS] },
          rationale: { type: 'string', minLength: 1, maxLength: 2000 },
          supportingEvidence: { type: 'array', maxItems: 12, items: evidenceReferenceJsonSchema },
          contradictingEvidence: {
            type: 'array',
            maxItems: 12,
            items: evidenceReferenceJsonSchema,
          },
          addendumEvidence: { type: 'array', maxItems: 12, items: evidenceReferenceJsonSchema },
          materialMismatches: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 500 },
          },
          deterministicFacts: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: {
                  type: 'string',
                  enum: [
                    'date',
                    'time',
                    'currency',
                    'percentage',
                    'count',
                    'duration',
                    'form_identifier',
                    'other',
                  ],
                },
                sourceString: { type: 'string', minLength: 1, maxLength: 300 },
                candidateValue: { type: 'string', maxLength: 300 },
                sourceValue: { type: 'string', maxLength: 300 },
                unit: { type: 'string', maxLength: 80 },
                comparisonOperator: {
                  type: 'string',
                  enum: ['eq', 'gte', 'lte', 'gt', 'lt', 'unknown'],
                },
              },
              required: [
                'kind',
                'sourceString',
                'candidateValue',
                'sourceValue',
                'unit',
                'comparisonOperator',
              ],
            },
          },
          duplicateProposals: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                candidateId: { type: 'string', minLength: 1 },
                relationshipType: { type: 'string', enum: [...RELATIONSHIP_TYPES] },
                rationale: { type: 'string', minLength: 1, maxLength: 500 },
              },
              required: ['candidateId', 'relationshipType', 'rationale'],
            },
          },
          parserConcerns: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 500 },
          },
          ambiguityNotes: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 500 },
          },
          machineOnly: { type: 'boolean', const: true },
        },
        required: [
          'candidateId',
          'sourceSupportStatus',
          'precedenceStatus',
          'proofRequirement',
          'rationale',
          'supportingEvidence',
          'contradictingEvidence',
          'addendumEvidence',
          'materialMismatches',
          'deterministicFacts',
          'duplicateProposals',
          'parserConcerns',
          'ambiguityNotes',
          'machineOnly',
        ],
      },
    },
    notes: { type: 'string', maxLength: 2000 },
  },
  required: ['findings', 'notes'],
} as const;

export const humanReviewInputSchema = z
  .object({
    findingId: z.string().uuid(),
    decision: z.enum(['accepted', 'rejected', 'needs_follow_up', 'waived']),
    note: z.string().trim().max(4000),
    correctedValues: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({}),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'waived' && value.note.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Waiver requires a reason',
      });
    }
  });

const VERIFICATION_RUN_TRANSITIONS: Record<string, readonly string[]> = {
  queued: ['retrieving', 'cancelled', 'budget_exceeded', 'failed'],
  retrieving: ['verifying', 'cancelled', 'budget_exceeded', 'failed'],
  verifying: ['post_validating', 'cancelled', 'budget_exceeded', 'failed'],
  post_validating: ['completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
  budget_exceeded: [],
};

export function canTransitionVerificationRun(from: string, to: string): boolean {
  return VERIFICATION_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canReviseHumanReview(from: string, to: string): boolean {
  if (!HUMAN_REVIEW_STATUSES.includes(from as (typeof HUMAN_REVIEW_STATUSES)[number])) return false;
  return ['accepted', 'rejected', 'needs_follow_up', 'waived'].includes(to) && from !== to;
}
