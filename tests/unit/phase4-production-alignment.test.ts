import { describe, expect, it, vi } from 'vitest';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
  assertQualifiedPhase4Runtime,
  fingerprintPhase4Compatibility,
} from '../../packages/ai/src/phase4-qualified-config';
import {
  PHASE4_SYNTHETIC_MARKER,
  computeSyntheticCandidateSetHash,
  runAfterPhase4SyntheticSmokePreflight,
  validatePhase4SyntheticSmokePreflight,
  type Phase4SyntheticSmokeInput,
  type Phase4SyntheticSmokeSnapshot,
} from '../../apps/worker/src/phase4-smoke-preflight';

const request: Phase4SyntheticSmokeInput = {
  smokeScopeId: '30000000-0000-4000-8000-000000000001',
  workspaceId: '30000000-0000-4000-8000-000000000002',
  authenticatedUserId: '30000000-0000-4000-8000-000000000003',
  documentIds: ['30000000-0000-4000-8000-000000000004'],
  analysisRunId: '30000000-0000-4000-8000-000000000005',
  expectedCompatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  fixtureVersion: 'verification-cases-v2',
};
const candidate = {
  id: '30000000-0000-4000-8000-000000000006',
  workspaceId: request.workspaceId,
  analysisRunId: request.analysisRunId,
  documentId: request.documentIds[0],
  category: 'mandatory_meeting',
  title: 'Synthetic meeting',
  obligation: 'Attend the synthetic meeting.',
  preliminaryPage: 1,
  evidenceQuote: 'Attend the synthetic meeting.',
};

function validSnapshot(): Phase4SyntheticSmokeSnapshot {
  return {
    marker: {
      id: request.smokeScopeId,
      workspaceId: request.workspaceId,
      authenticatedUserId: request.authenticatedUserId,
      analysisRunId: request.analysisRunId,
      fixtureVersion: request.fixtureVersion,
      compatibilityFingerprint: request.expectedCompatibilityFingerprint,
      approvedDocumentIds: request.documentIds,
      approvedCandidateIds: [candidate.id],
      candidateSetHash: computeSyntheticCandidateSetHash([candidate]),
      syntheticMarker: PHASE4_SYNTHETIC_MARKER,
    },
    membershipPresent: true,
    analysisRun: {
      id: request.analysisRunId,
      workspaceId: request.workspaceId,
      documentId: request.documentIds[0],
    },
    documents: [
      {
        id: request.documentIds[0],
        workspaceId: request.workspaceId,
        parserName: 'synthetic-fixture',
        deletedAt: null,
      },
    ],
    candidates: [candidate],
  };
}

function mutateCompatibility(path: string, value: unknown) {
  const runtime = structuredClone(PHASE4_QUALIFIED_PRODUCTION_CONFIG);
  const segments = path.split('.');
  let target: Record<string, unknown> = runtime.compatibility as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) target = target[segment] as Record<string, unknown>;
  target[segments.at(-1)!] = value;
  return runtime;
}

