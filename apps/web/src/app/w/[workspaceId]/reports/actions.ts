'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { csvDatasetSchema, reportTypeSchema } from '@usi/domain';
import {
  createReportDownloadGrant,
  createReportExport,
  generateReport,
  revokeReportExport,
} from '@/lib/reporting/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  return { user, workspaceId: parsedWorkspace };
}

export async function generateReportAction(input: {
  workspaceId: string;
  analysisRunId: string;
  verificationRunId: string;
  checklistGenerationRunId: string;
  readinessSnapshotId: string;
  proposalAuditRunId: string;
  reportType: string;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    const result = await generateReport({
      workspaceId,
      actorId: user.id,
      analysisRunId: uuid.parse(input.analysisRunId),
      verificationRunId: uuid.parse(input.verificationRunId),
      checklistGenerationRunId: uuid.parse(input.checklistGenerationRunId),
      readinessSnapshotId: uuid.parse(input.readinessSnapshotId),
      proposalAuditRunId: uuid.parse(input.proposalAuditRunId),
      reportType: reportTypeSchema.parse(input.reportType),
    });
    revalidatePath(`/w/${workspaceId}/reports`);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Report generation failed',
    };
  }
}

export async function createReportExportAction(input: {
  workspaceId: string;
  reportSnapshotId: string;
  format: string;
  csvDataset?: string | null;
  regenerate?: boolean;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    const format = z.enum(['csv', 'html']).parse(input.format);
    const result = await createReportExport({
      workspaceId,
      actorId: user.id,
      reportSnapshotId: uuid.parse(input.reportSnapshotId),
      format,
      csvDataset: format === 'csv' ? csvDatasetSchema.parse(input.csvDataset) : null,
      regenerate: Boolean(input.regenerate),
    });
    revalidatePath(`/w/${workspaceId}/reports`);
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Export generation failed',
    };
  }
}

export async function createReportDownloadAction(input: {
  workspaceId: string;
  artifactId: string;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    const result = await createReportDownloadGrant({
      workspaceId,
      actorId: user.id,
      artifactId: uuid.parse(input.artifactId),
    });
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Download grant failed',
    };
  }
}

export async function revokeReportExportAction(input: {
  workspaceId: string;
  artifactId: string;
  reason: string;
}) {
  try {
    const { user, workspaceId } = await requireMember(input.workspaceId);
    await revokeReportExport({
      workspaceId,
      actorId: user.id,
      artifactId: uuid.parse(input.artifactId),
      reason: input.reason,
    });
    revalidatePath(`/w/${workspaceId}/reports`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Export revocation failed',
    };
  }
}
