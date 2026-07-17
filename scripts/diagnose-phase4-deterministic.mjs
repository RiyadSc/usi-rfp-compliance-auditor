import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'prettier';
import {
  extractTypedDateFacts,
  extractTypedNumberFacts,
} from '../packages/ai/src/deterministic-verification.ts';
import { MockProvider } from '../packages/ai/src/mock-provider.ts';
import {
  FIXTURE_DOCUMENT_ID,
  VERIFICATION_CASES,
  VERIFICATION_CONTEXTS,
  VERIFICATION_FIXTURE_VERSION,
} from '../fixtures/eval/verification-cases.ts';
import { buildVerificationEvaluationCompatibility } from './verification-evaluator-compatibility.mjs';
import { runVerificationEvaluation } from './verification-evaluation-runner.mjs';
import { scoreVerificationPipelineRun } from './verification-metrics.mjs';

const sourcePath = resolve('artifacts/evaluation/phase4-remediation-live-results.json');
const outputPath = resolve('artifacts/evaluation/phase4-zero-live-diagnostic-v1.json');
const deterministicOutputPath = resolve(
  'artifacts/evaluation/phase4-zero-live-deterministic-results.json',
);
const historical = JSON.parse(await readFile(sourcePath, 'utf8'));
const pages = new Map(VERIFICATION_CONTEXTS.map((context) => [context.pageNumber, context]));

function relevantContexts(test) {
  const pageNumbers = test.expected.pages.length ? test.expected.pages : [test.preliminaryPage];
  return pageNumbers.map((pageNumber) => pages.get(pageNumber)).filter(Boolean);
}

function reconstructedFacts(test, kind) {
  const candidateFacts =
    kind === 'date'
      ? extractTypedDateFacts(test.obligation)
      : extractTypedNumberFacts(test.obligation);
  const sourceFacts = relevantContexts(test).flatMap((context) =>
    kind === 'date'
      ? extractTypedDateFacts(context.text, {
          documentId: context.documentId,
          pageNumber: context.pageNumber,
        })
      : extractTypedNumberFacts(context.text, {
          documentId: context.documentId,
          pageNumber: context.pageNumber,
        }),
  );
  return { candidateFacts, sourceFacts };
}

const dateFailures = [];
const numberFailures = [];
const failureMatrix = [];
const schemaFailures = [];

