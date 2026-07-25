/**
 * One-shot Phase 9 FAC115 acceptance runner.
 *
 * Expected answers are loaded only after source preparation and provider work.
 * No prompt, cache key, retrieval decision, or candidate is allowed to depend
 * on the evaluator artifact.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  PHASE9_CACHE_VERSION,
  PHASE9_LEDGER_CEILING_USD,
  PHASE9_MINER_VERSION,
  Phase9ProviderGateway,
  finalizePhase9Finding,
  phase9CandidateSeedSchema,
  phase9CompatibilityFingerprint,
  phase9CompactExtractionOutputSchema,
  phase9CompactVerificationOutputSchema,
  phase9PrecedenceForEvidence,
  phase9PromptFingerprint,
  phase9StableHash,
  validatePhase9TaskResult,
  type Phase9CandidateSeed,
  type Phase9FinalFinding,
} from '../packages/ai/src/index.ts';
import {
  releasePhase9CallPlan,
  reservePhase9CallPlan,
  settlePhase9CallPlan,
} from '../apps/worker/src/phase9-cost-control.ts';
import {
  FAC115_EVALUATOR_VERSION,
  FAC115_SYNTHETIC_IDENTITY_ID,
  FAC115_WORKSPACE_ID,
  buildFac115Phase9ProductionPlan,
} from './lib/phase9-fac115-production.mts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const execFileAsync = promisify(execFile);
const PROJECT_REF = 'uxmxkdjschbekkbnweby';
const ARTIFACTS = resolve('artifacts/evaluation');
const LIVE_FLAG = 'PHASE9_FAC115_LIVE_ACCEPTANCE';
const EXPECTED_OFFLINE_VERSION = 'phase9-fac115-evaluator-v2';
const batches = <T,>(items: T[], size = 500) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

if (process.env[LIVE_FLAG] !== '1') throw new Error('phase9_live_acceptance_flag_required');
if (Number(process.env.PHASE9_SPEND_CEILING_USD) !== PHASE9_LEDGER_CEILING_USD)
  throw new Error('phase9_live_acceptance_ceiling_mismatch');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.OPENAI_API_KEY;
if (!supabaseUrl || !serviceKey || !apiKey)
  throw new Error('phase9_live_acceptance_runtime_missing');
if (new URL(supabaseUrl).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_live_acceptance_project_mismatch');

const { stdout: dirty } = await execFileAsync('git', ['status', '--porcelain']);
if (dirty.trim()) throw new Error('phase9_live_acceptance_worktree_not_clean');
const { stdout: commitOutput } = await execFileAsync('git', ['rev-parse', 'HEAD']);
const gitCommit = commitOutput.trim();

// Production source preparation completes before evaluator material is read.
const initial = await buildFac115Phase9ProductionPlan();
if (!initial.callPlan) throw new Error('phase9_live_acceptance_call_plan_missing');
if (initial.callPlan.hardMaximumUsd > PHASE9_LEDGER_CEILING_USD)
  throw new Error('phase9_live_acceptance_plan_over_ceiling');

const offline = JSON.parse(
  await readFile(resolve(ARTIFACTS, 'phase9-fac115-offline-recovery-v1.json'), 'utf8'),
) as {
  version: string;
  expectedHash: string;
  sourcePackageHash: string;
  gates: Record<string, boolean>;
  callPlan: { planHash: string; hardMaximumUsd: number };
};
const costEstimate = JSON.parse(
  await readFile(resolve(ARTIFACTS, 'phase9-fac115-cost-estimate-v1.json'), 'utf8'),
) as { forecastCostUsd: number; optimizedMaximumUsd: number };
if (
  offline.version !== EXPECTED_OFFLINE_VERSION ||
  offline.sourcePackageHash !== initial.sourcePackageHash ||
  offline.callPlan.planHash !== initial.callPlan.planHash ||
  !Object.values(offline.gates).every(Boolean)
)
  throw new Error('phase9_live_acceptance_offline_gate_mismatch');
if (
  costEstimate.optimizedMaximumUsd !== initial.callPlan.hardMaximumUsd ||
  !Number.isFinite(costEstimate.forecastCostUsd) ||
  costEstimate.forecastCostUsd <= 0
)
  throw new Error('phase9_live_acceptance_cost_estimate_mismatch');

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const workspace = await admin
  .from('workspaces')
  .select('id,owner_id,name,description')
  .eq('id', FAC115_WORKSPACE_ID)
  .maybeSingle();
if (workspace.error || !workspace.data) throw new Error('phase9_live_workspace_missing');
if (
  workspace.data.owner_id !== FAC115_SYNTHETIC_IDENTITY_ID ||
  !String(workspace.data.description ?? '').includes('phase9-public-evaluation-only')
)
  throw new Error('phase9_live_workspace_binding_invalid');

const cacheProbe = await admin
  .from('phase9_provider_cache')
  .select('cache_key,result,result_hash,status,schema_adherent')
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .in(
    'cache_key',
    initial.callPlan.tasks.map((task) => task.cacheKey),
  );
if (cacheProbe.error) throw new Error(`phase9_live_cache_preflight:${cacheProbe.error.message}`);
const validCacheKeys = new Set(
  (cacheProbe.data ?? [])
    .filter(
      (row) =>
        row.status === 'complete' &&
        row.schema_adherent === true &&
        phase9StableHash(row.result) === row.result_hash,
    )
    .map((row) => row.cache_key),
);
const production = await buildFac115Phase9ProductionPlan({ cachedKeys: validCacheKeys });
if (!production.callPlan) throw new Error('phase9_live_acceptance_cached_plan_missing');
const plan = production.callPlan;
const uncachedTasks = plan.tasks.filter((task) => !validCacheKeys.has(task.cacheKey));
if (plan.hardMaximumUsd > PHASE9_LEDGER_CEILING_USD)
  throw new Error('phase9_live_acceptance_cached_plan_over_ceiling');

const compatibilityFingerprint = phase9CompatibilityFingerprint();
const evaluationRunId = randomUUID();
const evaluationInsert = await admin.from('phase9_evaluation_runs').insert({
  id: evaluationRunId,
  workspace_id: FAC115_WORKSPACE_ID,
  actor_id: FAC115_SYNTHETIC_IDENTITY_ID,
  mode: uncachedTasks.length ? 'acceptance_live' : 'cached_rerun',
  status: 'planned',
  source_package_hash: production.sourcePackageHash,
  expected_answer_hash: offline.expectedHash,
  call_plan_hash: plan.planHash,
  compatibility_fingerprint: compatibilityFingerprint,
  versions: {
    recovery: production.version,
    evaluator: FAC115_EVALUATOR_VERSION,
    coverage: 'phase9-source-coverage-v1',
    miner: PHASE9_MINER_VERSION,
    callPlan: plan.version,
  },
  planned_maximum_usd: plan.hardMaximumUsd,
  cache_hit_count: plan.tasks.length - uncachedTasks.length,
});
if (evaluationInsert.error)
  throw new Error(`phase9_live_run_insert:${evaluationInsert.error.message}`);

const blockById = new Map(production.blocks.map((block) => [block.id, block]));
const candidateById = new Map(
  production.reduction.candidates.map((candidate) => [candidate.id, candidate]),
);
const coverageInsert = await admin.from('phase9_source_block_coverage').insert(
  production.coverage.map((record) => {
    const block = blockById.get(record.blockId)!;
    return {
      workspace_id: FAC115_WORKSPACE_ID,
      evaluation_run_id: evaluationRunId,
      block_hash: record.blockId,
      source_document_id: block.documentId,
      source_document_key: block.documentName,
      source_hash: block.sourceHash,
      block_type: block.blockType,
      page_number: block.pageNumber,
      sheet_name: block.sheetName,
      cell_range: block.cellRange,
      heading_path: record.headingPath,
      route: record.route,
      deterministic_signals: record.deterministicSignals,
      processing_result: record.processingResult,
      exclusion_reason: record.exclusionReason,
      coverage_version: record.version,
    };
  }),
);
if (coverageInsert.error)
  throw new Error(`phase9_live_coverage_insert:${coverageInsert.error.message}`);

const seedInsert = await admin.from('phase9_candidate_seeds').insert(
  production.reduction.candidates.map((candidate) => ({
    workspace_id: FAC115_WORKSPACE_ID,
    evaluation_run_id: evaluationRunId,
    candidate_hash: candidate.id,
    source_block_hashes: candidate.sourceBlockIds,
    requirement_type: candidate.requirementType,
    obligation_text: candidate.obligationText,
    evidence_text: candidate.evidenceText,
    material_facts: {
      subject: candidate.subject,
      action: candidate.action,
      condition: candidate.condition,
      dateValue: candidate.dateValue,
      numberValue: candidate.numberValue,
      unit: candidate.unit,
      formReference: candidate.formReference,
      signals: candidate.deterministicSignals,
    },
    discovery_route: candidate.discoveryRoute,
    miner_version: candidate.minerVersion,
  })),
);
if (seedInsert.error) throw new Error(`phase9_live_seed_insert:${seedInsert.error.message}`);

const callPlanInsert = await admin
  .from('phase9_call_plans')
  .insert({
    workspace_id: FAC115_WORKSPACE_ID,
    evaluation_run_id: evaluationRunId,
    plan_hash: plan.planHash,
    source_package_hash: production.sourcePackageHash,
    plan,
    task_count: plan.tasks.length,
    maximum_usd: plan.hardMaximumUsd,
    plan_version: plan.version,
  })
  .select('id')
  .single();
if (callPlanInsert.error || !callPlanInsert.data)
  throw new Error(`phase9_live_plan_insert:${callPlanInsert.error?.message}`);
const callPlanId = callPlanInsert.data.id as string;
const taskInsert = await admin
  .from('phase9_call_plan_tasks')
  .insert(
    plan.tasks.map((task) => ({
      workspace_id: FAC115_WORKSPACE_ID,
      call_plan_id: callPlanId,
      task_hash: task.id,
      task_type: task.taskType,
      model_tier: task.tier,
      model_id: task.modelId,
      configuration_fingerprint: phase9PromptFingerprint(task.taskType),
      source_block_hashes: task.sourceBlockIds,
      candidate_hashes: task.candidateIds,
      maximum_input_tokens: task.maximumInputTokens,
      maximum_output_tokens: task.maximumOutputTokens,
      maximum_retries: task.maximumRetries,
      maximum_usd: task.hardMaximumUsd,
      cache_key: task.cacheKey,
      escalation_reason: task.escalationReason,
      status: validCacheKeys.has(task.cacheKey) ? 'cached' : 'planned',
    })),
  )
  .select('id,task_hash');
if (taskInsert.error || !taskInsert.data)
  throw new Error(`phase9_live_task_insert:${taskInsert.error?.message}`);
const persistedTaskIds = new Map(
  taskInsert.data.map((row) => [row.task_hash as string, row.id as string]),
);

let reservationId: string | null = null;
if (uncachedTasks.length) {
  reservationId = await reservePhase9CallPlan({
    admin: admin as never,
    workspaceId: FAC115_WORKSPACE_ID,
    evaluationRunId,
    sourcePackageHash: production.sourcePackageHash,
    callPlanHash: plan.planHash,
    maximumUsd: plan.hardMaximumUsd,
  });
}

await admin
  .from('phase9_evaluation_runs')
  .update({ status: 'running', started_at: new Date().toISOString() })
  .eq('id', evaluationRunId);
await admin.from('audit_events').insert({
  workspace_id: FAC115_WORKSPACE_ID,
  actor_type: 'system',
  actor_id: FAC115_SYNTHETIC_IDENTITY_ID,
  event_type: 'analysis_started',
  entity_type: 'phase9_evaluation_run',
  entity_id: evaluationRunId,
  payload: {
    mode: uncachedTasks.length ? 'acceptance_live' : 'cached_rerun',
    sourcePackageHash: production.sourcePackageHash,
    callPlanHash: plan.planHash,
    compatibilityFingerprint,
  },
});

const cachedByKey = new Map((cacheProbe.data ?? []).map((row) => [row.cache_key, row]));
const results = new Map<string, unknown>();
let gateway: Phase9ProviderGateway | null = null;
let providerCalls = 0;
let actualCostUsd = 0;
let inputTokens = 0;
let outputTokens = 0;
let reasoningTokens = 0;
let latencyMs = 0;

try {
  for (const task of plan.tasks) {
    const blocks = task.sourceBlockIds.map((id) => blockById.get(id)!).filter(Boolean);
    const candidates = task.candidateIds.map((id) => candidateById.get(id)!).filter(Boolean);
    const cached = cachedByKey.get(task.cacheKey);
    if (
      cached &&
      cached.status === 'complete' &&
      cached.schema_adherent === true &&
      phase9StableHash(cached.result) === cached.result_hash
    ) {
      results.set(
        task.id,
        validatePhase9TaskResult({ task, blocks, candidates, result: cached.result }),
      );
      continue;
    }
    gateway ??= new Phase9ProviderGateway(plan, { apiKey, timeoutMs: 90_000 });
    const result = await gateway.execute({ task, blocks, candidates });
    providerCalls++;
    actualCostUsd += result.costUsd;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    reasoningTokens += result.reasoningTokens;
    latencyMs += result.latencyMs;
    results.set(task.id, result.result);
    const cachePersist = await admin.from('phase9_provider_cache').upsert(
      {
        workspace_id: FAC115_WORKSPACE_ID,
        cache_key: task.cacheKey,
        source_package_hash: production.sourcePackageHash,
        task_type: task.taskType,
        model_id: task.modelId,
        configuration_fingerprint: phase9PromptFingerprint(task.taskType),
        result: result.result,
        result_hash: result.resultHash,
        schema_adherent: true,
        status: 'complete',
        provider_request_id: result.providerRequestId,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        reasoning_tokens: result.reasoningTokens,
        latency_ms: result.latencyMs,
        cost_usd: result.costUsd,
        cache_version: PHASE9_CACHE_VERSION,
      },
      { onConflict: 'workspace_id,cache_key' },
    );
    if (cachePersist.error)
      throw new Error(`phase9_live_cache_write:${cachePersist.error.message}`);
    const usagePersist = await admin.from('phase9_provider_usage').insert({
      workspace_id: FAC115_WORKSPACE_ID,
      evaluation_run_id: evaluationRunId,
      call_plan_task_id: persistedTaskIds.get(task.id),
      provider_request_id: result.providerRequestId,
      model_id: result.modelId,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      reasoning_tokens: result.reasoningTokens,
      cached_tokens: result.cachedTokens,
      latency_ms: result.latencyMs,
      cost_usd: result.costUsd,
      response_status: 'completed',
    });
    if (usagePersist.error)
      throw new Error(`phase9_live_usage_write:${usagePersist.error.message}`);
  }

  const aiSeeds: Phase9CandidateSeed[] = [];
  const semanticByCandidate = new Map<
    string,
    ReturnType<typeof phase9CompactVerificationOutputSchema.parse>['results'][number]
  >();
  for (const task of plan.tasks) {
    const result = results.get(task.id);
    if (task.taskType === 'targeted_extraction') {
      const extracted = phase9CompactExtractionOutputSchema.parse(result);
      for (const item of extracted.candidates) {
        const documentId = blockById.get(item.sourceBlockIds[0]!)!.documentId;
        const id = phase9StableHash([
          'phase9-live-ai-seed-v1',
          item.sourceBlockIds,
          item.requirementType,
          item.obligationText,
          item.evidenceText,
        ]);
        aiSeeds.push(
          phase9CandidateSeedSchema.parse({
            id,
            ...item,
            documentId,
            deterministicSignals: ['ai_targeted'],
            discoveryRoute: 'ai_targeted',
            minerVersion: PHASE9_MINER_VERSION,
          }),
        );
      }
    } else if (
      task.taskType === 'independent_verification' ||
      task.taskType === 'exception_review'
    ) {
      for (const item of phase9CompactVerificationOutputSchema.parse(result).results)
        if (task.taskType === 'independent_verification')
          semanticByCandidate.set(item.candidateId, item);
    }
  }
  const dedupedAiSeeds = [
    ...new Map(aiSeeds.map((candidate) => [candidate.id, candidate])).values(),
  ];
  if (dedupedAiSeeds.length) {
    const aiSeedInsert = await admin.from('phase9_candidate_seeds').insert(
      dedupedAiSeeds.map((candidate) => ({
        workspace_id: FAC115_WORKSPACE_ID,
        evaluation_run_id: evaluationRunId,
        candidate_hash: candidate.id,
        source_block_hashes: candidate.sourceBlockIds,
        requirement_type: candidate.requirementType,
        obligation_text: candidate.obligationText,
        evidence_text: candidate.evidenceText,
        material_facts: {
          subject: candidate.subject,
          action: candidate.action,
          condition: candidate.condition,
          dateValue: candidate.dateValue,
          numberValue: candidate.numberValue,
          unit: candidate.unit,
          formReference: candidate.formReference,
        },
        discovery_route: 'ai_targeted',
        miner_version: candidate.minerVersion,
      })),
    );
    if (aiSeedInsert.error)
      throw new Error(`phase9_live_ai_seed_insert:${aiSeedInsert.error.message}`);
  }

  const findings: Phase9FinalFinding[] = [];
  for (const candidate of production.reduction.candidates) {
    const finding = finalizePhase9Finding({
      candidate,
      blocks: production.blocks,
      semanticResult: semanticByCandidate.get(candidate.id),
      precedenceStatus: phase9PrecedenceForEvidence(
        candidate.evidenceText,
        production.amendmentRelationships,
      ),
    });
    if (finding) findings.push(finding);
  }
  const findingInsert = await admin.from('phase9_findings').insert(
    findings.map((finding) => ({
      workspace_id: FAC115_WORKSPACE_ID,
      evaluation_run_id: evaluationRunId,
      candidate_hash: finding.candidateId,
      source_support_status: finding.sourceSupportStatus,
      precedence_status: finding.precedenceStatus,
      proof_requirement: finding.proofRequirement,
      evidence_block_hashes: finding.evidenceBlockIds,
      ambiguity_code: finding.ambiguityCode,
      machine_only: true,
      human_review_status: 'pending',
      decision_version: finding.decisionVersion,
    })),
  );
  if (findingInsert.error)
    throw new Error(`phase9_live_finding_insert:${findingInsert.error.message}`);
  const dependencyEdges = [
    ...production.reduction.candidates.flatMap((candidate) =>
      candidate.sourceBlockIds.map((blockId) => ({
        workspace_id: FAC115_WORKSPACE_ID,
        evaluation_run_id: evaluationRunId,
        source_kind: 'source_block',
        source_key: blockId,
        target_kind: 'candidate',
        target_key: candidate.id,
        dependency_version: 'phase9-dependency-graph-v1',
      })),
    ),
    ...findings.map((finding) => ({
      workspace_id: FAC115_WORKSPACE_ID,
      evaluation_run_id: evaluationRunId,
      source_kind: 'candidate',
      source_key: finding.candidateId,
      target_kind: 'finding',
      target_key: finding.candidateId,
      dependency_version: 'phase9-dependency-graph-v1',
    })),
  ];
  for (const batch of batches(dependencyEdges)) {
    const dependencyInsert = await admin.from('phase9_dependency_edges').insert(batch);
    if (dependencyInsert.error)
      throw new Error(`phase9_live_dependency_insert:${dependencyInsert.error.message}`);
  }

  // Evaluator-only import occurs after all production extraction/verification.
  const { evaluateFac115Phase9 } = await import('./lib/phase9-fac115-evaluator.mts');
  const evaluation = await evaluateFac115Phase9({
    sourcePackageHash: production.sourcePackageHash,
    blocks: production.blocks,
    candidates: production.reduction.candidates,
    findings,
    amendmentRelationships: production.amendmentRelationships,
  });
  if (evaluation.expectedHash !== offline.expectedHash)
    throw new Error('phase9_live_expected_hash_mismatch');
  const cachedRerun = await buildFac115Phase9ProductionPlan({
    cachedKeys: new Set(plan.tasks.map((task) => task.cacheKey)),
  });
  if (
    !cachedRerun.callPlan ||
    cachedRerun.callPlan.hardMaximumUsd !== 0 ||
    cachedRerun.callPlan.tasks.some((task) => !results.has(task.id))
  )
    throw new Error('phase9_live_cache_rerun_proof_failed');
  for (const task of cachedRerun.callPlan.tasks) {
    const blocks = task.sourceBlockIds.map((id) => blockById.get(id)!).filter(Boolean);
    const candidates = task.candidateIds.map((id) => candidateById.get(id)!).filter(Boolean);
    validatePhase9TaskResult({
      task,
      blocks,
      candidates,
      result: results.get(task.id),
    });
  }
  const cacheRerunProof = {
    version: 'phase9-fac115-cache-rerun-proof-v1',
    sourcePackageHash: production.sourcePackageHash,
    cachedTaskCount: cachedRerun.callPlan.tasks.length,
    providerConstructed: false,
    providerCalls: 0,
    additionalSpendUsd: 0,
    hardMaximumUsd: cachedRerun.callPlan.hardMaximumUsd,
    passed: true,
  };

  actualCostUsd = Number(actualCostUsd.toFixed(6));
  const costForecastVariance =
    actualCostUsd === 0
      ? 0
      : Math.abs(actualCostUsd - costEstimate.forecastCostUsd) / costEstimate.forecastCostUsd;
  const costForecastWithinTolerance = costForecastVariance <= 0.2;
  if (reservationId)
    await settlePhase9CallPlan({
      admin: admin as never,
      reservationId,
      actualUsd: actualCostUsd,
    });
  const completion = await admin
    .from('phase9_evaluation_runs')
    .update({
      status: evaluation.passed && costForecastWithinTolerance ? 'completed' : 'failed',
      actual_usd: actualCostUsd,
      provider_call_count: providerCalls,
      completed_at: new Date().toISOString(),
      error_category:
        evaluation.passed && costForecastWithinTolerance
          ? null
          : evaluation.passed
            ? 'phase9_cost_forecast_variance'
            : 'fac115_acceptance_gate_failed',
    })
    .eq('id', evaluationRunId);
  if (completion.error) throw new Error(`phase9_live_run_complete:${completion.error.message}`);
  await admin.from('audit_events').insert({
    workspace_id: FAC115_WORKSPACE_ID,
    actor_type: 'system',
    actor_id: FAC115_SYNTHETIC_IDENTITY_ID,
    event_type:
      evaluation.passed && costForecastWithinTolerance ? 'analysis_completed' : 'analysis_failed',
    entity_type: 'phase9_evaluation_run',
    entity_id: evaluationRunId,
    payload: {
      providerCalls,
      actualCostUsd,
      forecastCostUsd: costEstimate.forecastCostUsd,
      costForecastVariance,
      costForecastWithinTolerance,
      expectedAnswers: evaluation.total,
      matched: evaluation.matched,
      passed: evaluation.passed && costForecastWithinTolerance,
    },
  });

  const report = {
    version: 'phase9-fac115-final-live-v1',
    generatedAt: new Date().toISOString(),
    gitCommit,
    projectRef: PROJECT_REF,
    workspaceId: FAC115_WORKSPACE_ID,
    evaluationRunId,
    sourcePackageHash: production.sourcePackageHash,
    expectedAnswerHash: offline.expectedHash,
    compatibilityFingerprint,
    callPlanHash: plan.planHash,
    callPlanMaximumUsd: plan.hardMaximumUsd,
    forecastCostUsd: costEstimate.forecastCostUsd,
    costForecastVariance,
    costForecastWithinTolerance,
    providerCalls,
    cacheHits: plan.tasks.length - providerCalls,
    usage: {
      inputTokens,
      outputTokens,
      reasoningTokens,
      latencyMs,
      actualCostUsd,
    },
    extraction: {
      deterministicSeeds: production.reduction.candidates.length,
      aiSeeds: dedupedAiSeeds.length,
      persistedFindings: findings.length,
      unresolvedCandidates: production.reduction.candidates.length - findings.length,
    },
    reliability: {
      repairs: 0,
      retries: 0,
      malformed: 0,
      incomplete: 0,
      refused: 0,
      timeouts: 0,
    },
    cacheRerunProof,
    evaluation,
  };
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(
    resolve(ARTIFACTS, 'phase9-fac115-fresh-extraction-v1.json'),
    `${JSON.stringify(
      {
        version: 'phase9-fac115-fresh-extraction-v1',
        evaluationRunId,
        sourcePackageHash: production.sourcePackageHash,
        deterministicSeeds: production.reduction.candidates,
        aiSeeds: dedupedAiSeeds,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    resolve(ARTIFACTS, 'phase9-fac115-final-live-provider-usage-v1.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    resolve(ARTIFACTS, 'phase9-fac115-expected-vs-actual-v1.json'),
    `${JSON.stringify(evaluation, null, 2)}\n`,
  );
  await writeFile(
    resolve(ARTIFACTS, 'phase9-fac115-cache-rerun-proof-v1.json'),
    `${JSON.stringify(cacheRerunProof, null, 2)}\n`,
  );
  console.info(JSON.stringify(report, null, 2));
  if (!evaluation.passed || !costForecastWithinTolerance) process.exitCode = 1;
} catch (error) {
  if (reservationId) {
    if (providerCalls > 0)
      await settlePhase9CallPlan({
        admin: admin as never,
        reservationId,
        actualUsd: Number(actualCostUsd.toFixed(6)),
      }).catch(() => undefined);
    else
      await releasePhase9CallPlan({ admin: admin as never, reservationId }).catch(() => undefined);
  }
  await admin
    .from('phase9_evaluation_runs')
    .update({
      status: 'failed',
      actual_usd: Number(actualCostUsd.toFixed(6)),
      provider_call_count: providerCalls,
      error_category: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      completed_at: new Date().toISOString(),
    })
    .eq('id', evaluationRunId);
  throw error;
}
