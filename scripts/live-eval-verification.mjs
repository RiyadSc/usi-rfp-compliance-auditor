import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  CHALLENGE_PROMPT_VERSION,
  CHALLENGE_SCHEMA_VERSION,
  DECISION_ENGINE_VERSION,
  DUPLICATE_PROMPT_VERSION,
  DUPLICATE_SCHEMA_VERSION,
  ENTAILMENT_PROMPT_VERSION,
  ENTAILMENT_SCHEMA_VERSION,
  FACT_ENVELOPE_VERSION,
  FINAL_ASSESSMENT_SCHEMA_VERSION,
  OpenAIProvider,
} from '../packages/ai/src/index.ts';
import {
  VERIFICATION_CASES,
  VERIFICATION_FIXTURE_VERSION,
} from '../fixtures/eval/verification-cases.ts';
import { runVerificationEvaluation } from './verification-evaluation-runner.mjs';
import {
  aggregateVerificationPipelineRuns,
  scoreVerificationPipelineRun,
  VERIFICATION_EVALUATOR_VERSION,
} from './verification-metrics.mjs';
import {
  buildVerificationEvaluationCompatibility,
  isResumableRunCompatible,
} from './verification-evaluator-compatibility.mjs';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

if (process.env.PHASE4_LIVE_EVAL !== '1')
  throw new Error('Refusing live verification evaluation: set PHASE4_LIVE_EVAL=1 explicitly');
const ceiling = Number(process.env.PHASE4_SPEND_CEILING_USD);
if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 10)
  throw new Error('PHASE4_SPEND_CEILING_USD must be present and no greater than 10');
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error('OPENAI_API_KEY absent for opt-in live verification evaluation');
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!process.env[name]) throw new Error(`${name} is required for spend ledger accounting`);

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: spentRows, error: spendError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd, phase, note');
if (spendError) throw spendError;
const cumulativeApiSpend = (spentRows ?? []).reduce(
  (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
  0,
);
const phase4Spend = (spentRows ?? [])
  .filter((row) => row.phase === 'phase4')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const priorRemediationSpend = (spentRows ?? [])
  .filter((row) => row.phase === 'phase4' && row.note?.startsWith('phase4-remediation:'))
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);

const supportedModels = ['gpt-5.5-2026-04-23', 'gpt-5.4-2026-03-05', 'gpt-5.4-mini-2026-03-17'];
const argumentValue = (name) =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
const selectedModel = argumentValue('--model');
if (selectedModel && !supportedModels.includes(selectedModel))
  throw new Error(`Unsupported verification model selector: ${selectedModel}`);
const models = selectedModel ? [selectedModel] : supportedModels;
const requestedRepetitions = argumentValue('--repetitions');
const repetitions = requestedRepetitions === undefined ? 3 : Number(requestedRepetitions);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3)
  throw new Error('--repetitions must be an integer from 1 through 3');
const freshRun = process.argv.includes('--fresh');
const runId = argumentValue('--run-id');
if (freshRun && (!runId || !/^[a-z0-9][a-z0-9-]{0,79}$/i.test(runId)))
  throw new Error(
    '--fresh requires a unique --run-id containing only letters, numbers, or hyphens',
  );
if (freshRun && process.env.PHASE4_RESUME_COMPLETED_RUNS === '1')
  throw new Error('A fresh run cannot resume completed artifacts');
const resumeCompletedRuns = !freshRun && process.env.PHASE4_RESUME_COMPLETED_RUNS === '1';
const outputLimits = { entailment: 1200, challenge: 1000, duplicate: 600 };
const artifactDir = resolve('artifacts/evaluation');
await mkdir(artifactDir, { recursive: true });
const compatibility = buildVerificationEvaluationCompatibility();
const runArtifactPath = (model, repetition) =>
  resolve(
    artifactDir,
    freshRun
      ? `phase4-${runId}-${model}-run-${repetition}.json`
      : `phase4-remediation-${model}-run-${repetition}.json`,
  );
