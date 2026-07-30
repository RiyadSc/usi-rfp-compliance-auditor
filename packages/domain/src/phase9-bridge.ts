import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  checklistCategorySchema,
  humanReviewStatusSchema,
  precedenceStatusSchema,
  proofRequirementSchema,
  sourceSupportStatusSchema,
  type ChecklistCategory,
} from './checklist';

export const PHASE9_REVIEW_VERSION = 'phase9-finding-review-v1';
export const PHASE9_COVERAGE_REVIEW_VERSION = 'phase9-coverage-review-v1';
export const PHASE9_BRIDGE_VERSION = 'phase9-reviewed-bridge-v1';
export const PHASE9_COVERAGE_SUMMARY_VERSION = 'phase9-coverage-summary-v1';

export const phase9ReviewDecisionSchema = humanReviewStatusSchema.exclude(['waived', 'pending']);

export const phase9ReviewCorrectionSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    category: checklistCategorySchema.optional(),
    mandatoryClass: z.enum(['mandatory', 'optional', 'uncertain']).optional(),
  })
  .strict();

export const phase9FindingReviewInputSchema = z
  .object({
    workspaceId: z.string().uuid(),
    evaluationRunId: z.string().uuid(),
    candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: phase9ReviewDecisionSchema,
    note: z.string().trim().max(4000).default(''),
    corrections: phase9ReviewCorrectionSchema.default({}),
  })
  .superRefine((value, context) => {
    if (value.decision !== 'accepted' && value.note.length < 5)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A rejection or follow-up decision requires a short reason.',
      });
    if (value.decision !== 'accepted' && Object.keys(value.corrections).length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corrections'],
        message: 'Corrections may only accompany an accepted source assessment.',
      });
  });
export type Phase9FindingReviewInput = z.infer<typeof phase9FindingReviewInputSchema>;

export const phase9CoverageReviewInputSchema = z
  .object({
    workspaceId: z.string().uuid(),
    evaluationRunId: z.string().uuid(),
    documentId: z.string().uuid(),
    pageNumber: z.number().int().positive(),
    decision: z.enum(['accepted', 'needs_follow_up']),
    note: z.string().trim().max(4000).default(''),
  })
  .superRefine((value, context) => {
    if (value.decision === 'needs_follow_up' && value.note.length < 5)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A follow-up decision requires a short reason.',
      });
  });
export type Phase9CoverageReviewInput = z.infer<typeof phase9CoverageReviewInputSchema>;

export const phase9PromotionInputSchema = z.object({
  sourceSupportStatus: sourceSupportStatusSchema,
  precedenceStatus: precedenceStatusSchema,
  proofRequirement: proofRequirementSchema,
  machineOnly: z.literal(true),
  reviewDecision: phase9ReviewDecisionSchema.nullable(),
  evidenceCount: z.number().int().nonnegative(),
  pageReferencesComplete: z.boolean(),
  quoteMatchType: z.enum(['exact', 'normalized_exact', 'not_found']),
});
export type Phase9PromotionInput = z.infer<typeof phase9PromotionInputSchema>;

export type Phase9PromotionResult =
  | { eligible: true; reason: 'accepted_supported_active_with_valid_evidence' }
  | {
      eligible: false;
      reason:
        | 'human_review_required'
        | 'human_review_rejected_or_follow_up'
        | 'source_not_supported'
        | 'precedence_not_active'
        | 'machine_status_invalid'
        | 'evidence_missing'
        | 'page_reference_missing'
        | 'quote_not_validated';
    };

/** Fail-closed gate used before any Phase 9 result can enter the Phase 4 register. */
export function evaluatePhase9Promotion(raw: Phase9PromotionInput): Phase9PromotionResult {
  const input = phase9PromotionInputSchema.parse(raw);
  if (!input.machineOnly) return { eligible: false, reason: 'machine_status_invalid' };
  if (!input.reviewDecision) return { eligible: false, reason: 'human_review_required' };
  if (input.reviewDecision !== 'accepted')
    return { eligible: false, reason: 'human_review_rejected_or_follow_up' };
  if (input.sourceSupportStatus !== 'supported')
    return { eligible: false, reason: 'source_not_supported' };
  if (input.precedenceStatus !== 'active')
    return { eligible: false, reason: 'precedence_not_active' };
  if (input.evidenceCount < 1) return { eligible: false, reason: 'evidence_missing' };
  if (!input.pageReferencesComplete) return { eligible: false, reason: 'page_reference_missing' };
  if (!['exact', 'normalized_exact'].includes(input.quoteMatchType))
    return { eligible: false, reason: 'quote_not_validated' };
  return { eligible: true, reason: 'accepted_supported_active_with_valid_evidence' };
}

export function normalizePhase9Evidence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function phase9EvidenceMatch(
  quote: string,
  pageText: string,
): 'exact' | 'normalized_exact' | 'not_found' {
  if (quote.length > 0 && pageText.includes(quote)) return 'exact';
  const normalizedQuote = normalizePhase9Evidence(quote);
  if (normalizedQuote.length > 0 && normalizePhase9Evidence(pageText).includes(normalizedQuote))
    return 'normalized_exact';
  return 'not_found';
}

export function phase9BridgeInputHash(input: {
  evaluationRunId: string;
  reviewDecisionIds: string[];
  candidateHashes: string[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: PHASE9_BRIDGE_VERSION,
        evaluationRunId: input.evaluationRunId,
        reviewDecisionIds: [...input.reviewDecisionIds].sort(),
        candidateHashes: [...input.candidateHashes].sort(),
      }),
    )
    .digest('hex');
}

