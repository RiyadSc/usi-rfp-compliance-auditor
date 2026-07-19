import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { deadlineLabel, eventLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuidSchema = z.string().uuid();

type LatestFinding = {
  id: string;
  candidate_id: string;
  source_support_status: string;
  precedence_status: string;
  proof_requirement: string;
};

export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!uuidSchema.safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, customer, deadline, description, status, created_at')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const [
    documentsResult,
    candidatesResult,
    findingsResult,
    checklistRunResult,
    blockerResult,
    auditRunResult,
    reportResult,
    eventsResult,
  ] = await Promise.all([
    supabase
      .from('documents')
      .select('id,document_type,status', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    supabase
      .from('requirement_candidates')
      .select('id', { count: 'exact' })
      .eq('workspace_id', workspaceId),
    supabase
      .from('verification_findings')
      .select(
        'id,candidate_id,source_support_status,precedence_status,proof_requirement,finding_version',
      )
      .eq('workspace_id', workspaceId)
      .order('finding_version', { ascending: false }),
    supabase
      .from('checklist_generation_runs')
      .select('id,created_at,checklist_readiness_snapshots(*)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('checklist_blockers')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['open', 'reopened']),
    supabase
      .from('proposal_audit_runs')
      .select('id,status,finding_count,claim_count,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('report_snapshots')
      .select('id,generated_at')
      .eq('workspace_id', workspaceId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('audit_events')
      .select('id,event_type,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const latestFindings = new Map<string, LatestFinding>();
  for (const row of findingsResult.data ?? []) {
    if (!latestFindings.has(row.candidate_id))
      latestFindings.set(row.candidate_id, row as LatestFinding);
  }
  const findingIds = [...latestFindings.values()].map((finding) => finding.id);
  const { data: decisions } = findingIds.length
    ? await supabase
        .from('human_review_decisions')
        .select('finding_id,decision,created_at')
        .eq('workspace_id', workspaceId)
        .in('finding_id', findingIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const reviewed = new Set<string>();
  for (const decision of decisions ?? []) reviewed.add(decision.finding_id);

  const readinessRows = (checklistRunResult.data?.checklist_readiness_snapshots ?? []) as Array<{
    summary: string;
    total_required: number;
    completed_required: number;
    blocked_items: number;
    unresolved_items: number;
    items_requiring_human_proof: number;
  }>;
  const readiness = readinessRows.sort(
    (a, b) => Number(b.total_required) - Number(a.total_required),
  )[0];
  const documents = documentsResult.data ?? [];
  const documentCount = documentsResult.count ?? documents.length;
  const requirementCount = candidatesResult.count ?? latestFindings.size;
  const blockerCount = blockerResult.count ?? readiness?.blocked_items ?? 0;
  const reviewPending = [...latestFindings.values()].filter(
    (finding) => !reviewed.has(finding.id),
  ).length;
  const proofNeeded = [...latestFindings.values()].filter(
    (finding) => finding.proof_requirement !== 'none_identified',
  ).length;
  const unresolvedSources = [...latestFindings.values()].filter(
    (finding) =>
      finding.source_support_status !== 'supported' ||
      ['conflicting', 'undetermined'].includes(finding.precedence_status),
  ).length;
  const proposalAudit = auditRunResult.data;
  const latestReport = reportResult.data;
  const completion = readiness?.total_required
    ? Math.round((readiness.completed_required / readiness.total_required) * 100)
    : 0;

  const nextAction =
    documentCount === 0
      ? {
          label: 'Upload the RFP files',
          href: `/w/${workspaceId}/documents`,
          note: 'Start by adding the main RFP and addenda.',
        }
      : requirementCount === 0
        ? {
            label: 'Review document processing',
            href: `/w/${workspaceId}/documents`,
            note: 'The RFP has not produced requirements yet.',
          }
        : unresolvedSources > 0
          ? {
              label: 'Review uncertain requirements',
              href: `/w/${workspaceId}/requirements?attention=yes`,
              note: `${unresolvedSources} source assessment${unresolvedSources === 1 ? '' : 's'} need attention.`,
            }
          : blockerCount > 0
            ? {
                label: 'Resolve submission blockers',
                href: `/w/${workspaceId}/checklist?blocker=yes`,
                note: `${blockerCount} active blocker${blockerCount === 1 ? '' : 's'} could prevent completion.`,
              }
            : !proposalAudit
              ? {
                  label: 'Review the proposal draft',
                  href: `/w/${workspaceId}/proposal-audit`,
                  note: 'Check the response against the submission plan.',
                }
              : {
                  label: 'Open final review',
                  href: latestReport
                    ? `/w/${workspaceId}/reports/${latestReport.id}`
                    : `/w/${workspaceId}/reports`,
                  note: 'Prepare the opportunity for final human review.',
                };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="overview"
      />

      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-kicker">Opportunity command center</p>
            <StatusBadge value={workspace.status} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
          <p className="mt-2 text-slate-600">
            {workspace.customer ?? 'Customer not set'}
            {workspace.deadline ? ` · Response deadline ${formatDate(workspace.deadline)}` : ''}
          </p>
          {workspace.description ? (
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{workspace.description}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Submission timing
          </p>
          <p className="mt-1 text-lg font-semibold text-blue-950">
            {deadlineLabel(workspace.deadline)}
          </p>
          <p className="text-xs text-blue-800">
            {workspace.deadline
              ? formatDate(workspace.deadline)
              : 'Add a deadline to track urgency'}
          </p>
        </div>
      </header>

      <section aria-label="Opportunity health" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Required work complete"
          value={
            readiness
              ? `${readiness.completed_required} of ${readiness.total_required}`
              : 'Not generated'
          }
          note={
            readiness
              ? `${completion}% of required checklist work`
              : 'Generate a submission plan after verification'
          }
        />
        <Metric
          label="Submission blockers"
          value={blockerCount}
          note={
            blockerCount ? 'Requires action before final review' : 'No active blockers recorded'
          }
          danger={blockerCount > 0}
        />
        <Metric
          label="Company evidence needed"
          value={proofNeeded}
          note="Certificates, licenses, or team confirmation"
          info={proofNeeded > 0}
        />
        <Metric
          label="Team reviews pending"
          value={reviewPending}
          note="Machine findings awaiting a human decision"
          warning={reviewPending > 0}
        />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-card p-5">
          <p className="section-kicker">Recommended next action</p>
          <h2 className="mt-2 text-xl font-semibold">{nextAction.label}</h2>
          <p className="mt-2 text-sm text-slate-600">{nextAction.note}</p>
          <Link
            href={nextAction.href}
            className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Continue →
          </Link>
        </div>
        <div className="surface-card p-5">
          <p className="section-kicker">Decision signals</p>
          <ul className="mt-3 space-y-3 text-sm">
            <Signal
              danger={unresolvedSources > 0}
              text={
                unresolvedSources
                  ? `${unresolvedSources} RFP requirement${unresolvedSources === 1 ? '' : 's'} need source review`
                  : 'RFP requirements have no unresolved source issues'
              }
            />
            <Signal
              danger={blockerCount > 0}
              text={
                blockerCount
                  ? `${blockerCount} active submission blocker${blockerCount === 1 ? '' : 's'}`
                  : 'No active submission blockers'
              }
            />
            <Signal
              danger={Boolean(proposalAudit?.finding_count)}
              text={
                proposalAudit
                  ? `${proposalAudit.finding_count} proposal issue${proposalAudit.finding_count === 1 ? '' : 's'} in the latest draft review`
                  : 'No completed proposal draft review yet'
              }
            />
          </ul>
        </div>
      </section>

      <section className="mt-7" aria-labelledby="journey-heading">
        <div className="mb-3">
          <p className="section-kicker">Bid journey</p>
          <h2 id="journey-heading" className="mt-1 text-xl font-semibold">
            Progress by stage
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <StageCard
            number="1"
            title="RFP files"
            summary={`${documentCount} document${documentCount === 1 ? '' : 's'} in this opportunity`}
            status={documentCount ? 'ready' : 'not_started'}
            href={`/w/${workspaceId}/documents`}
            action="Open documents"
          />
          <StageCard
            number="2"
            title="RFP requirements"
            summary={`${requirementCount} requirement${requirementCount === 1 ? '' : 's'} identified`}
            status={
              unresolvedSources ? 'needs_follow_up' : requirementCount ? 'ready' : 'not_started'
            }
            href={`/w/${workspaceId}/requirements`}
            action="Review requirements"
          />
          <StageCard
            number="3"
            title="Submission plan"
            summary={readiness?.summary ?? 'Plan not generated'}
            status={blockerCount ? 'blocked' : readiness ? 'ready' : 'not_started'}
            href={`/w/${workspaceId}/checklist`}
            action="Open submission plan"
          />
          <StageCard
            number="4"
            title="Draft review"
            summary={
              proposalAudit
                ? `${proposalAudit.finding_count} issue${proposalAudit.finding_count === 1 ? '' : 's'} found in latest review`
                : 'No completed draft review'
            }
            status={
              proposalAudit?.finding_count
                ? 'needs_follow_up'
                : proposalAudit
                  ? 'ready'
                  : 'not_started'
            }
            href={`/w/${workspaceId}/proposal-audit`}
            action="Open proposal audit"
          />
          <StageCard
            number="5"
            title="Final review"
            summary={
              latestReport
                ? `Latest report generated ${formatDate(latestReport.generated_at)}`
                : 'No executive report generated'
            }
            status={latestReport ? 'ready_for_review' : 'not_started'}
            href={
              latestReport
                ? `/w/${workspaceId}/reports/${latestReport.id}`
                : `/w/${workspaceId}/reports`
            }
            action="Open final review"
          />
          <div className="surface-card border-dashed p-4">
            <p className="section-kicker">Important distinction</p>
            <p className="mt-2 text-sm font-medium">Workflow progress is not source approval.</p>
            <p className="mt-1 text-xs text-slate-600">
              The app keeps RFP evidence, task completion, company proof, and human decisions
              separate.
            </p>
          </div>
        </div>
      </section>

      <section
        className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.7fr]"
        aria-labelledby="activity-heading"
      >
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 id="activity-heading" className="text-lg font-semibold">
              Recent activity
            </h2>
            <span className="analyst-only text-xs text-slate-500">
              System events are available in analyst view.
            </span>
          </div>
          {eventsResult.data?.length ? (
            <ol className="surface-card divide-y divide-slate-200">
              {eventsResult.data.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{eventLabel(event.event_type)}</p>
                    <code className="analyst-only mt-1 block text-xs text-slate-500">
                      {event.event_type}
                    </code>
                  </div>
                  <time
                    className="whitespace-nowrap text-xs text-slate-500"
                    dateTime={event.created_at}
                  >
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              Activity will appear here as the team works on the opportunity.
            </p>
          )}
        </div>
        <aside className="surface-card p-5">
          <h2 className="font-semibold">Director’s review cadence</h2>
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            <li>
              <strong>Today:</strong> address blockers and unassigned work.
            </li>
            <li>
              <strong>After each addendum:</strong> review changed requirements.
            </li>
            <li>
              <strong>Before final review:</strong> confirm company proof and proposal findings.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

function Metric({
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
    <div className="surface-card p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`metric-value ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function Signal({ danger, text }: { danger: boolean; text: string }) {
  return (
    <li className="flex gap-2">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${danger ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
        aria-hidden="true"
      >
        {danger ? '!' : '✓'}
      </span>
      <span>{text}</span>
    </li>
  );
}

function StageCard({
  number,
  title,
  summary,
  status,
  href,
  action,
}: {
  number: string;
  title: string;
  summary: string;
  status: string;
  href: string;
  action: string;
}) {
  return (
    <article className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-sm font-semibold">
          {number}
        </span>
        <StatusBadge value={status} />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 min-h-10 text-sm text-slate-600">{summary}</p>
      <Link href={href} className="action-link mt-3 inline-block text-sm">
        {action} →
      </Link>
    </article>
  );
}
