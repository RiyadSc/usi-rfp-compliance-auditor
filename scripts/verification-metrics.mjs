import { validateEvidenceQuote } from '../packages/ai/src/deterministic-verification.ts';
import { finalMachineAssessmentSchema } from '../packages/ai/src/verification-v3-schemas.ts';
import {
  EXPECTED_DUPLICATE_PAIRS,
  FORBIDDEN_MERGE_PAIRS,
  OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS,
  OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
  VERIFICATION_CASES,
  VERIFICATION_CONTEXTS,
} from '../fixtures/eval/verification-cases.ts';

const SOURCE_STATUSES = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
];
export const VERIFICATION_EVALUATOR_VERSION = 'verification-evaluator-v3';
export const OUTPUT_BUDGET_PREQUALIFICATION_EVALUATOR_VERSION =
  'verification-output-budget-evaluator-v1';

const fixtureId = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EXPECTED_DATE_COMPARISONS = new Map([
  [fixtureId(1), 'match'],
  [fixtureId(4), 'match'],
  [fixtureId(8), 'match'],
  [fixtureId(9), 'mismatch'],
  [fixtureId(14), 'mismatch'],
]);
const EXPECTED_NUMBER_COMPARISONS = new Map([
  [fixtureId(6), 'uncertain'],
  [fixtureId(10), 'match'],
  [fixtureId(11), 'mismatch'],
  [fixtureId(12), 'match'],
  [fixtureId(13), 'match'],
  [fixtureId(23), 'match'],
  [fixtureId(24), 'match'],
]);
const expectedEntailment = (status) =>
  ({
    supported: 'entails',
    partially_supported: 'partially_entails',
    unsupported: 'insufficient',
    contradicted: 'contradicts',
    parser_uncertain: 'parser_uncertain',
  })[status];
const pairKey = (a, b) => [a, b].sort().join(':');
const pageMap = new Map(
  VERIFICATION_CONTEXTS.map((page) => [`${page.documentId}:${page.pageNumber}`, page]),
);
const ratio = (n, d) => n / Math.max(1, d);

export function deterministicComparisonOutcome(result, kind) {
  const comparisons = (result?.facts?.comparisons ?? []).filter(
    (comparison) => comparison.kind === kind,
  );
  if (!comparisons.length) return 'unavailable';
  if (comparisons.some((comparison) => comparison.comparison === 'mismatch')) return 'mismatch';
  if (comparisons.some((comparison) => comparison.comparison === 'uncertain')) return 'uncertain';
  return comparisons.every((comparison) => comparison.comparison === 'match')
    ? 'match'
    : 'unavailable';
}

function artifactSchemaAdherent(evaluation) {
  if (!Array.isArray(evaluation?.results) || !Array.isArray(evaluation?.duplicateResults))
    return false;
  if (evaluation.results.length !== VERIFICATION_CASES.length) return false;
  const ids = evaluation.results.map((result) => result?.candidate?.id).filter(Boolean);
  return ids.length === VERIFICATION_CASES.length && new Set(ids).size === ids.length;
}

function callTotals(results, key) {
  const calls = results.map((result) => result[key]).filter(Boolean);
  return {
    calls: calls.length,
    firstPassSchemaAdherence: ratio(
      calls.filter(
        (call) =>
          (call.firstPassSchemaAdherent ?? (call.repairAttempts === 0 && call.schemaAdherent)) &&
          !call.refused &&
          !call.incomplete,
      ).length,
      calls.length,
    ),
    schemaAdherence: ratio(
      calls.filter((call) => call.schemaAdherent && !call.refused && !call.incomplete).length,
      calls.length,
    ),
    latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
    inputTokens: calls.reduce((sum, call) => sum + call.promptTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.completionTokens, 0),
    reasoningTokens: calls.reduce((sum, call) => sum + call.reasoningTokens, 0),
    cachedTokens: calls.reduce((sum, call) => sum + call.cachedTokens, 0),
    retries: calls.reduce((sum, call) => sum + call.retries, 0),
    repairs: calls.reduce((sum, call) => sum + call.repairAttempts, 0),
    semanticChangingRepairs: calls.filter((call) => call.repairChangedSemanticMeaning).length,
    costUsd: calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0),
    refusalIncomplete: calls.filter((call) => call.refused || call.incomplete).length,
    incompleteReasons: Object.fromEntries(
      [...new Set(calls.map((call) => call.incompleteReason).filter(Boolean))].map((reason) => [
        reason,
        calls.filter((call) => call.incompleteReason === reason).length,
      ]),
    ),
  };
}

