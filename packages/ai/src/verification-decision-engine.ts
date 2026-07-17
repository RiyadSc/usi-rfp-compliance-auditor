import { createHash } from 'node:crypto';
import type {
  ChallengeResult,
  DuplicatePairResult,
  EntailmentResult,
} from './verification-v3-schemas';
import type { VerificationCandidateInput, VerificationContext } from './provider';
import {
  classifyDuplicateRelationship,
  classifyProofRequirement,
  compareDeterministicValues,
  normalizeEvidenceText,
  parseDeterministicDate,
  parseDeterministicNumbers,
  validateEvidenceQuote,
} from './deterministic-verification';

export type DeterministicComparison = {
  kind: 'date' | 'number';
  candidateOriginal: string;
  candidateValue: string | number | null;
  sourceOriginal: string | null;
  sourceValue: string | number | null;
  unit: string | null;
  comparison: 'match' | 'mismatch' | 'uncertain';
};

export type AmendmentFact = {
  documentId: string;
  pageNumber: number;
  verb: 'replaces' | 'supersedes' | 'revises' | 'changes' | 'amends';
  quote: string;
  referencedValues: Array<number | string>;
  explicit: true;
};

export type DeterministicFactEnvelope = {
  version: 'verification-facts-v2';
  candidateId: string;
  citedPageExists: boolean;
  candidateQuoteMatch: ReturnType<typeof validateEvidenceQuote>;
  supportingQuoteLocations: Array<{
    documentId: string;
    pageNumber: number;
    matchType: ReturnType<typeof validateEvidenceQuote>['matchType'];
  }>;
  dates: {
    candidate: ReturnType<typeof parseDeterministicDate>[];
    source: ReturnType<typeof parseDeterministicDate>[];
  };
  numbers: {
    candidate: ReturnType<typeof parseDeterministicNumbers>;
    source: ReturnType<typeof parseDeterministicNumbers>;
  };
  comparisons: DeterministicComparison[];
  times: { candidate: string[]; source: string[] };
  formIdentifiers: { candidate: string[]; source: string[] };
  sectionIdentifiers: { candidate: string[]; source: string[] };
  amendmentFacts: AmendmentFact[];
  parserWarnings: string[];
  parserReliable: boolean;
  evidenceSourceHashes: Array<{
    documentId: string;
    pageNumber: number;
    sha256: string;
  }>;
  deterministicPrecedence: 'active' | 'superseded' | 'conflicting' | 'undetermined';
  descriptiveOrInjectionLanguage: boolean;
};

export type FinalMachineAssessment = {
  candidateId: string;
  sourceSupportStatus:
    'supported' | 'partially_supported' | 'unsupported' | 'contradicted' | 'parser_uncertain';
  precedenceStatus: 'active' | 'superseded' | 'conflicting' | 'undetermined';
  proofRequirement:
    | 'none_identified'
    | 'requires_human_confirmation'
    | 'requires_company_artifact'
    | 'requires_external_validation'
    | 'undetermined';
  rationale: string;
  supportingEvidence: EntailmentResult['supportingEvidence'];
  contradictingEvidence: EntailmentResult['contradictingEvidence'];
  materialMismatches: string[];
  parserConcerns: string[];
  ambiguityNotes: string[];
  deterministicModelDisagreement: string[];
  challengeStatus: 'not_required' | 'completed' | 'failed';
  machineOnly: true;
};

const MONTH_PATTERN =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December)';

function allDates(text: string) {
  const matches = [
    ...text.matchAll(new RegExp(`\\b${MONTH_PATTERN}\\s+\\d{1,2},\\s+\\d{4}\\b`, 'gi')),
    ...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
    ...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g),
  ];
  return [...new Set(matches.map((match) => match[0]))].map(parseDeterministicDate);
}

function allTimes(text: string): string[] {
  return [
    ...new Set(
      [
        ...text.matchAll(
          /\b\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s+(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|local time))?/gi,
        ),
      ].map((match) => match[0]),
    ),
  ];
}

