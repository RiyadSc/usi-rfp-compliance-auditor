import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GenerateChecklistButton } from './generate-button';

const uuid = z.string().uuid();
const label = businessLabel;

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
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id,role')
    .eq('workspace_id', workspaceId)
    .order('role');
  const memberNames = new Map(
    (members ?? []).map((member, index) => [
      member.user_id,
      `${businessLabel(member.role)} · Team member ${index + 1}`,
    ]),
  );
  const blocked = new Set((blockers ?? []).map((blocker) => blocker.checklist_item_id));
  const selected = (items ?? []).filter(
    (item) =>
      (!filters.category || item.category === filters.category) &&
      (!filters.status || item.workflow_status === filters.status) &&
      (!filters.owner ||
        (filters.owner === 'unassigned' ? !item.owner_id : item.owner_id === filters.owner)) &&
      (!filters.blocker ||
        (filters.blocker === 'yes' ? blocked.has(item.id) : !blocked.has(item.id))) &&
      (!filters.unresolved || item.workflow_status === 'unresolved') &&
      (!filters.proof || item.proof_requirement !== 'none_identified') &&
      (!filters.due || Boolean(item.due_at)),
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="checklist"
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Stage 3</p>
          <h1
            aria-label="Deterministic checklist and blockers"
            className="mt-1 text-3xl font-semibold tracking-tight"
          >
            Submission plan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Assign work, resolve blockers, collect company evidence, and prepare the response for
            final team review.
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
        <section aria-label="Readiness" className="surface-card mb-6 overflow-hidden">
          <div className="grid gap-px bg-slate-200 sm:grid-cols-4">
            <ReadinessMetric
              label="Required work"
              value={`${readiness.completed_required} of ${readiness.total_required}`}
              note="tasks complete"
            />
            <ReadinessMetric
              label="Submission blockers"
              value={readiness.blocked_items}
              note="need action"
              danger={readiness.blocked_items > 0}
            />
            <ReadinessMetric
              label="Unresolved"
              value={readiness.unresolved_items}
              note="need a decision"
              warning={readiness.unresolved_items > 0}
            />
            <ReadinessMetric
              label="Company evidence"
              value={readiness.items_requiring_human_proof}
              note="items need proof"
              info={readiness.items_requiring_human_proof > 0}
            />
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="font-semibold">{readiness.summary}</p>
            <p className="analyst-only mt-1 text-xs text-slate-500">
              Calculated by {readiness.engine_version}. This is workflow readiness, not source
              approval or a submission determination.
            </p>
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Saved checklist views">
        <Preset
          href={`/w/${workspaceId}/checklist`}
          active={
            !filters.blocker &&
            !filters.unresolved &&
            !filters.proof &&
            !filters.owner &&
            !filters.due
          }
        >
          All work
        </Preset>
        <Preset href={`/w/${workspaceId}/checklist?blocker=yes`} active={filters.blocker === 'yes'}>
          Blocking submission
        </Preset>
        <Preset
          href={`/w/${workspaceId}/checklist?owner=unassigned`}
          active={filters.owner === 'unassigned'}
        >
          Unassigned
        </Preset>
        <Preset href={`/w/${workspaceId}/checklist?proof=yes`} active={Boolean(filters.proof)}>
          Company evidence needed
        </Preset>
        <Preset
          href={`/w/${workspaceId}/checklist?unresolved=yes`}
          active={Boolean(filters.unresolved)}
        >
          Needs a decision
        </Preset>
        <Preset href={`/w/${workspaceId}/checklist?due=yes`} active={Boolean(filters.due)}>
          Has a deadline
        </Preset>
      </div>
      <form
        aria-label="Checklist filters"
        className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <label className="text-sm">
          Category
          <select
            name="category"
            defaultValue={String(filters.category ?? '')}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">All categories</option>
            {[...new Set((items ?? []).map((item) => item.category))].map((category) => (
              <option key={category} value={category}>
                {label(category)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Workflow status
          <select
            name="status"
            defaultValue={String(filters.status ?? '')}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">All statuses</option>
            {[...new Set((items ?? []).map((item) => item.workflow_status))].map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Owner
          <select
            name="owner"
            defaultValue={String(filters.owner ?? '')}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2"
          >
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {(members ?? []).map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {memberNames.get(member.user_id)}
              </option>
            ))}
          </select>
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
                    <div className="space-y-1">
                      <StatusBadge value={item.source_support_status} />
                      <span className="block">
                        <StatusBadge value={item.precedence_status} />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge value={item.workflow_status} />
                    <span className="mt-1 block text-xs text-slate-500">
                      Artifact: {label(item.artifact_state)} · Team:{' '}
                      {label(item.source_human_review_status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.owner_id ? (
                      (memberNames.get(item.owner_id) ?? 'Workspace member')
                    ) : (
                      <StatusBadge value="unresolved" label="Unassigned" tone="warning" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {item.due_at ? (
                      <>
                        <time dateTime={item.due_at}>{formatDate(item.due_at)}</time>
                        <span className="block text-xs">
                          {item.due_timezone ?? 'Timezone not stated'}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {blocked.has(item.id) ? (
                      <StatusBadge value="blocked" />
                    ) : (
                      <span className="text-slate-500">No active blocker</span>
                    )}
                  </td>
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

function ReadinessMetric({
  label,
  value,
  note,
  danger = false,
  warning = false,
  info = false,
}: {
  label: string;
  value: string | number;
  note: string;
  danger?: boolean;
  warning?: boolean;
  info?: boolean;
}) {
  const color = danger
    ? 'text-red-700'
    : warning
      ? 'text-amber-700'
      : info
        ? 'text-blue-700'
        : 'text-slate-950';
  return (
    <div className="bg-white p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`metric-value ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

function Preset({
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
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
    >
      {children}
    </Link>
  );
}