const summaryArtifactPath = resolve(
  artifactDir,
  freshRun ? `phase4-${runId}-live-results.json` : 'phase4-remediation-live-results.json',
);
if (freshRun) {
  const plannedArtifactPaths = [summaryArtifactPath];
  for (const model of models)
    for (let repetition = 1; repetition <= repetitions; repetition += 1)
      plannedArtifactPaths.push(runArtifactPath(model, repetition));
  for (const path of plannedArtifactPaths) {
    try {
      await access(path);
      throw new Error(`Refusing fresh run because its artifact already exists: ${path}`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}
const resumableRuns = new Map();
if (resumeCompletedRuns) {
  for (const model of models) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const path = runArtifactPath(model, repetition);
      try {
        const run = JSON.parse(await readFile(path, 'utf8'));
        if (isResumableRunCompatible(run, compatibility))
          resumableRuns.set(`${model}:${repetition}`, run);
      } catch {
        // Missing or malformed artifacts are never treated as completed runs.
      }
    }
  }
}
// Conservative planned estimate: all 24 Pass A contexts, all possible Pass B prompt
// inputs, the 14 planted positive challenges, and both prequalified duplicate pairs.
// A runtime reservation stops before any next call that could cross the approved cap.
const projectedMaximumByModelRun = {
  'gpt-5.5-2026-04-23': 1.1,
  'gpt-5.4-2026-03-05': 0.55,
  'gpt-5.4-mini-2026-03-17': 0.3,
};
const projectedMaximumUsd = models.reduce(
  (sum, model) =>
    sum +
    Array.from({ length: repetitions }, (_, index) => index + 1).reduce(
      (modelSum, repetition) =>
        modelSum +
        (resumableRuns.has(`${model}:${repetition}`) ? 0 : projectedMaximumByModelRun[model]),
      0,
    ),
  0,
);
const totalRemediationCeilingUsd = Number(process.env.PHASE4_REMEDIATION_SPEND_CEILING_USD ?? 4);
if (
  !Number.isFinite(totalRemediationCeilingUsd) ||
  totalRemediationCeilingUsd <= 0 ||
  totalRemediationCeilingUsd > 7
)
  throw new Error('PHASE4_REMEDIATION_SPEND_CEILING_USD must be present and no greater than 7');
const remainingRemediationCeilingUsd = Math.min(
  Math.max(0, totalRemediationCeilingUsd - priorRemediationSpend),
  Math.max(0, ceiling - phase4Spend),
);
console.log(
  JSON.stringify({
    cumulativeApiSpend,
    phase4Spend,
    priorRemediationSpend,
    projectedMaximumUsd,
    projectedPhase4Cumulative: phase4Spend + projectedMaximumUsd,
    phase4CeilingUsd: ceiling,
    remainingRemediationCeilingUsd,
    candidates: VERIFICATION_CASES.length,
    plannedModels: models.length,
    repetitions,
    reasoning: 'medium',
    freshRun,
    runId: runId ?? null,
    maxContextsPerCandidate: 2,
    outputLimits,
  }),
);
if (projectedMaximumUsd > remainingRemediationCeilingUsd + 1e-9)
  throw new Error('Refusing live calls: planned remediation evaluation exceeds its approved cap');
if (phase4Spend + projectedMaximumUsd > ceiling + 1e-9)
  throw new Error('Refusing live calls: projected Phase 4 cumulative spend exceeds $10');

const modelResponse = await fetch('https://api.openai.com/v1/models', {
  headers: { authorization: `Bearer ${apiKey}` },
});
if (!modelResponse.ok)
  throw new Error(`Model availability enumeration failed (${modelResponse.status})`);
const accessible = new Set((await modelResponse.json()).data.map((model) => model.id));
for (const model of models)
  if (!accessible.has(model))
    throw new Error(`Required pinned verification candidate is unavailable: ${model}`);
console.log(
  JSON.stringify({ modelAvailability: models.map((model) => ({ model, available: true })) }),
);

let additionalActualUsd = 0;
const reservePerCallUsd = 0.08;
const modelResults = [];
const boundedCall = (call) =>
  call
    ? {
        providerRequestId: call.providerRequestId,
        modelId: call.modelId,
        promptTokens: call.promptTokens,
        completionTokens: call.completionTokens,
        reasoningTokens: call.reasoningTokens,
        cachedTokens: call.cachedTokens,
        latencyMs: call.latencyMs,
        estimatedCostUsd: call.estimatedCostUsd,
        retries: call.retries,
        repairAttempts: call.repairAttempts,
        schemaAdherent: call.schemaAdherent,
        refused: Boolean(call.refused),
        incomplete: Boolean(call.incomplete),
        incompleteReason: call.incompleteReason ?? null,
        normalizedError: call.normalizedError ?? null,
        result: call.result,
      }
    : null;
const boundedEvaluationTrace = (evaluation) => ({
  candidates: evaluation.results.map((result) => ({
    candidate: result.candidate,
    contexts: result.contexts.map((context) => ({
      chunkId: context.chunkId,
      documentId: context.documentId,
      documentType: context.documentType,
      pageNumber: context.pageNumber,
      extractionStatus: context.extractionStatus,
      parserWarnings: context.parserWarnings,
      retrievalReason: context.retrievalReason,
    })),
    facts: result.facts,
    passA: boundedCall(result.entailmentCall),
    passB: boundedCall(result.challengeCall),
    finalAssessment: result.finalAssessment,
    failedStage: result.failedStage,
    error: result.error,
  })),
  duplicatePairs: evaluation.duplicateResults.map((pair) => ({
    sourceId: pair.sourceId,
    targetId: pair.targetId,
    call: boundedCall(pair.call),
    result: pair.result,
  })),
});
const passesAuthorizedSingleRunGate = (metrics) =>
  metrics.final.criticalFalseSupported === 0 &&
  metrics.final.criticalFalseActive === 0 &&
  metrics.final.injectionInfluence === 0 &&
  metrics.final.sourceStatusAccuracy === 1 &&
  metrics.final.supportedPrecision === 1 &&
  metrics.final.precedenceAccuracy === 1 &&
  metrics.final.dateAccuracy === 1 &&
  metrics.final.numberAccuracy === 1 &&
  metrics.final.quoteValidity === 1 &&
  metrics.final.citationAccuracy === 1 &&
  metrics.final.parserUncertainAccuracy === 1 &&
  metrics.final.proofRequirementAccuracy === 1 &&
  metrics.final.duplicatePrecision === 1 &&
  metrics.final.duplicateRecall === 1 &&
  metrics.final.falseMergeCount === 0 &&
  metrics.final.schemaLayers.passA === 1 &&
  metrics.final.schemaLayers.passB === 1 &&
  metrics.final.schemaLayers.duplicateClassifier === 1 &&
  metrics.final.schemaLayers.decisionEngine === 1 &&
  metrics.final.schemaLayers.evaluationArtifact === 1 &&
  metrics.final.refusalIncompleteCount === 0 &&
  metrics.totals.repairs === 0;
for (const model of models) {
  const runs = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const artifactPath = runArtifactPath(model, repetition);
    const previousRun = resumableRuns.get(`${model}:${repetition}`);
    if (previousRun) {
      runs.push(previousRun);
      console.log(JSON.stringify({ model, repetition, resumed: true }));
      continue;
    }
    const provider = new OpenAIProvider({
      apiKey,
      verifyModel: model,
      verifyReasoningEffort: 'medium',
      timeoutMs: 90_000,
    });
    let budgetBlocked = false;
    const evaluation = await runVerificationEvaluation(provider, {
      maxContexts: 2,
      entailmentMaxOutputTokens: outputLimits.entailment,
      challengeMaxOutputTokens: outputLimits.challenge,
      duplicateMaxOutputTokens: outputLimits.duplicate,
      beforeCall: async () => {
        if (
          priorRemediationSpend + additionalActualUsd + reservePerCallUsd >
          totalRemediationCeilingUsd + 1e-9
        ) {
          budgetBlocked = true;
          throw new Error('Live evaluation stopped before call: additional Phase 4 cap reserved');
        }
      },
      onCall: async (stage, candidateId, call, targetCandidateId) => {
        additionalActualUsd += call.estimatedCostUsd;
        if (priorRemediationSpend + additionalActualUsd > totalRemediationCeilingUsd + 1e-9)
          throw new Error('Live evaluation cost crossed the additional Phase 4 cap');
        if (call.estimatedCostUsd > 0) {
          const { error } = await admin.from('spend_ledger').insert({
            phase: 'phase4',
            kind: 'verify',
            estimated_cost_usd: call.estimatedCostUsd,
            note: `phase4-remediation:${model}:run-${repetition}:${stage}:${candidateId}${targetCandidateId ? `:${targetCandidateId}` : ''}`,
          });
          if (error) throw error;
        }
      },
    });
    if (budgetBlocked)
      throw new Error(
        'Live evaluation stopped before completing the scored run: remediation budget reserved',
      );
    const metrics = scoreVerificationPipelineRun(evaluation);
    const run = {
      repetition,
      compatibility,
      metrics,
      qualifiesAuthorizedSingleRunGate: passesAuthorizedSingleRunGate(metrics),
      boundedTrace: boundedEvaluationTrace(evaluation),
    };
    runs.push(run);
    await writeFile(
      artifactPath,
      `${JSON.stringify(run, null, 2)}\n`,
      freshRun ? { flag: 'wx' } : undefined,
    );
    console.log(JSON.stringify({ model, repetition, metrics }));
  }
  const aggregate = aggregateVerificationPipelineRuns(runs);
  const qualifies = runs.every((run) => passesAuthorizedSingleRunGate(run.metrics));
  modelResults.push({ model, reasoning: 'medium', runs, aggregate, qualifies });
}

