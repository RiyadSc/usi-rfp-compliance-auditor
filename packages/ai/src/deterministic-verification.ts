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

export const DATE_SEMANTIC_ROLES = [
  'submission_deadline',
  'question_deadline',
  'meeting_date',
  'performance_period',
  'issue_date',
  'addendum_date',
  'descriptive_example',
  'unknown',
] as const;

export type DateSemanticRole = (typeof DATE_SEMANTIC_ROLES)[number];
export type FactComparisonOperator =
  | 'equal'
  | 'minimum'
  | 'maximum'
  | 'range'
  | 'before_or_on'
  | 'after_or_on'
  | 'approximate'
  | 'unknown';

export type MaterialScope = {
  site: string | null;
  role: string | null;
  party: string | null;
  form: string | null;
  section: string | null;
  deliverable: string | null;
  insuranceBasis: 'per_occurrence' | 'aggregate' | null;
  subject: string | null;
  obligationRole: string | null;
};

export type TypedDateFact = ParsedDate & {
  role: DateSemanticRole;
  comparisonOperator: FactComparisonOperator;
  time: string | null;
  relative: boolean;
  anchorPresent: boolean;
  scope: MaterialScope;
  contextText: string;
  documentId?: string;
  pageNumber?: number;
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
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(\d{4}))?\b/i,
  );
  if (!named) return { original: value, normalized: null, timezone: null, ambiguous: true };
  const month = MONTHS[named[1]!.toLowerCase()]!;
  const normalized = named[3]
    ? `${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`
    : `--${String(month).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`;
  const timezone =
    value.match(/\b(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|local time)\b/i)?.[0] ?? null;
  return { original: named[0], normalized, timezone, ambiguous: false };
}

function sentenceAt(text: string, index: number): string {
  const before = text.slice(0, index);
  const after = text.slice(index);
  const start = Math.max(
    before.lastIndexOf('.'),
    before.lastIndexOf(';'),
    before.lastIndexOf('\n'),
  );
  const endCandidates = [after.indexOf('.'), after.indexOf(';'), after.indexOf('\n')].filter(
    (value) => value >= 0,
  );
  const end = endCandidates.length ? Math.min(...endCandidates) : after.length;
  return text.slice(start + 1, index + end + 1).trim();
}

function materialScope(text: string): MaterialScope {
  const site = text.match(/\b(?:North|South|East|West) Campus\b/i)?.[0] ?? null;
  const role =
    text.match(
      /\b(?:site supervisor|project manager|security officers?|supervisors?|managers?|employees?|staff)\b/i,
    )?.[0] ?? null;
  const party = text.match(/\b(?:offerors?|bidders?|vendors?|contractors?|city)\b/i)?.[0] ?? null;
  const form =
    text.match(/\b(?:form|schedule|attachment|exhibit)\s+[A-Z0-9][A-Z0-9-]*\b/i)?.[0] ?? null;
  const section =
    text.match(/\b(?:section|article|paragraph)\s+[A-Z0-9][A-Z0-9.-]*\b/i)?.[0] ?? null;
  const deliverable =
    text.match(
      /\b(?:proposal|questions?|staffing plan|certificate of insurance|pricing|bid bond|report)\b/i,
    )?.[0] ?? null;
  const insuranceBasis = /per occurrence/i.test(text)
    ? 'per_occurrence'
    : /aggregate/i.test(text)
      ? 'aggregate'
      : null;
  const subject = /commercial general liability|\bCGL\b/i.test(text)
    ? 'commercial_general_liability'
    : /automobile liability/i.test(text)
      ? 'automobile_liability'
      : /staffing plan/i.test(text)
        ? 'staffing_plan'
        : /pre-proposal meeting|site visit|conference/i.test(text)
          ? 'pre_proposal_meeting'
          : /proposal form/i.test(text)
            ? 'proposal_form'
            : null;
  const obligationRole = /insurance|liability|coverage/i.test(text)
    ? 'insurance_requirement'
    : /meeting|conference|site visit/i.test(text)
      ? 'meeting_attendance'
      : /attach|attachment/i.test(text)
        ? 'attachment_submission'
        : /sign(?:ed|ature)?/i.test(text)
          ? 'signature_requirement'
          : /submit|delivery|portal|email|hard cop/i.test(text)
            ? 'submission_method'
            : /staff|FTE|full-time/i.test(text)
              ? 'staffing_requirement'
              : null;
  return {
    site,
    role,
    party,
    form,
    section,
    deliverable,
    insuranceBasis,
    subject,
    obligationRole,
  };
}

