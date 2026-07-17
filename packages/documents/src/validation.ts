import { DocumentProcessingError } from './errors';

export const PDF_MAGIC = Buffer.from('%PDF-');
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
export const DEFAULT_MAX_PAGES = 100;
export const UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const ALLOWED_MIME = new Set(['application/pdf']);

/** Strip path components and control chars; keep a safe display name. */
export function normalizeFilename(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .slice(0, 180);
  if (!cleaned) return 'document.pdf';
  return cleaned;
}

export function assertPdfExtension(filename: string): void {
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new DocumentProcessingError('invalid_type', 'Only PDF files are accepted');
  }
}

export function assertAllowedMime(mime: string): void {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!ALLOWED_MIME.has(normalized)) {
    throw new DocumentProcessingError('invalid_type', 'Only application/pdf is accepted');
  }
}

export function assertWithinSizeLimit(
  byteSize: number,
  maxBytes: number = DEFAULT_MAX_BYTES,
): void {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw new DocumentProcessingError('malformed', 'Invalid file size');
  }
  if (byteSize > maxBytes) {
    throw new DocumentProcessingError(
      'oversized',
      `File exceeds maximum size of ${maxBytes} bytes`,
    );
  }
}

export function assertPdfMagicBytes(buffer: Buffer | Uint8Array): void {
  const head = Buffer.from(buffer.subarray(0, 5));
  if (!head.equals(PDF_MAGIC)) {
    throw new DocumentProcessingError('invalid_magic', 'File does not begin with PDF magic bytes');
  }
}

export function assertPageCount(pageCount: number, maxPages: number = DEFAULT_MAX_PAGES): void {
  if (pageCount < 1) {
    throw new DocumentProcessingError('malformed', 'PDF has no pages');
  }
  if (pageCount > maxPages) {
    throw new DocumentProcessingError('page_limit', `PDF exceeds maximum of ${maxPages} pages`);
  }
}

export function buildObjectKey(workspaceId: string, intentId: string, objectId: string): string {
  // Random object id — never use raw user filename as the storage key.
  return `${workspaceId}/${intentId}/${objectId}.pdf`;
}

export function isIntentExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}
