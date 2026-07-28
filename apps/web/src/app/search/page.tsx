import Link from 'next/link';
import { z } from 'zod';
import { AppHeader } from '@/components/app-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyStateArt } from '@/components/brand';
import { IconSearch } from '@/components/icons';
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
        <div className="page-header">
          <div className="min-w-0">
            <p className="page-eyebrow">Authorized account search</p>
            <h1 className="page-title mt-2">Search</h1>
            <p className="page-lede mt-3">
              Find opportunities, RFP requirements, and checklist work you are permitted to access.
            </p>
          </div>
        </div>
        <form className="filter-bar flex flex-wrap items-center gap-2" role="search">
          <label htmlFor="search-query" className="sr-only">
            Search opportunities, requirements, and work
          </label>
          <div className="search-field min-w-0 flex-1 basis-56">
            <IconSearch size={16} />
            <input
              id="search-query"
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Try a form number, deadline, agency, or task"
            />
          </div>
          <button className="primary-action">Search</button>
        </form>
        {!q ? (
          <div className="empty-state mt-8">
            <EmptyStateArt />
            <p className="empty-state-body">
              Enter a business name, form number, requirement, or task. Results stay limited to
              opportunities you are authorized to open.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
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
      <h2 className="section-title">{title}</h2>
      {has ? (
        <ul className="surface-card mt-3 divide-y divide-line-subtle overflow-hidden">
          {children}
        </ul>
      ) : (
        <p className="surface-panel mt-3 px-5 py-6 text-center text-sm text-ink-muted">{empty}</p>
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
        className="group flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-800/50"
      >
        <span className="min-w-0">
          <span className="block font-medium text-ink break-words group-hover:text-teal-300">
            {title}
          </span>
          <span className="text-metadata block">{detail}</span>
        </span>
        <StatusBadge value={status} />
      </Link>
    </li>
  );
}
