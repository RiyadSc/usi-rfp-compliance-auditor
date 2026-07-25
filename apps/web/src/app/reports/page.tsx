import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyStateArt } from '@/components/brand';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AccountReportsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id,name,customer')
    .order('created_at', { ascending: false });
  const ids = (workspaces ?? []).map((workspace) => workspace.id);
  const { data: runs } = ids.length
    ? await supabase
        .from('report_generation_runs')
        .select('id,workspace_id,report_type,status,created_at,report_snapshots(id)')
        .in('workspace_id', ids)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };
  const names = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace]));
  return (
    <>
      <AppHeader />
      <main className="page-shell">
        <div className="page-header">
          <div className="min-w-0">
            <p className="page-eyebrow">Portfolio reporting</p>
            <h1 className="page-title mt-2">Reports</h1>
            <p className="page-lede mt-3">
              Open the latest deterministic readiness and proposal-review reports across your
              authorized opportunities. Reports support final human review; they are not approval.
            </p>
          </div>
        </div>
        {(runs ?? []).length ? (
          <ul className="surface-card divide-y divide-line-subtle">
            {(runs ?? []).map((run) => {
              const snapshot = (
                run.report_snapshots as unknown as Array<{ id: string }> | null
              )?.[0];
              const workspace = names.get(run.workspace_id);
              return (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-metadata">{workspace?.name ?? 'Opportunity'}</p>
                    {snapshot ? (
                      <Link
                        href={`/w/${run.workspace_id}/reports/${snapshot.id}`}
                        className="action-link mt-1 block text-sm"
                      >
                        {businessLabel(run.report_type)}
                      </Link>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-ink">
                        {businessLabel(run.report_type)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <StatusBadge value={run.status} />
                    <p className="text-metadata tabular whitespace-nowrap">
                      Generated {formatDate(run.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <EmptyStateArt />
            <h2 className="empty-state-title">No reports yet</h2>
            <p className="empty-state-body">
              Open an opportunity after a completed proposal review to generate its first report.
            </p>
            <Link href="/opportunities" className="secondary-action">
              Open opportunities
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
