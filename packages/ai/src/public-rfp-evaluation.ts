import type { RequirementCandidate } from './schemas';
import type { VerificationContext } from './provider';
import {
  extractTypedDateFacts,
  normalizeEvidenceText,
  validateEvidenceQuote,
} from './deterministic-verification';

export const PUBLIC_RFP_EXTRACTION_BATCH_VERSION = 'public-extraction-batches-v2';
export const PUBLIC_RFP_PORTAL_SOURCE_VERSION = 'public-portal-source-v1';
export const PUBLIC_RFP_PRECEDENCE_VERSION = 'public-explicit-precedence-v1';
export const PUBLIC_RFP_QUOTE_GATE_VERSION = 'public-preliminary-quote-gate-v1';

export type PublicRfpDocument = {
  id: string;
  name: string;
  type: string;
  pages: Array<{ pageNumber: number; text: string }>;
};

export type PublicExtractionBatch = {
  id: string;
  documentId: string;
  documentName: string;
  documentType: string;
  firstPage: number;
  lastPage: number;
  estimatedTokens: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

export function buildPublicExtractionBatches(
  documents: PublicRfpDocument[],
  options: { maxPages?: number; maxEstimatedTokens?: number } = {},
): PublicExtractionBatch[] {
  const maxPages = options.maxPages ?? 8;
  const maxEstimatedTokens = options.maxEstimatedTokens ?? 14_000;
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be positive');
  if (!Number.isInteger(maxEstimatedTokens) || maxEstimatedTokens < 500)
    throw new Error('maxEstimatedTokens must be at least 500');

  const batches: PublicExtractionBatch[] = [];
  for (const document of documents) {
    let pages: PublicExtractionBatch['pages'] = [];
    let tokens = 0;
    const flush = () => {
      if (!pages.length) return;
      const firstPage = pages[0]!.pageNumber;
      const lastPage = pages.at(-1)!.pageNumber;
      batches.push({
        id: `${document.id}:${firstPage}-${lastPage}`,
        documentId: document.id,
        documentName: document.name,
        documentType: document.type,
        firstPage,
        lastPage,
        estimatedTokens: tokens,
        pages,
      });
      pages = [];
      tokens = 0;
    };
    for (const page of document.pages) {
      const pageTokens = Math.max(1, Math.ceil(page.text.length / 4));
      if (pages.length && (pages.length >= maxPages || tokens + pageTokens > maxEstimatedTokens))
        flush();
      pages.push(page);
      tokens += pageTokens;
      if (tokens >= maxEstimatedTokens) flush();
    }
    flush();
  }
  return batches;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

/** Converts a preserved official procurement page into one auditable source page. */
export function officialPortalHtmlToText(html: string): string {
  const withoutExecutable = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');
  return normalizeEvidenceText(decodeHtmlEntities(withoutExecutable.replace(/<[^>]+>/g, ' ')));
}

export type ExplicitDeadlineReplacement = {
  role: 'question_deadline' | 'submission_deadline';
  oldRaw: string;
  oldNormalized: string;
  replacementRaw: string;
  replacementNormalized: string;
  evidence: string;
};

function collectRoleDates(text: string, role: ExplicitDeadlineReplacement['role']) {
  const pattern =
    role === 'question_deadline'
      ? /submit questions by\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{2,4}),?\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*\(PST\))/gi
      : /deadline for Proposals is\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*\(PST\))/gi;
  return [...text.matchAll(pattern)].map((match) => `${match[1]} ${match[2]}`);
}

function expandTwoDigitYear(value: string): string {
  return value.replace(
    /,?\s+(\d{2})(?=\s+\d{1,2}:\d{2})/,
    (_match, year: string) => `, 20${year} `,
  );
}

/**
 * Uses only explicit portal "changed from ... to ..." evidence. It never assumes that a later
 * issue date, addendum number, upload time, filename, or page order establishes precedence.
 */
export function findExplicitPortalDeadlineReplacements(
  portalText: string,
): ExplicitDeadlineReplacement[] {
  const normalized = normalizeEvidenceText(portalText);
  const changeIndex = normalized.toLowerCase().indexOf('changed from');
  if (changeIndex < 0) return [];
  const relevant = normalized.slice(changeIndex, changeIndex + 5000);
  if (!/\bto\b/i.test(relevant)) return [];
  const result: ExplicitDeadlineReplacement[] = [];
  for (const role of ['question_deadline', 'submission_deadline'] as const) {
    const dates = collectRoleDates(relevant, role);
    if (dates.length < 2) continue;
    const oldRaw = dates[0]!;
    const replacementRaw = dates.at(-1)!;
    const oldFact = extractTypedDateFacts(expandTwoDigitYear(oldRaw))[0];
    const replacementFact = extractTypedDateFacts(expandTwoDigitYear(replacementRaw))[0];
    if (!oldFact?.normalized || !replacementFact?.normalized) continue;
    result.push({
      role,
      oldRaw,
      oldNormalized: oldFact.normalized,
      replacementRaw,
      replacementNormalized: replacementFact.normalized,
      evidence: relevant.slice(0, 2400),
    });
  }
  return result;
}