function dateRole(text: string): DateSemanticRole {
  if (/example|illustrative|for reference only|not (?:a |an )?(?:deadline|requirement)/i.test(text))
    return 'descriptive_example';
  if (/questions?|inquir(?:y|ies)/i.test(text)) return 'question_deadline';
  if (/meeting|conference|site visit/i.test(text)) return 'meeting_date';
  if (/proposal|submission|responses?|bids?\b/i.test(text) && /due|deadline|received/i.test(text))
    return 'submission_deadline';
  if (/performance|contract term|period of performance/i.test(text)) return 'performance_period';
  if (/addendum|amendment/i.test(text) && /\bissued\b|\bdated\b/i.test(text))
    return 'addendum_date';
  if (/\bissued\b|publication date|document date/i.test(text)) return 'issue_date';
  return 'unknown';
}

function factOperator(text: string): FactComparisonOperator {
  if (/no later than|on or before|by\b/i.test(text)) return 'before_or_on';
  if (/no earlier than|on or after/i.test(text)) return 'after_or_on';
  if (/at least|minimum|no less than/i.test(text)) return 'minimum';
  if (/at most|maximum|no more than/i.test(text)) return 'maximum';
  if (/approximately|about\b|roughly/i.test(text)) return 'approximate';
  return 'equal';
}

const DATE_MATCH_PATTERN = new RegExp(
  `\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(?:,\\s+\\d{4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\b`,
  'gi',
);

export function extractTypedDateFacts(
  text: string,
  source?: { documentId?: string; pageNumber?: number },
): TypedDateFact[] {
  const facts: TypedDateFact[] = [];
  for (const match of text.matchAll(DATE_MATCH_PATTERN)) {
    const contextText = sentenceAt(text, match.index ?? 0);
    const parsed = parseDeterministicDate(match[0]);
    facts.push({
      ...parsed,
      timezone:
        contextText.match(
          /\b(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|local time)\b/i,
        )?.[0] ?? parsed.timezone,
      role: dateRole(contextText),
      comparisonOperator: factOperator(contextText),
      time: contextText.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i)?.[0] ?? null,
      relative: false,
      anchorPresent: true,
      scope: materialScope(contextText),
      contextText,
      ...source,
    });
  }
  for (const match of text.matchAll(/\bwithin\s+(?:\d+|ten|thirty)\s+days?\b/gi)) {
    const contextText = sentenceAt(text, match.index ?? 0);
    facts.push({
      original: match[0],
      normalized: null,
      timezone: null,
      ambiguous: true,
      role: dateRole(contextText),
      comparisonOperator: 'unknown',
      time: null,
      relative: true,
      anchorPresent: /after|from|following/i.test(contextText),
      scope: materialScope(contextText),
      contextText,
      ...source,
    });
  }
  return facts;
}

export type ParsedNumber = {
  original: string;
  normalizedValue: number | null;
  unit: string | null;
  comparisonOperator: 'eq' | 'gte' | 'lte' | 'gt' | 'lt' | 'unknown';
  scale?: 'unit' | 'thousand' | 'million';
  startOffset?: number;
  endOffset?: number;
};

export function parseDeterministicNumbers(value: string): ParsedNumber[] {
  const matches = value.matchAll(
    /(?:\$\s*)?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|million|M\b|thousand|K\b|years?|hours?|FTEs?|full-time-equivalent(?:\s+staff)?|points?)?/gi,
  );
  const out: ParsedNumber[] = [];
  for (const match of matches) {
    const raw = match[0].trim();
    const numeric = Number(
      raw
        .replace(
          /[$,%\s]|percent|million|thousand|M\b|K\b|years?|hours?|FTEs?|full-time-equivalent(?:\s+staff)?|points?/gi,
          '',
        )
        .replace(/,/g, ''),
    );
    const scale = /million|M\b/i.test(raw)
      ? 'million'
      : /thousand|K\b/i.test(raw)
        ? 'thousand'
        : 'unit';
    const multiplier = scale === 'million' ? 1_000_000 : scale === 'thousand' ? 1_000 : 1;
    const unit =
      raw.includes('$') || /million|thousand|M\b|K\b/i.test(raw)
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
      scale,
      startOffset: match.index ?? 0,
      endOffset: (match.index ?? 0) + match[0].length,
    });
  }
  return out;
}

