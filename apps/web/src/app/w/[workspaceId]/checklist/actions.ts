'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checklistWorkflowStatusSchema } from '@usi/domain';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateChecklist, recalculateChecklistState } from '@/lib/checklist/service';

const uuid = z.string().uuid();

async function requireMember(workspaceId: string) {
  const parsedWorkspace = uuid.parse(workspaceId);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', parsedWorkspace)
    .maybeSingle();
  if (!workspace) throw new Error('Workspace not found');
  return { supabase, user, workspaceId: parsedWorkspace };
}

async function latestGenerationRun(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  itemId: string,
) {
  const { data: links } = await supabase
    .from('checklist_generation_run_items')
    .select('generation_run_id, checklist_generation_runs!inner(created_at)')
    .eq('workspace_id', workspaceId)
    .eq('checklist_item_id', itemId)
    .order('created_at', { referencedTable: 'checklist_generation_runs', ascending: false })
    .limit(1);
  return links?.[0]?.generation_run_id as string | undefined;
}

async function refresh(workspaceId: string, itemId?: string) {
  revalidatePath(`/w/${workspaceId}/checklist`);
  if (itemId) revalidatePath(`/w/${workspaceId}/checklist/${itemId}`);
}

export async function generateChecklistAction(input: {
  workspaceId: string;
  verificationRunId: string;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    const result = await generateChecklist({
      workspaceId,
      verificationRunId: uuid.parse(input.verificationRunId),
      actorId: user.id,
    });
    await refresh(workspaceId);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Checklist generation failed',
    };
  }
}

export async function assignChecklistOwnerAction(input: {
  workspaceId: string;
  itemId: string;
  ownerId?: string | null;
  reviewerId?: string | null;
}) {
  try {
    const { supabase, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('assign_checklist_owner', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_owner_id: input.ownerId ? uuid.parse(input.ownerId) : null,
      p_reviewer_id: input.reviewerId ? uuid.parse(input.reviewerId) : null,
    });
    if (error) throw error;
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Assignment failed',
    };
  }
}

export async function updateChecklistStatusAction(input: {
  workspaceId: string;
  itemId: string;
  status: string;
  note?: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const status = checklistWorkflowStatusSchema.parse(input.status);
    const { error } = await supabase.rpc('update_checklist_status', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_status: status,
      p_note: z
        .string()
        .max(1000)
        .parse(input.note ?? ''),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Status update failed',
    };
  }
}

export async function linkChecklistArtifactAction(input: {
  workspaceId: string;
  itemId: string;
  requiredArtifactId: string;
  documentId: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('link_checklist_artifact', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_required_artifact_id: uuid.parse(input.requiredArtifactId),
      p_document_id: uuid.parse(input.documentId),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Artifact link failed',
    };
  }
}

export async function reviewChecklistArtifactAction(input: {
  workspaceId: string;
  itemId: string;
  requiredArtifactId: string;
  state: string;
  note?: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('review_checklist_artifact', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_required_artifact_id: uuid.parse(input.requiredArtifactId),
      p_state: z.enum(['pending_review', 'reviewed', 'rejected']).parse(input.state),
      p_note: z
        .string()
        .max(1000)
        .parse(input.note ?? ''),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Artifact review failed',
    };
  }
}

export async function removeChecklistArtifactAction(input: {
  workspaceId: string;
  itemId: string;
  linkId: string;
  reason: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('remove_checklist_artifact', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_link_id: uuid.parse(input.linkId),
      p_reason: z.string().trim().min(5).max(4000).parse(input.reason),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Artifact removal failed',
    };
  }
}

export async function createChecklistExceptionAction(input: {
  workspaceId: string;
  itemId: string;
  explanation: string;
  priorNoteId?: string | null;
}) {
  try {
    const { supabase, workspaceId } = await requireMember(input.workspaceId);
    const explanation = z.string().trim().min(1).max(4000).parse(input.explanation);
    const { error } = await supabase.rpc('create_checklist_exception', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_explanation: explanation,
      p_prior_note_id: input.priorNoteId ? uuid.parse(input.priorNoteId) : null,
    });
    if (error) throw error;
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Exception note failed',
    };
  }
}

export async function requestChecklistWaiverAction(input: {
  workspaceId: string;
  itemId: string;
  reason: string;
  designation: string;
  authorityNote?: string;
}) {
  try {
    const { supabase, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('create_checklist_waiver', {
      p_workspace_id: workspaceId,
      p_item_id: uuid.parse(input.itemId),
      p_reason: z.string().trim().min(5).max(4000).parse(input.reason),
      p_designation: z.enum(['temporary', 'final']).parse(input.designation),
      p_authority_note: z
        .string()
        .max(2000)
        .parse(input.authorityNote ?? ''),
    });
    if (error) throw error;
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Waiver request failed',
    };
  }
}

export async function reviewChecklistWaiverAction(input: {
  workspaceId: string;
  itemId: string;
  waiverId: string;
  status: string;
  note: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('review_checklist_waiver', {
      p_workspace_id: workspaceId,
      p_waiver_id: uuid.parse(input.waiverId),
      p_status: z.enum(['accepted', 'rejected', 'expired']).parse(input.status),
      p_note: z.string().trim().min(5).max(4000).parse(input.note),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Waiver review failed',
    };
  }
}

export async function resolveChecklistBlockerAction(input: {
  workspaceId: string;
  itemId: string;
  blockerId: string;
  action: string;
  reason: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    const { error } = await supabase.rpc('resolve_checklist_blocker', {
      p_workspace_id: workspaceId,
      p_blocker_id: uuid.parse(input.blockerId),
      p_action: z.enum(['resolved', 'reopened']).parse(input.action),
      p_reason: z.string().trim().min(5).max(4000).parse(input.reason),
    });
    if (error) throw error;
    const runId = await latestGenerationRun(supabase, workspaceId, input.itemId);
    if (runId)
      await recalculateChecklistState({ workspaceId, generationRunId: runId, actorId: user.id });
    await refresh(workspaceId, input.itemId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Blocker update failed',
    };
  }
}