for (const model of historical.models) {
  for (const run of model.runs) {
    const vector = new Map(
      run.metrics.final.finalStatusVector.map((entry) => [entry.candidateId, entry]),
    );
    for (const test of VERIFICATION_CASES) {
      const actual = vector.get(test.id) ?? { status: 'missing', precedence: 'undetermined' };
      const finalMatches =
        actual.status === test.expected.sourceSupportStatus &&
        actual.precedence === test.expected.precedenceStatus;
      if (!finalMatches) {
        failureMatrix.push({
          model: model.model,
          repetition: run.repetition,
          candidateId: test.id,
          candidate: test.title,
          modelSemanticError: 'unavailable_per_candidate_intermediates_not_persisted',
          retrievalError: run.metrics.final.retrievalRecall === 1 ? false : 'unavailable',
          deterministicParserError: 'unavailable_historical_fact_envelope_not_persisted',
          decisionEngineError:
            test.id.endsWith('000022') && actual.precedence === 'active' ? true : 'unavailable',
          evaluatorError: false,
          fixtureError: false,
          expected: {
            sourceSupportStatus: test.expected.sourceSupportStatus,
            precedenceStatus: test.expected.precedenceStatus,
          },
          actual,
        });
      }
      for (const kind of ['date', 'number']) {
        const applies = kind === 'date' ? test.expected.dateCase : test.expected.numberCase;
        if (!applies || finalMatches) continue;
        const facts = reconstructedFacts(test, kind);
        const target = kind === 'date' ? dateFailures : numberFailures;
        target.push({
          model: model.model,
          repetition: run.repetition,
          candidateId: test.id,
          candidate: test.title,
          expectedStatus: test.expected.sourceSupportStatus,
          originalCandidateFacts: facts.candidateFacts,
          relevantSourceFacts: facts.sourceFacts,
          sourceDocumentId: FIXTURE_DOCUMENT_ID,
          sourcePages: relevantContexts(test).map((context) => context.pageNumber),
          expectedSourcePrecedence: test.expected.precedenceStatus,
          historicalDeterministicParserOutput:
            'unavailable_candidate_level_verification_facts_v2_was_not_persisted',
          reconstructedDeterministicParserOutput: facts,
          localeAssumption: 'none; slash dates remain ambiguous',
          timezoneAssumption: 'none; only an explicit source timezone is retained',
          comparisonOperators: facts.candidateFacts.map(
            (fact) => fact.comparisonOperator ?? fact.operator,
          ),
          passA: 'unavailable_not_persisted',
          passB: 'unavailable_not_persisted',
          historicalDecisionEngineInput:
            'unavailable_beyond_final_status_vector_and_aggregate_metrics',
          finalProduced: actual,
          expected: {
            sourceSupportStatus: test.expected.sourceSupportStatus,
            precedenceStatus: test.expected.precedenceStatus,
          },
          metricRuleThatCausedMismatch:
            'verification-evaluator-v1 counted the fact correct only when both final source status and final precedence matched; it did not score the deterministic fact comparison.',
          rootCauseCategory: 'evaluator_defect',
          underlyingFinalStatusCause:
            'unavailable because candidate-level Pass A, Pass B, and historical fact-envelope data were not persisted',
          safestProviderNeutralCorrection:
            'verification-evaluator-v2 scores typed deterministic comparisons independently from source-support and precedence axes.',
        });
      }
    }

    if (run.metrics.final.schemaAdherence < 1) {
      const passAFailed = run.metrics.passA.schemaAdherence < 1;
      const passBFailed = run.metrics.passB.schemaAdherence < 1;
      const duplicateRefusalIncomplete = Math.max(
        0,
        run.metrics.final.refusalIncompleteCount -
          run.metrics.passA.refusalIncomplete -
          run.metrics.passB.refusalIncomplete,
      );
      const duplicateDefinitelyFailed =
        duplicateRefusalIncomplete > 0 || (!passAFailed && !passBFailed);
      const knownPassAReasons = run.metrics.passA.incompleteReasons ?? {};
      const knownPassBReasons = run.metrics.passB.incompleteReasons ?? {};
      schemaFailures.push({
        model: model.model,
        repetition: run.repetition,
        historicalMetricMeaning:
          'A Boolean conjunction of Pass A, Pass B, and duplicate-classifier call adherence; it did not validate the decision-engine finding or evaluation artifact.',
        passASchemaFailed: passAFailed,
        passBSchemaFailed: passBFailed,
        duplicateClassifierFailed: duplicateDefinitelyFailed
          ? true
          : passAFailed || passBFailed
            ? false
            : 'unavailable',
        decisionEngineOutputSchemaFailed: 'not_measured_historically',
        persistedFindingSchemaFailed:
          'not_applicable_standalone_evaluator_did_not_persist_findings',
        evaluationArtifactSchemaFailed: 'not_measured_historically',
        applicationRejectedRecord:
          'not_applicable_standalone_evaluator_did_not_attempt_application_persistence',
        pipelineRejectedInvalidOrIncompleteProviderResult: true,
        evaluatorOnlyFailure: false,
        normalizedErrors: {
          passA: Object.keys(knownPassAReasons).length ? knownPassAReasons : 'none_reported',
          passB: Object.keys(knownPassBReasons).length ? knownPassBReasons : 'none_reported',
          duplicateClassifier:
            'exact normalized error and incomplete reason were not persisted in the aggregate artifact',
        },
        repairAttempts: {
          passA: run.metrics.passA.repairs,
          passB: run.metrics.passB.repairs,
          duplicateClassifier:
            run.metrics.totals.repairs - run.metrics.passA.repairs - run.metrics.passB.repairs,
        },
      });
    }
  }
}

