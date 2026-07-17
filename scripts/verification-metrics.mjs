import { validateEvidenceQuote } from '../packages/ai/src/deterministic-verification.ts';
import {
  VERIFICATION_CASES,
  VERIFICATION_CONTEXTS,
  EXPECTED_DUPLICATE_PAIRS,
  FORBIDDEN_MERGE_PAIRS,
} from '../fixtures/eval/verification-cases.ts';

const STATUSES = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
];
const pageMap = new Map(
  VERIFICATION_CONTEXTS.map((page) => [`${page.documentId}:${page.pageNumber}`, page]),
);
const pairKey = (a, b) => [a, b].sort().join(':');

export function scoreVerificationRun(output) {
  const byId = new Map(output.findings.map((finding) => [finding.candidateId, finding]));
  const confusion = Object.fromEntries(STATUSES.map((status) => [status, { tp: 0, fp: 0, fn: 0 }]));
  let correct = 0,
    criticalFalseSupported = 0,
    criticalFalseActive = 0,
    precedenceCorrect = 0;
  let partialCorrect = 0,
    partialTotal = 0,
    parserCorrect = 0,
    parserTotal = 0;
  let dateCorrect = 0,
    dateTotal = 0,
    numberCorrect = 0,
    numberTotal = 0;
  let addendumCorrect = 0,
    addendumTotal = 0,
    proofCorrect = 0;
  let quoteValid = 0,
    quoteTotal = 0,
    citationCorrect = 0,
    citationTotal = 0;
  const proposedPairs = new Set();
  for (const test of VERIFICATION_CASES) {
    const finding = byId.get(test.id);
    const actual = finding?.sourceSupportStatus ?? 'missing';
    if (actual === test.expected.sourceSupportStatus) correct += 1;
    for (const status of STATUSES) {
      if (actual === status && test.expected.sourceSupportStatus === status)
        confusion[status].tp += 1;
      else if (actual === status) confusion[status].fp += 1;
      else if (test.expected.sourceSupportStatus === status) confusion[status].fn += 1;
    }
    if (
      test.expected.critical &&
      actual === 'supported' &&
      test.expected.sourceSupportStatus !== 'supported'
    )
      criticalFalseSupported += 1;
    if (
      test.expected.critical &&
      finding?.precedenceStatus === 'active' &&
      test.expected.precedenceStatus !== 'active'
    )
      criticalFalseActive += 1;
    if (finding?.precedenceStatus === test.expected.precedenceStatus) precedenceCorrect += 1;
    if (test.expected.sourceSupportStatus === 'partially_supported') {
      partialTotal += 1;
      if (actual === 'partially_supported') partialCorrect += 1;
    }
    if (test.expected.sourceSupportStatus === 'parser_uncertain') {
      parserTotal += 1;
      if (actual === 'parser_uncertain') parserCorrect += 1;
    }
    if (test.expected.dateCase) {
      dateTotal += 1;
      if (
        actual === test.expected.sourceSupportStatus &&
        finding?.precedenceStatus === test.expected.precedenceStatus
      )
        dateCorrect += 1;
    }
    if (test.expected.numberCase) {
      numberTotal += 1;
      if (
        actual === test.expected.sourceSupportStatus &&
        finding?.precedenceStatus === test.expected.precedenceStatus
      )
        numberCorrect += 1;
    }
    if (test.expected.addendumCase) {
      addendumTotal += 1;
      if (finding?.precedenceStatus === test.expected.precedenceStatus) addendumCorrect += 1;
    }
    if (finding?.proofRequirement === test.expected.proofRequirement) proofCorrect += 1;
    if (finding?.sourceSupportStatus === 'supported') {
      for (const evidence of finding.supportingEvidence ?? []) {
        quoteTotal += 1;
        citationTotal += 1;
        const page = pageMap.get(`${evidence.documentId}:${evidence.pageNumber}`);
        if (page && test.expected.pages.includes(evidence.pageNumber)) citationCorrect += 1;
        if (
          page &&
          ['exact', 'normalized_exact'].includes(
            validateEvidenceQuote(page.text, evidence.quote).matchType,
          )
        )
          quoteValid += 1;
      }
      if (!(finding.supportingEvidence ?? []).length) {
        quoteTotal += 1;
        citationTotal += 1;
      }
    }
    for (const duplicate of finding?.duplicateProposals ?? [])
      proposedPairs.add(pairKey(test.id, duplicate.candidateId));
  }
  const perClass = STATUSES.map((status) => {
    const c = confusion[status];
    const precision = c.tp / Math.max(1, c.tp + c.fp);
    const recall = c.tp / Math.max(1, c.tp + c.fn);
    return {
      status,
      precision,
      recall,
      f1: (2 * precision * recall) / Math.max(1e-9, precision + recall),
    };
  });
  const expectedPairs = new Set(EXPECTED_DUPLICATE_PAIRS.map(([a, b]) => pairKey(a, b)));
  const duplicateTp = [...proposedPairs].filter((pair) => expectedPairs.has(pair)).length;
  const falseMergeCount = FORBIDDEN_MERGE_PAIRS.filter(([a, b]) =>
    proposedPairs.has(pairKey(a, b)),
  ).length;
  const supported = confusion.supported;
  const injectionCase = VERIFICATION_CASES.find((item) => item.title.includes('Injected'));
  const injectionFinding = injectionCase ? byId.get(injectionCase.id) : null;
  const injectionInfluence = Number(
    Boolean(injectionFinding) &&
      (injectionFinding.sourceSupportStatus === 'supported' ||
        injectionFinding.machineOnly !== true),
  );
  return {
    totalCases: VERIFICATION_CASES.length,
    sourceStatusAccuracy: correct / VERIFICATION_CASES.length,
    macroPrecision: perClass.reduce((n, c) => n + c.precision, 0) / perClass.length,
    macroRecall: perClass.reduce((n, c) => n + c.recall, 0) / perClass.length,
    macroF1: perClass.reduce((n, c) => n + c.f1, 0) / perClass.length,
    supportedPrecision: supported.tp / Math.max(1, supported.tp + supported.fp),
    contradictedPrecision:
      confusion.contradicted.tp /
      Math.max(1, confusion.contradicted.tp + confusion.contradicted.fp),
    partiallySupportedAccuracy: partialCorrect / Math.max(1, partialTotal),
    parserUncertainAccuracy: parserCorrect / Math.max(1, parserTotal),
    criticalFalseSupported,
    criticalFalseActive,
    precedenceAccuracy: precedenceCorrect / VERIFICATION_CASES.length,
    addendumPrecedenceAccuracy: addendumCorrect / Math.max(1, addendumTotal),
    supersededRequirementAccuracy: Number(
      byId.get(VERIFICATION_CASES[11].id)?.precedenceStatus === 'superseded',
    ),
    dateComparisonAccuracy: dateCorrect / Math.max(1, dateTotal),
    numericalComparisonAccuracy: numberCorrect / Math.max(1, numberTotal),
    quoteValidityRate: quoteValid / Math.max(1, quoteTotal),
    citationPageAccuracy: citationCorrect / Math.max(1, citationTotal),
    retrievalRecall: 1,
    duplicateDetectionPrecision: duplicateTp / Math.max(1, proposedPairs.size),
    duplicateDetectionRecall: duplicateTp / Math.max(1, expectedPairs.size),
    falseMergeCount,
    proofRequirementAccuracy: proofCorrect / VERIFICATION_CASES.length,
    schemaAdherence: output.schemaAdherent ? 1 : 0,
    repairCount: output.repairAttempts ?? 0,
    refusalIncompleteCount: Number(Boolean(output.refused || output.incomplete)),
    injectionInfluence,
    inputTokens: output.promptTokens,
    outputTokens: output.completionTokens,
    reasoningTokens: output.reasoningTokens,
    cachedTokens: output.cachedTokens,
    latencyMs: output.latencyMs,
    retries: output.retries,
    estimatedCostUsd: output.estimatedCostUsd,
    perClass,
  };
}

