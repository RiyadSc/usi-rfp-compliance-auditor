import { createHash } from 'node:crypto';

export type ChunkInputPage = {
  pageNumber: number;
  text: string;
  parseRunId?: string;
  parserName?: string;
};

export type DocumentChunk = {
  pageNumber: number;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
  textSha256: string;
  tokenEstimate: number;
  parserName?: string | undefined;
  parseRunId?: string | undefined;
};

/** ~chars per token estimate for budgeting (not tokenizer-accurate). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Page-aware chunking: one primary chunk per page (bounded), with optional
 * secondary windows for long pages. Never crosses documents/pages.
 */
export function chunkPages(
  pages: ChunkInputPage[],
  options?: { maxChars?: number; overlapChars?: number },
): DocumentChunk[] {
  const maxChars = options?.maxChars ?? 3500;
  const overlapChars = options?.overlapChars ?? 350;
  const out: DocumentChunk[] = [];

  for (const page of pages) {
    const text = page.text ?? '';
    if (text.length === 0) {
      out.push({
        pageNumber: page.pageNumber,
        chunkIndex: 0,
        charStart: 0,
        charEnd: 0,
        text: '',
        textSha256: createHash('sha256').update('').digest('hex'),
        tokenEstimate: 0,
        parserName: page.parserName,
        parseRunId: page.parseRunId,
      });
      continue;
    }

    let start = 0;
    let idx = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + maxChars);
      const slice = text.slice(start, end);
      out.push({
        pageNumber: page.pageNumber,
        chunkIndex: idx,
        charStart: start,
        charEnd: end,
        text: slice,
        textSha256: createHash('sha256').update(slice).digest('hex'),
        tokenEstimate: estimateTokens(slice),
        parserName: page.parserName,
        parseRunId: page.parseRunId,
      });
      if (end >= text.length) break;
      start = Math.max(end - overlapChars, start + 1);
      idx += 1;
    }
  }
  return out;
}
