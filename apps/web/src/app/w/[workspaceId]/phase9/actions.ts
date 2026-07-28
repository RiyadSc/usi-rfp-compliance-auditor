'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  PHASE9_MINER_VERSION,
  PHASE9_WORKSPACE_EVALUATOR_VERSION,
  PHASE9_WORKSPACE_PLAN_VERSION,
  buildPhase9WorkspaceProductionPlan,
  phase9CompatibilityFingerprint,
  phase9PromptFingerprint,
  phase9StableHash,
  type Phase9WorkspaceDocument,
} from '@usi/ai';
import { phase9CoverageReviewInputSchema, phase9FindingReviewInputSchema } from '@usi/domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { enqueuePhase9WorkspaceAnalysis } from '@/lib/jobs';
import { enforceRateLimit } from '@/lib/hardening/service';

const startSchema = z.object({
  workspaceId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(40),
  maximumUsd: z.number().positive().max(3),
  budgetConfirmed: z.literal(true),
  publicOrAuthorizedDataConfirmed: z.literal(true),
});

const chunks = <T>(items: T[], size = 400) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export async function startPhase9WorkspaceAnalysisAction(rawInput: {
  workspaceId: string;
  documentIds: string[];
  maximumUsd: number;
  budgetConfirmed: boolean;
  publicOrAuthorizedDataConfirmed: boolean;
}): Promise<
  | { ok: true; evaluationRunId: string; plannedMaximumUsd: number; taskCount: number }
  | { ok: false; error: string }
