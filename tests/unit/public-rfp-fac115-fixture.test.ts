import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
});
