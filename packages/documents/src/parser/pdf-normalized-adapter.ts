import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
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
} from '../normalized';
import { selectOcr } from '../ocr-policy';
import {
  parserInputSchema,
  parserInspectionSchema,
  type DocumentParserAdapter,
  type ParserInput,
  type ParserInspection,
} from './adapters';

const require = createRequire(import.meta.url);
type TextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type Page = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  getTextContent: (options: { includeMarkedContent: boolean }) => Promise<{ items: TextItem[] }>;
};
type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<Page>;
  getPageLabels?: () => Promise<Array<string | null> | null>;
  destroy: () => Promise<void>;
};

export class NormalizedPdfParserAdapter implements DocumentParserAdapter {
  readonly adapterId = 'pdfjs-normalized';
  readonly adapterVersion: string;
  readonly supportedFormats = ['pdf'] as const;
  constructor() {
    this.adapterVersion =
      (require('pdfjs-dist/package.json') as { version: string }).version + '+normalized-v1';
  }
  async inspect(raw: ParserInput): Promise<ParserInspection> {
    const input = parserInputSchema.parse(raw);
    const detected = detectSourceFormat(input.bytes, input.filename, input.declaredMime);
    if (detected.format !== 'pdf')
      throw new DocumentProcessingError('invalid_type', 'PDF adapter requires PDF signature');
    return parserInspectionSchema.parse({
      detectedFormat: 'pdf',
      formatConfidence: 1,
      nativeTextAvailable: true,
      estimatedUnits: 0,
      hasImages: false,
      suspectedScans: false,
      suspectedTables: false,
      encrypted: false,
      malformed: false,
      ocrMayBeRequired: true,
      warnings: detected.warnings,
      unsupportedFeatures: [
        'pixel-stable rendered page assets are deferred to the rendering work unit',
      ],
    });
  }
  async parse(raw: ParserInput): Promise<NormalizedDocument> {
    const input = parserInputSchema.parse(raw);
    await this.inspect(input);
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocument> };
    };
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ).href;
    let doc: PdfDocument | undefined;
    try {
      const loading = pdfjs.getDocument({
        data: input.bytes,
        disableFontFace: true,
        useSystemFonts: false,
        stopAtErrors: false,
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true,
        verbosity: 0,
      }).promise;
      doc = input.timeoutMs
        ? await Promise.race([
            loading,
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new DocumentProcessingError('timeout', 'PDF inspection timed out', {
                      retryable: true,
                    }),
                  ),
                input.timeoutMs,
              ),
            ),
          ])
        : await loading;
      if (input.maxUnits && doc.numPages > input.maxUnits)
        throw new DocumentProcessingError(
          'page_limit',
          `PDF exceeds maximum of ${input.maxUnits} pages`,
        );
      const labels = (await doc.getPageLabels?.()) ?? null;
      const pages: NormalizedPage[] = [];
      const warnings: NormalizedDocument['warnings'] = [];
      for (let index = 0; index < doc.numPages; index++) {
        const source = await doc.getPage(index + 1);
        const viewport = source.getViewport({ scale: 1 });
        const content = await source.getTextContent({ includeMarkedContent: false });
        const items = content.items.filter(
          (item) => typeof item.str === 'string' && item.str.length > 0,
        );
        const pageId = stableSourceId(input.sourceDocumentId, 'pdf-page', index);
        const blocks: NormalizedBlock[] = items.map((item, order) => {
          const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
          const text = item.str ?? '';
          return {
            id: stableSourceId(input.sourceDocumentId, index, order, text),
            type: 'paragraph',
            text,
            normalizedText: normalizeText(text),
            pageId,
            orderIndex: order,
            boundingBox: {
              x: transform[4] ?? 0,
              y: transform[5] ?? 0,
              width: Math.max(0, item.width ?? 0),
              height: Math.max(0, item.height ?? Math.abs(transform[3] ?? 0)),
              unit: 'pt',
            },
            confidence: 0.95,
            provenance: {
              sourceDocumentId: input.sourceDocumentId,
              sourceFormat: 'pdf',
              pageIndex: index,
            },
            metadata: { nativeTextItem: true },
          };
        });
        const joined = normalizeText(items.map((item) => item.str ?? '').join(' '));
        const tableSource = blocks.find((candidate) => /\bTABLE\b|\|/.test(candidate.text));
        const tables: NormalizedTable[] = [];
        if (tableSource) {
          tableSource.type = 'table';
          const values = tableSource.text
            .replace(/^.*?TABLE(?:\s+CONTINUED)?:?\s*/i, '')
            .split(/\s*\|\s*/)
            .filter(Boolean);
          const tableId = stableSourceId(
            input.sourceDocumentId,
            'pdf-table',
            index,
            tableSource.id,
          );
          tables.push({
            id: tableId,
            sourceDocumentId: input.sourceDocumentId,
            pageId,
            blockId: tableSource.id,
            headerRows: [],
            rowCount: 1,
            columnCount: values.length,
            cells: values.map((value, columnIndex) => ({
              id: stableSourceId(tableId, 0, columnIndex),
              rowIndex: 0,
              columnIndex,
              rowSpan: 1,
              columnSpan: 1,
              rawText: value,
              normalizedText: normalizeText(value),
              role: columnIndex === 0 ? 'row_header' : 'data',
              confidence: 0.75,
              provenance: {
                sourceDocumentId: input.sourceDocumentId,
                sourceFormat: 'pdf',
                pageIndex: index,
                tableId,
                rowIndex: 0,
                columnIndex,
              },
            })),
            confidence: 0.75,
            warnings: [
              {
                code: 'pdf_table_inferred',
                message: 'Table structure inferred from native text geometry and delimiters',
                severity: 'warning',
                pageId,
              },
            ],
            repeatedHeader: false,
          });
        }
        const replacement = (joined.match(/�/g)?.length ?? 0) / Math.max(1, joined.length);
        const printable =
          [...joined].filter((ch) => ch >= ' ' && ch !== '�').length / Math.max(1, joined.length);
        const ocr = selectOcr({
          characterCount: joined.length,
          printableCharacterRatio: printable,
          replacementCharacterRatio: replacement,
          plausibleWordRatio: joined
            ? joined.split(/\s+/).filter((word) => /[a-z]{2}/i.test(word)).length /
              Math.max(1, joined.split(/\s+/).length)
            : 0,
          readingOrderScore: items.length ? 0.8 : 0,
          imageCoverageRatio: items.length ? 0 : 1,
          parserWarningCount: 0,
          parserFailed: false,
        });
        const uncertain = ['ocr_required', 'ocr_recommended', 'parser_failed'].includes(
          ocr.classification,
        );
        if (uncertain)
          warnings.push({
            code: 'ocr_selection',
            message: `Page ${index + 1}: ${ocr.classification}`,
            severity: 'warning',
            pageId,
          });
        pages.push({
          id: pageId,
          physicalPageIndex: index,
          ...(labels?.[index] ? { displayedPageLabel: labels[index]! } : {}),
          width: viewport.width,
          height: viewport.height,
          nativeTextAvailable: joined.length > 0,
          ocrApplied: false,
          parserConfidence: uncertain ? 0.45 : 0.95,
          parserState: uncertain ? 'uncertain' : 'native',
          blocks,
          tables,
          sourceArtifactId: input.sourceDocumentId,
          warnings: uncertain
            ? [
                {
                  code: 'ocr_selection',
                  message: ocr.reasons.join(', '),
                  severity: 'warning',
                  pageId,
                },
              ]
            : [],
        });
      }
      for (let index = 1; index < pages.length; index++) {
        const current = pages[index]?.tables[0];
        const previous = pages[index - 1]?.tables[0];
        const currentText =
          pages[index]?.blocks.find((block) => block.id === current?.blockId)?.text ?? '';
        if (current && previous && /^\s*TABLE\s+CONTINUED/i.test(currentText)) {
          current.continuationOfTableId = previous.id;
          current.repeatedHeader = current.cells.some((cell) =>
            previous.cells.some((prior) => prior.normalizedText === cell.normalizedText),
          );
        }
      }
      const base = {
        id: stableSourceId(
          input.workspaceId,
          input.sourceDocumentId,
          sha256Hex(input.bytes),
          this.adapterId,
          this.adapterVersion,
          NORMALIZATION_VERSION,
        ),
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        sourceFormat: 'pdf' as const,
        sourceHash: sha256Hex(input.bytes),
        parserAdapter: this.adapterId,
        parserVersion: this.adapterVersion,
        normalizationVersion: NORMALIZATION_VERSION,
        pages,
        sections: [],
        warnings,
        statistics: {
          pageCount: pages.length,
          blockCount: pages.reduce((n, p) => n + p.blocks.length, 0),
          tableCount: pages.reduce((n, p) => n + p.tables.length, 0),
          imageCount: 0,
          nativeTextPages: pages.filter((p) => p.nativeTextAvailable).length,
          ocrPages: 0,
          uncertainPages: pages.filter((p) => p.parserState === 'uncertain').length,
          characterCount: pages.reduce(
            (n, p) => n + p.blocks.reduce((sum, b) => sum + b.text.length, 0),
            0,
          ),
        },
      };
      return normalizedDocumentSchema.parse({ ...base, contentHash: normalizedContentHash(base) });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('password') || message.includes('encrypted'))
        throw new DocumentProcessingError('encrypted', 'Encrypted PDFs are not supported');
      if (error instanceof DocumentProcessingError) throw error;
      throw new DocumentProcessingError('malformed', 'PDF could not be normalized');
    } finally {
      try {
        await doc?.destroy();
      } catch {
        /* cleanup only */
      }
    }
  }
}

