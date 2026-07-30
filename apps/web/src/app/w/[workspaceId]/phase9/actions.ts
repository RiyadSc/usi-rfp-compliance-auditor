'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
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
import {
  phase9BatchActionSchema,
  phase9CoverageReviewInputSchema,
  phase9FindingReviewInputSchema,
} from '@usi/domain';
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

function actionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

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
  reviewSessionId?: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  try {
    const input = phase9FindingReviewInputSchema
      .and(
        z.object({
          reviewSessionId: z.string().uuid().optional(),
          idempotencyKey: z.string().uuid().optional(),
        }),
      )
      .refine(
        (value) => Boolean(value.reviewSessionId) === Boolean(value.idempotencyKey),
        'Review session and idempotency key must be supplied together.',
      )
      .parse(rawInput);
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
      operation: 'phase9_review_workflow',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = input.reviewSessionId
      ? await supabase.rpc('record_phase9_finding_review_accelerated', {
          p_workspace_id: input.workspaceId,
          p_evaluation_run_id: input.evaluationRunId,
          p_candidate_hash: input.candidateHash,
          p_decision: input.decision,
          p_note: input.note,
          p_corrections: input.corrections,
          p_review_session_id: input.reviewSessionId,
          p_idempotency_key: input.idempotencyKey,
        })
      : await supabase.rpc('record_phase9_finding_review', {
          p_workspace_id: input.workspaceId,
          p_evaluation_run_id: input.evaluationRunId,
          p_candidate_hash: input.candidateHash,
          p_decision: input.decision,
          p_note: input.note,
          p_corrections: input.corrections,
        });
    if (error) throw error;
    // Return before cache work so the reviewer UI can advance focus immediately.
    after(() => {
      revalidatePath(`/w/${input.workspaceId}/phase9`);
    });
    return { ok: true, decisionId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'Could not record finding review.'),
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
  reviewSessionId?: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  try {
    const input = phase9CoverageReviewInputSchema
      .and(
        z.object({
          reviewSessionId: z.string().uuid().optional(),
          idempotencyKey: z.string().uuid().optional(),
        }),
      )
      .refine(
        (value) => Boolean(value.reviewSessionId) === Boolean(value.idempotencyKey),
        'Review session and idempotency key must be supplied together.',
      )
      .parse(rawInput);
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
      operation: 'phase9_review_workflow',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = input.reviewSessionId
      ? await supabase.rpc('record_phase9_coverage_review_accelerated', {
          p_workspace_id: input.workspaceId,
          p_evaluation_run_id: input.evaluationRunId,
          p_source_document_id: input.documentId,
          p_page_number: input.pageNumber,
          p_decision: input.decision,
          p_note: input.note,
          p_review_session_id: input.reviewSessionId,
          p_idempotency_key: input.idempotencyKey,
        })
      : await supabase.rpc('record_phase9_coverage_review', {
          p_workspace_id: input.workspaceId,
          p_evaluation_run_id: input.evaluationRunId,
          p_source_document_id: input.documentId,
          p_page_number: input.pageNumber,
          p_decision: input.decision,
          p_note: input.note,
        });
    if (error) throw error;
    after(() => {
      revalidatePath(`/w/${input.workspaceId}/phase9`);
    });
    return { ok: true, decisionId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'Could not record coverage review.'),
    };
  }
}

export async function recordPhase9ReviewBatchAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  candidateHashes: string[];
  action: string;
  reason?: string;
  idempotencyKey: string;
  reviewSessionId: string;
}): Promise<
  | {
      ok: true;
      batchOperationId: string;
      selectionCount: number;
      action: string;
      reused: boolean;
    }
  | { ok: false; error: string }
> {
  try {
    const input = z
      .object({
        workspaceId: z.string().uuid(),
        evaluationRunId: z.string().uuid(),
        candidateHashes: z
          .array(z.string().regex(/^[0-9a-f]{64}$/))
          .min(1)
          .max(500),
        action: phase9BatchActionSchema,
        reason: z.string().max(1000).default(''),
        idempotencyKey: z.string().uuid(),
        reviewSessionId: z.string().uuid(),
      })
      .strict()
      .superRefine((value, context) => {
        if (new Set(value.candidateHashes).size !== value.candidateHashes.length)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['candidateHashes'],
            message: 'A finding may appear only once in a batch.',
          });
        if (
          ['reject_duplicate', 'mark_follow_up'].includes(value.action) &&
          value.reason.trim().length < 5
        )
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reason'],
            message: 'This batch decision requires a reason.',
          });
      })
      .parse(rawInput);
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
      operation: 'phase9_review_workflow',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const { data, error } = await supabase.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
      p_candidate_hashes: input.candidateHashes,
      p_action: input.action,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_review_session_id: input.reviewSessionId,
    });
    if (error) throw error;
    const result = z
      .object({
        batchOperationId: z.string().uuid(),
        selectionCount: z.number().int().positive(),
        action: phase9BatchActionSchema,
        reused: z.boolean(),
      })
      .parse(data);
    after(() => {
      revalidatePath(`/w/${input.workspaceId}/phase9`);
    });
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'Could not record batch review.'),
    };
  }
}

