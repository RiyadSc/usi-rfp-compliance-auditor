import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERIFICATION_CASES } from '../../fixtures/eval/verification-cases';

const root = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const manifest = JSON.parse(readFileSync(resolve(root, 'source-manifest.json'), 'utf8')) as {
  version: string;
  evaluationScope: { category: string; publicOnly: boolean; liveReady: boolean };
  sources: Array<{
    file: string;
    sha256: string;
    bytes: number;
    activeForCategory1: boolean;
    attachmentId: string | null;
  }>;
  excludedOfficialAttachments: Array<{ attachmentId: string; reason: string }>;
};
const answers = JSON.parse(readFileSync(resolve(root, 'known-answers-draft.json'), 'utf8')) as {
  status: string;
  expected: Array<{
    id: string;
    source: string;
    page: number;
    section: string;
    evidence: string;
    expectedSourceStatus: string;
    expectedPrecedenceStatus: string;
  }>;
};
const phase9Policy = JSON.parse(
  readFileSync(resolve(root, 'phase9-expected-answer-policy-v1.json'), 'utf8'),
) as {
  version: string;
  pilotAnswerIds: string[];
  supplementalExpected: Array<{
    id: string;
    sourceFile: string;
    renderedPage: number;
    nativeReference: { kind: string; sheetName?: string; cellRange?: string };
  }>;
  coverage: {
    genuineUnresolvedConflictCaseIds: string[];
    parserUncertainCaseIds: string[];
    promptInjectionCaseIds: string[];
  };
};
const phase9ControlCompanion = JSON.parse(
  readFileSync(resolve(root, 'phase9-security-control-companion-v1.json'), 'utf8'),
) as {
  sourceFixture: string;
  sourceType: string;
  partOfMassachusettsSource: boolean;
  eligibleForFac115SourceMetrics: boolean;
  eligibleForFac115LivePilot: boolean;
  cases: Array<{
    candidateId: string;
    control: string;
    expectedSourceStatus: string;
    expectedPrecedenceStatus: string;
  }>;
};

describe('Massachusetts FAC115 public fixture preflight', () => {
  it('pins the exact official public source bytes', () => {
    expect(manifest.version).toBe('massachusetts-fac115-source-manifest-v1');
    expect(manifest.evaluationScope).toMatchObject({
      category: 'Category 1 — Security Services',
      publicOnly: true,
      liveReady: false,
    });
    expect(manifest.sources).toHaveLength(8);
    for (const source of manifest.sources) {
      const bytes = readFileSync(resolve(root, 'source', source.file));
      expect(bytes.byteLength, source.file).toBe(source.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), source.file).toBe(source.sha256);
    }
  });

  it('keeps the first test category-scoped and records exclusions rather than merging them', () => {
    expect(
      manifest.sources.filter((source) => source.activeForCategory1).map((source) => source.file),
    ).not.toContain('FAC115_Attachment_C_Price_Sheet_Cost_Table_Fence_Rental_Services.xlsx');
    expect(manifest.excludedOfficialAttachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attachmentId: '1733126' }),
        expect.objectContaining({ attachmentId: '1733149' }),
      ]),
    );
  });

  it('freezes a provider-unseen structural answer draft but blocks premature live scoring', () => {
    expect(answers.status).toBe('citations_assigned_extraction_not_run');
    expect(answers.expected.length).toBeGreaterThanOrEqual(20);
    expect(new Set(answers.expected.map((answer) => answer.id)).size).toBe(answers.expected.length);
    expect(
      answers.expected.every(
        (answer) =>
          answer.source &&
          answer.section &&
          answer.evidence &&
          typeof answer.page === 'number' &&
          answer.page >= 1 &&
          answer.expectedSourceStatus &&
          answer.expectedPrecedenceStatus,
      ),
    ).toBe(true);
    expect(answers.expected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conference-old-date',
          expectedPrecedenceStatus: 'superseded',
        }),
        expect.objectContaining({
          id: 'conference-active-date',
          expectedPrecedenceStatus: 'active',
        }),
        expect.objectContaining({ id: 'watch-guard-license-attachment' }),
        expect.objectContaining({ id: 'post-award-forms-not-bid-attachments' }),
      ]),
    );
  });

  it('adds a Phase 9 native-workbook contract without changing the historical expected answers', () => {
    expect(phase9Policy.version).toBe('massachusetts-fac115-phase9-policy-v1');
    expect(phase9Policy.pilotAnswerIds).toHaveLength(11);
    expect(phase9Policy.supplementalExpected).toEqual([
      expect.objectContaining({
        id: 'price-workbook-union-markup',
        sourceFile: 'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf',
        renderedPage: 3,
        nativeReference: expect.objectContaining({
          kind: 'xlsx',
          sheetName: 'Guard Services',
          cellRange: 'I11',
        }),
      }),
    ]);
    expect(phase9Policy.coverage).toEqual({
      genuineUnresolvedConflictCaseIds: [],
      parserUncertainCaseIds: [],
      promptInjectionCaseIds: [],
    });
  });

  it('keeps adversarial controls in a separately labeled synthetic companion', () => {
    expect(phase9ControlCompanion).toMatchObject({
      sourceFixture: 'verification-cases-v2',
      sourceType: 'synthetic_security_control_only',
      partOfMassachusettsSource: false,
      eligibleForFac115SourceMetrics: false,
      eligibleForFac115LivePilot: false,
    });
    expect(new Set(phase9ControlCompanion.cases.map((item) => item.control))).toEqual(
      new Set(['parser_uncertain', 'prompt_injection', 'genuine_unresolved_conflict']),
    );
    for (const control of phase9ControlCompanion.cases) {
      const fixtureCase = VERIFICATION_CASES.find((item) => item.id === control.candidateId);
      expect(fixtureCase?.expected).toMatchObject({
        sourceSupportStatus: control.expectedSourceStatus,
        precedenceStatus: control.expectedPrecedenceStatus,
      });
    }
  });
});
