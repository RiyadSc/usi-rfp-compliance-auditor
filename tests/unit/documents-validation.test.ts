import { describe, expect, it } from 'vitest';
import {
  assertAllowedMime,
  assertPageCount,
  assertPdfExtension,
  assertPdfMagicBytes,
  assertWithinSizeLimit,
  buildObjectKey,
  canTransition,
  canUseIntent,
  normalizeError,
  normalizeFilename,
  sha256Hex,
  toDbErrorCategory,
  toDbExtractionStatus,
  DocumentProcessingError,
} from '../../packages/documents/src/index.js';
import { parseResultSchema } from '../../packages/documents/src/parser/index.js';

describe('filename normalization', () => {
  it('strips paths and control characters', () => {
    expect(normalizeFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(normalizeFilename('bad\u0000name.pdf')).toBe('badname.pdf');
  });

  it('falls back when empty', () => {
    expect(normalizeFilename('///')).toBe('document.pdf');
  });
});

describe('extension and MIME', () => {
  it('accepts pdf extension and mime', () => {
    expect(() => assertPdfExtension('RFP.pdf')).not.toThrow();
    expect(() => assertAllowedMime('application/pdf')).not.toThrow();
  });

  it('rejects non-pdf', () => {
    expect(() => assertPdfExtension('notes.docx')).toThrow(DocumentProcessingError);
    expect(() => assertAllowedMime('application/msword')).toThrow(DocumentProcessingError);
  });
});

describe('magic bytes and size', () => {
  it('accepts %PDF- magic', () => {
    expect(() => assertPdfMagicBytes(Buffer.from('%PDF-1.4\n'))).not.toThrow();
  });

  it('rejects fake pdf content', () => {
    expect(() => assertPdfMagicBytes(Buffer.from('not a pdf'))).toThrow(/magic/i);
  });

  it('enforces size limits', () => {
    expect(() => assertWithinSizeLimit(100, 50)).toThrow(/exceeds/i);
    expect(() => assertWithinSizeLimit(0)).toThrow();
  });
});

describe('hash and object key', () => {
  it('hashes deterministically', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex(Buffer.from('abc')));
  });

  it('builds workspace-scoped random object keys', () => {
    const key = buildObjectKey('ws', 'intent', 'obj');
    expect(key).toBe('ws/intent/obj.pdf');
  });
});

describe('state machine', () => {
  it('allows uploaded → parsing → parsed', () => {
    expect(canTransition('uploaded', 'parsing')).toBe(true);
    expect(canTransition('parsing', 'parsed')).toBe(true);
    expect(canTransition('parsed', 'uploaded')).toBe(false);
  });

  it('allows delete from active states', () => {
    expect(canTransition('parsed', 'deleted')).toBe(true);
    expect(canTransition('deleted', 'parsed')).toBe(false);
  });
});

describe('upload intent single-use / expiry', () => {
  it('rejects used and expired intents', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 1000);
    expect(canUseIntent('pending', future)).toBe('ok');
    expect(canUseIntent('used', future)).toBe('used');
    expect(canUseIntent('pending', past)).toBe('expired');
  });
});

describe('page limits and error normalization', () => {
  it('enforces page limits', () => {
    expect(() => assertPageCount(1, 10)).not.toThrow();
    expect(() => assertPageCount(11, 10)).toThrow(/maximum/i);
    expect(() => assertPageCount(0, 10)).toThrow(/no pages/i);
  });

  it('normalizes errors without leaking contents', () => {
    expect(normalizeError(new DocumentProcessingError('oversized', 'too big')).category).toBe(
      'oversized',
    );
    expect(normalizeError(new Error('Password required')).category).toBe('encrypted');
    expect(normalizeError(new Error('secret document text XYZ')).message).not.toContain('XYZ');
    expect(toDbExtractionStatus('text')).toBe('ok');
    expect(toDbExtractionStatus('empty')).toBe('empty');
    expect(toDbExtractionStatus('failed')).toBe('error');
  });

  it('maps DB error categories', () => {
    expect(toDbErrorCategory('invalid_magic')).toBe('invalid_magic_bytes');
    expect(toDbErrorCategory('page_limit')).toBe('page_limit_exceeded');
  });
});

describe('parser result schema', () => {
  it('requires at least one page and stable hashes', () => {
    const parsed = parseResultSchema.parse({
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          pdfPageIndex: 0,
          text: '',
          textSha256: sha256Hex(''),
          extractionStatus: 'empty',
          warnings: ['empty'],
        },
      ],
      warnings: ['page 1: no extractable text'],
      parserName: 'pdfjs-dist',
      parserVersion: '0.0.0',
      encrypted: false,
    });
    expect(parsed.pages).toHaveLength(1);
    expect(() =>
      parseResultSchema.parse({
        pageCount: 0,
        pages: [],
        warnings: [],
        parserName: 'x',
        parserVersion: 'y',
        encrypted: false,
      }),
    ).toThrow();
  });
});
