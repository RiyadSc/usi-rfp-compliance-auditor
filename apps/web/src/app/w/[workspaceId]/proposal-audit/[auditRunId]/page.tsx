import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel, formatDate } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProposalFindingControls } from '../finding-controls';

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
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="proposal-audit"
        compact
      />
      <Link href={`/w/${workspaceId}/proposal-audit`} className="action-link text-sm">
        ← Draft review history
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Completed draft review</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {draft.documents.normalized_filename}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Revision {draft.revision_number} · completed{' '}
            {formatDate(run.completed_at ?? run.created_at)} · team decisions remain separate
          </p>
        </div>
        <StatusBadge value={run.status} />
      </div>

      <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        This review is complete. Run another review only after uploading a new proposal revision.
        Machine findings still require a human decision.
      </p>

      <section
        aria-label="Draft review summary"
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Metric label="Critical issues" value={criticalCount} danger={criticalCount > 0} />
        <Metric label="Blocking issues" value={blockingCount} danger={blockingCount > 0} />
        <Metric label="All findings" value={run.finding_count} warning={run.finding_count > 0} />
        <Metric label="Team decisions pending" value={pendingCount} warning={pendingCount > 0} />
      </section>

      <details className="analyst-only surface-card mt-4 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Technical audit details</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <p>
            <strong>Claims</strong>
            <br />
            {run.claim_count}
          </p>
          <p>
            <strong>Findings</strong>
            <br />
            {run.finding_count}
          </p>
          <p>
            <strong>Evaluator</strong>
            <br />
            {run.evaluator_version}
          </p>
          <p className="break-all sm:col-span-3">
            <strong>Input hash</strong>
            <br />
            {run.input_hash}
          </p>
        </div>
      </details>

      <section className="mt-8" aria-labelledby="priority-findings">
        <div className="mb-3">
          <p className="section-kicker">What needs attention</p>
          <h2 id="priority-findings" className="mt-1 text-xl font-semibold">
            Proposal issues
          </h2>
          <p className="text-sm text-slate-600">
            Sorted by submission risk. Open a finding to inspect its evidence and record a team
            decision.
          </p>
        </div>
        {orderedFindings.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {orderedFindings.map((finding) => (
              <article
                key={`summary-${finding.id}`}
                className={`surface-card border-l-4 p-4 ${finding.severity === 'critical' ? 'border-l-red-600' : finding.severity === 'blocking' ? 'border-l-amber-500' : 'border-l-blue-500'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold">Issue: {finding.title}</h3>
                  <StatusBadge value={finding.severity} />
                </div>
                <p className="mt-2 text-sm text-slate-700">{finding.detail}</p>
                {finding.source_quote ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      RFP requires
                    </p>
                    <p className="mt-1 text-sm">{finding.source_quote}</p>
                  </div>
                ) : null}
                <a
                  href={`#finding-${finding.id}`}
                  className="action-link mt-3 inline-block text-sm"
                >
                  Review evidence and decide →
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            No machine findings were generated. Human review of the proposal is still required.
          </p>
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">RFP response coverage</h2>
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full bg-white text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Requirement</th>
                <th className="p-3">Category</th>
                <th className="p-3">Coverage</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Source</th>
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
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="p-3">{source.title}</td>
                    <td className="p-3">
                      {businessLabel(source.category)} · {businessLabel(source.relationship_role)}
                    </td>
                    <td className="p-3 font-medium">
                      <StatusBadge
                        value={item.coverage_status}
                        label={businessLabel(item.coverage_status)}
                      />
                    </td>
                    <td className="p-3">{item.reason}</td>
                    <td className="p-3">
                      <Link
                        className="text-blue-700 hover:underline"
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
      </section>
      <details className="mt-8" open>
        <summary className="cursor-pointer text-lg font-semibold">Atomic proposal claims</summary>
        <section className="mt-3">
          <h2 className="mb-3 text-lg font-medium">Atomic claims</h2>
          <ul className="space-y-2">
            {(matches ?? []).map((match, index) => {
              const claim = match.proposal_claims as unknown as {
                claim_text: string;
                page_number: number;
              };
              return (
                <li key={index} className="rounded border border-slate-200 bg-white p-3">
                  <blockquote>{claim.claim_text}</blockquote>
                  <p className="mt-1 text-xs text-slate-600">
                    Support: {match.support_status} · consistency: {match.consistency_status} · page{' '}
                    {claim.page_number} · score {Number(match.match_score).toFixed(2)}
                  </p>
                  <Link
                    href={`/w/${workspaceId}/documents/${draft.document_id}?page=${claim.page_number}`}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Open proposal page
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </details>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Findings</h2>
        {findings?.length ? (
          <ul className="space-y-4">
            {orderedFindings.map((finding) => (
              <li
                id={`finding-${finding.id}`}
                key={finding.id}
                className="rounded border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{finding.title}</h3>
                  <span className="text-sm">
                    <StatusBadge value={finding.severity} />{' '}
                    <StatusBadge value={finding.workflow_status} />{' '}
                    <StatusBadge value={finding.human_resolution_status} />
                  </span>
                </div>
                <p className="mt-2 text-sm">{finding.detail}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {finding.proposal_page_number ? (
                    <Link
                      className="text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/documents/${draft.document_id}?page=${finding.proposal_page_number}`}
                    >
                      Proposal page {finding.proposal_page_number}
                    </Link>
                  ) : null}
                  {finding.checklist_item_id ? (
                    <Link
                      className="text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/checklist/${finding.checklist_item_id}`}
                    >
                      Checklist source
                    </Link>
                  ) : null}
                  {finding.source_document_id && finding.source_page_number ? (
                    <Link
                      className="text-blue-700 hover:underline"
                      href={`/w/${workspaceId}/documents/${finding.source_document_id}?page=${finding.source_page_number}`}
                    >
                      Source page {finding.source_page_number}
                    </Link>
                  ) : null}
                </div>
                {finding.source_quote ? (
                  <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm">
                    {finding.source_quote}
                  </blockquote>
                ) : null}
                <ProposalFindingControls
                  workspaceId={workspaceId}
                  auditRunId={auditRunId}
                  findingId={finding.id}
                />
                {(resolutionByFinding.get(finding.id) ?? []).length ? (
                  <details className="mt-3 text-sm">
                    <summary>Decision history</summary>
                    <ul className="mt-2 list-disc pl-5">
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
          <p className="text-sm text-slate-600">
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
    <div className="surface-card p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p
        className={`metric-value ${danger ? 'text-red-700' : warning ? 'text-amber-700' : 'text-slate-950'}`}
      >
        {value}
      </p>
    </div>
  );
}
