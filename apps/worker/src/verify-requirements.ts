import { createHash } from 'node:crypto';
import {
  CHALLENGE_PROMPT_VERSION,
  CHALLENGE_SCHEMA_VERSION,
  DECISION_ENGINE_VERSION,
  DUPLICATE_PROMPT_VERSION,
  DUPLICATE_SCHEMA_VERSION,
  ENTAILMENT_PROMPT_VERSION,
  ENTAILMENT_SCHEMA_VERSION,
  FACT_ENVELOPE_VERSION,
  applyDuplicateSafetyBlock,
  checkBudget,
  createProvider,
  findExplicitPrecedenceRelationships,
  generateDuplicatePairCandidates,
  normalizeEvidenceText,
  runCandidateVerificationPipeline,
  type ModelCallMetadata,
  type ModelProvider,
  type VerificationCandidateInput,
  type VerificationContext,
  MockProvider,
  validateEvidenceQuote,
} from '@usi/ai';
import { adminClient } from './db.js';
import { env } from './env.js';

export const VERIFICATION_RETRIEVAL_VERSION = 'verify-retrieval-v2-candidate-centered';
export const EVIDENCE_NORMALIZATION_VERSION = 'evidence-nfkc-v1';

export type VerifyJobPayload = {
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  processingJobId: string;
};

type PageRow = {
  id: string;
  workspace_id: string;
  document_id: string;
  page_number: number;
  text: string;
  text_sha256: string;
  extraction_status: string;
  warnings: unknown;
};

type CallStage = 'verify_entailment' | 'verify_challenge' | 'verify_duplicate';

type CandidateRow = {
  id: string;
  document_id: string;
  category: VerificationCandidateInput['category'];
  title: string;
  obligation: string;
  mandatory_class: VerificationCandidateInput['mandatoryClass'];
  preliminary_page: number;
  evidence_quote: string;
};

function asCandidate(row: CandidateRow): VerificationCandidateInput {
  return {
    id: row.id,
    documentId: row.document_id,
    category: row.category,
    title: row.title,
    obligation: row.obligation,
    mandatoryClass: row.mandatory_class,
    preliminaryPage: row.preliminary_page,
    evidenceQuote: row.evidence_quote,
  };
}

function passStatus(call: ModelCallMetadata) {
  return call.refused ? 'refused' : call.incomplete ? 'incomplete' : 'succeeded';
}