export const NUMBER_SEMANTIC_ROLES = [
  'insurance_per_occurrence',
  'insurance_aggregate',
  'staffing_minimum',
  'experience_minimum',
  'pricing_amount',
  'percentage',
  'generic_threshold',
  'descriptive_example',
  'unknown',
] as const;

export type NumberSemanticRole = (typeof NUMBER_SEMANTIC_ROLES)[number];
export type TypedNumberFact = ParsedNumber & {
  role: NumberSemanticRole;
  operator: FactComparisonOperator;
  rangeEndValue: number | null;
  scope: MaterialScope;
  contextText: string;
  documentId?: string;
  pageNumber?: number;
};

function numberRole(text: string, unit: string | null): NumberSemanticRole {
  if (/example|illustrative|for reference only|not (?:a |an )?requirement/i.test(text))
    return 'descriptive_example';
  if (/insurance|liability/i.test(text) && /per occurrence/i.test(text))
    return 'insurance_per_occurrence';
  if (/insurance|liability/i.test(text) && /aggregate/i.test(text)) return 'insurance_aggregate';
  if (/staff|FTE|full-time|officers?|supervisors?|managers?/i.test(text)) return 'staffing_minimum';
  if (/years? of experience|experience/i.test(text) && unit === 'years')
    return 'experience_minimum';
  if (/price|pricing|cost|fee|bid schedule/i.test(text) && unit === 'USD') return 'pricing_amount';
  if (unit === 'percent' || /percentage|bid bond/i.test(text)) return 'percentage';
  return unit ? 'generic_threshold' : 'unknown';
}

function operatorFromParsed(
  operator: ParsedNumber['comparisonOperator'],
  contextText: string,
): FactComparisonOperator {
  if (/\b\d[\d,.]*\s*(?:-|to|through)\s*\d/i.test(contextText)) return 'range';
  if (operator === 'gte' || operator === 'gt') return 'minimum';
  if (operator === 'lte' || operator === 'lt') return 'maximum';
  if (/approximately|about\b|roughly/i.test(contextText)) return 'approximate';
  return operator === 'eq' ? 'equal' : 'unknown';
}

export function extractTypedNumberFacts(
  text: string,
  source?: { documentId?: string; pageNumber?: number },
): TypedNumberFact[] {
  const facts: TypedNumberFact[] = [];
  for (const parsed of parseDeterministicNumbers(text)) {
    const contextText = sentenceAt(text, parsed.startOffset ?? 0);
    const localStart =
      (parsed.startOffset ?? 0) - (text.indexOf(contextText) >= 0 ? text.indexOf(contextText) : 0);
    const identifierWindow = contextText.slice(
      Math.max(0, localStart - 18),
      localStart + parsed.original.length + 4,
    );
    if (
      parsed.unit == null &&
      /(?:form|schedule|attachment|exhibit|addendum|amendment|page|section)\s+[A-Z-]*\s*\d/i.test(
        identifierWindow,
      )
    )
      continue;
    const role = numberRole(contextText, parsed.unit);
    if (role === 'unknown') continue;
    const rangeMatch = contextText.match(
      /\b\d[\d,]*(?:\.\d+)?\s*(?:-|to|through)\s*(\d[\d,]*(?:\.\d+)?)\b/i,
    );
    facts.push({
      ...parsed,
      role,
      operator: operatorFromParsed(parsed.comparisonOperator, contextText),
      rangeEndValue: rangeMatch ? Number(rangeMatch[1]!.replace(/,/g, '')) : null,
      scope: materialScope(contextText),
      contextText,
      ...source,
    });
  }
  return facts;
}