export function precedenceForExplicitDeadline(
  candidate: Pick<RequirementCandidate, 'title' | 'obligation'>,
  replacements: ExplicitDeadlineReplacement[],
): 'active' | 'superseded' | 'undetermined' {
  const text = `${candidate.title} ${candidate.obligation}`;
  const roles = [
    ...(text.match(/question/i) ? (['question_deadline'] as const) : []),
    ...(text.match(/proposal|submission/i) ? (['submission_deadline'] as const) : []),
  ];
  if (!roles.length) return 'undetermined';
  for (const role of roles) {
    const replacement = replacements.find((item) => item.role === role);
    if (!replacement) continue;
    const candidateDates = extractTypedDateFacts(text)
      .map((fact) => fact.normalized)
      .filter(Boolean);
    if (candidateDates.includes(replacement.oldNormalized)) return 'superseded';
    if (candidateDates.includes(replacement.replacementNormalized)) return 'active';
  }
  return 'undetermined';
}

export function gatePreliminaryCandidateQuotes(
  candidates: RequirementCandidate[],
  documents: PublicRfpDocument[],
) {
  const pages = new Map(
    documents.flatMap((document) =>
      document.pages.map((page) => [`${document.id}:${page.pageNumber}`, page.text] as const),
    ),
  );
  const accepted: RequirementCandidate[] = [];
  const rejected: Array<{
    candidate: RequirementCandidate;
    matchType: ReturnType<typeof validateEvidenceQuote>['matchType'];
  }> = [];
  for (const candidate of candidates) {
    const page = pages.get(`${candidate.documentId}:${candidate.preliminaryPage}`) ?? '';
    const validation = validateEvidenceQuote(page, candidate.evidenceQuote);
    if (validation.matchType === 'exact' || validation.matchType === 'normalized_exact')
      accepted.push(candidate);
    else rejected.push({ candidate, matchType: validation.matchType });
  }
  return { accepted, rejected };
}

/** Ensures a deadline candidate receives its cited page plus explicit amendment evidence. */
export function addExplicitAmendmentContext(
  candidate: Pick<RequirementCandidate, 'title' | 'obligation'>,
  contexts: VerificationContext[],
  portalContext: VerificationContext,
  replacements: ExplicitDeadlineReplacement[],
): VerificationContext[] {
  const precedence = precedenceForExplicitDeadline(candidate, replacements);
  if (precedence === 'undetermined') return contexts;
  return [
    ...contexts.filter((context) => context.chunkId !== portalContext.chunkId),
    portalContext,
  ];
}

export type PublicKnownAnswer = {
  id: string;
  status: 'active' | 'superseded';
  document: string;
  page: number | null;
  summary: string;
};

export type PublicKnownAnswerMatcher = {
  id: string;
  patterns: string[];
};

export function scorePublicKnownAnswers(input: {
  expected: PublicKnownAnswer[];
  matchers: PublicKnownAnswerMatcher[];
  candidates: RequirementCandidate[];
  documents: PublicRfpDocument[];
  assessmentByCandidateId: Map<
    string,
    {
      sourceSupportStatus:
        'supported' | 'partially_supported' | 'unsupported' | 'contradicted' | 'parser_uncertain';
      precedenceStatus: 'active' | 'superseded' | 'conflicting' | 'undetermined';
    }
  >;
}) {
  const documentNames = new Map(input.documents.map((document) => [document.id, document.name]));
  const matcherMap = new Map(input.matchers.map((matcher) => [matcher.id, matcher]));
  const results = input.expected.map((expected) => {
    const matcher = matcherMap.get(expected.id);
    if (!matcher?.patterns.length)
      return {
        id: expected.id,
        expectedStatus: expected.status,
        passed: false,
        reason: 'matcher_missing',
      };
    const candidate = input.candidates.find((item) => {
      const text = `${item.title} ${item.obligation}`;
      return (
        documentNames.get(item.documentId) === expected.document &&
        (expected.page == null || item.preliminaryPage === expected.page) &&
        matcher.patterns.some((pattern) => new RegExp(pattern, 'i').test(text))
      );
    });
    if (!candidate)
      return {
        id: expected.id,
        expectedStatus: expected.status,
        passed: false,
        reason: 'not_extracted',
      };
    const assessment = input.assessmentByCandidateId.get(candidate.id);
    if (!assessment)
      return {
        id: expected.id,
        candidateId: candidate.id,
        expectedStatus: expected.status,
        passed: false,
        reason: 'verification_missing',
      };
    if (assessment.sourceSupportStatus !== 'supported')
      return {
        id: expected.id,
        candidateId: candidate.id,
        expectedStatus: expected.status,
        actualSourceSupportStatus: assessment.sourceSupportStatus,
        actualStatus: assessment.precedenceStatus,
        passed: false,
        reason: 'not_source_supported',
      };
    const actualStatus = assessment.precedenceStatus;
    return {
      id: expected.id,
      candidateId: candidate.id,
      expectedStatus: expected.status,
      actualStatus,
      passed: actualStatus === expected.status,
      reason: actualStatus === expected.status ? 'matched' : 'precedence_mismatch',
    };
  });
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    recall: results.length ? passed / results.length : 0,
    results,
  };
}
