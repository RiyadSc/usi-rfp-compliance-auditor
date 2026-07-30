import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PHASE4_SELECTED_FINGERPRINT,
  PHASE8_SYNTHETIC_MARKER,
  PHASE8_VERSIONS,
  RATE_LIMIT_POLICIES,
  assertMatchingPhase8Binding,
  assertSpendProjection,
  assertUsablePhase8Cache,
  assertValidPhase8Binding,
  buildRateLimitKey,
  calculatePhase8CacheKey,
  classifyPhase8Failure,
  consolidatedMetricsSchema,
  performanceBudgetResult,
  planPhase8Reset,
  sha256Canonical,
  type Phase8DemoBinding,
} from '@usi/domain';

const ids = {
  workspaceId: '81000000-0000-4000-8000-000000000001',
  authorizedIdentityId: '81000000-0000-4000-8000-000000000002',
  sourceDocumentId: '81000000-0000-4000-8000-000000000003',
  proposalDocumentId: '81000000-0000-4000-8000-000000000004',
  analysisRunId: '81000000-0000-4000-8000-000000000005',
  verificationRunId: '81000000-0000-4000-8000-000000000006',
  checklistGenerationRunId: '81000000-0000-4000-8000-000000000007',
  readinessSnapshotId: '81000000-0000-4000-8000-000000000008',
  proposalAuditRunId: '81000000-0000-4000-8000-000000000009',
  proposalDraftId: '81000000-0000-4000-8000-000000000010',
  reportSnapshotId: '81000000-0000-4000-8000-000000000011',
};

function binding(): Phase8DemoBinding {
  const material = {
    scopeVersion: PHASE8_VERSIONS.demoScope,
    fixtureVersion: PHASE8_VERSIONS.fixture,
    syntheticMarker: PHASE8_SYNTHETIC_MARKER,
    ...ids,
    compatibilityFingerprint: PHASE4_SELECTED_FINGERPRINT,
    documentSetHash: 'a'.repeat(64),
    fixtureHash: 'b'.repeat(64),
    reportInputHash: 'c'.repeat(64),
    versions: {
      facts: 'verification-facts-v4' as const,
      decision: 'verification-decision-v6' as const,
      finalAssessment: 'verification-final-assessment-v1' as const,
      relationships: 'atomic-parent-child-v1' as const,
      checklistGenerator: 'checklist-generator-v1' as const,
      blockerEngine: 'checklist-blockers-v1' as const,
      readinessEngine: 'checklist-readiness-v1' as const,
      proposalAudit: 'proposal-audit-evaluator-v1' as const,
      reportInput: 'report-input-v1' as const,
      reportAggregation: 'report-aggregation-v1' as const,
      reportSchema: 'report-schema-v1' as const,
    },
  };
  return { ...material, cacheKey: calculatePhase8CacheKey(material) };
}

