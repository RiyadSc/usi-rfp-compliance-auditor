import {
  PHASE9_CACHE_VERSION,
  PHASE9_MINER_VERSION,
  Phase9ProviderGateway,
  buildPhase9WorkspaceProductionPlan,
  finalizePhase9Finding,
  phase9CandidateSeedSchema,
  phase9CompactExtractionOutputSchema,
  phase9CompactVerificationOutputSchema,
  phase9CompatibilityFingerprint,
  phase9PrecedenceForEvidence,
  phase9PromptFingerprint,
  phase9StableHash,
  refinePhase9WorkspaceCandidates,
  validatePhase9TaskResult,
  type Phase9CandidateSeed,
  type Phase9FinalFinding,
  type Phase9WorkspaceDocument,
} from '@usi/ai';
import { z } from 'zod';
import { adminClient } from './db.js';
import { env } from './env.js';
import {
  releasePhase9CallPlan,
  reservePhase9CallPlan,
  settlePhase9CallPlan,
} from './phase9-cost-control.js';

const payloadSchema = z.object({
  workspaceId: z.string().uuid(),
  evaluationRunId: z.string().uuid(),
});

export type Phase9WorkspaceAnalysisPayload = z.infer<typeof payloadSchema>;

const chunks = <T>(items: T[], size = 400) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export function classifyPhase9WorkspaceFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('429') && normalized.includes('quota')) return 'provider_quota_exceeded';
  if (normalized.includes('429') || normalized.includes('rate limit'))
    return 'provider_rate_limited';
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'provider_timeout';
  if (normalized.includes('refusal')) return 'provider_refusal';
  if (normalized.includes('incomplete')) return 'provider_incomplete';
  if (normalized.includes('api key') || normalized.includes('authentication'))
    return 'provider_authentication_failed';
  const internal = message.split(':', 1)[0] ?? 'phase9_workspace_unknown_failure';
  return /^[a-z0-9_]{3,120}$/.test(internal) ? internal : 'phase9_workspace_provider_failure';
}

async function loadDocuments(input: {
  admin: ReturnType<typeof adminClient>;
  workspaceId: string;
  evaluationRunId: string;
}): Promise<Phase9WorkspaceDocument[]> {
  const bindings = await input.admin
    .from('phase9_evaluation_documents')
    .select('document_id,source_hash,ordinal,page_count')
    .eq('workspace_id', input.workspaceId)
    .eq('evaluation_run_id', input.evaluationRunId)
    .order('ordinal');
  if (bindings.error || !bindings.data?.length)
    throw new Error(`phase9_workspace_documents_missing:${bindings.error?.message ?? 'empty'}`);

  const ids = bindings.data.map((row) => row.document_id);
  const [documents, pages] = await Promise.all([
    input.admin
      .from('documents')
      .select('id,workspace_id,normalized_filename,sha256,source_format,document_type,status')
      .eq('workspace_id', input.workspaceId)
      .in('id', ids)
      .is('deleted_at', null),
    input.admin
      .from('document_pages')
      .select('document_id,workspace_id,page_number,text,extraction_status,warnings')
      .eq('workspace_id', input.workspaceId)
      .in('document_id', ids)
      .order('page_number'),
  ]);
  if (documents.error || pages.error)
    throw new Error(
      `phase9_workspace_source_load_failed:${documents.error?.message ?? pages.error?.message}`,
    );
  if (documents.data?.length !== ids.length)
    throw new Error('phase9_workspace_document_scope_drift');

  const documentById = new Map((documents.data ?? []).map((row) => [row.id, row]));
  return bindings.data.map((binding) => {
    const document = documentById.get(binding.document_id);
    if (
      !document ||
      document.workspace_id !== input.workspaceId ||
      document.sha256 !== binding.source_hash ||
      document.status !== 'parsed'
    )
      throw new Error('phase9_workspace_document_binding_drift');
    const documentPages = (pages.data ?? []).filter(
      (page) => page.document_id === binding.document_id,
    );
    if (documentPages.length !== binding.page_count)
      throw new Error('phase9_workspace_page_count_drift');
    return {
      id: document.id,
      workspaceId: document.workspace_id,
      filename: document.normalized_filename,
      sourceHash: document.sha256,
      sourceFormat: document.source_format ?? null,
      documentType: document.document_type,
      pages: documentPages.map((page) => ({
        pageNumber: page.page_number,
        text: page.text,
        parserConfidence:
          page.extraction_status === 'ok' || page.extraction_status === 'text'
            ? 1
            : page.extraction_status === 'empty'
              ? 0.7
              : page.extraction_status === 'image_only'
                ? 0.2
                : 0,
        parserState:
          page.extraction_status === 'ok' || page.extraction_status === 'text'
            ? 'native'
            : page.extraction_status === 'image_only' || page.extraction_status === 'empty'
              ? 'uncertain'
              : 'failed',
      })),
    };
  });
}