export async function recordPhase9ReviewActivityAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  eventType: string;
  reviewSessionId: string;
  idempotencyKey: string;
  candidateHash?: string;
  sourceDocumentId?: string;
  pageNumber?: number;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  try {
    const input = z
      .object({
        workspaceId: z.string().uuid(),
        evaluationRunId: z.string().uuid(),
        eventType: z.enum(['review_session_started', 'finding_opened', 'source_page_opened']),
        reviewSessionId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
        candidateHash: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        sourceDocumentId: z.string().uuid().optional(),
        pageNumber: z.number().int().positive().optional(),
        metadata: z
          .record(z.string(), z.union([z.string().max(120), z.number(), z.boolean(), z.null()]))
          .default({}),
      })
      .strict()
      .parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
      p_event_type: input.eventType,
      p_review_session_id: input.reviewSessionId,
      p_idempotency_key: input.idempotencyKey,
      p_candidate_hash: input.candidateHash ?? null,
      p_source_document_id: input.sourceDocumentId ?? null,
      p_page_number: input.pageNumber ?? null,
      p_metadata: input.metadata,
    });
    if (error) throw error;
    return { ok: true, eventId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not record review activity.',
    };
  }
}

export async function loadPhase9ReviewActivitySummaryAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  reviewSessionId: string;
}): Promise<
  | {
      ok: true;
      summary: {
        elapsedSeconds: number;
        individualDecisions: number;
        batchOperations: number;
        batchDecisions: number;
        sourceOpenings: number;
        decisionsPerMinute: number;
        remainingWork: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    const input = z
      .object({
        workspaceId: z.string().uuid(),
        evaluationRunId: z.string().uuid(),
        reviewSessionId: z.string().uuid(),
      })
      .strict()
      .parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('get_phase9_review_activity_summary', {
      p_workspace_id: input.workspaceId,
      p_evaluation_run_id: input.evaluationRunId,
      p_review_session_id: input.reviewSessionId,
    });
    if (error) throw error;
    const summary = z
      .object({
        version: z.literal('phase9-review-analytics-v1'),
        elapsedSeconds: z.coerce.number().int().nonnegative(),
        individualDecisions: z.coerce.number().int().nonnegative(),
        batchOperations: z.coerce.number().int().nonnegative(),
        batchDecisions: z.coerce.number().int().nonnegative(),
        sourceOpenings: z.coerce.number().int().nonnegative(),
        decisionsPerMinute: z.coerce.number().nonnegative(),
        remainingWork: z.coerce.number().int().nonnegative(),
      })
      .strict()
      .parse(data);
    return { ok: true, summary };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not load review activity.',
    };
  }
}

export async function publishReviewedPhase9FindingsAction(rawInput: {
  workspaceId: string;
  evaluationRunId: string;
  reviewSessionId?: string;
  attemptIdempotencyKey?: string;
  completionIdempotencyKey?: string;
}): Promise<
  | {
      ok: true;
      bridgeRunId: string;
      analysisRunId: string;
      verificationRunId: string;
      publishedCount: number;
      reused: boolean;
      instrumentationWarning?: string;
    }
  | { ok: false; error: string }
> {
  try {
    const input = z
      .object({
        workspaceId: z.string().uuid(),
        evaluationRunId: z.string().uuid(),
        reviewSessionId: z.string().uuid().optional(),
        attemptIdempotencyKey: z.string().uuid().optional(),
        completionIdempotencyKey: z.string().uuid().optional(),
      })
      .refine(
        (value) =>
          !value.reviewSessionId ||
          Boolean(value.attemptIdempotencyKey && value.completionIdempotencyKey),
        'Publication activity identifiers are incomplete.',
      )
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
      operation: 'phase9_review_workflow',
      actorId: user.id,
      workspaceId: input.workspaceId,
    });
    const instrumentationWarnings: string[] = [];
    if (input.reviewSessionId) {
      const attempt = await supabase.rpc('record_phase9_publication_activity_v1', {
        p_workspace_id: input.workspaceId,
        p_evaluation_run_id: input.evaluationRunId,
        p_event_type: 'publication_attempted',
        p_review_session_id: input.reviewSessionId,
        p_idempotency_key: input.attemptIdempotencyKey,
        p_bridge_run_id: null,
      });
      if (attempt.error)
        instrumentationWarnings.push(
          'The non-authoritative publication-attempt activity could not be recorded.',
        );
    }
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
    if (input.reviewSessionId) {
      const completion = await supabase.rpc('record_phase9_publication_activity_v1', {
        p_workspace_id: input.workspaceId,
        p_evaluation_run_id: input.evaluationRunId,
        p_event_type: 'publication_completed',
        p_review_session_id: input.reviewSessionId,
        p_idempotency_key: input.completionIdempotencyKey,
        p_bridge_run_id: result.bridgeRunId,
      });
      if (completion.error)
        instrumentationWarnings.push(
          'Publication succeeded, but the non-authoritative activity summary could not be updated.',
        );
    }
    after(() => {
      revalidatePath(`/w/${input.workspaceId}`);
      revalidatePath(`/w/${input.workspaceId}/phase9`);
      revalidatePath(`/w/${input.workspaceId}/requirements`);
      revalidatePath(`/w/${input.workspaceId}/checklist`);
    });
    return {
      ok: true,
      ...result,
      ...(instrumentationWarnings.length
        ? { instrumentationWarning: instrumentationWarnings.join(' ') }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'Could not publish reviewed requirements.'),
    };
  }
}