function identifiers(text: string, kind: 'form' | 'section'): string[] {
  const pattern =
    kind === 'form'
      ? /\b(?:form|schedule|attachment|exhibit)\s+[A-Z0-9][A-Z0-9-]*\b/gi
      : /\b(?:section|article|paragraph)\s+[A-Z0-9][A-Z0-9.-]*\b/gi;
  return [...new Set([...text.matchAll(pattern)].map((match) => normalizeEvidenceText(match[0])))];
}

const STOP = new Set([
  'the',
  'and',
  'must',
  'shall',
  'with',
  'from',
  'that',
  'this',
  'offeror',
  'offerors',
  'requirement',
  'required',
  'active',
  'original',
  'addendum',
]);

function entityTokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((token) => !STOP.has(token)),
  );
}

function contextRelevance(candidate: VerificationCandidateInput, context: VerificationContext) {
  const cited =
    context.documentId === candidate.documentId && context.pageNumber === candidate.preliminaryPage;
  const neighbor =
    context.documentId === candidate.documentId &&
    Math.abs(context.pageNumber - candidate.preliminaryPage) === 1;
  const candidateTokens = entityTokens(`${candidate.title} ${candidate.obligation}`);
  const contextTokens = entityTokens(context.text);
  const overlap = [...candidateTokens].filter((token) => contextTokens.has(token)).length;
  const candidateForms = identifiers(candidate.obligation, 'form');
  const formMatch = candidateForms.some((form) =>
    identifiers(context.text, 'form')
      .map((item) => item.toLowerCase())
      .includes(form.toLowerCase()),
  );
  return (
    (cited ? 100 : neighbor ? 15 : 0) +
    overlap * 5 +
    (formMatch ? 20 : 0) +
    (/addendum|amendment/i.test(context.text) ? 2 : 0)
  );
}

function contextScopeCompatible(
  candidate: VerificationCandidateInput,
  context: VerificationContext,
): boolean {
  const obligation = candidate.obligation.toLowerCase();
  const source = context.text.toLowerCase();
  return ['north campus', 'south campus'].every(
    (scope) => obligation.includes(scope) === source.includes(scope),
  );
}

function contextSubjectCompatible(
  candidate: VerificationCandidateInput,
  context: VerificationContext,
): boolean {
  const text = context.text;
  if (candidate.category === 'mandatory_meeting')
    return /meeting|conference|site visit/i.test(text);
  if (candidate.category === 'deadline')
    return /submission deadline|proposals? .*\bdue\b/i.test(text);
  if (candidate.category === 'insurance') return /insurance|liability|coverage/i.test(text);
  if (candidate.category === 'required_form') {
    const candidateForms = identifiers(candidate.obligation, 'form');
    const sourceForms = identifiers(text, 'form').map((item) => item.toLowerCase());
    return candidateForms.some((form) => sourceForms.includes(form.toLowerCase()));
  }
  if (candidate.category === 'attachment') {
    const candidateForms = identifiers(candidate.obligation, 'form');
    const sourceForms = identifiers(text, 'form').map((item) => item.toLowerCase());
    return (
      !candidateForms.length ||
      candidateForms.some((form) => sourceForms.includes(form.toLowerCase()))
    );
  }
  return true;
}

export function selectCandidateContexts(
  candidate: VerificationCandidateInput,
  contexts: VerificationContext[],
  maxContexts = 8,
): VerificationContext[] {
  const scored = contexts
    .map((context) => ({ context, score: contextRelevance(candidate, context) }))
    .filter(({ context, score }) => score >= 5 && contextScopeCompatible(candidate, context))
    .sort((a, b) => b.score - a.score || a.context.pageNumber - b.context.pageNumber);
  const cited = contexts.find(
    (context) =>
      context.documentId === candidate.documentId &&
      context.pageNumber === candidate.preliminaryPage,
  );
  const selected = new Map<string, VerificationContext>();
  if (cited) selected.set(`${cited.documentId}:${cited.pageNumber}`, cited);
  for (const { context } of scored) {
    if (selected.size >= maxContexts) break;
    selected.set(`${context.documentId}:${context.pageNumber}`, context);
  }
  return [...selected.values()];
}

