import { z } from 'zod';
import { classifyBlock } from './prefilter';
import type { NormalizedDocument } from './normalized';

export const COMPLEXITY_ASSESSMENT_VERSION = 'document-complexity-v1';

export const documentComplexitySchema = z.object({
  pageCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  tableCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  scannedPageCount: z.number().int().nonnegative(),
  uncertainPageCount: z.number().int().nonnegative(),
  addendumSignalCount: z.number().int().nonnegative(),
  likelyRequirementBlockCount: z.number().int().nonnegative(),
  archiveEntryCount: z.number().int().nonnegative().default(0),
  complexity: z.enum(['small', 'medium', 'large', 'extreme']),
  warnings: z.array(z.string()),
});

export type DocumentComplexity = z.infer<typeof documentComplexitySchema>;

export function assessDocumentComplexity(
  document: NormalizedDocument,
  archiveEntryCount = 0,
): DocumentComplexity {
  const blocks = document.pages.flatMap((page) => page.blocks);
  const classifications = blocks.map(classifyBlock);
  const metrics = {
    pageCount: document.pages.length,
    blockCount: blocks.length,
    tableCount: document.pages.reduce((sum, page) => sum + page.tables.length, 0),
    characterCount: blocks.reduce((sum, block) => sum + block.text.length, 0),
    scannedPageCount: document.pages.filter((page) => page.ocrApplied).length,
    uncertainPageCount: document.pages.filter((page) => page.parserState === 'uncertain').length,
    addendumSignalCount: classifications.filter(
      (item) => item.classification === 'addendum_precedence_relevant',
    ).length,
    likelyRequirementBlockCount: classifications.filter((item) =>
      [
        'likely_requirement',
        'addendum_precedence_relevant',
        'table_requiring_structured_review',
      ].includes(item.classification),
    ).length,
    archiveEntryCount,
  };
  const weighted =
    metrics.pageCount +
    Math.ceil(metrics.blockCount / 20) +
    metrics.tableCount * 3 +
    metrics.scannedPageCount * 4 +
    metrics.uncertainPageCount * 3 +
    Math.ceil(metrics.characterCount / 50_000);
  const complexity =
    weighted > 900 ? 'extreme' : weighted > 350 ? 'large' : weighted > 100 ? 'medium' : 'small';
  const warnings = [
    ...(metrics.pageCount > 500 ? ['page_count_exceeds_standard_limit'] : []),
    ...(metrics.characterCount > 10_000_000 ? ['character_volume_requires_operator_review'] : []),
    ...(metrics.uncertainPageCount > 50 ? ['many_parser_uncertain_pages'] : []),
    ...(archiveEntryCount > 100 ? ['large_archive_entry_count'] : []),
  ];
  return documentComplexitySchema.parse({ ...metrics, complexity, warnings });
}
