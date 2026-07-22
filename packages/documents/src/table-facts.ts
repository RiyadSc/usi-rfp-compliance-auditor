import { normalizeText, type NormalizedTable, type NormalizedTableCell } from './normalized';

export const TABLE_FACT_VERSION = 'table-facts-v1';
export type TableFact = {
  cellId: string;
  rawValue: string;
  normalizedValue: number;
  valueType: 'currency' | 'percentage' | 'quantity';
  currencyCode?: string;
  unit?: string;
  operator: 'equal' | 'minimum' | 'maximum' | 'range' | 'approximate';
  rowLabel?: string;
  columnLabel?: string;
  headerPath: string[];
  scopeKey: string;
  ambiguous: boolean;
};

function numericText(
  text: string,
):
  | { value: number; type: TableFact['valueType']; unit?: string; currencyCode?: string }
  | undefined {
  const normalized = normalizeText(text).toLowerCase().replace(/,/g, '');
  const match = normalized.match(
    /(?:\$\s*)?(-?\d+(?:\.\d+)?)\s*(million|m|thousand|k|%|percent)?\b/,
  );
  if (!match) return undefined;
  let value = Number(match[1]);
  const scale = match[2];
  if (scale === 'million' || scale === 'm') value *= 1_000_000;
  if (scale === 'thousand' || scale === 'k') value *= 1_000;
  if (normalized.includes('$')) return { value, type: 'currency', currencyCode: 'USD' };
  if (scale === '%' || scale === 'percent') return { value, type: 'percentage', unit: 'percent' };
  return { value, type: 'quantity' };
}

function operator(text: string): TableFact['operator'] {
  if (/\b(?:at least|minimum|not less than)\b|≥/.test(text)) return 'minimum';
  if (/\b(?:at most|maximum|not more than)\b|≤/.test(text)) return 'maximum';
  if (/\b(?:about|approximately)\b/.test(text)) return 'approximate';
  if (/\d\s*(?:-|to)\s*\d/.test(text)) return 'range';
  return 'equal';
}

export function extractTableFacts(table: NormalizedTable): TableFact[] {
  const byPosition = new Map(
    table.cells.map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell]),
  );
  return table.cells.flatMap((cell) => {
    if (cell.role === 'header' || cell.role === 'row_header') return [];
    const parsed = numericText(cell.rawText);
    if (!parsed) return [];
    const rowHeader = byPosition.get(`${cell.rowIndex}:0`);
    const columnHeaders = table.headerRows
      .map((row) => byPosition.get(`${row}:${cell.columnIndex}`))
      .filter((item): item is NormalizedTableCell => Boolean(item));
    const rowLabel = rowHeader && rowHeader.id !== cell.id ? rowHeader.normalizedText : undefined;
    const columnLabel =
      columnHeaders
        .map((item) => item.normalizedText)
        .filter(Boolean)
        .join(' / ') || undefined;
    const headerPath = [table.title, table.caption, columnLabel].filter((item): item is string =>
      Boolean(item),
    );
    const scopeParts = [table.sourceDocumentId, table.id, rowLabel, columnLabel].filter(Boolean);
    return [
      {
        cellId: cell.id,
        rawValue: cell.rawText,
        normalizedValue: parsed.value,
        valueType: parsed.type,
        ...(parsed.currencyCode ? { currencyCode: parsed.currencyCode } : {}),
        ...(parsed.unit ? { unit: parsed.unit } : {}),
        operator: operator(`${rowLabel ?? ''} ${columnLabel ?? ''} ${cell.rawText}`.toLowerCase()),
        ...(rowLabel ? { rowLabel } : {}),
        ...(columnLabel ? { columnLabel } : {}),
        headerPath,
        scopeKey: scopeParts.join('|').toLowerCase(),
        ambiguous: !rowLabel || !columnLabel,
      },
    ];
  });
}

export function compareTableFacts(
  candidate: TableFact,
  source: TableFact,
): 'match' | 'mismatch' | 'scope_incompatible' | 'uncertain' {
  if (candidate.ambiguous || source.ambiguous) return 'uncertain';
  if (
    candidate.scopeKey !== source.scopeKey ||
    candidate.valueType !== source.valueType ||
    candidate.unit !== source.unit ||
    candidate.currencyCode !== source.currencyCode
  )
    return 'scope_incompatible';
  return candidate.normalizedValue === source.normalizedValue &&
    candidate.operator === source.operator
    ? 'match'
    : 'mismatch';
}