function normalizedScopeValue(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeEvidenceText(value).toLowerCase();
  const singular: Record<string, string> = {
    offerors: 'offeror',
    bidders: 'bidder',
    vendors: 'vendor',
    contractors: 'contractor',
    employees: 'employee',
    officers: 'officer',
    'security officers': 'security officer',
    supervisors: 'supervisor',
    managers: 'manager',
    proposals: 'proposal',
    questions: 'question',
  };
  return singular[normalized] ?? normalized;
}

export function materialScopeDifferences(
  candidate: MaterialScope,
  source: MaterialScope,
): string[] {
  const differences: string[] = [];
  for (const key of [
    'site',
    'role',
    'party',
    'form',
    'section',
    'deliverable',
    'subject',
    'obligationRole',
  ] as const) {
    const candidateValue = normalizedScopeValue(candidate[key]);
    const sourceValue = normalizedScopeValue(source[key]);
    if (candidateValue && sourceValue && candidateValue !== sourceValue) differences.push(key);
  }
  if (
    candidate.insuranceBasis &&
    source.insuranceBasis &&
    candidate.insuranceBasis !== source.insuranceBasis
  )
    differences.push('insurance_basis');
  return differences;
}

export function materialScopeUnknowns(candidate: MaterialScope, source: MaterialScope): string[] {
  const unknowns: string[] = [];
  for (const key of [
    'site',
    'role',
    'party',
    'form',
    'section',
    'deliverable',
    'subject',
    'obligationRole',
  ] as const) {
    if (Boolean(candidate[key]) !== Boolean(source[key])) unknowns.push(key);
  }
  if (Boolean(candidate.insuranceBasis) !== Boolean(source.insuranceBasis))
    unknowns.push('insurance_basis');
  return unknowns;
}

export function compareMaterialScope(
  candidate: MaterialScope,
  source: MaterialScope,
): 'match' | 'mismatch' | 'unknown' {
  if (materialScopeDifferences(candidate, source).length) return 'mismatch';
  return materialScopeUnknowns(candidate, source).length ? 'unknown' : 'match';
}

export type TypedFactComparison = {
  comparison: 'match' | 'mismatch' | 'uncertain';
  reason:
    | 'all_material_fields_match'
    | 'ambiguous_candidate'
    | 'ambiguous_source'
    | 'relative_date_without_anchor'
    | 'semantic_role_mismatch'
    | 'no_compatible_source_fact'
    | 'normalized_value_mismatch'
    | 'time_mismatch'
    | 'timezone_mismatch'
    | 'unit_mismatch'
    | 'operator_mismatch'
    | 'range_mismatch'
    | 'material_scope_mismatch'
    | 'value_match_scope_mismatch';
  sourceFactIndex: number | null;
  materialScopeDifferences: string[];
  materialScopeUnknowns: string[];
  scopeComparison: 'match' | 'mismatch' | 'unknown';
};

function compatibleRole(candidateRole: string, sourceRole: string): boolean {
  return candidateRole === sourceRole || candidateRole === 'unknown' || sourceRole === 'unknown';
}

