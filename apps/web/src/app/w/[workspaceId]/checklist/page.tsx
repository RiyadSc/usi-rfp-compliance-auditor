import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GenerateChecklistButton } from './generate-button';

const uuid = z.string().uuid();
const label = (value: string) => value.replaceAll('_', ' ');

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const filters = await searchParams;
  if (!uuid.safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: latestRun } = await supabase
    .from('checklist_generation_runs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: latestVerification } = await supabase
    .from('verification_runs')
    .select('id,completed_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: links } = latestRun
    ? await supabase
        .from('checklist_generation_run_items')
        .select('checklist_item_id')
        .eq('workspace_id', workspaceId)
        .eq('generation_run_id', latestRun.id)
    : { data: [] };
  const itemIds = (links ?? []).map((item) => item.checklist_item_id);
  const { data: items } = itemIds.length
    ? await supabase
        .from('checklist_items')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('id', itemIds)
        .eq('lifecycle_status', 'active')
        .order('category')
        .order('title')
    : { data: [] };
  const { data: blockers } = itemIds.length
    ? await supabase
        .from('checklist_blockers')
        .select('id,checklist_item_id,blocker_type,severity,status,reason')
        .eq('workspace_id', workspaceId)
        .in('checklist_item_id', itemIds)
        .in('status', ['open', 'reopened'])
    : { data: [] };
  const { data: readiness } = latestRun
    ? await supabase
        .from('checklist_readiness_snapshots')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('generation_run_id', latestRun.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const blocked = new Set((blockers ?? []).map((blocker) => blocker.checklist_item_id));
  const selected = (items ?? []).filter(
    (item) =>
      (!filters.category || item.category === filters.category) &&
      (!filters.status || item.workflow_status === filters.status) &&
      (!filters.owner || item.owner_id === filters.owner) &&
      (!filters.blocker ||
        (filters.blocker === 'yes' ? blocked.has(item.id) : !blocked.has(item.id))) &&
      (!filters.unresolved || item.workflow_status === 'unresolved') &&
      (!filters.proof || item.proof_requirement !== 'none_identified') &&
      (!filters.due || Boolean(item.due_at)),
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link className="text-blue-700 hover:underline" href={`/w/${workspaceId}`}>
          ← {workspace.name}
        </Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Deterministic checklist and blockers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Machine-generated workflow structure. Human review and source verification remain
            separate.
          </p>
        </div>
        {latestVerification ? (
          <GenerateChecklistButton
            workspaceId={workspaceId}
            verificationRunId={latestVerification.id}
          />
        ) : (
          <p className="text-sm text-slate-600">A completed verification run is required.</p>
        )}
      </div>
      {readiness ? (
        <section
          aria-label="Readiness"
          className="mb-6 rounded border border-slate-300 bg-white p-4"
        >
          <p className="text-lg font-semibold">{readiness.summary}</p>
          <p className="mt-1 text-sm text-slate-700">
            {readiness.completed_required} of {readiness.total_required} required items complete ·{' '}
            {readiness.blocked_items} blocked · {readiness.unresolved_items} unresolved ·{' '}
            {readiness.items_requiring_human_proof} require human proof
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Calculated by {readiness.engine_version}. This is workflow readiness, not source
            approval or a submission determination.
          </p>
        </section>
      ) : null}
      <form
        aria-label="Checklist filters"
        className="mb-5 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <label className="text-sm">
          Category
          <input
            name="category"
            defaultValue={String(filters.category ?? '')}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Workflow status
          <input
            name="status"
            defaultValue={String(filters.status ?? '')}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Owner ID
          <input
            name="owner"
            defaultValue={String(filters.owner ?? '')}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Blocker
          <select
            name="blocker"
            defaultValue={String(filters.blocker ?? '')}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="">All</option>
            <option value="yes">Blocked</option>
            <option value="no">No active blocker</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="unresolved"
            value="yes"
            defaultChecked={Boolean(filters.unresolved)}
          />
          Unresolved only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="proof" value="yes" defaultChecked={Boolean(filters.proof)} />
          Requires human proof
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="due" value="yes" defaultChecked={Boolean(filters.due)} />
          Has due date
        </label>
        <button className="w-fit rounded border border-slate-400 px-3 py-1 text-sm">
          Apply filters
        </button>
      </form>
      {selected.length ? (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[
                  'Requirement',
                  'Category',
                  'Source / precedence',
                  'Workflow',
                  'Owner',
                  'Due',
                  'Blocker',
                ].map((heading) => (
                  <th key={heading} className="px-3 py-2">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected.map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-3 py-3">
                    <Link
                      className="font-medium text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/checklist/${item.id}`}
                    >
                      {item.title}
                    </Link>
                    <span className="mt-1 block text-xs text-slate-500">
                      {item.machine_status === 'machine_assessment_only'
                        ? 'Machine-generated'
                        : item.machine_status}
                    </span>
                  </td>
                  <td className="px-3 py-3">{label(item.category)}</td>
                  <td className="px-3 py-3">
                    {label(item.source_support_status)} / {label(item.precedence_status)}
                    <span className="block text-xs text-slate-500">
                      Human review: {label(item.source_human_review_status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {label(item.workflow_status)}
                    <span className="block text-xs text-slate-500">
                      Artifact: {label(item.artifact_state)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.owner_id ? item.owner_id.slice(0, 8) : 'Unassigned'}
                  </td>
                  <td className="px-3 py-3">
                    {item.due_at ? (
                      <>
                        <time dateTime={item.due_at}>{new Date(item.due_at).toLocaleString()}</time>
                        <span className="block text-xs">
                          {item.due_timezone ?? 'Timezone not stated'}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3">{blocked.has(item.id) ? 'Blocked' : 'None active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No checklist items match these filters.
        </p>
      )}
    </main>
  );
}
