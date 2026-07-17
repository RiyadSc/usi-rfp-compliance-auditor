import { randomUUID } from 'node:crypto';
import {
  assertTransition,
  normalizeError,
  toDbErrorCategory,
  toDbExtractionStatus,
  type ParseStatus,
} from '@usi/documents';
import { PdfJsParserAdapter } from '@usi/documents/parser';
import { adminClient } from './db.js';
import { env } from './env.js';

export type ParseJobPayload = {
  workspaceId: string;
  documentId: string;
  processingJobId: string;
  objectKey: string;
  inputHash: string;
};

const parser = new PdfJsParserAdapter();

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
      parser_version: parser.version,
    })
    .eq('id', payload.processingJobId);

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
    parser_name: parser.name,
    parser_version: parser.version,
  });
  if (runInsertError) throw runInsertError;

  try {
    const { data: blob, error } = await admin.storage
      .from('workspace-documents')
      .download(doc.object_key);
    if (error || !blob) {
      throw new Error('storage download failed');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await parser.parse(bytes, {
      maxPages: env.MAX_PAGES_PER_WORKSPACE,
      timeoutMs: env.PARSE_TIMEOUT_MS,
    });

    // Idempotent replace: delete prior pages then insert under this parse_run.
    await admin.from('document_pages').delete().eq('document_id', doc.id);

    const pageRows = result.pages.map((p) => ({
      document_id: doc.id,
      workspace_id: payload.workspaceId,
      page_number: p.pageNumber,
      pdf_page_index: p.pdfPageIndex,
      text: p.text,
      text_sha256: p.textSha256,
      char_count: p.text.length,
      extraction_status: toDbExtractionStatus(p.extractionStatus),
      warnings: p.warnings,
      parser_name: result.parserName,
      parser_version: result.parserVersion,
      parse_run_id: parseRunId,
    }));

    const { error: pageError } = await admin.from('document_pages').insert(pageRows);
    if (pageError) throw pageError;

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
        parser_name: result.parserName,
        parser_version: result.parserVersion,
      })
      .eq('id', parseRunId);

    assertTransition('parsing', 'parsed');
    await admin
      .from('documents')
      .update({
        status: 'parsed',
        page_count: result.pageCount,
        parser_name: result.parserName,
        parser_version: result.parserVersion,
        warnings: result.warnings,
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
    await failJob(payload, category, message);
    throw err instanceof Error ? err : new Error(message);
  }
}

async function failJob(payload: ParseJobPayload, category: string, detail: string): Promise<void> {
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
}
