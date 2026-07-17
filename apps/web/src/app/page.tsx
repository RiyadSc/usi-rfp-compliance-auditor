import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signOut } from './login/actions';
import { createWorkspace } from './workspaces/actions';

export default async function WorkspaceListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: workspaces, error: listError } = await supabase
    .from('workspaces')
    .select('id, name, customer, deadline, status, created_at')
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </div>

      <section
        aria-labelledby="create-heading"
        className="mb-10 rounded border border-slate-200 bg-white p-4"
      >
        <h2 id="create-heading" className="text-base font-medium mb-3">
          Create workspace
        </h2>
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Could not create the workspace. Check the fields and try again.
          </p>
        ) : null}
        <form action={createWorkspace} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Opportunity name <span aria-hidden="true">*</span>
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="customer" className="block text-sm font-medium mb-1">
              Customer / agency
            </label>
            <input
              id="customer"
              name="customer"
              maxLength={120}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium mb-1">
              Response deadline
            </label>
            <input
              id="deadline"
              name="deadline"
              type="date"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              maxLength={2000}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Create workspace
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-base font-medium mb-3">
          Your workspaces
        </h2>
        {listError ? (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Could not load workspaces. Reload the page to retry.
          </p>
        ) : workspaces && workspaces.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/w/${w.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-medium">{w.name}</span>
                    <span className="block text-sm text-slate-600">
                      {w.customer ?? 'No customer set'}
                      {w.deadline ? ` — due ${w.deadline}` : ''}
                    </span>
                  </span>
                  <span className="text-sm text-slate-500">{w.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
            No workspaces yet. Create one above to begin.
          </p>
        )}
      </section>
    </main>
  );
}
