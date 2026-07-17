/** Normalized error categories — never include document contents. */
export const PARSE_ERROR_CATEGORIES = [
  'invalid_type',
  'invalid_magic',
  'oversized',
  'page_limit',
  'encrypted',
  'malformed',
  'timeout',
  'duplicate',
  'unauthorized',
  'not_found',
  'intent_expired',
  'intent_reused',
  'path_mismatch',
  'internal',
] as const;

export type ParseErrorCategory = (typeof PARSE_ERROR_CATEGORIES)[number];

export class DocumentProcessingError extends Error {
  readonly category: ParseErrorCategory;
  readonly retryable: boolean;

  constructor(category: ParseErrorCategory, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.category = category;
    this.retryable = options?.retryable ?? false;
  }
}

export function normalizeError(err: unknown): { category: ParseErrorCategory; message: string } {
  if (err instanceof DocumentProcessingError) {
    return { category: err.category, message: err.message };
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('password') || msg.includes('encrypted')) {
      return { category: 'encrypted', message: 'Document is encrypted or password-protected' };
    }
    if (msg.includes('timeout')) {
      return { category: 'timeout', message: 'Parsing timed out' };
    }
    if (msg.includes('invalid pdf') || msg.includes('bad xref')) {
      return { category: 'malformed', message: 'Document is malformed or truncated' };
    }
  }
  return { category: 'internal', message: 'Document processing failed' };
}