export function scoreOutputBudgetPrequalificationRun(evaluation) {
  const expectedCases = VERIFICATION_CASES.filter((item) =>
    OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS.includes(item.id),
  );
  const resultById = new Map(evaluation.results.map((result) => [result.candidate.id, result]));
  const candidateResults = expectedCases.map((test) => {
    const result = resultById.get(test.id);
    const final = result?.finalAssessment;
    const passA = result?.entailmentCall;
    const passB = result?.challengeCall;
    const passAClean = Boolean(
      passA?.schemaAdherent &&
      (passA?.firstPassSchemaAdherent ?? (passA?.repairAttempts === 0 && passA?.schemaAdherent)) &&
      !passA?.incomplete &&
      !passA?.refused &&
      passA?.repairAttempts === 0,
    );
    const passBRequired = result?.entailment?.classification === 'entails';
    const passBClean = !passBRequired
      ? passB == null
      : Boolean(
          passB?.schemaAdherent &&
          (passB?.firstPassSchemaAdherent ??
            (passB?.repairAttempts === 0 && passB?.schemaAdherent)) &&
          !passB?.incomplete &&
          !passB?.refused &&
          passB?.repairAttempts === 0,
        );
    const finalSchemaAdherent = finalMachineAssessmentSchema.safeParse(final).success;
    const statusCorrect = final?.sourceSupportStatus === test.expected.sourceSupportStatus;
    const precedenceCorrect = final?.precedenceStatus === test.expected.precedenceStatus;
    const proofCorrect = final?.proofRequirement === test.expected.proofRequirement;
    const noInjectionInfluence =
      !result?.entailment?.injectionInfluence && !result?.challenge?.injectionInfluence;
    return {
      candidateId: test.id,
      passAClean,
      passBClean,
      passBRequired,
      finalSchemaAdherent,
      statusCorrect,
      precedenceCorrect,
      proofCorrect,
      noInjectionInfluence,
      passed:
        passAClean &&
        passBClean &&
        finalSchemaAdherent &&
        statusCorrect &&
        precedenceCorrect &&
        proofCorrect &&
        noInjectionInfluence,
    };
  });
  const passATotals = callTotals(evaluation.results, 'entailmentCall');
  const passBTotals = callTotals(evaluation.results, 'challengeCall');
  const completeCandidateSet =
    evaluation.results.length === expectedCases.length &&
    candidateResults.every((result) => resultById.has(result.candidateId));
  const noDuplicateCalls = evaluation.duplicateResults.length === 0;
  return {
    version: OUTPUT_BUDGET_PREQUALIFICATION_EVALUATOR_VERSION,
    fixtureVersion: OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
    completeCandidateSet,
    noDuplicateCalls,
    candidateResults,
    passA: passATotals,
    passB: passBTotals,
    totals: {
      calls: passATotals.calls + passBTotals.calls,
      inputTokens: passATotals.inputTokens + passBTotals.inputTokens,
      outputTokens: passATotals.outputTokens + passBTotals.outputTokens,
      reasoningTokens: passATotals.reasoningTokens + passBTotals.reasoningTokens,
      cachedTokens: passATotals.cachedTokens + passBTotals.cachedTokens,
      latencyMs: passATotals.latencyMs + passBTotals.latencyMs,
      retries: passATotals.retries + passBTotals.retries,
      repairs: passATotals.repairs + passBTotals.repairs,
      estimatedCostUsd: passATotals.costUsd + passBTotals.costUsd,
    },
    passes:
      completeCandidateSet && noDuplicateCalls && candidateResults.every((result) => result.passed),
  };
}

