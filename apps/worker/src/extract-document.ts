import {
  EXTRACTION_PROMPT_VERSION,
  SCHEMA_VERSION,
  checkBudget,
  chunkPages,
  createProvider,
  estimateEmbedCost,
} from '@usi/ai';
import type { ExtractOutput } from '@usi/ai';
import { selectWholeDocumentPages } from '@usi/documents';
import { adminClient } from './db.js';
import { env } from './env.js';

export type ExtractJobPayload = {
  workspaceId: string;
  documentId: string;
  analysisRunId: string;
  processingJobId: string;
};

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

export async function handleExtractJob(payload: ExtractJobPayload): Promise<void> {
  const admin = adminClient();
  const { data: run } = await admin
    .from('analysis_runs')
    .select('*')
    .eq('id', payload.analysisRunId)
    .maybeSingle();
  if (!run) return;
  if (run.workspace_id !== payload.workspaceId || run.document_id !== payload.documentId) {
    await failRun(payload, 'unauthorized', 'Job payload does not match analysis run scope');
    return;
  }
  if (run.status === 'completed') {
    await admin
      .from('processing_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    return;
  }
  if (run.status === 'cancelled' || run.status === 'budget_exceeded') {
    await admin
      .from('processing_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    return;
  }

  const { data: spentRows } = await admin
    .from('spend_ledger')
    .select('estimated_cost_usd')
    .eq('phase', 'phase3');
  const spent = (spentRows ?? []).reduce((n, r) => n + Number(r.estimated_cost_usd ?? 0), 0);
  if (checkBudget(spent, 0.01, env.PHASE3_SPEND_CEILING_USD) === 'exceeded') {
    await admin
      .from('analysis_runs')
      .update({
        status: 'budget_exceeded',
        error_category: 'budget',
        error_detail: 'Phase 3 spend ceiling reached',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    await admin
      .from('processing_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    return;
  }

  // Construct the provider only after scope and budget checks. In ordinary
  // application operation this remains MockProvider unless an explicitly
  // protected live route enables another provider.
  const provider = createProvider({
    ...(env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {}),
    OPENAI_EXTRACT_MODEL: env.OPENAI_EXTRACT_MODEL,
    OPENAI_EMBED_MODEL: env.OPENAI_EMBED_MODEL,
  });

  await admin
    .from('analysis_runs')
    .update({
      status: 'running',
      stage: 'index',
      started_at: new Date().toISOString(),
      provider_name: provider.name,
      extract_model: env.OPENAI_EXTRACT_MODEL,
      embed_model: env.OPENAI_EMBED_MODEL,
      prompt_version: EXTRACTION_PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
    })
    .eq('id', run.id);

  await admin
    .from('processing_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', payload.processingJobId);

  try {
    const { data: pages } = await admin
      .from('document_pages')
      .select('page_number, text, parse_run_id, parser_name')
      .eq('document_id', payload.documentId)
      .eq('workspace_id', payload.workspaceId)
      .order('page_number', { ascending: true });

    if (!pages?.length) {
      throw new Error('No parsed pages available for extraction');
    }

    const selection = selectWholeDocumentPages(
      pages.map((page) => ({ pageNumber: page.page_number, text: page.text ?? '' })),
    );
    if (selection.selectedPages.length > env.MAX_EXTRACT_PAGES_PER_RUN) {
      throw Object.assign(
        new Error(
          `Whole-document selection produced ${selection.selectedPages.length} pages; the configured auditable limit is ${env.MAX_EXTRACT_PAGES_PER_RUN}`,
        ),
        { category: 'complexity_limit' },
      );
    }
    if (selection.batches.length > env.MAX_MODEL_CALLS_PER_RUN) {
      throw Object.assign(
        new Error(
          `Whole-document selection requires ${selection.batches.length} extraction calls; the configured run limit is ${env.MAX_MODEL_CALLS_PER_RUN}`,
        ),
        { category: 'complexity_limit' },
      );
    }
    const selectedPageNumbers = new Set(selection.selectedPages.map((page) => page.pageNumber));
    const selectedPages = pages.filter((page) => selectedPageNumbers.has(page.page_number));
    const chunks = chunkPages(
      selectedPages.map((p) => ({
        pageNumber: p.page_number,
        text: p.text ?? '',
        parseRunId: p.parse_run_id ?? undefined,
        parserName: p.parser_name ?? undefined,
      })),
    );

    // Idempotent re-index for this run
    await admin.from('document_chunks').delete().eq('analysis_run_id', run.id);

    const chunkRows = chunks.map((c) => ({
      workspace_id: payload.workspaceId,
      document_id: payload.documentId,
      analysis_run_id: run.id,
      page_number: c.pageNumber,
      chunk_index: c.chunkIndex,
      char_start: c.charStart,
      char_end: c.charEnd,
      text: c.text,
      text_sha256: c.textSha256,
      token_estimate: c.tokenEstimate,
      parser_name: c.parserName ?? null,
      parse_run_id: c.parseRunId ?? null,
    }));

    const { data: insertedChunks, error: chunkErr } = await admin
      .from('document_chunks')
      .insert(chunkRows)
      .select('id, text, page_number, chunk_index');
    if (chunkErr) throw chunkErr;

    const texts = (insertedChunks ?? []).map((c) => c.text || ' ');
    const embedPending = estimateEmbedCost(texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0));
    if (checkBudget(spent, embedPending, env.PHASE3_SPEND_CEILING_USD) === 'exceeded') {
      throw Object.assign(new Error('budget exceeded before embed'), { category: 'budget' });
    }

    const embedded = await provider.embed(texts);
    await admin.from('model_calls').insert({
      workspace_id: payload.workspaceId,
      analysis_run_id: run.id,
      stage: 'embed',
      provider: provider.name,
      model: embedded.modelId,
      provider_request_id: embedded.requestId,
      input_tokens: embedded.tokens,
      output_tokens: 0,
      latency_ms: null,
      estimated_cost_usd: embedded.estimatedCostUsd,
      status: 'succeeded',
    });
    if (embedded.estimatedCostUsd > 0) {
      await admin.from('spend_ledger').insert({
        workspace_id: payload.workspaceId,
        analysis_run_id: run.id,
        kind: 'embed',
        estimated_cost_usd: embedded.estimatedCostUsd,
      });
    }

    for (let i = 0; i < (insertedChunks ?? []).length; i++) {
      const c = insertedChunks![i]!;
      const vec = embedded.vectors[i];
      if (!vec?.length) continue;
      const { error: embErr } = await admin.rpc('insert_chunk_embedding', {
        p_workspace_id: payload.workspaceId,
        p_analysis_run_id: run.id,
        p_chunk_id: c.id,
        p_model: embedded.modelId,
        p_dimensions: vec.length,
        p_embedding: toVectorLiteral(vec),
      });
      if (embErr) {
        console.error('[worker] embedding insert skipped', embErr.message);
        // Continue extraction without vectors; lexical retrieval still available.
      }
    }

    await admin.from('analysis_runs').update({ stage: 'extract' }).eq('id', run.id);

    const extractionOutputs: ExtractOutput[] = [];
    let committedExtractionCost = 0;
    for (let batchIndex = 0; batchIndex < selection.batches.length; batchIndex += 1) {
      const batch = selection.batches[batchIndex]!;
      const extractOut = await provider.extractCandidates({
        workspaceId: payload.workspaceId,
        documentId: payload.documentId,
        analysisRunId: run.id,
        pages: batch,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
        maxOutputTokens: env.MAX_OUTPUT_TOKENS,
      });
      const spentBeforeCall = spent + embedded.estimatedCostUsd + committedExtractionCost;
      if (
        checkBudget(spentBeforeCall, extractOut.estimatedCostUsd, env.PHASE3_SPEND_CEILING_USD) ===
        'exceeded'
      ) {
        await admin.from('model_calls').insert({
          workspace_id: payload.workspaceId,
          analysis_run_id: run.id,
          stage: 'extract',
          provider: provider.name,
          model: extractOut.modelId,
          provider_request_id: extractOut.providerRequestId,
          prompt_version: EXTRACTION_PROMPT_VERSION,
          schema_version: SCHEMA_VERSION,
          input_tokens: extractOut.promptTokens,
          output_tokens: extractOut.completionTokens,
          latency_ms: extractOut.latencyMs,
          estimated_cost_usd: extractOut.estimatedCostUsd,
          status: 'cancelled',
          error_category: 'budget',
        });
        throw Object.assign(new Error('budget exceeded after extract'), { category: 'budget' });
      }
      await admin.from('model_calls').insert({
        workspace_id: payload.workspaceId,
        analysis_run_id: run.id,
        stage: 'extract',
        provider: provider.name,
        model: extractOut.modelId,
        provider_request_id: extractOut.providerRequestId,
        prompt_version: EXTRACTION_PROMPT_VERSION,
        schema_version: SCHEMA_VERSION,
        input_tokens: extractOut.promptTokens,
        output_tokens: extractOut.completionTokens,
        latency_ms: extractOut.latencyMs,
        estimated_cost_usd: extractOut.estimatedCostUsd,
        status: extractOut.refused ? 'refused' : extractOut.incomplete ? 'incomplete' : 'succeeded',
      });
      if (extractOut.estimatedCostUsd > 0) {
        await admin.from('spend_ledger').insert({
          workspace_id: payload.workspaceId,
          analysis_run_id: run.id,
          kind: 'extract',
          estimated_cost_usd: extractOut.estimatedCostUsd,
        });
      }
      committedExtractionCost += extractOut.estimatedCostUsd;
      extractionOutputs.push(extractOut);
    }

    const candidates = extractionOutputs.flatMap((output) => output.candidates);
    const uniqueCandidates = candidates.filter(
      (candidate, index, all) =>
        all.findIndex(
          (item) =>
            item.category === candidate.category &&
            item.title === candidate.title &&
            item.preliminaryPage === candidate.preliminaryPage &&
            item.evidenceQuote === candidate.evidenceQuote,
        ) === index,
    );

    await admin.from('requirement_candidates').delete().eq('analysis_run_id', run.id);
    if (uniqueCandidates.length) {
      const { error: candErr } = await admin.from('requirement_candidates').insert(
        uniqueCandidates.map((c) => ({
          id: c.id,
          workspace_id: c.workspaceId,
          analysis_run_id: c.analysisRunId,
          document_id: c.documentId,
          category: c.category,
          title: c.title,
          obligation: c.obligation,
          mandatory_class: c.mandatoryClass,
          preliminary_page: c.preliminaryPage,
          evidence_quote: c.evidenceQuote,
          confidence: c.confidence,
          ambiguity_notes: c.ambiguityNotes,
          status: 'unverified',
          prompt_version: c.promptVersion,
          schema_version: c.schemaVersion,
          model_id: c.modelId,
          provider_request_id:
            extractionOutputs.find((output) => output.candidates.some((item) => item.id === c.id))
              ?.providerRequestId ?? null,
        })),
      );
      if (candErr) throw candErr;
    }

    await admin
      .from('analysis_runs')
      .update({
        status: 'completed',
        stage: 'complete',
        candidate_count: uniqueCandidates.length,
        estimated_cost_usd: embedded.estimatedCostUsd + committedExtractionCost,
        completed_at: new Date().toISOString(),
        error_category: null,
        error_detail: JSON.stringify({
          selectionVersion: 'whole-document-selection-v1',
          selectedPages: selection.selectedPages.length,
          excludedPages: selection.excludedPageNumbers.length,
          batches: selection.batches.length,
          notes: extractionOutputs.flatMap((output) => (output.notes ? [output.notes] : [])),
        }).slice(0, 500),
      })
      .eq('id', run.id);

    await admin
      .from('processing_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
  } catch (err) {
    const category =
      err && typeof err === 'object' && 'category' in err
        ? String((err as { category: string }).category)
        : 'internal';
    const message = err instanceof Error ? err.message : 'extract failed';
    if (category === 'budget') {
      await admin
        .from('analysis_runs')
        .update({
          status: 'budget_exceeded',
          error_category: 'budget',
          error_detail: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq('id', payload.analysisRunId);
      await admin
        .from('processing_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', payload.processingJobId);
      return;
    }
    await failRun(payload, category, message);
    throw err instanceof Error ? err : new Error(message);
  }
}

async function failRun(payload: ExtractJobPayload, category: string, detail: string) {
  const admin = adminClient();
  await admin
    .from('analysis_runs')
    .update({
      status: 'failed',
      error_category: category,
      error_detail: detail.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.analysisRunId);
  await admin
    .from('processing_jobs')
    .update({
      status: 'failed',
      error_category: category,
      error_detail: detail.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.processingJobId);
}
