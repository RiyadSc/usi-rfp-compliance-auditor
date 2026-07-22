import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import * as parse5 from 'parse5';
import { z } from 'zod';
import { DocumentProcessingError } from '../errors';
import { sha256Hex } from '../hash';
import { detectSourceFormat } from '../inspection';
import {
  NORMALIZATION_VERSION,
  normalizedContentHash,
  normalizedDocumentSchema,
  normalizeText,
  stableSourceId,
  type NormalizedBlock,
  type NormalizedDocument,
  type NormalizedPage,
  type NormalizedTable,
  type NormalizedTableCell,
  type SourceDocumentFormat,
  buildSectionHierarchy,
} from '../normalized';
import { assertSafePackageEntries, classifyOoxml, readBoundedArchive } from './archive';

export const parserInputSchema = z.object({
  workspaceId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
  filename: z.string().min(1),
  declaredMime: z.string().min(1),
  maxUnits: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type ParserInput = z.infer<typeof parserInputSchema>;

export const parserInspectionSchema = z.object({
  detectedFormat: z.enum(['pdf', 'docx', 'xlsx', 'html', 'txt', 'image', 'zip_package']),
  formatConfidence: z.number().min(0).max(1),
  nativeTextAvailable: z.boolean(),
  estimatedUnits: z.number().int().nonnegative(),
  hasImages: z.boolean(),
  suspectedScans: z.boolean(),
  suspectedTables: z.boolean(),
  encrypted: z.boolean(),
  malformed: z.boolean(),
  ocrMayBeRequired: z.boolean(),
  warnings: z.array(z.string()),
  unsupportedFeatures: z.array(z.string()),
});
export type ParserInspection = z.infer<typeof parserInspectionSchema>;

export interface DocumentParserAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly supportedFormats: readonly SourceDocumentFormat[];
  inspect(input: ParserInput): Promise<ParserInspection>;
  parse(input: ParserInput): Promise<NormalizedDocument>;
  resume?(input: ParserInput & { completedUnitIds: string[] }): Promise<NormalizedDocument>;
}

function block(
  input: ParserInput,
  format: SourceDocumentFormat,
  type: NormalizedBlock['type'],
  text: string,
  orderIndex: number,
  provenance: Partial<NormalizedBlock['provenance']> = {},
  metadata: Record<string, unknown> = {},
  confidence = 1,
): NormalizedBlock {
  return {
    id: stableSourceId(input.sourceDocumentId, format, type, orderIndex, text),
    type,
    text,
    normalizedText: normalizeText(text),
    orderIndex,
    confidence,
    provenance: { sourceDocumentId: input.sourceDocumentId, sourceFormat: format, ...provenance },
    metadata,
  };
}

function finalize(
  input: ParserInput,
  format: SourceDocumentFormat,
  adapterId: string,
  adapterVersion: string,
  pages: NormalizedPage[],
  warnings: NormalizedDocument['warnings'] = [],
): NormalizedDocument {
  const sections = buildSectionHierarchy(input.sourceDocumentId, pages);
  const base = {
    id: stableSourceId(
      input.workspaceId,
      input.sourceDocumentId,
      sha256Hex(input.bytes),
      adapterId,
      adapterVersion,
      NORMALIZATION_VERSION,
    ),
    workspaceId: input.workspaceId,
    sourceDocumentId: input.sourceDocumentId,
    sourceFormat: format,
    sourceHash: sha256Hex(input.bytes),
    parserAdapter: adapterId,
    parserVersion: adapterVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    pages,
    sections,
    warnings,
    statistics: {
      pageCount: pages.length,
      blockCount: pages.reduce((n, p) => n + p.blocks.length, 0),
      tableCount: pages.reduce((n, p) => n + p.tables.length, 0),
      imageCount: pages.reduce((n, p) => n + p.blocks.filter((b) => b.type === 'image').length, 0),
      nativeTextPages: pages.filter((p) => p.nativeTextAvailable).length,
      ocrPages: pages.filter((p) => p.ocrApplied).length,
      uncertainPages: pages.filter((p) =>
        ['uncertain', 'failed', 'partial'].includes(p.parserState),
      ).length,
      characterCount: pages.reduce(
        (n, p) => n + p.blocks.reduce((sum, b) => sum + b.text.length, 0),
        0,
      ),
    },
  } satisfies Omit<NormalizedDocument, 'contentHash'>;
  return normalizedDocumentSchema.parse({ ...base, contentHash: normalizedContentHash(base) });
}

function singlePage(
  input: ParserInput,
  format: SourceDocumentFormat,
  blocks: NormalizedBlock[],
  state: NormalizedPage['parserState'] = 'native',
  tables: NormalizedTable[] = [],
): NormalizedPage {
  const id = stableSourceId(input.sourceDocumentId, 'page', 0);
  return {
    id,
    physicalPageIndex: 0,
    nativeTextAvailable: blocks.some((item) => item.text.length > 0),
    ocrApplied: state === 'ocr',
    parserConfidence: state === 'uncertain' ? 0.4 : 1,
    parserState: state,
    blocks: blocks.map((item) => ({ ...item, pageId: id })),
    tables: tables.map((table) => ({ ...table, pageId: id })),
    warnings: [],
  };
}

abstract class BaseAdapter implements DocumentParserAdapter {
  abstract readonly adapterId: string;
  abstract readonly adapterVersion: string;
  abstract readonly supportedFormats: readonly SourceDocumentFormat[];
  async inspect(input: ParserInput): Promise<ParserInspection> {
    const detected = detectSourceFormat(input.bytes, input.filename, input.declaredMime);
    let format = detected.format;
    if (format === 'zip_package') format = classifyOoxml(await readBoundedArchive(input.bytes));
    if (!this.supportedFormats.includes(format))
      throw new DocumentProcessingError(
        'invalid_type',
        `${this.adapterId} does not support ${format}`,
      );
    return parserInspectionSchema.parse({
      detectedFormat: format,
      formatConfidence: detected.confidence,
      nativeTextAvailable: format !== 'image',
      estimatedUnits: 1,
      hasImages: format === 'image',
      suspectedScans: format === 'image',
      suspectedTables: format === 'xlsx',
      encrypted: false,
      malformed: false,
      ocrMayBeRequired: format === 'image',
      warnings: detected.warnings,
      unsupportedFeatures: [],
    });
  }
  abstract parse(input: ParserInput): Promise<NormalizedDocument>;
}

export class TxtParserAdapter extends BaseAdapter {
  readonly adapterId = 'txt-native';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['txt'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    await this.inspect(input);
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(input.bytes)
      .replace(/\r\n?/g, '\n');
    const blocks = text.split('\n').map((line, index) =>
      block(
        input,
        'txt',
        /^\s*(?:#{1,6}|[A-Z][A-Z\s]{5,})/.test(line) ? 'heading' : 'paragraph',
        line,
        index,
        {
          sourceOffsetStart: text.split('\n').slice(0, index).join('\n').length,
          sourceOffsetEnd: text
            .split('\n')
            .slice(0, index + 1)
            .join('\n').length,
        },
        { lineNumber: index + 1 },
      ),
    );
    return finalize(
      input,
      'txt',
      this.adapterId,
      this.adapterVersion,
      [singlePage(input, 'txt', blocks)],
      [
        {
          code: 'page_navigation_unavailable',
          message: 'Plain text has line provenance, not physical pages',
          severity: 'info',
        },
      ],
    );
  }
}

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
};
const visibleText = (node: HtmlNode): string =>
  node.nodeName === '#text'
    ? (node.value ?? '')
    : (node.childNodes ?? []).map(visibleText).join(' ');

export class HtmlParserAdapter extends BaseAdapter {
  readonly adapterId = 'parse5-html';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['html'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    await this.inspect(input);
    const root = parse5.parse(new TextDecoder().decode(input.bytes)) as unknown as HtmlNode;
    const blocks: NormalizedBlock[] = [];
    const tables: NormalizedTable[] = [];
    let order = 0;
    const walk = (node: HtmlNode, path: string) => {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
      const current = `${path}/${tag ?? node.nodeName ?? 'node'}[${order}]`;
      if (tag && /^(h[1-6]|p|li|caption)$/.test(tag)) {
        const text = normalizeText(visibleText(node));
        if (text)
          blocks.push(
            block(
              input,
              'html',
              tag.startsWith('h')
                ? 'heading'
                : tag === 'li'
                  ? 'list_item'
                  : tag === 'caption'
                    ? 'caption'
                    : 'paragraph',
              text,
              order++,
              { xpath: current },
              {
                links: (node.attrs ?? []).filter((a) => a.name === 'href').map((a) => a.value),
                ...(tag.startsWith('h') ? { headingLevel: Number(tag.slice(1)) } : {}),
              },
            ),
          );
      }
      if (tag === 'table') {
        const rows = (node.childNodes ?? []).flatMap(function collect(n): HtmlNode[] {
          return n.tagName === 'tr' ? [n] : (n.childNodes ?? []).flatMap(collect);
        });
        const cells: NormalizedTableCell[] = [];
        let columns = 0;
        rows.forEach((row, ri) => {
          const rowCells = (row.childNodes ?? []).filter(
            (n) => n.tagName === 'td' || n.tagName === 'th',
          );
          columns = Math.max(columns, rowCells.length);
          rowCells.forEach((cell, ci) =>
            cells.push({
              id: stableSourceId(input.sourceDocumentId, 'html-table', tables.length, ri, ci),
              rowIndex: ri,
              columnIndex: ci,
              rowSpan: Number(cell.attrs?.find((a) => a.name === 'rowspan')?.value) || 1,
              columnSpan: Number(cell.attrs?.find((a) => a.name === 'colspan')?.value) || 1,
              rawText: normalizeText(visibleText(cell)),
              normalizedText: normalizeText(visibleText(cell)),
              role: cell.tagName === 'th' ? 'header' : ci === 0 ? 'row_header' : 'data',
              confidence: 1,
              provenance: {
                sourceDocumentId: input.sourceDocumentId,
                sourceFormat: 'html',
                tableId: `table-${tables.length}`,
                rowIndex: ri,
                columnIndex: ci,
                xpath: current,
              },
            }),
          );
        });
        const tableBlock = block(
          input,
          'html',
          'table',
          '',
          order++,
          { xpath: current },
          { structured: true },
        );
        blocks.push(tableBlock);
        tables.push({
          id: stableSourceId(input.sourceDocumentId, 'html-table', tables.length),
          sourceDocumentId: input.sourceDocumentId,
          blockId: tableBlock.id,
          headerRows:
            rows.length && rows[0]?.childNodes?.some((n) => n.tagName === 'th') ? [0] : [],
          rowCount: rows.length,
          columnCount: columns,
          cells,
          confidence: 1,
          warnings: [],
          repeatedHeader: false,
        });
        return;
      }
      (node.childNodes ?? []).forEach((child) => walk(child, current));
    };
    walk(root, '');
    return finalize(
      input,
      'html',
      this.adapterId,
      this.adapterVersion,
      [singlePage(input, 'html', blocks, 'native', tables)],
      [
        {
          code: 'active_content_removed',
          message: 'Scripts, styles, event behavior, and remote resources were not executed',
          severity: 'info',
        },
        {
          code: 'page_navigation_unavailable',
          message: 'HTML evidence uses DOM-path provenance',
          severity: 'info',
        },
      ],
    );
  }
}

const xmlOrdered = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  allowBooleanAttributes: false,
});
const xmlObject = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  allowBooleanAttributes: false,
});
type OrderedXml = Record<string, unknown>;
function xmlText(node: unknown): string {
  if (Array.isArray(node)) return node.map(xmlText).join(' ');
  if (node && typeof node === 'object')
    return Object.entries(node as OrderedXml)
      .map(([key, value]) => (key === '#text' ? String(value) : key === ':@' ? '' : xmlText(value)))
      .join(' ');
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

export class DocxParserAdapter extends BaseAdapter {
  readonly adapterId = 'ooxml-docx';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['docx'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    const entries = await readBoundedArchive(input.bytes);
    if (classifyOoxml(entries) !== 'docx')
      throw new DocumentProcessingError('invalid_magic', 'ZIP content is not DOCX');
    const source = entries.get('word/document.xml');
    if (!source)
      throw new DocumentProcessingError('malformed', 'DOCX main document part is missing');
    const sourceXml = source.toString('utf8');
    const ordered = xmlOrdered.parse(sourceXml) as unknown[];
    const blocks: NormalizedBlock[] = [];
    const tables: NormalizedTable[] = [];
    let order = 0;
    let tableIndex = 0;
    const visit = (nodes: unknown[]) => {
      for (const item of nodes) {
        if (!item || typeof item !== 'object') continue;
        for (const [key, value] of Object.entries(item as OrderedXml)) {
          if (key === 'w:p') {
            const text = normalizeText(xmlText(value));
            if (text)
              blocks.push(
                block(
                  input,
                  'docx',
                  'paragraph',
                  text,
                  order++,
                  { paragraphIndex: order - 1 },
                  { part: 'word/document.xml' },
                ),
              );
          } else if (key === 'w:tbl') {
            const text = normalizeText(xmlText(value));
            const tableId = stableSourceId(input.sourceDocumentId, 'docx-table', tableIndex);
            const tableBlock = block(
              input,
              'docx',
              'table',
              text,
              order++,
              { tableId },
              { part: 'word/document.xml', structuredSource: true },
              0.9,
            );
            blocks.push(tableBlock);
            const objectTables = findObjectsByKey(xmlObject.parse(sourceXml), 'w:tbl');
            const tableObject = objectTables[tableIndex] ?? {};
            const rows = findObjectsByKey(tableObject, 'w:tr');
            const cells: NormalizedTableCell[] = [];
            let columnCount = 0;
            rows.forEach((row, rowIndex) => {
              let columnIndexValue = 0;
              for (const cell of findObjectsByKey(row, 'w:tc')) {
                const properties = record(cell['w:tcPr']);
                const spanNode = record(properties['w:gridSpan']);
                const columnSpan = Math.max(
                  1,
                  Number(spanNode['@_w:val'] ?? spanNode['@_val'] ?? 1),
                );
                const cellText = normalizeText(xmlText(cell['w:p'] ?? cell));
                cells.push({
                  id: stableSourceId(tableId, rowIndex, columnIndexValue),
                  rowIndex,
                  columnIndex: columnIndexValue,
                  rowSpan: 1,
                  columnSpan,
                  rawText: cellText,
                  normalizedText: cellText,
                  role: rowIndex === 0 ? 'header' : columnIndexValue === 0 ? 'row_header' : 'data',
                  confidence: 0.95,
                  provenance: {
                    sourceDocumentId: input.sourceDocumentId,
                    sourceFormat: 'docx',
                    tableId,
                    rowIndex,
                    columnIndex: columnIndexValue,
                  },
                });
                columnIndexValue += columnSpan;
              }
              columnCount = Math.max(columnCount, columnIndexValue);
            });
            tables.push({
              id: tableId,
              sourceDocumentId: input.sourceDocumentId,
              blockId: tableBlock.id,
              headerRows: rows.length ? [0] : [],
              rowCount: rows.length,
              columnCount,
              cells,
              confidence: 0.95,
              warnings: [],
              repeatedHeader: false,
            });
            tableIndex++;
          } else if (Array.isArray(value)) visit(value);
        }
      }
    };
    visit(ordered);
    const headers = [...entries.keys()].filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n));
    for (const name of headers) {
      const text = normalizeText(xmlText(xmlOrdered.parse(entries.get(name)!.toString('utf8'))));
      if (text)
        blocks.push(
          block(
            input,
            'docx',
            name.includes('header') ? 'header' : 'footer',
            text,
            order++,
            {},
            { part: name },
          ),
        );
    }
    return finalize(
      input,
      'docx',
      this.adapterId,
      this.adapterVersion,
      [singlePage(input, 'docx', blocks, 'native', tables)],
      [
        {
          code: 'page_navigation_unavailable',
          message:
            'DOCX OOXML does not preserve reliable rendered pagination; paragraph/table provenance is used',
          severity: 'warning',
        },
      ],
    );
  }
}