function amendmentVerb(text: string): AmendmentFact['verb'] | null {
  if (/\breplac(?:e|es|ed)\b|delete and replace\b/i.test(text)) return 'replaces';
  if (/\bsupersed(?:e|es|ed)\b/i.test(text)) return 'supersedes';
  if (/\brevis(?:e|es|ed)\b/i.test(text)) return 'revises';
  if (/\bchang(?:e|es|ed)(?:\s+to)?\b|\bincreas(?:e|es|ed)\s+to\b/i.test(text)) return 'changes';
  if (/\bis hereby amended|\bamend(?:s|ed)?\b/i.test(text)) return 'amends';
  return null;
}

function isAmendmentContext(context: VerificationContext): boolean {
  return (
    /addendum|amendment/i.test(context.documentType) ||
    /^\s*(?:addendum|amendment)\b/i.test(context.text)
  );
}

function deterministicPrecedence(
  candidate: VerificationCandidateInput,
  contexts: VerificationContext[],
): DeterministicFactEnvelope['deterministicPrecedence'] {
  const relevantAddenda = contexts.filter(
    (context) =>
      isAmendmentContext(context) &&
      contextScopeCompatible(candidate, context) &&
      contextSubjectCompatible(candidate, context) &&
      contextRelevance(candidate, context) >= 10,
  );
  const candidateNumbers = parseDeterministicNumbers(candidate.obligation).filter(
    (number) => number.unit,
  );
  const candidateDates = allDates(candidate.obligation).filter((date) => date.normalized);
  const candidateValues = [
    ...candidateNumbers.map((number) => number.normalizedValue),
    ...candidateDates.map((date) => date.normalized),
  ];

  const cited = contexts.find(
    (context) =>
      context.documentId === candidate.documentId &&
      context.pageNumber === candidate.preliminaryPage,
  );

  for (const context of relevantAddenda) {
    const lower = context.text.toLowerCase();
    const contextValues = [
      ...parseDeterministicNumbers(context.text).map((number) => number.normalizedValue),
      ...allDates(context.text).map((date) => date.normalized),
    ];
    if (
      context.chunkId !== cited?.chunkId &&
      amendmentVerb(context.text) &&
      candidateValues.some((value) => value != null && contextValues.includes(value)) &&
      /supersed|prior|old|original|replace(?:s|d)? that|date on page|amount on page|increased to|changed to/i.test(
        lower,
      )
    )
      return 'superseded';
  }

  const valueBearingAddenda = relevantAddenda.filter((context) => {
    const hasCandidateUnit = parseDeterministicNumbers(context.text).some((number) =>
      candidateNumbers.some((candidateNumber) => candidateNumber.unit === number.unit),
    );
    const hasCandidateDate =
      candidateDates.length > 0 && allDates(context.text).some((date) => date.normalized);
    return hasCandidateUnit || hasCandidateDate;
  });
  if (valueBearingAddenda.length >= 2) {
    const valuesByUnit = new Map<string, Set<number>>();
    for (const context of valueBearingAddenda) {
      for (const number of parseDeterministicNumbers(context.text)) {
        if (
          !number.unit ||
          number.normalizedValue == null ||
          !candidateNumbers.some((candidateNumber) => candidateNumber.unit === number.unit)
        )
          continue;
        const values = valuesByUnit.get(number.unit) ?? new Set<number>();
        values.add(number.normalizedValue);
        valuesByUnit.set(number.unit, values);
      }
    }
    const differingValues = [...valuesByUnit.values()].some((values) => values.size > 1);
    const dateValues = new Set(
      valueBearingAddenda.flatMap((context) =>
        allDates(context.text)
          .map((date) => date.normalized)
          .filter((value): value is string => value != null),
      ),
    );
    const explicitlyOrdered = valueBearingAddenda.some(
      (context) =>
        amendmentVerb(context.text) &&
        /supersedes?\s+addendum|replaces?\s+addendum|prior addendum|earlier addendum/i.test(
          context.text,
        ),
    );
    if (
      (differingValues || (candidateDates.length > 0 && dateValues.size > 1)) &&
      !explicitlyOrdered
    )
      return 'conflicting';
  }

  if (cited) return 'active';
  return 'undetermined';
}

