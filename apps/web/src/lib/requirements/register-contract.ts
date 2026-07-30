import { z } from 'zod';

const registerRowSchema = z
  .object({
    id: z.string().uuid(),
    analysisRunId: z.string().uuid(),
    category: z.string().min(1).max(160),
    title: z.string(),
    obligation: z.string(),
    mandatoryClass: z.enum(['mandatory', 'optional', 'uncertain']),
    preliminaryPage: z.number().int().positive(),
    documentId: z.string().uuid(),
    createdAt: z.string(),
    documentName: z.string().nullable(),
    findingId: z.string().uuid().nullable(),
    sourceSupportStatus: z
      .enum(['supported', 'partially_supported', 'unsupported', 'contradicted', 'parser_uncertain'])
      .nullable(),
    precedenceStatus: z.enum(['active', 'superseded', 'conflicting', 'undetermined']).nullable(),
    proofRequirement: z
      .enum([
        'none_identified',
        'requires_human_confirmation',
        'requires_company_artifact',
        'requires_external_validation',
        'undetermined',
      ])
      .nullable(),
    findingCreatedAt: z.string().nullable(),
    verificationRunId: z.string().uuid().nullable(),
    humanReviewStatus: z.enum(['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived']),
  })
  .strict();

export const requirementRegisterResponseSchema = z
  .object({
    version: z.literal('requirement-register-query-v1'),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    summary: z
      .object({
        totalRequirements: z.number().int().nonnegative(),
        needsAttention: z.number().int().nonnegative(),
        companyEvidenceRequired: z.number().int().nonnegative(),
        pendingReviews: z.number().int().nonnegative(),
      })
      .strict(),
    categories: z.array(z.string().min(1).max(160)).max(200),
    rows: z.array(registerRowSchema).max(50),
  })
  .strict();

export type RequirementRegisterResponse = z.infer<typeof requirementRegisterResponseSchema>;