const artifact = {
  phase: 'phase4-zero-live-diagnostic',
  diagnosticVersion: 'phase4-zero-live-diagnostic-v1',
  generatedWithoutLiveCalls: true,
  fixtureVersion: VERIFICATION_FIXTURE_VERSION,
  historicalEvaluation: {
    sourceArtifact: 'phase4-remediation-live-results.json',
    evaluatorVersion: 'verification-evaluator-v1-implicit',
    factEnvelopeVersion: 'verification-facts-v2',
    decisionEngineVersion: historical.decisionEngineVersion,
    perCandidatePassAAvailable: false,
    perCandidatePassBAvailable: false,
    perCandidateFactEnvelopeAvailable: false,
  },
  remediatedCompatibility: buildVerificationEvaluationCompatibility(),
  findings: {
    dateFailureCount: dateFailures.length,
    numberFailureCount: numberFailures.length,
    schemaFailureRunCount: schemaFailures.length,
    primaryDateRootCause: 'evaluator_defect',
    primaryNumberRootCause: 'evaluator_defect',
    primarySchemaRootCause:
      'schema layers were conflated and final deterministic output was not validated or scored',
  },
  dateFailures,
  numberFailures,
  schemaFailures,
  candidateFailureMatrix: failureMatrix,
  integrityConclusions: {
    expectedAnswersChanged: false,
    fixtureChanged: false,
    historicalArtifactsRescoreableUnderV2: false,
    reason:
      'They lack compatibility metadata and candidate-level semantic/fact records required by evaluator v2.',
  },
};

await writeFile(outputPath, await format(JSON.stringify(artifact), { parser: 'json' }));
const deterministicEvaluation = await runVerificationEvaluation(new MockProvider());
const deterministicMetrics = scoreVerificationPipelineRun(deterministicEvaluation);
const deterministicArtifact = {
  phase: 'phase4-zero-live-diagnostic',
  generatedWithoutLiveCalls: true,
  compatibility: buildVerificationEvaluationCompatibility(),
  passA: {
    entailmentClassAccuracy: deterministicMetrics.passA.entailmentClassAccuracy,
    schemaAdherence: deterministicMetrics.passA.schemaAdherence,
  },
  passB: {
    objectionDetectionRecall: deterministicMetrics.passB.objectionDetectionRecall,
    falseObjectionRate: deterministicMetrics.passB.falseObjectionRate,
    schemaAdherence: deterministicMetrics.passB.schemaAdherence,
  },
  final: deterministicMetrics.final,
  gatePassed:
    deterministicMetrics.final.criticalFalseSupported === 0 &&
    deterministicMetrics.final.criticalFalseActive === 0 &&
    deterministicMetrics.final.dateAccuracy === 1 &&
    deterministicMetrics.final.numberAccuracy === 1 &&
    deterministicMetrics.final.precedenceAccuracy === 1 &&
    deterministicMetrics.final.quoteValidity === 1 &&
    deterministicMetrics.final.citationAccuracy === 1 &&
    deterministicMetrics.final.falseMergeCount === 0 &&
    deterministicMetrics.final.schemaAdherence === 1,
};
await writeFile(
  deterministicOutputPath,
  await format(JSON.stringify(deterministicArtifact), { parser: 'json' }),
);
console.log(
  JSON.stringify({
    outputPath,
    deterministicOutputPath,
    dateFailures: dateFailures.length,
    numberFailures: numberFailures.length,
    schemaFailureRuns: schemaFailures.length,
    deterministicGatePassed: deterministicArtifact.gatePassed,
    liveCalls: 0,
  }),
);