export function scoreVerificationPipelineRun(evaluation) {
  const resultById = new Map(evaluation.results.map((result) => [result.candidate.id, result]));
  let passACorrect = 0,
    entailsTp = 0,
    entailsFp = 0,
    contradictionTp = 0,
    contradictionFp = 0,
    partialCorrect = 0,
    partialTotal = 0,
    insufficientCorrect = 0,
    insufficientTotal = 0,
    parserACorrect = 0,
    parserATotal = 0;
  let objectionTp = 0,
    objectionFn = 0,
    falseObjection = 0,
    noObjectionTotal = 0,
    missedQualification = 0,
    missedPrecedence = 0,
    missedContradiction = 0;
  const confusion = Object.fromEntries(
    SOURCE_STATUSES.map((status) => [status, { tp: 0, fp: 0, fn: 0 }]),
  );
  let finalCorrect = 0,
    supportedTp = 0,
    supportedFp = 0,
    criticalFalseSupported = 0,
    precedenceCorrect = 0,
    criticalFalseActive = 0,
    dateCorrect = 0,
    dateTotal = 0,
    numberCorrect = 0,
    numberTotal = 0,
    parserFinalCorrect = 0,
    parserFinalTotal = 0,
    proofCorrect = 0,
    quoteValid = 0,
    quoteTotal = 0,
    citationCorrect = 0,
    citationTotal = 0,
    retrievalHit = 0,
    retrievalTotal = 0,
    injectionInfluence = 0;

  for (const test of VERIFICATION_CASES) {
    const result = resultById.get(test.id);
    const expectedA = expectedEntailment(test.expected.sourceSupportStatus);
    const actualA = result?.entailment?.classification ?? 'missing';
    if (actualA === expectedA) passACorrect += 1;
    if (actualA === 'entails') {
      if (expectedA === 'entails') entailsTp += 1;
      else entailsFp += 1;
    }
    if (actualA === 'contradicts') {
      if (expectedA === 'contradicts') contradictionTp += 1;
      else contradictionFp += 1;
    }
    if (expectedA === 'partially_entails') {
      partialTotal += 1;
      if (actualA === expectedA) partialCorrect += 1;
    }
    if (expectedA === 'insufficient') {
      insufficientTotal += 1;
      if (actualA === expectedA) insufficientCorrect += 1;
    }
    if (expectedA === 'parser_uncertain') {
      parserATotal += 1;
      if (actualA === expectedA) parserACorrect += 1;
    }

    if (result?.challenge) {
      const objection = result.challenge.assessment !== 'no_material_objection';
      const shouldObject = test.expected.sourceSupportStatus !== 'supported';
      if (shouldObject && objection) objectionTp += 1;
      if (shouldObject && !objection) objectionFn += 1;
      if (!shouldObject) {
        noObjectionTotal += 1;
        if (objection) falseObjection += 1;
      }
      if (
        test.expected.sourceSupportStatus === 'partially_supported' &&
        result.challenge.assessment === 'no_material_objection'
      )
        missedQualification += 1;
      if (
        test.expected.precedenceStatus !== 'active' &&
        /active|controlling|final/i.test(test.obligation) &&
        result.challenge.assessment === 'no_material_objection'
      )
        missedPrecedence += 1;
      if (
        test.expected.sourceSupportStatus === 'contradicted' &&
        result.challenge.assessment === 'no_material_objection'
      )
        missedContradiction += 1;
    }

    const final = result?.finalAssessment;
    const actual = final?.sourceSupportStatus ?? 'missing';
    if (actual === test.expected.sourceSupportStatus) finalCorrect += 1;
    for (const status of SOURCE_STATUSES) {
      if (actual === status && test.expected.sourceSupportStatus === status)
        confusion[status].tp += 1;
      else if (actual === status) confusion[status].fp += 1;
      else if (test.expected.sourceSupportStatus === status) confusion[status].fn += 1;
    }
    if (actual === 'supported') {
      if (test.expected.sourceSupportStatus === 'supported') supportedTp += 1;
      else supportedFp += 1;
    }
    if (
      test.expected.critical &&
      actual === 'supported' &&
      test.expected.sourceSupportStatus !== 'supported'
    )
      criticalFalseSupported += 1;
    if (final?.precedenceStatus === test.expected.precedenceStatus) precedenceCorrect += 1;
    if (
      test.expected.critical &&
      final?.precedenceStatus === 'active' &&
      test.expected.precedenceStatus !== 'active'
    )
      criticalFalseActive += 1;
    if (test.expected.dateCase) {
      dateTotal += 1;
      if (deterministicComparisonOutcome(result, 'date') === EXPECTED_DATE_COMPARISONS.get(test.id))
        dateCorrect += 1;
    }
    if (test.expected.numberCase) {
      numberTotal += 1;
      if (
        deterministicComparisonOutcome(result, 'number') ===
        EXPECTED_NUMBER_COMPARISONS.get(test.id)
      )
        numberCorrect += 1;
    }
    if (test.expected.sourceSupportStatus === 'parser_uncertain') {
      parserFinalTotal += 1;
      if (actual === 'parser_uncertain') parserFinalCorrect += 1;
    }
    if (final?.proofRequirement === test.expected.proofRequirement) proofCorrect += 1;
    if (actual === 'supported') {
      if (!(final?.supportingEvidence ?? []).length) {
        quoteTotal += 1;
        citationTotal += 1;
      }
      for (const reference of final?.supportingEvidence ?? []) {
        quoteTotal += 1;
        citationTotal += 1;
        const page = pageMap.get(`${reference.documentId}:${reference.pageNumber}`);
        if (page && test.expected.pages.includes(reference.pageNumber)) citationCorrect += 1;
        if (
          page &&
          ['exact', 'normalized_exact'].includes(
            validateEvidenceQuote(page.text, reference.quote).matchType,
          )
        )
          quoteValid += 1;
      }
    }
    for (const pageNumber of test.expected.pages) {
      retrievalTotal += 1;
      if (result?.contexts.some((context) => context.pageNumber === pageNumber)) retrievalHit += 1;
    }
    if (
      result?.entailment?.injectionInfluence ||
      result?.challenge?.injectionInfluence ||
      (test.id.endsWith('000022') && actual === 'supported')
    )
      injectionInfluence += 1;
  }

  const perClass = SOURCE_STATUSES.map((status) => {
    const entry = confusion[status];
    const precision = ratio(entry.tp, entry.tp + entry.fp);
    const recall = ratio(entry.tp, entry.tp + entry.fn);
    return { status, precision, recall, f1: ratio(2 * precision * recall, precision + recall) };
  });
  const proposed = new Map(
    evaluation.duplicateResults
      .filter((pair) => pair.result)
      .map((pair) => [pairKey(pair.sourceId, pair.targetId), pair.result.relationshipType]),
  );
  const expectedPairs = new Set(EXPECTED_DUPLICATE_PAIRS.map(([a, b]) => pairKey(a, b)));
  const duplicatePositive = [...proposed].filter(([, type]) =>
    ['exact_duplicate', 'semantic_duplicate', 'restatement', 'parent_child'].includes(type),
  );
  const duplicateTp = duplicatePositive.filter(([key]) => expectedPairs.has(key)).length;
  const falseMergeCount = FORBIDDEN_MERGE_PAIRS.filter(([a, b]) =>
    duplicatePositive.some(([key]) => key === pairKey(a, b)),
  ).length;
  const passATotals = callTotals(evaluation.results, 'entailmentCall');
  const passBTotals = callTotals(evaluation.results, 'challengeCall');
  const duplicateCalls = callTotals(evaluation.duplicateResults, 'call');
  const decisionSchemaAdherence = ratio(
    evaluation.results.filter(
      (result) => finalMachineAssessmentSchema.safeParse(result.finalAssessment).success,
    ).length,
    VERIFICATION_CASES.length,
  );
  const evaluationArtifactSchemaAdherence = artifactSchemaAdherent(evaluation) ? 1 : 0;
  const allLayerSchemaAdherence =
    passATotals.schemaAdherence === 1 &&
    passBTotals.schemaAdherence === 1 &&
    duplicateCalls.schemaAdherence === 1 &&
    decisionSchemaAdherence === 1 &&
    evaluationArtifactSchemaAdherence === 1
      ? 1
      : 0;
  const allCost = passATotals.costUsd + passBTotals.costUsd + duplicateCalls.costUsd;

  return {
    passA: {
      entailmentClassAccuracy: ratio(passACorrect, VERIFICATION_CASES.length),
      entailsPrecision: ratio(entailsTp, entailsTp + entailsFp),
      contradictionPrecision: ratio(contradictionTp, contradictionTp + contradictionFp),
      partialEntailmentAccuracy: ratio(partialCorrect, partialTotal),
      insufficientEvidenceAccuracy: ratio(insufficientCorrect, insufficientTotal),
      parserUncertainAccuracy: ratio(parserACorrect, parserATotal),
      ...passATotals,
    },
    passB: {
      objectionDetectionRecall:
        objectionTp + objectionFn === 0 ? 1 : ratio(objectionTp, objectionTp + objectionFn),
      falseObjectionRate: ratio(falseObjection, noObjectionTotal),
      missedMaterialQualificationCount: missedQualification,
      missedPrecedenceProblemCount: missedPrecedence,
      missedContradictionCount: missedContradiction,
      ...passBTotals,
    },
    final: {
      evaluatorVersion: VERIFICATION_EVALUATOR_VERSION,
      totalCases: VERIFICATION_CASES.length,
      sourceStatusAccuracy: ratio(finalCorrect, VERIFICATION_CASES.length),
      supportedPrecision: ratio(supportedTp, supportedTp + supportedFp),
      criticalFalseSupported,
      precedenceAccuracy: ratio(precedenceCorrect, VERIFICATION_CASES.length),
      criticalFalseActive,
      dateAccuracy: ratio(dateCorrect, dateTotal),
      numberAccuracy: ratio(numberCorrect, numberTotal),
      quoteValidity: ratio(quoteValid, quoteTotal),
      citationAccuracy: ratio(citationCorrect, citationTotal),
      retrievalRecall: ratio(retrievalHit, retrievalTotal),
      parserUncertainAccuracy: ratio(parserFinalCorrect, parserFinalTotal),
      proofRequirementAccuracy: ratio(proofCorrect, VERIFICATION_CASES.length),
      duplicatePrecision: ratio(duplicateTp, duplicatePositive.length),
      duplicateRecall: ratio(duplicateTp, expectedPairs.size),
      falseMergeCount,
      injectionInfluence,
      schemaAdherence:
        decisionSchemaAdherence === 1 && evaluationArtifactSchemaAdherence === 1 ? 1 : 0,
      allLayerSchemaAdherence,
      schemaLayers: {
        passA: passATotals.schemaAdherence,
        passB: passBTotals.schemaAdherence,
        duplicateClassifier: duplicateCalls.schemaAdherence,
        decisionEngine: decisionSchemaAdherence,
        evaluationArtifact: evaluationArtifactSchemaAdherence,
      },
      firstPassSchemaLayers: {
        passA: passATotals.firstPassSchemaAdherence,
        passB: passBTotals.firstPassSchemaAdherence,
        duplicateClassifier: duplicateCalls.firstPassSchemaAdherence,
      },
      refusalIncompleteCount:
        passATotals.refusalIncomplete +
        passBTotals.refusalIncomplete +
        duplicateCalls.refusalIncomplete,
      perClass,
      finalStatusVector: VERIFICATION_CASES.map((test) => ({
        candidateId: test.id,
        passA: resultById.get(test.id)?.entailment?.classification ?? 'missing',
        passB:
          resultById.get(test.id)?.challenge?.assessment ??
          (resultById.get(test.id)?.failedStage === 'challenge' ? 'failed' : 'not_invoked'),
        status: resultById.get(test.id)?.finalAssessment?.sourceSupportStatus ?? 'missing',
        precedence: resultById.get(test.id)?.finalAssessment?.precedenceStatus ?? 'undetermined',
        dateComparison: deterministicComparisonOutcome(resultById.get(test.id), 'date'),
        numberComparison: deterministicComparisonOutcome(resultById.get(test.id), 'number'),
      })),
    },
    totals: {
      calls: passATotals.calls + passBTotals.calls + duplicateCalls.calls,
      inputTokens: passATotals.inputTokens + passBTotals.inputTokens + duplicateCalls.inputTokens,
      outputTokens:
        passATotals.outputTokens + passBTotals.outputTokens + duplicateCalls.outputTokens,
      reasoningTokens:
        passATotals.reasoningTokens + passBTotals.reasoningTokens + duplicateCalls.reasoningTokens,
      cachedTokens:
        passATotals.cachedTokens + passBTotals.cachedTokens + duplicateCalls.cachedTokens,
      latencyMs: passATotals.latencyMs + passBTotals.latencyMs + duplicateCalls.latencyMs,
      retries: passATotals.retries + passBTotals.retries + duplicateCalls.retries,
      repairs: passATotals.repairs + passBTotals.repairs + duplicateCalls.repairs,
      estimatedCostUsd: allCost,
    },
  };
}

