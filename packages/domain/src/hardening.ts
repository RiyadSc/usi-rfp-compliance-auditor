import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PHASE8_VERSIONS = Object.freeze({
  evaluation: 'phase8-consolidated-evaluation-v1',
  rateLimits: 'phase8-rate-limits-v1',
  costControls: 'phase8-cost-controls-v1',
  performance: 'phase8-performance-v1',
  demoScope: 'phase8-prepared-demo-v1',
  cache: 'phase8-demo-cache-v1',
  fallback: 'phase8-report-fallback-v1',
  reset: 'phase8-demo-reset-v1',
  fixture: 'full-roadmap-known-answer-v1',
});

export const PHASE4_SELECTED_FINGERPRINT =
  'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';
export const PHASE8_SYNTHETIC_MARKER = 'phase8-synthetic-demo-only';
export const PHASE8_FALLBACK_LABEL = 'Prepared fallback snapshot — synthetic data';

export const phase8DemoModeSchema = z.enum(['prepared', 'cached', 'fallback', 'offline_read_only']);
export type Phase8DemoMode = z.infer<typeof phase8DemoModeSchema>;

export const rateLimitedOperationSchema = z.enum([
  'sign_in',
  'upload_initialize',
  'upload_finalize',
  'parse_request',
  'extraction_request',
  'verification_request',
  'checklist_generation',
  'checklist_workflow',
  'proposal_audit',
  'proposal_resolution',
  'report_generation',
  'export_generation',
  'signed_download',
  'demo_reset',
]);
export type RateLimitedOperation = z.infer<typeof rateLimitedOperationSchema>;

export type RateLimitPolicy = Readonly<{
  limit: number;
  windowSeconds: number;
  keyScope: 'actor' | 'actor_workspace' | 'login_discriminator';
}>;

export const RATE_LIMIT_POLICIES: Readonly<Record<RateLimitedOperation, RateLimitPolicy>> =
  Object.freeze({
    sign_in: { limit: 60, windowSeconds: 300, keyScope: 'login_discriminator' },
    upload_initialize: { limit: 12, windowSeconds: 300, keyScope: 'actor_workspace' },
    upload_finalize: { limit: 12, windowSeconds: 300, keyScope: 'actor_workspace' },
    parse_request: { limit: 8, windowSeconds: 300, keyScope: 'actor_workspace' },
    extraction_request: { limit: 4, windowSeconds: 600, keyScope: 'actor_workspace' },
    verification_request: { limit: 3, windowSeconds: 600, keyScope: 'actor_workspace' },
    checklist_generation: { limit: 12, windowSeconds: 300, keyScope: 'actor_workspace' },
    checklist_workflow: { limit: 60, windowSeconds: 300, keyScope: 'actor_workspace' },
    proposal_audit: { limit: 8, windowSeconds: 600, keyScope: 'actor_workspace' },
    proposal_resolution: { limit: 30, windowSeconds: 300, keyScope: 'actor_workspace' },
    report_generation: { limit: 8, windowSeconds: 300, keyScope: 'actor_workspace' },
    export_generation: { limit: 12, windowSeconds: 300, keyScope: 'actor_workspace' },
    signed_download: { limit: 20, windowSeconds: 300, keyScope: 'actor_workspace' },
    demo_reset: { limit: 3, windowSeconds: 900, keyScope: 'actor_workspace' },
  });

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();

export const phase8DemoBindingSchema = z
  .object({
    scopeVersion: z.literal(PHASE8_VERSIONS.demoScope),
    fixtureVersion: z.literal(PHASE8_VERSIONS.fixture),
    syntheticMarker: z.literal(PHASE8_SYNTHETIC_MARKER),
    workspaceId: uuidSchema,
    authorizedIdentityId: uuidSchema,
    sourceDocumentId: uuidSchema,
    proposalDocumentId: uuidSchema,
    analysisRunId: uuidSchema,
    verificationRunId: uuidSchema,
    checklistGenerationRunId: uuidSchema,
    readinessSnapshotId: uuidSchema,
    proposalAuditRunId: uuidSchema,
    proposalDraftId: uuidSchema,
    reportSnapshotId: uuidSchema,
    compatibilityFingerprint: z.literal(PHASE4_SELECTED_FINGERPRINT),
    documentSetHash: hashSchema,
    fixtureHash: hashSchema,
    cacheKey: hashSchema,
    reportInputHash: hashSchema,
    versions: z
      .object({
        facts: z.literal('verification-facts-v4'),
        decision: z.literal('verification-decision-v6'),
        finalAssessment: z.literal('verification-final-assessment-v1'),
        relationships: z.literal('atomic-parent-child-v1'),
        checklistGenerator: z.literal('checklist-generator-v1'),
        blockerEngine: z.literal('checklist-blockers-v1'),
        readinessEngine: z.literal('checklist-readiness-v1'),
        proposalAudit: z.literal('proposal-audit-evaluator-v1'),
        reportInput: z.literal('report-input-v1'),
        reportAggregation: z.literal('report-aggregation-v1'),
        reportSchema: z.literal('report-schema-v1'),
      })
      .strict(),
  })
  .strict();