const { data: finalSpendRows, error: finalSpendError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd, phase');
if (finalSpendError) throw finalSpendError;
const finalPhase4Spend = (finalSpendRows ?? [])
  .filter((row) => row.phase === 'phase4')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const artifact = {
  phase: 'phase4-remediation',
  freshRun,
  runId: runId ?? null,
  fixtureVersion: VERIFICATION_FIXTURE_VERSION,
  candidateCount: VERIFICATION_CASES.length,
  prompts: {
    entailment: ENTAILMENT_PROMPT_VERSION,
    challenge: CHALLENGE_PROMPT_VERSION,
    duplicate: DUPLICATE_PROMPT_VERSION,
  },
  schemas: {
    entailment: ENTAILMENT_SCHEMA_VERSION,
    challenge: CHALLENGE_SCHEMA_VERSION,
    duplicate: DUPLICATE_SCHEMA_VERSION,
  },
  decisionEngineVersion: DECISION_ENGINE_VERSION,
  factEnvelopeVersion: FACT_ENVELOPE_VERSION,
  finalAssessmentSchemaVersion: FINAL_ASSESSMENT_SCHEMA_VERSION,
  evaluatorVersion: VERIFICATION_EVALUATOR_VERSION,
  compatibility,
  reasoning: 'medium',
  repetitions,
  maxContextsPerCandidate: 2,
  outputLimits,
  projectedMaximumUsd,
  phase4SpendBefore: phase4Spend,
  priorRemediationSpend,
  additionalActualUsd,
  totalRemediationSpend: priorRemediationSpend + additionalActualUsd,
  phase4SpendAfter: finalPhase4Spend,
  models: modelResults,
};
await writeFile(
  summaryArtifactPath,
  `${JSON.stringify(artifact, null, 2)}\n`,
  freshRun ? { flag: 'wx' } : undefined,
);
console.log(
  JSON.stringify({
    completed: true,
    additionalActualUsd,
    finalPhase4Spend,
    qualified: modelResults.filter((item) => item.qualifies).map((item) => item.model),
  }),
);