export function buildDeterministicFactEnvelope(
  candidate: VerificationCandidateInput,
  contexts: VerificationContext[],
): DeterministicFactEnvelope {
  const cited = contexts.find(
    (context) =>
      context.documentId === candidate.documentId &&
      context.pageNumber === candidate.preliminaryPage,
  );
  const quoteMatch = validateEvidenceQuote(cited?.text ?? '', candidate.evidenceQuote);
  const sourceForComparison =
    cited && ['exact', 'normalized_exact'].includes(quoteMatch.matchType)
      ? candidate.evidenceQuote
      : (cited?.text ?? '');
  const candidateDates = allDates(candidate.obligation);
  const sourceDates = allDates(sourceForComparison);
  const candidateNumbers = parseDeterministicNumbers(candidate.obligation).filter(
    (number) => number.unit,
  );
  const sourceNumbers = parseDeterministicNumbers(sourceForComparison).filter(
    (number) => number.unit,
  );
  const comparisons: DeterministicComparison[] = [];
  for (const candidateDate of candidateDates) {
    const sourceDate =
      sourceDates.find((date) => date.normalized === candidateDate.normalized) ?? sourceDates[0];
    comparisons.push({
      kind: 'date',
      candidateOriginal: candidateDate.original,
      candidateValue: candidateDate.normalized,
      sourceOriginal: sourceDate?.original ?? null,
      sourceValue: sourceDate?.normalized ?? null,
      unit: 'date',
      comparison: sourceDate
        ? compareDeterministicValues(
            { value: candidateDate.normalized, unit: 'date' },
            { value: sourceDate.normalized, unit: 'date' },
          )
        : 'uncertain',
    });
  }
  for (const candidateNumber of candidateNumbers) {
    const sameUnit = sourceNumbers.filter((source) => source.unit === candidateNumber.unit);
    const sourceNumber =
      sameUnit.find((source) => source.normalizedValue === candidateNumber.normalizedValue) ??
      sameUnit[0];
    comparisons.push({
      kind: 'number',
      candidateOriginal: candidateNumber.original,
      candidateValue: candidateNumber.normalizedValue,
      sourceOriginal: sourceNumber?.original ?? null,
      sourceValue: sourceNumber?.normalizedValue ?? null,
      unit: candidateNumber.unit,
      comparison: sourceNumber
        ? compareDeterministicValues(
            { value: candidateNumber.normalizedValue, unit: candidateNumber.unit },
            { value: sourceNumber.normalizedValue, unit: sourceNumber.unit },
          )
        : 'uncertain',
    });
  }
  const amendmentFacts = contexts.flatMap((context) => {
    const verb = amendmentVerb(context.text);
    if (!verb || !isAmendmentContext(context)) return [];
    return [
      {
        documentId: context.documentId,
        pageNumber: context.pageNumber,
        verb,
        quote: context.text.slice(0, 1200),
        referencedValues: [
          ...parseDeterministicNumbers(context.text)
            .map((number) => number.normalizedValue)
            .filter((value): value is number => value != null),
          ...allDates(context.text)
            .map((date) => date.normalized)
            .filter((value): value is string => value != null),
          ...identifiers(context.text, 'form'),
          ...identifiers(context.text, 'section'),
        ],
        explicit: true as const,
      },
    ];
  });
  const parserWarnings = cited?.parserWarnings ?? [];
  const parserReliable =
    Boolean(cited) && cited?.extractionStatus === 'ok' && !parserWarnings.length;
  return {
    version: 'verification-facts-v2',
    candidateId: candidate.id,
    citedPageExists: Boolean(cited),
    candidateQuoteMatch: quoteMatch,
    supportingQuoteLocations: contexts.map((context) => ({
      documentId: context.documentId,
      pageNumber: context.pageNumber,
      matchType: validateEvidenceQuote(context.text, candidate.evidenceQuote).matchType,
    })),
    dates: { candidate: candidateDates, source: sourceDates },
    numbers: { candidate: candidateNumbers, source: sourceNumbers },
    comparisons,
    times: {
      candidate: allTimes(candidate.obligation),
      source: allTimes(sourceForComparison),
    },
    formIdentifiers: {
      candidate: identifiers(candidate.obligation, 'form'),
      source: identifiers(sourceForComparison, 'form'),
    },
    sectionIdentifiers: {
      candidate: identifiers(candidate.obligation, 'section'),
      source: identifiers(sourceForComparison, 'section'),
    },
    amendmentFacts,
    parserWarnings,
    parserReliable,
    evidenceSourceHashes: contexts.map((context) => ({
      documentId: context.documentId,
      pageNumber: context.pageNumber,
      sha256: createHash('sha256').update(context.text).digest('hex'),
    })),
    deterministicPrecedence: deterministicPrecedence(candidate, contexts),
    descriptiveOrInjectionLanguage:
      /system prompt|api key|use tools|email the key|ignore (?:all )?(?:previous|prior) instructions/i.test(
        candidate.obligation,
      ) ||
      Boolean(
        cited &&
        /not an instruction|not procurement requirements|creates no .*obligation/i.test(cited.text),
      ),
  };
}

