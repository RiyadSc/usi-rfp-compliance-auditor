/** Confirm every FAC115 draft citation exists on the cited rendered page. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { officialPortalHtmlToText } from '../packages/ai/src/index.ts';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';

const ROOT = resolve('fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375');
const answers = JSON.parse(await readFile(resolve(ROOT, 'known-answers-draft.json'), 'utf8')) as {
  expected: Array<{ id: string; source: string; page: number; evidence: string }>;
};
const parser = new PdfJsParserAdapter();
const cache = new Map<string, Array<{ pageNumber: number; text: string }>>();
const load = async (source: string) => {
  if (cache.has(source)) return cache.get(source)!;
  if (source.endsWith('.html')) {
    const text = officialPortalHtmlToText(await readFile(resolve(ROOT, 'source', source), 'utf8'));
    const pages = [{ pageNumber: 1, text }];
    cache.set(source, pages);
    return pages;
  }
  const pdfName = source.endsWith('.pdf') ? source : source.replace(/\.(docx|xlsx)$/, '.pdf');
  const bytes = new Uint8Array(await readFile(resolve(ROOT, 'renditions/pdf', pdfName)));
  const parsed = await parser.parse(bytes, { maxPages: 100, timeoutMs: 120_000 });
  const pages = parsed.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }));
  cache.set(source, pages);
  return pages;
};
const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const missing: string[] = [];
for (const answer of answers.expected) {
  const pages = await load(answer.source);
  const page = pages.find((item) => item.pageNumber === answer.page);
  if (!page || !norm(page.text).includes(norm(answer.evidence))) missing.push(answer.id);
}
if (missing.length) {
  console.error(JSON.stringify({ missing }, null, 2));
  process.exit(1);
}
console.info(JSON.stringify({ ok: true, checked: answers.expected.length }));
