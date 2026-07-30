import 'server-only';

import { z } from 'zod';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const phase9ExecutiveSummarySchema = z
  .object({
    version: z.literal('phase9-review-priority-v1'),
    totalFindings: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    exceptions: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    routine: z.number().int().nonnegative(),
    unresolvedCritical: z.number().int().nonnegative(),
    unresolvedExceptions: z.number().int().nonnegative(),
    unresolvedDuplicates: z.number().int().nonnegative(),
    unresolvedRoutine: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
    publishableAccepted: z.number().int().nonnegative(),
    invalidAccepted: z.number().int().nonnegative(),
    unrepresentedFindings: z.number().int().nonnegative(),
    followUp: z.number().int().nonnegative(),
    batchEligible: z.number().int().nonnegative(),
    individualReviewRemaining: z.number().int().nonnegative(),
    duplicateGroups: z.number().int().nonnegative(),
    submissionDeadlines: z.number().int().nonnegative(),
    questionDeadlines: z.number().int().nonnegative(),
    requiredForms: z.number().int().nonnegative(),
    signaturesAcknowledgments: z.number().int().nonnegative(),
    insuranceBondLicensing: z.number().int().nonnegative(),
    pricing: z.number().int().nonnegative(),
    unresolvedCoverageExceptions: z.number().int().nonnegative(),
    coverageExceptions: z.number().int().nonnegative(),
    coverageReviewed: z.number().int().nonnegative(),
    coverageFollowUp: z.number().int().nonnegative(),
    unresolvedDuplicateGroups: z.number().int().nonnegative(),
    publishedRequirements: z.number().int().nonnegative(),
    bidderEvidenceRequired: z.number().int().nonnegative(),
    reviewCompletionPercentage: z.coerce.number().min(0).max(100),
    publicationEligible: z.boolean(),
    nextRecommendedAction: z.enum([
      'review_critical',
      'review_exceptions',
      'review_duplicates',
      'accelerate_routine_review',
      'review_coverage_exceptions',
      'resolve_follow_up',
      'review_team_decisions',
      'publish_reviewed_requirements',
      'open_submission_checklist',
    ]),
  })
  .strict();
export type Phase9ExecutiveSummary = z.infer<typeof phase9ExecutiveSummarySchema>;

export const phase9ReviewQueueRowSchema = z
  .object({
    finding_id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    evaluation_run_id: z.string().uuid(),
    candidate_hash: z.string().regex(/^[0-9a-f]{64}$/),
    source_support_status: z.string(),
    precedence_status: z.string(),
    proof_requirement: z.string(),
    evidence_block_hashes: z.array(z.string()),
    ambiguity_code: z.string().nullable(),
    machine_only: z.boolean(),
    requirement_type: z.string(),
    obligation_text: z.string(),
    evidence_text: z.string(),
    material_facts: z.record(z.string(), z.unknown()),
    category: z.string(),
    form_reference: z.string().nullable(),
    deadline_iso: z.string().nullable(),
    mandatory_class: z.enum(['mandatory', 'optional', 'uncertain']),
    source_document_id: z.string().uuid().nullable(),
    source_document_key: z.string().nullable(),
    page_number: z.number().int().positive().nullable(),
    sheet_name: z.string().nullable(),
    cell_range: z.string().nullable(),
    quote_match_type: z.enum(['exact', 'normalized_exact', 'not_found']),
    evidence_count: z.number().int().nonnegative(),
    page_references_complete: z.boolean(),
    parser_uncertain: z.boolean(),
    unresolved_coverage_exception: z.boolean(),
    latest_decision_id: z.string().uuid().nullable(),
    human_decision: z.enum(['accepted', 'rejected', 'needs_follow_up']).nullable(),
    decision_created_at: z.string().nullable(),
    duplicate_signature: z.string().nullable(),
    duplicate_count: z.number().int().nonnegative(),
    duplicate_rank: z.number().int().positive(),
    canonical_candidate_hash: z.string().nullable(),
    review_lane: z.enum(['critical', 'exception', 'duplicate', 'routine']),
    lane_reason: z.string(),
    batch_accept_eligible: z.boolean(),
    batch_duplicate_reject_eligible: z.boolean(),
    priority_version: z.literal('phase9-review-priority-v1'),
    duplicate_policy_version: z.literal('phase9-duplicate-policy-v1'),
  })
  .passthrough();
export type Phase9ReviewQueueRow = z.infer<typeof phase9ReviewQueueRowSchema>;

const queueResponseSchema = z
  .object({
    version: z.literal('phase9-review-priority-v1'),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    rows: z.array(phase9ReviewQueueRowSchema).max(50),
  })
  .strict();
