import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { IconDocument, IconInfo } from '@/components/icons';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProposalFindingControls } from '../finding-controls';

/** Severity keeps a non-colour cue: a left rail on the card, not a tinted panel. */
const severityRail: Record<string, string> = {
  critical: 'rail-critical',
  blocking: 'rail-warning',
};

export default async function ProposalAuditDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; auditRunId: string }>;
}) {
  const { workspaceId, auditRunId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(workspaceId).success || !uuid.safeParse(auditRunId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: run } = await supabase
    .from('proposal_audit_runs')
    .select(
      '*,proposal_drafts!inner(document_id,revision_number,documents!inner(normalized_filename))',
    )
    .eq('id', auditRunId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!run) notFound();
  const [{ data: findings }, { data: coverage }, { data: matches }] = await Promise.all([
    supabase
      .from('proposal_audit_findings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('proposal_audit_run_id', auditRunId)
      .order('severity'),
    supabase
      .from('proposal_response_coverage')
      .select('*,checklist_items!inner(title,category,candidate_id,relationship_role)')
      .eq('workspace_id', workspaceId)
      .eq('proposal_audit_run_id', auditRunId)
      .order('coverage_status'),
    supabase
      .from('proposal_claim_requirement_matches')
      .select(
        'support_status,consistency_status,match_score,proposal_claims!inner(claim_text,page_number)',
      )
      .eq('workspace_id', workspaceId)
      .eq('proposal_audit_run_id', auditRunId),
  ]);
  const { data: resolutions } = (findings ?? []).length
    ? await supabase
        .from('proposal_finding_resolutions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in(
          'proposal_finding_id',
          (findings ?? []).map((finding) => finding.id),
        )
        .order('created_at', { ascending: false })
    : { data: [] };
  const draft = run.proposal_drafts as unknown as {
    document_id: string;
    revision_number: number;
    documents: { normalized_filename: string };
  };
  const resolutionByFinding = new Map<string, typeof resolutions>();
  for (const resolution of resolutions ?? [])
    resolutionByFinding.set(resolution.proposal_finding_id, [
      ...(resolutionByFinding.get(resolution.proposal_finding_id) ?? []),
      resolution,
    ]);
  const severityOrder: Record<string, number> = {
    critical: 0,
    blocking: 1,
    warning: 2,
    informational: 3,
  };
  const orderedFindings = [...(findings ?? [])].sort(
    (left, right) => (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9),
  );
  const criticalCount = orderedFindings.filter((finding) => finding.severity === 'critical').length;
  const blockingCount = orderedFindings.filter((finding) => finding.severity === 'blocking').length;
  const pendingCount = orderedFindings.filter(
    (finding) => finding.human_resolution_status === 'pending',
  ).length;
  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="proposal-audit"
        compact
      />
      <Link
        href={`/w/${workspaceId}/proposal-audit`}
        className="action-link inline-flex items-center gap-1.5 text-sm"
      >
        ← Draft review history
      </Link>
      <div className="page-header mt-4">
        <div>
          <p className="page-eyebrow">Completed draft review</p>
          <h1 className="page-title mt-1.5">{draft.documents.normalized_filename}</h1>
          <p className="page-lede mt-2.5">
            Revision {draft.revision_number} · completed{' '}
            {formatDate(run.completed_at ?? run.created_at)} · team decisions remain separate
          </p>
        </div>
        <StatusBadge value={run.status} />
      </div>

      <div className="notice notice-info flex items-start gap-2.5">
        <IconInfo size={16} className="mt-0.5 shrink-0 text-info-400" />
        <p>
          This review is complete. Run another review only after uploading a new proposal revision.
          Machine findings still require a human decision.
        </p>
      </div>

      <section
        aria-label="Draft review summary"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Metric label="Critical issues" value={criticalCount} danger={criticalCount > 0} />
        <Metric label="Blocking issues" value={blockingCount} danger={blockingCount > 0} />
        <Metric label="All findings" value={run.finding_count} warning={run.finding_count > 0} />
        <Metric label="Team decisions pending" value={pendingCount} warning={pendingCount > 0} />
      </section>

      <details className="analyst-only disclosure mt-5">
        <summary>Technical audit details</summary>
        <div className="disclosure-body grid gap-4 sm:grid-cols-3">
          <div>
            <p className="section-kicker">Claims</p>
            <p className="mono mt-1.5 text-xs text-ink-soft">{run.claim_count}</p>
          </div>
          <div>
            <p className="section-kicker">Findings</p>
            <p className="mono mt-1.5 text-xs text-ink-soft">{run.finding_count}</p>
          </div>
          <div>
            <p className="section-kicker">Evaluator</p>
            <p className="mono mt-1.5 text-xs text-ink-soft">{run.evaluator_version}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="section-kicker">Input hash</p>
            <p className="mono mt-1.5 break-all text-xs text-ink-soft">{run.input_hash}</p>
          </div>
        </div>
      </details>

      <section className="mt-10" aria-labelledby="priority-findings">
        <div className="mb-4">
          <p className="section-kicker">What needs attention</p>
          <h2 id="priority-findings" className="section-title mt-1.5">
            Proposal issues
          </h2>
          <p className="section-lede">
            Sorted by submission risk. Open a finding to inspect its evidence and record a team
            decision.
          </p>
        </div>
        {orderedFindings.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {orderedFindings.map((finding) => (
              <article
                key={`summary-${finding.id}`}
                className={`surface-card flex flex-col gap-3 p-5 ${severityRail[finding.severity] ?? 'rail-steel'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">
                    Issue: {finding.title}
                  </h3>
                  <StatusBadge value={finding.severity} />
                </div>
                <p className="text-sm text-ink-soft">{finding.detail}</p>
                {finding.source_quote ? (
                  <div>
                    <p className="section-kicker">RFP requires</p>
                    <p
                      className={`evidence-quote mt-2 ${finding.severity === 'critical' ? 'evidence-quote-conflict' : ''}`}
                    >
                      {finding.source_quote}
                    </p>
                  </div>
                ) : null}
                <a href={`#finding-${finding.id}`} className="action-link mt-auto w-fit text-sm">
                  Review evidence and decide →
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="notice flex items-start gap-2.5">
            <IconInfo size={16} className="mt-0.5 shrink-0 text-ink-muted" />
            <p>
              No machine findings were generated. Human review of the proposal is still required.
            </p>
          </div>
        )}
      </section>
      <section className="mt-10">
        <h2 className="section-title mb-4">RFP response coverage</h2>
        <div className="data-frame">
          <div className="data-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Category</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {(coverage ?? []).map((item) => {
                  const source = item.checklist_items as unknown as {
                    title: string;
                    category: string;
                    candidate_id: string;
                    relationship_role: string;
                  };
                  return (
                    <tr key={item.id}>
                      <td className="cell-primary min-w-56">{source.title}</td>
                      <td className="text-xs text-ink-muted">
                        {businessLabel(source.category)} · {businessLabel(source.relationship_role)}
                      </td>
                      <td>
                        <StatusBadge
                          value={item.coverage_status}
                          label={businessLabel(item.coverage_status)}
                        />
                      </td>
                      <td className="min-w-64">{item.reason}</td>
                      <td>
                        <Link
                          className="action-link whitespace-nowrap"
                          href={`/w/${workspaceId}/requirements/${source.candidate_id}`}
                        >
                          Requirement evidence
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <details className="disclosure mt-10" open>
        <summary className="text-[0.9375rem] font-semibold text-ink">
          Atomic proposal claims
        </summary>
        <div className="disclosure-body">
          <section>
            <h2 className="section-title mb-4">Atomic claims</h2>
            <ul className="grid gap-3">
              {(matches ?? []).map((match, index) => {
                const claim = match.proposal_claims as unknown as {
                  claim_text: string;
                  page_number: number;
                };
                return (
                  <li key={index} className="surface-panel rail-steel p-4">
                    <blockquote className="evidence-quote evidence-quote-proposal">
                      {claim.claim_text}
                    </blockquote>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p className="text-xs text-ink-muted">
                        Support: {match.support_status} · consistency: {match.consistency_status} ·
                        page {claim.page_number} · score {Number(match.match_score).toFixed(2)}
                      </p>
                      <Link
                        href={`/w/${workspaceId}/documents/${draft.document_id}?page=${claim.page_number}`}
                        className="locator"
                      >
                        <IconDocument size={12} />
                        Open proposal page
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </details>
      <section className="mt-10" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="section-title mb-4">
          Findings
        </h2>
        {findings?.length ? (
          <ul className="space-y-4">
            {orderedFindings.map((finding) => (
              <li
                id={`finding-${finding.id}`}
                key={finding.id}
                className={`surface-card p-5 ${severityRail[finding.severity] ?? ''}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium text-ink">{finding.title}</h3>
                  <span className="flex flex-wrap gap-1.5 text-sm">
                    <StatusBadge value={finding.severity} />
                    <StatusBadge value={finding.workflow_status} />
                    <StatusBadge value={finding.human_resolution_status} />
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{finding.detail}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {finding.proposal_page_number ? (
                    <Link
                      className="locator"
                      href={`/w/${workspaceId}/documents/${draft.document_id}?page=${finding.proposal_page_number}`}
                    >
                      Proposal page {finding.proposal_page_number}
                    </Link>
                  ) : null}
                  {finding.checklist_item_id ? (
                    <Link
                      className="action-link"
                      href={`/w/${workspaceId}/checklist/${finding.checklist_item_id}`}
                    >
                      Checklist source
                    </Link>
                  ) : null}
                  {finding.source_document_id && finding.source_page_number ? (
                    <Link
                      className="locator"
                      href={`/w/${workspaceId}/documents/${finding.source_document_id}?page=${finding.source_page_number}`}
                    >
                      Source page {finding.source_page_number}
                    </Link>
                  ) : null}
                </div>
                {finding.source_quote ? (
                  <blockquote
                    className={`evidence-quote mt-3 ${finding.severity === 'critical' ? 'evidence-quote-conflict' : ''}`}
                  >
                    {finding.source_quote}
                  </blockquote>
                ) : null}
                <ProposalFindingControls
                  workspaceId={workspaceId}
                  auditRunId={auditRunId}
                  findingId={finding.id}
                />
                {(resolutionByFinding.get(finding.id) ?? []).length ? (
                  <details className="disclosure mt-3 text-sm">
                    <summary>Decision history</summary>
                    <ul className="disclosure-body mt-2 list-disc pl-5 text-ink-soft">
                      {(resolutionByFinding.get(finding.id) ?? []).map((resolution) => (
                        <li key={resolution.id}>
                          {resolution.human_resolution_status} / {resolution.workflow_status} —{' '}
                          {resolution.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">
            No findings were generated. Human review is still required for the audit.
          </p>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  danger = false,
  warning = false,
}: {
  label: string;
  value: number;
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
    </div>
  );
}
