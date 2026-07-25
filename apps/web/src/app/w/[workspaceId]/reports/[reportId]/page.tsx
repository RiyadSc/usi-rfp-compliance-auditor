import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reportSnapshotSchema } from '@usi/domain';
import { z } from 'zod';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { StatusBadge } from '@/components/status-badge';
import { BrandSeal, EmptyStateArt } from '@/components/brand';
import { businessLabel, phaseLabel } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createPreparedDemoLinkResolver } from '@/lib/reporting/prepared-demo-links';
import { ExportArtifactControls, ReportExportControls } from '../report-controls';

const label = businessLabel;

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
  const preparedLinks = createPreparedDemoLinkResolver({ workspaceId, reportId, report });
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
  const requiredProgressPercent = report.summary.requiredItems
    ? Math.round((report.summary.completedRequiredItems / report.summary.requiredItems) * 100)
    : 0;
  const blockingTotal = report.summary.criticalBlockers + report.summary.blockingIssues;
  return (
    <main className="page-shell">
      {report.demoWatermark ? (
        <div
          className="notice notice-warning mb-6 text-center text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-warning-400"
          role="status"
        >
          {report.demoWatermark}
        </div>
      ) : null}
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="reports"
        compact
      />
      <Link href={`/w/${workspaceId}/reports`} className="action-link no-print text-sm">
        ← Final review history
      </Link>
      <div className="page-header mt-5">
        <div>
          <p className="page-eyebrow">Executive final review</p>
          <h1 className="page-title mt-2">{label(report.reportType)} report</h1>
          <p className="text-metadata mt-3">
            Generated <span className="tabular">{new Date(row.generated_at).toLocaleString()}</span>{' '}
            · revision <span className="tabular">{report.summary.proposalRevision}</span>
          </p>
        </div>
        <StatusBadge value="pending" label="Human decisions remain separate" tone="warning" />
      </div>
      <p className="notice notice-info">{report.provenance.humanReviewDisclaimer}</p>

      <nav
        aria-label="Report sections"
        className="stage-nav no-print sticky top-0 z-10 mt-6 bg-canvas-900/85 backdrop-blur"
      >
        <div className="flex min-w-max gap-1">
          {[
            ['#decision-brief', 'Decision brief'],
            ['#blockers', 'Top issues'],
            ['#unresolved', 'Needs review'],
            ['#missing-artifacts', 'Missing evidence'],
            ['#proposal-findings', 'Draft issues'],
            ['#coverage', 'Source coverage'],
            ['#exports', 'Exports'],
          ].map(([href, text]) => (
            <a key={href} href={href} className="stage-nav-item">
              {text}
            </a>
          ))}
        </div>
      </nav>

      <section id="decision-brief" className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="hero-panel texture-halftone p-6 lg:p-8">
          <BrandSeal
            size={224}
            className="pointer-events-none absolute -right-10 -top-14 text-mist-100 opacity-[0.07]"
          />
          <div className="relative">
            <p className="section-kicker">Bid status</p>
            <h2 className="mt-3 text-[1.9rem] font-medium leading-[1.08] tracking-[-0.035em] text-ink">
              {label(report.summary.readinessState)}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
              <span className="tabular font-semibold text-ink">{requiredProgressPercent}</span>% of
              required tasks are complete ·{' '}
              <span
                className={`tabular font-semibold ${blockingTotal ? 'text-critical-400' : 'text-ink'}`}
              >
                {blockingTotal}
              </span>{' '}
              blocking issues require attention.
            </p>
            <div className="progress-track mt-5 max-w-xs" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${requiredProgressPercent}%` }} />
            </div>
            <a href="#blockers" className="primary-action mt-6">
              Review top issues →
            </a>
          </div>
        </div>
        <div className="surface-card p-6">
          <p className="section-kicker">Decisions needed</p>
          <ul className="mt-3 text-sm text-ink-soft">
            <li className="flex items-baseline gap-3 border-b border-line-subtle py-3 last:border-0 last:pb-0">
              <strong className="tabular text-[1.375rem] font-medium leading-none text-ink">
                {report.summary.humanReviewPending}
              </strong>{' '}
              <span>machine assessments await team review.</span>
            </li>
            <li className="flex items-baseline gap-3 border-b border-line-subtle py-3 last:border-0 last:pb-0">
              <strong className="tabular text-[1.375rem] font-medium leading-none text-ink">
                {report.summary.humanProofCount}
              </strong>{' '}
              <span>items require company evidence.</span>
            </li>
            <li className="flex items-baseline gap-3 border-b border-line-subtle py-3 last:border-0 last:pb-0">
              <strong className="tabular text-[1.375rem] font-medium leading-none text-ink">
                {report.summary.missingArtifacts}
              </strong>{' '}
              <span>required artifacts are missing.</span>
            </li>
          </ul>
        </div>
      </section>

      <form
        className="filter-bar analyst-only no-print mt-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
        method="get"
      >
        <label className="field">
          <span className="field-label">Phase</span>
          <select name="phase" defaultValue={phaseFilter}>
            <option value="">All</option>
            <option value="phase4">RFP requirement review</option>
            <option value="phase5">Submission planning</option>
            <option value="phase6">Proposal draft review</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Severity</span>
          <select name="severity" defaultValue={severityFilter}>
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="blocking">Blocking</option>
            <option value="warning">Warning</option>
            <option value="informational">Informational</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Human review</span>
          <select name="review" defaultValue={reviewFilter}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="needs_follow_up">Needs follow-up</option>
            <option value="waived">Waived</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Finding type</span>
          <input name="type" defaultValue={typeFilter} maxLength={100} />
        </label>
        <button className="secondary-action">Apply filters</button>
      </form>

      <section
        className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Executive summary"
      >
        {(
          [
            ['Readiness', label(report.summary.readinessState)],
            [
              'Required progress',
              `${report.summary.completedRequiredItems} of ${report.summary.requiredItems}`,
            ],
            ['Critical blockers', report.summary.criticalBlockers, true],
            ['Blocking issues', report.summary.blockingIssues, true],
            ['Warnings', report.summary.warnings],
            ['Missing artifacts', report.summary.missingArtifacts],
            ['Human proof', report.summary.humanProofCount],
            ['Review pending', report.summary.humanReviewPending],
          ] as Array<[string, string | number, boolean?]>
        ).map(([name, value, urgent]) => (
          <div key={String(name)} className="metric-card">
            <dt className="metric-label">{name}</dt>
            <dd
              className={`metric-value ${urgent && Number(value) > 0 ? 'text-critical-400' : ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </section>

      <details id="exports" className="disclosure mt-10" open>
        <summary className="font-semibold text-ink">Export and download options</summary>
        <div className="disclosure-body">
          <h2 className="section-title mb-4">Private exports</h2>
          <ReportExportControls workspaceId={workspaceId} snapshotId={reportId} />
          {artifacts.length ? (
            <ul className="surface-panel mt-4 divide-y divide-line-subtle">
              {artifacts.map((artifact) => {
                const inactive = artifact.status !== 'active';
                return (
                  <li key={artifact.id} className="space-y-2.5 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`font-medium ${inactive ? 'text-ink-faint' : 'text-ink'}`}>
                        {artifact.normalized_filename}
                      </span>
                      <span className={`text-metadata ${inactive ? 'text-ink-faint' : ''}`}>
                        {artifact.format}
                        {artifact.dataset ? ` · ${artifact.dataset}` : ''} · generation{' '}
                        {artifact.generation} · {artifact.content_length} bytes
                      </span>
                    </div>
                    <p
                      className={`mono break-all text-[0.6875rem] ${inactive ? 'text-ink-faint' : 'text-ink-muted'}`}
                    >
                      SHA-256 {artifact.sha256} · retained until{' '}
                      {new Date(artifact.retention_until).toLocaleString()}
                    </p>
                    <ExportArtifactControls
                      workspaceId={workspaceId}
                      artifactId={artifact.id}
                      status={artifact.status}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-metadata mt-4">No exports generated.</p>
          )}
        </div>
      </details>

      <section className="mt-10" id="blockers">
        <h2 className="section-title mb-4">Critical and blocking issues</h2>
        {filteredBlockers.length ? (
          <div className="data-frame">
            <div className="data-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Issue</th>
                    <th scope="col">Workflow</th>
                    <th scope="col">Human review</th>
                    <th scope="col">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {paginate(filteredBlockers).map((item) => (
                    <tr key={item.stableId}>
                      <td className={item.severity === 'critical' ? 'rail-critical' : ''}>
                        {phaseLabel(item.sourcePhase)}
                      </td>
                      <td>
                        <StatusBadge value={item.severity} />
                      </td>
                      <td className="max-w-[26rem]">
                        <strong className="cell-primary">{item.title}</strong>
                        <p className="text-metadata mt-1">{item.explanation}</p>
                      </td>
                      <td>
                        <StatusBadge value={item.workflowState} />
                      </td>
                      <td>
                        <StatusBadge value={item.humanReviewState} />
                      </td>
                      <td>
                        <Link
                          href={preparedLinks.navigationReference(item.navigationReference)}
                          aria-label="Open linked record"
                          className="action-link"
                        >
                          Review issue and evidence
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <EmptyStateArt />
            <p className="empty-state-body">No critical or blocking issues match the filters.</p>
          </div>
        )}
      </section>

      <section className="mt-10" id="unresolved">
        <h2 className="section-title mb-4">Unresolved findings</h2>
        <ul className="grid gap-3">
          {paginate(filteredUnresolved).map((item) => (
            <li key={item.stableId} className="surface-panel rail-warning p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <strong className="text-ink">{item.title}</strong>
                <span className="text-metadata">
                  {phaseLabel(item.sourcePhase)} · {label(item.humanState)}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{item.reason}</p>
              <Link
                href={preparedLinks.navigationReference(item.navigationReference)}
                className="action-link mt-3 inline-block text-sm"
              >
                Inspect source record
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" id="missing-artifacts">
        <h2 className="section-title mb-4">Missing or rejected artifacts</h2>
        <div className="data-frame">
          <div className="data-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Artifact</th>
                  <th scope="col">State</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {report.missingArtifacts.map((item) => (
                  <tr key={`${item.checklistItemId}:${item.artifactType}`}>
                    <td className="max-w-[24rem]">
                      <Link
                        href={`/w/${workspaceId}/checklist/${preparedLinks.checklistId(item.checklistItemId)}`}
                        className="action-link"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td>{label(item.artifactType)}</td>
                    <td>{label(item.artifactState)}</td>
                    <td>{item.owner ?? 'Unassigned'}</td>
                    <td>
                      {item.sourceDocumentId && item.sourcePageNumber ? (
                        <Link
                          href={`/w/${workspaceId}/documents/${preparedLinks.sourceDocumentId(item.sourceDocumentId)}?page=${item.sourcePageNumber}`}
                          className="locator"
                        >
                          Page {item.sourcePageNumber}
                        </Link>
                      ) : (
                        <span className="text-ink-faint">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-10" id="requirements">
        <h2 className="section-title mb-4">Phase 4 source requirements</h2>
        <div className="data-frame">
          <div className="data-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Support</th>
                  <th scope="col">Precedence</th>
                  <th scope="col">Proof</th>
                  <th scope="col">Human review</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {paginate(
                  report.requirements.filter(
                    (item) => !reviewFilter || item.humanReviewStatus === reviewFilter,
                  ),
                ).map((item) => (
                  <tr key={item.findingId}>
                    <td className="max-w-[20rem]">
                      <Link
                        href={`/w/${workspaceId}/requirements/${preparedLinks.candidateId(item.candidateId)}`}
                        className="action-link"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td>{label(item.sourceSupportStatus)}</td>
                    <td>{label(item.precedenceStatus)}</td>
                    <td>{label(item.proofRequirement)}</td>
                    <td>{label(item.humanReviewStatus)}</td>
                    <td className="max-w-[26rem]">
                      <span className={item.exactQuote ? 'evidence-quote block' : 'text-ink-faint'}>
                        {item.exactQuote ?? 'Unavailable'}
                      </span>
                      {item.documentId && item.pageNumber ? (
                        <Link
                          href={`/w/${workspaceId}/documents/${preparedLinks.sourceDocumentId(item.documentId)}?page=${item.pageNumber}`}
                          className="locator mt-2"
                        >
                          Original page {item.pageNumber}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-10" id="checklist">
        <h2 className="section-title mb-4">Checklist detail</h2>
        <div className="data-frame">
          <div className="data-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Category</th>
                  <th scope="col">Workflow</th>
                  <th scope="col">Source / precedence</th>
                  <th scope="col">Proof / review</th>
                </tr>
              </thead>
              <tbody>
                {report.checklistItems.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[24rem]">
                      <Link
                        href={`/w/${workspaceId}/checklist/${preparedLinks.checklistId(item.id)}`}
                        className="action-link"
                      >
                        {item.title}
                      </Link>
                      {item.sourceQuote ? (
                        <p className="evidence-quote mt-2 max-w-md">{item.sourceQuote}</p>
                      ) : null}
                    </td>
                    <td>{label(item.category)}</td>
                    <td>
                      {label(item.workflowStatus)}
                      <p className="text-metadata mt-1">artifact: {label(item.artifactState)}</p>
                    </td>
                    <td>
                      {label(item.sourceSupportStatus)} / {label(item.precedenceStatus)}
                      {item.sourceDocumentId && item.sourcePageNumber ? (
                        <Link
                          href={`/w/${workspaceId}/documents/${preparedLinks.sourceDocumentId(item.sourceDocumentId)}?page=${item.sourcePageNumber}`}
                          className="locator mt-2"
                        >
                          Original page {item.sourcePageNumber}
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      {label(item.proofRequirement)} / {label(item.humanReviewStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-10" id="proposal-findings">
        <h2 className="section-title mb-4">Proposal findings</h2>
        <ul className="grid gap-3">
          {paginate(filteredProposalFindings).map((finding) => (
            <li
              id={`finding-${preparedLinks.findingId(finding.id)}`}
              key={finding.id}
              className="surface-card p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <strong className="text-ink">{finding.title}</strong>
                <span className="text-metadata">
                  {finding.severity} · {label(finding.workflowStatus)} · human{' '}
                  {label(finding.humanResolutionStatus)}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{finding.detail}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-metadata">Proposal evidence</dt>
                  <dd className="mt-1.5">
                    <span
                      className={
                        finding.proposalQuote
                          ? 'evidence-quote evidence-quote-proposal block'
                          : 'text-ink-faint'
                      }
                    >
                      {finding.proposalQuote ?? 'Not applicable'}
                    </span>
                    {finding.proposalPageNumber ? (
                      <p className="text-metadata mt-2">page {finding.proposalPageNumber}</p>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-metadata">Requirement evidence</dt>
                  <dd className="mt-1.5">
                    <span
                      className={finding.sourceQuote ? 'evidence-quote block' : 'text-ink-faint'}
                    >
                      {finding.sourceQuote ?? 'Not applicable'}
                    </span>
                    {finding.sourceDocumentId && finding.sourcePageNumber ? (
                      <Link
                        href={`/w/${workspaceId}/documents/${preparedLinks.sourceDocumentId(finding.sourceDocumentId)}?page=${finding.sourcePageNumber}`}
                        className="locator mt-2"
                      >
                        page {finding.sourcePageNumber}
                      </Link>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" id="proposal-claims">
        <h2 className="section-title mb-4">Atomic proposal claims</h2>
        <div className="data-frame">
          <div className="data-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Claim</th>
                  <th scope="col">Type</th>
                  <th scope="col">Support</th>
                  <th scope="col">Consistency</th>
                  <th scope="col">Page</th>
                  <th scope="col">Evidence count</th>
                </tr>
              </thead>
              <tbody>
                {paginate(report.proposalClaims).map((claim) => (
                  <tr key={claim.id}>
                    <td className="max-w-[28rem] cell-primary">{claim.text}</td>
                    <td>{label(claim.claimType)}</td>
                    <td>{label(claim.supportStatus)}</td>
                    <td>{label(claim.consistencyStatus)}</td>
                    <td className="cell-numeric tabular">{claim.pageNumber}</td>
                    <td className="cell-numeric tabular">{claim.evidenceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <nav aria-label="Filtered report pages" className="mt-6 flex gap-3 text-sm">
        {rowPage > 1 ? (
          <Link href={filterHref(rowPage - 1)} className="action-link">
            ← Previous rows
          </Link>
        ) : null}
        {[filteredBlockers.length, filteredUnresolved.length, filteredProposalFindings.length].some(
          (count) => count > rowPage * rowLimit,
        ) ? (
          <Link href={filterHref(rowPage + 1)} className="action-link">
            Next rows →
          </Link>
        ) : null}
      </nav>

      <section className="mt-10" id="coverage">
        <h2 className="section-title mb-4">Source coverage and review denominators</h2>
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
                <div key={name} className="metric-card">
                  <h3 className="metric-label">{label(name)}</h3>
                  <p className="metric-value">
                    <span className="tabular">
                      {ratio.numerator} / {ratio.denominator}
                    </span>
                    {ratio.ratio === null
                      ? ' · not applicable'
                      : ` · ${(ratio.ratio * 100).toFixed(0)}%`}
                  </p>
                  <p className="text-metadata mt-2">{ratio.denominatorDescription}</p>
                </div>
              );
            })}
        </div>
      </section>

      <section className="surface-panel mt-10 p-5 text-sm" id="provenance">
        <h2 className="section-title">Provenance</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-metadata">Input hash</dt>
            <dd className="mono mt-1 break-all text-[0.6875rem] text-ink-muted">
              {report.inputHash}
            </dd>
          </div>
          <div>
            <dt className="text-metadata">Source snapshot</dt>
            <dd className="mt-1 text-ink-soft tabular">
              {new Date(report.provenance.sourceSnapshotAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-metadata">Report versions</dt>
            <dd className="mt-1 text-ink-soft">
              {Object.values(report.provenance.reportVersions).join(' · ')}
            </dd>
          </div>
          <div>
            <dt className="text-metadata">Provider use</dt>
            <dd className="mt-1 text-ink-soft">{report.provenance.providerUseStatement}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
