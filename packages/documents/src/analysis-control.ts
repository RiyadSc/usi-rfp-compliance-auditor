import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CACHE_VERSION = 'analysis-cache-v1';
export const COST_ESTIMATOR_VERSION = 'analysis-cost-estimator-v1';
export const MODEL_TIER_VERSION = 'analysis-tiers-v1';
export const JOB_VERSION = 'large-document-jobs-v1';

export const analysisModeSchema = z.enum(['quick_scan', 'standard_analysis', 'deep_audit']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const ANALYSIS_MODES = {
  quick_scan: {
    providerAllowed: false,
    finalVerification: false,
    description: 'Find likely sections, major dates, forms, and estimate a later analysis.',
  },
  standard_analysis: {
    providerAllowed: true,
    finalVerification: true,
    description:
      'Extract candidates, independently verify, and generate evidence-linked workflow records.',
  },
  deep_audit: {
    providerAllowed: true,
    finalVerification: true,
    description: 'Add targeted review for complex tables, addenda, conflicts, and ambiguity.',
  },
} as const;

export const modelTierSchema = z.enum([
  'tier_0_deterministic',
  'tier_1_classification',
  'tier_2_extraction',
  'tier_3_verification',
  'tier_4_ambiguity',
]);
export type ModelTier = z.infer<typeof modelTierSchema>;

export const modelTierTaskSchema = z.object({
  tier: modelTierSchema,
  task: z.string().min(1).max(100),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().nonnegative(),
  requiresIndependentPriorStage: z.boolean(),
  escalationReason: z.string().max(300).optional(),
});

export const cacheKeyInputSchema = z.object({
  workspaceId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  sourceFileHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  parserAdapterId: z.string().min(1),
  parserVersion: z.string().min(1),
  normalizationVersion: z.string().min(1),
  ocrPolicyVersion: z.string().min(1),
  tableExtractionVersion: z.string().min(1),
  prefilterVersion: z.string().min(1),
  indexVersion: z.string().min(1),
  promptSetVersion: z.string().min(1),
  modelId: z.string().min(1),
  modelConfiguration: z.record(z.unknown()),
  extractionSchemaVersion: z.string().min(1),
  verificationVersion: z.string().min(1),
  evaluatorVersion: z.string().min(1),
  featureFlags: z.record(z.boolean()),
});
export type CacheKeyInput = z.infer<typeof cacheKeyInputSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function buildAnalysisCacheKey(input: CacheKeyInput): string {
  const parsed = cacheKeyInputSchema.parse(input);
  return createHash('sha256')
    .update(JSON.stringify(canonical(parsed)))
    .digest('hex');
}

export type CacheDecision =
  | 'hit'
  | 'miss_new_input'
  | 'miss_version_change'
  | 'miss_incomplete'
  | 'miss_workspace_mismatch'
  | 'miss_invalidated_dependency';

export function explainCacheDecision(input: {
  expectedKey: string;
  storedKey?: string;
  workspaceMatches: boolean;
  completed: boolean;
  parserFailed: boolean;
  invalidated: boolean;
}): CacheDecision {
  if (!input.workspaceMatches) return 'miss_workspace_mismatch';
  if (input.invalidated) return 'miss_invalidated_dependency';
  if (!input.completed || input.parserFailed) return 'miss_incomplete';
  if (!input.storedKey) return 'miss_new_input';
  if (input.storedKey !== input.expectedKey) return 'miss_version_change';
  return 'hit';
}

export const CACHE_INVALIDATION_VERSION = 'targeted-cache-invalidation-v1';
export type CacheDependency = {
  cacheEntryId: string;
  dependencyType: string;
  dependencyKey: string;
  dependencyHash: string;
  stage: string;
};
export function planTargetedCacheInvalidation(input: {
  changed: Array<{
    dependencyType: string;
    dependencyKey: string;
    previousHash: string;
    currentHash: string;
  }>;
  dependencies: CacheDependency[];
}): {
  cacheEntryIds: string[];
  stages: string[];
  reasons: Array<{ cacheEntryId: string; dependencyType: string; dependencyKey: string }>;
} {
  const reasons = input.dependencies.flatMap((dependency) =>
    input.changed
      .filter(
        (change) =>
          change.dependencyType === dependency.dependencyType &&
          change.dependencyKey === dependency.dependencyKey &&
          change.previousHash !== change.currentHash &&
          dependency.dependencyHash === change.previousHash,
      )
      .map((change) => ({
        cacheEntryId: dependency.cacheEntryId,
        dependencyType: change.dependencyType,
        dependencyKey: change.dependencyKey,
      })),
  );
  return {
    cacheEntryIds: [...new Set(reasons.map((reason) => reason.cacheEntryId))].sort(),
    stages: [
      ...new Set(
        input.dependencies
          .filter((dependency) =>
            reasons.some((reason) => reason.cacheEntryId === dependency.cacheEntryId),
          )
          .map((dependency) => dependency.stage),
      ),
    ].sort(),
    reasons,
  };
}

export const stageCostInputSchema = z.object({
  ocrPages: z.number().int().nonnegative(),
  embeddingTokens: z.number().int().nonnegative(),
  classificationCalls: z.number().int().nonnegative(),
  extractionCalls: z.number().int().nonnegative(),
  verificationCalls: z.number().int().nonnegative(),
  ambiguityCalls: z.number().int().nonnegative(),
  averageInputTokens: z.number().int().nonnegative(),
  outputLimits: z.object({
    classification: z.number().int().nonnegative(),
    extraction: z.number().int().nonnegative(),
    verification: z.number().int().nonnegative(),
    ambiguity: z.number().int().nonnegative(),
  }),
  pricesPerMillion: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    embedding: z.number().nonnegative(),
    ocrPage: z.number().nonnegative(),
  }),
  retryAllowance: z.number().int().min(0).max(2),
  estimatedMillisecondsPerCall: z.number().int().positive(),
});

