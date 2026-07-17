'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CHALLENGE_PROMPT_VERSION,
  CHALLENGE_SCHEMA_VERSION,
  DECISION_ENGINE_VERSION,
  ENTAILMENT_PROMPT_VERSION,
  ENTAILMENT_SCHEMA_VERSION,
  humanReviewInputSchema,
  checkBudget,
} from '@usi/ai';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { enqueueVerifyJob } from '@/lib/jobs';
import { serverEnv } from '@/lib/env';

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
  return { supabase, user };
}

export async function startVerification(input: { workspaceId: string; analysisRunId: string }) {
  try {
    const { supabase, user } = await requireMember(input.workspaceId);
    const admin = createSupabaseAdminClient();
    const env = serverEnv();
    const { data: analysis } = await admin
      .from('analysis_runs')
      .select('id, workspace_id, document_id, status')
      .eq('id', input.analysisRunId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();
    if (!analysis || analysis.status !== 'completed')
      return { ok: false as const, error: 'Extraction must complete before verification' };
    const { data: candidates } = await admin
      .from('requirement_candidates')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('analysis_run_id', input.analysisRunId)
      .order('id');
    if (!candidates?.length)
      return { ok: false as const, error: 'No candidates available for verification' };
    const { data: spentRows } = await admin
      .from('spend_ledger')
      .select('estimated_cost_usd')
      .eq('phase', 'phase4');
    const spent = (spentRows ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
      0,
    );
    if (checkBudget(spent, 0.25, env.PHASE4_SPEND_CEILING_USD) === 'exceeded') {
      return {
        ok: false as const,
        error: 'Phase 4 development spend ceiling reached. Request approval before continuing.',
      };
    }
    const inputHash = createHash('sha256')
      .update(
        `${analysis.id}:${candidates.map((c) => c.id).join(',')}:${ENTAILMENT_PROMPT_VERSION}:${CHALLENGE_PROMPT_VERSION}:${DECISION_ENGINE_VERSION}`,
      )
      .digest('hex');
    const { data: active } = await admin
      .from('verification_runs')
      .select('id')
      .eq('analysis_run_id', analysis.id)
      .eq('input_hash', inputHash)
      .in('status', ['queued', 'retrieving', 'verifying', 'post_validating'])
      .maybeSingle();
    if (active) return { ok: true as const, verificationRunId: active.id };
    const { data: versions } = await admin
      .from('verification_runs')
      .select('version')
      .eq('analysis_run_id', analysis.id)
      .eq('input_hash', inputHash)
      .order('version', { ascending: false })
      .limit(1);
    const version = Number(versions?.[0]?.version ?? 0) + 1;
    const verificationRunId = randomUUID();
    const { error: runError } = await admin.from('verification_runs').insert({
      id: verificationRunId,
      workspace_id: input.workspaceId,
      analysis_run_id: analysis.id,
      status: 'queued',
      version,
      input_hash: inputHash,
      prompt_version: `${ENTAILMENT_PROMPT_VERSION}+${CHALLENGE_PROMPT_VERSION}`,
      schema_version: `${ENTAILMENT_SCHEMA_VERSION}+${CHALLENGE_SCHEMA_VERSION}`,
      retrieval_version: 'verify-retrieval-v2-candidate-centered',
      normalization_version: 'evidence-nfkc-v1',
      created_by: user.id,
      candidate_count: candidates.length,
    });
    if (runError) throw runError;
    const processingJobId = randomUUID();
    const { error: jobError } = await admin.from('processing_jobs').insert({
      id: processingJobId,
      workspace_id: input.workspaceId,
      document_id: analysis.document_id,
      stage: 'verify',
      status: 'queued',
      input_hash: inputHash,
      max_attempts: 3,
    });
    if (jobError) throw jobError;
    const queueJobId = await enqueueVerifyJob({
      workspaceId: input.workspaceId,
      analysisRunId: analysis.id,
      verificationRunId,
      processingJobId,
    });
    if (queueJobId)
      await admin
        .from('processing_jobs')
        .update({ queue_job_id: queueJobId })
        .eq('id', processingJobId);
    await supabase.rpc('record_audit_event', {
      p_workspace_id: input.workspaceId,
      p_event_type: 'verification_started',
      p_entity_type: 'verification_run',
      p_entity_id: verificationRunId,
      p_payload: { analysis_run_id: analysis.id, candidate_count: candidates.length },
    });
    revalidatePath(`/w/${input.workspaceId}/requirements`);
    return { ok: true as const, verificationRunId };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Could not start verification',
    };
  }
}

export async function recordHumanReview(input: {
  workspaceId: string;
  findingId: string;
  decision: string;
  note: string;
  correctedValues?: string;
  relationshipId?: string;
}) {
  try {
    const { supabase } = await requireMember(input.workspaceId);
    let correctedValues: unknown = {};
    if (input.correctedValues?.trim()) {
      try {
        correctedValues = JSON.parse(input.correctedValues);
      } catch {
        return { ok: false as const, error: 'Corrected values must be a valid JSON object' };
      }
    }
    const parsed = humanReviewInputSchema.safeParse({
      findingId: input.findingId,
      decision: input.decision,
      note: input.note,
      correctedValues,
    });
    if (!parsed.success)
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid review' };
    const { error } = await supabase.rpc('record_human_review_decision', {
      p_workspace_id: input.workspaceId,
      p_finding_id: parsed.data.findingId,
      p_decision: parsed.data.decision,
      p_note: parsed.data.note,
      p_corrected_values: parsed.data.correctedValues,
      p_relationship_id: input.relationshipId
        ? z.string().uuid().parse(input.relationshipId)
        : null,
    });
    if (error) throw error;
    revalidatePath(`/w/${input.workspaceId}/requirements`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Review could not be recorded',
    };
  }
}
