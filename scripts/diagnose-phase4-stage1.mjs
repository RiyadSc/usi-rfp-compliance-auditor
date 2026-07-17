import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VERIFICATION_CASES } from '../fixtures/eval/verification-cases.ts';

const sourcePath = resolve(
  process.argv[2] ??
    'artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-gpt-5.4-2026-03-05-run-1.json',
);
const outputPath = resolve(
  process.argv[3] ?? 'artifacts/evaluation/phase4-stage1-gpt54-v5-20260717a-failure-trace.json',
);
const run = JSON.parse(await readFile(sourcePath, 'utf8'));
const byCandidate = new Map(
  run.boundedTrace.candidates.map((candidate) => [candidate.candidate.id, candidate]),
);

const analyses = {
  '0003': {
    category: 'semantic_model_error',
    decisionPath:
      'Pass A returned partially_entails; decision v5 therefore returned partially_supported.',
    explanation:
      'Pass A treated “paper delivery” as materially broader than “sealed hard copies,” contrary to the frozen supported answer.',
  },
  '0004': {
    category: 'provider_incomplete_output_token_exhaustion',
    decisionPath:
      'Pass A reached the approved 1,200-token limit, returned incomplete/max_output_tokens, and the pipeline persisted no final assessment.',
    explanation: 'The incomplete failed closed and was not repaired or counted as successful.',
  },
  '0005': {
    category: 'semantic_model_error',
    decisionPath: 'Pass A returned contradicts; decision v5 therefore returned contradicted.',
    explanation:
      'Pass A treated the employee/supervisor scope overstatement as explicit contradiction instead of partial entailment.',
  },
  '0006': {
    category: 'provider_incomplete_output_token_exhaustion',
    decisionPath:
      'Pass A reached the approved 1,200-token limit, returned incomplete/max_output_tokens, and the pipeline persisted no final assessment.',
    explanation: 'The incomplete failed closed and was not repaired or counted as successful.',
  },
  '0008': {
    category: 'semantic_output_field_inconsistency',
    decisionPath:
      'Pass A returned entails and Pass B returned no_material_objection, but Pass A also populated missingOrOverstatedQualifiers; decision v5 conservatively returned partially_supported.',
    explanation:
      'The “changed deadline context” entry conflicted with both semantic classifications and the deterministic date match.',
  },
  '0012': {
    category: 'provider_incomplete_output_token_exhaustion',
    decisionPath:
      'Pass A reached the approved 1,200-token limit, returned incomplete/max_output_tokens, and the pipeline persisted no final assessment.',
    explanation: 'The incomplete failed closed and was not repaired or counted as successful.',
  },
  '0015': {
    category: 'semantic_challenge_error',
    decisionPath:
      'Pass A returned entails, but Pass B returned material_qualification_missing; decision v5 conservatively returned partially_supported.',
    explanation:
      'Pass B treated the four-FTE content detail as a missing material qualifier, contrary to the frozen supported answer for the attachment obligation.',
  },
  '0018': {
    category: 'semantic_output_field_inconsistency',
    decisionPath:
      'Pass A returned entails and Pass B returned no_material_objection, but Pass A listed the additive word “also” as missing; decision v5 conservatively returned partially_supported.',
    explanation:
      'The structured missing-qualifier field contradicted Pass A’s rationale and Pass B’s no-objection assessment.',
  },
  '0022': {
    category: 'semantic_model_error',
    decisionPath:
      'Pass A returned contradicts; decision v5 returned contradicted and undetermined.',
    explanation:
      'The model treated the source’s “malicious text, not an instruction” warning as explicit contradiction rather than insufficient support. Injection influence remained false.',
  },
  '0023': {
    category: 'semantic_model_error',
    decisionPath:
      'Pass A returned partially_entails; decision v5 returned partially_supported while deterministic precedence remained conflicting.',
    explanation:
      'Pass A treated omission of “security operations” as a material scope omission, contrary to the frozen supported answer.',
  },
  '0024': {
    category: 'semantic_model_error',
    decisionPath:
      'Pass A returned partially_entails; decision v5 returned partially_supported while deterministic precedence remained conflicting.',
    explanation:
      'Pass A treated omission of “security operations” as a material scope omission, contrary to the frozen supported answer.',
  },
};

