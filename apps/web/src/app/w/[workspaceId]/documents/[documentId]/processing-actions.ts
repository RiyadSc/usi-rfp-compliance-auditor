'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enqueueLargeDocumentWork } from '@/lib/jobs';

const inputSchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  jobId: z.string().uuid(),
  workUnitId: z.string().uuid().optional(),
});
async function authorize(workspaceId: string) {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('Not authorized');
  const { data: workspace } = await client
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) throw new Error('Not authorized');
  return { client, user };
}

export async function retryProcessingUnit(raw: z.input<typeof inputSchema>) {
  const input = inputSchema.parse(raw);
  const { client, user } = await authorize(input.workspaceId);
  const admin = createSupabaseAdminClient();
  if (!input.workUnitId) return { ok: false as const, error: 'A failed work unit is required' };
  const { data: unit } = await admin
    .from('processing_work_units')
    .select('id,status,job_id,workspace_id')
    .eq('id', input.workUnitId)
    .eq('job_id', input.jobId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();
  const { data: job } = await admin
    .from('large_document_jobs')
    .select('id,source_document_id')
    .eq('id', input.jobId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();
  if (
    !unit ||
    !job ||
    job.source_document_id !== input.documentId ||
    !['failed_retryable', 'invalidated'].includes(unit.status)
  )
    return { ok: false as const, error: 'Retry is not available' };
  await admin
    .from('processing_work_units')
    .update({ status: 'queued', lease_owner: null, lease_expires_at: null, last_error_code: null })
    .eq('id', unit.id)
    .eq('workspace_id', input.workspaceId);
  await enqueueLargeDocumentWork({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    workUnitId: unit.id,
  });
  await client.rpc('record_audit_event', {
    p_workspace_id: input.workspaceId,
    p_event_type: 'analysis_started',
    p_entity_type: 'processing_work_unit',
    p_entity_id: unit.id,
    p_payload: { action: 'retry', actorId: user.id },
  });
  revalidatePath(`/w/${input.workspaceId}/documents/${input.documentId}`);
  return { ok: true as const };
}

export async function cancelLargeDocumentJob(raw: z.input<typeof inputSchema>) {
  const input = inputSchema.parse(raw);
  const { client, user } = await authorize(input.workspaceId);
  const admin = createSupabaseAdminClient();
  const { data: job } = await admin
    .from('large_document_jobs')
    .select('id,status,source_document_id')
    .eq('id', input.jobId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();
  if (
    !job ||
    job.source_document_id !== input.documentId ||
    !['running', 'failed_retryable'].includes(job.status)
  )
    return { ok: false as const, error: 'Cancellation is not available' };
  await admin
    .from('large_document_jobs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('workspace_id', input.workspaceId);
  await admin
    .from('processing_work_units')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('job_id', job.id)
    .eq('workspace_id', input.workspaceId)
    .in('status', ['queued', 'leased', 'failed_retryable']);
  await client.rpc('record_audit_event', {
    p_workspace_id: input.workspaceId,
    p_event_type: 'analysis_failed',
    p_entity_type: 'large_document_job',
    p_entity_id: job.id,
    p_payload: { action: 'cancelled', actorId: user.id },
  });
  revalidatePath(`/w/${input.workspaceId}/documents/${input.documentId}`);
  return { ok: true as const };
}