export async function handleVerifyJob(
  payload: VerifyJobPayload,
  providerOverride?: ModelProvider,
): Promise<void> {
  const admin = adminClient();
  const provider =
    providerOverride ??
    (env.PHASE4_LIVE_VERIFICATION_ENABLED
      ? createProvider({
          ...(env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {}),
          OPENAI_EXTRACT_MODEL: env.OPENAI_EXTRACT_MODEL,
          OPENAI_VERIFY_MODEL: env.OPENAI_VERIFY_MODEL,
          OPENAI_EMBED_MODEL: env.OPENAI_EMBED_MODEL,
          OPENAI_REASONING_EFFORT: env.OPENAI_REASONING_EFFORT,
        })
      : new MockProvider());

  const { data: run } = await admin
    .from('verification_runs')
    .select('*')
    .eq('id', payload.verificationRunId)
    .maybeSingle();
  if (!run) return;
  if (run.workspace_id !== payload.workspaceId || run.analysis_run_id !== payload.analysisRunId) {
    await failVerification(payload, 'unauthorized', 'Verification job scope mismatch');
    return;
  }
  if (run.status === 'completed') {
    await admin
      .from('processing_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    return;
  }

  const { data: spentRows } = await admin
    .from('spend_ledger')
    .select('estimated_cost_usd')
    .eq('phase', 'phase4');
  const initialSpent = (spentRows ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
    0,
  );
  if (checkBudget(initialSpent, 0.01, env.PHASE4_SPEND_CEILING_USD) === 'exceeded') {
    await budgetCancel(payload, 'Phase 4 spend ceiling reached');
    return;
  }

  let runCost = 0;
  let budgetExceeded = false;
  const persistCall = async (input: {
    candidateId: string;
    targetCandidateId?: string;
    stage: CallStage;
    passType: 'entailment' | 'challenge' | 'duplicate';
    promptVersion: string;
    schemaVersion: string;
    call: ModelCallMetadata;
    result: unknown;
  }) => {
    const wouldExceed =
      checkBudget(
        initialSpent + runCost,
        input.call.estimatedCostUsd,
        env.PHASE4_SPEND_CEILING_USD,
      ) === 'exceeded';
    const status = wouldExceed ? 'cancelled' : passStatus(input.call);
    const { error: callError } = await admin.from('model_calls').insert({
      workspace_id: payload.workspaceId,
      analysis_run_id: payload.analysisRunId,
      verification_run_id: run.id,
      stage: input.stage,
      provider: provider.name,
      model: input.call.modelId,
      provider_request_id: input.call.providerRequestId,
      prompt_version: input.promptVersion,
      schema_version: input.schemaVersion,
      input_tokens: input.call.promptTokens,
      output_tokens: input.call.completionTokens,
      reasoning_tokens: input.call.reasoningTokens,
      cached_tokens: input.call.cachedTokens,
      latency_ms: input.call.latencyMs,
      estimated_cost_usd: input.call.estimatedCostUsd,
      retries: input.call.retries,
      repair_attempts: input.call.repairAttempts,
      status,
      error_category: wouldExceed ? 'budget' : null,
      incomplete_reason: input.call.incompleteReason ?? null,
    });
    if (callError) throw callError;
    if (input.call.estimatedCostUsd > 0) {
      const { error: spendError } = await admin.from('spend_ledger').insert({
        workspace_id: payload.workspaceId,
        analysis_run_id: payload.analysisRunId,
        phase: 'phase4',
        kind: 'verify',
        estimated_cost_usd: input.call.estimatedCostUsd,
        note: `${input.stage}:${run.id}:${input.candidateId}`,
      });
      if (spendError) throw spendError;
      runCost += input.call.estimatedCostUsd;
    }
    if (wouldExceed) {
      budgetExceeded = true;
      throw new Error('Phase 4 ceiling would be exceeded by verification call');
    }
    const { error: passError } = await admin.from('verification_pass_results').insert({
      workspace_id: payload.workspaceId,
      analysis_run_id: payload.analysisRunId,
      verification_run_id: run.id,
      candidate_id: input.candidateId,
      target_candidate_id: input.targetCandidateId ?? null,
      pass_type: input.passType,
      status: passStatus(input.call),
      prompt_version: input.promptVersion,
      schema_version: input.schemaVersion,
      model_id: input.call.modelId,
      provider_request_id: input.call.providerRequestId,
      result: input.result,
      error_category: input.call.refused ? 'refusal' : input.call.incomplete ? 'incomplete' : null,
      error_detail: input.call.incompleteReason ?? null,
    });
    if (passError) throw passError;
  };

  await admin
    .from('verification_runs')
    .update({
      status: 'retrieving',
      started_at: new Date().toISOString(),
      provider: provider.name,
      model: env.OPENAI_VERIFY_MODEL,
      reasoning_effort: env.OPENAI_REASONING_EFFORT,
    })
    .eq('id', run.id);
  await admin
    .from('processing_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', payload.processingJobId);

  try {
    const { data: candidateRows, error: candidateError } = await admin
      .from('requirement_candidates')
      .select(
        'id, workspace_id, analysis_run_id, document_id, category, title, obligation, mandatory_class, preliminary_page, evidence_quote',
      )
      .eq('workspace_id', payload.workspaceId)
      .eq('analysis_run_id', payload.analysisRunId)
      .order('created_at');
    if (candidateError) throw candidateError;
    if (!candidateRows?.length)
      throw new Error('No immutable extraction candidates available for verification');
    const candidates = candidateRows.map(asCandidate);

    const { data: documents } = await admin
      .from('documents')
      .select('id, document_type')
      .eq('workspace_id', payload.workspaceId)
      .is('deleted_at', null);
    const documentMap = new Map((documents ?? []).map((document) => [document.id, document]));
    const { data: rawPages, error: pageError } = await admin
      .from('document_pages')
      .select(
        'id, workspace_id, document_id, page_number, text, text_sha256, extraction_status, warnings',
      )
      .eq('workspace_id', payload.workspaceId)
      .order('document_id')
      .order('page_number');
    if (pageError) throw pageError;
    const pages = (rawPages ?? []) as PageRow[];
    const pageByKey = new Map(
      pages.map((page) => [`${page.document_id}:${page.page_number}`, page]),
    );
    const availableContexts: VerificationContext[] = pages.map((page) => ({
      chunkId: page.id,
      documentId: page.document_id,
      documentType: documentMap.get(page.document_id)?.document_type ?? 'unknown',
      pageNumber: page.page_number,
      text: page.text ?? '',
      extractionStatus: page.extraction_status,
      parserWarnings: Array.isArray(page.warnings) ? page.warnings.map(String) : [],
      retrievalReason: 'candidate_centered_retrieval_pool',
    }));

    await admin.from('verification_runs').update({ status: 'verifying' }).eq('id', run.id);
    const findings = new Map<string, string>();
    let findingCount = 0;
    let incompletePipeline = false;

    for (const candidate of candidates) {
      const result = await runCandidateVerificationPipeline({
        provider,
        workspaceId: payload.workspaceId,
        analysisRunId: payload.analysisRunId,
        verificationRunId: run.id,
        candidate,
        availableContexts,
        maxContexts: 8,
        maxOutputTokens: Math.min(Math.max(env.MAX_OUTPUT_TOKENS, 1800), 4000),
        onEnvelope: async (facts, contexts) => {
          const retrievalRows = contexts.map((context, index) => {
            const page = pageByKey.get(`${context.documentId}:${context.pageNumber}`)!;
            return {
              workspace_id: payload.workspaceId,
              analysis_run_id: payload.analysisRunId,
              verification_run_id: run.id,
              candidate_id: candidate.id,
              chunk_id: null,
              document_id: context.documentId,
              document_page_id: page.id,
              page_number: context.pageNumber,
              retrieval_reason:
                context.documentId === candidate.documentId &&
                context.pageNumber === candidate.preliminaryPage
                  ? 'candidate_cited_page'
                  : context.retrievalReason,
              retrieval_rank: index + 1,
              score: null,
              text_sha256: page.text_sha256,
            };
          });
          if (retrievalRows.length) {
            const { error } = await admin
              .from('verification_retrieval_chunks')
              .upsert(retrievalRows, {
                onConflict: 'verification_run_id,candidate_id,document_page_id,retrieval_reason',
                ignoreDuplicates: true,
              });
            if (error) throw error;
          }
          const contextHash = createHash('sha256')
            .update(JSON.stringify(facts.evidenceSourceHashes))
            .digest('hex');
          const { error } = await admin.from('verification_fact_envelopes').insert({
            workspace_id: payload.workspaceId,
            analysis_run_id: payload.analysisRunId,
            verification_run_id: run.id,
            candidate_id: candidate.id,
            envelope_version: FACT_ENVELOPE_VERSION,
            context_hash: contextHash,
            payload: facts,
          });
          if (error) throw error;
        },
        onEntailmentCall: async (call) =>
          persistCall({
            candidateId: candidate.id,
            stage: 'verify_entailment',
            passType: 'entailment',
            promptVersion: ENTAILMENT_PROMPT_VERSION,
            schemaVersion: ENTAILMENT_SCHEMA_VERSION,
            call,
            result: call.result,
          }),
        onChallengeCall: async (call) =>
          persistCall({
            candidateId: candidate.id,
            stage: 'verify_challenge',
            passType: 'challenge',
            promptVersion: CHALLENGE_PROMPT_VERSION,
            schemaVersion: CHALLENGE_SCHEMA_VERSION,
            call,
            result: call.result,
          }),
      });

      if (!result.finalAssessment) {
        incompletePipeline = true;
        await persistFailedPass(
          payload,
          result.failedStage ?? 'entailment',
          candidate.id,
          provider.name,
          result.error ?? 'Verification pass failed before producing metadata',
        );
        continue;
      }
      if (result.failedStage === 'challenge' && !result.challengeCall) {
        await persistFailedPass(
          payload,
          'challenge',
          candidate.id,
          provider.name,
          result.error ?? 'Challenge pass failed before producing metadata',
        );
      }

      await admin.from('verification_runs').update({ status: 'post_validating' }).eq('id', run.id);
      const { data: previous } = await admin
        .from('verification_findings')
        .select('finding_version')
        .eq('candidate_id', candidate.id)
        .order('finding_version', { ascending: false })
        .limit(1);
      const final = result.finalAssessment;
      const { data: inserted, error: findingError } = await admin
        .from('verification_findings')
        .insert({
          workspace_id: payload.workspaceId,
          analysis_run_id: payload.analysisRunId,
          verification_run_id: run.id,
          candidate_id: candidate.id,
          finding_version: Number(previous?.[0]?.finding_version ?? 0) + 1,
          source_support_status: final.sourceSupportStatus,
          precedence_status: final.precedenceStatus,
          proof_requirement: final.proofRequirement,
          rationale: final.rationale,
          material_mismatches: final.materialMismatches,
          deterministic_facts: result.facts,
          parser_concerns: final.parserConcerns,
          ambiguity_notes: final.ambiguityNotes,
          prompt_version: `${ENTAILMENT_PROMPT_VERSION}+${CHALLENGE_PROMPT_VERSION}`,
          schema_version: `${ENTAILMENT_SCHEMA_VERSION}+${CHALLENGE_SCHEMA_VERSION}`,
          decision_engine_version: DECISION_ENGINE_VERSION,
          deterministic_model_disagreement: final.deterministicModelDisagreement,
          challenge_status: final.challengeStatus,
          model_id:
            result.challengeCall?.modelId ?? result.entailmentCall?.modelId ?? provider.name,
          provider_request_id:
            result.challengeCall?.providerRequestId ?? result.entailmentCall?.providerRequestId,
        })
        .select('id')
        .single();
      if (findingError || !inserted) throw findingError ?? new Error('Finding insert failed');
      findings.set(candidate.id, inserted.id);
      findingCount += 1;

      for (const [role, references] of [
        ['supporting', final.supportingEvidence],
        ['contradicting', final.contradictingEvidence],
      ] as const) {
        for (const reference of references) {
          const page = pageByKey.get(`${reference.documentId}:${reference.pageNumber}`);
          if (!page) continue;
          const match = validateEvidenceQuote(page.text, reference.quote);
          const { error } = await admin.from('verification_evidence').insert({
            workspace_id: payload.workspaceId,
            finding_id: inserted.id,
            document_id: reference.documentId,
            document_page_id: page.id,
            page_number: reference.pageNumber,
            evidence_role: role,
            quote_exact: reference.quote,
            quote_normalized: normalizeEvidenceText(reference.quote),
            normalization_version: EVIDENCE_NORMALIZATION_VERSION,
            match_type: match.matchType,
            start_offset: match.startOffset,
            end_offset: match.endOffset,
            validated: ['exact', 'normalized_exact'].includes(match.matchType),
          });
          if (error) throw error;
        }
      }
      if (result.failedStage === 'challenge') incompletePipeline = true;
    }

    for (const relationship of findExplicitPrecedenceRelationships(candidates, availableContexts)) {
      const findingId = findings.get(relationship.sourceCandidateId);
      if (!findingId) continue;
      const { error } = await admin.from('requirement_relationships').upsert(
        {
          workspace_id: payload.workspaceId,
          verification_run_id: run.id,
          finding_id: findingId,
          source_candidate_id: relationship.sourceCandidateId,
          target_candidate_id: relationship.targetCandidateId,
          relationship_type: relationship.relationshipType,
          rationale: 'Explicit amendment relationship derived from quoted source language.',
          original_document_id: relationship.originalDocumentId,
          original_page_number: relationship.originalPageNumber,
          addendum_document_id: relationship.addendumDocumentId,
          addendum_page_number: relationship.addendumPageNumber,
          precedence_quote: relationship.precedenceQuote,
          deterministic_metadata: relationship.deterministicMetadata,
          relationship_version: 'precedence-relationship-v2',
          machine_assessment: 'machine_proposal_only',
        },
        {
          onConflict:
            'verification_run_id,source_candidate_id,target_candidate_id,relationship_type',
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }

    for (const pair of generateDuplicatePairCandidates(candidates)) {
      if (budgetExceeded) break;
      let call;
      try {
        call = await provider.classifyDuplicatePair({
          workspaceId: payload.workspaceId,
          analysisRunId: payload.analysisRunId,
          verificationRunId: run.id,
          source: pair.source,
          target: pair.target,
          deterministicMaterialDifferences: pair.materialDifferences,
          maxOutputTokens: 1000,
        });
        await persistCall({
          candidateId: pair.source.id,
          targetCandidateId: pair.target.id,
          stage: 'verify_duplicate',
          passType: 'duplicate',
          promptVersion: DUPLICATE_PROMPT_VERSION,
          schemaVersion: DUPLICATE_SCHEMA_VERSION,
          call,
          result: call.result,
        });
      } catch (error) {
        if (budgetExceeded) throw error;
        await persistFailedPass(
          payload,
          'duplicate',
          pair.source.id,
          provider.name,
          error instanceof Error ? error.message : 'Duplicate assessment failed',
          pair.target.id,
        );
        continue;
      }
      if (call.refused || call.incomplete || !call.result) continue;
      const assessed = applyDuplicateSafetyBlock(pair, call.result);
      const findingId = findings.get(pair.source.id);
      if (!findingId) continue;
      const { error } = await admin.from('requirement_relationships').upsert(
        {
          workspace_id: payload.workspaceId,
          verification_run_id: run.id,
          finding_id: findingId,
          source_candidate_id: pair.source.id,
          target_candidate_id: pair.target.id,
          relationship_type: assessed.relationshipType,
          rationale: assessed.rationale,
          deterministic_metadata: {
            material_differences: pair.materialDifferences,
            deterministic_classification: pair.deterministicClassification,
          },
          relationship_version: 'duplicate-pair-v2',
          machine_assessment: 'machine_proposal_only',
        },
        {
          onConflict:
            'verification_run_id,source_candidate_id,target_candidate_id,relationship_type',
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }

    if (budgetExceeded) {
      await budgetCancel(payload, 'Phase 4 ceiling would be exceeded by verification call');
      return;
    }
    const finalRunStatus = incompletePipeline ? 'failed' : 'completed';
    await admin
      .from('verification_runs')
      .update({
        status: finalRunStatus,
        candidate_count: candidates.length,
        finding_count: findingCount,
        estimated_cost_usd: runCost,
        completed_at: new Date().toISOString(),
        error_category: incompletePipeline ? 'verification_pass_failed' : null,
        error_detail: incompletePipeline
          ? 'At least one candidate pass failed; no failed positive was persisted as supported.'
          : null,
      })
      .eq('id', run.id);
    await admin
      .from('processing_jobs')
      .update({
        status: incompletePipeline ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        error_category: incompletePipeline ? 'verification_pass_failed' : null,
      })
      .eq('id', payload.processingJobId);
    await admin.from('audit_events').insert({
      workspace_id: payload.workspaceId,
      actor_type: 'system',
      actor_id: null,
      event_type: incompletePipeline ? 'verification_failed' : 'verification_completed',
      entity_type: 'verification_run',
      entity_id: run.id,
      payload: {
        finding_count: findingCount,
        decision_engine_version: DECISION_ENGINE_VERSION,
        candidate_centered: true,
      },
    });
  } catch (error) {
    if (budgetExceeded) {
      await budgetCancel(payload, 'Phase 4 ceiling would be exceeded by verification call');
      return;
    }
    await failVerification(
      payload,
      'verification_failed',
      error instanceof Error ? error.message : 'Verification failed',
    );
    throw error instanceof Error ? error : new Error('Verification failed');
  }
}

async function persistFailedPass(
  payload: VerifyJobPayload,
  passType: 'entailment' | 'challenge' | 'duplicate',
  candidateId: string,
  modelId: string,
  detail: string,
  targetCandidateId?: string,
) {
  const versions =
    passType === 'entailment'
      ? [ENTAILMENT_PROMPT_VERSION, ENTAILMENT_SCHEMA_VERSION]
      : passType === 'challenge'
        ? [CHALLENGE_PROMPT_VERSION, CHALLENGE_SCHEMA_VERSION]
        : [DUPLICATE_PROMPT_VERSION, DUPLICATE_SCHEMA_VERSION];
  const { error } = await adminClient()
    .from('verification_pass_results')
    .insert({
      workspace_id: payload.workspaceId,
      analysis_run_id: payload.analysisRunId,
      verification_run_id: payload.verificationRunId,
      candidate_id: candidateId,
      target_candidate_id: targetCandidateId ?? null,
      pass_type: passType,
      status: 'failed',
      prompt_version: versions[0],
      schema_version: versions[1],
      model_id: modelId,
      error_category: 'provider_or_persistence_error',
      error_detail: detail.slice(0, 500),
    });
  // A callback can fail after its call result was persisted. Preserve the original
  // immutable record instead of manufacturing a duplicate failure row.
  if (error && !/duplicate key/i.test(error.message ?? '')) throw error;
}

export function verificationInputHash(candidateIds: string[], analysisRunId: string): string {
  return createHash('sha256')
    .update(
      `${analysisRunId}:${[...candidateIds].sort().join(',')}:${ENTAILMENT_PROMPT_VERSION}:${CHALLENGE_PROMPT_VERSION}:${DECISION_ENGINE_VERSION}`,
    )
    .digest('hex');
}

async function budgetCancel(payload: VerifyJobPayload, detail: string) {
  const admin = adminClient();
  await admin
    .from('verification_runs')
    .update({
      status: 'budget_exceeded',
      error_category: 'budget',
      error_detail: detail,
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.verificationRunId);
  await admin
    .from('processing_jobs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', payload.processingJobId);
}

async function failVerification(payload: VerifyJobPayload, category: string, detail: string) {
  const admin = adminClient();
  await admin
    .from('verification_runs')
    .update({
      status: 'failed',
      error_category: category,
      error_detail: detail.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.verificationRunId);
  await admin
    .from('processing_jobs')
    .update({
      status: 'failed',
      error_category: category,
      error_detail: detail.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.processingJobId);
  await admin.from('audit_events').insert({
    workspace_id: payload.workspaceId,
    actor_type: 'system',
    actor_id: null,
    event_type: 'verification_failed',
    entity_type: 'verification_run',
    entity_id: payload.verificationRunId,
    payload: { category },
  });
}