describe('qualified Phase 4 production runtime', () => {
  it('matches the approved fingerprint and bounded production limits', () => {
    expect(fingerprintPhase4Compatibility(PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility)).toBe(
      PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
    );
    expect(PHASE4_QUALIFIED_PRODUCTION_CONFIG).toMatchObject({
      model: 'gpt-5.5-2026-04-23',
      compatibility: {
        reasoning: 'low',
        maxContextsPerCandidate: 2,
        outputLimits: { entailment: 1800, challenge: 1600, duplicate: 600 },
        timeoutMs: 90_000,
        entailmentPromptVersion: 'verify-entailment-v7',
        entailmentSchemaVersion: 'verification-entailment-v5',
        challengePromptVersion: 'verify-challenge-v4',
        challengeSchemaVersion: 'verification-challenge-v4',
        factEnvelopeVersion: 'verification-facts-v4',
        decisionEngineVersion: 'verification-decision-v6',
        evaluatorVersion: 'verification-evaluator-v3',
        finalAssessmentSchemaVersion: 'verification-final-assessment-v1',
        parentChildRelationshipVersion: 'atomic-parent-child-v1',
        providerContract: { api: 'responses', store: false, tools: false },
      },
    });
  });

  it.each([
    ['reasoning', 'medium'],
    ['maxContextsPerCandidate', 3],
    ['outputLimits.entailment', 1801],
    ['outputLimits.challenge', 1601],
    ['outputLimits.duplicate', 601],
    ['timeoutMs', 60_000],
    ['entailmentPromptVersion', 'verify-entailment-mutated'],
    ['entailmentSchemaVersion', 'verification-entailment-mutated'],
    ['challengePromptVersion', 'verify-challenge-mutated'],
    ['challengeSchemaVersion', 'verification-challenge-mutated'],
    ['factEnvelopeVersion', 'verification-facts-mutated'],
    ['decisionEngineVersion', 'verification-decision-mutated'],
    ['evaluatorVersion', 'verification-evaluator-mutated'],
    ['finalAssessmentSchemaVersion', 'verification-final-mutated'],
    ['parentChildRelationshipVersion', 'atomic-parent-child-mutated'],
    ['providerContract.api', 'chat_completions'],
    ['providerContract.store', true],
    ['providerContract.tools', true],
  ])('rejects fingerprint mutation %s before execution', (path, value) => {
    expect(() => assertQualifiedPhase4Runtime(mutateCompatibility(path, value))).toThrow(
      /phase4_runtime_incompatible:fingerprint/,
    );
  });

  it('rejects model mutation independently of the legacy evaluation fingerprint', () => {
    expect(() =>
      assertQualifiedPhase4Runtime({
        ...PHASE4_QUALIFIED_PRODUCTION_CONFIG,
        model: 'gpt-5.4-2026-03-05',
      }),
    ).toThrow(/phase4_runtime_incompatible:model/);
  });
});

describe('synthetic-only smoke preflight', () => {
  it('accepts only the exact immutable synthetic scope', () => {
    expect(
      validatePhase4SyntheticSmokePreflight(
        request,
        validSnapshot(),
        PHASE4_QUALIFIED_PRODUCTION_CONFIG,
      ),
    ).toMatchObject({
      assertedCompatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
      candidateIds: [candidate.id],
      documentIds: request.documentIds,
    });
  });

  it.each([
    ['missing identifiers', { request: { ...request, workspaceId: '' } }],
    ['missing marker', { snapshot: { ...validSnapshot(), marker: null } }],
    [
      'non-synthetic workspace',
      {
        snapshot: {
          ...validSnapshot(),
          marker: { ...validSnapshot().marker!, syntheticMarker: 'production' },
        },
      },
    ],
    ['unauthorized identity', { snapshot: { ...validSnapshot(), membershipPresent: false } }],
    [
      'cross-workspace document',
      {
        snapshot: {
          ...validSnapshot(),
          documents: [{ ...validSnapshot().documents[0], workspaceId: crypto.randomUUID() }],
        },
      },
    ],
    [
      'extra arbitrary workspace document',
      {
        snapshot: {
          ...validSnapshot(),
          documents: [
            ...validSnapshot().documents,
            {
              id: crypto.randomUUID(),
              workspaceId: request.workspaceId,
              parserName: 'synthetic-fixture',
              deletedAt: null,
            },
          ],
        },
      },
    ],
    [
      'unapproved candidate set',
      {
        snapshot: {
          ...validSnapshot(),
          marker: {
            ...validSnapshot().marker!,
            approvedCandidateIds: [crypto.randomUUID()],
          },
        },
      },
    ],
  ])('stops %s before provider execution', async (_label, mutation) => {
    const execute = vi.fn(async () => 'provider-called');
    await expect(
      runAfterPhase4SyntheticSmokePreflight({
        request: mutation.request ?? request,
        snapshot: mutation.snapshot ?? validSnapshot(),
        runtime: PHASE4_QUALIFIED_PRODUCTION_CONFIG,
        execute,
      }),
    ).rejects.toThrow(/phase4_synthetic_smoke_preflight_failed/);
    expect(execute).not.toHaveBeenCalled();
  });
});