export type Phase8DemoBinding = z.infer<typeof phase8DemoBindingSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function calculatePhase8CacheKey(input: Omit<Phase8DemoBinding, 'cacheKey'>): string {
  return sha256Canonical(input);
}

export function assertValidPhase8Binding(raw: unknown): Phase8DemoBinding {
  const binding = phase8DemoBindingSchema.parse(raw);
  const { cacheKey: _cacheKey, ...material } = binding;
  const expected = calculatePhase8CacheKey(material);
  if (binding.cacheKey !== expected) throw new Error('phase8_cache_key_mismatch');
  return binding;
}

export function assertMatchingPhase8Binding(
  expectedRaw: unknown,
  actualRaw: unknown,
): Phase8DemoBinding {
  const expected = assertValidPhase8Binding(expectedRaw);
  const actual = assertValidPhase8Binding(actualRaw);
  if (sha256Canonical(expected) !== sha256Canonical(actual)) {
    throw new Error('phase8_demo_binding_mismatch');
  }
  return actual;
}

export const phase8DemoCacheRecordSchema = z
  .object({
    cacheVersion: z.literal(PHASE8_VERSIONS.cache),
    cacheKey: hashSchema,
    bindingHash: hashSchema,
    fixtureHash: hashSchema,
    status: z.enum(['valid', 'stale', 'revoked']),
    sourceRunsCompleted: z.boolean(),
    parserHealthy: z.boolean(),
  })
  .strict();

export function assertUsablePhase8Cache(input: {
  binding: unknown;
  record: unknown;
}): Phase8DemoBinding {
  const binding = assertValidPhase8Binding(input.binding);
  const record = phase8DemoCacheRecordSchema.parse(input.record);
  if (
    record.status !== 'valid' ||
    !record.sourceRunsCompleted ||
    !record.parserHealthy ||
    record.cacheKey !== binding.cacheKey ||
    record.bindingHash !== sha256Canonical(binding) ||
    record.fixtureHash !== binding.fixtureHash
  ) {
    throw new Error('phase8_cache_rejected');
  }
  return binding;
}

export const phase8FallbackManifestSchema = z
  .object({
    fallbackVersion: z.literal(PHASE8_VERSIONS.fallback),
    workspaceId: uuidSchema,
    scopeId: uuidSchema,
    reportSnapshotId: uuidSchema,
    exportArtifactId: uuidSchema,
    contentSha256: hashSchema,
    label: z.literal(PHASE8_FALLBACK_LABEL),
    privateBucket: z.literal(true),
    grantSeconds: z.number().int().positive().max(300),
    demoWatermark: z.literal('DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION'),
  })
  .strict();

export const PHASE8_INITIAL_PRESENTATION_STATE = Object.freeze({
  mode: 'prepared' as const,
  selectedRequirementKey: null,
  selectedFindingKey: null,
  findingReviewDemonstrated: false,
  exportGrantDemonstrated: false,
});

export const phase8ContingencyScenarioSchema = z.enum([
  'parser_unavailable',
  'verification_unavailable',
  'checklist_unavailable',
  'proposal_audit_unavailable',
  'report_generation_unavailable',
  'signed_download_unavailable',
  'expired_export',
  'revoked_export',
  'network_interruption',
  'browser_refresh',
  'stale_cache',
  'reset_failure',
  'unauthorized_workspace',
]);

