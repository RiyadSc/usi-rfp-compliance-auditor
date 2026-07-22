import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = '' } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  let query = supabase
    .from('checklist_items')
    .select(
      'id,workspace_id,title,category,workflow_status,due_at,proof_requirement,artifact_state',
    )
    .eq('owner_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
    .eq('lifecycle_status', 'active')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(100);
  if (status) query = query.eq('workflow_status', status);
  const { data: items } = await query;
  const workspaceIds = [...new Set((items ?? []).map((item) => item.workspace_id))];
  const { data: workspaces } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name,customer,deadline').in('id', workspaceIds)
    : { data: [] };
  const names = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace]));
  const open = (items ?? []).filter(
    (item) => !['completed', 'waived', 'not_applicable'].includes(item.workflow_status),
  );
  return (
    <>
      <AppHeader />
      <main className="page-shell">
        <p className="section-kicker">Personal work queue</p>
        <h1 className="page-title mt-1">My Work</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Your assigned actions across authorized opportunities. Completing a task never changes the
          underlying RFP evidence or human-review decision.
        </p>
        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="My work summary">
          <Metric label="Open assignments" value={open.length} />
          <Metric
            label="Blocked or unresolved"
            value={
              open.filter((item) => ['blocked', 'unresolved'].includes(item.workflow_status)).length
            }
          />
          <Metric
            label="Company evidence needed"
            value={open.filter((item) => item.proof_requirement !== 'none_identified').length}
          />
        </section>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="My work saved views">
          <View href="/my-work" active={!status}>
            Open work
          </View>
          <View href="/my-work?status=blocked" active={status === 'blocked'}>
            Blocked
          </View>
          <View href="/my-work?status=in_progress" active={status === 'in_progress'}>
            In progress
          </View>
          <View href="/my-work?status=ready_for_review" active={status === 'ready_for_review'}>
            Ready for review
          </View>
        </div>
        {open.length ? (
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {open.map((item) => {
              const workspace = names.get(item.workspace_id);
              return (
                <li key={item.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {workspace?.name ?? 'Opportunity'} · {businessLabel(item.category)}
                      </p>
                      <Link
                        className="mt-1 block font-semibold text-blue-800 hover:underline"
                        href={`/w/${item.workspace_id}/checklist/${item.id}`}
                      >
                        {item.title}
                      </Link>
                    </div>
                    <StatusBadge value={item.workflow_status} />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      {item.due_at ? `Due ${formatDate(item.due_at)}` : 'No item due date'}
                    </span>
                    <span>{businessLabel(item.artifact_state)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-semibold">No assigned work in this view</h2>
            <p className="mt-1 text-sm text-slate-600">
              Open an opportunity checklist to review unassigned work.
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}
function View({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white'}`}
    >
      {children}
    </Link>
  );
}
