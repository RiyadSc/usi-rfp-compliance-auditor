import { z } from 'zod';
import { DocumentProcessingError } from './errors';
import { type SourceDocumentFormat, sourceDocumentFormatSchema } from './normalized';

export const PARSER_REGISTRY_VERSION = 'document-parser-adapters-v1';
export const DEFAULT_LARGE_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;

export const formatDefinitionSchema = z.object({
  format: sourceDocumentFormatSchema,
  mimeTypes: z.array(z.string()),
  extensions: z.array(z.string()),
});

export const FORMAT_DEFINITIONS = [
  { format: 'pdf', mimeTypes: ['application/pdf'], extensions: ['.pdf'] },
  {
    format: 'docx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.docx'],
  },
  {
    format: 'xlsx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    extensions: ['.xlsx'],
  },
  {
    format: 'html',
    mimeTypes: ['text/html', 'application/xhtml+xml'],
    extensions: ['.html', '.htm'],
  },
  { format: 'txt', mimeTypes: ['text/plain'], extensions: ['.txt'] },
  {
    format: 'image',
    mimeTypes: ['image/png', 'image/jpeg', 'image/tiff', 'image/webp'],
    extensions: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp'],
  },
  { format: 'zip_package', mimeTypes: ['application/zip'], extensions: ['.zip'] },
] as const;

export type DetectedFormat = {
  format: SourceDocumentFormat;
  confidence: number;
  detectedMime: string;
  warnings: string[];
};

function starts(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function detectSourceFormat(
  bytes: Uint8Array,
  filename?: string,
  declaredMime?: string,
): DetectedFormat {
  let format: SourceDocumentFormat | undefined;
  let detectedMime = 'application/octet-stream';
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    [format, detectedMime] = ['pdf', 'application/pdf'];
  else if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]))
    [format, detectedMime] = ['zip_package', 'application/zip'];
  else if (starts(bytes, [0x89, 0x50, 0x4e, 0x47])) [format, detectedMime] = ['image', 'image/png'];
  else if (starts(bytes, [0xff, 0xd8, 0xff])) [format, detectedMime] = ['image', 'image/jpeg'];
  else if (starts(bytes, [0x49, 0x49, 0x2a, 0x00]) || starts(bytes, [0x4d, 0x4d, 0x00, 0x2a]))
    [format, detectedMime] = ['image', 'image/tiff'];
  else if (
    starts(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
    [format, detectedMime] = ['image', 'image/webp'];
  else {
    const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 8192));
    if (/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(sample))
      [format, detectedMime] = ['html', 'text/html'];
    else if (!sample.includes('\u0000')) [format, detectedMime] = ['txt', 'text/plain'];
  }
  if (!format)
    throw new DocumentProcessingError(
      'invalid_magic',
      'Unsupported or unrecognized file signature',
    );

  const warnings: string[] = [];
  const extension = filename?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  const definition = FORMAT_DEFINITIONS.find((item) => item.format === format);
  if (
    extension &&
    definition &&
    !(definition.extensions as readonly string[]).includes(extension)
  ) {
    warnings.push(`filename extension ${extension} does not match detected ${format}`);
  }
  const mime = declaredMime?.toLowerCase().split(';')[0]?.trim();
  if (mime && definition && !(definition.mimeTypes as readonly string[]).includes(mime)) {
    warnings.push(`declared MIME ${mime} does not match detected ${detectedMime}`);
  }
  return { format, confidence: 1, detectedMime, warnings };
}

export function extensionForFormat(format: SourceDocumentFormat): string {
  return FORMAT_DEFINITIONS.find((item) => item.format === format)?.extensions[0] ?? '.bin';
}

export function buildFormatAwareObjectKey(
  workspaceId: string,
  intentId: string,
  objectId: string,
  format: SourceDocumentFormat,
): string {
  return `${workspaceId}/${intentId}/${objectId}${extensionForFormat(format)}`;
}
