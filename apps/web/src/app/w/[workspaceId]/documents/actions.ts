'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  assertAllowedDocumentMime,
  assertDetectedMatchesDeclared,
  assertWithinSizeLimit,
  buildDocumentObjectKey,
  canUseIntent,
  normalizeFilename,
  declaredFormat,
  detectSourceFormat,
  sha256Hex,
  UPLOAD_INTENT_TTL_MS,
  DocumentProcessingError,
} from '@usi/documents';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { enqueueParseJob } from '@/lib/jobs';
import { serverEnv } from '@/lib/env';
import { enforceRateLimit } from '@/lib/hardening/service';

const DOCUMENT_DOWNLOAD_TTL_SECONDS = 120;

const DOCUMENT_TYPES = [
  'primary_rfp',
  'addendum',
  'attachment',
  'proposal_draft',
  'reference',
] as const;

function validDocumentType(value: string | undefined) {
  const documentType = value ?? 'primary_rfp';
  if (!DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number]))
    throw new DocumentProcessingError('invalid_type', 'Unsupported document type');
  return documentType;
}

async function requireMember(workspaceId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new DocumentProcessingError('unauthorized', 'Not signed in');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) throw new DocumentProcessingError('unauthorized', 'Not a workspace member');

  return { supabase, user, workspaceId };
}

export type UploadIntentResult =
  | {
      ok: true;
      intentId: string;
      objectKey: string;
      token: string;
      path: string;
      signedUrl: string;
    }
  | { ok: false; error: string };

export async function createUploadIntent(input: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  documentType?: string;
}): Promise<UploadIntentResult> {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({
      operation: 'upload_initialize',
      actorId: user.id,
      workspaceId,
    });
    const env = serverEnv();
    const filename = normalizeFilename(input.filename);
    assertAllowedDocumentMime(input.mimeType);
    const sourceFormat = declaredFormat(filename, input.mimeType);
    assertWithinSizeLimit(input.byteSize, env.MAX_UPLOAD_BYTES);

    const intentId = randomUUID();
    const objectId = randomUUID();
    const objectKey = buildDocumentObjectKey(workspaceId, intentId, objectId, sourceFormat);
    const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_MS).toISOString();
    const documentType = validDocumentType(input.documentType);

    const admin = createSupabaseAdminClient();
    const { error: insertError } = await admin.from('upload_intents').insert({
      id: intentId,
      workspace_id: workspaceId,
      created_by: user.id,
      object_key: objectKey,
      original_filename: input.filename.slice(0, 180),
      normalized_filename: filename,
      declared_mime: input.mimeType.toLowerCase().split(';')[0],
      declared_size_bytes: input.byteSize,
      document_type: documentType,
      source_format: sourceFormat,
      status: 'pending',
      expires_at: expiresAt,
    });
    if (insertError) {
      return { ok: false, error: 'Could not create upload intent' };
    }

    const { data: signed, error: signError } = await admin.storage
      .from('workspace-documents')
      .createSignedUploadUrl(objectKey);
    if (signError || !signed) {
      await admin.from('upload_intents').update({ status: 'cancelled' }).eq('id', intentId);
      return { ok: false, error: 'Could not authorize upload path' };
    }

    return {
      ok: true,
      intentId,
      objectKey,
      token: signed.token,
      path: signed.path,
      signedUrl: signed.signedUrl,
    };
  } catch (err) {
    const message = err instanceof DocumentProcessingError ? err.message : 'Upload intent failed';
    return { ok: false, error: message };
  }
}

export type FinalizeResult = { ok: true; documentId: string } | { ok: false; error: string };