describe('Phase 8 hardening contracts', () => {
  it('binds cache use to every roadmap identity and rejects drift', () => {
    const valid = binding();
    expect(assertValidPhase8Binding(valid)).toEqual(valid);
    expect(assertMatchingPhase8Binding(valid, structuredClone(valid))).toEqual(valid);
    expect(() => assertValidPhase8Binding({ ...valid, documentSetHash: 'd'.repeat(64) })).toThrow(
      'phase8_cache_key_mismatch',
    );
    const drift = binding();
    drift.cacheKey = 'e'.repeat(64);
    expect(() => assertMatchingPhase8Binding(valid, drift)).toThrow();
    expect(
      assertUsablePhase8Cache({
        binding: valid,
        record: {
          cacheVersion: PHASE8_VERSIONS.cache,
          cacheKey: valid.cacheKey,
          bindingHash: sha256Canonical(valid),
          fixtureHash: valid.fixtureHash,
          status: 'valid',
          sourceRunsCompleted: true,
          parserHealthy: true,
        },
      }),
    ).toBeDefined();
    expect(() =>
      assertUsablePhase8Cache({
        binding: valid,
        record: {
          cacheVersion: PHASE8_VERSIONS.cache,
          cacheKey: valid.cacheKey,
          bindingHash: sha256Canonical(valid),
          fixtureHash: valid.fixtureHash,
          status: 'stale',
          sourceRunsCompleted: true,
          parserHealthy: true,
        },
      }),
    ).toThrow('phase8_cache_rejected');
  });

  it('makes reset dry-runs non-mutating and rejects arbitrary scopes', () => {
    const valid = binding();
    expect(
      planPhase8Reset({
        binding: valid,
        requestedWorkspaceId: valid.workspaceId,
        requestedIdentityId: valid.authorizedIdentityId,
        dryRun: true,
      }),
    ).toMatchObject({ dryRun: true, mutationsAllowed: false, version: 'phase8-demo-reset-v1' });
    expect(() =>
      planPhase8Reset({
        binding: valid,
        requestedWorkspaceId: '81000000-0000-4000-8000-000000000099',
        requestedIdentityId: valid.authorizedIdentityId,
        dryRun: false,
      }),
    ).toThrow('phase8_reset_scope_mismatch');
  });

  it('uses fixed server-owned rate policies and privacy-preserving keys', () => {
    expect(Object.keys(RATE_LIMIT_POLICIES)).toHaveLength(15);
    expect(RATE_LIMIT_POLICIES.verification_request).toEqual({
      limit: 3,
      windowSeconds: 600,
      keyScope: 'actor_workspace',
    });
    expect(RATE_LIMIT_POLICIES.phase9_review_workflow).toEqual({
      limit: 600,
      windowSeconds: 300,
      keyScope: 'actor_workspace',
    });
    const first = buildRateLimitKey({
      operation: 'verification_request',
      actorId: ids.authorizedIdentityId,
      workspaceId: ids.workspaceId,
    });
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(
      buildRateLimitKey({
        operation: 'verification_request',
        actorId: ids.authorizedIdentityId,
        workspaceId: ids.workspaceId,
      }),
    ).toBe(first);
    expect(() => buildRateLimitKey({ operation: 'report_generation' })).toThrow(
      'rate_limit_scope_required',
    );
  });

  it('fails cost projections before provider access and keeps phase inputs separate', () => {
    expect(
      assertSpendProjection({
        currentPhaseSpendUsd: 9,
        currentWorkspaceSpendUsd: 1,
        currentActorSpendUsd: 2,
        pendingPhaseReservationsUsd: 0.25,
        requestedMaximumUsd: 0.75,
        phaseCeilingUsd: 10,
        workspaceCeilingUsd: 10,
        actorCeilingUsd: 10,
      }),
    ).toEqual({ projectedPhaseUsd: 10, projectedWorkspaceUsd: 1.75, projectedActorUsd: 2.75 });
    expect(() =>
      assertSpendProjection({
        currentPhaseSpendUsd: 9.5,
        currentWorkspaceSpendUsd: 0,
        currentActorSpendUsd: 0,
        pendingPhaseReservationsUsd: 0.25,
        requestedMaximumUsd: 0.26,
        phaseCeilingUsd: 10,
        workspaceCeilingUsd: 10,
        actorCeilingUsd: 10,
      }),
    ).toThrow('provider_budget_exceeded');
  });

  it('normalizes failures and measures only bounded, privacy-safe performance fields', () => {
    expect(classifyPhase8Failure(new Error('workspace not found'))).toBe('authorization');
    expect(classifyPhase8Failure(new Error('rate limit exceeded'))).toBe('rate_limited');
    expect(classifyPhase8Failure(new Error('cache fingerprint mismatch'))).toBe('stale_cache');
    expect(classifyPhase8Failure(new Error('provider timed out'))).toBe('timeout');
    expect(
      performanceBudgetResult({
        version: PHASE8_VERSIONS.performance,
        operation: 'evidence_viewer',
        durationMs: 1_999,
        itemCount: 1,
        pageCount: 1,
        cacheOutcome: 'hit',
        status: 'success',
        errorCategory: null,
      }),
    ).toEqual({ budgetMs: 2_000, withinBudget: true });
    expect(() =>
      performanceBudgetResult({
        version: PHASE8_VERSIONS.performance,
        operation: 'report_render',
        durationMs: 1,
        itemCount: 1,
        pageCount: null,
        cacheOutcome: null,
        status: 'success',
        errorCategory: null,
        privateText: 'must never be recorded',
      }),
    ).toThrow();
  });

  it('accepts only the exact consolidated safety gate', () => {
    const perfect = {
      criticalFalseSupported: 0,
      criticalFalseActive: 0,
      criticalFalseConsistent: 0,
      falseBlockers: 0,
      falseMissingForms: 0,
      falseMissingResponses: 0,
      falseMerges: 0,
      destructiveMerges: 0,
      injectionInfluence: 0,
      crossWorkspaceLeaks: 0,
      unauthorizedDownloads: 0,
      prohibitedLanguageViolations: 0,
      csvInjectionVulnerabilities: 0,
      evidenceValidity: 1,
      citationValidity: 1,
      provenanceValidity: 1,
      schemaAdherence: 1,
      knownAnswerCaseAccuracy: 1,
    };
    expect(consolidatedMetricsSchema.parse(perfect)).toEqual(perfect);
    expect(() => consolidatedMetricsSchema.parse({ ...perfect, falseBlockers: 1 })).toThrow();
  });

  it('keeps rate/cost/reset controls service-only, atomic, and RLS protected', () => {
    const sql = readFileSync(
      'supabase/migrations/20260719000023_phase8_final_hardening.sql',
      'utf8',
    );
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(sql).toMatch(/security definer set search_path = ''/g);
    expect(sql).toContain(
      'revoke all on function public.reserve_provider_budget(text,text,uuid,uuid,uuid,text,numeric) from public,anon,authenticated',
    );
    expect(sql).toContain(
      'alter table public.provider_budget_reservations enable row level security',
    );
    expect(sql).toContain('alter table public.phase8_demo_scopes enable row level security');
    expect(sql).toContain("synthetic_marker='phase8-synthetic-demo-only'");
    expect(sql).not.toMatch(
      /grant (?:insert|update|delete|all).*phase8_demo_scopes.*authenticated/i,
    );
  });
});
