import type { ModelVerificationFinding } from './verification-schemas';

export type QuoteValidation = {
  matchType: 'exact' | 'normalized_exact' | 'fuzzy_candidate' | 'not_found';
  exactQuote: string;
  normalizedQuote: string;
  startOffset: number | null;
  endOffset: number | null;
};

export function normalizeEvidenceText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

export function validateEvidenceQuote(pageText: string, quote: string): QuoteValidation {
  const exactAt = quote.length ? pageText.indexOf(quote) : -1;
  if (exactAt >= 0) {
    return {
      matchType: 'exact',
      exactQuote: quote,
      normalizedQuote: normalizeEvidenceText(quote),
      startOffset: exactAt,
      endOffset: exactAt + quote.length,
    };
  }
  const normalizedPage = normalizeEvidenceText(pageText);
  const normalizedQuote = normalizeEvidenceText(quote);
  const normalizedAt = normalizedQuote.length ? normalizedPage.indexOf(normalizedQuote) : -1;
  if (normalizedAt >= 0) {
    return {
      matchType: 'normalized_exact',
      exactQuote: quote,
      normalizedQuote,
      startOffset: null,
      endOffset: null,
    };
  }
  const quoteTokens = new Set(
    normalizedQuote
      .toLowerCase()
      .split(/\W+/)
      .filter((x) => x.length > 2),
  );
  const pageTokens = new Set(
    normalizedPage
      .toLowerCase()
      .split(/\W+/)
      .filter((x) => x.length > 2),
  );
  const overlap = [...quoteTokens].filter((x) => pageTokens.has(x)).length;
  if (quoteTokens.size >= 4 && overlap / quoteTokens.size >= 0.75) {
    return {
      matchType: 'fuzzy_candidate',
      exactQuote: quote,
      normalizedQuote,
      startOffset: null,
      endOffset: null,
    };
  }
  return {
    matchType: 'not_found',
    exactQuote: quote,
    normalizedQuote,
    startOffset: null,
    endOffset: null,
  };
}

export type ParsedDate = {
  original: string;
  normalized: string | null;
  timezone: string | null;
  ambiguous: boolean;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function parseDeterministicDate(value: string): ParsedDate {
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) return { original: slash[0], normalized: null, timezone: null, ambiguous: true };
  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { original: iso[0], normalized: iso[0], timezone: null, ambiguous: false };
  const named = value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (!named) return { original: value, normalized: null, timezone: null, ambiguous: true };
  const month = MONTHS[named[1]!.toLowerCase()]!;
  const normalized = `${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`;
  const timezone =
    value.match(/\b(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|local time)\b/i)?.[0] ?? null;
  return { original: named[0], normalized, timezone, ambiguous: false };
}

export type ParsedNumber = {
  original: string;
  normalizedValue: number | null;
  unit: string | null;
  comparisonOperator: 'eq' | 'gte' | 'lte' | 'gt' | 'lt' | 'unknown';
};

export function parseDeterministicNumbers(value: string): ParsedNumber[] {
  const matches = value.matchAll(
    /(?:\$\s*)?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|million|years?|hours?|FTEs?|full-time-equivalent(?:\s+staff)?|points?)?/gi,
  );
  const out: ParsedNumber[] = [];
  for (const match of matches) {
    const raw = match[0].trim();
    const numeric = Number(
      raw
        .replace(
          /[$,%\s]|percent|years?|hours?|FTEs?|full-time-equivalent(?:\s+staff)?|points?/gi,
          '',
        )
        .replace(/,/g, ''),
    );
    const multiplier = /million/i.test(raw) ? 1_000_000 : 1;
    const unit =
      raw.includes('$') || /million/i.test(raw)
        ? 'USD'
        : /%|percent/i.test(raw)
          ? 'percent'
          : /years?/i.test(raw)
            ? 'years'
            : /hours?/i.test(raw)
              ? 'hours'
              : /FTE|full-time/i.test(raw)
                ? 'FTE'
                : /points?/i.test(raw)
                  ? 'points'
                  : null;
    const prefix = value
      .slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0)
      .toLowerCase();
    const comparisonOperator = /at least|minimum|no less than/.test(prefix)
      ? 'gte'
      : /at most|maximum|no more than/.test(prefix)
        ? 'lte'
        : /more than|greater than/.test(prefix)
          ? 'gt'
          : /less than/.test(prefix)
            ? 'lt'
            : 'eq';
    out.push({
      original: raw,
      normalizedValue: Number.isFinite(numeric) ? numeric * multiplier : null,
      unit,
      comparisonOperator,
    });
  }
  return out;
}

