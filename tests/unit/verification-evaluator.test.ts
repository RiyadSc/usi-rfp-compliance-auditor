import { beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../../packages/ai/src/mock-provider';
import { finalMachineAssessmentSchema } from '../../packages/ai/src/verification-v3-schemas';
import {
  OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS,
  OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
} from '../../fixtures/eval/verification-cases';
// @ts-expect-error The evaluator is intentionally an executable JavaScript module shared with the CLI.
import { runVerificationEvaluation } from '../../scripts/verification-evaluation-runner.mjs';
// @ts-expect-error The evaluator is intentionally an executable JavaScript module shared with the CLI.
import {
  deterministicComparisonOutcome,
  scoreOutputBudgetPrequalificationRun,
  scoreVerificationPipelineRun,
  VERIFICATION_EVALUATOR_VERSION,
} from '../../scripts/verification-metrics.mjs';
// @ts-expect-error Compatibility is tested at the same JavaScript boundary used by the live CLI.
import {
  buildVerificationEvaluationCompatibility,
  fingerprintVerificationEvaluationCompatibility,
  isResumableRunCompatible,
} from '../../scripts/verification-evaluator-compatibility.mjs';

let baseline: Awaited<ReturnType<typeof runVerificationEvaluation>>;
let outputBudgetBaseline: Awaited<ReturnType<typeof runVerificationEvaluation>>;

beforeAll(async () => {
  baseline = await runVerificationEvaluation(new MockProvider());
  outputBudgetBaseline = await runVerificationEvaluation(new MockProvider(), {
    candidateIds: OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS,
    includeDuplicates: false,
  });
});

describe('verification evaluator v3 integrity', () => {
  it('scores all frozen deterministic axes independently', () => {
    const metrics = scoreVerificationPipelineRun(baseline);
    expect(metrics.final).toMatchObject({
      evaluatorVersion: VERIFICATION_EVALUATOR_VERSION,
      sourceStatusAccuracy: 1,
      precedenceAccuracy: 1,
      dateAccuracy: 1,
      numberAccuracy: 1,
      schemaAdherence: 1,
      allLayerSchemaAdherence: 1,
      firstPassSchemaLayers: {
        passA: 1,
        passB: 1,
        duplicateClassifier: 1,
      },
    });
  });

  it('does not turn a semantic status error into a date error', () => {
    const evaluation = structuredClone(baseline);
    evaluation.results[0].finalAssessment.sourceSupportStatus = 'partially_supported';
    const metrics = scoreVerificationPipelineRun(evaluation);
    expect(metrics.final.sourceStatusAccuracy).toBeLessThan(1);
    expect(metrics.final.dateAccuracy).toBe(1);
  });

  it('does not hide a deterministic date mismatch behind a correct status', () => {
    const evaluation = structuredClone(baseline);
    const dateComparison = evaluation.results[0].facts.comparisons.find(
      (comparison) => comparison.kind === 'date',
    );
    dateComparison.comparison = 'mismatch';
    expect(deterministicComparisonOutcome(evaluation.results[0], 'date')).toBe('mismatch');
    const metrics = scoreVerificationPipelineRun(evaluation);
    expect(metrics.final.sourceStatusAccuracy).toBe(1);
    expect(metrics.final.dateAccuracy).toBeLessThan(1);
  });

  it('measures provider, decision, and artifact schemas at separate layers', () => {
    const evaluation = structuredClone(baseline);
    evaluation.results[0].finalAssessment.machineOnly = false;
    const metrics = scoreVerificationPipelineRun(evaluation);
    expect(metrics.final.schemaLayers.passA).toBe(1);
    expect(metrics.final.schemaLayers.passB).toBe(1);
    expect(metrics.final.schemaLayers.decisionEngine).toBeLessThan(1);
    expect(metrics.final.schemaAdherence).toBe(0);
    expect(
      finalMachineAssessmentSchema.safeParse(evaluation.results[0].finalAssessment).success,
    ).toBe(false);
  });

  it('rejects resumed artifacts from incompatible evaluator semantics', () => {
    const compatibility = buildVerificationEvaluationCompatibility();
    expect(compatibility).toMatchObject({
      parentChildRelationshipVersion: 'atomic-parent-child-v1',
      evaluationMode: 'full',
      reasoning: 'low',
      maxContextsPerCandidate: 2,
      outputLimits: { entailment: 1800, challenge: 1600, duplicate: 600 },
      structuredAnswerMaxTokens: { entailment: 500, challenge: 650 },
      timeoutMs: 90_000,
      providerContract: { api: 'responses', store: false, tools: false, maxRepairAttempts: 1 },
    });
    expect(fingerprintVerificationEvaluationCompatibility(compatibility)).toMatch(/^[a-f0-9]{64}$/);
    expect(
      isResumableRunCompatible({ metrics: { totals: { calls: 1 } }, compatibility }, compatibility),
    ).toBe(true);
    expect(
      isResumableRunCompatible(
        {
          metrics: { totals: { calls: 1 } },
          compatibility: { ...compatibility, evaluatorVersion: 'verification-evaluator-v1' },
        },
        compatibility,
      ),
    ).toBe(false);
    expect(isResumableRunCompatible({ metrics: { totals: { calls: 1 } } }, compatibility)).toBe(
      false,
    );
  });

  it('uses a narrow operational fixture without treating it as full qualification', () => {
    const metrics = scoreOutputBudgetPrequalificationRun(outputBudgetBaseline);
    expect(metrics).toMatchObject({
      fixtureVersion: OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
      completeCandidateSet: true,
      noDuplicateCalls: true,
      passes: true,
      totals: { repairs: 0 },
    });
    expect(metrics.candidateResults).toHaveLength(OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS.length);
    const targetedCompatibility = buildVerificationEvaluationCompatibility({
      evaluationMode: OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
    });
    expect(targetedCompatibility).toMatchObject({
      evaluationMode: OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
      prequalificationFixtureVersion: OUTPUT_BUDGET_PREQUALIFICATION_VERSION,
      candidateIds: [...OUTPUT_BUDGET_PREQUALIFICATION_CASE_IDS],
    });
    expect(targetedCompatibility).not.toEqual(buildVerificationEvaluationCompatibility());
  });
});
