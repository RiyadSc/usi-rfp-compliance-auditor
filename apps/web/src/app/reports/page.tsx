import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
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
        <p className="section-kicker">Portfolio reporting</p>
        <h1 className="page-title mt-1">Reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Open the latest deterministic readiness and proposal-review reports across your authorized
          opportunities. Reports support final human review; they are not approval.
        </p>
        {(runs ?? []).length ? (
          <ul className="mt-7 grid gap-3 md:grid-cols-2">
            {(runs ?? []).map((run) => {
              const snapshot = (
                run.report_snapshots as unknown as Array<{ id: string }> | null
              )?.[0];
              const workspace = names.get(run.workspace_id);
              return (
                <li key={run.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">{workspace?.name ?? 'Opportunity'}</p>
                      {snapshot ? (
                        <Link
                          href={`/w/${run.workspace_id}/reports/${snapshot.id}`}
                          className="mt-1 block font-semibold text-blue-800 hover:underline"
                        >
                          {businessLabel(run.report_type)}
                        </Link>
                      ) : (
                        <p className="mt-1 font-semibold">{businessLabel(run.report_type)}</p>
                      )}
                    </div>
                    <StatusBadge value={run.status} />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Generated {formatDate(run.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-semibold">No reports yet</h2>
            <p className="mt-1 text-sm text-slate-600">
              Open an opportunity after a completed proposal review to generate its first report.
            </p>
            <Link href="/opportunities" className="secondary-action mt-4">
              Open opportunities
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
