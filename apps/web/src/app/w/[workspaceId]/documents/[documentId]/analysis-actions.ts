'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { enqueueExtractJob } from '@/lib/jobs';
import { serverEnv } from '@/lib/env';
import { checkBudget } from '@usi/ai';
import { enforceRateLimit } from '@/lib/hardening/service';

async function requireMember(workspaceId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) throw new Error('Not a workspace member');
  return { supabase, user, workspaceId };
}

export async function startExtraction(input: {
  workspaceId: string;
  documentId: string;
}): Promise<{ ok: true; analysisRunId: string } | { ok: false; error: string }> {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({ operation: 'extraction_request', actorId: user.id, workspaceId });
    const admin = createSupabaseAdminClient();
    const env = serverEnv();

    const { data: doc } = await admin
      .from('documents')
      .select('id, status, workspace_id, sha256')
      .eq('id', input.documentId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!doc) return { ok: false, error: 'Document not found' };
    if (doc.status !== 'parsed') {
      return { ok: false, error: 'Document must be parsed before extraction' };
    }

    const { data: spentRows } = await admin
      .from('spend_ledger')
      .select('estimated_cost_usd')
      .eq('phase', 'phase3');
    const spent = (spentRows ?? []).reduce((n, r) => n + Number(r.estimated_cost_usd ?? 0), 0);
    if (checkBudget(spent, 0.05, env.PHASE3_SPEND_CEILING_USD) === 'exceeded') {
      return {
        ok: false,
        error: 'Phase 3 development spend ceiling reached. Request approval before continuing.',
      };
    }

    const analysisRunId = randomUUID();
    const { error: runErr } = await admin.from('analysis_runs').insert({
      id: analysisRunId,
      workspace_id: workspaceId,
      document_id: doc.id,
      status: 'queued',
      stage: 'index',
      created_by: user.id,
      input_hash: doc.sha256,
      provider_name: env.OPENAI_API_KEY ? 'openai' : 'mock',
    });
    if (runErr) return { ok: false, error: 'Could not create analysis run' };

    const processingJobId = randomUUID();
    await admin.from('processing_jobs').insert({
      id: processingJobId,
      workspace_id: workspaceId,
      document_id: doc.id,
      stage: 'extract',
      status: 'queued',
      input_hash: doc.sha256 ?? analysisRunId,
      max_attempts: 3,
    });

    const queueJobId = await enqueueExtractJob({
      workspaceId,
      documentId: doc.id,
      analysisRunId,
      processingJobId,
    });
    if (queueJobId) {
      await admin
        .from('processing_jobs')
        .update({ queue_job_id: queueJobId })
        .eq('id', processingJobId);
    }

    await supabase.rpc('record_audit_event', {
      p_workspace_id: workspaceId,
      p_event_type: 'analysis_started',
      p_entity_type: 'analysis_run',
      p_entity_id: analysisRunId,
      p_payload: { document_id: doc.id },
    });

    revalidatePath(`/w/${workspaceId}/documents/${doc.id}`);
    revalidatePath(`/w/${workspaceId}/analysis/${analysisRunId}`);
    return { ok: true, analysisRunId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not start extraction' };
  }
}
