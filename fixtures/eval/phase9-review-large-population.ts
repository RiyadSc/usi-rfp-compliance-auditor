import { createHash } from 'node:crypto';
import type { Phase9ReviewFinding } from '@usi/domain';

export const PHASE9_REVIEW_LARGE_POPULATION_VERSION = 'phase9-review-large-population-v1' as const;
export const PHASE9_REVIEW_LARGE_POPULATION_SIZE = 1_024;
export const PHASE9_REVIEW_LARGE_PAGE_LIMIT = 100;

const documentId = '91000000-0000-4000-8000-000000000001';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function baseFinding(index: number): Phase9ReviewFinding {
  return {
    candidateHash: digest(`${PHASE9_REVIEW_LARGE_POPULATION_VERSION}:candidate:${index}`),
    sourceSupportStatus: 'supported',
    precedenceStatus: 'active',
    category: 'technical_response',
    requirementType: 'technical_response',
    obligationText: `The bidder shall provide technical response item ${index}.`,
    evidenceText: `The bidder shall provide technical response item ${index}.`,
    evidenceCount: 1,
    pageReferencesComplete: true,
    quoteMatchType: 'exact',
    ambiguityCode: null,
    parserUncertain: false,
    unresolvedCoverageException: false,
    machineOnly: true,
    duplicateOfCandidateHash: null,
    humanDecision: null,
    mandatoryClass: 'mandatory',
    sourceDocumentId: documentId,
    sourcePage: (index % 200) + 1,
    sourceOrder: index,
    deadlineIso: null,
    formReference: null,
    materialFacts: { scope: `technical-response-${index}` },
    sourceBlockHashes: [digest(`${PHASE9_REVIEW_LARGE_POPULATION_VERSION}:block:${index}`)],
  };
}

/**
 * Generated rather than copied from a production run. The population includes every lane,
 * exact duplicate pairs, materially conflicting pairs, and active/superseded lookalikes.
 */
export function buildPhase9LargeReviewFixture(): Phase9ReviewFinding[] {
  const findings = Array.from({ length: PHASE9_REVIEW_LARGE_POPULATION_SIZE }, (_, index) =>
    baseFinding(index),
  );

  for (let index = 0; index < 64; index += 1) {
    const kind = index % 4;
    findings[index] =
      kind === 0
        ? { ...findings[index]!, sourceSupportStatus: 'unsupported' }
        : kind === 1
          ? { ...findings[index]!, precedenceStatus: 'superseded' }
          : kind === 2
            ? { ...findings[index]!, ambiguityCode: 'scope_requires_review' }
            : { ...findings[index]!, parserUncertain: true };
  }

  const criticalCategories: Phase9ReviewFinding['category'][] = [
    'submission_deadline',
    'question_deadline',
    'mandatory_form',
    'pricing_form',
    'signature',
    'insurance',
    'bond',
    'license',
  ];
  for (let index = 64; index < 192; index += 1) {
    const category = criticalCategories[(index - 64) % criticalCategories.length]!;
    findings[index] = {
      ...findings[index]!,
      category,
      requirementType: category,
      obligationText: `The bidder must complete submission-critical ${category} item ${index}.`,
      evidenceText: `The bidder must complete submission-critical ${category} item ${index}.`,
      materialFacts: { category, scope: `critical-${index}` },
    };
  }

  // Thirty-two exact pairs. The deterministic policy must preserve all 64 findings, choose
  // one canonical member per pair, and classify only the second occurrence as non-canonical.
  for (let group = 0; group < 32; group += 1) {
    const left = 192 + group * 2;
    const right = left + 1;
    const obligationText = `The bidder shall describe routine operating procedure ${group}.`;
    const evidenceText = `The bidder shall describe routine operating procedure ${group}.`;
    const sourceBlockHash = digest(
      `${PHASE9_REVIEW_LARGE_POPULATION_VERSION}:duplicate-block:${group}`,
    );
    const materialFacts = { scope: `routine-procedure-${group}` };
    findings[left] = {
      ...findings[left]!,
      obligationText,
      evidenceText,
      materialFacts,
      sourceBlockHashes: [sourceBlockHash],
      sourcePage: group + 1,
    };
    findings[right] = {
      ...findings[right]!,
      obligationText,
      evidenceText,
      materialFacts,
      sourceBlockHashes: [sourceBlockHash],
      sourcePage: group + 1,
    };
  }

  // Same words and source, but conflicting material values. These are related, not duplicates.
  findings[256] = {
    ...findings[256]!,
    obligationText: 'The bidder shall provide three supervisors.',
    evidenceText: 'The bidder shall provide three supervisors.',
    materialFacts: { role: 'supervisor', quantity: 3, operator: 'exact' },
    sourceBlockHashes: [digest('large-conflicting-supervisor-count')],
  };
  findings[257] = {
    ...findings[257]!,
    obligationText: 'The bidder shall provide three supervisors.',
    evidenceText: 'The bidder shall provide three supervisors.',
    materialFacts: { role: 'supervisor', quantity: 4, operator: 'exact' },
    sourceBlockHashes: [digest('large-conflicting-supervisor-count')],
  };

  // Identical facts with different precedence must never be grouped.
  findings[258] = {
    ...findings[258]!,
    obligationText: 'The bidder shall submit the legacy staffing worksheet.',
    evidenceText: 'The bidder shall submit the legacy staffing worksheet.',
    materialFacts: { form: 'legacy-staffing' },
    sourceBlockHashes: [digest('large-active-superseded-pair')],
  };
  findings[259] = {
    ...findings[259]!,
    obligationText: 'The bidder shall submit the legacy staffing worksheet.',
    evidenceText: 'The bidder shall submit the legacy staffing worksheet.',
    materialFacts: { form: 'legacy-staffing' },
    sourceBlockHashes: [digest('large-active-superseded-pair')],
    precedenceStatus: 'superseded',
  };

  return findings;
}

export type Phase9LargeFixtureCursor = {
  sourceOrder: number;
  candidateHash: string;
};

export function pagePhase9LargeReviewFixture(
  findings: Phase9ReviewFinding[],
  input: { cursor?: Phase9LargeFixtureCursor | null; limit: number },
): {
  rows: Phase9ReviewFinding[];
  nextCursor: Phase9LargeFixtureCursor | null;
} {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > PHASE9_REVIEW_LARGE_PAGE_LIMIT
  )
    throw new Error('phase9_review_fixture_page_limit_invalid');
  const ordered = [...findings].sort(
    (left, right) =>
      left.sourceOrder - right.sourceOrder || left.candidateHash.localeCompare(right.candidateHash),
  );
  const start = input.cursor
    ? ordered.findIndex(
        (finding) =>
          finding.sourceOrder > input.cursor!.sourceOrder ||
          (finding.sourceOrder === input.cursor!.sourceOrder &&
            finding.candidateHash > input.cursor!.candidateHash),
      )
    : 0;
  if (start < 0) return { rows: [], nextCursor: null };
  const rows = ordered.slice(start, start + input.limit);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor:
      last && start + rows.length < ordered.length
        ? { sourceOrder: last.sourceOrder, candidateHash: last.candidateHash }
        : null,
  };
}