export function compareTypedDateFact(
  candidate: TypedDateFact,
  sources: TypedDateFact[],
): TypedFactComparison {
  if (candidate.relative && !candidate.anchorPresent)
    return {
      comparison: 'uncertain',
      reason: 'relative_date_without_anchor',
      sourceFactIndex: null,
      materialScopeDifferences: [],
      materialScopeUnknowns: [],
      scopeComparison: 'unknown',
    };
  if (candidate.ambiguous || !candidate.normalized)
    return {
      comparison: 'uncertain',
      reason: 'ambiguous_candidate',
      sourceFactIndex: null,
      materialScopeDifferences: [],
      materialScopeUnknowns: [],
      scopeComparison: 'unknown',
    };
  const roleMatches = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => compatibleRole(candidate.role, source.role));
  if (!roleMatches.length)
    return {
      comparison: 'uncertain',
      reason: 'semantic_role_mismatch',
      sourceFactIndex: null,
      materialScopeDifferences: [],
      materialScopeUnknowns: [],
      scopeComparison: 'unknown',
    };
  const scoped = roleMatches.filter(
    ({ source }) => compareMaterialScope(candidate.scope, source.scope) !== 'mismatch',
  );
  const exactScoped = scoped.find(({ source }) => source.normalized === candidate.normalized);
  const exactAny = roleMatches.find(({ source }) => source.normalized === candidate.normalized);
  const selected = exactScoped ?? exactAny ?? scoped[0] ?? roleMatches[0]!;
  const scopeComparison = compareMaterialScope(candidate.scope, selected.source.scope);
  const scopeUnknowns = materialScopeUnknowns(candidate.scope, selected.source.scope);
  if (selected.source.ambiguous || !selected.source.normalized)
    return {
      comparison: 'uncertain',
      reason: 'ambiguous_source',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (selected.source.normalized !== candidate.normalized)
    return {
      comparison: 'mismatch',
      reason: 'normalized_value_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (
    selected.source.time &&
    candidate.time &&
    candidate.time.toLowerCase() !== selected.source.time.toLowerCase()
  )
    return {
      comparison: 'mismatch',
      reason: 'time_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (
    selected.source.time &&
    selected.source.timezone &&
    candidate.timezone &&
    candidate.timezone.toLowerCase() !== selected.source.timezone.toLowerCase()
  )
    return {
      comparison: 'mismatch',
      reason: 'timezone_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (candidate.comparisonOperator !== selected.source.comparisonOperator)
    return {
      comparison: 'mismatch',
      reason: 'operator_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  return {
    comparison: 'match',
    reason:
      scopeComparison === 'mismatch' ? 'value_match_scope_mismatch' : 'all_material_fields_match',
    sourceFactIndex: selected.index,
    materialScopeDifferences: materialScopeDifferences(candidate.scope, selected.source.scope),
    materialScopeUnknowns: scopeUnknowns,
    scopeComparison,
  };
}

export function compareTypedNumberFact(
  candidate: TypedNumberFact,
  sources: TypedNumberFact[],
): TypedFactComparison {
  if (candidate.normalizedValue == null)
    return {
      comparison: 'uncertain',
      reason: 'ambiguous_candidate',
      sourceFactIndex: null,
      materialScopeDifferences: [],
      materialScopeUnknowns: [],
      scopeComparison: 'unknown',
    };
  const roleMatches = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => compatibleRole(candidate.role, source.role));
  if (!roleMatches.length)
    return {
      comparison: 'uncertain',
      reason: 'semantic_role_mismatch',
      sourceFactIndex: null,
      materialScopeDifferences: [],
      materialScopeUnknowns: [],
      scopeComparison: 'unknown',
    };
  const scoped = roleMatches.filter(
    ({ source }) => compareMaterialScope(candidate.scope, source.scope) !== 'mismatch',
  );
  if (!scoped.length) {
    const differences = materialScopeDifferences(candidate.scope, roleMatches[0]!.source.scope);
    return {
      comparison: 'mismatch',
      reason: 'material_scope_mismatch',
      sourceFactIndex: roleMatches[0]!.index,
      materialScopeDifferences: differences,
      materialScopeUnknowns: materialScopeUnknowns(candidate.scope, roleMatches[0]!.source.scope),
      scopeComparison: 'mismatch',
    };
  }
  const exactValue = scoped.find(
    ({ source }) =>
      source.normalizedValue === candidate.normalizedValue && source.unit === candidate.unit,
  );
  const selected = exactValue ?? scoped[0]!;
  const scopeComparison = compareMaterialScope(candidate.scope, selected.source.scope);
  const scopeUnknowns = materialScopeUnknowns(candidate.scope, selected.source.scope);
  if (selected.source.normalizedValue == null)
    return {
      comparison: 'uncertain',
      reason: 'ambiguous_source',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (selected.source.unit !== candidate.unit)
    return {
      comparison: 'mismatch',
      reason: 'unit_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (selected.source.normalizedValue !== candidate.normalizedValue)
    return {
      comparison: 'mismatch',
      reason: 'normalized_value_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (selected.source.operator !== candidate.operator)
    return {
      comparison: 'mismatch',
      reason: 'operator_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  if (selected.source.rangeEndValue !== candidate.rangeEndValue)
    return {
      comparison: 'mismatch',
      reason: 'range_mismatch',
      sourceFactIndex: selected.index,
      materialScopeDifferences: [],
      materialScopeUnknowns: scopeUnknowns,
      scopeComparison,
    };
  return {
    comparison: 'match',
    reason: 'all_material_fields_match',
    sourceFactIndex: selected.index,
    materialScopeDifferences: [],
    materialScopeUnknowns: scopeUnknowns,
    scopeComparison,
  };
}

export function compareDeterministicValues(
  candidate: { value: number | string | null; unit?: string | null },
  source: { value: number | string | null; unit?: string | null },
): 'match' | 'mismatch' | 'uncertain' {
  if (candidate.value == null || source.value == null) return 'uncertain';
  if (candidate.unit && source.unit && candidate.unit !== source.unit) return 'mismatch';
  return candidate.value === source.value ? 'match' : 'mismatch';
}

export type AtomicRequirementRelationship = {
  kind:
    | 'equivalent'
    | 'parent_with_additive_child'
    | 'parent_missing_material_condition'
    | 'related_distinct'
    | 'undetermined';
  parentObligation: string;
  childObligation: string | null;
  evidence: string | null;
};

function normalizedObligation(value: string): string {
  return normalizeEvidenceText(value)
    .toLowerCase()
    .replace(/\b(?:must|shall|is required to|are required to)\b/g, '')
    .replace(/[^a-z0-9$%]+/g, ' ')
    .trim();
}

/**
 * Classifies atomic parent/child structure without merging either obligation.
 * This is deliberately conservative: a consequence changes the parent meaning,
 * while separately satisfiable content, signature, sublimit, or packaging duties
 * remain additive child obligations.
 */
export function classifyAtomicRequirementRelationship(
  candidateObligation: string,
  sourceText: string,
): AtomicRequirementRelationship {
  const candidate = normalizedObligation(candidateObligation);
  const source = normalizedObligation(sourceText);
  const additivePatterns = [
    /(?:staffing plan|attachment|exhibit)[^.]{0,120}(?:showing|including|containing|with)\b[^.]*/i,
    /(?:form|schedule|attachment|exhibit)\s+[A-Z0-9-]+[^.]{0,120}\b(?:sign(?:ed|ature)|initial(?:ed)?)\b[^.]*/i,
    /(?:insurance|liability|coverage)[\s\S]{0,220}\b(?:site-specific|sublimit|for (?:the )?(?:North|South|East|West) Campus)\b[^.]*/i,
    /(?:packag(?:e|ing)|sealed envelope|copies)[^.]{0,140}/i,
  ];
  const additive = additivePatterns
    .map((pattern) => sourceText.match(pattern)?.[0] ?? null)
    .find((value) => value && !candidate.includes(normalizedObligation(value)));
  const parentSignals =
    /attach|submit|complete|provide|insurance|liability|proposal|meeting|attend/i.test(
      candidateObligation,
    );
  if (additive && parentSignals)
    return {
      kind: 'parent_with_additive_child',
      parentObligation: candidateObligation,
      childObligation: normalizeEvidenceText(additive),
      evidence: normalizeEvidenceText(additive),
    };

  if (candidate && source.includes(candidate))
    return {
      kind: 'equivalent',
      parentObligation: candidateObligation,
      childObligation: null,
      evidence: null,
    };
  const consequence = sourceText.match(
    /(?:failure to|if .*?does not|otherwise)[^.]{0,180}(?:disqualif(?:y|ies)|nonresponsive|reject(?:ed|ion)|ineligible)[^.]*/i,
  )?.[0];
  if (consequence && !/disqualif|nonresponsive|reject|ineligible/i.test(candidateObligation))
    return {
      kind: 'parent_missing_material_condition',
      parentObligation: candidateObligation,
      childObligation: null,
      evidence: normalizeEvidenceText(consequence),
    };

  return {
    kind: 'undetermined',
    parentObligation: candidateObligation,
    childObligation: null,
    evidence: null,
  };
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
    /certificate|certification|license|insurance|liability|staffing plan|resume|years of experience|references?|\bform\s+[a-z0-9-]+|\battachment\s+[a-z0-9-]+|\bexhibit\s+[a-z0-9-]+/i.test(
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