export function mapPhase9RequirementCategory(input: {
  requirementType: string;
  obligationText: string;
  formReference?: string | null;
}): ChecklistCategory {
  const type = input.requirementType.toLowerCase();
  const text = `${input.obligationText} ${input.formReference ?? ''}`.toLowerCase();
  if (
    /\b(questions?|inquir(?:y|ies))\b/.test(text) &&
    /\b(due|deadline|submit(?:ted)?)\b/.test(text)
  )
    return 'question_deadline';
  if (
    type === 'deadline' ||
    /\b(proposal|bid|response|submission)\b.*\b(due|deadline)\b/.test(text)
  )
    return 'submission_deadline';
  if (type === 'form' || input.formReference || /\bform\s+[a-z0-9-]+\b/i.test(text))
    return /\b(price|pricing|cost)\b/.test(text) ? 'pricing_form' : 'mandatory_form';
  if (
    /\b(addendum|amendment)\b.*\b(acknowledge|acknowledgment|confirm)\b/.test(text) ||
    /\b(acknowledge|acknowledgment|confirm)\b.*\b(addendum|amendment)\b/.test(text)
  )
    return 'addendum_acknowledgment';
  if (type === 'signature' || /\b(sign|signature|signed)\b/.test(text)) return 'signature';
  if (/\binitials?\b|\binitialed\b/.test(text)) return 'initials';
  if (/\backnowledg(?:e|ement|ment)\b/.test(text)) return 'acknowledgment';
  if (/\battest(?:ation)?\b/.test(text)) return 'attestation';
  if (type === 'insurance' || /\binsurance\b/.test(text)) return 'insurance';
  if (type === 'license' || /\blicen[cs]e\b|\bpermit\b/.test(text)) return 'license';
  if (type === 'meeting' || /\b(pre[- ]?bid|site visit|conference|meeting)\b/.test(text))
    return /\bsite visit\b/.test(text)
      ? 'site_visit'
      : /\bpre[- ]?bid|conference\b/.test(text)
        ? 'pre_bid_conference'
        : 'meeting';
  if (type === 'pricing' || /\bpricing\b|\bcost sheet\b/.test(text)) return 'pricing_form';
  if (type === 'attachment' || /\battachment\b/.test(text)) return 'attachment';
  if (/\bbond\b/.test(text)) return 'bond';
  if (/\bcertificate|certification\b/.test(text)) return 'certification';
  if (type === 'staffing' || /\bstaffing plan\b/.test(text)) return 'staffing_plan';
  if (/\bresume\b/.test(text)) return 'resume';
  if (/\breference\b/.test(text)) return 'reference';
  if (
    /\bsubcontractor\b.*\b(disclose|disclosure|list|identify)\b/.test(text) ||
    /\b(disclose|disclosure|list|identify)\b.*\bsubcontractor\b/.test(text)
  )
    return 'subcontractor_disclosure';
  if (/\b(electronic|portal|email)\b/.test(text) && /\b(submit|deliver|upload)\b/.test(text))
    return 'electronic_submission';
  if (
    /\b(sealed|hard cop(?:y|ies)|physical)\b/.test(text) &&
    /\b(submit|deliver|package)\b/.test(text)
  )
    return 'physical_submission';
  if (/\bcopy|copies\b/.test(text)) return 'copy_count';
  if (/\bfile name|naming convention\b/.test(text)) return 'naming_requirement';
  if (/\bfile format\b|\.pdf\b|\.xlsx\b/.test(text)) return 'file_format';
  if (/\bdelivery method|deliver by|submit by\b/.test(text)) return 'delivery_method';
  if (/\bpackage|packaging|seal(?:ed|ing)?\b/.test(text)) return 'packaging_requirement';
  return 'other_material_requirement';
}

export type Phase9CoveragePageInput = {
  documentId: string;
  pageNumber: number;
  route: string;
  parserUncertain: boolean;
  hasFinding: boolean;
  hasSeedWithoutFinding: boolean;
  hasFormSignal: boolean;
  hasDeadlineSignal: boolean;
};

export function summarizePhase9Coverage(input: {
  expectedPages: Array<{ documentId: string; pageNumber: number }>;
  pages: Phase9CoveragePageInput[];
}) {
  const byPage = new Map(
    input.pages.map((page) => [`${page.documentId}:${page.pageNumber}`, page]),
  );
  const rows = input.expectedPages.map(
    (expected) =>
      byPage.get(`${expected.documentId}:${expected.pageNumber}`) ?? {
        ...expected,
        route: 'missing',
        parserUncertain: false,
        hasFinding: false,
        hasSeedWithoutFinding: false,
        hasFormSignal: false,
        hasDeadlineSignal: false,
      },
  );
  const reviewedPages = rows.filter((page) => page.route !== 'missing').length;
  const requirementPages = rows.filter((page) => page.hasFinding).length;
  const noRequirementPages = rows.filter(
    (page) =>
      !page.hasFinding &&
      !page.hasSeedWithoutFinding &&
      !page.parserUncertain &&
      page.route !== 'missing',
  ).length;
  const exceptionPages = rows.filter(
    (page) =>
      page.parserUncertain ||
      page.hasSeedWithoutFinding ||
      page.route === 'missing' ||
      ((page.hasFormSignal || page.hasDeadlineSignal) && !page.hasFinding),
  ).length;
  return {
    version: PHASE9_COVERAGE_SUMMARY_VERSION,
    totalPages: rows.length,
    reviewedPages,
    requirementPages,
    noRequirementPages,
    parserUncertainPages: rows.filter((page) => page.parserUncertain).length,
    unexaminedPages: rows.length - reviewedPages,
    exceptionPages,
    complete: rows.length > 0 && reviewedPages === rows.length && exceptionPages === 0,
    pages: rows,
  };
}