export async function handlePhase9WorkspaceAnalysis(
  rawPayload: Phase9WorkspaceAnalysisPayload,
): Promise<void> {
  const payload = payloadSchema.parse(rawPayload);
  const admin = adminClient();
  let reservationId: string | null = null;
  let actualCostUsd = 0;
  let providerCalls = 0;

  try {
    if (!env.PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED)
      throw new Error('phase9_workspace_live_disabled');
    if (!env.OPENAI_API_KEY) throw new Error('phase9_workspace_provider_key_missing');

    const runResult = await admin
      .from('phase9_evaluation_runs')
      .select(
        'id,workspace_id,actor_id,mode,status,source_package_hash,document_set_hash,call_plan_hash,compatibility_fingerprint,versions,planned_maximum_usd,requested_maximum_usd',
      )
      .eq('id', payload.evaluationRunId)
      .eq('workspace_id', payload.workspaceId)
      .maybeSingle();
    const run = runResult.data;
    if (runResult.error || !run) throw new Error('phase9_workspace_run_missing');
    if (run.mode !== 'workspace_live' || run.status !== 'planned')
      throw new Error('phase9_workspace_run_not_executable');
    if (run.compatibility_fingerprint !== phase9CompatibilityFingerprint())
      throw new Error('phase9_workspace_compatibility_drift');

    const documents = await loadDocuments({
      admin,
      workspaceId: payload.workspaceId,
      evaluationRunId: payload.evaluationRunId,
    });
    const initial = buildPhase9WorkspaceProductionPlan({
      workspaceId: payload.workspaceId,
      documents,
    });
    const cacheProbe = initial.callPlan.tasks.length
      ? await admin
          .from('phase9_provider_cache')
          .select('cache_key,result,result_hash,status,schema_adherent')
          .eq('workspace_id', payload.workspaceId)
          .in(
            'cache_key',
            initial.callPlan.tasks.map((task) => task.cacheKey),
          )
      : { data: [], error: null };
    if (cacheProbe.error)
      throw new Error(`phase9_workspace_cache_preflight:${cacheProbe.error.message}`);
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
    const production = buildPhase9WorkspaceProductionPlan({
      workspaceId: payload.workspaceId,
      documents,
      cachedKeys: validCacheKeys,
    });
    const plan = production.callPlan;
    if (
      run.source_package_hash !== production.sourcePackageHash ||
      run.document_set_hash !== production.documentSetHash ||
      run.call_plan_hash !== plan.planHash ||
      Number(run.planned_maximum_usd) !== plan.hardMaximumUsd ||
      plan.hardMaximumUsd > Number(run.requested_maximum_usd) ||
      plan.hardMaximumUsd > env.PHASE9_LIVE_MAX_USD_PER_RUN
    )
      throw new Error('phase9_workspace_plan_drift');

    const planResult = await admin
      .from('phase9_call_plans')
      .select('id,plan_hash,source_package_hash,maximum_usd')
      .eq('workspace_id', payload.workspaceId)
      .eq('evaluation_run_id', payload.evaluationRunId)
      .maybeSingle();
    if (
      planResult.error ||
      !planResult.data ||
      planResult.data.plan_hash !== plan.planHash ||
      planResult.data.source_package_hash !== production.sourcePackageHash ||
      Number(planResult.data.maximum_usd) !== plan.hardMaximumUsd
    )
      throw new Error('phase9_workspace_persisted_plan_drift');

    const taskRows = await admin
      .from('phase9_call_plan_tasks')
      .select('id,task_hash,cache_key')
      .eq('workspace_id', payload.workspaceId)
      .eq('call_plan_id', planResult.data.id);
    if (taskRows.error || taskRows.data?.length !== plan.tasks.length)
      throw new Error('phase9_workspace_task_population_drift');
    const persistedTaskIds = new Map(
      (taskRows.data ?? []).map((row) => [row.task_hash, row.id as string]),
    );

    if (plan.hardMaximumUsd > 0) {
      reservationId = await reservePhase9CallPlan({
        admin,
        workspaceId: payload.workspaceId,
        evaluationRunId: payload.evaluationRunId,
        sourcePackageHash: production.sourcePackageHash,
        callPlanHash: plan.planHash,
        maximumUsd: plan.hardMaximumUsd,
      });
    }
    const startedAt = new Date().toISOString();
    const started = await admin
      .from('phase9_evaluation_runs')
      .update({ status: 'running', started_at: startedAt })
      .eq('id', payload.evaluationRunId)
      .eq('workspace_id', payload.workspaceId)
      .in('status', ['planned', 'reserved']);
    if (started.error) throw new Error(`phase9_workspace_start_failed:${started.error.message}`);
    await admin.from('audit_events').insert({
      workspace_id: payload.workspaceId,
      actor_type: 'system',
      actor_id: run.actor_id,
      event_type: 'analysis_started',
      entity_type: 'phase9_evaluation_run',
      entity_id: payload.evaluationRunId,
      payload: {
        mode: 'workspace_live',
        documentSetHash: production.documentSetHash,
        sourcePackageHash: production.sourcePackageHash,
        callPlanHash: plan.planHash,
        compatibilityFingerprint: run.compatibility_fingerprint,
      },
    });

    const cachedByKey = new Map((cacheProbe.data ?? []).map((row) => [row.cache_key, row]));
    const blockById = new Map(production.blocks.map((block) => [block.id, block]));
    const candidateById = new Map(
      production.reduction.candidates.map((candidate) => [candidate.id, candidate]),
    );
    const results = new Map<string, unknown>();
    let gateway: Phase9ProviderGateway | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let latencyMs = 0;

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
      gateway ??= new Phase9ProviderGateway(plan, {
        apiKey: env.OPENAI_API_KEY,
        timeoutMs: 90_000,
      });
      const result = await gateway.execute({ task, blocks, candidates });
      providerCalls++;
      actualCostUsd += result.costUsd;
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      reasoningTokens += result.reasoningTokens;
      latencyMs += result.latencyMs;
      results.set(task.id, result.result);

      const cacheWrite = await admin.from('phase9_provider_cache').upsert(
        {
          workspace_id: payload.workspaceId,
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
      if (cacheWrite.error)
        throw new Error(`phase9_workspace_cache_write:${cacheWrite.error.message}`);
      const usageWrite = await admin.from('phase9_provider_usage').insert({
        workspace_id: payload.workspaceId,
        evaluation_run_id: payload.evaluationRunId,
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
      if (usageWrite.error)
        throw new Error(`phase9_workspace_usage_write:${usageWrite.error.message}`);
    }

    const aiSeeds: Phase9CandidateSeed[] = [];
    const semanticByCandidate = new Map<
      string,
      ReturnType<typeof phase9CompactVerificationOutputSchema.parse>['results'][number]
    >();
    for (const task of plan.tasks) {
      const result = results.get(task.id);
      if (task.taskType === 'targeted_extraction') {
        for (const item of phase9CompactExtractionOutputSchema.parse(result).candidates) {
          const documentId = blockById.get(item.sourceBlockIds[0]!)?.documentId;
          if (!documentId) continue;
          aiSeeds.push(
            phase9CandidateSeedSchema.parse({
              id: phase9StableHash([
                'phase9-workspace-ai-seed-v1',
                item.sourceBlockIds,
                item.requirementType,
                item.obligationText,
                item.evidenceText,
              ]),
              ...item,
              documentId,
              deterministicSignals: ['ai_targeted'],
              discoveryRoute: 'ai_targeted',
              minerVersion: PHASE9_MINER_VERSION,
            }),
          );
        }
      } else if (task.taskType === 'independent_verification') {
        for (const item of phase9CompactVerificationOutputSchema.parse(result).results)
          semanticByCandidate.set(item.candidateId, item);
      }
    }
    const dedupedAiSeeds = [
      ...new Map(aiSeeds.map((candidate) => [candidate.id, candidate])).values(),
    ];
    const refinedAiSeeds = refinePhase9WorkspaceCandidates(dedupedAiSeeds).candidates;
    if (refinedAiSeeds.length) {
      const aiSeedWrite = await admin.from('phase9_candidate_seeds').insert(
        refinedAiSeeds.map((candidate) => ({
          workspace_id: payload.workspaceId,
          evaluation_run_id: payload.evaluationRunId,
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
      if (aiSeedWrite.error)
        throw new Error(`phase9_workspace_ai_seed_write:${aiSeedWrite.error.message}`);
    }

    const findings: Phase9FinalFinding[] = [];
    for (const candidate of production.reduction.candidates) {
      const semanticResult = semanticByCandidate.get(candidate.id);
      const finding = finalizePhase9Finding({
        candidate,
        blocks: production.blocks,
        ...(semanticResult ? { semanticResult } : {}),
        precedenceStatus: phase9PrecedenceForEvidence(
          candidate.evidenceText,
          production.amendmentRelationships,
        ),
      });
      if (finding) findings.push(finding);
    }
    if (findings.length) {
      const findingWrite = await admin.from('phase9_findings').insert(
        findings.map((finding) => ({
          workspace_id: payload.workspaceId,
          evaluation_run_id: payload.evaluationRunId,
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
      if (findingWrite.error)
        throw new Error(`phase9_workspace_finding_write:${findingWrite.error.message}`);
    }

    const dependencyEdges = [
      ...production.reduction.candidates.flatMap((candidate) =>
        candidate.sourceBlockIds.map((blockId) => ({
          workspace_id: payload.workspaceId,
          evaluation_run_id: payload.evaluationRunId,
          source_kind: 'source_block',
          source_key: blockId,
          target_kind: 'candidate',
          target_key: candidate.id,
          dependency_version: 'phase9-dependency-graph-v1',
        })),
      ),
      ...findings.map((finding) => ({
        workspace_id: payload.workspaceId,
        evaluation_run_id: payload.evaluationRunId,
        source_kind: 'candidate',
        source_key: finding.candidateId,
        target_kind: 'finding',
        target_key: finding.candidateId,
        dependency_version: 'phase9-dependency-graph-v1',
      })),
    ];
    for (const batch of chunks(dependencyEdges)) {
      if (!batch.length) continue;
      const edgeWrite = await admin.from('phase9_dependency_edges').insert(batch);
      if (edgeWrite.error)
        throw new Error(`phase9_workspace_dependency_write:${edgeWrite.error.message}`);
    }

    actualCostUsd = Number(actualCostUsd.toFixed(6));
    if (reservationId)
      await settlePhase9CallPlan({ admin, reservationId, actualUsd: actualCostUsd });
    const complete = await admin
      .from('phase9_evaluation_runs')
      .update({
        status: 'completed',
        actual_usd: actualCostUsd,
        provider_call_count: providerCalls,
        cache_hit_count: plan.tasks.length - providerCalls,
        completed_at: new Date().toISOString(),
        error_category: null,
      })
      .eq('id', payload.evaluationRunId)
      .eq('workspace_id', payload.workspaceId);
    if (complete.error)
      throw new Error(`phase9_workspace_completion_failed:${complete.error.message}`);
    await admin.from('audit_events').insert({
      workspace_id: payload.workspaceId,
      actor_type: 'system',
      actor_id: run.actor_id,
      event_type: 'analysis_completed',
      entity_type: 'phase9_evaluation_run',
      entity_id: payload.evaluationRunId,
      payload: {
        documents: production.documents.length,
        sourceBlocks: production.blocks.length,
        deterministicCandidates: production.reduction.candidates.length,
        aiCandidatesPendingVerification: dedupedAiSeeds.length,
        findings: findings.length,
        providerCalls,
        inputTokens,
        outputTokens,
        reasoningTokens,
        latencyMs,
        actualCostUsd,
        machineOnly: true,
        humanReviewStatus: 'pending',
      },
    });
  } catch (error) {
    if (reservationId) {
      if (actualCostUsd > 0)
        await settlePhase9CallPlan({
          admin,
          reservationId,
          actualUsd: Number(actualCostUsd.toFixed(6)),
        }).catch(() => undefined);
      else await releasePhase9CallPlan({ admin, reservationId }).catch(() => undefined);
    }
    const category = classifyPhase9WorkspaceFailure(error);
    const run = await admin
      .from('phase9_evaluation_runs')
      .select('actor_id')
      .eq('id', payload.evaluationRunId)
      .eq('workspace_id', payload.workspaceId)
      .maybeSingle();
    await admin
      .from('phase9_evaluation_runs')
      .update({
        status: 'failed',
        actual_usd: Number(actualCostUsd.toFixed(6)),
        provider_call_count: providerCalls,
        error_category: category,
        completed_at: new Date().toISOString(),
      })
      .eq('id', payload.evaluationRunId)
      .eq('workspace_id', payload.workspaceId);
    await admin.from('audit_events').insert({
      workspace_id: payload.workspaceId,
      actor_type: 'system',
      actor_id: run.data?.actor_id ?? null,
      event_type: 'analysis_failed',
      entity_type: 'phase9_evaluation_run',
      entity_id: payload.evaluationRunId,
      payload: {
        errorCategory: category,
        providerCalls,
        actualCostUsd: Number(actualCostUsd.toFixed(6)),
        failClosed: true,
      },
    });
    throw error;
  }
}