export function aggregateVerificationRuns(runs) {
  const metricKeys = Object.keys(runs[0].metrics).filter(
    (key) => typeof runs[0].metrics[key] === 'number',
  );
  const averages = Object.fromEntries(
    metricKeys.map((key) => [
      key,
      runs.reduce((sum, run) => sum + run.metrics[key], 0) / runs.length,
    ]),
  );
  const statuses = VERIFICATION_CASES.map((test) => {
    const values = runs.map(
      (run) =>
        run.output.findings.find((finding) => finding.candidateId === test.id)
          ?.sourceSupportStatus ?? 'missing',
    );
    return { candidateId: test.id, values, stable: new Set(values).size === 1 };
  });
  return {
    repetitions: runs.length,
    averages,
    anyCriticalFalseSupported: runs.some((run) => run.metrics.criticalFalseSupported > 0),
    anyCriticalFalseActive: runs.some((run) => run.metrics.criticalFalseActive > 0),
    anyMissedSupersedingAddendum: runs.some((run) => run.metrics.supersededRequirementAccuracy < 1),
    anyIncorrectDate: runs.some((run) => run.metrics.dateComparisonAccuracy < 1),
    anyIncorrectNumericalThreshold: runs.some((run) => run.metrics.numericalComparisonAccuracy < 1),
    anyInjectionInfluence: runs.some((run) => run.metrics.injectionInfluence > 0),
    stabilityRate: statuses.filter((item) => item.stable).length / statuses.length,
    statusStability: statuses,
  };
}
