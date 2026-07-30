import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { estimatePhase9ReviewEffort } from '@usi/domain';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { serverEnv } from '@/lib/env';
import {
  loadPhase9CoverageExceptions,
  loadPhase9ExecutiveSummary,
  loadPhase9ReviewEffortObservations,
  loadPhase9ReviewQueue,
} from '@/lib/phase9/review-service';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Phase9CoverageReviewControls, PublishReviewedFindings } from './finding-review-controls';
import { LiveAnalysisControls } from './live-analysis-controls';
import { Phase9ReviewQueue } from './review-queue';

const uuid = z.string().uuid();
const laneSchema = z.enum(['critical', 'exception', 'duplicate', 'routine', 'reviewed', 'all']);

const NEXT_ACTIONS = {
  review_critical: {
    title: 'Review submission-critical items first',
    body: 'Confirm the deadlines, mandatory forms, signatures, insurance, licensing, and submission instructions that could affect the bid.',
    lane: 'critical',
  },
  review_exceptions: {
    title: 'Resolve source and evidence exceptions',
    body: 'Inspect unsupported, ambiguous, superseded, or parser-uncertain findings one at a time.',
    lane: 'exception',
  },
  review_duplicates: {
    title: 'Review exact duplicate groups',
    body: 'Retain the canonical source occurrence and explicitly reject only deterministic non-canonical duplicates.',
    lane: 'duplicate',
  },
  accelerate_routine_review: {
    title: 'Review clean routine findings together',
    body: 'Select evidence-valid routine findings and record an audited team decision for each in one batch.',
    lane: 'routine',
  },
  review_coverage_exceptions: {
    title: 'Check the remaining page exceptions',
    body: 'Confirm pages with possible omissions or parser warnings before publishing reviewed requirements.',
    lane: 'exception',
  },
  resolve_follow_up: {
    title: 'Resolve outstanding follow-up',
    body: 'Publication stays locked while any finding or source page still requires follow-up.',
    lane: 'reviewed',
  },
  review_team_decisions: {
    title: 'Review team decisions before publishing',
    body: 'At least one accepted, publishable source requirement is required, and accepted exceptions or duplicates must be corrected before publication.',
    lane: 'reviewed',
  },
  publish_reviewed_requirements: {
    title: 'Publish the reviewed source requirements',
    body: 'The team has decided every finding and page exception. Publish only the accepted, eligible source requirements.',
    lane: 'reviewed',
  },
  open_submission_checklist: {
    title: 'Open the submission checklist',
    body: 'Reviewed requirements are available as operational work with owners, evidence needs, and blockers.',
    lane: 'reviewed',
  },
} as const;

