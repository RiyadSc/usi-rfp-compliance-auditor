import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyStateArt } from '@/components/brand';
import { IconCalendar } from '@/components/icons';
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
        <div className="page-header">
          <div className="min-w-0">
            <p className="page-eyebrow">Personal work queue</p>
            <h1 className="page-title mt-2">My Work</h1>
            <p className="page-lede mt-3">
              Your assigned checklist actions across opportunities. Open an item to see due date,
              proof needed, and the linked requirement. Completing a task never changes RFP evidence
              or a human-review decision.
            </p>
          </div>
        </div>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="My work summary">
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
        <div className="mt-6 flex flex-wrap gap-2" aria-label="My work saved views">
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
          <ul className="mt-6 grid gap-3 lg:grid-cols-2">
            {open.map((item) => {
              const workspace = names.get(item.workspace_id);
              const days = item.due_at
                ? Math.ceil((new Date(item.due_at).valueOf() - Date.now()) / 86_400_000)
                : null;
              const overdue = days != null && days < 0;
              const blocked = ['blocked', 'unresolved'].includes(item.workflow_status);
              const dueSoon = days != null && days >= 0 && days <= 7;
              const rail = overdue || blocked ? 'rail-critical' : dueSoon ? 'rail-warning' : '';
              return (
                <li key={item.id} className={`surface-card min-w-0 p-4 ${rail}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-metadata">
                        {workspace?.name ?? 'Opportunity'} · {businessLabel(item.category)}
                      </p>
                      <Link
                        className="mt-1 block font-semibold text-ink break-words transition-colors hover:text-teal-300"
                        href={`/w/${item.workspace_id}/checklist/${item.id}`}
                      >
                        {item.title}
                      </Link>
                    </div>
                    <StatusBadge value={item.workflow_status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line-subtle pt-3 text-xs">
                    <span
                      className={`inline-flex items-center gap-1.5 tabular ${
                        overdue
                          ? 'font-semibold text-critical-400'
                          : dueSoon
                            ? 'font-semibold text-warning-400'
                            : 'text-ink-soft'
                      }`}
                    >
                      <IconCalendar size={13} className="shrink-0" />
                      {item.due_at ? `Due ${formatDate(item.due_at)}` : 'No item due date'}
                    </span>
                    <span className="text-metadata">{businessLabel(item.artifact_state)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state mt-6">
            <EmptyStateArt />
            <h2 className="empty-state-title">No assigned work in this view</h2>
            <p className="empty-state-body">
              Checklist items appear here when they are assigned to you. Open an opportunity’s
              submission list to pick up unassigned work, or switch the filter above.
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card p-4">
      <p className="metric-label">{label}</p>
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
      className={`chip ${active ? 'chip-active' : ''}`}
    >
      {children}
    </Link>
  );
}