function array<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function columnIndex(address: string): number {
  let value = 0;
  for (const char of address.match(/[A-Z]+/i)?.[0] ?? '') {
    value = value * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }
  return Math.max(0, value - 1);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function records(value: unknown): Record<string, unknown>[] {
  return array(value).map(record);
}

function findObjectsByKey(root: unknown, key: string): Record<string, unknown>[] {
  if (!root || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap((item) => findObjectsByKey(item, key));
  const object = record(root);
  return Object.entries(object).flatMap(([entryKey, value]) =>
    entryKey === key ? records(value) : findObjectsByKey(value, key),
  );
}

function spreadsheetCoordinate(address: string): { row: number; column: number } {
  const row = Math.max(0, Number(address.match(/\d+/)?.[0] ?? 1) - 1);
  return { row, column: columnIndex(address) };
}

export class XlsxParserAdapter extends BaseAdapter {
  readonly adapterId = 'ooxml-xlsx';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['xlsx'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    const entries = await readBoundedArchive(input.bytes);
    if (classifyOoxml(entries) !== 'xlsx')
      throw new DocumentProcessingError('invalid_magic', 'ZIP content is not XLSX');
    const workbookRoot = record(
      record(xmlObject.parse(entries.get('xl/workbook.xml')!.toString('utf8'))).workbook,
    );
    const workbookSheets = record(workbookRoot.sheets);
    const relationshipRoot = record(
      record(
        xmlObject.parse(
          entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '<Relationships/>',
        ),
      ).Relationships,
    );
    const relMap = new Map(
      records(relationshipRoot.Relationship).map((item) => [
        String(item['@_Id'] ?? ''),
        String(item['@_Target'] ?? ''),
      ]),
    );
    const sharedRaw = entries.get('xl/sharedStrings.xml');
    const sharedRoot = sharedRaw
      ? record(record(xmlObject.parse(sharedRaw.toString('utf8'))).sst)
      : {};
    const shared = records(sharedRoot.si).map((item) => normalizeText(xmlText(item)));
    const pages: NormalizedPage[] = [];
    let sheetOrder = 0;
    for (const sheet of records(workbookSheets.sheet)) {
      const name = String(sheet['@_name'] ?? `Sheet ${sheetOrder + 1}`);
      const target =
        relMap.get(String(sheet['@_r:id'] ?? '')) ?? `worksheets/sheet${sheetOrder + 1}.xml`;
      const path = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`;
      const rawSheet = entries.get(path);
      if (!rawSheet) {
        sheetOrder++;
        continue;
      }
      const worksheet = record(record(xmlObject.parse(rawSheet.toString('utf8'))).worksheet);
      const rows = records(record(worksheet.sheetData).row);
      const cells: NormalizedTableCell[] = [];
      let maxColumn = 0;
      for (const row of rows) {
        const ri = Math.max(0, Number(row['@_r'] ?? 1) - 1);
        for (const cell of records(row.c)) {
          const address = String(cell['@_r'] ?? 'A1');
          const ci = columnIndex(address);
          maxColumn = Math.max(maxColumn, ci + 1);
          const rawValue = String(cell.v ?? '');
          const display =
            cell['@_t'] === 's'
              ? (shared[Number(rawValue)] ?? rawValue)
              : cell['@_t'] === 'inlineStr'
                ? normalizeText(xmlText(cell.is))
                : rawValue;
          const numeric =
            cell['@_t'] === undefined && rawValue !== '' && Number.isFinite(Number(rawValue))
              ? Number(rawValue)
              : undefined;
          cells.push({
            id: stableSourceId(input.sourceDocumentId, name, address),
            rowIndex: ri,
            columnIndex: ci,
            rowSpan: 1,
            columnSpan: 1,
            rawText: display,
            normalizedText: normalizeText(display),
            role: ri === 0 ? 'header' : ci === 0 ? 'row_header' : 'data',
            ...(cell.f !== undefined ? { formula: String(cell.f) } : {}),
            ...(numeric !== undefined ? { numericValue: numeric } : {}),
            confidence: 1,
            provenance: {
              sourceDocumentId: input.sourceDocumentId,
              sourceFormat: 'xlsx',
              sheetName: name,
              cellRange: address,
              rowIndex: ri,
              columnIndex: ci,
            },
          });
        }
      }
      for (const merged of records(record(worksheet.mergeCells).mergeCell)) {
        const range = String(merged['@_ref'] ?? '');
        const [start, end] = range.split(':');
        if (!start || !end) continue;
        const from = spreadsheetCoordinate(start);
        const to = spreadsheetCoordinate(end);
        const anchor = cells.find(
          (cell) => cell.rowIndex === from.row && cell.columnIndex === from.column,
        );
        if (anchor) {
          anchor.rowSpan = Math.max(1, to.row - from.row + 1);
          anchor.columnSpan = Math.max(1, to.column - from.column + 1);
          anchor.provenance.cellRange = range;
        }
      }
      const dimension = record(worksheet.dimension)['@_ref'];
      const tableBlock = block(
        input,
        'xlsx',
        'table',
        '',
        0,
        { sheetName: name, ...(dimension ? { cellRange: String(dimension) } : {}) },
        { sheetOrder, hidden: sheet['@_state'] === 'hidden' },
      );
      const table: NormalizedTable = {
        id: stableSourceId(input.sourceDocumentId, 'sheet', name),
        sourceDocumentId: input.sourceDocumentId,
        blockId: tableBlock.id,
        title: name,
        headerRows: rows.length ? [0] : [],
        rowCount: Math.max(0, ...cells.map((c) => c.rowIndex + 1)),
        columnCount: maxColumn,
        cells,
        confidence: 1,
        warnings: [],
        repeatedHeader: false,
      };
      const page = singlePage(input, 'xlsx', [tableBlock], 'native', [table]);
      page.id = stableSourceId(input.sourceDocumentId, 'sheet', sheetOrder);
      page.displayedPageLabel = name;
      page.blocks = page.blocks.map((b) => ({ ...b, pageId: page.id }));
      page.tables = page.tables.map((t) => ({ ...t, pageId: page.id }));
      pages.push(page);
      sheetOrder++;
    }
    return finalize(input, 'xlsx', this.adapterId, this.adapterVersion, pages, [
      {
        code: 'xlsx_cached_formula_values',
        message: 'Formulas and cached values are preserved separately; cached values may be stale',
        severity: 'warning',
      },
      {
        code: 'page_navigation_unavailable',
        message: 'Spreadsheet evidence uses sheet and cell provenance',
        severity: 'info',
      },
    ]);
  }
}

export class ImageParserAdapter extends BaseAdapter {
  readonly adapterId = 'image-inspection';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['image'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    await this.inspect(input);
    const image = block(
      input,
      'image',
      'image',
      '',
      0,
      { pageIndex: 0 },
      {
        mime: detectSourceFormat(input.bytes, input.filename, input.declaredMime).detectedMime,
        orientation: 'unknown',
        ocrRequired: true,
      },
      0.5,
    );
    return finalize(
      input,
      'image',
      this.adapterId,
      this.adapterVersion,
      [singlePage(input, 'image', [image], 'uncertain')],
      [
        {
          code: 'ocr_required',
          message: 'Image text requires an approved OCR adapter; no text conclusion is available',
          severity: 'warning',
        },
      ],
    );
  }
}

export class ZipPackageParserAdapter extends BaseAdapter {
  readonly adapterId = 'yauzl-package';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['zip_package'] as const;
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    const entries = await readBoundedArchive(input.bytes);
    if (classifyOoxml(entries) !== 'zip_package')
      throw new DocumentProcessingError(
        'invalid_type',
        'OOXML documents must use their dedicated adapter',
      );
    assertSafePackageEntries(entries);
    const blocks = [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, bytes], index) =>
        block(
          input,
          'zip_package',
          'paragraph',
          name,
          index,
          {},
          {
            packagePath: name,
            sourceHash: createHash('sha256').update(bytes).digest('hex'),
            byteSize: bytes.length,
            classification: 'review_required',
          },
        ),
      );
    return finalize(
      input,
      'zip_package',
      this.adapterId,
      this.adapterVersion,
      [singlePage(input, 'zip_package', blocks)],
      [
        {
          code: 'package_classification_required',
          message: 'Package members require explicit or human-reviewable document classification',
          severity: 'warning',
        },
      ],
    );
  }
}

export const NON_PDF_ADAPTERS: readonly DocumentParserAdapter[] = [
  new DocxParserAdapter(),
  new XlsxParserAdapter(),
  new HtmlParserAdapter(),
  new TxtParserAdapter(),
  new ImageParserAdapter(),
  new ZipPackageParserAdapter(),
];
