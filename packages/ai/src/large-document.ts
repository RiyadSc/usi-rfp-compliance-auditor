import { createHash } from 'node:crypto';
import { z } from 'zod';

export const NORMALIZED_INDEX_VERSION = 'normalized-index-v1';
export const BOUNDED_CONTEXT_VERSION = 'bounded-analysis-context-v1';

export const normalizedIndexRecordSchema = z.object({
  workspaceId: z.string().min(1),
  documentSetId: z.string().optional(),
  documentId: z.string().min(1),
  blockId: z.string().min(1),
  pageIndex: z.number().int().nonnegative().optional(),
  sheetName: z.string().optional(),
  cellRange: z.string().optional(),
  documentClass: z.string().min(1),
  sectionClass: z.string().min(1),
  headingPath: z.array(z.string()),
  text: z.string(),
  tableTitle: z.string().optional(),
  tableHeaders: z.array(z.string()).default([]),
  rowHeader: z.string().optional(),
  parserConfidence: z.number().min(0).max(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type NormalizedIndexRecord = z.infer<typeof normalizedIndexRecordSchema>;

export const boundedContextLimitsSchema = z.object({
  maxBlocks: z.number().int().min(1).max(50),
  maxPages: z.number().int().min(1).max(10),
  maxCharacters: z.number().int().min(100).max(100_000),
  maxEstimatedTokens: z.number().int().min(50).max(50_000),
  maxTableCells: z.number().int().min(0).max(1000),
});

export type ContextCandidate = NormalizedIndexRecord & { score: number; tableCellCount?: number };
export function buildBoundedAnalysisContext(
  candidates: ContextCandidate[],
  rawLimits: z.input<typeof boundedContextLimitsSchema>,
): {
  records: NormalizedIndexRecord[];
  estimatedTokens: number;
  truncated: boolean;
  omittedReasons: string[];
  contextHash: string;
} {
  const limits = boundedContextLimitsSchema.parse(rawLimits);
  const records: NormalizedIndexRecord[] = [];
  const pages = new Set<string>();
  let characters = 0;
  let cells = 0;
  const omittedReasons: string[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) => b.score - a.score || a.blockId.localeCompare(b.blockId),
  )) {
    const pageKey = `${candidate.documentId}:${candidate.pageIndex ?? candidate.sheetName ?? 'none'}`;
    const nextPages = new Set(pages).add(pageKey);
    const nextCharacters = characters + candidate.text.length;
    const nextCells = cells + (candidate.tableCellCount ?? 0);
    const nextTokens = Math.ceil(nextCharacters / 4);
    if (records.length >= limits.maxBlocks) {
      omittedReasons.push('max_blocks');
      continue;
    }
    if (nextPages.size > limits.maxPages) {
      omittedReasons.push('max_pages');
      continue;
    }
    if (nextCharacters > limits.maxCharacters) {
      omittedReasons.push('max_characters');
      continue;
    }
    if (nextTokens > limits.maxEstimatedTokens) {
      omittedReasons.push('max_tokens');
      continue;
    }
    if (nextCells > limits.maxTableCells) {
      omittedReasons.push('max_table_cells');
      continue;
    }
    records.push(normalizedIndexRecordSchema.parse(candidate));
    pages.add(pageKey);
    characters = nextCharacters;
    cells = nextCells;
  }
  const payload = JSON.stringify(
    records.map((r) => ({
      documentId: r.documentId,
      blockId: r.blockId,
      sourceHash: r.sourceHash,
    })),
  );
  return {
    records,
    estimatedTokens: Math.ceil(characters / 4),
    truncated: omittedReasons.length > 0,
    omittedReasons: [...new Set(omittedReasons)],
    contextHash: createHash('sha256').update(payload).digest('hex'),
  };
}

export type MockTierResult = {
  tier:
    | 'tier_0_deterministic'
    | 'tier_1_classification'
    | 'tier_2_extraction'
    | 'tier_3_verification'
    | 'tier_4_ambiguity';
  status: 'completed' | 'escalation_required' | 'uncertain';
  output: Record<string, unknown>;
  providerCalls: 0;
  costUsd: 0;
};
export function runMockTierTask(input: {
  tier: MockTierResult['tier'];
  task: string;
  contextRecords: number;
  parserUncertain: boolean;
  lowerTierCompleted: boolean;
}): MockTierResult {
  if (input.tier === 'tier_3_verification' && !input.lowerTierCompleted)
    throw new Error('independent_verification_requires_completed_extraction');
  const status = input.parserUncertain
    ? 'uncertain'
    : input.tier === 'tier_4_ambiguity'
      ? 'escalation_required'
      : 'completed';
  return {
    tier: input.tier,
    status,
    output: { task: input.task, contextRecords: input.contextRecords, machineOnly: true },
    providerCalls: 0,
    costUsd: 0,
  };
}
