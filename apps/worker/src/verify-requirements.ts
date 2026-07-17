import { createHash } from 'node:crypto';
import {
  VERIFICATION_PROMPT_VERSION,
  VERIFICATION_SCHEMA_VERSION,
  checkBudget,
  classifyDuplicateRelationship,
  classifyProofRequirement,
  compareDeterministicValues,
  createProvider,
  normalizeEvidenceText,
  parseDeterministicDate,
  parseDeterministicNumbers,
  postValidateFinding,
  type ModelProvider,
  MockProvider,
  validateEvidenceQuote,
} from '@usi/ai';
import { adminClient } from './db.js';
import { env } from './env.js';

export const VERIFICATION_RETRIEVAL_VERSION = 'verify-retrieval-v1';
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

function queryTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9$-]{3,}/g) ?? [])]
    .filter(
      (term) => !['must', 'shall', 'with', 'from', 'this', 'that', 'requirement'].includes(term),
    )
    .slice(0, 12);
}

function relevantPage(page: PageRow, terms: string[]): boolean {
  const lower = page.text.toLowerCase();
  return (
    terms.some((term) => lower.includes(term)) ||
    /addendum|amendment|replaces|supersedes|revises|changed to/i.test(page.text)
  );
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
  const spent = (spentRows ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
    0,
  );
  if (checkBudget(spent, 0.01, env.PHASE4_SPEND_CEILING_USD) === 'exceeded') {
    await budgetCancel(payload, 'Phase 4 spend ceiling reached');
    return;
  }

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
    const { data: candidates, error: candidateError } = await admin
      .from('requirement_candidates')
      .select(
        'id, workspace_id, analysis_run_id, document_id, category, title, obligation, mandatory_class, preliminary_page, evidence_quote',
      )
      .eq('workspace_id', payload.workspaceId)
      .eq('analysis_run_id', payload.analysisRunId)
      .order('created_at');
    if (candidateError) throw candidateError;
    if (!candidates?.length)
      throw new Error('No immutable extraction candidates available for verification');

    const { data: documents } = await admin
      .from('documents')
      .select('id, document_type, normalized_filename')
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

    const supplied = new Map<
      string,
      {
        chunkId: string;
        documentId: string;
        documentType: string;
        pageNumber: number;
        text: string;
        extractionStatus: string;
        parserWarnings: string[];
        retrievalReason: string;
      }
    >();
    const retrievalRows: Record<string, unknown>[] = [];
    for (const candidate of candidates) {
      const terms = queryTerms(
        `${candidate.title} ${candidate.obligation} ${candidate.evidence_quote}`,
      );
      const selected = new Map<string, { page: PageRow; reason: string; rank: number }>();
      for (const page of pages) {
        const cited =
          page.document_id === candidate.document_id &&
          page.page_number === candidate.preliminary_page;
        const neighbor =
          page.document_id === candidate.document_id &&
          Math.abs(page.page_number - candidate.preliminary_page) === 1;
        const addendum =
          documentMap.get(page.document_id)?.document_type === 'addendum' ||
          /addendum|amendment/i.test(page.text);
        if (cited) selected.set(page.id, { page, reason: 'candidate_cited_page', rank: 1 });
        else if (neighbor) selected.set(page.id, { page, reason: 'neighbor_page', rank: 2 });
        else if (addendum) selected.set(page.id, { page, reason: 'addendum_scan', rank: 3 });
        else if (relevantPage(page, terms) && selected.size < 12)
          selected.set(page.id, { page, reason: 'keyword_or_conflict_scan', rank: 4 });
      }
      const { data: hybrid } = await admin.rpc('search_chunks_hybrid', {
        p_workspace_id: payload.workspaceId,
        p_analysis_run_id: payload.analysisRunId,
        p_query: `${candidate.title} ${candidate.obligation}`.slice(0, 500),
        p_limit: 8,
      });
      for (const hit of hybrid ?? []) {
        const page = pages.find(
          (p) => p.document_id === candidate.document_id && p.page_number === hit.page_number,
        );
        if (page && !selected.has(page.id))
          selected.set(page.id, { page, reason: 'hybrid_retrieval', rank: 5 });
      }
      let rank = 0;
      for (const item of [...selected.values()].sort((a, b) => a.rank - b.rank).slice(0, 16)) {
        rank += 1;
        const document = documentMap.get(item.page.document_id);
        const key = `${item.page.document_id}:${item.page.page_number}`;
        if (!supplied.has(key))
          supplied.set(key, {
            chunkId: item.page.id,
            documentId: item.page.document_id,
            documentType: document?.document_type ?? 'unknown',
            pageNumber: item.page.page_number,
            text: item.page.text ?? '',
            extractionStatus: item.page.extraction_status,
            parserWarnings: Array.isArray(item.page.warnings) ? item.page.warnings.map(String) : [],
            retrievalReason: item.reason,
          });
        retrievalRows.push({
          workspace_id: payload.workspaceId,
          analysis_run_id: payload.analysisRunId,
          verification_run_id: run.id,
          candidate_id: candidate.id,
          chunk_id: null,
          document_id: item.page.document_id,
          document_page_id: item.page.id,
          page_number: item.page.page_number,
          retrieval_reason: item.reason,
          retrieval_rank: rank,
          score: null,
          text_sha256: item.page.text_sha256,
        });
      }
    }
    if (retrievalRows.length) {
      const { error } = await admin.from('verification_retrieval_chunks').upsert(retrievalRows, {
        onConflict: 'verification_run_id,candidate_id,document_page_id,retrieval_reason',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    await admin.from('verification_runs').update({ status: 'verifying' }).eq('id', run.id);
    const verifyOut = await provider.verifyCandidates({
      workspaceId: payload.workspaceId,
      analysisRunId: payload.analysisRunId,
      verificationRunId: run.id,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        documentId: candidate.document_id,
        category: candidate.category,
        title: candidate.title,
        obligation: candidate.obligation,
        mandatoryClass: candidate.mandatory_class,
        preliminaryPage: candidate.preliminary_page,
        evidenceQuote: candidate.evidence_quote,
      })),
      contexts: [...supplied.values()],
      promptVersion: VERIFICATION_PROMPT_VERSION,
      schemaVersion: VERIFICATION_SCHEMA_VERSION,
      maxOutputTokens: Math.max(env.MAX_OUTPUT_TOKENS, 12_000),
    });
    if (
      checkBudget(spent, verifyOut.estimatedCostUsd, env.PHASE4_SPEND_CEILING_USD) === 'exceeded'
    ) {
      await admin.from('model_calls').insert({
        workspace_id: payload.workspaceId,
        analysis_run_id: payload.analysisRunId,
        verification_run_id: run.id,
        stage: 'verify',
        provider: provider.name,
        model: verifyOut.modelId,
        provider_request_id: verifyOut.providerRequestId,
        prompt_version: VERIFICATION_PROMPT_VERSION,
        schema_version: VERIFICATION_SCHEMA_VERSION,
        input_tokens: verifyOut.promptTokens,
        output_tokens: verifyOut.completionTokens,
        reasoning_tokens: verifyOut.reasoningTokens,
        cached_tokens: verifyOut.cachedTokens,
        latency_ms: verifyOut.latencyMs,
        estimated_cost_usd: verifyOut.estimatedCostUsd,
        retries: verifyOut.retries,
        repair_attempts: verifyOut.repairAttempts,
        status: 'cancelled',
        error_category: 'budget',
      });
      await budgetCancel(payload, 'Phase 4 ceiling would be exceeded by verification call');
      return;
    }
    await admin.from('model_calls').insert({
      workspace_id: payload.workspaceId,
      analysis_run_id: payload.analysisRunId,
      verification_run_id: run.id,
      stage: 'verify',
      provider: provider.name,
      model: verifyOut.modelId,
      provider_request_id: verifyOut.providerRequestId,
      prompt_version: VERIFICATION_PROMPT_VERSION,
      schema_version: VERIFICATION_SCHEMA_VERSION,
      input_tokens: verifyOut.promptTokens,
      output_tokens: verifyOut.completionTokens,
      reasoning_tokens: verifyOut.reasoningTokens,
      cached_tokens: verifyOut.cachedTokens,
      latency_ms: verifyOut.latencyMs,
      estimated_cost_usd: verifyOut.estimatedCostUsd,
      retries: verifyOut.retries,
      repair_attempts: verifyOut.repairAttempts,
      status: verifyOut.refused ? 'refused' : verifyOut.incomplete ? 'incomplete' : 'succeeded',
    });
    if (verifyOut.estimatedCostUsd > 0)
      await admin.from('spend_ledger').insert({
        workspace_id: payload.workspaceId,
        analysis_run_id: payload.analysisRunId,
        phase: 'phase4',
        kind: 'verify',
        estimated_cost_usd: verifyOut.estimatedCostUsd,
        note: `verification_run:${run.id}`,
      });
    if (verifyOut.refused || verifyOut.incomplete)
      throw new Error(
        verifyOut.refused ? 'Verification model refused' : 'Verification model response incomplete',
      );

    await admin.from('verification_runs').update({ status: 'post_validating' }).eq('id', run.id);
    const contextMap = new Map(
      [...supplied.values()].map((context) => [
        `${context.documentId}:${context.pageNumber}`,
        { text: context.text, extractionStatus: context.extractionStatus },
      ]),
    );
    let findingCount = 0;
    for (const rawFinding of verifyOut.findings) {
      const candidate = candidates.find((item) => item.id === rawFinding.candidateId);
      if (!candidate) throw new Error('Verifier returned an unknown candidate ID');
      const finding = postValidateFinding(rawFinding, contextMap);
      const deterministicProof = classifyProofRequirement(candidate.obligation);
      const proofRequirement =
        deterministicProof === 'none_identified' ? finding.proofRequirement : deterministicProof;
      const { data: previous } = await admin
        .from('verification_findings')
        .select('finding_version')
        .eq('candidate_id', candidate.id)
        .order('finding_version', { ascending: false })
        .limit(1);
      const findingVersion = Number(previous?.[0]?.finding_version ?? 0) + 1;
      const sourceTexts = finding.supportingEvidence.map(
        (ref) => pageByKey.get(`${ref.documentId}:${ref.pageNumber}`)?.text ?? '',
      );
      const candidateDate = parseDeterministicDate(candidate.obligation);
      const sourceDates = sourceTexts.map(parseDeterministicDate);
      const dateComparisons = sourceDates.map((sourceDate) => ({
        candidate: candidateDate,
        source: sourceDate,
        comparison_result: compareDeterministicValues(
          { value: candidateDate.normalized, unit: 'date' },
          { value: sourceDate.normalized, unit: 'date' },
        ),
      }));
      const candidateNumbers = parseDeterministicNumbers(candidate.obligation);
      const sourceNumbers = sourceTexts.flatMap(parseDeterministicNumbers);
      const numberComparisons = candidateNumbers.map((candidateNumber) => {
        const sameUnit = sourceNumbers.filter(
          (sourceNumber) => sourceNumber.unit === candidateNumber.unit,
        );
        const sourceNumber =
          sameUnit.find((item) => item.normalizedValue === candidateNumber.normalizedValue) ??
          sameUnit[0];
        return {
          candidate: candidateNumber,
          source: sourceNumber ?? null,
          comparison_result: sourceNumber
            ? compareDeterministicValues(
                { value: candidateNumber.normalizedValue, unit: candidateNumber.unit },
                { value: sourceNumber.normalizedValue, unit: sourceNumber.unit },
              )
            : 'uncertain',
        };
      });
      const facts = {
        candidate_dates: [candidateDate],
        source_dates: sourceDates,
        date_comparisons: dateComparisons,
        candidate_numbers: candidateNumbers,
        source_numbers: sourceNumbers,
        number_comparisons: numberComparisons,
        model_proposals: finding.deterministicFacts,
      };
      const explicitValueMismatch =
        dateComparisons.some((comparison) => comparison.comparison_result === 'mismatch') ||
        numberComparisons.some((comparison) => comparison.comparison_result === 'mismatch');
      const sourceSupportStatus =
        finding.sourceSupportStatus === 'supported' && explicitValueMismatch
          ? 'contradicted'
          : finding.sourceSupportStatus;
      const { data: inserted, error: findingError } = await admin
        .from('verification_findings')
        .insert({
          workspace_id: payload.workspaceId,
          analysis_run_id: payload.analysisRunId,
          verification_run_id: run.id,
          candidate_id: candidate.id,
          finding_version: findingVersion,
          source_support_status: sourceSupportStatus,
          precedence_status: finding.precedenceStatus,
          proof_requirement: proofRequirement,
          rationale: finding.rationale,
          material_mismatches: finding.materialMismatches,
          deterministic_facts: facts,
          parser_concerns: finding.parserConcerns,
          ambiguity_notes: finding.ambiguityNotes,
          prompt_version: VERIFICATION_PROMPT_VERSION,
          schema_version: VERIFICATION_SCHEMA_VERSION,
          model_id: verifyOut.modelId,
          provider_request_id: verifyOut.providerRequestId,
        })
        .select('id')
        .single();
      if (findingError || !inserted) throw findingError ?? new Error('Finding insert failed');
      findingCount += 1;

      for (const [role, refs] of [
        ['supporting', finding.supportingEvidence],
        ['contradicting', finding.contradictingEvidence],
        ['addendum', finding.addendumEvidence],
      ] as const) {
        for (const ref of refs) {
          const page = pageByKey.get(`${ref.documentId}:${ref.pageNumber}`);
          if (!page) continue;
          const match = validateEvidenceQuote(page.text, ref.quote);
          await admin.from('verification_evidence').insert({
            workspace_id: payload.workspaceId,
            finding_id: inserted.id,
            document_id: ref.documentId,
            document_page_id: page.id,
            page_number: ref.pageNumber,
            evidence_role: role,
            quote_exact: ref.quote,
            quote_normalized: normalizeEvidenceText(ref.quote),
            normalization_version: EVIDENCE_NORMALIZATION_VERSION,
            match_type: match.matchType,
            start_offset: match.startOffset,
            end_offset: match.endOffset,
            validated: match.matchType === 'exact' || match.matchType === 'normalized_exact',
          });
        }
      }
      for (const proposal of finding.duplicateProposals) {
        const target = candidates.find((item) => item.id === proposal.candidateId);
        if (!target || target.id === candidate.id) continue;
        const relationshipType = classifyDuplicateRelationship(
          { id: candidate.id, obligation: candidate.obligation },
          { id: target.id, obligation: target.obligation },
        );
        await admin.from('requirement_relationships').upsert(
          {
            workspace_id: payload.workspaceId,
            verification_run_id: run.id,
            finding_id: inserted.id,
            source_candidate_id: candidate.id,
            target_candidate_id: target.id,
            relationship_type: relationshipType,
            rationale: proposal.rationale,
            machine_confidence: relationshipType === 'exact_duplicate' ? 1 : null,
          },
          {
            onConflict:
              'verification_run_id,source_candidate_id,target_candidate_id,relationship_type',
            ignoreDuplicates: true,
          },
        );
      }
    }

    await admin
      .from('verification_runs')
      .update({
        status: 'completed',
        candidate_count: candidates.length,
        finding_count: findingCount,
        estimated_cost_usd: verifyOut.estimatedCostUsd,
        completed_at: new Date().toISOString(),
        error_category: null,
        error_detail: verifyOut.notes?.slice(0, 500) ?? null,
      })
      .eq('id', run.id);
    await admin
      .from('processing_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    await admin.from('audit_events').insert({
      workspace_id: payload.workspaceId,
      actor_type: 'system',
      actor_id: null,
      event_type: 'verification_completed',
      entity_type: 'verification_run',
      entity_id: run.id,
      payload: { finding_count: findingCount, model: verifyOut.modelId },
    });
  } catch (error) {
    await failVerification(
      payload,
      'verification_failed',
      error instanceof Error ? error.message : 'Verification failed',
    );
    throw error instanceof Error ? error : new Error('Verification failed');
  }
}

export function verificationInputHash(candidateIds: string[], analysisRunId: string): string {
  return createHash('sha256')
    .update(
      `${analysisRunId}:${[...candidateIds].sort().join(',')}:${VERIFICATION_PROMPT_VERSION}:${VERIFICATION_SCHEMA_VERSION}`,
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
