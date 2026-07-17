import { DocumentProcessingError } from './errors';

/** Live DB statuses from documents_ingestion migration. */
export const PARSE_STATUSES = [
  'uploaded',
  'validating',
  'validated',
  'parsing',
  'parsed',
  'failed',
  'rejected',
  'deleted',
] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

const TRANSITIONS: Record<ParseStatus, readonly ParseStatus[]> = {
  uploaded: ['validating', 'parsing', 'failed', 'rejected', 'deleted'],
  validating: ['validated', 'failed', 'rejected', 'deleted'],
  validated: ['parsing', 'failed', 'deleted'],
  parsing: ['parsed', 'failed', 'deleted'],
  parsed: ['deleted'],
  failed: ['deleted', 'uploaded'],
  rejected: ['deleted'],
  deleted: [],
};

export function canTransition(from: ParseStatus, to: ParseStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: ParseStatus, to: ParseStatus): void {
  if (!canTransition(from, to)) {
    throw new DocumentProcessingError('internal', `Invalid status transition ${from} → ${to}`);
  }
}

export const INTENT_STATUSES = ['pending', 'used', 'expired', 'cancelled'] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export function canUseIntent(
  status: IntentStatus,
  expiresAt: Date,
  now = new Date(),
): IntentStatus | 'ok' {
  if (status === 'used') return 'used';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired' || now.getTime() >= expiresAt.getTime()) return 'expired';
  if (status !== 'pending') return status;
  return 'ok';
}

/** Map internal error categories to DB check-constrained values. */
export function toDbErrorCategory(category: string): string {
  const map: Record<string, string> = {
    invalid_magic: 'invalid_magic_bytes',
    invalid_type: 'malformed_pdf',
    oversized: 'oversized',
    duplicate: 'duplicate',
    encrypted: 'encrypted_pdf',
    malformed: 'malformed_pdf',
    page_limit: 'page_limit_exceeded',
    timeout: 'parse_timeout',
    unauthorized: 'internal_error',
    not_found: 'storage_error',
    intent_expired: 'internal_error',
    intent_reused: 'internal_error',
    path_mismatch: 'internal_error',
    internal: 'internal_error',
  };
  return map[category] ?? 'internal_error';
}

/** Map parser extraction status to DB values: ok | empty | error */
export function toDbExtractionStatus(
  status: 'text' | 'empty' | 'image_only' | 'failed',
): 'ok' | 'empty' | 'error' {
  if (status === 'text') return 'ok';
  if (status === 'failed') return 'error';
  return 'empty';
}
