import { describe, expect, it } from 'vitest';
import { VERIFICATION_CASES, VERIFICATION_PAGES_V2 } from '../../fixtures/eval/verification-cases';
import {
  buildPhase4SyntheticPdf,
  phase4SyntheticManifest,
} from '../../scripts/lib/phase4-complete-synthetic-scope';
import { computeSyntheticExpectedAnswersHash } from '../../apps/worker/src/phase4-smoke-preflight';

describe('complete Phase 4 synthetic scope manifest', () => {
  it('binds exactly the frozen 24 candidates and complete document set', () => {
    const manifest = phase4SyntheticManifest();
    expect(manifest.candidates).toHaveLength(24);
    expect(manifest.candidateIds).toEqual(VERIFICATION_CASES.map((item) => item.id).sort());
    expect(manifest.documentIds).toEqual(['10000000-0000-4000-8000-000000000002']);
    expect(manifest.document.pageCount).toBe(VERIFICATION_PAGES_V2.length);
    expect(manifest.fixtureVersion).toBe('verification-cases-v2');
    expect(manifest.scopeVersion).toBe('phase4-complete-scope-v1');
    expect(manifest.syntheticMarker).toBe('phase4-synthetic-test-only');
    expect(manifest.candidateSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.documentSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.expectedAnswersHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates deterministic source PDF bytes and hashes', () => {
    const first = buildPhase4SyntheticPdf();
    const second = buildPhase4SyntheticPdf();
    expect(first.equals(second)).toBe(true);
    expect(first.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    expect(first.toString('ascii')).toContain('/Count 17');
    expect(phase4SyntheticManifest()).toMatchObject({
      document: { sha256: phase4SyntheticManifest().document.sha256 },
      documentSetHash: phase4SyntheticManifest().documentSetHash,
    });
  });

  it('binds every expected-answer axis to the expected-answer hash', () => {
    const manifest = phase4SyntheticManifest();
    const changed = structuredClone(VERIFICATION_CASES) as unknown as Array<{
      id: string;
      expected: {
        sourceSupportStatus: string;
        precedenceStatus: string;
        proofRequirement: string;
        pages: number[];
      };
    }>;
    changed[0].expected.sourceSupportStatus = 'unsupported';
    expect(computeSyntheticExpectedAnswersHash(changed)).not.toBe(manifest.expectedAnswersHash);
  });
});
