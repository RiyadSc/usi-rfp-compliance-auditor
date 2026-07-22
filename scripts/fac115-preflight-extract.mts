/** Offline FAC115 citation locate + extraction budget preflight. No provider calls. */
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildPublicExtractionBatches,
  estimateChatCost,
  officialPortalHtmlToText,
} from '../packages/ai/src/index.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

const ROOT = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const REND = resolve(ROOT, 'renditions/pdf');
const SOURCE = resolve(ROOT, 'source');
const EXTRACT_MODEL = 'gpt-5.4-mini-2026-03-17';

const answers = JSON.parse(await readFile(resolve(ROOT, 'known-answers-draft.json'), 'utf8')) as {
  expected: Array<{ id: string; source: string; evidence: string }>;
};

const parser = new PdfJsParserAdapter();
const docs: Array<{
  name: string;
  pages: Array<{ pageNumber: number; text: string }>;
  warnings: string[];
}> = [];
for (const name of (await readdir(REND)).filter((n) => n.endsWith('.pdf')).sort()) {
  const bytes = new Uint8Array(await readFile(resolve(REND, name)));
  const parsed = await parser.parse(bytes, { maxPages: 100, timeoutMs: 120_000 });
  docs.push({
    name,
    pages: parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    warnings: parsed.warnings,
  });
}
const portal = officialPortalHtmlToText(
  await readFile(resolve(SOURCE, 'official-solicitation-page.html'), 'utf8'),
);
docs.push({
  name: 'official-solicitation-page.html',
  pages: [{ pageNumber: 1, text: portal }],
  warnings: [],
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const preferredName = (source: string) => {
  if (source.endsWith('.docx') || source.endsWith('.xlsx'))
    return source.replace(/\.(docx|xlsx)$/, '.pdf');
  return source;
};

const locate = (evidence: string, preferred: string | null) => {
  const needle = norm(evidence);
  const hits: Array<{ document: string; page: number }> = [];
  for (const doc of docs) {
    if (preferred && doc.name !== preferred) continue;
    for (const page of doc.pages) {
      if (norm(page.text).includes(needle))
        hits.push({ document: doc.name, page: page.pageNumber });
    }
  }
  return hits;
};

const citations = answers.expected.map((a) => {
  const preferred = preferredName(a.source);
  let hits = locate(a.evidence, preferred);
  if (!hits.length) hits = locate(a.evidence, null);
  return { id: a.id, source: a.source, preferred, hits, found: hits.length > 0 };
});

const batches = buildPublicExtractionBatches(
  docs.map((d, i) => ({
    id: `80000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name: d.name,
    type: 'source',
    pages: d.pages,
  })),
  { maxPages: 8, maxEstimatedTokens: 14_000 },
);
const batchCosts = batches.map((batch) => {
  const inputTokens =
    batch.pages.reduce((pageSum, page) => pageSum + Math.ceil(page.text.length / 4), 0) + 1500;
  const singlePassUsd = estimateChatCost(inputTokens, 5000, EXTRACT_MODEL);
  return {
    id: batch.id,
    documentName: batch.documentName,
    pages: `${batch.firstPage}-${batch.lastPage}`,
    inputTokens,
    singlePassUsd: Number(singlePassUsd.toFixed(6)),
    reserve3xUsd: Number((singlePassUsd * 3).toFixed(6)),
  };
});
const singlePassTotalUsd = batchCosts.reduce((sum, batch) => sum + batch.singlePassUsd, 0);
const extractionMaximumUsd = batchCosts.reduce((sum, batch) => sum + batch.reserve3xUsd, 0);

const rfr = docs.find((d) => d.name === 'FAC115_Request_for_Response_03.29.2022.pdf')!;
const fuzzyNeedles = [
  'April 7, 2022',
  '2:00 pm EST',
  'Written Questions',
  'original formats',
  'NOT scanned',
  'Forms provided for the Bidder',
];
const fuzzyHits = fuzzyNeedles.map((needle) => ({
  needle,
  pages: rfr.pages
    .filter((page) => page.text.toLowerCase().includes(needle.toLowerCase()))
    .map((page) => page.pageNumber),
}));

console.info(
  JSON.stringify(
    {
      documents: docs.map((d) => ({
        name: d.name,
        pages: d.pages.length,
        warnings: d.warnings,
        empty: d.pages.filter((p) => !p.text).length,
      })),
      totalPages: docs.reduce((s, d) => s + d.pages.length, 0),
      batches: batches.length,
      batchCosts,
      singlePassTotalUsd: Number(singlePassTotalUsd.toFixed(6)),
      extractionMaximumUsd: Number(extractionMaximumUsd.toFixed(6)),
      authorizedExtractionCapUsd: 0.5,
      fitsSinglePassUnderCap: singlePassTotalUsd <= 0.5 + 1e-9,
      fitsReserveUnderCap: extractionMaximumUsd <= 0.5 + 1e-9,
      citations,
      missingCitations: citations.filter((c) => !c.found).map((c) => c.id),
      fuzzyHits,
    },
    null,
    2,
  ),
);
