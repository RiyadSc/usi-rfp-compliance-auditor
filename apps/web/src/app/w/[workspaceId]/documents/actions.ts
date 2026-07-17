'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  assertAllowedMime,
  assertPdfExtension,
  assertPdfMagicBytes,
  assertWithinSizeLimit,
  buildObjectKey,
  canUseIntent,
  normalizeFilename,
  sha256Hex,
  UPLOAD_INTENT_TTL_MS,
  DocumentProcessingError,
} from '@usi/documents';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { enqueueParseJob } from '@/lib/jobs';
import { serverEnv } from '@/lib/env';

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
    const env = serverEnv();
    const filename = normalizeFilename(input.filename);
    assertPdfExtension(filename);
    assertAllowedMime(input.mimeType);
    assertWithinSizeLimit(input.byteSize, env.MAX_UPLOAD_BYTES);

    const intentId = randomUUID();
    const objectId = randomUUID();
    const objectKey = buildObjectKey(workspaceId, intentId, objectId);
    const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_MS).toISOString();
    const documentType = input.documentType ?? 'primary_rfp';

    const admin = createSupabaseAdminClient();
    const { error: insertError } = await admin.from('upload_intents').insert({
      id: intentId,
      workspace_id: workspaceId,
      created_by: user.id,
      object_key: objectKey,
      original_filename: input.filename.slice(0, 180),
      normalized_filename: filename,
      declared_mime: 'application/pdf',
      declared_size_bytes: input.byteSize,
      document_type: documentType,
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

    try {
      assertPdfMagicBytes(bytes);
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
    const { error: docError } = await admin.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId,
      upload_intent_id: intent.id,
      document_type: intent.document_type ?? input.documentType ?? 'primary_rfp',
      original_filename: intent.original_filename,
      normalized_filename: intent.normalized_filename,
      mime_type: 'application/pdf',
      object_key: intent.object_key,
      sha256: hash,
      size_bytes: bytes.byteLength,
      status: 'uploaded',
      created_by: user.id,
    });
    if (docError) {
      return { ok: false, error: 'Could not register document' };
    }

    await admin
      .from('upload_intents')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', intent.id);

    const processingJobId = randomUUID();
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
