import { randomUUID } from 'node:crypto';
import {
  assertTransition,
  normalizedDocumentSchema,
  normalizeError,
  sha256Hex,
  toDbErrorCategory,
  toDbExtractionStatus,
  type ParseStatus,
  estimateAnalysisCost,
} from '@usi/documents';
import {
  NON_PDF_ADAPTERS,
  NormalizedPdfParserAdapter,
  type DocumentParserAdapter,
} from '@usi/documents/parser';
import { adminClient } from './db.js';
import { env } from './env.js';

export type ParseJobPayload = {
  workspaceId: string;
  documentId: string;
  processingJobId: string;
  objectKey: string;
  inputHash: string;
  largeDocumentJobId?: string;
};

const adapters: readonly DocumentParserAdapter[] = [
  new NormalizedPdfParserAdapter(),
  ...NON_PDF_ADAPTERS,
];

function adapterFor(format: string): DocumentParserAdapter {
  const adapter = adapters.find((candidate) =>
    candidate.supportedFormats.includes(format as never),
  );
  if (!adapter) throw new Error(`No parser adapter registered for ${format}`);
  return adapter;
}

export async function handleParseJob(payload: ParseJobPayload): Promise<void> {
  const admin = adminClient();

  const { data: doc } = await admin
    .from('documents')
    .select('*')
    .eq('id', payload.documentId)
    .maybeSingle();

  if (!doc) return;
  if (doc.workspace_id !== payload.workspaceId || doc.object_key !== payload.objectKey) {
    await failJob(payload, 'unauthorized', 'Job payload does not match document scope');
    return;
  }
  if (doc.deleted_at || doc.status === 'deleted') {
    await admin
      .from('processing_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId);
    return;
  }
  if (doc.status === 'parsed') {
    await admin
      .from('processing_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', payload.processingJobId)
      .in('status', ['queued', 'running']);
    return;
  }
  if (doc.sha256 !== payload.inputHash) {
    await failJob(payload, 'path_mismatch', 'Input hash mismatch');
    return;
  }

  const parser = adapterFor(String(doc.source_format ?? 'pdf'));

  assertTransition(doc.status as ParseStatus, 'parsing');

  const { data: job } = await admin
    .from('processing_jobs')
    .select('attempts')
    .eq('id', payload.processingJobId)
    .single();

  await admin
    .from('processing_jobs')
    .update({
      status: 'running',
      attempts: (job?.attempts ?? 0) + 1,
      started_at: new Date().toISOString(),
      parser_version: parser.adapterVersion,
    })
    .eq('id', payload.processingJobId);
  if (payload.largeDocumentJobId) {
    await admin
      .from('large_document_jobs')
      .update({
        status: 'running',
        current_stage: 'normalizing',
        started_at: new Date().toISOString(),
      })
      .eq('id', payload.largeDocumentJobId)
      .eq('workspace_id', payload.workspaceId)
      .eq('source_document_id', payload.documentId);
  }

  await admin
    .from('documents')
    .update({ status: 'parsing' })
    .eq('id', doc.id)
    .eq('workspace_id', payload.workspaceId);

  const parseRunId = randomUUID();
  const { error: runInsertError } = await admin.from('parse_runs').insert({
    id: parseRunId,
    document_id: doc.id,
    workspace_id: payload.workspaceId,
    stage: 'parse',
    status: 'running',
    attempt: (job?.attempts ?? 0) + 1,
    job_id: payload.processingJobId,
    parser_name: parser.adapterId,
    parser_version: parser.adapterVersion,
  });
  if (runInsertError) throw runInsertError;

  let durableStageRunId: string | null = null;
  try {
    const { data: blob, error } = await admin.storage
      .from('workspace-documents')
      .download(doc.object_key);
    if (error || !blob) {
      throw new Error('storage download failed');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = normalizedDocumentSchema.parse(
      await parser.parse({
        workspaceId: payload.workspaceId,
        sourceDocumentId: doc.id,
        bytes,
        filename: doc.normalized_filename,
        declaredMime: doc.mime_type,
        maxUnits: env.MAX_PAGES_PER_WORKSPACE,
        timeoutMs: env.PARSE_TIMEOUT_MS,
      }),
    );

    if (payload.largeDocumentJobId) {
      const stageRunId = randomUUID();
      durableStageRunId = stageRunId;
      const { error: stageError } = await admin.from('processing_stage_runs').insert({
        id: stageRunId,
        workspace_id: payload.workspaceId,
        job_id: payload.largeDocumentJobId,
        stage: 'normalizing',
        stage_version: result.normalizationVersion,
        input_hash: payload.inputHash,
        status: 'running',
        attempt: 1,
        progress_numerator: 0,
        progress_denominator: result.pages.length,
      });
      if (stageError) throw stageError;
      for (let offset = 0; offset < result.pages.length; offset += 100) {
        const rows = result.pages.slice(offset, offset + 100).map((page) => ({
          workspace_id: payload.workspaceId,
          job_id: payload.largeDocumentJobId,
          stage_run_id: stageRunId,
          unit_type: 'page_parse',
          unit_key: `page:${page.physicalPageIndex + 1}`,
          version: result.parserVersion,
          input_hash: sha256Hex(`${payload.inputHash}:page:${page.physicalPageIndex + 1}`),
          status: 'leased',
          attempts: 1,
          max_attempts: 3,
          completion_artifact: {
            normalizedDocumentId: result.id,
            normalizedPageId: page.id,
            physicalPageIndex: page.physicalPageIndex,
            parserState: page.parserState,
          },
          started_at: new Date().toISOString(),
          lease_owner: `worker:${process.pid}`,
          lease_expires_at: new Date(Date.now() + env.PARSE_TIMEOUT_MS).toISOString(),
        }));
        const { error: unitsError } = await admin.from('processing_work_units').insert(rows);
        if (unitsError) throw unitsError;
      }
      const uncertainPages = result.pages.filter((page) =>
        ['uncertain', 'failed', 'partial'].includes(page.parserState),
      );
      if (uncertainPages.length) {
        const ocrStageRunId = randomUUID();
        const { error: ocrStageError } = await admin.from('processing_stage_runs').insert({
          id: ocrStageRunId,
          workspace_id: payload.workspaceId,
          job_id: payload.largeDocumentJobId,
          stage: 'ocr_processing',
          stage_version: 'selective-ocr-v1',
          input_hash: sha256Hex(`${payload.inputHash}:ocr-selection`),
          status: 'failed_terminal',
          attempt: 1,
          progress_numerator: 0,
          progress_denominator: uncertainPages.length,
          error_code: 'approved_ocr_adapter_unavailable',
          completed_at: new Date().toISOString(),
        });
        if (ocrStageError) throw ocrStageError;
        const { error: ocrUnitsError } = await admin.from('processing_work_units').insert(
          uncertainPages.map((page) => ({
            workspace_id: payload.workspaceId,
            job_id: payload.largeDocumentJobId,
            stage_run_id: ocrStageRunId,
            unit_type: 'ocr',
            unit_key: `page:${page.physicalPageIndex + 1}`,
            version: 'selective-ocr-v1',
            input_hash: sha256Hex(`${payload.inputHash}:ocr:${page.physicalPageIndex + 1}`),
            status: 'failed_terminal',
            attempts: 0,
            max_attempts: 3,
            last_error_code: 'approved_ocr_adapter_unavailable',
            completion_artifact: {
              physicalPageIndex: page.physicalPageIndex,
              classification: 'human_review_required',
            },
          })),
        );
        if (ocrUnitsError) throw ocrUnitsError;
      }
      const cost = estimateAnalysisCost({
        ocrPages: result.statistics.uncertainPages,
        embeddingTokens: Math.ceil(result.statistics.characterCount / 4),
        classificationCalls: Math.ceil(result.pages.length / 15),
        extractionCalls: Math.ceil(result.pages.length / 35),
        verificationCalls: Math.ceil(result.pages.length / 24),
        ambiguityCalls: Math.ceil(result.statistics.uncertainPages / 5),
        averageInputTokens: 2200,
        outputLimits: {
          classification: 300,
          extraction: 1800,
          verification: 1600,
          ambiguity: 1800,
        },
        pricesPerMillion: { input: 5, output: 30, embedding: 0.02, ocrPage: 0 },
        retryAllowance: 1,
        estimatedMillisecondsPerCall: 4000,
      });
      const { error: costError } = await admin.from('analysis_cost_estimates').upsert(
        {
          workspace_id: payload.workspaceId,
          job_id: payload.largeDocumentJobId,
          mode: 'standard_analysis',
          estimator_version: 'analysis-cost-estimator-v1',
          input_hash: payload.inputHash,
          expected_low_usd: cost.lowUsd,
          expected_high_usd: cost.highUsd,
          hard_maximum_usd: cost.hardMaximumUsd,
          estimated_calls_low: cost.estimatedCallsLow,
          estimated_calls_high: cost.estimatedCallsHigh,
          estimated_time_ms: cost.estimatedTimeMs,
          largest_cost_stage: cost.largestCostStage,
          stage_estimates: cost.stages,
          pricing_version: 'provider-pricing-2026-07-22',
          execution_allowed: cost.hardMaximumUsd <= env.MAX_MODEL_COST_USD_PER_RUN,
          block_reason:
            cost.hardMaximumUsd <= env.MAX_MODEL_COST_USD_PER_RUN
              ? null
              : 'estimated_hard_maximum_exceeds_run_limit',
        },
        { onConflict: 'workspace_id,input_hash,estimator_version,pricing_version' },
      );
      if (costError) throw costError;
    }

    const pageRows = result.pages.map((p) => ({
      document_id: doc.id,
      workspace_id: payload.workspaceId,
      page_number: p.physicalPageIndex + 1,
      pdf_page_index: p.physicalPageIndex,
      text: p.blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join('\n'),
      text_sha256: sha256Hex(
        p.blocks
          .map((block) => block.text)
          .filter(Boolean)
          .join('\n'),
      ),
      char_count: p.blocks.reduce((sum, block) => sum + block.text.length, 0),
      extraction_status: toDbExtractionStatus(
        p.parserState === 'failed'
          ? 'failed'
          : p.nativeTextAvailable
            ? 'text'
            : p.parserState === 'ocr'
              ? 'image_only'
              : 'empty',
      ),
      warnings: p.warnings.map((warning) => warning.message),
      parser_name: result.parserAdapter,
      parser_version: result.parserVersion,
      parse_run_id: parseRunId,
    }));

    const { error: pageError } = await admin
      .from('document_pages')
      .upsert(pageRows, { onConflict: 'document_id,page_number' });
    if (pageError) throw pageError;

    const { error: normalizedError } = await admin.from('normalized_documents').upsert(
      {
        id: result.id,
        workspace_id: payload.workspaceId,
        source_document_id: doc.id,
        source_format: result.sourceFormat,
        source_hash: result.sourceHash,
        parser_adapter: result.parserAdapter,
        parser_version: result.parserVersion,
        normalization_version: result.normalizationVersion,
        content_hash: result.contentHash,
        language: result.language ?? null,
        statistics: result.statistics,
        warnings: result.warnings,
        status: result.statistics.uncertainPages ? 'completed_with_warnings' : 'completed',
      },
      { onConflict: 'workspace_id,source_document_id,content_hash' },
    );
    if (normalizedError) throw normalizedError;

    const cacheKey = sha256Hex(
      [
        payload.workspaceId,
        doc.id,
        result.sourceHash,
        result.parserAdapter,
        result.parserVersion,
        result.normalizationVersion,
        result.contentHash,
      ].join(':'),
    );
    const { data: existingCache } = await admin
      .from('analysis_cache_entries')
      .select('id,artifact_ref,dependency_hash,status,invalidated_at')
      .eq('workspace_id', payload.workspaceId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    const existingArtifact = existingCache?.artifact_ref as
      { normalizedDocumentId?: string } | undefined;
    if (
      existingCache &&
      (existingArtifact?.normalizedDocumentId !== result.id ||
        existingCache.dependency_hash !== result.sourceHash)
    )
      throw new Error('cache_binding_conflict');
    const cacheEntry =
      existingCache ??
      (
        await admin
          .from('analysis_cache_entries')
          .insert({
            workspace_id: payload.workspaceId,
            cache_key: cacheKey,
            artifact_type: 'normalized_document',
            source_document_id: doc.id,
            stage: 'normalizing',
            status: result.statistics.uncertainPages ? 'completed_with_warnings' : 'completed',
            artifact_ref: { normalizedDocumentId: result.id },
            provenance: {
              parserAdapter: result.parserAdapter,
              parserVersion: result.parserVersion,
              normalizationVersion: result.normalizationVersion,
            },
            dependency_hash: result.sourceHash,
          })
          .select('id')
          .single()
      ).data;
    if (!cacheEntry) throw new Error('cache_insert_failed');
    const { error: dependencyError } = await admin.from('analysis_artifact_dependencies').upsert(
      {
        workspace_id: payload.workspaceId,
        cache_entry_id: cacheEntry.id,
        dependency_type: 'source_document',
        dependency_key: doc.id,
        dependency_hash: result.sourceHash,
      },
      { onConflict: 'cache_entry_id,dependency_type,dependency_key,dependency_hash' },
    );
    if (dependencyError) throw dependencyError;

    for (const page of result.pages) {
      const { error: normalizedPageError } = await admin.from('normalized_pages').upsert(
        {
          id: page.id,
          normalized_document_id: result.id,
          workspace_id: payload.workspaceId,
          source_document_id: doc.id,
          physical_page_index: page.physicalPageIndex,
          displayed_page_label: page.displayedPageLabel ?? null,
          width: page.width ?? null,
          height: page.height ?? null,
          native_text_available: page.nativeTextAvailable,
          ocr_applied: page.ocrApplied,
          parser_confidence: page.parserConfidence,
          parser_state: page.parserState,
          source_artifact_id: page.sourceArtifactId ?? null,
          warnings: page.warnings,
        },
        { onConflict: 'normalized_document_id,physical_page_index' },
      );
      if (normalizedPageError) throw normalizedPageError;
    }

    for (const section of result.sections) {
      const { error: sectionError } = await admin.from('normalized_sections').upsert(
        {
          id: section.id,
          normalized_document_id: result.id,
          workspace_id: payload.workspaceId,
          source_document_id: doc.id,
          title: section.title,
          level: section.level,
          order_index: section.orderIndex,
          parent_section_id: section.parentSectionId ?? null,
          provenance: section.provenance,
        },
        { onConflict: 'id' },
      );
      if (sectionError) throw sectionError;
    }

    const blockRows = result.pages.flatMap((page) =>
      page.blocks.map((block) => ({
        id: block.id,
        normalized_document_id: result.id,
        normalized_page_id: page.id,
        workspace_id: payload.workspaceId,
        source_document_id: doc.id,
        section_id: block.sectionId ?? null,
        parent_block_id: block.parentBlockId ?? null,
        block_type: block.type,
        text: block.text,
        normalized_text: block.normalizedText,
        order_index: block.orderIndex,
        bounding_box: block.boundingBox ?? null,
        confidence: block.confidence,
        provenance: block.provenance,
        metadata: block.metadata,
      })),
    );
    if (blockRows.length) {
      const { error: blockError } = await admin
        .from('normalized_blocks')
        .upsert(blockRows, { onConflict: 'id' });
      if (blockError) throw blockError;
    }

    const tableRows = result.pages.flatMap((page) =>
      page.tables.map((table) => ({
        id: table.id,
        normalized_document_id: result.id,
        normalized_page_id: page.id,
        workspace_id: payload.workspaceId,
        source_document_id: doc.id,
        block_id: table.blockId,
        title: table.title ?? null,
        caption: table.caption ?? null,
        header_rows: table.headerRows,
        row_count: table.rowCount,
        column_count: table.columnCount,
        bounding_box: table.boundingBox ?? null,
        confidence: table.confidence,
        warnings: table.warnings,
        continuation_of_table_id: table.continuationOfTableId ?? null,
        repeated_header: table.repeatedHeader,
      })),
    );
    if (tableRows.length) {
      const { error: tableError } = await admin
        .from('normalized_tables')
        .upsert(tableRows, { onConflict: 'id' });
      if (tableError) throw tableError;
      const cellRows = result.pages.flatMap((page) =>
        page.tables.flatMap((table) =>
          table.cells.map((cell) => ({
            id: cell.id,
            normalized_table_id: table.id,
            workspace_id: payload.workspaceId,
            source_document_id: doc.id,
            row_index: cell.rowIndex,
            column_index: cell.columnIndex,
            row_span: cell.rowSpan,
            column_span: cell.columnSpan,
            raw_text: cell.rawText,
            normalized_text: cell.normalizedText,
            cell_role: cell.role,
            formula: cell.formula ?? null,
            numeric_value: cell.numericValue ?? null,
            date_value: cell.dateValue ?? null,
            currency_code: cell.currencyCode ?? null,
            unit: cell.unit ?? null,
            bounding_box: cell.boundingBox ?? null,
            confidence: cell.confidence,
            provenance: cell.provenance,
          })),
        ),
      );
      if (cellRows.length) {
        const { error: cellError } = await admin
          .from('normalized_table_cells')
          .upsert(cellRows, { onConflict: 'id' });
        if (cellError) throw cellError;
      }
    }

    // Mark prior successful parse runs superseded so unique index allows this one.
    await admin
      .from('parse_runs')
      .update({ status: 'skipped', finished_at: new Date().toISOString() })
      .eq('document_id', doc.id)
      .eq('stage', 'parse')
      .eq('status', 'succeeded')
      .neq('id', parseRunId);

    await admin
      .from('parse_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        parser_name: result.parserAdapter,
        parser_version: result.parserVersion,
      })
      .eq('id', parseRunId);

    assertTransition('parsing', 'parsed');
    await admin
      .from('documents')
      .update({
        status: 'parsed',
        page_count: result.pages.length,
        parser_name: result.parserAdapter,
        parser_version: result.parserVersion,
        warnings: result.warnings.map((warning) => warning.message),
        error_category: null,
      })
      .eq('id', doc.id)
      .eq('workspace_id', payload.workspaceId);

    await admin
      .from('processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        parser_version: result.parserVersion,
        error_category: null,
        error_detail: null,
      })
      .eq('id', payload.processingJobId);
    if (payload.largeDocumentJobId) {
      await admin
        .from('processing_work_units')
        .update({
          status: 'completed',
          lease_owner: null,
          lease_expires_at: null,
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', payload.largeDocumentJobId)
        .eq('workspace_id', payload.workspaceId)
        .eq('status', 'leased');
      if (durableStageRunId) {
        await admin
          .from('processing_stage_runs')
          .update({
            status: result.statistics.uncertainPages ? 'completed_with_warnings' : 'completed',
            progress_numerator: result.pages.length,
            progress_denominator: result.pages.length,
            completed_at: new Date().toISOString(),
          })
          .eq('id', durableStageRunId)
          .eq('workspace_id', payload.workspaceId);
      }
      await admin
        .from('large_document_jobs')
        .update({
          status: result.statistics.uncertainPages ? 'completed_with_warnings' : 'completed',
          current_stage: 'completed',
          progress_numerator: result.pages.length,
          progress_denominator: result.pages.length + result.statistics.uncertainPages,
          completed_at: new Date().toISOString(),
          retryable: false,
        })
        .eq('id', payload.largeDocumentJobId)
        .eq('workspace_id', payload.workspaceId);
    }
  } catch (err) {
    const { category, message } = normalizeError(err);
    await admin
      .from('parse_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_category: toDbErrorCategory(category),
        error_message: message.slice(0, 500),
      })
      .eq('id', parseRunId);
    await failJob(payload, category, message, durableStageRunId);
    throw err instanceof Error ? err : new Error(message);
  }
}

async function failJob(
  payload: ParseJobPayload,
  category: string,
  detail: string,
  durableStageRunId: string | null = null,
): Promise<void> {
  const admin = adminClient();
  await admin
    .from('documents')
    .update({
      status: 'failed',
      error_category: toDbErrorCategory(category),
      warnings: [`parse failed: ${category}`],
    })
    .eq('id', payload.documentId)
    .eq('workspace_id', payload.workspaceId)
    .neq('status', 'deleted');

  await admin
    .from('processing_jobs')
    .update({
      status: 'failed',
      error_category: toDbErrorCategory(category),
      error_detail: detail.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', payload.processingJobId);
  if (payload.largeDocumentJobId) {
    await admin
      .from('processing_work_units')
      .update({
        status: 'failed_retryable',
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: category,
      })
      .eq('job_id', payload.largeDocumentJobId)
      .eq('workspace_id', payload.workspaceId)
      .eq('status', 'leased');
    if (durableStageRunId) {
      await admin
        .from('processing_stage_runs')
        .update({ status: 'failed_retryable', error_code: category })
        .eq('id', durableStageRunId)
        .eq('workspace_id', payload.workspaceId);
    }
    await admin
      .from('large_document_jobs')
      .update({ status: 'failed_retryable', retryable: true, error_code: category })
      .eq('id', payload.largeDocumentJobId)
      .eq('workspace_id', payload.workspaceId);
  }
}