export function resolvePhase8Contingency(raw: unknown): {
  state:
    | 'partial'
    | 'parser_uncertain'
    | 'unauthorized'
    | 'failed'
    | 'stale'
    | 'expired'
    | 'revoked'
    | 'cached'
    | 'fallback';
  mode: Phase8DemoMode;
  fabricatedResult: false;
  publicStorage: false;
  preservesAudit: true;
} {
  const scenario = phase8ContingencyScenarioSchema.parse(raw);
  const state =
    scenario === 'parser_unavailable'
      ? 'parser_uncertain'
      : scenario === 'verification_unavailable'
        ? 'partial'
        : scenario === 'report_generation_unavailable'
          ? 'fallback'
          : scenario === 'expired_export'
            ? 'expired'
            : scenario === 'revoked_export'
              ? 'revoked'
              : scenario === 'network_interruption' || scenario === 'browser_refresh'
                ? 'cached'
                : scenario === 'stale_cache'
                  ? 'stale'
                  : scenario === 'unauthorized_workspace'
                    ? 'unauthorized'
                    : 'failed';
  const mode: Phase8DemoMode =
    state === 'fallback'
      ? 'fallback'
      : scenario === 'network_interruption'
        ? 'offline_read_only'
        : state === 'cached'
          ? 'cached'
          : 'prepared';
  return {
    state,
    mode,
    fabricatedResult: false,
    publicStorage: false,
    preservesAudit: true,
  };
}

export const phase8PerformanceOperationSchema = z.enum([
  'page_load',
  'server_response',
  'workspace_load',
  'document_viewer',
  'requirement_register',
  'evidence_viewer',
  'checklist_generation',
  'checklist_render',
  'proposal_audit',
  'proposal_audit_render',
  'report_generation',
  'report_render',
  'export_generation',
  'signed_download',
  'demo_reset',
]);
export type Phase8PerformanceOperation = z.infer<typeof phase8PerformanceOperationSchema>;

export const PHASE8_PERFORMANCE_BUDGET_MS: Readonly<
  Partial<Record<Phase8PerformanceOperation, number>>
> = Object.freeze({
  workspace_load: 3_000,
  requirement_register: 3_000,
  evidence_viewer: 2_000,
  checklist_render: 3_000,
  proposal_audit_render: 3_000,
  report_render: 3_000,
  report_generation: 2_000,
  export_generation: 2_000,
  signed_download: 1_000,
  demo_reset: 30_000,
});

export const performanceEventSchema = z
  .object({
    version: z.literal(PHASE8_VERSIONS.performance),
    operation: phase8PerformanceOperationSchema,
    durationMs: z.number().int().min(0).max(600_000),
    itemCount: z.number().int().min(0).max(100_000).nullable(),
    pageCount: z.number().int().min(0).max(10_000).nullable(),
    cacheOutcome: z.enum(['hit', 'miss', 'not_applicable', 'rejected']).nullable(),
    status: z.enum(['success', 'failure']),
    errorCategory: z
      .enum([
        'authorization',
        'rate_limited',
        'budget_exceeded',
        'invalid_input',
        'stale_cache',
        'storage',
        'parser',
        'provider',
        'timeout',
        'unavailable',
        'internal',
      ])
      .nullable(),
  })
  .strict();
export type PerformanceEvent = z.infer<typeof performanceEventSchema>;

export function performanceBudgetResult(eventRaw: unknown): {
  budgetMs: number | null;
  withinBudget: boolean | null;
} {
  const event = performanceEventSchema.parse(eventRaw);
  const budget = PHASE8_PERFORMANCE_BUDGET_MS[event.operation] ?? null;
  return { budgetMs: budget, withinBudget: budget === null ? null : event.durationMs <= budget };
}

export const phase8FailureCategorySchema = z.enum([
  'authorization',
  'rate_limited',
  'budget_exceeded',
  'invalid_input',
  'stale_cache',
  'storage',
  'parser',
  'provider',
  'timeout',
  'unavailable',
  'internal',
]);

export function classifyPhase8Failure(error: unknown): z.infer<typeof phase8FailureCategorySchema> {
  const value = error instanceof Error ? error.message : String(error);
  if (/not signed|unauthor|workspace.*not found|scope/i.test(value)) return 'authorization';
  if (/rate.?limit/i.test(value)) return 'rate_limited';
  if (/budget|ceiling|spend/i.test(value)) return 'budget_exceeded';
  if (/cache|fingerprint|fixture.*hash|version.*mismatch/i.test(value)) return 'stale_cache';
  if (/storage|signed|object/i.test(value)) return 'storage';
  if (/parser|page.*text|image.only/i.test(value)) return 'parser';
  if (/timeout|timed out/i.test(value)) return 'timeout';
  if (/provider|refusal|model/i.test(value)) return 'provider';
  if (/unavailable|offline|network/i.test(value)) return 'unavailable';
  if (/invalid|malformed|schema|zod/i.test(value)) return 'invalid_input';
  return 'internal';
}

