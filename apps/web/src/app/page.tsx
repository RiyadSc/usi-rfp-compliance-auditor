import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deadlineLabel, formatDate, statusTone, businessLabel } from '@/lib/presentation';
import { StatusBadge } from '@/components/status-badge';
import { EvidenceField } from '@/components/brand';
import { IconBlocker, IconCalendar, IconSearch } from '@/components/icons';
import { signOut } from './login/actions';
import { createWorkspace } from './workspaces/actions';

type WorkspaceRow = {
  id: string;
  name: string;
  customer: string | null;
  deadline: string | null;
  status: string;
  created_at: string;
};

const isDemo = (workspace: WorkspaceRow) => /demo|harbor city|synthetic/i.test(workspace.name);
const isTest = (workspace: WorkspaceRow) =>
  /e2e|test|isolation|phase\s?\d|authz|malformed|oversize|fake pdf|\biso\b|\brls\b/i.test(
    workspace.name,
  );

async function PortfolioPage({
  searchParams,
  mode = 'home',
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
  mode?: 'home' | 'opportunities';
}) {
  const { error, q = '' } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: workspaces, error: listError } = await supabase
    .from('workspaces')
    .select('id, name, customer, deadline, status, created_at')
    .order('created_at', { ascending: false });
  const query = q.trim().toLowerCase();
  const visible = ((workspaces ?? []) as WorkspaceRow[]).filter(
    (workspace) =>
      !query ||
      workspace.name.toLowerCase().includes(query) ||
      workspace.customer?.toLowerCase().includes(query),
  );
  const demos = visible.filter(isDemo);
  const tests = visible.filter((workspace) => !isDemo(workspace) && isTest(workspace));
  const drafts = visible.filter(
    (workspace) =>
      !isDemo(workspace) && !isTest(workspace) && !workspace.customer && !workspace.deadline,
  );
  const active = visible.filter(
    (workspace) =>
      !isDemo(workspace) &&
      !isTest(workspace) &&
      (Boolean(workspace.customer) || Boolean(workspace.deadline)),
  );
  const atRisk = active.filter((workspace) => {
    const days = workspace.deadline
      ? Math.ceil((new Date(`${workspace.deadline}T23:59:59`).valueOf() - Date.now()) / 86_400_000)
      : null;
    return days != null && days <= 14;
  }).length;
  const { data: auth } = await supabase.auth.getUser();
  const workspaceIds = [...active, ...demos].slice(0, 200).map((workspace) => workspace.id);
  const [{ data: ownedItems }, { data: openBlockers }] = workspaceIds.length
    ? await Promise.all([
        auth.user
          ? supabase
              .from('checklist_items')
              .select('id,workspace_id,title,workflow_status,due_at')
              .in('workspace_id', workspaceIds)
              .eq('owner_id', auth.user.id)
              .neq('workflow_status', 'completed')
              .limit(6)
          : Promise.resolve({ data: [] }),
        supabase
          .from('checklist_blockers')
          .select('id,workspace_id,severity,reason,status')
          .in('workspace_id', workspaceIds)
          .in('status', ['open', 'reopened'])
          .limit(20),
      ])
    : [{ data: [] }, { data: [] }];
  const workspaceById = new Map(visible.map((workspace) => [workspace.id, workspace]));
  const attention = (openBlockers ?? []).slice(0, 3);
  const displayedActive = mode === 'home' ? active.slice(0, 6) : active.slice(0, 50);

  return (
    <>
      <AppHeader />
      <main className="page-shell">
        <header className="page-header">
          <div className="min-w-0">
            <p className="page-eyebrow">
              {mode === 'home' ? 'Your bid command center' : 'Bid portfolio'}
            </p>
            <h1 className="page-title mt-2">
              {mode === 'home' ? 'Good morning' : 'Opportunities'}
            </h1>
            <p className="page-lede mt-3">
              {mode === 'home'
                ? 'See what needs attention, where each opportunity stands, and the next action your team should take.'
                : 'Compare deadlines, submission risk, ownership, and team progress across active bids.'}
            </p>
          </div>
          <form action={signOut} className="page-actions">
            <button type="submit" className="secondary-action">
              Sign out
            </button>
          </form>
        </header>

        {mode === 'home' ? (
          <section
            className="mb-8 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]"
            aria-label="Home priorities"
          >
            <div className="hero-panel texture-nodes p-6 lg:p-7">
              <EvidenceField className="opacity-20" />
              <div className="relative">
                <p className="section-kicker">Needs attention</p>
                <h2 className="section-title mt-2 text-xl">Top issues across your opportunities</h2>
                {attention.length ? (
                  <ol className="mt-4 divide-y divide-line-subtle">
                    {attention.map((blocker) => (
                      <li
                        key={blocker.id}
                        className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3.5"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 shrink-0 text-critical-400" aria-hidden="true">
                            <IconBlocker size={15} />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium break-words text-ink">{blocker.reason}</p>
                            <p className="text-metadata mt-1">
                              {workspaceById.get(blocker.workspace_id)?.name ??
                                'Authorized opportunity'}
                            </p>
                          </div>
                        </div>
                        <Link
                          className="action-link whitespace-nowrap text-sm"
                          href={`/w/${blocker.workspace_id}/checklist?blocker=yes`}
                        >
                          Resolve →
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-sm text-ink-soft">
                    No active blockers are visible in your opportunities.
                  </p>
                )}
              </div>
            </div>
            <div className="surface-card rail-teal flex flex-col p-6">
              <p className="section-kicker text-teal-400">Recommended start</p>
              <h2 className="section-title mt-2 text-lg">Open the highest-priority opportunity</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Review the deadline, top blockers, and the single recommended next action.
              </p>
              <Link
                className="primary-action mt-5 self-start"
                href={
                  active[0]
                    ? `/w/${active[0].id}`
                    : demos[0]
                      ? `/w/${demos[0].id}`
                      : '/opportunities'
                }
              >
                Open opportunity →
              </Link>
            </div>
          </section>
        ) : null}

        <section aria-label="Portfolio summary" className="mb-8 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Active opportunities"
            value={active.length}
            note="Customer opportunities"
          />
          <Metric
            label="Deadlines within 14 days"
            value={atRisk}
            note={atRisk ? 'Review these opportunities first' : 'No near-term deadlines'}
            tone={atRisk ? 'danger' : 'positive'}
          />
          <Metric label="Prepared demos" value={demos.length} note="Synthetic/public data only" />
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-8">
            <form className="filter-bar flex flex-wrap items-center gap-2" role="search">
              <label htmlFor="opportunity-search" className="sr-only">
                Search opportunities
              </label>
              <div className="search-field min-w-0 flex-1 basis-56">
                <IconSearch size={16} />
                <input
                  id="opportunity-search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search by opportunity or customer"
                />
              </div>
              <button className="secondary-action">Search</button>
              {query ? (
                <Link href="/" className="action-link self-center px-2 text-sm">
                  Clear
                </Link>
              ) : null}
            </form>

            {listError ? (
              <p role="alert" className="notice notice-critical">
                Opportunities could not be loaded. Reload the page to try again.
              </p>
            ) : (
              <>
                <WorkspaceGroup
                  heading="Active bids"
                  description="Bids currently being evaluated or prepared"
                  workspaces={displayedActive}
                  empty="No active opportunities match this view."
                />
                {active.length > displayedActive.length ? (
                  <div className="-mt-5 text-right">
                    <Link href="/opportunities" className="action-link text-sm">
                      View all {active.length} opportunities →
                    </Link>
                  </div>
                ) : null}
                <WorkspaceGroup
                  heading="Prepared demonstrations"
                  description="Known-answer environments designed for a safe product walkthrough"
                  workspaces={demos}
                  empty="No prepared demonstrations are available."
                  demo
                />
                {tests.length ? (
                  <details className="disclosure">
                    <summary className="justify-start gap-2 font-semibold text-ink after:ml-auto">
                      Test workspaces{' '}
                      <span className="text-sm font-normal text-ink-muted">({tests.length})</span>
                    </summary>
                    <div className="disclosure-body">
                      <p className="mb-4 text-sm text-ink-soft">
                        Development and isolation workspaces are hidden from the main portfolio.
                      </p>
                      <WorkspaceList workspaces={tests} />
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {mode === 'home' ? (
              <section className="surface-card p-5" aria-labelledby="my-work-preview">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="my-work-preview" className="section-title">
                    My work
                  </h2>
                  <Link href="/my-work" className="action-link text-sm">
                    View all
                  </Link>
                </div>
                {(ownedItems ?? []).length ? (
                  <ul className="mt-3 divide-y divide-line-subtle">
                    {(ownedItems ?? []).slice(0, 4).map((item) => (
                      <li key={item.id} className="py-2.5">
                        <Link
                          href={`/w/${item.workspace_id}/checklist/${item.id}`}
                          className="block text-sm font-medium break-words text-ink transition-colors hover:text-teal-300"
                        >
                          {item.title}
                        </Link>
                        <p className="text-metadata mt-0.5">
                          {businessLabel(item.workflow_status)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">No open work is assigned to you.</p>
                )}
              </section>
            ) : null}
            <section className="surface-card p-5">
              <h2 id="create-heading" className="section-title">
                New opportunity
              </h2>
              <p className="section-lede">Create a private workspace for one RFP response.</p>
              {error ? (
                <p role="alert" className="notice notice-critical mt-4">
                  The opportunity could not be created. Check the fields and try again.
                </p>
              ) : null}
              {drafts.length ? (
                <details className="disclosure mt-4">
                  <summary className="justify-start gap-2 font-semibold text-ink after:ml-auto">
                    Draft opportunities{' '}
                    <span className="text-sm font-normal text-ink-muted">({drafts.length})</span>
                  </summary>
                  <div className="disclosure-body">
                    <p className="mb-4 text-sm text-ink-soft">
                      Early workspaces without a customer or response deadline are kept out of the
                      director portfolio until they are defined.
                    </p>
                    <WorkspaceList workspaces={drafts.slice(0, 50)} />
                  </div>
                </details>
              ) : null}
              <WorkspaceForm />
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

export default async function HomePage(props: {
  searchParams: Promise<{ error?: string; q?: string; view?: string }>;
}) {
  const params = await props.searchParams;
  return (
    <PortfolioPage
      searchParams={Promise.resolve(params)}
      mode={params.view === 'opportunities' ? 'opportunities' : 'home'}
    />
  );
}

function Metric({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  note: string;
  tone?: 'neutral' | 'positive' | 'danger';
}) {
  return (
    <div className={`metric-card p-4 ${tone === 'danger' ? 'rail-critical' : ''}`}>
      <p className="metric-label">{label}</p>
      <p
        className={`metric-value ${tone === 'danger' ? 'text-critical-400' : tone === 'positive' ? 'text-success-400' : 'text-ink'}`}
      >
        {value}
      </p>
      <p className="metric-note">{note}</p>
    </div>
  );
}

function WorkspaceGroup({
  heading,
  description,
  workspaces,
  empty,
  demo = false,
}: {
  heading: string;
  description: string;
  workspaces: WorkspaceRow[];
  empty: string;
  demo?: boolean;
}) {
  return (
    <section aria-labelledby={`${heading.replaceAll(' ', '-').toLowerCase()}-heading`}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${heading.replaceAll(' ', '-').toLowerCase()}-heading`}
            className="section-title text-lg"
          >
            {heading}
          </h2>
          <p className="section-lede">{description}</p>
        </div>
      </div>
      {workspaces.length ? (
        <WorkspaceList workspaces={workspaces} demo={demo} />
      ) : (
        <p className="empty-state text-sm text-ink-soft">{empty}</p>
      )}
    </section>
  );
}

function WorkspaceList({
  workspaces,
  demo = false,
}: {
  workspaces: WorkspaceRow[];
  demo?: boolean;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {workspaces.map((workspace) => {
        const days = workspace.deadline
          ? Math.ceil(
              (new Date(`${workspace.deadline}T23:59:59`).valueOf() - Date.now()) / 86_400_000,
            )
          : null;
        const overdue = days != null && days < 0;
        const urgent = days != null && days >= 0 && days <= 7;
        return (
          <li key={workspace.id} className="min-w-0">
            <Link
              href={`/w/${workspace.id}`}
              className="surface-card surface-card-interactive group flex h-full flex-col p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-semibold break-words text-ink transition-colors group-hover:text-teal-300">
                  {workspace.name}
                </span>
                <StatusBadge
                  value={demo ? 'informational' : workspace.status}
                  label={demo ? 'Prepared demo' : businessLabel(workspace.status)}
                  tone={demo ? 'info' : statusTone(workspace.status)}
                />
              </div>
              <p className="text-metadata mt-2">{workspace.customer ?? 'Customer not set'}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line-subtle pt-3.5 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    overdue
                      ? 'font-semibold text-critical-400'
                      : urgent
                        ? 'font-semibold text-warning-400'
                        : workspace.deadline
                          ? 'font-semibold text-ink'
                          : 'text-ink-muted'
                  }`}
                >
                  <IconCalendar size={13} className="shrink-0" />
                  {deadlineLabel(workspace.deadline)}
                </span>
                <span className="text-metadata tabular">
                  {workspace.deadline ? formatDate(workspace.deadline) : ''}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function WorkspaceForm() {
  return (
    <form action={createWorkspace} className="mt-5 grid gap-4">
      <label htmlFor="name" className="field">
        <span className="field-label">
          Opportunity name <span aria-hidden="true">*</span>
        </span>
        <input id="name" name="name" required minLength={2} maxLength={120} />
      </label>
      <label htmlFor="customer" className="field">
        <span className="field-label">Customer / agency</span>
        <input id="customer" name="customer" maxLength={120} />
      </label>
      <label htmlFor="deadline" className="field">
        <span className="field-label">Response deadline</span>
        <input id="deadline" name="deadline" type="date" />
      </label>
      <label htmlFor="description" className="field">
        <span className="field-label">Description</span>
        <textarea id="description" name="description" rows={2} maxLength={2000} />
      </label>
      <button type="submit" aria-label="Create workspace" className="secondary-action mt-1">
        Create opportunity
      </button>
    </form>
  );
}
