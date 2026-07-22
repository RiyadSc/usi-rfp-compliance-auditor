import Link from 'next/link';
import { z } from 'zod';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
import { businessLabel } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.string().trim().max(120);
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const parsed = querySchema.safeParse((await searchParams).q ?? '');
  const q = parsed.success ? parsed.data.replaceAll(',', ' ') : '';
  const supabase = await createSupabaseServerClient();
  const pattern = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const [workspaceResult, requirementResult, workResult] = q
    ? await Promise.all([
        supabase
          .from('workspaces')
          .select('id,name,customer,status,deadline')
          .or(`name.ilike.${pattern},customer.ilike.${pattern}`)
          .limit(10),
        supabase
          .from('requirement_candidates')
          .select('id,workspace_id,title,category,mandatory_class,preliminary_page')
          .or(`title.ilike.${pattern},obligation.ilike.${pattern}`)
          .limit(15),
        supabase
          .from('checklist_items')
          .select('id,workspace_id,title,category,workflow_status')
          .or(`title.ilike.${pattern},obligation.ilike.${pattern}`)
          .limit(15),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  return (
    <>
      <AppHeader />
      <main className="page-shell">
        <p className="section-kicker">Authorized account search</p>
        <h1 className="page-title mt-1">Search</h1>
        <p className="mt-2 text-sm text-slate-600">
          Find opportunities, RFP requirements, and checklist work you are permitted to access.
        </p>
        <form className="surface-card mt-6 flex gap-2 p-3" role="search">
          <label htmlFor="search-query" className="sr-only">
            Search opportunities, requirements, and work
          </label>
          <input
            id="search-query"
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Try a form number, deadline, agency, or task"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="primary-action">Search</button>
        </form>
        {!q ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            Enter a business name, form number, requirement, or task.
          </p>
        ) : (
          <div className="mt-7 space-y-8">
            <Results title="Opportunities" empty="No opportunities match.">
              {(workspaceResult.data ?? []).map((row) => (
                <Result
                  key={row.id}
                  href={`/w/${row.id}`}
                  title={row.name}
                  detail={row.customer ?? 'Customer not set'}
                  status={row.status}
                />
              ))}
            </Results>
            <Results title="Requirements" empty="No requirements match.">
              {(requirementResult.data ?? []).map((row) => (
                <Result
                  key={row.id}
                  href={`/w/${row.workspace_id}/requirements/${row.id}`}
                  title={row.title}
                  detail={`${businessLabel(row.category)} · page ${row.preliminary_page}`}
                  status={row.mandatory_class}
                />
              ))}
            </Results>
            <Results title="Checklist work" empty="No checklist items match.">
              {(workResult.data ?? []).map((row) => (
                <Result
                  key={row.id}
                  href={`/w/${row.workspace_id}/checklist/${row.id}`}
                  title={row.title}
                  detail={businessLabel(row.category)}
                  status={row.workflow_status}
                />
              ))}
            </Results>
          </div>
        )}
      </main>
    </>
  );
}
function Results({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {has ? (
        <ul className="surface-card mt-3 divide-y divide-slate-200">{children}</ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}
function Result({
  href,
  title,
  detail,
  status,
}: {
  href: string;
  title: string;
  detail: string;
  status: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
      >
        <span>
          <span className="block font-medium text-blue-800">{title}</span>
          <span className="text-sm text-slate-600">{detail}</span>
        </span>
        <StatusBadge value={status} />
      </Link>
    </li>
  );
}