export type SpendProjection = {
  currentPhaseSpendUsd: number;
  currentWorkspaceSpendUsd: number;
  currentActorSpendUsd: number;
  pendingPhaseReservationsUsd: number;
  requestedMaximumUsd: number;
  phaseCeilingUsd: number;
  workspaceCeilingUsd: number;
  actorCeilingUsd: number;
};

const roundUsd = (value: number) => Number(value.toFixed(6));

export function assertSpendProjection(input: SpendProjection): {
  projectedPhaseUsd: number;
  projectedWorkspaceUsd: number;
  projectedActorUsd: number;
} {
  const values = Object.values(input);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('invalid_spend_projection');
  }
  const projectedPhaseUsd = roundUsd(
    input.currentPhaseSpendUsd + input.pendingPhaseReservationsUsd + input.requestedMaximumUsd,
  );
  const projectedWorkspaceUsd = roundUsd(
    input.currentWorkspaceSpendUsd + input.requestedMaximumUsd,
  );
  const projectedActorUsd = roundUsd(input.currentActorSpendUsd + input.requestedMaximumUsd);
  if (
    projectedPhaseUsd > input.phaseCeilingUsd ||
    projectedWorkspaceUsd > input.workspaceCeilingUsd ||
    projectedActorUsd > input.actorCeilingUsd
  ) {
    throw new Error('provider_budget_exceeded');
  }
  return { projectedPhaseUsd, projectedWorkspaceUsd, projectedActorUsd };
}

export const consolidatedMetricsSchema = z
  .object({
    criticalFalseSupported: z.literal(0),
    criticalFalseActive: z.literal(0),
    criticalFalseConsistent: z.literal(0),
    falseBlockers: z.literal(0),
    falseMissingForms: z.literal(0),
    falseMissingResponses: z.literal(0),
    falseMerges: z.literal(0),
    destructiveMerges: z.literal(0),
    injectionInfluence: z.literal(0),
    crossWorkspaceLeaks: z.literal(0),
    unauthorizedDownloads: z.literal(0),
    prohibitedLanguageViolations: z.literal(0),
    csvInjectionVulnerabilities: z.literal(0),
    evidenceValidity: z.literal(1),
    citationValidity: z.literal(1),
    provenanceValidity: z.literal(1),
    schemaAdherence: z.literal(1),
    knownAnswerCaseAccuracy: z.literal(1),
  })
  .strict();

export function buildRateLimitKey(input: {
  operation: RateLimitedOperation;
  actorId?: string | null | undefined;
  workspaceId?: string | null | undefined;
  discriminator?: string | null | undefined;
}): string {
  const policy = RATE_LIMIT_POLICIES[input.operation];
  let material: string;
  if (policy.keyScope === 'login_discriminator') {
    const normalized = input.discriminator?.trim().toLowerCase();
    if (!normalized) throw new Error('rate_limit_discriminator_required');
    material = normalized;
  } else if (policy.keyScope === 'actor') {
    if (!input.actorId) throw new Error('rate_limit_actor_required');
    material = input.actorId;
  } else {
    if (!input.actorId || !input.workspaceId) throw new Error('rate_limit_scope_required');
    material = `${input.actorId}:${input.workspaceId}`;
  }
  return createHash('sha256')
    .update(`${PHASE8_VERSIONS.rateLimits}:${input.operation}:${material}`)
    .digest('hex');
}

export function planPhase8Reset(input: {
  binding: unknown;
  requestedWorkspaceId: string;
  requestedIdentityId: string;
  dryRun: boolean;
}): {
  version: typeof PHASE8_VERSIONS.reset;
  dryRun: boolean;
  scopeHash: string;
  mutationsAllowed: boolean;
} {
  const binding = assertValidPhase8Binding(input.binding);
  if (
    input.requestedWorkspaceId !== binding.workspaceId ||
    input.requestedIdentityId !== binding.authorizedIdentityId
  ) {
    throw new Error('phase8_reset_scope_mismatch');
  }
  return {
    version: PHASE8_VERSIONS.reset,
    dryRun: input.dryRun,
    scopeHash: sha256Canonical(binding),
    mutationsAllowed: !input.dryRun,
  };
}
