import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuidSchema = z.string().uuid();

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!uuidSchema.safeParse(workspaceId).success) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  // RLS returns zero rows for non-members: same 404 for "does not exist"
  // and "not yours" so workspace existence is not leaked.
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, customer, deadline, description, status, created_at')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!workspace) {
    notFound();
  }

  const { data: events } = await supabase
    .from('audit_events')
    .select('id, event_type, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/" className="text-blue-700 hover:underline">
          ← Opportunities
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-1">{workspace.name}</h1>
      <p className="text-sm text-slate-600 mb-8">
        {workspace.customer ?? 'No customer set'}
        {workspace.deadline ? ` — response due ${workspace.deadline}` : ''} — status{' '}
        {workspace.status}
      </p>

      <section
        aria-labelledby="pipeline-heading"
        className="mb-10 rounded border border-slate-200 bg-white p-4"
      >
        <h2 id="pipeline-heading" className="text-base font-medium mb-2">
          Documents
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Upload the primary RFP (PDF). Parsing, candidate extraction, and independent source
          verification run as separate asynchronous stages.
        </p>
        <Link
          href={`/w/${workspaceId}/documents`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Open documents →
        </Link>
        <span className="mx-3 text-slate-300">|</span>
        <Link
          href={`/w/${workspaceId}/requirements`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Open requirement register →
        </Link>
        <span className="mx-3 text-slate-300">|</span>
        <Link
          href={`/w/${workspaceId}/checklist`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Open checklist and blockers →
        </Link>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="text-base font-medium mb-3">
          Activity
        </h2>
        {events && events.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between px-4 py-2">
                <span>{e.event_type}</span>
                <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No recorded activity.</p>
        )}
      </section>
    </main>
  );
}
