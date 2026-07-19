import { describe, expect, it, vi } from 'vitest';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
  assertQualifiedPhase4Runtime,
  fingerprintPhase4Compatibility,
} from '../../packages/ai/src/phase4-qualified-config';
import {
  PHASE4_SYNTHETIC_MARKER,
  PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION,
  assertNextPhase4SyntheticSmokeRunVersion,
  computePhase4SmokeRunInputHash,
  computeSyntheticCandidateSetHash,
  computeSyntheticDocumentSetHash,
  runAfterPhase4SyntheticSmokePreflight,
  validatePhase4SyntheticSmokePreflight,
  type Phase4SyntheticSmokeInput,
  type Phase4SyntheticSmokeSnapshot,
} from '../../apps/worker/src/phase4-smoke-preflight';
import { phase4SyntheticManifest } from '../../scripts/lib/phase4-complete-synthetic-scope';

const manifest = phase4SyntheticManifest();

const request: Phase4SyntheticSmokeInput = {
  smokeScopeId: manifest.scopeId,
  workspaceId: manifest.workspaceId,
  authenticatedUserId: '30000000-0000-4000-8000-000000000003',
  documentIds: manifest.documentIds,
  analysisRunId: manifest.analysisRunId,
  expectedCompatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  expectedCandidateSetHash: manifest.candidateSetHash,
  expectedDocumentSetHash: manifest.documentSetHash,
  expectedAnswersHash: manifest.expectedAnswersHash,
  fixtureVersion: 'verification-cases-v2',
};
const candidates = manifest.candidates;

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
      approvedCandidateIds: manifest.candidateIds,
      candidateSetHash: computeSyntheticCandidateSetHash(candidates),
      documentSetHash: computeSyntheticDocumentSetHash([manifest.document]),
      expectedAnswersHash: manifest.expectedAnswersHash,
      scopeVersion: PHASE4_COMPLETE_SYNTHETIC_SCOPE_VERSION,
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
        objectKey: manifest.document.objectKey,
        sha256: manifest.document.sha256,
        pageCount: manifest.document.pageCount,
        parserName: 'synthetic-fixture',
        parserVersion: manifest.document.parserVersion,
        deletedAt: null,
      },
    ],
    candidates,
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
  it('accepts only the next consecutive immutable verification-run version', () => {
    expect(assertNextPhase4SyntheticSmokeRunVersion(1, [])).toBe(1);
    expect(assertNextPhase4SyntheticSmokeRunVersion(2, [1])).toBe(2);
    expect(assertNextPhase4SyntheticSmokeRunVersion(4, [1, 3, 2])).toBe(4);
  });

  it.each([
    ['a duplicate version', 1, [1]],
    ['a stale version', 1, [1, 2]],
    ['a skipped version', 4, [1, 2]],
    ['zero', 0, []],
    ['a fractional version', 1.5, [1]],
    ['not a number', Number.NaN, [1]],
  ])('rejects %s before provider execution', (_label, requestedVersion, existingVersions) => {
    expect(() =>
      assertNextPhase4SyntheticSmokeRunVersion(requestedVersion, existingVersions),
    ).toThrow(/phase4_synthetic_smoke_preflight_failed/);
  });

  it('fails closed when persisted versions are malformed', () => {
    expect(() => assertNextPhase4SyntheticSmokeRunVersion(2, [Number.NaN])).toThrow(
      /invalid_existing_verification_run_version/,
    );
  });

  it('accepts only the exact immutable synthetic scope', () => {
    expect(
      validatePhase4SyntheticSmokePreflight(
        request,
        validSnapshot(),
        PHASE4_QUALIFIED_PRODUCTION_CONFIG,
      ),
    ).toMatchObject({
      assertedCompatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
      candidateIds: manifest.candidateIds,
      documentIds: request.documentIds,
    });
  });

  it('hashes only validated complete-scope provenance into the smoke run input hash', () => {
    const validated = validatePhase4SyntheticSmokePreflight(
      request,
      validSnapshot(),
      PHASE4_QUALIFIED_PRODUCTION_CONFIG,
    );
    expect(
      computePhase4SmokeRunInputHash({
        analysisRunId: request.analysisRunId,
        candidateSetHash: validated.candidateSetHash,
        compatibilityFingerprint: validated.assertedCompatibilityFingerprint,
      }),
    ).toBe('2ef68e32c45ebe4ab089ec34efbbfcc80722530d1b1618f7e71d4798de1a83c3');
    expect(
      computePhase4SmokeRunInputHash({
        analysisRunId: request.analysisRunId,
        candidateSetHash: validated.candidateSetHash,
        compatibilityFingerprint: validated.assertedCompatibilityFingerprint,
      }),
    ).not.toBe('9c1f1750beb0bfcf6fb33e60cef24d468f889cd9105beabbf45fd4a9ae030806');
  });

  it.each([
    ['missing candidate-set hash', undefined, request.expectedCompatibilityFingerprint],
    ['missing compatibility fingerprint', request.expectedCandidateSetHash, undefined],
    ['malformed candidate-set hash', 'not-a-hash', request.expectedCompatibilityFingerprint],
    ['malformed compatibility fingerprint', request.expectedCandidateSetHash, 'not-a-hash'],
  ])('rejects %s before a smoke run can be created', (_label, candidateSetHash, fingerprint) => {
    expect(() =>
      computePhase4SmokeRunInputHash({
        analysisRunId: request.analysisRunId,
        candidateSetHash: candidateSetHash as string,
        compatibilityFingerprint: fingerprint as string,
      }),
    ).toThrow(/invalid_run_input_hash_material/);
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
    ['missing document', { snapshot: { ...validSnapshot(), documents: [] } }],
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
            approvedCandidateIds: [crypto.randomUUID(), ...manifest.candidateIds.slice(1)],
          },
        },
      },
    ],
    [
      'legacy one-candidate scope',
      {
        snapshot: {
          ...validSnapshot(),
          marker: { ...validSnapshot().marker!, scopeVersion: 'phase4-legacy-scope-v0' },
        },
      },
    ],
    [
      'missing candidate',
      { snapshot: { ...validSnapshot(), candidates: candidates.slice(0, -1) } },
    ],
    [
      'extra candidate',
      {
        snapshot: {
          ...validSnapshot(),
          candidates: [{ ...candidates[0], id: crypto.randomUUID() }, ...candidates],
        },
      },
    ],
    [
      'candidate hash drift',
      {
        snapshot: {
          ...validSnapshot(),
          candidates: [{ ...candidates[0], obligation: 'drifted' }, ...candidates.slice(1)],
        },
      },
    ],
    [
      'document hash drift',
      {
        snapshot: {
          ...validSnapshot(),
          documents: [{ ...validSnapshot().documents[0], sha256: 'f'.repeat(64) }],
        },
      },
    ],
    [
      'wrong expected-answer hash',
      { request: { ...request, expectedAnswersHash: 'f'.repeat(64) } },
    ],
    ['wrong fixture version', { request: { ...request, fixtureVersion: 'verification-cases-v1' } }],
    [
      'wrong fingerprint',
      { request: { ...request, expectedCompatibilityFingerprint: 'f'.repeat(64) } },
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