export type Phase9ReviewQueueResponse = z.infer<typeof queueResponseSchema>;

export const phase9CoverageExceptionSchema = z
  .object({
    source_document_id: z.string().uuid(),
    page_number: z.number().int().positive(),
    exception_reason: z.enum([
      'missing_coverage',
      'parser_uncertain',
      'candidate_not_assessed',
      'high_risk_signal_without_finding',
    ]),
    latest_decision_id: z.string().uuid().nullable(),
    human_decision: z.enum(['accepted', 'needs_follow_up']).nullable(),
  })
  .passthrough();
export type Phase9CoverageException = z.infer<typeof phase9CoverageExceptionSchema>;

export async function loadPhase9ExecutiveSummary(
  supabase: ServerSupabaseClient,
  workspaceId: string,
  evaluationRunId: string,
): Promise<Phase9ExecutiveSummary> {
  const { data, error } = await supabase.rpc('get_phase9_review_dashboard_v1', {
    p_workspace_id: workspaceId,
    p_evaluation_run_id: evaluationRunId,
  });
  if (error) throw new Error(`phase9_review_dashboard_failed:${error.message}`);
  return phase9ExecutiveSummarySchema.parse(data);
}

const phase9ReviewEffortObservationSchema = z
  .object({
    version: z.literal('phase9-review-effort-v1'),
    observedSecondsPerIndividualDecision: z.coerce.number().positive().nullable(),
    observedSecondsPerBatchItem: z.coerce.number().positive().nullable(),
    observedIndividualDecisionCount: z.coerce.number().int().nonnegative(),
    observedBatchOperationCount: z.coerce.number().int().nonnegative(),
  })
  .strict();
export type Phase9ReviewEffortObservation = z.infer<typeof phase9ReviewEffortObservationSchema>;

export async function loadPhase9ReviewEffortObservations(
  supabase: ServerSupabaseClient,
  workspaceId: string,
  evaluationRunId: string,
): Promise<Phase9ReviewEffortObservation> {
  const { data, error } = await supabase.rpc('get_phase9_review_effort_observations', {
    p_workspace_id: workspaceId,
    p_evaluation_run_id: evaluationRunId,
  });
  if (error) throw new Error(`phase9_review_effort_failed:${error.message}`);
  return phase9ReviewEffortObservationSchema.parse(data);
}

export async function loadPhase9ReviewQueue(
  supabase: ServerSupabaseClient,
  input: {
    workspaceId: string;
    evaluationRunId: string;
    lane: 'critical' | 'exception' | 'duplicate' | 'routine' | 'reviewed' | 'all';
    search: string;
    duplicateSignature?: string | null;
    page: number;
    pageSize?: number;
  },
): Promise<Phase9ReviewQueueResponse> {
  const { data, error } = await supabase.rpc('get_phase9_review_queue', {
    p_workspace_id: input.workspaceId,
    p_evaluation_run_id: input.evaluationRunId,
    p_lane: input.lane,
    p_search: input.search,
    p_duplicate_signature: input.duplicateSignature ?? null,
    p_page: input.page,
    p_page_size: input.pageSize ?? 25,
  });
  if (error) throw new Error(`phase9_review_queue_failed:${error.message}`);
  return queueResponseSchema.parse(data);
}

export async function loadPhase9CoverageExceptions(
  supabase: ServerSupabaseClient,
  workspaceId: string,
  evaluationRunId: string,
  limit = 25,
  page = 1,
): Promise<{ rows: Phase9CoverageException[]; total: number }> {
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const boundedPage = Math.max(1, Math.trunc(page));
  const scope = () =>
    supabase
      .from('phase9_coverage_exception_pages_v1')
      .select('source_document_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', evaluationRunId);
  const { error: countError, count } = await scope();
  if (countError) throw new Error(`phase9_coverage_queue_failed:${countError.message}`);
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / boundedLimit));
  const resolvedPage = Math.min(boundedPage, pageCount);
  const { data, error } = await supabase
    .from('phase9_coverage_exception_pages_v1')
    .select('source_document_id,page_number,exception_reason,latest_decision_id,human_decision')
    .eq('workspace_id', workspaceId)
    .eq('evaluation_run_id', evaluationRunId)
    .order('latest_decision_id', { ascending: true, nullsFirst: true })
    .order('source_document_id')
    .order('page_number')
    .range((resolvedPage - 1) * boundedLimit, resolvedPage * boundedLimit - 1);
  if (error) throw new Error(`phase9_coverage_queue_failed:${error.message}`);
  return {
    rows: z
      .array(phase9CoverageExceptionSchema)
      .max(50)
      .parse(data ?? []),
    total,
  };
}