export async function finalizeUpload(input: {
  workspaceId: string;
  intentId: string;
  documentType?: string;
}): Promise<FinalizeResult> {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({
      operation: 'upload_finalize',
      actorId: user.id,
      workspaceId,
    });
    await enforceRateLimit({ operation: 'parse_request', actorId: user.id, workspaceId });
    const env = serverEnv();
    const admin = createSupabaseAdminClient();

    const { data: intent, error: intentError } = await admin
      .from('upload_intents')
      .select('*')
      .eq('id', input.intentId)
      .maybeSingle();

    if (intentError || !intent) {
      return { ok: false, error: 'Upload intent not found' };
    }
    if (intent.workspace_id !== workspaceId || intent.created_by !== user.id) {
      return { ok: false, error: 'Upload intent does not belong to this session' };
    }

    const intentGate = canUseIntent(intent.status, new Date(intent.expires_at));
    if (intentGate === 'expired') {
      await admin.from('upload_intents').update({ status: 'expired' }).eq('id', intent.id);
      return { ok: false, error: 'Upload intent expired' };
    }
    if (intentGate === 'used') {
      return { ok: false, error: 'Upload intent already used' };
    }
    if (intentGate !== 'ok') {
      return { ok: false, error: 'Upload intent is not usable' };
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from('workspace-documents')
      .download(intent.object_key);
    if (downloadError || !blob) {
      return { ok: false, error: 'Uploaded object not found' };
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    assertWithinSizeLimit(bytes.byteLength, env.MAX_UPLOAD_BYTES);
    if (bytes.byteLength !== Number(intent.declared_size_bytes)) {
      return { ok: false, error: 'Uploaded size does not match declared size' };
    }

    let sourceFormat: ReturnType<typeof declaredFormat>;
    let detectedMime: string;
    try {
      sourceFormat = declaredFormat(intent.normalized_filename, intent.declared_mime);
      const detected = detectSourceFormat(bytes, intent.normalized_filename, intent.declared_mime);
      let officeContainerFormat: 'docx' | 'xlsx' | 'zip_package' | undefined;
      if (detected.format === 'zip_package') {
        const { classifyOoxml, readBoundedArchive } = await import('@usi/documents/parser');
        officeContainerFormat = classifyOoxml(await readBoundedArchive(bytes));
      }
      assertDetectedMatchesDeclared(sourceFormat, detected, officeContainerFormat);
      detectedMime = detected.detectedMime;
    } catch (err) {
      await admin
        .from('upload_intents')
        .update({ status: 'used', used_at: new Date().toISOString() })
        .eq('id', intent.id);
      await admin.storage.from('workspace-documents').remove([intent.object_key]);
      throw err;
    }

    const hash = sha256Hex(bytes);

    const { data: dup } = await admin
      .from('documents')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('sha256', hash)
      .is('deleted_at', null)
      .maybeSingle();
    if (dup) {
      await admin.storage.from('workspace-documents').remove([intent.object_key]);
      await admin
        .from('upload_intents')
        .update({ status: 'used', used_at: new Date().toISOString() })
        .eq('id', intent.id);
      return { ok: false, error: 'Duplicate document already exists in this workspace' };
    }

    const documentId = randomUUID();
    const documentType = validDocumentType(intent.document_type ?? input.documentType);
    const { error: docError } = await admin.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      upload_intent_id: intent.id,
      document_type: documentType,
      original_filename: intent.original_filename,
      normalized_filename: intent.normalized_filename,
      mime_type: detectedMime,
      source_format: sourceFormat,
      object_key: intent.object_key,
      sha256: hash,
      size_bytes: bytes.byteLength,
      status: 'uploaded',
      created_by: user.id,
    });
    if (docError) {
      return { ok: false, error: 'Could not register document' };
    }

    // A newly uploaded addendum invalidates only downstream analytical caches.
    // Existing normalized source artifacts remain reusable because their source
    // bytes and parser bindings have not changed.
    if (documentType === 'addendum') {
      const { data: downstream } = await admin
        .from('analysis_cache_entries')
        .select('id,dependency_hash')
        .eq('workspace_id', workspaceId)
        .neq('stage', 'normalizing')
        .is('invalidated_at', null);
      if (downstream?.length) {
        const now = new Date().toISOString();
        await admin
          .from('analysis_cache_entries')
          .update({ status: 'invalidated', invalidated_at: now })
          .in(
            'id',
            downstream.map((entry) => entry.id),
          )
          .eq('workspace_id', workspaceId);
        await admin.from('analysis_cache_invalidations').insert(
          downstream.map((entry) => ({
            workspace_id: workspaceId,
            cache_entry_id: entry.id,
            reason: 'New addendum changed the document-set dependency',
            changed_dependency_type: 'document_set',
            previous_hash: entry.dependency_hash,
            current_hash: hash,
            invalidated_by: user.id,
          })),
        );
      }
    }

    await admin
      .from('upload_intents')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', intent.id);

    const processingJobId = randomUUID();
    const largeDocumentJobId = randomUUID();
    const { error: largeJobError } = await admin.from('large_document_jobs').insert({
      id: largeDocumentJobId,
      workspace_id: workspaceId,
      source_document_id: documentId,
      mode: 'standard_analysis',
      status: 'running',
      orchestration_version: 'large-document-jobs-v1',
      input_hash: hash,
      requested_by: user.id,
      current_stage: 'inspecting',
      progress_numerator: 0,
      progress_denominator: 0,
    });
    if (largeJobError) return { ok: false, error: 'Could not initialize durable processing' };
    await admin.from('processing_jobs').insert({
      id: processingJobId,
      workspace_id: workspaceId,
      document_id: documentId,
      stage: 'parse',
      status: 'queued',
      input_hash: hash,
      max_attempts: 3,
    });

    const queueJobId = await enqueueParseJob({
      workspaceId,
      documentId,
      processingJobId,
      objectKey: intent.object_key,
      inputHash: hash,
      largeDocumentJobId,
    });
    if (queueJobId) {
      await admin
        .from('processing_jobs')
        .update({ queue_job_id: queueJobId })
        .eq('id', processingJobId);
    }

    await supabase.rpc('record_audit_event', {
      p_workspace_id: workspaceId,
      p_event_type: 'document_uploaded',
      p_entity_type: 'document',
      p_entity_id: documentId,
      p_payload: { filename: intent.normalized_filename, sha256: hash },
    });

    revalidatePath(`/w/${workspaceId}/documents`);
    return { ok: true, documentId };
  } catch (err) {
    const message = err instanceof DocumentProcessingError ? err.message : 'Finalization failed';
    return { ok: false, error: message };
  }
}

