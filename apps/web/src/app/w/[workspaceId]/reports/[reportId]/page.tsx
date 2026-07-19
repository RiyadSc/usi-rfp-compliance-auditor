import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reportSnapshotSchema } from '@usi/domain';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ExportArtifactControls, ReportExportControls } from '../report-controls';

const label = (value: string) => value.replaceAll('_', ' ');

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; reportId: string }>;
  searchParams: Promise<{
    phase?: string;
    severity?: string;
    review?: string;
    type?: string;
    page?: string;
  }>;
}) {
  const { workspaceId, reportId } = await params;
  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(reportId).success
  )
    notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: row } = await supabase
    .from('report_snapshots')
    .select(
      'id,report_type,report_version,schema_version,input_hash,demo,data_classification,snapshot,generated_at,report_generation_run_id',
    )
    .eq('id', reportId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!row) notFound();
  const parsed = reportSnapshotSchema.safeParse(row.snapshot);
  if (!parsed.success) throw new Error('Persisted report snapshot failed strict schema validation');
  const report = parsed.data;
  const query = await searchParams;
  const phaseFilter = ['phase4', 'phase5', 'phase6'].includes(query.phase ?? '')
    ? query.phase!
    : '';
  const severityFilter = ['critical', 'blocking', 'warning', 'informational'].includes(
    query.severity ?? '',
  )
    ? query.severity!
    : '';
  const reviewFilter = ['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived'].includes(
    query.review ?? '',
  )
    ? query.review!
    : '';
  const typeFilter = (query.type ?? '').trim().toLowerCase().slice(0, 100);
  const requestedPage = Number(query.page ?? '1');
  const rowPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const rowLimit = 50;
  const paginate = <T,>(rows: T[]) => rows.slice((rowPage - 1) * rowLimit, rowPage * rowLimit);
  const filteredBlockers = report.criticalBlockers.filter(
    (item) =>
      (!phaseFilter || item.sourcePhase === phaseFilter) &&
      (!severityFilter || item.severity === severityFilter) &&
      (!reviewFilter || item.humanReviewState === reviewFilter) &&
      (!typeFilter || item.type.toLowerCase().includes(typeFilter)),
  );
  const filteredUnresolved = report.unresolvedFindings.filter(
    (item) =>
      (!phaseFilter || item.sourcePhase === phaseFilter) &&
      (!reviewFilter || item.humanState === reviewFilter) &&
      (!typeFilter || item.type.toLowerCase().includes(typeFilter)),
  );
  const filteredProposalFindings = report.proposalFindings.filter(
    (item) =>
      (!phaseFilter || phaseFilter === 'phase6') &&
      (!severityFilter || item.severity === severityFilter) &&
      (!reviewFilter || item.humanResolutionStatus === reviewFilter) &&
      (!typeFilter || item.type.toLowerCase().includes(typeFilter)),
  );
  const filterHref = (page: number) => {
    const params = new URLSearchParams();
    if (phaseFilter) params.set('phase', phaseFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (reviewFilter) params.set('review', reviewFilter);
    if (typeFilter) params.set('type', typeFilter);
    params.set('page', String(page));
    return `/w/${workspaceId}/reports/${reportId}?${params}`;
  };
  const { data: manifests } = await supabase
    .from('export_manifests')
    .select(
      'id,export_format,csv_dataset,regeneration_number,created_at,export_artifacts(id,normalized_filename,content_type,content_length,sha256,demo,status,retention_until,revoked_at,revocation_reason,created_at)',
    )
    .eq('workspace_id', workspaceId)
    .eq('report_snapshot_id', reportId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  const artifacts = (manifests ?? []).flatMap((manifest) => {
    const value = manifest.export_artifacts as unknown as
      | Array<{
          id: string;
          normalized_filename: string;
          content_length: number;
          sha256: string;
          status: string;
          retention_until: string;
        }>
      | {
          id: string;
          normalized_filename: string;
          content_length: number;
          sha256: string;
          status: string;
          retention_until: string;
        }
      | null;
    const rows = Array.isArray(value) ? value : value ? [value] : [];
    return rows.map((artifact) => ({
      ...artifact,
      format: manifest.export_format,
      dataset: manifest.csv_dataset,
      generation: manifest.regeneration_number,
    }));
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {report.demoWatermark ? (
        <div
          className="mb-4 rounded border-2 border-amber-500 bg-amber-50 p-3 text-center font-semibold text-amber-950"
          role="status"
        >
          {report.demoWatermark}
        </div>
      ) : null}
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}/reports`} className="text-blue-700 hover:underline">
          ← Reports
        </Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{label(report.reportType)} report</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generated {new Date(row.generated_at).toLocaleString()} · revision{' '}
            {report.summary.proposalRevision}
          </p>
        </div>
        <span className="rounded bg-slate-100 px-3 py-1 text-sm">
          Human review remains distinct
        </span>
      </div>
      <p className="mt-4 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
        {report.provenance.humanReviewDisclaimer}
      </p>

      <form
        className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        method="get"
      >
        <label className="text-sm font-medium">
          Phase
          <select
            name="phase"
            defaultValue={phaseFilter}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-2"
          >
            <option value="">All</option>
            <option value="phase4">Phase 4</option>
            <option value="phase5">Phase 5</option>
            <option value="phase6">Phase 6</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Severity
          <select
            name="severity"
            defaultValue={severityFilter}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-2"
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="blocking">Blocking</option>
            <option value="warning">Warning</option>
            <option value="informational">Informational</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Human review
          <select
            name="review"
            defaultValue={reviewFilter}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-2"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="needs_follow_up">Needs follow-up</option>
            <option value="waived">Waived</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Finding type
          <input
            name="type"
            defaultValue={typeFilter}
            maxLength={100}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-2"
          />
        </label>
        <button className="self-end rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white">
          Apply filters
        </button>
      </form>

      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Executive summary"
      >
        {[
          ['Readiness', label(report.summary.readinessState)],
          [
            'Required progress',
            `${report.summary.completedRequiredItems} of ${report.summary.requiredItems}`,
          ],
          ['Critical blockers', report.summary.criticalBlockers],
          ['Blocking issues', report.summary.blockingIssues],
          ['Warnings', report.summary.warnings],
          ['Missing artifacts', report.summary.missingArtifacts],
          ['Human proof', report.summary.humanProofCount],
          ['Review pending', report.summary.humanReviewPending],
        ].map(([name, value]) => (
          <div key={String(name)} className="rounded border border-slate-200 bg-white p-4">
            <dt className="text-sm text-slate-600">{name}</dt>
            <dd className="mt-1 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Private exports</h2>
        <ReportExportControls workspaceId={workspaceId} snapshotId={reportId} />
        {artifacts.length ? (
          <ul className="mt-3 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {artifacts.map((artifact) => (
              <li key={artifact.id} className="space-y-2 p-3">
                <div>
                  <span className="font-medium">{artifact.normalized_filename}</span>
                  <span className="ml-2 text-sm text-slate-600">
                    {artifact.format}
                    {artifact.dataset ? ` · ${artifact.dataset}` : ''} · generation{' '}
                    {artifact.generation} · {artifact.content_length} bytes
                  </span>
                </div>
                <p className="break-all text-xs text-slate-500">
                  SHA-256 {artifact.sha256} · retained until{' '}
                  {new Date(artifact.retention_until).toLocaleString()}
                </p>
                <ExportArtifactControls
                  workspaceId={workspaceId}
                  artifactId={artifact.id}
                  status={artifact.status}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No exports generated.</p>
        )}
      </section>

      <section className="mt-8" id="blockers">
        <h2 className="mb-3 text-lg font-semibold">Critical and blocking issues</h2>
        {filteredBlockers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Phase</th>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Issue</th>
                  <th className="p-2">Workflow</th>
                  <th className="p-2">Human review</th>
                  <th className="p-2">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filteredBlockers).map((item) => (
                  <tr key={item.stableId} className="border-b align-top">
                    <td className="p-2">{item.sourcePhase}</td>
                    <td className="p-2">{item.severity}</td>
                    <td className="p-2">
                      <strong>{item.title}</strong>
                      <p className="text-slate-600">{item.explanation}</p>
                    </td>
                    <td className="p-2">{label(item.workflowState)}</td>
                    <td className="p-2">{label(item.humanReviewState)}</td>
                    <td className="p-2">
                      <Link
                        href={item.navigationReference}
                        className="text-blue-700 hover:underline"
                      >
                        Open linked record
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            No critical or blocking issues match the filters.
          </p>
        )}
      </section>

      <section className="mt-8" id="unresolved">
        <h2 className="mb-3 text-lg font-semibold">Unresolved findings</h2>
        <ul className="space-y-2">
          {paginate(filteredUnresolved).map((item) => (
            <li key={item.stableId} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{item.title}</strong>
                <span className="text-sm">
                  {item.sourcePhase} · {label(item.humanState)}
                </span>
              </div>
              <p className="text-sm text-slate-600">{item.reason}</p>
              <Link
                href={item.navigationReference}
                className="text-sm text-blue-700 hover:underline"
              >
                Inspect source record
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" id="missing-artifacts">
        <h2 className="mb-3 text-lg font-semibold">Missing or rejected artifacts</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Item</th>
                <th className="p-2">Artifact</th>
                <th className="p-2">State</th>
                <th className="p-2">Owner</th>
                <th className="p-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {report.missingArtifacts.map((item) => (
                <tr key={`${item.checklistItemId}:${item.artifactType}`} className="border-b">
                  <td className="p-2">
                    <Link
                      href={`/w/${workspaceId}/checklist/${item.checklistItemId}`}
                      className="text-blue-700 hover:underline"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="p-2">{label(item.artifactType)}</td>
                  <td className="p-2">{label(item.artifactState)}</td>
                  <td className="p-2">{item.owner ?? 'Unassigned'}</td>
                  <td className="p-2">
                    {item.sourceDocumentId && item.sourcePageNumber ? (
                      <Link
                        href={`/w/${workspaceId}/documents/${item.sourceDocumentId}?page=${item.sourcePageNumber}`}
                        className="text-blue-700 hover:underline"
                      >
                        Page {item.sourcePageNumber}
                      </Link>
                    ) : (
                      'Unavailable'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" id="requirements">
        <h2 className="mb-3 text-lg font-semibold">Phase 4 source requirements</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Requirement</th>
                <th className="p-2">Support</th>
                <th className="p-2">Precedence</th>
                <th className="p-2">Proof</th>
                <th className="p-2">Human review</th>
                <th className="p-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {paginate(
                report.requirements.filter(
                  (item) => !reviewFilter || item.humanReviewStatus === reviewFilter,
                ),
              ).map((item) => (
                <tr key={item.findingId} className="border-b align-top">
                  <td className="p-2">
                    <Link
                      href={`/w/${workspaceId}/requirements/${item.candidateId}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="p-2">{label(item.sourceSupportStatus)}</td>
                  <td className="p-2">{label(item.precedenceStatus)}</td>
                  <td className="p-2">{label(item.proofRequirement)}</td>
                  <td className="p-2">{label(item.humanReviewStatus)}</td>
                  <td className="p-2">
                    {item.exactQuote ?? 'Unavailable'}
                    {item.documentId && item.pageNumber ? (
                      <>
                        <br />
                        <Link
                          href={`/w/${workspaceId}/documents/${item.documentId}?page=${item.pageNumber}`}
                          className="text-blue-700 hover:underline"
                        >
                          Original page {item.pageNumber}
                        </Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" id="checklist">
        <h2 className="mb-3 text-lg font-semibold">Checklist detail</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Requirement</th>
                <th className="p-2">Category</th>
                <th className="p-2">Workflow</th>
                <th className="p-2">Source / precedence</th>
                <th className="p-2">Proof / review</th>
              </tr>
            </thead>
            <tbody>
              {report.checklistItems.map((item) => (
                <tr key={item.id} className="border-b align-top">
                  <td className="p-2">
                    <Link
                      href={`/w/${workspaceId}/checklist/${item.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-1 max-w-md text-xs text-slate-600">{item.sourceQuote}</p>
                  </td>
                  <td className="p-2">{label(item.category)}</td>
                  <td className="p-2">
                    {label(item.workflowStatus)}
                    <br />
                    <span className="text-xs">artifact: {label(item.artifactState)}</span>
                  </td>
                  <td className="p-2">
                    {label(item.sourceSupportStatus)} / {label(item.precedenceStatus)}
                    {item.sourceDocumentId && item.sourcePageNumber ? (
                      <>
                        <br />
                        <Link
                          href={`/w/${workspaceId}/documents/${item.sourceDocumentId}?page=${item.sourcePageNumber}`}
                          className="text-blue-700 hover:underline"
                        >
                          Original page {item.sourcePageNumber}
                        </Link>
                      </>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {label(item.proofRequirement)} / {label(item.humanReviewStatus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" id="proposal-findings">
        <h2 className="mb-3 text-lg font-semibold">Proposal findings</h2>
        <ul className="space-y-2">
          {paginate(filteredProposalFindings).map((finding) => (
            <li
              id={`finding-${finding.id}`}
              key={finding.id}
              className="rounded border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{finding.title}</strong>
                <span className="text-sm">
                  {finding.severity} · {label(finding.workflowStatus)} · human{' '}
                  {label(finding.humanResolutionStatus)}
                </span>
              </div>
              <p className="text-sm text-slate-600">{finding.detail}</p>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-medium">Proposal evidence</dt>
                  <dd>
                    {finding.proposalQuote ?? 'Not applicable'}
                    {finding.proposalPageNumber ? ` · page ${finding.proposalPageNumber}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Requirement evidence</dt>
                  <dd>
                    {finding.sourceQuote ?? 'Not applicable'}
                    {finding.sourceDocumentId && finding.sourcePageNumber ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link
                          href={`/w/${workspaceId}/documents/${finding.sourceDocumentId}?page=${finding.sourcePageNumber}`}
                          className="text-blue-700 hover:underline"
                        >
                          page {finding.sourcePageNumber}
                        </Link>
                      </>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" id="proposal-claims">
        <h2 className="mb-3 text-lg font-semibold">Atomic proposal claims</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Claim</th>
                <th className="p-2">Type</th>
                <th className="p-2">Support</th>
                <th className="p-2">Consistency</th>
                <th className="p-2">Page</th>
                <th className="p-2">Evidence count</th>
              </tr>
            </thead>
            <tbody>
              {paginate(report.proposalClaims).map((claim) => (
                <tr key={claim.id} className="border-b align-top">
                  <td className="p-2">{claim.text}</td>
                  <td className="p-2">{label(claim.claimType)}</td>
                  <td className="p-2">{label(claim.supportStatus)}</td>
                  <td className="p-2">{label(claim.consistencyStatus)}</td>
                  <td className="p-2">{claim.pageNumber}</td>
                  <td className="p-2">{claim.evidenceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav aria-label="Filtered report pages" className="mt-6 flex gap-3 text-sm">
        {rowPage > 1 ? (
          <Link href={filterHref(rowPage - 1)} className="text-blue-700 hover:underline">
            ← Previous rows
          </Link>
        ) : null}
        {[filteredBlockers.length, filteredUnresolved.length, filteredProposalFindings.length].some(
          (count) => count > rowPage * rowLimit,
        ) ? (
          <Link href={filterHref(rowPage + 1)} className="text-blue-700 hover:underline">
            Next rows →
          </Link>
        ) : null}
      </nav>

      <section className="mt-8" id="coverage">
        <h2 className="mb-3 text-lg font-semibold">Source coverage and review denominators</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(report.sourceCoverage)
            .filter(([, value]) => typeof value === 'object')
            .map(([name, value]) => {
              const ratio = value as {
                numerator: number;
                denominator: number;
                ratio: number | null;
                denominatorDescription: string;
              };
              return (
                <div key={name} className="rounded border border-slate-200 bg-white p-3">
                  <h3 className="font-medium">{label(name)}</h3>
                  <p className="text-lg">
                    {ratio.numerator} / {ratio.denominator}
                    {ratio.ratio === null
                      ? ' · not applicable'
                      : ` · ${(ratio.ratio * 100).toFixed(0)}%`}
                  </p>
                  <p className="text-xs text-slate-600">{ratio.denominatorDescription}</p>
                </div>
              );
            })}
        </div>
      </section>

      <section
        className="mt-8 rounded border border-slate-200 bg-slate-50 p-4 text-sm"
        id="provenance"
      >
        <h2 className="font-semibold">Provenance</h2>
        <dl className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <dt>Input hash</dt>
            <dd className="break-all font-mono text-xs">{report.inputHash}</dd>
          </div>
          <div>
            <dt>Source snapshot</dt>
            <dd>{new Date(report.provenance.sourceSnapshotAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Report versions</dt>
            <dd>{Object.values(report.provenance.reportVersions).join(' · ')}</dd>
          </div>
          <div>
            <dt>Provider use</dt>
            <dd>{report.provenance.providerUseStatement}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