export function compareDeterministicValues(
  candidate: { value: number | string | null; unit?: string | null },
  source: { value: number | string | null; unit?: string | null },
): 'match' | 'mismatch' | 'uncertain' {
  if (candidate.value == null || source.value == null) return 'uncertain';
  if (candidate.unit && source.unit && candidate.unit !== source.unit) return 'mismatch';
  return candidate.value === source.value ? 'match' : 'mismatch';
}

export function classifyProofRequirement(
  text: string,
):
  | 'none_identified'
  | 'requires_human_confirmation'
  | 'requires_company_artifact'
  | 'requires_external_validation'
  | 'undetermined' {
  if (
    /authorized representative|authority to sign|confirm attendance|human confirmation/i.test(text)
  )
    return 'requires_human_confirmation';
  if (
    /certificate|certification|license|insurance|staffing plan|resume|years of experience|references?/i.test(
      text,
    )
  )
    return 'requires_company_artifact';
  if (/background check|regulator|state verification|external validation/i.test(text))
    return 'requires_external_validation';
  return 'none_identified';
}

export function assessExplicitPrecedence(
  texts: string[],
): 'active' | 'superseded' | 'conflicting' | 'undetermined' {
  const joined = texts.join(' ').toLowerCase();
  const superseding = /\b(replaces?|supersedes?|changed to|increased to|revises?)\b/.test(joined);
  const unresolved = /\b(conflict(?:ing)?|cannot be resolved|ambiguous)\b/.test(joined);
  if (unresolved) return 'conflicting';
  if (superseding) return 'superseded';
  return 'undetermined';
}

export type DuplicateInput = { id: string; obligation: string };

const MATERIAL_TOKEN =
  /\b(?:\$?[\d,.]+|form\s+[a-z0-9-]+|attachment\s+[a-z0-9-]+|exhibit\s+[a-z0-9-]+|march|april|may|june|july|august|september|october|november|december|party|contractor|supervisor|manager)\b/gi;

export function classifyDuplicateRelationship(a: DuplicateInput, b: DuplicateInput) {
  const na = normalizeEvidenceText(a.obligation).toLowerCase();
  const nb = normalizeEvidenceText(b.obligation).toLowerCase();
  if (na === nb) return 'exact_duplicate' as const;
  const materialA = new Set(na.match(MATERIAL_TOKEN) ?? []);
  const materialB = new Set(nb.match(MATERIAL_TOKEN) ?? []);
  if (
    [...materialA].some((x) => !materialB.has(x)) ||
    [...materialB].some((x) => !materialA.has(x))
  ) {
    return 'related_distinct' as const;
  }
  const ta = new Set(na.split(/\W+/).filter((x) => x.length > 3));
  const tb = new Set(nb.split(/\W+/).filter((x) => x.length > 3));
  const overlap = [...ta].filter((x) => tb.has(x)).length / Math.max(1, Math.min(ta.size, tb.size));
  return overlap >= 0.8
    ? ('semantic_duplicate' as const)
    : overlap >= 0.45
      ? ('related_distinct' as const)
      : ('uncertain' as const);
}

export function postValidateFinding(
  finding: ModelVerificationFinding,
  pages: Map<string, { text: string; extractionStatus?: string }>,
): ModelVerificationFinding {
  const evidence = finding.supportingEvidence.filter((ref) => {
    const page = pages.get(`${ref.documentId}:${ref.pageNumber}`);
    return (
      page &&
      ['exact', 'normalized_exact'].includes(validateEvidenceQuote(page.text, ref.quote).matchType)
    );
  });
  const anyParserBad = finding.supportingEvidence.some((ref) => {
    const page = pages.get(`${ref.documentId}:${ref.pageNumber}`);
    return !page || page.extractionStatus === 'empty' || page.extractionStatus === 'error';
  });
  let sourceSupportStatus = finding.sourceSupportStatus;
  if (anyParserBad && evidence.length === 0) sourceSupportStatus = 'parser_uncertain';
  else if (sourceSupportStatus === 'supported' && evidence.length === 0)
    sourceSupportStatus = 'unsupported';
  return { ...finding, sourceSupportStatus, supportingEvidence: evidence };
}
