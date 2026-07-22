import { createHash } from 'node:crypto';
import { z } from 'zod';

export const NORMALIZATION_VERSION = 'normalized-document-v1';
export const TABLE_MODEL_VERSION = 'normalized-table-v1';

export const sourceDocumentFormatSchema = z.enum([
  'pdf',
  'docx',
  'xlsx',
  'html',
  'txt',
  'image',
  'zip_package',
]);
export type SourceDocumentFormat = z.infer<typeof sourceDocumentFormatSchema>;

export const parserWarningSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  severity: z.enum(['info', 'warning', 'error']),
  blockId: z.string().optional(),
  pageId: z.string().optional(),
});

export const boundingBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  unit: z.enum(['pt', 'px', 'normalized']),
});

export const blockProvenanceSchema = z.object({
  sourceDocumentId: z.string().min(1),
  sourceFormat: sourceDocumentFormatSchema,
  pageIndex: z.number().int().nonnegative().optional(),
  sheetName: z.string().max(200).optional(),
  cellRange: z.string().max(100).optional(),
  paragraphIndex: z.number().int().nonnegative().optional(),
  tableId: z.string().optional(),
  rowIndex: z.number().int().nonnegative().optional(),
  columnIndex: z.number().int().nonnegative().optional(),
  xpath: z.string().max(1000).optional(),
  sourceOffsetStart: z.number().int().nonnegative().optional(),
  sourceOffsetEnd: z.number().int().nonnegative().optional(),
});

export const normalizedBlockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'list',
  'list_item',
  'table',
  'table_row',
  'table_cell',
  'image',
  'caption',
  'header',
  'footer',
  'page_break',
  'unknown',
]);

export const normalizedBlockSchema = z.object({
  id: z.string().min(1),
  type: normalizedBlockTypeSchema,
  text: z.string(),
  normalizedText: z.string(),
  pageId: z.string().optional(),
  sectionId: z.string().optional(),
  parentBlockId: z.string().optional(),
  orderIndex: z.number().int().nonnegative(),
  boundingBox: boundingBoxSchema.optional(),
  confidence: z.number().min(0).max(1),
  provenance: blockProvenanceSchema,
  metadata: z.record(z.unknown()),
});
export type NormalizedBlock = z.infer<typeof normalizedBlockSchema>;

export const normalizedTableCellSchema = z.object({
  id: z.string().min(1),
  rowIndex: z.number().int().nonnegative(),
  columnIndex: z.number().int().nonnegative(),
  rowSpan: z.number().int().min(1),
  columnSpan: z.number().int().min(1),
  rawText: z.string(),
  normalizedText: z.string(),
  role: z.enum(['header', 'row_header', 'data', 'caption', 'unknown']),
  formula: z.string().optional(),
  numericValue: z.number().finite().optional(),
  dateValue: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  unit: z.string().max(80).optional(),
  boundingBox: boundingBoxSchema.optional(),
  confidence: z.number().min(0).max(1),
  provenance: blockProvenanceSchema,
});
export type NormalizedTableCell = z.infer<typeof normalizedTableCellSchema>;

export const normalizedTableSchema = z.object({
  id: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  pageId: z.string().optional(),
  blockId: z.string().min(1),
  title: z.string().optional(),
  caption: z.string().optional(),
  headerRows: z.array(z.number().int().nonnegative()),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  cells: z.array(normalizedTableCellSchema),
  boundingBox: boundingBoxSchema.optional(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(parserWarningSchema),
  continuationOfTableId: z.string().optional(),
  repeatedHeader: z.boolean().default(false),
});
export type NormalizedTable = z.infer<typeof normalizedTableSchema>;

export const normalizedPageSchema = z.object({
  id: z.string().min(1),
  physicalPageIndex: z.number().int().nonnegative(),
  displayedPageLabel: z.string().max(80).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  nativeTextAvailable: z.boolean(),
  ocrApplied: z.boolean(),
  parserConfidence: z.number().min(0).max(1),
  parserState: z.enum(['native', 'ocr', 'hybrid', 'partial', 'uncertain', 'failed']),
  blocks: z.array(normalizedBlockSchema),
  tables: z.array(normalizedTableSchema).default([]),
  sourceArtifactId: z.string().optional(),
  warnings: z.array(parserWarningSchema).default([]),
});
export type NormalizedPage = z.infer<typeof normalizedPageSchema>;

export const normalizedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  level: z.number().int().min(1).max(12),
  orderIndex: z.number().int().nonnegative(),
  parentSectionId: z.string().optional(),
  blockIds: z.array(z.string()),
  provenance: blockProvenanceSchema,
});