function validatedReferences(
  references: EntailmentResult['supportingEvidence'],
  contexts: VerificationContext[],
) {
  const pageMap = new Map(
    contexts.map((context) => [`${context.documentId}:${context.pageNumber}`, context]),
  );
  return references.filter((reference) => {
    const page = pageMap.get(`${reference.documentId}:${reference.pageNumber}`);
    return (
      page &&
      ['exact', 'normalized_exact'].includes(
        validateEvidenceQuote(page.text, reference.quote).matchType,
      )
    );
  });
}

export function deriveMachineAssessment(input: {
  candidate: VerificationCandidateInput;
  contexts: VerificationContext[];
  facts: DeterministicFactEnvelope;
  entailment: EntailmentResult | null;
  challenge: ChallengeResult | null;
  challengeFailed?: boolean;
}): FinalMachineAssessment {
  const { candidate, contexts, facts, entailment, challenge } = input;
  const disagreements: string[] = [];
  const supportingEvidence = entailment
    ? validatedReferences(entailment.supportingEvidence, contexts)
    : [];
  const contradictingEvidence = entailment
    ? validatedReferences(entailment.contradictingEvidence, contexts)
    : [];
  const valueMismatch = facts.comparisons.some(
    (comparison) => comparison.comparison === 'mismatch',
  );
  const ambiguousFact = facts.comparisons.some(
    (comparison) => comparison.comparison === 'uncertain' && comparison.candidateValue == null,
  );
  const parserBad = !facts.citedPageExists || !facts.parserReliable;
  const injectionInfluence = Boolean(
    entailment?.injectionInfluence || challenge?.injectionInfluence,
  );
  const candidateContainsInjectionLanguage =
    /system prompt|api key|use tools|email the key|ignore (?:all )?(?:previous|prior) instructions/i.test(
      candidate.obligation,
    );
  let status: FinalMachineAssessment['sourceSupportStatus'];
  if (parserBad) status = 'parser_uncertain';
  else if (!entailment) status = 'unsupported';
  else if (entailment.classification === 'parser_uncertain') status = 'parser_uncertain';
  else if (entailment.classification === 'contradicts') status = 'contradicted';
  else if (entailment.classification === 'insufficient') status = 'unsupported';
  else if (entailment.classification === 'partially_entails') status = 'partially_supported';
  else if (input.challengeFailed || !challenge) status = 'unsupported';
  else if (challenge.assessment === 'parser_uncertain') status = 'parser_uncertain';
  else if (challenge.assessment === 'contradictory_evidence')
    status = contradictingEvidence.length || valueMismatch ? 'contradicted' : 'partially_supported';
  else if (challenge.assessment === 'material_qualification_missing')
    status = 'partially_supported';
  else if (challenge.assessment === 'precedence_problem') status = 'partially_supported';
  else if (challenge.assessment === 'insufficient_evidence') status = 'unsupported';
  else if (
    challenge.assessment === 'no_material_objection' &&
    supportingEvidence.length > 0 &&
    !valueMismatch &&
    !ambiguousFact &&
    !entailment.missingOrOverstatedQualifiers.length &&
    !entailment.descriptiveOnly &&
    !facts.descriptiveOrInjectionLanguage &&
    !injectionInfluence
  )
    status = 'supported';
  else status = valueMismatch ? 'contradicted' : 'partially_supported';

  if (entailment?.classification === 'entails' && status !== 'supported')
    disagreements.push(`Pass A entails but deterministic engine selected ${status}.`);
  if (valueMismatch && entailment?.classification === 'entails')
    disagreements.push('Semantic entailment conflicts with a deterministic date/number mismatch.');
  if (
    facts.deterministicPrecedence !== 'active' &&
    challenge?.assessment === 'no_material_objection'
  )
    disagreements.push(
      `Challenge found no objection while deterministic precedence is ${facts.deterministicPrecedence}.`,
    );

  return {
    candidateId: candidate.id,
    sourceSupportStatus: status,
    precedenceStatus:
      candidateContainsInjectionLanguage ||
      ((status === 'parser_uncertain' || status === 'unsupported') &&
        facts.deterministicPrecedence === 'active')
        ? 'undetermined'
        : facts.deterministicPrecedence,
    proofRequirement:
      status === 'parser_uncertain'
        ? 'undetermined'
        : classifyProofRequirement(candidate.obligation),
    rationale: [
      entailment?.rationale ?? 'Entailment pass did not complete.',
      challenge?.rationale ?? (input.challengeFailed ? 'Challenge pass failed.' : ''),
      `Decision engine: ${status}.`,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 1900),
    supportingEvidence,
    contradictingEvidence,
    materialMismatches: [
      ...(entailment?.missingOrOverstatedQualifiers ?? []),
      ...(challenge?.objections.map((objection) => objection.detail) ?? []),
      ...facts.comparisons
        .filter((comparison) => comparison.comparison === 'mismatch')
        .map(
          (comparison) =>
            `${comparison.kind} mismatch: candidate ${comparison.candidateOriginal}; source ${comparison.sourceOriginal ?? 'none'}`,
        ),
    ],
    parserConcerns: [...facts.parserWarnings, ...(entailment?.parserConcerns ?? [])],
    ambiguityNotes: ambiguousFact
      ? ['A deterministic fact is ambiguous and was not normalized.']
      : [],
    deterministicModelDisagreement: disagreements,
    challengeStatus: input.challengeFailed ? 'failed' : challenge ? 'completed' : 'not_required',
    machineOnly: true,
  };
}

