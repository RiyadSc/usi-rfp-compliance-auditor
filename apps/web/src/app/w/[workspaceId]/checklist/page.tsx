import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { EmptyStateArt } from '@/components/brand';
import { IconAlert, IconBlocker, IconCalendar, IconDocument, IconUser } from '@/components/icons';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GenerateChecklistButton } from './generate-button';

const uuid = z.string().uuid();
const label = businessLabel;

/** Deterministic initials for the owner avatar, derived from the shown name. */
function ownerInitials(name: string): string {
  const words = name.split(/[^A-Za-z]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

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
  const remaining = new Set(selected.map((item) => item.id));
  const take = (predicate: (item: (typeof selected)[number]) => boolean) => {
    const rows = selected.filter((item) => remaining.has(item.id) && predicate(item));
    rows.forEach((item) => remaining.delete(item.id));
    return rows;
  };
  const actionGroups = [
    {
      key: 'blocked',
      title: 'Blocking submission',
      description: 'Resolve these first.',
      items: take((item) => blocked.has(item.id)),
    },
    {
      key: 'unassigned',
      title: 'Needs an owner',
      description: 'Assign accountability before work begins.',
      items: take(
        (item) =>
          !item.owner_id &&
          !['completed', 'waived', 'not_applicable'].includes(item.workflow_status),
      ),
    },
    {
      key: 'proof',
      title: 'Company evidence needed',
      description: 'Collect and review certificates, licenses, or internal proof.',
      items: take(
        (item) =>
          item.proof_requirement !== 'none_identified' &&
          !['completed', 'waived', 'not_applicable'].includes(item.workflow_status),
      ),
    },
    {
      key: 'due',
      title: 'Dated work',
      description: 'Tasks with an explicit source deadline.',
      items: take((item) => Boolean(item.due_at)),
    },
    {
      key: 'active',
      title: 'In progress and next up',
      description: 'Remaining active submission work.',
      items: take(
        (item) => !['completed', 'waived', 'not_applicable'].includes(item.workflow_status),
      ),
    },
    {
      key: 'complete',
      title: 'Completed or resolved',
      description: 'Preserved for audit history.',
      items: take(() => true),
    },
  ].filter((group) => group.items.length);
  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="checklist"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">What is still missing</p>
          <h1 aria-label="Submission checklist and blockers" className="page-title mt-2">
            Submission Checklist
          </h1>
          <p className="page-lede mt-3">
            Start with items that block submission work. Completing a task here does not authorize
            the bid or replace final human review.
          </p>
        </div>
        {latestVerification ? (
          <GenerateChecklistButton
            workspaceId={workspaceId}
            verificationRunId={latestVerification.id}
          />
        ) : (
          <p className="text-metadata max-w-56">A completed verification run is required.</p>
        )}
      </div>
      {readiness ? (
        <section
          aria-label="Readiness"
          data-tour-target="submission-checklist"
          className="surface-card mb-6 overflow-hidden"
        >
          <div className="grid divide-y divide-line-subtle sm:grid-cols-4 sm:divide-x sm:divide-y-0">
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
          <div className="border-t border-line-subtle px-5 py-4">
            <p className="text-sm font-semibold text-ink">{readiness.summary}</p>
            <p className="analyst-only text-metadata mt-1.5">
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
      <form aria-label="Checklist filters" className="filter-bar mb-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">
            <span className="field-label">Category</span>
            <select name="category" defaultValue={String(filters.category ?? '')}>
              <option value="">All categories</option>
              {[...new Set((items ?? []).map((item) => item.category))].map((category) => (
                <option key={category} value={category}>
                  {label(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Workflow status</span>
            <select name="status" defaultValue={String(filters.status ?? '')}>
              <option value="">All statuses</option>
              {[...new Set((items ?? []).map((item) => item.workflow_status))].map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Owner</span>
            <select name="owner" defaultValue={String(filters.owner ?? '')}>
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {(members ?? []).map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {memberNames.get(member.user_id)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Blocker</span>
            <select name="blocker" defaultValue={String(filters.blocker ?? '')}>
              <option value="">All</option>
              <option value="yes">Blocked</option>
              <option value="no">No active blocker</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-subtle pt-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex min-h-9 items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="unresolved"
                value="yes"
                defaultChecked={Boolean(filters.unresolved)}
              />
              Unresolved only
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="proof"
                value="yes"
                defaultChecked={Boolean(filters.proof)}
              />
              Requires human proof
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="due" value="yes" defaultChecked={Boolean(filters.due)} />
              Has due date
            </label>
          </div>
          <button className="secondary-action">Apply filters</button>
        </div>
      </form>
      {selected.length ? (
        <div className="space-y-10">
          {actionGroups.map((group) => {
            const blocking = group.key === 'blocked';
            const resolved = group.key === 'complete';
            return (
              <section key={group.key} aria-labelledby={`checklist-${group.key}`}>
                {blocking ? (
                  <div className="notice notice-critical mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 id={`checklist-${group.key}`} className="notice-title">
                      <IconBlocker size={16} className="shrink-0" />
                      {group.title}{' '}
                      <span className="tabular text-xs font-semibold">({group.items.length})</span>
                    </h2>
                    <p className="text-sm text-ink-soft">{group.description}</p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <h2 id={`checklist-${group.key}`} className="section-title">
                      {group.title}{' '}
                      <span className="tabular text-sm font-normal text-ink-muted">
                        ({group.items.length})
                      </span>
                    </h2>
                    <p className="section-lede">{group.description}</p>
                  </div>
                )}
                <ul className="surface-card divide-y divide-line-subtle">
                  {group.items.map((item) => {
                    const flagged = blocked.has(item.id);
                    const ownerName = item.owner_id
                      ? (memberNames.get(item.owner_id) ?? 'Workspace member')
                      : null;
                    return (
                      <li
                        key={item.id}
                        className={`grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                          flagged ? 'rail-critical bg-critical-500/5' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-start gap-2">
                            {flagged ? (
                              <IconAlert size={16} className="mt-0.5 shrink-0 text-critical-400" />
                            ) : null}
                            <Link
                              className={resolved ? 'quiet-link font-medium' : 'action-link'}
                              href={`/w/${workspaceId}/checklist/${item.id}`}
                            >
                              {item.title}
                            </Link>
                          </div>
                          <span
                            className={`text-metadata mt-1.5 block ${resolved ? 'text-ink-faint' : ''}`}
                          >
                            {label(item.category)} ·{' '}
                            {item.machine_status === 'machine_assessment_only'
                              ? 'Machine-generated from a verified requirement'
                              : item.machine_status}
                          </span>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <StatusBadge value={item.source_support_status} />
                            <StatusBadge value={item.precedence_status} />
                            {blocked.has(item.id) ? <StatusBadge value="blocked" /> : null}
                          </div>
                        </div>
                        <div className="min-w-52 text-sm sm:text-right">
                          <StatusBadge value={item.workflow_status} />
                          <div className="mt-2.5 flex items-center gap-2 sm:justify-end">
                            <span
                              aria-hidden="true"
                              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-surface-800 text-[0.6875rem] font-semibold ${
                                ownerName
                                  ? 'border-line-subtle text-ink-soft'
                                  : 'border-dashed border-line-default text-ink-faint'
                              }`}
                            >
                              {ownerName ? ownerInitials(ownerName) : <IconUser size={13} />}
                            </span>
                            <p
                              className={`text-xs ${resolved ? 'text-ink-muted' : 'text-ink-soft'}`}
                            >
                              {item.owner_id
                                ? (memberNames.get(item.owner_id) ?? 'Workspace member')
                                : 'Unassigned'}
                            </p>
                          </div>
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted sm:justify-end">
                            {item.due_at ? (
                              <IconCalendar size={13} className="shrink-0" />
                            ) : (
                              <IconDocument size={13} className="shrink-0" />
                            )}
                            <span className="tabular">
                              {item.due_at ? (
                                <>
                                  <time dateTime={item.due_at}>{formatDate(item.due_at)}</time> ·{' '}
                                  {item.due_timezone ?? 'Timezone not stated'}
                                </>
                              ) : (
                                `Artifact: ${label(item.artifact_state)}`
                              )}
                            </span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <EmptyStateArt />
          <p className="empty-state-title">
            {latestRun ? 'No items match these filters' : 'No submission list yet'}
          </p>
          <p className="empty-state-body">
            {latestRun
              ? 'Clear filters or open All work to see every submission item.'
              : latestVerification
                ? 'Build a submission list from the verified requirements to assign owners and track blockers.'
                : 'Finish reviewing RFP requirements first, then build the submission list.'}
          </p>
          {!latestRun && latestVerification ? (
            <div className="mt-4">
              <GenerateChecklistButton
                workspaceId={workspaceId}
                verificationRunId={latestVerification.id}
              />
            </div>
          ) : null}
          {!latestRun && !latestVerification ? (
            <Link href={`/w/${workspaceId}/requirements`} className="primary-action mt-4">
              Open requirements
            </Link>
          ) : null}
          {latestRun ? (
            <Link href={`/w/${workspaceId}/checklist`} className="secondary-action mt-4">
              Clear filters
            </Link>
          ) : null}
        </div>
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
    ? 'text-critical-400'
    : warning
      ? 'text-warning-400'
      : info
        ? 'text-info-400'
        : 'text-ink';
  return (
    <div className="p-5">
      <p className="metric-label">{label}</p>
      <p className={`metric-value flex items-center gap-2 ${color}`}>
        {danger ? <IconAlert size={17} className="shrink-0" /> : null}
        {value}
      </p>
      <p className="metric-note">{note}</p>
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
      className={`chip ${active ? 'chip-active' : ''}`}
    >
      {children}
    </Link>
  );
}
