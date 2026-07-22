import { z } from 'zod';
import { normalizeText } from './normalized';

export const ANALYSIS_SELECTION_VERSION = 'whole-document-selection-v1';

const pageSchema = z.object({ pageNumber: z.number().int().positive(), text: z.string() });
export type AnalysisPage = z.infer<typeof pageSchema>;

export type PageSelection = {
  selectedPages: AnalysisPage[];
  excludedPageNumbers: number[];
  reasonsByPage: Record<number, string[]>;
  batches: AnalysisPage[][];
};

const requirementPattern =
  /\b(shall|must|required|submit|include|provide|complete|sign|acknowledge|deadline|insurance|bond|form|attachment|certification|license|meeting|proposal|pricing|staffing|experience|evaluation|addendum|amend|replace|supersed|revis)\w*\b/i;
const dateOrNumberPattern =
  /(?:\$\s?\d|\b\d+(?:\.\d+)?\s?%|\bform\s+[a-z0-9-]+|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\b20\d{2}-\d{2}-\d{2})/i;

/**
 * Selects evidence-coherent pages across the complete document. It never uses a
 * leading-page slice. Every selected signal page receives one page of context
 * on each side, and first/last pages are retained for title/addendum context.
 */
export function selectWholeDocumentPages(
  rawPages: AnalysisPage[],
  options: { maxPagesPerBatch?: number; maxCharactersPerBatch?: number } = {},
): PageSelection {
  const pages = z.array(pageSchema).min(1).parse(rawPages);
  const byNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const selected = new Set<number>();
  const reasonsByPage: Record<number, string[]> = {};
  const add = (pageNumber: number, reason: string) => {
    if (!byNumber.has(pageNumber)) return;
    selected.add(pageNumber);
    reasonsByPage[pageNumber] = [...new Set([...(reasonsByPage[pageNumber] ?? []), reason])];
  };
  add(pages[0]!.pageNumber, 'document_boundary');
  add(pages.at(-1)!.pageNumber, 'document_boundary');
  for (const page of pages) {
    const text = normalizeText(page.text);
    if (requirementPattern.test(text)) add(page.pageNumber, 'requirement_signal');
    if (dateOrNumberPattern.test(text)) add(page.pageNumber, 'date_or_number_signal');
    if (/\b(addendum|amendment|revision|questions? and answers?)\b/i.test(text)) {
      add(page.pageNumber, 'precedence_signal');
    }
  }
  for (const pageNumber of [...selected]) {
    add(pageNumber - 1, 'neighbor_context');
    add(pageNumber + 1, 'neighbor_context');
  }
  const selectedPages = pages.filter((page) => selected.has(page.pageNumber));
  const batches: AnalysisPage[][] = [];
  const maxPages = options.maxPagesPerBatch ?? 12;
  const maxCharacters = options.maxCharactersPerBatch ?? 48_000;
  let current: AnalysisPage[] = [];
  let characters = 0;
  for (const page of selectedPages) {
    if (
      current.length &&
      (current.length >= maxPages || characters + page.text.length > maxCharacters)
    ) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(page);
    characters += page.text.length;
  }
  if (current.length) batches.push(current);
  return {
    selectedPages,
    excludedPageNumbers: pages
      .filter((page) => !selected.has(page.pageNumber))
      .map((page) => page.pageNumber),
    reasonsByPage,
    batches,
  };
}