function materialDifferences(a: VerificationCandidateInput, b: VerificationCandidateInput) {
  const differences: string[] = [];
  const aDates = allDates(a.obligation).map((date) => date.normalized ?? date.original);
  const bDates = allDates(b.obligation).map((date) => date.normalized ?? date.original);
  if (aDates.length && bDates.length && !aDates.some((date) => bDates.includes(date)))
    differences.push('date');
  const aNumbers = parseDeterministicNumbers(a.obligation).filter((number) => number.unit);
  const bNumbers = parseDeterministicNumbers(b.obligation).filter((number) => number.unit);
  if (
    aNumbers.some((left) =>
      bNumbers.some(
        (right) => left.unit === right.unit && left.normalizedValue !== right.normalizedValue,
      ),
    )
  )
    differences.push('amount_or_unit');
  const aForms = identifiers(a.obligation, 'form').map((item) => item.toLowerCase());
  const bForms = identifiers(b.obligation, 'form').map((item) => item.toLowerCase());
  if (aForms.length && bForms.length && !aForms.some((form) => bForms.includes(form)))
    differences.push('form_identifier');
  for (const term of [
    'manager',
    'supervisor',
    'contractor',
    'employee',
    'north campus',
    'south campus',
  ]) {
    if (a.obligation.toLowerCase().includes(term) !== b.obligation.toLowerCase().includes(term))
      differences.push(`scope:${term}`);
  }
  return [...new Set(differences)];
}

export type DuplicatePairCandidate = {
  source: VerificationCandidateInput;
  target: VerificationCandidateInput;
  deterministicClassification: ReturnType<typeof classifyDuplicateRelationship>;
  materialDifferences: string[];
};