> {
  try {
    const input = startSchema.parse(rawInput);
    const env = serverEnv();
    if (!env.PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED)
      throw new Error('Live analysis is disabled by the server administrator.');
    if (!env.OPENAI_API_KEY)
      throw new Error('The live analysis provider is not available in this runtime.');
    if (input.maximumUsd > env.PHASE9_LIVE_MAX_USD_PER_RUN)
      throw new Error(
        `Maximum cost must be $${env.PHASE9_LIVE_MAX_USD_PER_RUN.toFixed(2)} or less.`,
      );

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const membership = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership.data || membership.data.role !== 'owner')
      throw new Error('Only a workspace owner can authorize provider spend.');
    await enforceRateLimit({
      operation: 'verification_request',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });

    const uniqueDocumentIds = [...new Set(input.documentIds)].sort();
    if (uniqueDocumentIds.length !== input.documentIds.length)
      throw new Error('Each document may be selected only once.');
    const admin = createSupabaseAdminClient();
    const [documentResult, pageResult] = await Promise.all([
      admin
        .from('documents')
        .select(
          'id,workspace_id,normalized_filename,sha256,source_format,document_type,status,page_count',
        )
        .eq('workspace_id', input.workspaceId)
        .in('id', uniqueDocumentIds)
        .is('deleted_at', null),
      admin
        .from('document_pages')
        .select('document_id,workspace_id,page_number,text,extraction_status')
        .eq('workspace_id', input.workspaceId)
        .in('document_id', uniqueDocumentIds)
        .order('page_number'),
    ]);
    if (documentResult.error || pageResult.error)
      throw new Error('Selected documents could not be loaded.');
    if (documentResult.data?.length !== uniqueDocumentIds.length)
      throw new Error('A selected document is missing or belongs to another workspace.');
    const documents = documentResult.data ?? [];
    if (
      documents.some(
        (document) =>
          document.status !== 'parsed' ||
          document.document_type === 'proposal_draft' ||
          document.document_type === 'expected_answer' ||
          !document.sha256,
      )
    )
      throw new Error('Only parsed RFP, addendum, attachment, or reference documents are allowed.');
    const pages = pageResult.data ?? [];
    if (pages.length > env.MAX_PAGES_PER_WORKSPACE)
      throw new Error(
        `This selection has ${pages.length} pages; the configured maximum is ${env.MAX_PAGES_PER_WORKSPACE}.`,
      );

    const planDocuments: Phase9WorkspaceDocument[] = documents.map((document) => {
      const documentPages = pages.filter((page) => page.document_id === document.id);
      if (!documentPages.length || documentPages.length !== Number(document.page_count))
        throw new Error(`Parsed page records are incomplete for ${document.normalized_filename}.`);
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

    const initial = buildPhase9WorkspaceProductionPlan({
      workspaceId: input.workspaceId,
      documents: planDocuments,
    });
    const cacheResult = initial.callPlan.tasks.length
      ? await admin
          .from('phase9_provider_cache')
          .select('cache_key,result,result_hash,status,schema_adherent')
          .eq('workspace_id', input.workspaceId)
          .in(
            'cache_key',
            initial.callPlan.tasks.map((task) => task.cacheKey),
          )
      : { data: [], error: null };
    if (cacheResult.error) throw new Error('Provider cache preflight failed.');
    const validCacheKeys = new Set(
      (cacheResult.data ?? [])
        .filter(
          (row) =>
            row.status === 'complete' &&
            row.schema_adherent === true &&
            phase9StableHash(row.result) === row.result_hash,
        )
        .map((row) => row.cache_key),
    );
    const production = buildPhase9WorkspaceProductionPlan({
      workspaceId: input.workspaceId,
      documents: planDocuments,
      cachedKeys: validCacheKeys,
    });
    if (production.callPlan.hardMaximumUsd > input.maximumUsd)
      throw new Error(
        `This exact call plan can cost up to $${production.callPlan.hardMaximumUsd.toFixed(2)}. Raise your confirmed per-run maximum or select fewer documents.`,
      );

    const evaluationRunId = randomUUID();
    const compatibilityFingerprint = phase9CompatibilityFingerprint();
    const expectedAnswerHash = phase9StableHash({
      kind: 'no_expected_answers',
      documentSetHash: production.documentSetHash,
      version: PHASE9_WORKSPACE_EVALUATOR_VERSION,
    });
    const runInsert = await admin.from('phase9_evaluation_runs').insert({
      id: evaluationRunId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      mode: 'workspace_live',
      status: 'planned',
      source_package_hash: production.sourcePackageHash,
      document_set_hash: production.documentSetHash,
      expected_answer_hash: expectedAnswerHash,
      expected_answers_used: false,
      call_plan_hash: production.callPlan.planHash,
      compatibility_fingerprint: compatibilityFingerprint,
      versions: {
        workspacePlan: PHASE9_WORKSPACE_PLAN_VERSION,
        evaluator: PHASE9_WORKSPACE_EVALUATOR_VERSION,
        recovery: production.recoveryVersion,
        coverage: 'phase9-source-coverage-v1',
        miner: PHASE9_MINER_VERSION,
        callPlan: production.callPlan.version,
        purpose: 'jurisdiction-neutral-workspace-analysis',
      },
      planned_maximum_usd: production.callPlan.hardMaximumUsd,
      requested_maximum_usd: input.maximumUsd,
      cache_hit_count:
        production.callPlan.tasks.length -
        production.callPlan.tasks.filter((task) => !validCacheKeys.has(task.cacheKey)).length,
    });
    if (runInsert.error)
      throw new Error(`Could not create analysis run: ${runInsert.error.message}`);

    const blockById = new Map(production.blocks.map((block) => [block.id, block]));
    const writes: Array<{ name: string; error?: { message: string } | null }> = [];
    const documentWrite = await admin.from('phase9_evaluation_documents').insert(
      production.documents.map((document, ordinal) => ({
        workspace_id: input.workspaceId,
        evaluation_run_id: evaluationRunId,
        document_id: document.id,
        source_hash: document.sourceHash,
        ordinal,
        page_count: document.pageCount,
      })),
    );
    writes.push({ name: 'document bindings', error: documentWrite.error });
    for (const batch of chunks(production.coverage)) {
      const result = await admin.from('phase9_source_block_coverage').insert(
        batch.map((record) => {
          const block = blockById.get(record.blockId)!;
          return {
            workspace_id: input.workspaceId,
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
      writes.push({ name: 'source coverage', error: result.error });
    }
    for (const batch of chunks(production.reduction.candidates)) {
      const result = await admin.from('phase9_candidate_seeds').insert(
        batch.map((candidate) => ({
          workspace_id: input.workspaceId,
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
      writes.push({ name: 'candidate seeds', error: result.error });
    }
    const planWrite = await admin
      .from('phase9_call_plans')
      .insert({
        workspace_id: input.workspaceId,
        evaluation_run_id: evaluationRunId,
        plan_hash: production.callPlan.planHash,
        source_package_hash: production.sourcePackageHash,
        plan: production.callPlan,
        task_count: production.callPlan.tasks.length,
        maximum_usd: production.callPlan.hardMaximumUsd,
        plan_version: production.callPlan.version,
      })
      .select('id')
      .single();
    writes.push({ name: 'call plan', error: planWrite.error });
    if (planWrite.data) {
      const taskWrite = await admin.from('phase9_call_plan_tasks').insert(
        production.callPlan.tasks.map((task) => ({
          workspace_id: input.workspaceId,
          call_plan_id: planWrite.data.id,
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
      );
      writes.push({ name: 'call plan tasks', error: taskWrite.error });
    }
    const failedWrite = writes.find((write) => write.error);
    if (failedWrite) {
      await admin
        .from('phase9_evaluation_runs')
        .update({
          status: 'failed',
          error_category: 'phase9_workspace_preparation_failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', evaluationRunId);
      throw new Error(`${failedWrite.name} could not be persisted: ${failedWrite.error?.message}`);
    }

    const policyWrite = await admin.from('phase9_live_budget_policies').upsert({
      workspace_id: input.workspaceId,
      enabled: true,
      per_run_maximum_usd: env.PHASE9_LIVE_MAX_USD_PER_RUN,
      monthly_maximum_usd: env.PHASE9_LIVE_MONTHLY_WORKSPACE_CEILING_USD,
      policy_version: 'phase9-workspace-budget-v1',
      configured_by: user.id,
    });
    if (policyWrite.error) {
      await admin
        .from('phase9_evaluation_runs')
        .update({
          status: 'failed',
          error_category: 'phase9_workspace_budget_policy_failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', evaluationRunId);
      throw new Error(`Workspace budget policy could not be applied: ${policyWrite.error.message}`);
    }

    const queueJobId = await enqueuePhase9WorkspaceAnalysis({
      workspaceId: input.workspaceId,
      evaluationRunId,
    });
    if (!queueJobId) {
      await admin
        .from('phase9_evaluation_runs')
        .update({
          status: 'failed',
          error_category: 'phase9_workspace_queue_failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', evaluationRunId);
      throw new Error('Live analysis could not be queued. No provider call was made.');
    }
    await admin.from('audit_events').insert({
      workspace_id: input.workspaceId,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'analysis_started',
      entity_type: 'phase9_evaluation_run',
      entity_id: evaluationRunId,
      payload: {
        queued: true,
        documents: production.documents.map((document) => document.id),
        documentSetHash: production.documentSetHash,
        sourcePackageHash: production.sourcePackageHash,
        callPlanHash: production.callPlan.planHash,
        compatibilityFingerprint,
        requestedMaximumUsd: input.maximumUsd,
        plannedMaximumUsd: production.callPlan.hardMaximumUsd,
        expectedAnswersUsed: false,
      },
    });
    revalidatePath(`/w/${input.workspaceId}/phase9`);
    return {
      ok: true,
      evaluationRunId,
      plannedMaximumUsd: production.callPlan.hardMaximumUsd,
      taskCount: production.callPlan.tasks.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Live analysis could not be started.',
    };
  }
}

export async function recordPhase9FindingReviewAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  candidateHash: string;
  decision: string;
  note?: string;
  corrections?: {
    title?: string;
    category?: string;
    mandatoryClass?: string;
  };
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  try {
    const input = phase9FindingReviewInputSchema.parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', input.workspaceId)
      .maybeSingle();
    if (!workspace) throw new Error('Workspace not found');
    await enforceRateLimit({
      operation: 'verification_request',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = await supabase.rpc('record_phase9_finding_review', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
      p_candidate_hash: input.candidateHash,
      p_decision: input.decision,
      p_note: input.note,
      p_corrections: input.corrections,
    });
    if (error) throw error;
    revalidatePath(`/w/${input.workspaceId}`);
    revalidatePath(`/w/${input.workspaceId}/phase9`);
    return { ok: true, decisionId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not record finding review.',
    };
  }
}

export async function recordPhase9CoverageReviewAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  documentId: string;
  pageNumber: number;
  decision: string;
  note?: string;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  try {
    const input = phase9CoverageReviewInputSchema.parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', input.workspaceId)
      .maybeSingle();
    if (!workspace) throw new Error('Workspace not found');
    await enforceRateLimit({
      operation: 'verification_request',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = await supabase.rpc('record_phase9_coverage_review', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
      p_source_document_id: input.documentId,
      p_page_number: input.pageNumber,
      p_decision: input.decision,
      p_note: input.note,
    });
    if (error) throw error;
    revalidatePath(`/w/${input.workspaceId}`);
    revalidatePath(`/w/${input.workspaceId}/phase9`);
    return { ok: true, decisionId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not record coverage review.',
    };
  }
}

export async function publishReviewedPhase9FindingsAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
}): Promise<
  | {
      ok: true;
      bridgeRunId: string;
      analysisRunId: string;
      verificationRunId: string;
      publishedCount: number;
      reused: boolean;
    }
  | { ok: false; error: string }
> {
  try {
    const input = z
      .object({
        workspaceId: z.string().uuid(),
        evaluationRunId: z.string().uuid(),
      })
      .parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership || membership.role !== 'owner')
      throw new Error('Only the workspace owner can publish reviewed requirements.');
    await enforceRateLimit({
      operation: 'verification_request',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = await supabase.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
    });
    if (error) throw error;
    const result = z
      .object({
        bridgeRunId: z.string().uuid(),
        analysisRunId: z.string().uuid(),
        verificationRunId: z.string().uuid(),
        publishedCount: z.number().int().positive(),
        reused: z.boolean(),
      })
      .parse(data);
    revalidatePath(`/w/${input.workspaceId}`);
    revalidatePath(`/w/${input.workspaceId}/phase9`);
    revalidatePath(`/w/${input.workspaceId}/requirements`);
    revalidatePath(`/w/${input.workspaceId}/checklist`);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not publish reviewed requirements.',
    };
  }
}