/** Decode one physical page for durable page-level retry without iterating the document. */
export async function parsePdfPageUnit(
  raw: ParserInput,
  physicalPageIndex: number,
): Promise<NormalizedPage> {
  const input = parserInputSchema.parse(raw);
  if (physicalPageIndex < 0)
    throw new DocumentProcessingError('malformed', 'Physical page index must be non-negative');
  const detected = detectSourceFormat(input.bytes, input.filename, input.declaredMime);
  if (detected.format !== 'pdf')
    throw new DocumentProcessingError(
      'invalid_type',
      'Page-unit retry requires PDF source provenance',
    );
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocument> };
  };
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href;
  let doc: PdfDocument | undefined;
  try {
    doc = await pdfjs.getDocument({
      data: input.bytes,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    }).promise;
    if (physicalPageIndex >= doc.numPages)
      throw new DocumentProcessingError('page_limit', 'Requested PDF page does not exist');
    const source = await doc.getPage(physicalPageIndex + 1);
    const viewport = source.getViewport({ scale: 1 });
    const content = await source.getTextContent({ includeMarkedContent: false });
    const items = content.items.filter(
      (item) => typeof item.str === 'string' && item.str.length > 0,
    );
    const pageId = stableSourceId(input.sourceDocumentId, 'pdf-page', physicalPageIndex);
    const blocks: NormalizedBlock[] = items.map((item, order) => {
      const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const text = item.str ?? '';
      return {
        id: stableSourceId(input.sourceDocumentId, physicalPageIndex, order, text),
        type: 'paragraph',
        text,
        normalizedText: normalizeText(text),
        pageId,
        orderIndex: order,
        boundingBox: {
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          width: Math.max(0, item.width ?? 0),
          height: Math.max(0, item.height ?? Math.abs(transform[3] ?? 0)),
          unit: 'pt',
        },
        confidence: 0.95,
        provenance: {
          sourceDocumentId: input.sourceDocumentId,
          sourceFormat: 'pdf',
          pageIndex: physicalPageIndex,
        },
        metadata: { nativeTextItem: true },
      };
    });
    const joined = normalizeText(items.map((item) => item.str ?? '').join(' '));
    const replacement = (joined.match(/�/g)?.length ?? 0) / Math.max(1, joined.length);
    const printable =
      [...joined].filter((character) => character >= ' ' && character !== '�').length /
      Math.max(1, joined.length);
    const ocr = selectOcr({
      characterCount: joined.length,
      printableCharacterRatio: printable,
      replacementCharacterRatio: replacement,
      plausibleWordRatio: joined
        ? joined.split(/\s+/).filter((word) => /[a-z]{2}/i.test(word)).length /
          Math.max(1, joined.split(/\s+/).length)
        : 0,
      readingOrderScore: items.length ? 0.8 : 0,
      imageCoverageRatio: items.length ? 0 : 1,
      parserWarningCount: 0,
      parserFailed: false,
    });
    const uncertain = ['ocr_required', 'ocr_recommended', 'parser_failed'].includes(
      ocr.classification,
    );
    return {
      id: pageId,
      physicalPageIndex,
      width: viewport.width,
      height: viewport.height,
      nativeTextAvailable: joined.length > 0,
      ocrApplied: false,
      parserConfidence: uncertain ? 0.45 : 0.95,
      parserState: uncertain ? 'uncertain' : 'native',
      blocks,
      tables: [],
      sourceArtifactId: input.sourceDocumentId,
      warnings: uncertain
        ? [{ code: 'ocr_selection', message: ocr.reasons.join(', '), severity: 'warning', pageId }]
        : [],
    };
  } finally {
    try {
      await doc?.destroy();
    } catch {
      /* cleanup only */
    }
  }
}