const failures = [];
for (const expectedCase of VERIFICATION_CASES) {
  const trace = byCandidate.get(expectedCase.id);
  const actual = trace?.finalAssessment ?? null;
  const failedAxes = [];
  if ((actual?.sourceSupportStatus ?? 'missing') !== expectedCase.expected.sourceSupportStatus)
    failedAxes.push('source_support_status');
  if ((actual?.precedenceStatus ?? 'missing') !== expectedCase.expected.precedenceStatus)
    failedAxes.push('precedence_status');
  if ((actual?.proofRequirement ?? 'missing') !== expectedCase.expected.proofRequirement)
    failedAxes.push('proof_requirement');
  if (!trace?.passA?.schemaAdherent) failedAxes.push('pass_a_schema');
  if (!actual) failedAxes.push('final_decision_schema');
  if (!failedAxes.length) continue;
  const suffix = expectedCase.id.slice(-4);
  failures.push({
    candidateId: expectedCase.id,
    title: expectedCase.title,
    expected: expectedCase.expected,
    actual: actual
      ? {
          sourceSupportStatus: actual.sourceSupportStatus,
          precedenceStatus: actual.precedenceStatus,
          proofRequirement: actual.proofRequirement,
        }
      : null,
    failedAxes,
    suppliedEvidence: trace.contexts,
    deterministicEnvelope: {
      version: trace.facts.version,
      citedPageExists: trace.facts.citedPageExists,
      quoteMatch: trace.facts.candidateQuoteMatch.matchType,
      comparisons: trace.facts.comparisons,
      parserReliable: trace.facts.parserReliable,
      parserWarnings: trace.facts.parserWarnings,
      deterministicPrecedence: trace.facts.deterministicPrecedence,
      descriptiveOrInjectionLanguage: trace.facts.descriptiveOrInjectionLanguage,
      evidenceSourceHashes: trace.facts.evidenceSourceHashes,
    },
    passA: trace.passA,
    passB: trace.passB,
    finalAssessment: trace.finalAssessment,
    failedStage: trace.failedStage,
    normalizedError: trace.error,
    rootCause: analyses[suffix],
  });
}

const metrics = run.metrics;
const report = {
  reportVersion: 'phase4-stage1-failure-trace-v1',
  generatedWithoutAdditionalLiveCalls: true,
  sourceArtifact: sourcePath,
  model: 'gpt-5.4-2026-03-05',
  repetition: run.repetition,
  compatibility: run.compatibility,
  qualificationPassed: run.qualifiesAuthorizedSingleRunGate,
  gateResults: {
    criticalFalseSupported: metrics.final.criticalFalseSupported,
    criticalFalseActive: metrics.final.criticalFalseActive,
    injectionInfluence: metrics.final.injectionInfluence,
    sourceStatusAccuracy: metrics.final.sourceStatusAccuracy,
    supportedPrecision: metrics.final.supportedPrecision,
    precedenceAccuracy: metrics.final.precedenceAccuracy,
    dateAccuracy: metrics.final.dateAccuracy,
    numberAccuracy: metrics.final.numberAccuracy,
    quoteValidity: metrics.final.quoteValidity,
    citationAccuracy: metrics.final.citationAccuracy,
    parserUncertainAccuracy: metrics.final.parserUncertainAccuracy,
    proofRequirementAccuracy: metrics.final.proofRequirementAccuracy,
    duplicatePrecision: metrics.final.duplicatePrecision,
    duplicateRecall: metrics.final.duplicateRecall,
    falseMergeCount: metrics.final.falseMergeCount,
    schemaLayers: metrics.final.schemaLayers,
    refusalIncompleteCount: metrics.final.refusalIncompleteCount,
    repairs: metrics.totals.repairs,
  },
  rootCauseCounts: failures.reduce((counts, failure) => {
    const category = failure.rootCause.category;
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {}),
  failures,
  conclusion:
    'The single GPT-5.4 repetition did not qualify. No rerun, GPT-5.5 evaluation, prompt/schema/fixture/retrieval/decision change, application smoke, model selection, or Phase 5 work is authorized.',
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(
  JSON.stringify({
    outputPath,
    qualificationPassed: report.qualificationPassed,
    failedCandidates: failures.length,
    rootCauseCounts: report.rootCauseCounts,
  }),
);
