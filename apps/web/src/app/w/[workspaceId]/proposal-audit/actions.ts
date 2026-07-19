'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  proposalFindingWorkflowStatusSchema,
  proposalHumanResolutionStatusSchema,
} from '@usi/domain';
import { runProposalAudit } from '@/lib/proposal-audit/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, measureServerOperation } from '@/lib/hardening/service';

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

export async function startProposalAuditAction(input: {
  workspaceId: string;
  documentId: string;
  checklistGenerationRunId: string;
  priorDraftId?: string | null;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({ operation: 'proposal_audit', actorId: user.id, workspaceId });
    const result = await measureServerOperation({
      operation: 'proposal_audit',
      workspaceId,
      actorId: user.id,
      execute: () =>
        runProposalAudit({
          workspaceId,
          documentId: uuid.parse(input.documentId),
          checklistGenerationRunId: uuid.parse(input.checklistGenerationRunId),
          actorId: user.id,
          priorDraftId: input.priorDraftId ? uuid.parse(input.priorDraftId) : null,
        }),
    });
    revalidatePath(`/w/${workspaceId}/proposal-audit`);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Proposal audit failed',
    };
  }
}

export async function resolveProposalFindingAction(input: {
  workspaceId: string;
  auditRunId: string;
  findingId: string;
  humanStatus: string;
  workflowStatus: string;
  reason: string;
}) {
  try {
    const { supabase, user, workspaceId } = await requireMember(input.workspaceId);
    await enforceRateLimit({ operation: 'proposal_resolution', actorId: user.id, workspaceId });
    const humanStatus = proposalHumanResolutionStatusSchema
      .exclude(['pending'])
      .parse(input.humanStatus);
    const workflowStatus = proposalFindingWorkflowStatusSchema
      .exclude(['open'])
      .parse(input.workflowStatus);
    const reason = z.string().trim().min(5).max(4000).parse(input.reason);
    const { error } = await supabase.rpc('resolve_proposal_audit_finding', {
      p_workspace_id: workspaceId,
      p_finding_id: uuid.parse(input.findingId),
      p_human_status: humanStatus,
      p_workflow_status: workflowStatus,
      p_reason: reason,
    });
    if (error) throw error;
    revalidatePath(`/w/${workspaceId}/proposal-audit/${uuid.parse(input.auditRunId)}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Finding resolution failed',
    };
  }
}
