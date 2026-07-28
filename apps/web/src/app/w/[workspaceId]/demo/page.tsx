import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Phase8DemoMode } from '@usi/domain';
import { DemoModeBanner, OperationalStateNotice } from '@/components/operational-state';
import { StatusBadge } from '@/components/status-badge';
import { businessLabel } from '@/lib/presentation';
import { loadValidatedPhase8Cache } from '@/lib/hardening/service';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DemoDownloadGrantButton, DemoFindingReviewButton, DemoModeControls } from './demo-actions';

const PHASE8_SCOPE_ID = '81000000-0000-4000-8000-000000000001';
const expectedProposalFindings = [
  ['Unsupported factual claim', 'unsupported_claim', 5, null],
  ['Contradictory delivery method', 'contradicted_claim', 3, 5],
  ['Conflicting deadline', 'date_mismatch', 3, 2],
  ['Incorrect insurance value', 'numerical_mismatch', 4, 3],
  ['Wrong procurement reference', 'wrong_procurement_identity', 6, null],
  ['Missing mandatory response', 'missing_required_response', null, 7],
  ['Company proof required', 'human_proof_required', 5, 6],
  ['Embedded prompt-injection attempt — zero influence', 'prompt_injection_attempt', 7, null],
] as const;

export default async function Phase8DemoPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createSupabaseAdminClient();
  let scope;
  try {
    scope = await loadValidatedPhase8Cache({
      scopeId: PHASE8_SCOPE_ID,
      workspaceId,
      actorId: user.id,
      admin,
    });
  } catch {
    notFound();
  }
  const [candidates, checklist, blockers, state, report, events] = await Promise.all([
    admin
      .from('requirement_candidates')
      .select(
        'id,title,preliminary_page,evidence_quote,verification_findings(id,source_support_status,precedence_status,proof_requirement,machine_status)',
      )
      .eq('workspace_id', workspaceId)
      .eq('analysis_run_id', scope.binding.analysisRunId)
      .order('id'),
    admin
      .from('checklist_items')
      .select('id,title,category,workflow_status,artifact_state,finding_id')
      .eq('workspace_id', workspaceId)
      .eq('generation_version', 'checklist-generator-v1')
      .order('id'),
    admin
      .from('checklist_blockers')
      .select('id,checklist_item_id,blocker_type,severity,reason,status')
      .eq('workspace_id', workspaceId)
      .eq('blocker_type', 'missing_mandatory_form')
      .eq('status', 'open'),
    admin
      .from('phase8_demo_presentation_state')
      .select('mode,state,reset_count')
      .eq('scope_id', PHASE8_SCOPE_ID)
      .maybeSingle(),
    admin
      .from('report_snapshots')
      .select('id,summary,snapshot,input_hash,report_version')
      .eq('id', scope.binding.reportSnapshotId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    admin
      .from('audit_events')
      .select('event_type,created_at,payload')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  if (candidates.error || checklist.error || blockers.error || report.error) notFound();
  const mode = (state.data?.mode ?? 'prepared') as Phase8DemoMode;
  const candidateRows = candidates.data ?? [];
  const checklistRows = checklist.data ?? [];
  const blockerRows = blockers.data ?? [];
  const findingReviewDemonstrated = Boolean(
    (state.data?.state as { findingReviewDemonstrated?: boolean } | null)
      ?.findingReviewDemonstrated,
  );
  const reportSummary = (report.data?.summary ?? {}) as Record<string, unknown>;
  const sourceCoverage = reportSummary.sourceCoverage as
    { numerator?: number; denominator?: number; ratio?: number | null } | undefined;
  const executiveMetrics = [
    {
      label: 'Required progress',
      value: `${String(reportSummary.completedRequiredItems ?? 0)} of ${String(reportSummary.requiredItems ?? 0)}`,
    },
    { label: 'Critical blockers', value: String(reportSummary.criticalBlockers ?? 0) },
    { label: 'Blocking issues', value: String(reportSummary.blockingIssues ?? 0) },
    { label: 'Missing artifacts', value: String(reportSummary.missingArtifacts ?? 0) },
    { label: 'Company evidence', value: String(reportSummary.humanProofCount ?? 0) },
    { label: 'Team reviews pending', value: String(reportSummary.humanReviewPending ?? 0) },
    {
      label: 'Source coverage',
      value:
        typeof sourceCoverage?.ratio === 'number'
          ? `${Math.round(sourceCoverage.ratio * 100)}%`
          : `${sourceCoverage?.numerator ?? 0} of ${sourceCoverage?.denominator ?? 0}`,
    },
    {
      label: 'Readiness',
      value: businessLabel(String(reportSummary.readinessState ?? 'unresolved')),
    },
  ];

  return (
    <main className="page-shell space-y-8">
      <DemoModeBanner mode={mode} />
      <header className="hero-panel texture-nodes p-6 lg:p-8">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker text-teal-300">Prepared synthetic demonstration</p>
            <h1 className="page-title mt-2">Harbor City full-roadmap demo</h1>
            <p className="mt-3 max-w-3xl text-ink-soft">
              A guided story from RFP evidence to submission blockers, proposal risk, and executive
              final review—using known-answer synthetic data only.
            </p>
          </div>
          <StatusBadge value="informational" label="Safe demo data" tone="info" />
        </div>
        <details className="analyst-only disclosure relative mt-5 text-sm text-ink-soft">
          <summary className="cursor-pointer">Technical fixture details</summary>
          <p className="mt-2">
            Fixture {scope.binding.fixtureVersion} · Phase 4 fingerprint{' '}
            <code className="mono">{scope.binding.compatibilityFingerprint}</code>
          </p>
        </details>
      </header>

      <nav
        aria-label="Demo walkthrough"
        className="stage-nav sticky top-0 z-10 overflow-x-auto bg-surface-900/95 backdrop-blur"
      >
        <ol className="flex min-w-max gap-1">
          {[
            ['#demo-overview', '1. Opportunity'],
            ['#requirements-heading', '2. RFP change'],
            ['#checklist-heading', '3. Missing forms'],
            ['#proposal-heading', '4. Draft errors'],
            ['#report-heading', '5. Final review'],
          ].map(([href, text]) => (
            <li key={href}>
              <a href={href} className="stage-nav-item">
                {text}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section
        id="demo-overview"
        className="grid gap-3 md:grid-cols-3"
        aria-label="Demo opportunity summary"
      >
        <DemoMetric
          label="RFP requirements"
          value={candidateRows.length}
          note="Evidence-linked candidates"
        />
        <DemoMetric
          label="Submission blockers"
          value={blockerRows.length}
          note="Missing mandatory forms"
          danger
        />
        <DemoMetric
          label="Planted draft risks"
          value={expectedProposalFindings.length}
          note="Known-answer issues to inspect"
          warning
        />
      </section>

      <aside className="notice notice-info">
        <strong className="notice-title">Suggested talk track:</strong>
        <p className="mt-2">
          start with one changed RFP requirement, show the five missing forms, inspect the incorrect
          deadline or insurance value, then finish with the executive report.
        </p>
      </aside>

      <section aria-labelledby="requirements-heading" className="scroll-mt-20">
        <p className="section-kicker">Step 2 · Understand the RFP</p>
        <h2 id="requirements-heading" className="section-title mt-1.5">
          Candidate extraction and source verification
        </h2>
        <p className="section-lede mt-1">
          {candidateRows.length} immutable extraction candidates; machine findings remain distinct
          from human review.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {candidateRows.map((candidate) => {
            const finding = Array.isArray(candidate.verification_findings)
              ? candidate.verification_findings[0]
              : candidate.verification_findings;
            return (
              <article key={candidate.id} className="surface-card p-5">
                <h3 className="font-semibold text-ink">{candidate.title}</h3>
                <p className="text-sm text-ink-muted">Source page {candidate.preliminary_page}</p>
                <blockquote className="evidence-quote mt-3">{candidate.evidence_quote}</blockquote>
                <div className="my-3 flex flex-wrap gap-1.5">
                  <StatusBadge value={finding?.source_support_status ?? 'pending'} />
                  <StatusBadge value={finding?.precedence_status ?? 'undetermined'} />
                  <StatusBadge value={finding?.proof_requirement ?? 'undetermined'} />
                </div>
                {finding?.id ? (
                  <Link
                    className="action-link"
                    href={`/w/${workspaceId}/requirements/${candidate.id}`}
                  >
                    Open verified requirement and evidence
                  </Link>
                ) : null}
                {' · '}
                <Link
                  className="locator"
                  href={`/w/${workspaceId}/documents/${scope.binding.sourceDocumentId}?page=${candidate.preliminary_page}`}
                >
                  Open original page
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="checklist-heading" className="scroll-mt-20">
        <p className="section-kicker">Step 3 · Organize the submission</p>
        <h2 id="checklist-heading" className="section-title mt-1.5">
          Deterministic checklist and blockers
        </h2>
        <p data-testid="missing-form-count" className="mt-1 text-ink-soft">
          Exactly {blockerRows.length} missing mandatory-form blockers.
        </p>
        <p className="mt-1 font-medium text-critical-400">
          Blocked by 5 required items · Human review required
        </p>
        <ul className="mt-3 space-y-2">
          {checklistRows.map((item) => {
            const blocker = blockerRows.find((entry) => entry.checklist_item_id === item.id);
            return (
              <li key={item.id} className={`surface-card p-5 ${blocker ? 'rail-critical' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-ink">{item.title}</strong>
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge value={item.workflow_status} />
                    <StatusBadge value={item.artifact_state} />
                  </span>
                </div>
                {blocker ? (
                  <>
                    <br />
                    <span className="text-critical-400">Critical blocker: {blocker.reason}</span>
                  </>
                ) : null}
                <br />
                <Link className="action-link" href={`/w/${workspaceId}/checklist/${item.id}`}>
                  Open checklist item and linked evidence
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="proposal-heading" className="scroll-mt-20">
        <p className="section-kicker">Step 4 · Review the proposal</p>
        <h2 id="proposal-heading" className="section-title mt-1.5">
          Proposal draft audit
        </h2>
        <p className="section-lede mt-1">
          Flawed synthetic proposal parsed into page-anchored claims. No document instruction had
          authority.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {expectedProposalFindings.map(([title, type, proposalPage, sourcePage]) => (
            <article key={type} className="surface-card p-5" data-finding-type={type}>
              <h3 className="font-semibold text-ink">{title}</h3>
              <p className="analyst-only text-metadata mt-1">{businessLabel(type)}</p>
              {proposalPage ? (
                <Link
                  className="locator mt-2 inline-flex"
                  href={`/w/${workspaceId}/documents/${scope.binding.proposalDocumentId}?page=${proposalPage}`}
                >
                  Open proposal page {proposalPage}
                </Link>
              ) : null}
              {sourcePage ? (
                <>
                  <span className="text-ink-muted"> · </span>
                  <Link
                    className="locator"
                    href={`/w/${workspaceId}/documents/${scope.binding.sourceDocumentId}?page=${sourcePage}`}
                  >
                    Open RFP page {sourcePage}
                  </Link>
                </>
              ) : null}
            </article>
          ))}
        </div>
        <div className="mt-4">
          <DemoFindingReviewButton workspaceId={workspaceId} scopeId={PHASE8_SCOPE_ID} />
        </div>
        <p data-testid="resolution-history" className="mt-2 text-sm text-ink-soft">
          {findingReviewDemonstrated
            ? 'Append-only resolution history contains the demonstrated review.'
            : 'Resolution history is ready for a review demonstration.'}
        </p>
      </section>

      <section aria-labelledby="report-heading" className="scroll-mt-20">
        <p className="section-kicker">Step 5 · Prepare the decision meeting</p>
        <h2 id="report-heading" className="section-title mt-1.5">
          Executive readiness report
        </h2>
        <p className="section-lede mt-1">
          Critical blockers, unresolved findings, missing artifacts, source coverage, and review
          completion are projected from current findings.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {executiveMetrics.map((metric) => (
            <div key={metric.label} className="metric-card">
              <p className="metric-label">{metric.label}</p>
              <p className="metric-value text-[1.25rem]">{metric.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-muted">DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION</p>
        <Link
          className="action-link"
          href={`/w/${workspaceId}/reports/${scope.binding.reportSnapshotId}`}
        >
          Open readiness report and private export
        </Link>
        <div className="mt-3">
          <DemoDownloadGrantButton workspaceId={workspaceId} scopeId={PHASE8_SCOPE_ID} />
        </div>
        {mode === 'fallback' ? (
          <OperationalStateNotice state="fallback">
            Original report provenance is preserved. This does not represent a new report
            generation.
          </OperationalStateNotice>
        ) : null}
      </section>

      <section aria-labelledby="controls-heading">
        <h2 id="controls-heading" className="section-title">
          Resilience and audit controls
        </h2>
        <DemoModeControls workspaceId={workspaceId} scopeId={PHASE8_SCOPE_ID} />
        <p className="mt-2 text-sm text-ink-soft">Reset count: {state.data?.reset_count ?? 0}</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-muted">
          {(events.data ?? []).map((event, index) => (
            <li key={`${event.created_at}-${index}`}>
              {event.event_type} ·{' '}
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function DemoMetric({
  label,
  value,
  note,
  danger = false,
  warning = false,
}: {
  label: string;
  value: number;
  note: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`metric-card ${danger ? 'rail-critical' : warning ? 'rail-warning' : ''}`}>
      <p className="metric-label">{label}</p>
      <p
        className={`metric-value ${danger ? 'text-critical-400' : warning ? 'text-warning-400' : 'text-ink'}`}
      >
        {value}
      </p>
      <p className="metric-note">{note}</p>
    </div>
  );
}
