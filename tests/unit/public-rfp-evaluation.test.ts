import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_RFP_EXTRACTION_BATCH_VERSION,
  PUBLIC_RFP_PORTAL_SOURCE_VERSION,
  addExplicitAmendmentContext,
  buildPublicExtractionBatches,
  findExplicitPortalDeadlineReplacements,
  gatePreliminaryCandidateQuotes,
  officialPortalHtmlToText,
  precedenceForExplicitDeadline,
  scorePublicKnownAnswers,
} from '../../packages/ai/src/public-rfp-evaluation';
import type { RequirementCandidate } from '../../packages/ai/src/schemas';

const baseCandidate: RequirementCandidate = {
  id: '70000000-0000-4000-8000-000000000201',
  analysisRunId: '70000000-0000-4000-8000-000000000202',
  workspaceId: '70000000-0000-4000-8000-000000000203',
  documentId: '70000000-0000-4000-8000-000000000204',
  category: 'deadline',
  title: 'Question deadline',
  obligation: 'Submit questions by July 25, 2023 at 4:00 PM PST.',
  mandatoryClass: 'mandatory',
  preliminaryPage: 1,
  evidenceQuote: 'Submit questions by July 25, 2023.',
  confidence: 0.9,
  ambiguityNotes: [],
  status: 'unverified',
  promptVersion: 'extract-v1',
  schemaVersion: 'candidate-v1',
  modelId: 'mock',
};