export default async function Phase9AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const query = await searchParams;
  if (!uuid.safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const env = serverEnv();
  const { data: parsedDocuments } = await supabase
    .from('documents')
    .select('id,normalized_filename,document_type,page_count')
    .eq('workspace_id', workspaceId)
    .eq('status', 'parsed')
    .is('deleted_at', null)
    .not('document_type', 'in', '("proposal_draft","expected_answer")')
    .order('created_at');
  const liveControls = (
    <LiveAnalysisControls
      workspaceId={workspaceId}
      enabled={env.PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED && Boolean(env.OPENAI_API_KEY)}
      perRunMaximumUsd={env.PHASE9_LIVE_MAX_USD_PER_RUN}
      monthlyMaximumUsd={env.PHASE9_LIVE_MONTHLY_WORKSPACE_CEILING_USD}
      documents={(parsedDocuments ?? []).map((document) => ({
        id: document.id,
        name: document.normalized_filename,
        type: document.document_type,
        pages: document.page_count,
      }))}
    />
  );
  const demoStateResult = await supabase
    .from('phase9_review_demo_states')
    .select('active_evaluation_run_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (demoStateResult.error)
    throw new Error(`phase9_review_demo_state_load_failed:${demoStateResult.error.message}`);
  const runQuery = () =>
    supabase
      .from('phase9_evaluation_runs')
      .select(
        'id,status,mode,source_package_hash,document_set_hash,expected_answers_used,call_plan_hash,compatibility_fingerprint,planned_maximum_usd,requested_maximum_usd,actual_usd,provider_call_count,cache_hit_count,versions,error_category,created_at,completed_at',
      )
      .eq('workspace_id', workspaceId);
  let runResult = demoStateResult.data
    ? await runQuery().eq('id', demoStateResult.data.active_evaluation_run_id).maybeSingle()
    : await runQuery()
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
  if (!demoStateResult.data && !runResult.data && !runResult.error)
    runResult = await runQuery().order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: run, error: runError } = runResult;
  if (runError) throw new Error(`phase9_review_run_load_failed:${runError.message}`);

  if (!run) {
    return (
      <main className="page-shell">
        <WorkspaceNavigation
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          current="phase9"
        />
        <header className="page-header" data-tour-target="closing-value-statement">
          <div>
            <p className="page-eyebrow">RFP review</p>
            <h1 className="page-title mt-2">No analysis result yet</h1>
            <p className="page-lede mt-3">
              Select parsed RFP documents below. Every source finding remains pending a team
              decision.
            </p>
          </div>
        </header>
        {liveControls}
      </main>
    );
  }

  if (run.status !== 'completed') {
    return (
      <main className="page-shell">
        <WorkspaceNavigation
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          current="phase9"
        />
        <header className="page-header">
          <div>
            <p className="page-eyebrow">RFP review</p>
            <h1 className="page-title mt-2">Analysis is {run.status.replaceAll('_', ' ')}</h1>
            <p className="page-lede mt-3">
              Review acceleration becomes available after the bounded source analysis finishes.
            </p>
          </div>
          <StatusBadge value={run.status} />
        </header>
        {liveControls}
      </main>
    );
  }

  const summary = await loadPhase9ExecutiveSummary(supabase, workspaceId, run.id);
  const defaultLane =
    summary.unresolvedCritical > 0
      ? 'critical'
      : summary.unresolvedExceptions > 0 ||
          summary.unresolvedCoverageExceptions > 0 ||
          summary.coverageFollowUp > 0
        ? 'exception'
        : summary.unresolvedDuplicates > 0
          ? 'duplicate'
          : summary.unresolvedRoutine > 0
            ? 'routine'
            : 'reviewed';
  const duplicateSignature =
    typeof query.group === 'string' && /^[0-9a-f]{64}$/.test(query.group) ? query.group : null;
  const selectedLane = duplicateSignature
    ? 'all'
    : laneSchema
        .catch(defaultLane)
        .parse(typeof query.lane === 'string' ? query.lane : defaultLane);
  const search = typeof query.q === 'string' ? query.q.slice(0, 160) : '';
  const page = z.coerce.number().int().positive().max(1_000_000).catch(1).parse(query.page);
  const coveragePage = z.coerce
    .number()
    .int()
    .positive()
    .max(1_000_000)
    .catch(1)
    .parse(query.coveragePage);
  const focusFirstUnresolved = query.focus === 'first-unresolved';
  const phase9Href = (nextCoveragePage: number, nextQueuePage = page) => {
    const next = new URLSearchParams({ lane: selectedLane });
    if (search) next.set('q', search);
    if (duplicateSignature) next.set('group', duplicateSignature);
    if (nextQueuePage > 1) next.set('page', String(nextQueuePage));
    if (nextCoveragePage > 1) next.set('coveragePage', String(nextCoveragePage));
    if (focusFirstUnresolved) next.set('focus', 'first-unresolved');
    return `/w/${workspaceId}/phase9?${next.toString()}`;
  };
  const [queue, coverage, effortObservations, bridgeResult] = await Promise.all([
    loadPhase9ReviewQueue(supabase, {
      workspaceId,
      evaluationRunId: run.id,
      lane: selectedLane,
      search,
      duplicateSignature,
      page,
      pageSize: 25,
    }),
    loadPhase9CoverageExceptions(supabase, workspaceId, run.id, 25, coveragePage),
    loadPhase9ReviewEffortObservations(supabase, workspaceId, run.id),
    supabase
      .from('phase9_bridge_runs')
      .select('id,verification_run_id,published_count,created_at')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', run.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const queuePageCount = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  if (page > queuePageCount) {
    redirect(phase9Href(coveragePage, queuePageCount));
  }
  const coveragePageCount = Math.max(1, Math.ceil(coverage.total / 25));
  if (coveragePage > coveragePageCount) {
    redirect(phase9Href(coveragePageCount));
  }
  if (bridgeResult.error)
    throw new Error(`phase9_review_bridge_load_failed:${bridgeResult.error.message}`);

  const effort = estimatePhase9ReviewEffort({
    unresolvedIndividualItems:
      summary.individualReviewRemaining +
      summary.unresolvedCoverageExceptions +
      summary.coverageFollowUp +
      summary.followUp,
    unresolvedDuplicateGroups: summary.unresolvedDuplicateGroups,
    unresolvedBatchEligibleRoutineItems: summary.batchEligible,
    observedSecondsPerIndividualDecision: effortObservations.observedSecondsPerIndividualDecision,
    observedSecondsPerBatchItem: effortObservations.observedSecondsPerBatchItem,
    observedIndividualDecisionCount: effortObservations.observedIndividualDecisionCount,
    observedBatchOperationCount: effortObservations.observedBatchOperationCount,
  });
  const next = NEXT_ACTIONS[summary.nextRecommendedAction];
  const remaining = Math.max(0, summary.totalFindings - summary.reviewed);
  const coverageAttention = summary.unresolvedCoverageExceptions + summary.coverageFollowUp;
  const overallDecisionTotal = summary.totalFindings + summary.coverageExceptions;
  const overallDecisionsRecorded = summary.reviewed + summary.coverageReviewed;

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="phase9"
      />

      <header className="page-header items-end" data-tour-target="closing-value-statement">
        <div data-tour-target="opportunity-overview">
          <p className="page-eyebrow">Trusted submission planning</p>
          <h1 className="page-title mt-2">RFP review command center</h1>
          <p className="page-lede mt-3 max-w-3xl">
            Focus on bid risks and unresolved source questions first. The system suggests; your team
            decides what becomes operational work.
          </p>
        </div>
        <StatusBadge
          value={summary.publicationEligible ? 'ready_for_review' : 'human_review_required'}
        />
      </header>

      <section
        className="executive-review-grid"
        aria-label="Executive review summary"
        data-tour-target="executive-summary"
      >
        <article className="executive-primary-card">
          <p className="section-kicker">Immediate bid attention</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExecutiveMetric
              label="Critical decisions remaining"
              value={summary.unresolvedCritical}
              tone="critical"
            />
            <ExecutiveMetric
              label="Source exceptions remaining"
              value={
                summary.unresolvedExceptions + coverageAttention + summary.unrepresentedFindings
              }
              tone="warning"
            />
            <ExecutiveMetric
              label="Individual review remaining"
              value={
                summary.individualReviewRemaining +
                coverageAttention +
                summary.followUp +
                summary.invalidAccepted
              }
            />
            <ExecutiveMetric label="Submission deadlines" value={summary.submissionDeadlines} />
            <ExecutiveMetric label="Question deadlines" value={summary.questionDeadlines} />
            <ExecutiveMetric label="Required forms" value={summary.requiredForms} />
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
            <InlineFact
              label="Signatures / acknowledgments"
              value={summary.signaturesAcknowledgments}
            />
            <InlineFact
              label="Insurance / bond / licensing"
              value={summary.insuranceBondLicensing}
            />
            <InlineFact label="Pricing obligations" value={summary.pricing} />
            <InlineFact label="Company evidence needed" value={summary.bidderEvidenceRequired} />
          </dl>
        </article>

        <article className="surface-card rail-teal p-5" data-tour-target="next-recommended-action">
          <p className="section-kicker">Next recommended action</p>
          <h2 className="section-title mt-2">{next.title}</h2>
          <p className="section-lede mt-2">{next.body}</p>
          <Link
            className="primary-action mt-4 inline-flex"
            href={`/w/${workspaceId}/phase9?lane=${next.lane}`}
          >
            Go to this review work
          </Link>
        </article>
      </section>

      <section
        className="surface-card mt-5 p-5"
        aria-label="Review progress"
        data-tour-target="review-progress"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Review progress</p>
            <h2 className="section-title mt-1.5">
              {overallDecisionsRecorded} of {overallDecisionTotal} required review decisions are
              recorded
            </h2>
            <p className="section-lede mt-2">
              {remaining} findings await a first team decision, {summary.followUp} decisions still
              need follow-up, {summary.invalidAccepted} accepted decisions need correction, and{' '}
              {summary.unresolvedCoverageExceptions} page checks remain.{' '}
              {summary.unrepresentedFindings
                ? `${summary.unrepresentedFindings} machine findings are missing from the review queue and block publication. `
                : ''}
              {summary.batchEligible} findings are eligible for accelerated routine review.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-ink">
              {summary.reviewCompletionPercentage.toFixed(1)}%
            </p>
            <p className="text-metadata">team review decisions recorded</p>
          </div>
        </div>
        <div
          className="review-progress-track mt-4"
          role="progressbar"
          aria-label="Finding review completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.reviewCompletionPercentage}
        >
          <span style={{ width: `${summary.reviewCompletionPercentage}%` }} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <ProgressFact label="Machine findings awaiting review" value={remaining} />
          <ProgressFact label="Follow-up decisions unresolved" value={summary.followUp} />
          <ProgressFact
            label="Accepted decisions needing correction"
            value={summary.invalidAccepted}
          />
          <ProgressFact label="Team-reviewed findings" value={summary.reviewed} />
          <ProgressFact label="Published requirements" value={summary.publishedRequirements} />
          <ProgressFact
            label="Checklist work"
            value={summary.publishedRequirements ? 'Available' : 'Not built'}
          />
        </dl>
        <p className="notice notice-info mt-4">
          Estimated review effort: approximately {effort.minimumMinutes}–{effort.maximumMinutes}{' '}
          minutes. <span className="text-metadata">{effort.disclosure}</span>
        </p>
      </section>

      <Phase9ReviewQueue
        workspaceId={workspaceId}
        evaluationRunId={run.id}
        summary={summary}
        queue={queue}
        selectedLane={selectedLane}
        search={search}
        duplicateSignature={duplicateSignature}
        focusFirstUnresolved={focusFirstUnresolved}
      />

      <section
        className="surface-card rail-amber mt-6 p-5"
        aria-labelledby="coverage-exceptions-title"
        data-tour-target="coverage-exceptions"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Coverage exceptions</p>
            <h2 id="coverage-exceptions-title" className="section-title mt-1.5">
              {coverageAttention} page-level checks need attention
            </h2>
            <p className="section-lede mt-2 max-w-3xl">
              Possible omissions and parser issues stay visible until someone checks the original
              page. Source truth is unchanged, but related findings require individual review while
              the page question remains unresolved.
            </p>
          </div>
          <StatusBadge value={coverageAttention ? 'needs_follow_up' : 'accepted'} />
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coverage.rows.map((exception) => (
            <li
              key={`${exception.source_document_id}:${exception.page_number}`}
              className="surface-inset p-4"
            >
              <p className="text-metadata mt-1">
                {exception.exception_reason.replaceAll('_', ' ')}
              </p>
              <Phase9CoverageReviewControls
                workspaceId={workspaceId}
                evaluationRunId={run.id}
                documentId={exception.source_document_id}
                pageNumber={exception.page_number}
                currentDecision={exception.human_decision}
                sourceHref={`/w/${workspaceId}/documents/${exception.source_document_id}?page=${exception.page_number}`}
              />
            </li>
          ))}
        </ul>
        {coverage.total > coverage.rows.length ? (
          <nav className="mt-4 flex items-center justify-between" aria-label="Coverage pages">
            {coveragePage > 1 ? (
              <Link className="secondary-action btn-sm" href={phase9Href(coveragePage - 1)}>
                Previous coverage page
              </Link>
            ) : (
              <span />
            )}
            <p className="text-metadata">
              Coverage page {coveragePage} of {coveragePageCount}
            </p>
            {coveragePage * 25 < coverage.total ? (
              <Link className="secondary-action btn-sm" href={phase9Href(coveragePage + 1)}>
                Next coverage page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
        {coverage.total === 0 ? (
          <p className="notice notice-success mt-4">No page-level exceptions remain unresolved.</p>
        ) : null}
      </section>

      <section className="mt-6" data-tour-target="publication-gate">
        <PublishReviewedFindings
          workspaceId={workspaceId}
          evaluationRunId={run.id}
          eligibleCount={summary.publishableAccepted}
          reviewedCount={summary.reviewed}
          totalCount={summary.totalFindings}
          followUpCount={summary.followUp}
          coverageExceptionCount={summary.coverageExceptions}
          coverageReviewedCount={summary.coverageReviewed}
          coverageFollowUpCount={summary.coverageFollowUp}
          publicationEligible={summary.publicationEligible}
          invalidAcceptedCount={summary.invalidAccepted}
          unrepresentedFindingCount={summary.unrepresentedFindings}
        />
        {bridgeResult.data ? (
          <p className="notice notice-info mt-3">
            {bridgeResult.data.published_count} reviewed source requirements are available in the{' '}
            <Link href={`/w/${workspaceId}/requirements`} className="action-link">
              requirement register
            </Link>{' '}
            and can be used to{' '}
            <Link
              href={`/w/${workspaceId}/checklist`}
              className="action-link"
              data-tour-target="submission-checklist"
            >
              build the submission checklist
            </Link>
            .
          </p>
        ) : null}
      </section>

      <details className="disclosure mt-6">
        <summary>Analyst details and source-analysis provenance</summary>
        <div className="disclosure-body">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TechnicalFact label="Analysis mode" value={run.mode} />
            <TechnicalFact label="Provider calls" value={String(run.provider_call_count)} />
            <TechnicalFact label="Actual cost" value={`$${Number(run.actual_usd).toFixed(4)}`} />
            <TechnicalFact
              label="Expected answers"
              value={run.expected_answers_used ? 'Used' : 'Not used'}
            />
            <TechnicalFact label="Source package" value={shortHash(run.source_package_hash)} />
            <TechnicalFact label="Document set" value={shortHash(run.document_set_hash ?? '')} />
            <TechnicalFact label="Call plan" value={shortHash(run.call_plan_hash)} />
            <TechnicalFact label="Compatibility" value={shortHash(run.compatibility_fingerprint)} />
          </dl>
          <div className="mt-4">{liveControls}</div>
        </div>
      </details>
    </main>
  );
}

function ExecutiveMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'critical' | 'warning';
}) {
  return (
    <div className={`executive-metric executive-metric-${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function InlineFact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="inline font-medium text-ink">{label}: </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

function ProgressFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-inset p-3">
      <dt className="metric-label">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}

function TechnicalFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="mono mt-1 wrap-break-word text-sm text-ink-soft">{value}</dd>
    </div>
  );
}

function shortHash(value: string) {
  if (!value) return 'Not available';
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
