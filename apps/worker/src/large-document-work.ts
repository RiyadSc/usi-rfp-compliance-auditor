import { sha256Hex } from '@usi/documents';
import { parsePdfPageUnit } from '@usi/documents/parser';
import { adminClient } from './db.js';
import { env } from './env.js';

export type LargeDocumentWorkPayload = { workspaceId: string; jobId: string; workUnitId: string };

export async function handleLargeDocumentWork(payload: LargeDocumentWorkPayload): Promise<void> {
  const admin = adminClient();
  const [{ data: job }, { data: unit }] = await Promise.all([
    admin
      .from('large_document_jobs')
      .select('id,workspace_id,source_document_id,input_hash,status')
      .eq('id', payload.jobId)
      .eq('workspace_id', payload.workspaceId)
      .maybeSingle(),
    admin
      .from('processing_work_units')
      .select('*')
      .eq('id', payload.workUnitId)
      .eq('job_id', payload.jobId)
      .eq('workspace_id', payload.workspaceId)
      .maybeSingle(),
  ]);
  if (!job || !unit || !job.source_document_id)
    throw new Error('large_document_work_scope_mismatch');
  if (!['queued', 'failed_retryable'].includes(unit.status)) return;
  const { data: leased, error: leaseError } = await admin
    .from('processing_work_units')
    .update({
      status: 'leased',
      lease_owner: `worker:${process.pid}`,
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
      attempts: Number(unit.attempts) + 1,
      started_at: unit.started_at ?? new Date().toISOString(),
    })
    .eq('id', unit.id)
    .eq('workspace_id', payload.workspaceId)
    .in('status', ['queued', 'failed_retryable'])
    .select('*')
    .maybeSingle();
  if (leaseError || !leased) return;
  try {
    if (leased.unit_type !== 'page_parse')
      throw new Error(`unsupported_targeted_unit:${leased.unit_type}`);
    const match = String(leased.unit_key).match(/^page:(\d+)$/);
    if (!match) throw new Error('invalid_page_unit_key');
    const pageNumber = Number(match[1]);
    const [{ data: document }, { data: normalized }] = await Promise.all([
      admin
        .from('documents')
        .select('id,workspace_id,object_key,normalized_filename,mime_type,source_format,sha256')
        .eq('id', job.source_document_id)
        .eq('workspace_id', payload.workspaceId)
        .maybeSingle(),
      admin
        .from('normalized_documents')
        .select('id,parser_version')
        .eq('source_document_id', job.source_document_id)
        .eq('workspace_id', payload.workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!document || !normalized || document.source_format !== 'pdf')
      throw new Error('targeted_page_retry_requires_existing_pdf_normalization');
    const { data: blob, error: downloadError } = await admin.storage
      .from('workspace-documents')
      .download(document.object_key);
    if (downloadError || !blob) throw new Error('storage_download_failed');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256Hex(bytes) !== document.sha256) throw new Error('source_hash_drift');
    const page = await parsePdfPageUnit(
      {
        workspaceId: payload.workspaceId,
        sourceDocumentId: document.id,
        bytes,
        filename: document.normalized_filename,
        declaredMime: document.mime_type,
        maxUnits: env.MAX_PAGES_PER_WORKSPACE,
        timeoutMs: env.PARSE_TIMEOUT_MS,
      },
      pageNumber - 1,
    );
    const { error: pageError } = await admin.from('normalized_pages').upsert(
      {
        id: page.id,
        normalized_document_id: normalized.id,
        workspace_id: payload.workspaceId,
        source_document_id: document.id,
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
    if (pageError) throw pageError;
    if (page.blocks.length) {
      const { error: blockError } = await admin.from('normalized_blocks').upsert(
        page.blocks.map((block) => ({
          id: block.id,
          normalized_document_id: normalized.id,
          normalized_page_id: page.id,
          workspace_id: payload.workspaceId,
          source_document_id: document.id,
          block_type: block.type,
          text: block.text,
          normalized_text: block.normalizedText,
          order_index: block.orderIndex,
          bounding_box: block.boundingBox ?? null,
          confidence: block.confidence,
          provenance: block.provenance,
          metadata: block.metadata,
        })),
        { onConflict: 'id' },
      );
      if (blockError) throw blockError;
    }
    await admin
      .from('processing_work_units')
      .update({
        status: 'completed',
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: null,
        completion_artifact: {
          normalizedDocumentId: normalized.id,
          normalizedPageId: page.id,
          physicalPageIndex: page.physicalPageIndex,
          targetedRetry: true,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', leased.id)
      .eq('workspace_id', payload.workspaceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'targeted_page_retry_failed';
    await admin
      .from('processing_work_units')
      .update({
        status:
          Number(leased.attempts) >= Number(leased.max_attempts)
            ? 'failed_terminal'
            : 'failed_retryable',
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: message.slice(0, 120),
      })
      .eq('id', leased.id)
      .eq('workspace_id', payload.workspaceId);
    throw error;
  }
}