export async function deleteDocument(input: {
  workspaceId: string;
  documentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const admin = createSupabaseAdminClient();

    const { data: doc } = await admin
      .from('documents')
      .select('id, object_key, status, workspace_id')
      .eq('id', input.documentId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!doc) return { ok: false, error: 'Document not found' };

    await admin
      .from('documents')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', doc.id)
      .eq('workspace_id', workspaceId);

    await admin
      .from('processing_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('document_id', doc.id)
      .in('status', ['queued', 'running']);

    await admin.from('document_pages').delete().eq('document_id', doc.id);
    await admin.storage.from('workspace-documents').remove([doc.object_key]);

    await supabase.rpc('record_audit_event', {
      p_workspace_id: workspaceId,
      p_event_type: 'document_deleted',
      p_entity_type: 'document',
      p_entity_id: doc.id,
      p_payload: { by: user.id },
    });

    revalidatePath(`/w/${workspaceId}/documents`);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete document' };
  }
}

export type DocumentDownloadResult =
  | { ok: true; signedUrl: string; filename: string; expiresInSeconds: number }
  | { ok: false; error: string };

export async function createDocumentDownloadUrl(input: {
  workspaceId: string;
  documentId: string;
}): Promise<DocumentDownloadResult> {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({
      operation: 'signed_download',
      actorId: user.id,
      workspaceId,
    });
    const supabase = await createSupabaseServerClient();
    const { data: document } = await supabase
      .from('documents')
      .select('id,object_key,normalized_filename,status,deleted_at')
      .eq('id', input.documentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!document || document.deleted_at || document.status === 'deleted')
      return { ok: false, error: 'Document unavailable' };
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from('workspace-documents')
      .createSignedUrl(document.object_key, DOCUMENT_DOWNLOAD_TTL_SECONDS);
    if (error || !data?.signedUrl) return { ok: false, error: 'Could not create download link' };
    return {
      ok: true,
      signedUrl: data.signedUrl,
      filename: document.normalized_filename,
      expiresInSeconds: DOCUMENT_DOWNLOAD_TTL_SECONDS,
    };
  } catch {
    return { ok: false, error: 'Could not create download link' };
  }
}
