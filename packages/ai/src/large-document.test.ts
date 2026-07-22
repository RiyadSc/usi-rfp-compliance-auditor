import { describe, expect, it } from 'vitest';
import { buildBoundedAnalysisContext, runMockTierTask } from './large-document';

const hash = 'a'.repeat(64);
const record = (id: string, pageIndex: number, text: string, score: number) => ({
  workspaceId: 'w',
  documentId: 'd',
  blockId: id,
  pageIndex,
  documentClass: 'solicitation',
  sectionClass: 'requirements',
  headingPath: ['Requirements'],
  text,
  tableHeaders: [],
  parserConfidence: 1,
  sourceHash: hash,
  score,
});

describe('large-document provider boundaries', () => {
  it('constructs a deterministic targeted context without silent truncation', () => {
    const result = buildBoundedAnalysisContext(
      [record('b', 2, 'B'.repeat(80), 0.8), record('a', 1, 'A'.repeat(80), 1)],
      { maxBlocks: 1, maxPages: 1, maxCharacters: 100, maxEstimatedTokens: 50, maxTableCells: 10 },
    );
    expect(result.records.map((item) => item.blockId)).toEqual(['a']);
    expect(result.truncated).toBe(true);
    expect(result.omittedReasons).toContain('max_blocks');
  });
  it('keeps mock tiers provider-free and verification independent', () => {
    expect(
      runMockTierTask({
        tier: 'tier_2_extraction',
        task: 'extract',
        contextRecords: 2,
        parserUncertain: false,
        lowerTierCompleted: true,
      }),
    ).toMatchObject({ status: 'completed', providerCalls: 0, costUsd: 0 });
    expect(() =>
      runMockTierTask({
        tier: 'tier_3_verification',
        task: 'verify',
        contextRecords: 2,
        parserUncertain: false,
        lowerTierCompleted: false,
      }),
    ).toThrow(/requires_completed_extraction/);
  });
});