export function generateDuplicatePairCandidates(
  candidates: VerificationCandidateInput[],
): DuplicatePairCandidate[] {
  const out: DuplicatePairCandidate[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const source = candidates[i]!;
      const target = candidates[j]!;
      const deterministicClassification = classifyDuplicateRelationship(source, target);
      const formsA = identifiers(source.obligation, 'form');
      const formsB = identifiers(target.obligation, 'form');
      const sharedForm = formsA.some((form) =>
        formsB.map((item) => item.toLowerCase()).includes(form.toLowerCase()),
      );
      const titleExact =
        normalizeEvidenceText(source.title).toLowerCase() ===
        normalizeEvidenceText(target.title).toLowerCase();
      if (
        !titleExact &&
        !sharedForm &&
        !['exact_duplicate', 'semantic_duplicate'].includes(deterministicClassification)
      )
        continue;
      out.push({
        source,
        target,
        deterministicClassification,
        materialDifferences: materialDifferences(source, target),
      });
    }
  }
  return out;
}

export function applyDuplicateSafetyBlock(
  pair: DuplicatePairCandidate,
  model: DuplicatePairResult,
): DuplicatePairResult {
  if (
    pair.materialDifferences.length &&
    ['exact_duplicate', 'semantic_duplicate', 'restatement', 'parent_child'].includes(
      model.relationshipType,
    )
  )
    return {
      ...model,
      relationshipType: 'related_distinct',
      materialDifferences: pair.materialDifferences,
      rationale: `Deterministic material-difference block: ${pair.materialDifferences.join(', ')}.`,
    };
  return { ...model, materialDifferences: pair.materialDifferences };
}

export type ExplicitPrecedenceRelationship = {
  sourceCandidateId: string;
  targetCandidateId: string;
  relationshipType: 'supersedes' | 'replaces' | 'revises';
  originalDocumentId: string;
  originalPageNumber: number;
  addendumDocumentId: string;
  addendumPageNumber: number;
  precedenceQuote: string;
  deterministicMetadata: Record<string, unknown>;
};

export function findExplicitPrecedenceRelationships(
  candidates: VerificationCandidateInput[],
  contexts: VerificationContext[],
): ExplicitPrecedenceRelationship[] {
  const out: ExplicitPrecedenceRelationship[] = [];
  for (const context of contexts) {
    const verb = amendmentVerb(context.text);
    if (!verb || !isAmendmentContext(context)) continue;
    const relationshipType =
      verb === 'replaces' ? 'replaces' : verb === 'supersedes' ? 'supersedes' : 'revises';
    const values = parseDeterministicNumbers(context.text).filter((number) => number.unit);
    const source = candidates.find(
      (candidate) =>
        candidate.preliminaryPage !== context.pageNumber &&
        values.some((value) =>
          parseDeterministicNumbers(candidate.obligation).some(
            (candidateValue) =>
              candidateValue.unit === value.unit &&
              candidateValue.normalizedValue === value.normalizedValue,
          ),
        ) &&
        /old|original|was required|prior/i.test(candidate.obligation),
    );
    const target = candidates.find(
      (candidate) =>
        candidate.id !== source?.id &&
        candidate.preliminaryPage === context.pageNumber &&
        values.some((value) =>
          parseDeterministicNumbers(candidate.obligation).some(
            (candidateValue) =>
              candidateValue.unit === value.unit &&
              candidateValue.normalizedValue === value.normalizedValue,
          ),
        ) &&
        /active|must|at least|due/i.test(candidate.obligation),
    );
    if (!source || !target) continue;
    out.push({
      sourceCandidateId: source.id,
      targetCandidateId: target.id,
      relationshipType,
      originalDocumentId: source.documentId,
      originalPageNumber: source.preliminaryPage,
      addendumDocumentId: context.documentId,
      addendumPageNumber: context.pageNumber,
      precedenceQuote: context.text.slice(0, 1200),
      deterministicMetadata: { verb, values: values.map((value) => value.normalizedValue) },
    });
  }
  return out;
}
