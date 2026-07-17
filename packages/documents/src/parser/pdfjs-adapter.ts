import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DocumentProcessingError } from '../errors';
import { sha256Hex } from '../hash';
import { assertPageCount } from '../validation';
import {
  type PageExtraction,
  type ParseResult,
  type ParserAdapter,
  type ParserAdapterOptions,
  parseResultSchema,
} from './types';

const require = createRequire(import.meta.url);

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: (opts: { includeMarkedContent: boolean }) => Promise<{
      items: Array<{ str?: string }>;
    }>;
  }>;
  destroy: () => Promise<void>;
};

/**
 * PDF.js adapter for server-side text extraction.
 * Hardened: no remote font/network fetch, no eval; encrypted PDFs rejected.
 * Empty pages still produce a page record.
 */
export class PdfJsParserAdapter implements ParserAdapter {
  readonly name = 'pdfjs-dist';
  readonly version: string;

  constructor() {
    const pkg = require('pdfjs-dist/package.json') as { version: string };
    this.version = pkg.version;
  }

  async parse(bytes: Uint8Array, options: ParserAdapterOptions): Promise<ParseResult> {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocument> };
    };
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

    let docForCleanup: PdfDocument | undefined;
    const warnings: string[] = [];

    const parsePromise = (async () => {
      const loadingTask = pdfjs.getDocument({
        data: bytes,
        disableFontFace: true,
        useSystemFonts: false,
        stopAtErrors: false,
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true,
        verbosity: 0,
      });

      const doc = await loadingTask.promise;
      docForCleanup = doc;
      assertPageCount(doc.numPages, options.maxPages);

      const pages: PageExtraction[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent({ includeMarkedContent: false });
        const text = content.items
          .map((item) => (typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const pageWarnings: string[] = [];
        let extractionStatus: PageExtraction['extractionStatus'] = 'text';
        if (!text) {
          extractionStatus = 'empty';
          pageWarnings.push('No extractable text on this page (may be image-only or blank)');
          warnings.push(`page ${i}: no extractable text`);
        }

        pages.push({
          pageNumber: i,
          pdfPageIndex: i - 1,
          text,
          textSha256: sha256Hex(text),
          extractionStatus,
          warnings: pageWarnings,
        });
      }

      return parseResultSchema.parse({
        pageCount: doc.numPages,
        pages,
        warnings,
        parserName: this.name,
        parserVersion: this.version,
        encrypted: false,
      });
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        parsePromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new DocumentProcessingError('timeout', 'PDF parsing timed out', { retryable: true }),
            );
          }, options.timeoutMs);
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('password') || msg.includes('encrypted') || msg.includes('no password')) {
        throw new DocumentProcessingError('encrypted', 'Encrypted PDFs are not supported');
      }
      if (err instanceof DocumentProcessingError) throw err;
      throw new DocumentProcessingError('malformed', 'PDF could not be parsed');
    } finally {
      if (timer) clearTimeout(timer);
      try {
        await docForCleanup?.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
