import Link from 'next/link';
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
const isTest = (workspace: WorkspaceRow) => /e2e|test|isolation|phase\s?\d/i.test(workspace.name);

export default async function WorkspaceListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
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
  const active = visible.filter((workspace) => !isDemo(workspace) && !isTest(workspace));
  const atRisk = active.filter((workspace) => {
    const days = workspace.deadline
      ? Math.ceil((new Date(`${workspace.deadline}T23:59:59`).valueOf() - Date.now()) / 86_400_000)
      : null;
    return days != null && days <= 14;
  }).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Bid portfolio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Opportunities</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Track submission risk, ownership, deadlines, and team decisions across active bids.
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

      <section aria-label="Portfolio summary" className="mb-7 grid gap-3 sm:grid-cols-3">
        <Metric label="Active opportunities" value={active.length} note="Customer opportunities" />
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
                workspaces={active}
                empty="No active opportunities match this view."
              />
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

        <aside className="surface-card p-4 lg:sticky lg:top-4">
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
          <WorkspaceForm />
        </aside>
      </div>
    </main>
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
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Create workspace
      </button>
    </form>
  );
}
