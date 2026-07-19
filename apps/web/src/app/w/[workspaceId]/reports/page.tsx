import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReportGenerationControls } from './report-controls';

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { workspaceId } = await params;
  const requestedPage = Number((await searchParams).page ?? '1');
  const historyPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 25;
  if (!z.string().uuid().safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const [{ data: auditRuns }, { data: reportRuns }] = await Promise.all([
    supabase
      .from('proposal_audit_runs')
      .select(
        'id,checklist_generation_run_id,proposal_draft_id,created_at,checklist_generation_runs!inner(analysis_run_id,verification_run_id),proposal_drafts!inner(revision_number,documents!inner(normalized_filename))',
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false }),
    supabase
      .from('report_generation_runs')
      .select('id,report_type,status,input_hash,created_at,report_snapshots(id)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range((historyPage - 1) * pageSize, historyPage * pageSize),
  ]);
  const runIds = (auditRuns ?? []).map((run) => run.checklist_generation_run_id);
  const { data: readinessRows } = runIds.length
    ? await supabase
        .from('checklist_readiness_snapshots')
        .select('id,generation_run_id,created_at')
        .eq('workspace_id', workspaceId)
        .in('generation_run_id', runIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const readinessByRun = new Map<string, { id: string; created_at: string }>();
  for (const row of readinessRows ?? [])
    if (!readinessByRun.has(row.generation_run_id)) readinessByRun.set(row.generation_run_id, row);
  const sourceOptions = (auditRuns ?? []).flatMap((run) => {
    const readiness = readinessByRun.get(run.checklist_generation_run_id);
    if (!readiness) return [];
    const checklist = run.checklist_generation_runs as unknown as {
      analysis_run_id: string;
      verification_run_id: string;
    };
    const draft = run.proposal_drafts as unknown as {
      revision_number: number;
      documents: { normalized_filename: string };
    };
    return [
      {
        proposalAuditRunId: run.id,
        analysisRunId: checklist.analysis_run_id,
        verificationRunId: checklist.verification_run_id,
        checklistGenerationRunId: run.checklist_generation_run_id,
        readinessSnapshotId: readiness.id,
        label: `${draft.documents.normalized_filename} · revision ${draft.revision_number} · ${new Date(run.created_at).toLocaleString()}`,
      },
    ];
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="reports"
      />
      <p className="section-kicker">Stage 5</p>
      <h1 aria-label="Reports and exports" className="mt-1 text-3xl font-semibold tracking-tight">
        Final review and reports
      </h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Bring submission blockers, missing evidence, proposal issues, and human decisions into one
        executive review. Reports never represent automatic approval.
      </p>
      <details className="surface-card" open={!reportRuns?.length}>
        <summary className="cursor-pointer list-none px-4 py-4 font-semibold">
          Generate a new report{' '}
          <span className="ml-2 text-sm font-normal text-slate-500">
            Choose a completed draft review
          </span>
        </summary>
        <div className="border-t border-slate-200 p-4">
          <ReportGenerationControls workspaceId={workspaceId} sourceOptions={sourceOptions} />
        </div>
      </details>
      <section className="mt-8" aria-labelledby="report-history">
        <h2 id="report-history" className="mb-1 text-lg font-semibold">
          Executive review history
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Open the latest report for the current opportunity state.
        </p>
        {reportRuns?.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {reportRuns.slice(0, pageSize).map((run) => {
              const snapshot = (
                run.report_snapshots as unknown as Array<{ id: string }> | null
              )?.[0];
              return (
                <li key={run.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    {snapshot ? (
                      <Link
                        href={`/w/${workspaceId}/reports/${snapshot.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {businessLabel(run.report_type)}
                      </Link>
                    ) : (
                      <span className="font-medium">{businessLabel(run.report_type)}</span>
                    )}
                    <StatusBadge value={run.status} />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Generated {formatDate(run.created_at)} · Human review remains separate
                  </p>
                  <p className="analyst-only mt-2 text-xs text-slate-500">
                    Input {run.input_hash.slice(0, 12)}…
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No reports yet.</p>
        )}
        <nav aria-label="Report history pages" className="mt-3 flex gap-3 text-sm">
          {historyPage > 1 ? (
            <Link
              href={`/w/${workspaceId}/reports?page=${historyPage - 1}`}
              className="text-blue-700 hover:underline"
            >
              ← Newer
            </Link>
          ) : null}
          {(reportRuns?.length ?? 0) > pageSize ? (
            <Link
              href={`/w/${workspaceId}/reports?page=${historyPage + 1}`}
              className="text-blue-700 hover:underline"
            >
              Older →
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
