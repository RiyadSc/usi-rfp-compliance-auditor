import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
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
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}/proposal-audit`} className="text-blue-700 hover:underline">
          ← Proposal audits
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">{draft.documents.normalized_filename}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Revision {draft.revision_number} · {run.status} · deterministic machine audit · human
        decisions remain separate
      </p>
      <div className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
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
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Requirement response coverage</h2>
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
                      {source.category.replaceAll('_', ' ')} · {source.relationship_role}
                    </td>
                    <td className="p-3 font-medium">{item.coverage_status.replaceAll('_', ' ')}</td>
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
      <section className="mt-8">
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
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Findings</h2>
        {findings?.length ? (
          <ul className="space-y-4">
            {findings.map((finding) => (
              <li
                id={`finding-${finding.id}`}
                key={finding.id}
                className="rounded border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{finding.title}</h3>
                  <span className="text-sm">
                    {finding.severity} · {finding.workflow_status} · human{' '}
                    {finding.human_resolution_status}
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
            No findings. Human review is still required for the audit.
          </p>
        )}
      </section>
    </main>
  );
}
