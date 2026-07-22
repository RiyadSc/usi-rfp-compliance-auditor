import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deadlineLabel, formatDate, statusTone, businessLabel } from '@/lib/presentation';
import { StatusBadge } from '@/components/status-badge';
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
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">
              {mode === 'home' ? 'Your bid command center' : 'Bid portfolio'}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {mode === 'home' ? 'Good morning' : 'Opportunities'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {mode === 'home'
                ? 'See what needs attention, where each opportunity stands, and the next action your team should take.'
                : 'Compare deadlines, submission risk, ownership, and team progress across active bids.'}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </header>

        {mode === 'home' ? (
          <section
            className="mb-7 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]"
            aria-label="Home priorities"
          >
            <div className="surface-card p-5">
              <p className="section-kicker">Needs attention</p>
              <h2 className="mt-1 text-xl font-semibold">Top issues across your opportunities</h2>
              {attention.length ? (
                <ol className="mt-4 divide-y divide-slate-200">
                  {attention.map((blocker) => (
                    <li key={blocker.id} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <p className="font-medium">{blocker.reason}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {workspaceById.get(blocker.workspace_id)?.name ??
                            'Authorized opportunity'}
                        </p>
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
                <p className="mt-4 text-sm text-slate-600">
                  No active blockers are visible in your opportunities.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p className="section-kicker text-blue-700">Recommended start</p>
              <h2 className="mt-2 text-lg font-semibold text-blue-950">
                Open the highest-priority opportunity
              </h2>
              <p className="mt-2 text-sm text-blue-900">
                Review the deadline, top blockers, and the single recommended next action.
              </p>
              <Link
                className="primary-action mt-4"
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

        <section aria-label="Portfolio summary" className="mb-7 grid gap-3 sm:grid-cols-3">
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

        <div className="grid items-start gap-7 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-7">
            <form className="surface-card flex gap-2 p-3" role="search">
              <label htmlFor="opportunity-search" className="sr-only">
                Search opportunities
              </label>
              <input
                id="opportunity-search"
                name="q"
                defaultValue={q}
                placeholder="Search by opportunity or customer"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Search
              </button>
              {query ? (
                <Link href="/" className="self-center px-2 text-sm text-blue-700 hover:underline">
                  Clear
                </Link>
              ) : null}
            </form>

            {listError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
              >
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
                  <div className="-mt-4 text-right">
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
                  <details className="surface-card">
                    <summary className="cursor-pointer list-none px-4 py-4 font-semibold">
                      Test workspaces{' '}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        ({tests.length})
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 p-4">
                      <p className="mb-3 text-sm text-slate-600">
                        Development and isolation workspaces are hidden from the main portfolio.
                      </p>
                      <WorkspaceList workspaces={tests} />
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            {mode === 'home' ? (
              <section className="surface-card p-4" aria-labelledby="my-work-preview">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="my-work-preview" className="font-semibold">
                    My work
                  </h2>
                  <Link href="/my-work" className="action-link text-sm">
                    View all
                  </Link>
                </div>
                {(ownedItems ?? []).length ? (
                  <ul className="mt-3 space-y-3">
                    {(ownedItems ?? []).slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/w/${item.workspace_id}/checklist/${item.id}`}
                          className="text-sm font-medium hover:text-blue-800"
                        >
                          {item.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {businessLabel(item.workflow_status)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">No open work is assigned to you.</p>
                )}
              </section>
            ) : null}
            <section className="surface-card p-4">
              <h2 id="create-heading" className="text-base font-semibold">
                New opportunity
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Create a private workspace for one RFP response.
              </p>
              {error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
                >
                  The opportunity could not be created. Check the fields and try again.
                </p>
              ) : null}
              {drafts.length ? (
                <details className="surface-card">
                  <summary className="cursor-pointer list-none px-4 py-4 font-semibold">
                    Draft opportunities{' '}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      ({drafts.length})
                    </span>
                  </summary>
                  <div className="border-t border-slate-200 p-4">
                    <p className="mb-3 text-sm text-slate-600">
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
    <div className="surface-card p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p
        className={`metric-value ${tone === 'danger' ? 'text-red-700' : tone === 'positive' ? 'text-emerald-700' : ''}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
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
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2
            id={`${heading.replaceAll(' ', '-').toLowerCase()}-heading`}
            className="text-lg font-semibold"
          >
            {heading}
          </h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
      {workspaces.length ? (
        <WorkspaceList workspaces={workspaces} demo={demo} />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          {empty}
        </p>
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
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <Link
            href={`/w/${workspace.id}`}
            className="surface-card group block h-full p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-slate-950 group-hover:text-blue-800">
                {workspace.name}
              </span>
              <StatusBadge
                value={demo ? 'informational' : workspace.status}
                label={demo ? 'Prepared demo' : businessLabel(workspace.status)}
                tone={demo ? 'info' : statusTone(workspace.status)}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {workspace.customer ?? 'Customer not set'}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span
                className={workspace.deadline ? 'font-semibold text-slate-800' : 'text-slate-500'}
              >
                {deadlineLabel(workspace.deadline)}
              </span>
              <span className="text-slate-500">
                {workspace.deadline ? formatDate(workspace.deadline) : ''}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceForm() {
  return (
    <form action={createWorkspace} className="mt-4 grid gap-3">
      <label htmlFor="name" className="text-sm font-medium">
        Opportunity name <span aria-hidden="true">*</span>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label htmlFor="customer" className="text-sm font-medium">
        Customer / agency
        <input
          id="customer"
          name="customer"
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label htmlFor="deadline" className="text-sm font-medium">
        Response deadline
        <input
          id="deadline"
          name="deadline"
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label htmlFor="description" className="text-sm font-medium">
        Description
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        aria-label="Create workspace"
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Create opportunity
      </button>
    </form>
  );
}