export function aggregateVerificationPipelineRuns(runs) {
  const statuses = VERIFICATION_CASES.map((test) => {
    const values = runs.map(
      (run) =>
        run.metrics.final.finalStatusVector.find((item) => item.candidateId === test.id)?.status ??
        'missing',
    );
    const precedence = runs.map(
      (run) =>
        run.metrics.final.finalStatusVector.find((item) => item.candidateId === test.id)
          ?.precedence ?? 'undetermined',
    );
    return {
      candidateId: test.id,
      statusValues: values,
      precedenceValues: precedence,
      stable: new Set(values).size === 1 && new Set(precedence).size === 1,
    };
  });
  const avg = (path) => {
    const [group, key] = path.split('.');
    return runs.reduce((sum, run) => sum + run.metrics[group][key], 0) / runs.length;
  };
  return {
    repetitions: runs.length,
    averages: {
      passAEntailmentClassAccuracy: avg('passA.entailmentClassAccuracy'),
      passAEntailsPrecision: avg('passA.entailsPrecision'),
      passBObjectionDetectionRecall: avg('passB.objectionDetectionRecall'),
      passBFalseObjectionRate: avg('passB.falseObjectionRate'),
      sourceStatusAccuracy: avg('final.sourceStatusAccuracy'),
      supportedPrecision: avg('final.supportedPrecision'),
      precedenceAccuracy: avg('final.precedenceAccuracy'),
      dateAccuracy: avg('final.dateAccuracy'),
      numberAccuracy: avg('final.numberAccuracy'),
      quoteValidity: avg('final.quoteValidity'),
      citationAccuracy: avg('final.citationAccuracy'),
      parserUncertainAccuracy: avg('final.parserUncertainAccuracy'),
      proofRequirementAccuracy: avg('final.proofRequirementAccuracy'),
      duplicatePrecision: avg('final.duplicatePrecision'),
      duplicateRecall: avg('final.duplicateRecall'),
      costUsd: avg('totals.estimatedCostUsd'),
      latencyMs: avg('totals.latencyMs'),
    },
    anyCriticalFalseSupported: runs.some((run) => run.metrics.final.criticalFalseSupported > 0),
    anyCriticalFalseActive: runs.some((run) => run.metrics.final.criticalFalseActive > 0),
    anyIncorrectDate: runs.some((run) => run.metrics.final.dateAccuracy < 1),
    anyIncorrectNumber: runs.some((run) => run.metrics.final.numberAccuracy < 1),
    anyInvalidQuote: runs.some((run) => run.metrics.final.quoteValidity < 1),
    anyInvalidCitation: runs.some((run) => run.metrics.final.citationAccuracy < 1),
    anyFalseMerge: runs.some((run) => run.metrics.final.falseMergeCount > 0),
    anyInjectionInfluence: runs.some((run) => run.metrics.final.injectionInfluence > 0),
    anySchemaFailure: runs.some((run) => run.metrics.final.allLayerSchemaAdherence < 1),
    stabilityRate: ratio(statuses.filter((item) => item.stable).length, statuses.length),
    statusStability: statuses,
  };
}
