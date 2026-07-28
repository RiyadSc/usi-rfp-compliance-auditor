import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { EvidenceField } from '@/components/brand';
import { IconAlert, IconArrowRight, IconCalendar, IconCheck, IconInfo } from '@/components/icons';
import { daysUntil, deadlineLabel, eventLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuidSchema = z.string().uuid();
const FAC115_WORKSPACE_ID = '80000000-0000-4000-8000-000000000100';

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
    phase9RunResult,
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
    supabase
      .from('phase9_evaluation_runs')
      .select('id,status,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const phase9Run = phase9RunResult.data;
  const [{ count: phase9FindingCount }, { data: phase9Reviews }, { count: phase9BridgeCount }] =
    phase9Run
      ? await Promise.all([
          supabase
            .from('phase9_findings')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('evaluation_run_id', phase9Run.id),
          supabase
            .from('phase9_finding_review_decisions')
            .select('candidate_hash,created_at')
            .eq('workspace_id', workspaceId)
            .eq('evaluation_run_id', phase9Run.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('phase9_bridge_runs')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('evaluation_run_id', phase9Run.id),
        ])
      : [
          { count: 0 },
          { data: [] as Array<{ candidate_hash: string; created_at: string }> },
          { count: 0 },
        ];
  const phase9Reviewed = new Set((phase9Reviews ?? []).map((row) => row.candidate_hash)).size;
  const phase9Pending = Math.max(0, (phase9FindingCount ?? 0) - phase9Reviewed);

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

  const isFac115PublicEvaluation =
    workspaceId === FAC115_WORKSPACE_ID ||
    (workspace.description ?? '').includes('phase9-public-evaluation-only');

  const nextAction = isFac115PublicEvaluation
    ? requirementCount === 0
      ? {
          label: 'Open Live Analysis',
          href: `/w/${workspaceId}/phase9`,
          note: 'Show the accepted 23/23 public RFP accuracy proof first.',
        }
      : blockerCount > 0
        ? {
            label: 'Review submission blockers',
            href: `/w/${workspaceId}/checklist?blocker=yes`,
            note: `${blockerCount} projected blocker${blockerCount === 1 ? '' : 's'} from Live Analysis findings.`,
          }
        : {
            label: 'Open Live Analysis',
            href: `/w/${workspaceId}/phase9`,
            note: 'Keep Live Analysis as the accuracy and cost proof.',
          }
    : documentCount === 0
      ? {
          label: 'Upload the RFP files',
          href: `/w/${workspaceId}/documents`,
          note: 'Start by adding the main RFP and addenda.',
        }
      : requirementCount === 0 && phase9Run?.status === 'completed'
        ? {
            label: 'Review analysis coverage',
            href: `/w/${workspaceId}/phase9`,
            note: `${phase9FindingCount ?? 0} source-grounded machine finding${phase9FindingCount === 1 ? '' : 's'} are waiting for team review before the requirement register is built.`,
          }
        : requirementCount === 0
          ? {
              label: 'Review document processing',
              href: `/w/${workspaceId}/documents`,
              note: 'The RFP has not produced requirements yet.',
            }
          : blockerCount > 0
            ? {
                label: 'Resolve submission blockers',
                href: `/w/${workspaceId}/checklist?blocker=yes`,
                note: `${blockerCount} active blocker${blockerCount === 1 ? '' : 's'} could prevent completion.`,
              }
            : unresolvedSources > 0
              ? {
                  label: 'Review uncertain requirements',
                  href: `/w/${workspaceId}/requirements?attention=yes`,
                  note: `${unresolvedSources} source assessment${unresolvedSources === 1 ? '' : 's'} need attention.`,
                }
              : reviewPending > 0
                ? {
                    label: 'Record team judgments',
                    href: `/w/${workspaceId}/requirements?review=pending`,
                    note: `${reviewPending} machine assessment${reviewPending === 1 ? '' : 's'} still need a person.`,
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
                      note: 'Prepare the opportunity for final human review. This does not authorize submission.',
                    };

  const deadlineDays = daysUntil(workspace.deadline);
  const deadlineUrgent = deadlineDays != null && deadlineDays < 0;
  const deadlineNear = deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 14;

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="overview"
      />

      <header
        className="hero-panel texture-nodes mb-6 p-6 lg:p-8"
        data-tour-target="opportunity-overview"
      >
        <EvidenceField className="opacity-25" />
        <div className="relative flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="page-eyebrow">Opportunity readiness</p>
              <StatusBadge value={workspace.status} />
            </div>
            <h1 className="page-title mt-3">{workspace.name}</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink">
              {blockerCount > 0
                ? `${blockerCount} submission blocker${blockerCount === 1 ? '' : 's'} need attention before leadership review. This view shows risk first — then what to do next.`
                : reviewPending + phase9Pending > 0
                  ? `${reviewPending + phase9Pending} assessment${reviewPending + phase9Pending === 1 ? '' : 's'} still need a person. Nothing here authorizes submission.`
                  : 'See whether this opportunity is blocked, what still needs judgment, and the single best next step.'}
            </p>
            <p className="mt-3 text-sm text-ink-soft">
              {workspace.customer ?? 'Customer not set'}
              {workspace.deadline ? ` · Response deadline ${formatDate(workspace.deadline)}` : ''}
            </p>
            {workspace.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
                {workspace.description}
              </p>
            ) : null}
          </div>
          <div
            className={`surface-inset min-w-[15rem] p-4 ${
              deadlineUrgent ? 'rail-critical' : deadlineNear ? 'rail-warning' : 'rail-teal'
            }`}
          >
            <p className="metric-label flex items-center gap-1.5">
              <IconCalendar size={13} />
              Submission timing
            </p>
            <p
              className={`mt-2 text-lg font-semibold tracking-[-0.02em] ${
                deadlineUrgent
                  ? 'text-critical-400'
                  : deadlineNear
                    ? 'text-warning-400'
                    : 'text-ink'
              }`}
            >
              {deadlineLabel(workspace.deadline)}
            </p>
            <p className="text-metadata mt-0.5">
              {workspace.deadline
                ? formatDate(workspace.deadline)
                : 'Add a deadline to track urgency'}
            </p>
          </div>
        </div>
      </header>

      {isFac115PublicEvaluation ? (
        <aside className="notice notice-warning mb-6">
          <strong className="notice-title">
            <IconInfo size={15} />
            Public FAC115 evaluation workspace.
          </strong>
          <div className="mt-2">
            Requirements and checklist are a curated projection from the accepted Live Analysis run.
            Proposal audit and the final report are illustrative because the public package has no
            bidder draft.{' '}
            <Link href={`/w/${workspaceId}/phase9`} className="action-link">
              Open Live Analysis
            </Link>{' '}
            for the 23/23 accuracy and cost proof.
          </div>
        </aside>
      ) : null}

      <section
        aria-label="What needs attention first"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <Metric
          label="Submission blockers"
          value={blockerCount}
          note={
            blockerCount ? 'Requires action before final review' : 'No active blockers recorded'
          }
          danger={blockerCount > 0}
        />
        <Metric
          label="Team reviews pending"
          value={reviewPending + phase9Pending}
          note={
            phase9Pending
              ? `${phase9Pending} live-analysis findings await review`
              : 'Machine findings awaiting a human decision'
          }
          warning={reviewPending + phase9Pending > 0}
        />
        <Metric
          label="Company evidence needed"
          value={proofNeeded}
          note="Certificates, licenses, or team confirmation"
          info={proofNeeded > 0}
        />
        <Metric
          label={requirementCount ? 'RFP requirements' : 'AI findings'}
          value={requirementCount || phase9FindingCount || 0}
          note={
            requirementCount
              ? `${unresolvedSources} need source attention`
              : phase9BridgeCount
                ? 'Reviewed findings were published; refresh the requirement register'
                : 'Not checklist work until a person accepts the source assessment'
          }
          warning={unresolvedSources > 0 || (!requirementCount && Boolean(phase9FindingCount))}
        />
        <Metric
          label="Latest proposal review"
          value={proposalAudit ? `${proposalAudit.finding_count} issues` : 'Not run'}
          note={
            proposalAudit
              ? `${proposalAudit.claim_count} claims checked`
              : 'Upload a proposal draft when ready'
          }
          warning={Boolean(proposalAudit?.finding_count)}
        />
        <Metric
          label="Required work complete"
          value={
            readiness
              ? `${readiness.completed_required} of ${readiness.total_required}`
              : 'Not generated'
          }
          note={
            readiness
              ? `${completion}% of required checklist work — not submission approval`
              : 'Generate a submission plan after verification'
          }
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div
          className="surface-card rail-teal flex flex-col p-6"
          data-tour-target="next-recommended-action"
        >
          <p className="section-kicker">Recommended next action</p>
          <h2 className="section-title mt-2 text-xl">{nextAction.label}</h2>
          <p className="mt-2 text-sm text-ink-soft">{nextAction.note}</p>
          <Link href={nextAction.href} className="primary-action mt-5 self-start">
            Continue
            <IconArrowRight size={16} />
          </Link>
        </div>
        <div className="surface-card p-6" data-tour-target="closing-value">
          <p className="section-kicker">Decision signals</p>
          <ul className="mt-4 space-y-3 text-sm text-ink-soft">
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

      <section className="mt-10" aria-labelledby="journey-heading">
        <details className="surface-card group">
          <summary className="cursor-pointer list-none px-5 py-4 marker:content-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Optional context</p>
                <h2 id="journey-heading" className="section-title mt-1 text-lg">
                  How this response typically progresses
                </h2>
              </div>
              <span className="text-metadata group-open:hidden">Show stages</span>
              <span className="text-metadata hidden group-open:inline">Hide stages</span>
            </div>
          </summary>
          <div className="border-t border-line-subtle px-5 pb-5 pt-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StageCard
                number="1"
                kind="Business"
                title="Create opportunity"
                summary="Customer, deadline, and response context are established"
                status="ready"
                href={`/w/${workspaceId}`}
                action="Review opportunity"
              />
              <StageCard
                number="2"
                kind="Business"
                title="Collect RFP files"
                summary={`${documentCount} document${documentCount === 1 ? '' : 's'} in this opportunity`}
                status={documentCount ? 'ready' : 'not_started'}
                href={`/w/${workspaceId}/documents`}
                action="Open documents"
              />
              <StageCard
                number="3"
                kind="Processing"
                title="Read and organize documents"
                summary={
                  documentCount
                    ? 'Documents are available for processing review'
                    : 'Waiting for source documents'
                }
                status={documentCount ? 'ready' : 'not_started'}
                href={`/w/${workspaceId}/documents`}
                action="Check processing"
              />
              <StageCard
                number="4"
                kind="Review"
                title="Review RFP requirements"
                summary={
                  requirementCount
                    ? `${requirementCount} reviewed requirement${requirementCount === 1 ? '' : 's'} in the register`
                    : phase9FindingCount
                      ? `${phase9FindingCount} machine finding${phase9FindingCount === 1 ? '' : 's'} awaiting controlled review`
                      : 'No requirements identified yet'
                }
                status={
                  unresolvedSources || (!requirementCount && phase9FindingCount)
                    ? 'needs_follow_up'
                    : requirementCount
                      ? 'ready'
                      : 'not_started'
                }
                href={
                  requirementCount
                    ? `/w/${workspaceId}/requirements`
                    : phase9FindingCount
                      ? `/w/${workspaceId}/phase9`
                      : `/w/${workspaceId}/requirements`
                }
                action={requirementCount ? 'Review requirements' : 'Review analysis findings'}
              />
              <StageCard
                number="5"
                kind="Business"
                title="Build submission checklist"
                summary={readiness?.summary ?? 'Plan not generated'}
                status={blockerCount ? 'blocked' : readiness ? 'ready' : 'not_started'}
                href={`/w/${workspaceId}/checklist`}
                action="Open submission plan"
              />
              <StageCard
                number="6"
                kind="Business"
                title="Assign and complete work"
                summary={
                  readiness
                    ? `${readiness.completed_required} required tasks completed`
                    : 'Checklist ownership has not started'
                }
                status={blockerCount ? 'blocked' : readiness ? 'in_progress' : 'not_started'}
                href={`/w/${workspaceId}/checklist`}
                action="Open team work"
              />
              <StageCard
                number="7"
                kind="Review"
                title="Review proposal draft"
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
                number="8"
                kind="Review"
                title="Resolve issues and decisions"
                summary={
                  proposalAudit
                    ? `${proposalAudit.finding_count} draft issues require review context`
                    : 'Begins after a proposal review'
                }
                status={
                  proposalAudit?.finding_count
                    ? 'needs_follow_up'
                    : proposalAudit
                      ? 'ready'
                      : 'not_started'
                }
                href={`/w/${workspaceId}/proposal-audit`}
                action="Review issues"
              />
              <StageCard
                number="9"
                kind="Business"
                title="Prepare final human review"
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
            </div>
            <p className="text-metadata mt-4">
              Business steps coordinate the response. Processing steps prepare source material.
              Review steps require human judgment. Workflow progress never means automatic approval.
            </p>
          </div>
        </details>
      </section>

      <section
        id="activity"
        className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.7fr]"
        aria-labelledby="activity-heading"
      >
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="activity-heading" className="section-title">
              Recent activity
            </h2>
            <span className="analyst-only text-metadata">
              System events are available in analyst view.
            </span>
          </div>
          {eventsResult.data?.length ? (
            <ol className="surface-card divide-y divide-line-subtle">
              {eventsResult.data.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start justify-between gap-4 px-5 py-3.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{eventLabel(event.event_type)}</p>
                    <code className="analyst-only mono mt-1 block text-xs text-ink-muted">
                      {event.event_type}
                    </code>
                  </div>
                  <time
                    className="text-metadata tabular whitespace-nowrap"
                    dateTime={event.created_at}
                  >
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state text-sm text-ink-soft">
              Activity will appear here as the team works on the opportunity.
            </p>
          )}
        </div>
        <aside className="surface-card p-6">
          <h2 className="section-title">Director’s review cadence</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink-soft">
            <li>
              <strong className="font-semibold text-ink">Today:</strong> address blockers and
              unassigned work.
            </li>
            <li>
              <strong className="font-semibold text-ink">After each addendum:</strong> review
              changed requirements.
            </li>
            <li>
              <strong className="font-semibold text-ink">Before final review:</strong> confirm
              company proof and proposal findings.
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
  // Only a true blocker earns a coral value; softer states tint the supporting
  // line instead, so the rail stays calm and one number leads.
  const noteColor = danger
    ? 'text-critical-400'
    : warning
      ? 'text-warning-400'
      : info
        ? 'text-info-400'
        : '';
  return (
    <div className={`metric-card ${danger ? 'rail-critical' : ''}`}>
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${danger ? 'text-critical-400' : 'text-ink'}`}>{value}</p>
      <p className={`metric-note ${noteColor}`}>{note}</p>
    </div>
  );
}

function Signal({ danger, text }: { danger: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 shrink-0 ${danger ? 'text-critical-400' : 'text-success-400'}`}
        aria-hidden="true"
      >
        {danger ? <IconAlert size={15} /> : <IconCheck size={15} />}
      </span>
      <span>{text}</span>
    </li>
  );
}

function StageCard({
  number,
  kind,
  title,
  summary,
  status,
  href,
  action,
}: {
  number: string;
  kind: 'Business' | 'Processing' | 'Review';
  title: string;
  summary: string;
  status: string;
  href: string;
  action: string;
}) {
  return (
    <article className="surface-card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="mono grid h-7 w-7 place-items-center rounded-xs border border-line-subtle bg-canvas-900 text-xs font-semibold text-teal-300">
            {number}
          </span>
          <span className="text-micro">{kind}</span>
        </div>
        <StatusBadge value={status} />
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 min-h-10 text-sm leading-snug text-ink-soft">{summary}</p>
      <Link href={href} className="action-link mt-4 inline-flex items-center gap-1.5 text-sm">
        {action}
        <IconArrowRight size={14} />
      </Link>
    </article>
  );
}
