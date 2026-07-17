import { z } from 'zod';

export const pageExtractionSchema = z.object({
  pageNumber: z.number().int().min(1),
  pdfPageIndex: z.number().int().min(0),
  text: z.string(),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  extractionStatus: z.enum(['text', 'empty', 'image_only', 'failed']),
  warnings: z.array(z.string()),
});

export type PageExtraction = z.infer<typeof pageExtractionSchema>;

export const parseResultSchema = z.object({
  pageCount: z.number().int().min(1),
  pages: z.array(pageExtractionSchema).min(1),
  warnings: z.array(z.string()),
  parserName: z.string().min(1),
  parserVersion: z.string().min(1),
  encrypted: z.boolean(),
});

export type ParseResult = z.infer<typeof parseResultSchema>;

export type ParserAdapterOptions = {
  maxPages: number;
  timeoutMs: number;
};

export interface ParserAdapter {
  readonly name: string;
  readonly version: string;
  parse(bytes: Uint8Array, options: ParserAdapterOptions): Promise<ParseResult>;
}
