/** Normalize hybrid retrieval scores into [0,1]. */
export function normalizeScore(raw: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (raw - min) / (max - min)));
}

export function hybridScore(parts: { vector?: number; fts?: number; trgm?: number }): number {
  const v = parts.vector ?? 0;
  const f = parts.fts ?? 0;
  const t = parts.trgm ?? 0;
  // Prefer lexical for RFP recall of mandatory terms; vector as support.
  return 0.45 * f + 0.25 * t + 0.3 * v;
}

export const KEYWORD_SCAN_TERMS = [
  'deadline',
  'insurance',
  'signature',
  'form',
  'mandatory meeting',
  'attachment',
  'submit',
  'staffing',
  'pricing',
  'evaluation',
  'certification',
  'license',
] as const;

export type ScoredChunk = {
  chunkId: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  textSha256?: string;
  score: number;
};

/**
 * Deterministic keyword / mandatory-language scan over page-aware chunks.
 * Complements semantic similarity for scattered RFP obligations.
 */
export function keywordScanChunks(
  chunks: {
    id?: string;
    pageNumber: number;
    chunkIndex: number;
    text: string;
    textSha256?: string;
  }[],
  terms: readonly string[] = KEYWORD_SCAN_TERMS,
): ScoredChunk[] {
  const out: ScoredChunk[] = [];
  for (const chunk of chunks) {
    const lower = chunk.text.toLowerCase();
    let hits = 0;
    for (const term of terms) {
      if (lower.includes(term.toLowerCase())) hits += 1;
    }
    if (hits === 0) continue;
    out.push({
      chunkId: chunk.id ?? `${chunk.pageNumber}:${chunk.chunkIndex}`,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      ...(chunk.textSha256 ? { textSha256: chunk.textSha256 } : {}),
      score: normalizeScore(hits, 0, terms.length),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Merge FTS/trgm/vector/keyword ranks with workspace-scoped inputs already filtered. */
export function fuseRetrievalRanks(
  rows: {
    chunkId: string;
    pageNumber: number;
    chunkIndex: number;
    text: string;
    textSha256?: string;
    fts?: number;
    trgm?: number;
    vector?: number;
    keyword?: number;
  }[],
): ScoredChunk[] {
  const ftsVals = rows.map((r) => r.fts ?? 0);
  const trgmVals = rows.map((r) => r.trgm ?? 0);
  const vecVals = rows.map((r) => r.vector ?? 0);
  const kwVals = rows.map((r) => r.keyword ?? 0);
  const ftsMin = Math.min(0, ...ftsVals);
  const ftsMax = Math.max(1e-9, ...ftsVals);
  const trgmMin = Math.min(0, ...trgmVals);
  const trgmMax = Math.max(1e-9, ...trgmVals);
  const vecMin = Math.min(0, ...vecVals);
  const vecMax = Math.max(1e-9, ...vecVals);
  const kwMin = Math.min(0, ...kwVals);
  const kwMax = Math.max(1e-9, ...kwVals);

  return rows
    .map((r) => {
      const f = normalizeScore(r.fts ?? 0, ftsMin, ftsMax);
      const t = normalizeScore(r.trgm ?? 0, trgmMin, trgmMax);
      const v = normalizeScore(r.vector ?? 0, vecMin, vecMax);
      const k = normalizeScore(r.keyword ?? 0, kwMin, kwMax);
      return {
        chunkId: r.chunkId,
        pageNumber: r.pageNumber,
        chunkIndex: r.chunkIndex,
        text: r.text,
        ...(r.textSha256 ? { textSha256: r.textSha256 } : {}),
        score: 0.35 * f + 0.2 * t + 0.25 * v + 0.2 * k,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Page-window expansion: ensure sequential neighbors of hit pages are included
 * so TOC/addenda/scattered forms are not missed by similarity alone.
 */
export function expandPageWindows(
  hitPages: number[],
  options?: { radius?: number; maxPage?: number },
): number[] {
  const radius = options?.radius ?? 1;
  const maxPage = options?.maxPage ?? Number.POSITIVE_INFINITY;
  const set = new Set<number>();
  for (const p of hitPages) {
    for (let d = -radius; d <= radius; d++) {
      const n = p + d;
      if (n >= 1 && n <= maxPage) set.add(n);
    }
  }
  return [...set].sort((a, b) => a - b);
}