export const normalizedDocumentSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  sourceFormat: sourceDocumentFormatSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  parserAdapter: z.string().min(1),
  parserVersion: z.string().min(1),
  normalizationVersion: z.literal(NORMALIZATION_VERSION),
  language: z.string().optional(),
  pages: z.array(normalizedPageSchema),
  sections: z.array(normalizedSectionSchema),
  warnings: z.array(parserWarningSchema),
  statistics: z.object({
    pageCount: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
    imageCount: z.number().int().nonnegative(),
    nativeTextPages: z.number().int().nonnegative(),
    ocrPages: z.number().int().nonnegative(),
    uncertainPages: z.number().int().nonnegative(),
    characterCount: z.number().int().nonnegative(),
  }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type NormalizedDocument = z.infer<typeof normalizedDocumentSchema>;

export type NormalizedSection = z.infer<typeof normalizedSectionSchema>;

/** Builds a deterministic heading hierarchy and attaches each following block to its nearest heading. */
export function buildSectionHierarchy(
  sourceDocumentId: string,
  pages: NormalizedPage[],
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];
  const stack: Array<{ level: number; id: string }> = [];
  for (const page of pages) {
    for (const block of [...page.blocks].sort((a, b) => a.orderIndex - b.orderIndex)) {
      if (block.type === 'heading') {
        const explicit = Number(block.metadata.headingLevel);
        const match = block.text.match(/^\s*(#{1,6})\s/);
        const level =
          Number.isInteger(explicit) && explicit >= 1 && explicit <= 12
            ? explicit
            : (match?.[1]?.length ?? 1);
        while (stack.length && stack.at(-1)!.level >= level) stack.pop();
        const id = stableSourceId(sourceDocumentId, 'section', block.id, level);
        const section: NormalizedSection = {
          id,
          title: block.normalizedText || block.text,
          level,
          orderIndex: sections.length,
          ...(stack.length ? { parentSectionId: stack.at(-1)!.id } : {}),
          blockIds: [block.id],
          provenance: block.provenance,
        };
        sections.push(section);
        stack.push({ level, id });
        block.sectionId = id;
      } else if (stack.length) {
        const current = sections.find((section) => section.id === stack.at(-1)!.id);
        if (current) {
          current.blockIds.push(block.id);
          block.sectionId = current.id;
        }
      }
    }
  }
  return sections;
}

export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Stable IDs are content-addressed and independent of database UUID allocation. */
export function stableSourceId(...parts: Array<string | number>): string {
  return createHash('sha256').update(parts.map(String).join('\u001f')).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function normalizedContentHash(
  document: Omit<NormalizedDocument, 'contentHash'> | Record<string, unknown>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(document)))
    .digest('hex');
}

export function renderTableForModel(table: NormalizedTable): string {
  const grid = Array.from({ length: table.rowCount }, () =>
    Array.from({ length: table.columnCount }, () => ''),
  );
  for (const cell of table.cells) {
    if (grid[cell.rowIndex]?.[cell.columnIndex] !== undefined) {
      grid[cell.rowIndex]![cell.columnIndex] = cell.normalizedText;
    }
  }
  return grid.map((row) => `| ${row.map((value) => value || '—').join(' | ')} |`).join('\n');
}