export type CostEstimate = {
  lowUsd: number;
  highUsd: number;
  hardMaximumUsd: number;
  estimatedCallsLow: number;
  estimatedCallsHigh: number;
  estimatedTimeMs: number;
  largestCostStage: string;
  stages: Record<string, number>;
};

const money = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function estimateAnalysisCost(raw: z.input<typeof stageCostInputSchema>): CostEstimate {
  const input = stageCostInputSchema.parse(raw);
  const callCounts = {
    classification: input.classificationCalls,
    extraction: input.extractionCalls,
    verification: input.verificationCalls,
    ambiguity: input.ambiguityCalls,
  };
  const stages: Record<string, number> = {
    ocr: input.ocrPages * input.pricesPerMillion.ocrPage,
    embeddings: (input.embeddingTokens / 1_000_000) * input.pricesPerMillion.embedding,
  };
  for (const [stage, calls] of Object.entries(callCounts)) {
    const output = input.outputLimits[stage as keyof typeof input.outputLimits];
    stages[stage] =
      calls *
      ((input.averageInputTokens / 1_000_000) * input.pricesPerMillion.input +
        (output / 1_000_000) * input.pricesPerMillion.output);
  }
  const base = Object.values(stages).reduce((sum, value) => sum + value, 0);
  const calls = Object.values(callCounts).reduce((sum, value) => sum + value, 0);
  const retryFactor = 1 + input.retryAllowance;
  const largestCostStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  return {
    lowUsd: money(base * 0.75),
    highUsd: money(base),
    hardMaximumUsd: money(base * retryFactor),
    estimatedCallsLow: Math.floor(calls * 0.75),
    estimatedCallsHigh: calls * retryFactor,
    estimatedTimeMs: calls * retryFactor * input.estimatedMillisecondsPerCall,
    largestCostStage,
    stages: Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, money(value)])),
  };
}

export const workUnitStatusSchema = z.enum([
  'queued',
  'leased',
  'completed',
  'failed_retryable',
  'failed_terminal',
  'cancelled',
  'invalidated',
]);
export const processingStageSchema = z.enum([
  'uploaded',
  'validating',
  'inspecting',
  'normalizing',
  'rendering',
  'ocr_selection',
  'ocr_processing',
  'structural_classification',
  'deterministic_prefilter',
  'candidate_extraction',
  'evidence_retrieval',
  'independent_verification',
  'deduplication',
  'precedence_resolution',
  'checklist_generation',
  'completed',
]);

export function canClaimWorkUnit(input: {
  status: z.infer<typeof workUnitStatusSchema>;
  leaseExpiresAt?: Date;
  now?: Date;
  attempts: number;
  maxAttempts: number;
}): boolean {
  const now = input.now ?? new Date();
  if (input.attempts >= input.maxAttempts) return false;
  if (input.status === 'queued' || input.status === 'failed_retryable') return true;
  return input.status === 'leased' && Boolean(input.leaseExpiresAt && input.leaseExpiresAt <= now);
}
