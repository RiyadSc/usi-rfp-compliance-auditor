import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FAC115_PHASE9_EXPECTED_VERSION,
  assertNoPhase9ProviderFlags,
  buildFac115Phase9ExpectedArtifact,
  fac115Phase9ExpectedArtifactSchema,
  mapFac115HistoricalCandidates,
  sha256Stable,
  type Phase9AnswerPolicy,
} from '../../packages/ai/src/public-rfp-phase9';

const root = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const frozen = JSON.parse(readFileSync(resolve(root, 'known-answers-draft.json'), 'utf8')) as {
  expected: Parameters<typeof buildFac115Phase9ExpectedArtifact>[0];
};
const policy = JSON.parse(
  readFileSync(resolve(root, 'phase9-expected-answer-policy-v1.json'), 'utf8'),
) as Phase9AnswerPolicy;

describe('Phase 9 FAC115 expected-answer contract', () => {
  it('builds a strict, stable, provider-unseen answer artifact without rewriting v1 answers', () => {
    const artifact = buildFac115Phase9ExpectedArtifact(frozen.expected, policy);
    expect(fac115Phase9ExpectedArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(artifact.version).toBe(FAC115_PHASE9_EXPECTED_VERSION);
    expect(artifact.expected).toHaveLength(frozen.expected.length + 1);
    expect(
      artifact.expected.filter((answer) => frozen.expected.some((item) => item.id === answer.id)),
    ).toHaveLength(frozen.expected.length);
    expect(artifact.expected.find((answer) => answer.id === 'price-workbook-union-markup')).toEqual(
      expect.objectContaining({
        sourceFile: 'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf',
        renderedPage: 3,
        nativeReference: expect.objectContaining({
          kind: 'xlsx',
          sheetName: 'Guard Services',
          cellRange: 'I11',
        }),
      }),
    );
    expect(sha256Stable(artifact)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Stable(artifact)).toBe(sha256Stable(artifact));
  });

  it('requires exact document, rendered page, and quote binding for historical candidates', () => {
    const artifact = buildFac115Phase9ExpectedArtifact(frozen.expected, policy);
    const answer = artifact.expected.find((item) => item.id === 'submission-method')!;
    const candidate = {
      id: 'accepted',
      analysisRunId: 'run',
      workspaceId: 'workspace',
      documentId: 'doc',
      category: 'submission_instruction',
      title: 'Submit through COMMBUYS',
      obligation: 'Use Create Quote',
      mandatoryClass: 'mandatory',
      preliminaryPage: 22,
      evidenceQuote:
        'Responses must be sent via the “Create Quote” functionality contained in COMMBUYS.',
      confidence: 1,
      ambiguityNotes: [],
      status: 'unverified',
      promptVersion: 'extract-v1',
      schemaVersion: 'candidate-v1',
      modelId: 'mock',
    } as const;
    const bindings = mapFac115HistoricalCandidates({
      answers: [answer],
      candidates: [candidate],
      acceptedCandidateIds: [candidate.id],
      documentIdBySourceFile: { [answer.sourceFile]: 'doc' },
    });
    expect(bindings[0]).toMatchObject({ exactBinding: true });
    expect(
      mapFac115HistoricalCandidates({
        answers: [answer],
        candidates: [{ ...candidate, preliminaryPage: 21 }],
        acceptedCandidateIds: [candidate.id],
        documentIdBySourceFile: { [answer.sourceFile]: 'doc' },
      })[0],
    ).toMatchObject({
      exactBinding: false,
      reason: 'not_extracted_or_page_mismatch',
    });
  });

  it('fails Stage 0 closed when any live FAC115 flag is enabled', () => {
    expect(() => assertNoPhase9ProviderFlags({})).not.toThrow();
    expect(() => assertNoPhase9ProviderFlags({ PUBLIC_RFP_FAC115_LIVE_PILOT: '1' })).toThrow(
      /forbids provider flags/,
    );
  });
});