describe('public RFP evaluation v2 controls', () => {
  it('has one versioned matcher for every frozen San Bernardino answer and no extras', () => {
    const expected = JSON.parse(
      readFileSync(
        'fixtures/public-rfp/san-bernardino-security-AGENCY23-PURC-5020/known-answers.json',
        'utf8',
      ),
    ) as { expected: Array<{ id: string }> };
    const matchers = JSON.parse(
      readFileSync(
        'fixtures/public-rfp/san-bernardino-security-AGENCY23-PURC-5020/known-answer-matchers-v2.json',
        'utf8',
      ),
    ) as { version: string; matchers: Array<{ id: string; patterns: string[] }> };
    expect(matchers.version).toBe('public-known-answer-matchers-v2');
    expect(matchers.matchers.map((matcher) => matcher.id).sort()).toEqual(
      expected.expected.map((answer) => answer.id).sort(),
    );
    expect(matchers.matchers.every((matcher) => matcher.patterns.length > 0)).toBe(true);
  });

  it('batches long documents by consecutive pages and token bounds', () => {
    const pages = Array.from({ length: 19 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Page ${index + 1} ${'requirement '.repeat(800)}`,
    }));
    const batches = buildPublicExtractionBatches(
      [{ id: baseCandidate.documentId, name: 'long-rfp.pdf', type: 'primary_rfp', pages }],
      { maxPages: 4, maxEstimatedTokens: 3000 },
    );
    expect(PUBLIC_RFP_EXTRACTION_BATCH_VERSION).toBe('public-extraction-batches-v2');
    expect(batches.length).toBeGreaterThan(4);
    expect(batches.flatMap((batch) => batch.pages.map((page) => page.pageNumber))).toEqual(
      pages.map((page) => page.pageNumber),
    );
    expect(batches.every((batch) => batch.pages.length <= 4)).toBe(true);
    expect(batches.every((batch) => batch.firstPage <= batch.lastPage)).toBe(true);
  });

  it('turns the official portal record into inert source text and detects explicit replacements', () => {
    const html = readFileSync(
      'fixtures/public-rfp/san-bernardino-security-AGENCY23-PURC-5020/source/official-solicitation-page.html',
      'utf8',
    );
    const text = officialPortalHtmlToText(html);
    const replacements = findExplicitPortalDeadlineReplacements(text);
    expect(PUBLIC_RFP_PORTAL_SOURCE_VERSION).toBe('public-portal-source-v1');
    expect(text).not.toMatch(/<script|document\.forms/i);
    expect(replacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'question_deadline',
          oldNormalized: '2023-07-25',
          replacementNormalized: '2023-08-02',
        }),
        expect.objectContaining({
          role: 'submission_deadline',
          oldNormalized: '2023-08-18',
          replacementNormalized: '2023-08-25',
        }),
      ]),
    );
  });

  it('fails closed on deadline precedence without explicit old/new evidence', () => {
    const text = officialPortalHtmlToText(
      '<p>Questions are due July 25, 2023. Proposals are due August 18, 2023.</p>',
    );
    expect(findExplicitPortalDeadlineReplacements(text)).toEqual([]);
    expect(precedenceForExplicitDeadline(baseCandidate, [])).toBe('undetermined');
  });

  it('marks only explicitly replaced deadlines superseded and replacements active', () => {
    const replacements = [
      {
        role: 'question_deadline' as const,
        oldRaw: 'July 25, 2023 4:00 PM (PST)',
        oldNormalized: '2023-07-25',
        replacementRaw: 'August 2, 2023 4:00 PM (PST)',
        replacementNormalized: '2023-08-02',
        evidence: 'Amendment 1 changed from July 25 to August 2.',
      },
    ];
    expect(precedenceForExplicitDeadline(baseCandidate, replacements)).toBe('superseded');
    expect(
      precedenceForExplicitDeadline(
        {
          title: 'Question deadline',
          obligation: 'Submit questions by August 2, 2023 at 4:00 PM PST.',
        },
        replacements,
      ),
    ).toBe('active');
  });

  it('rejects concatenated table-cell quotations before verification', () => {
    const valid = { ...baseCandidate, evidenceQuote: 'Submit questions by July 25, 2023.' };
    const invalid = {
      ...baseCandidate,
      id: '70000000-0000-4000-8000-000000000205',
      title: 'Equipment by site',
      evidenceQuote: 'EQUIPMENT 4 SB County Government Center',
    };
    const result = gatePreliminaryCandidateQuotes(
      [valid, invalid],
      [
        {
          id: baseCandidate.documentId,
          name: 'source.pdf',
          type: 'primary_rfp',
          pages: [
            {
              pageNumber: 1,
              text: 'Submit questions by July 25, 2023. EQUIPMENT table. 4. SB County Government Center.',
            },
          ],
        },
      ],
    );
    expect(result.accepted.map((candidate) => candidate.id)).toEqual([valid.id]);
    expect(result.rejected).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({ id: invalid.id }),
        matchType: 'fuzzy_candidate',
      }),
    ]);
  });

  it('adds explicit amendment evidence for affected deadline candidates only', () => {
    const cited = {
      chunkId: 'rfp:1',
      documentId: baseCandidate.documentId,
      documentType: 'primary_rfp',
      pageNumber: 1,
      text: 'Submit questions by July 25, 2023.',
      extractionStatus: 'ok',
      parserWarnings: [],
      retrievalReason: 'cited_page',
    };
    const portal = {
      chunkId: 'portal:1',
      documentId: '70000000-0000-4000-8000-000000000206',
      documentType: 'amendment_portal',
      pageNumber: 1,
      text: 'Amendment 1 changed the question deadline from July 25 to August 2.',
      extractionStatus: 'ok',
      parserWarnings: [],
      retrievalReason: 'explicit_amendment',
    };
    const replacements = [
      {
        role: 'question_deadline' as const,
        oldRaw: 'July 25, 2023',
        oldNormalized: '2023-07-25',
        replacementRaw: 'August 2, 2023',
        replacementNormalized: '2023-08-02',
        evidence: portal.text,
      },
    ];
    expect(addExplicitAmendmentContext(baseCandidate, [cited], portal, replacements)).toEqual([
      cited,
      portal,
    ]);
    expect(
      addExplicitAmendmentContext(
        { title: 'Insurance', obligation: 'Maintain $5M general liability.' },
        [cited],
        portal,
        replacements,
      ),
    ).toEqual([cited]);
  });

  it('scores every frozen answer independently and requires the correct precedence axis', () => {
    const active = {
      ...baseCandidate,
      id: '70000000-0000-4000-8000-000000000207',
      title: 'Final question deadline August 2, 2023',
      obligation: 'Submit questions by August 2, 2023.',
    };
    const score = scorePublicKnownAnswers({
      expected: [
        {
          id: 'question-final',
          status: 'active',
          document: 'source.pdf',
          page: 1,
          summary: 'Final question deadline',
        },
        {
          id: 'missing-form',
          status: 'active',
          document: 'source.pdf',
          page: 2,
          summary: 'Missing form',
        },
      ],
      matchers: [
        { id: 'question-final', patterns: ['question deadline.*August 2'] },
        { id: 'missing-form', patterns: ['Form Z'] },
      ],
      candidates: [active],
      documents: [
        {
          id: baseCandidate.documentId,
          name: 'source.pdf',
          type: 'primary_rfp',
          pages: [{ pageNumber: 1, text: active.obligation }],
        },
      ],
      assessmentByCandidateId: new Map([
        [active.id, { sourceSupportStatus: 'supported', precedenceStatus: 'active' }],
      ]),
    });
    expect(score).toMatchObject({ total: 2, passed: 1, recall: 0.5 });
    expect(score.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'question-final', passed: true }),
        expect.objectContaining({ id: 'missing-form', passed: false, reason: 'not_extracted' }),
      ]),
    );
  });

  it('does not count a merely extracted but unsupported candidate as a known-answer pass', () => {
    const score = scorePublicKnownAnswers({
      expected: [
        {
          id: 'question-old',
          status: 'superseded',
          document: 'source.pdf',
          page: 1,
          summary: 'Old question deadline',
        },
      ],
      matchers: [{ id: 'question-old', patterns: ['question deadline'] }],
      candidates: [baseCandidate],
      documents: [
        {
          id: baseCandidate.documentId,
          name: 'source.pdf',
          type: 'primary_rfp',
          pages: [{ pageNumber: 1, text: baseCandidate.obligation }],
        },
      ],
      assessmentByCandidateId: new Map([
        [baseCandidate.id, { sourceSupportStatus: 'unsupported', precedenceStatus: 'superseded' }],
      ]),
    });
    expect(score.results[0]).toMatchObject({
      passed: false,
      reason: 'not_source_supported',
      actualStatus: 'superseded',
    });
  });

  it('reports a matched extraction with no final verification assessment as incomplete', () => {
    const score = scorePublicKnownAnswers({
      expected: [
        {
          id: 'question-final',
          status: 'active',
          document: 'source.pdf',
          page: 1,
          summary: 'Final question deadline',
        },
      ],
      matchers: [{ id: 'question-final', patterns: ['question deadline'] }],
      candidates: [baseCandidate],
      documents: [
        {
          id: baseCandidate.documentId,
          name: 'source.pdf',
          type: 'primary_rfp',
          pages: [{ pageNumber: 1, text: baseCandidate.obligation }],
        },
      ],
      assessmentByCandidateId: new Map(),
    });
    expect(score.results[0]).toMatchObject({
      passed: false,
      reason: 'verification_missing',
    });
  });
});
