import { z } from 'zod';

export const REQUIREMENT_CATEGORIES = [
  'required_form',
  'attachment',
  'signature',
  'certification',
  'insurance',
  'deadline',
  'mandatory_meeting',
  'submission_instruction',
  'staffing_requirement',
  'licensing_requirement',
  'pricing_instruction',
  'evaluation_criterion',
  'transition_requirement',
  'reporting_requirement',
  'technical_requirement',
  'contractual_term',
  'other',
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const SCHEMA_VERSION = 'candidate-v1';

export const requirementCandidateSchema = z.object({
  id: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  category: z.enum(REQUIREMENT_CATEGORIES),
  title: z.string().min(1).max(300),
  obligation: z.string().min(1).max(4000),
  mandatoryClass: z.enum(['mandatory', 'optional', 'uncertain']),
  preliminaryPage: z.number().int().min(1),
  evidenceQuote: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  ambiguityNotes: z.array(z.string().max(500)).max(20),
  /** Phase 3: extraction cannot create verified requirements. */
  status: z.literal('unverified'),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  modelId: z.string().min(1),
});

export type RequirementCandidate = z.infer<typeof requirementCandidateSchema>;

/** Model-facing schema (IDs injected server-side after validation). */
export const modelCandidateSchema = z.object({
  category: z.enum(REQUIREMENT_CATEGORIES),
  title: z.string().min(1).max(300),
  obligation: z.string().min(1).max(4000),
  mandatoryClass: z.enum(['mandatory', 'optional', 'uncertain']),
  preliminaryPage: z.number().int().min(1),
  evidenceQuote: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  ambiguityNotes: z.array(z.string().max(500)).max(20),
});

export const modelExtractionSchema = z.object({
  candidates: z.array(modelCandidateSchema).max(100),
  notes: z.string().max(2000).optional(),
});

export type ModelExtraction = z.infer<typeof modelExtractionSchema>;

export const modelExtractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: [...REQUIREMENT_CATEGORIES] },
          title: { type: 'string', minLength: 1, maxLength: 300 },
          obligation: { type: 'string', minLength: 1, maxLength: 4000 },
          mandatoryClass: { type: 'string', enum: ['mandatory', 'optional', 'uncertain'] },
          preliminaryPage: { type: 'integer', minimum: 1 },
          evidenceQuote: { type: 'string', maxLength: 2000 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          ambiguityNotes: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 500 },
          },
        },
        required: [
          'category',
          'title',
          'obligation',
          'mandatoryClass',
          'preliminaryPage',
          'evidenceQuote',
          'confidence',
          'ambiguityNotes',
        ],
      },
    },
    notes: { type: 'string', maxLength: 2000 },
  },
  // Strict Structured Outputs requires every property to be listed as required.
  // `notes` may be the empty string when there is nothing to report.
  required: ['candidates', 'notes'],
} as const;
