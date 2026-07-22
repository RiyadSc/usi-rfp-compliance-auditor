import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { DocumentProcessingError } from '../errors';

export type ArchiveLimits = {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
};

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 250,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalUncompressedBytes: 200 * 1024 * 1024,
  maxCompressionRatio: 100,
};

function open(bytes: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
        autoClose: true,
      },
      (error, file) =>
        error || !file ? reject(error ?? new Error('archive unavailable')) : resolve(file),
    );
  });
}

function readEntry(file: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    file.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error('entry stream unavailable'));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes)
          stream.destroy(new DocumentProcessingError('oversized', 'Archive entry exceeds limit'));
        else chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

export async function readBoundedArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<Map<string, Buffer>> {
  const file = await open(bytes);
  const entries = new Map<string, Buffer>();
  let total = 0;
  let count = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      file.close();
      reject(
        error instanceof DocumentProcessingError
          ? error
          : new DocumentProcessingError('malformed', 'ZIP package could not be safely read'),
      );
    };
    file.on('error', fail);
    file.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(entries);
      }
    });
    file.on('entry', async (entry) => {
      try {
        count += 1;
        if (count > limits.maxEntries)
          throw new DocumentProcessingError('oversized', 'Archive contains too many entries');
        if (entry.fileName.endsWith('/')) {
          file.readEntry();
          return;
        }
        if (entry.uncompressedSize > limits.maxEntryBytes)
          throw new DocumentProcessingError('oversized', 'Archive entry exceeds size limit');
        total += entry.uncompressedSize;
        if (total > limits.maxTotalUncompressedBytes)
          throw new DocumentProcessingError('oversized', 'Archive expanded size exceeds limit');
        const ratio =
          entry.compressedSize === 0
            ? entry.uncompressedSize
            : entry.uncompressedSize / entry.compressedSize;
        if (ratio > limits.maxCompressionRatio)
          throw new DocumentProcessingError('oversized', 'Archive compression ratio exceeds limit');
        entries.set(entry.fileName, await readEntry(file, entry, limits.maxEntryBytes));
        file.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    file.readEntry();
  });
}

export function classifyOoxml(entries: Map<string, Buffer>): 'docx' | 'xlsx' | 'zip_package' {
  if (entries.has('word/document.xml') && entries.has('[Content_Types].xml')) return 'docx';
  if (entries.has('xl/workbook.xml') && entries.has('[Content_Types].xml')) return 'xlsx';
  return 'zip_package';
}

export function assertSafePackageEntries(entries: Map<string, Buffer>): void {
  const allowed = new Set([
    '.pdf',
    '.docx',
    '.xlsx',
    '.html',
    '.htm',
    '.txt',
    '.png',
    '.jpg',
    '.jpeg',
    '.tif',
    '.tiff',
    '.webp',
  ]);
  for (const name of entries.keys()) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.zip'))
      throw new DocumentProcessingError('invalid_type', 'Nested archives are not allowed');
    const extension = lower.match(/\.[a-z0-9]+$/)?.[0];
    if (!extension || !allowed.has(extension))
      throw new DocumentProcessingError(
        'invalid_type',
        `Archive contains unapproved file type: ${name}`,
      );
  }
}
