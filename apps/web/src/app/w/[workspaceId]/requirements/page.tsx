import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge, StatusAxis } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { EmptyStateArt } from '@/components/brand';
import { IconSearch } from '@/components/icons';
import { businessLabel } from '@/lib/presentation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();

type FindingRow = {
  id: string;
  candidate_id: string;
  source_support_status: string;
  precedence_status: string;
  proof_requirement: string;
  created_at: string;
  verification_run_id: string;
};

export default async function RequirementsPage({
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
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: candidates } = await supabase
    .from('requirement_candidates')
    .select(
      'id, analysis_run_id, category, title, obligation, mandatory_class, preliminary_page, document_id, created_at',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
  const documentIds = [...new Set((candidates ?? []).map((candidate) => candidate.document_id))];
  const { data: documents } = documentIds.length
    ? await supabase
        .from('documents')
        .select('id, normalized_filename')
        .eq('workspace_id', workspaceId)
        .in('id', documentIds)
    : { data: [] };
  const documentNames = new Map(
    (documents ?? []).map((document) => [document.id, document.normalized_filename]),
  );
  const { data: findings } = candidateIds.length
    ? await supabase
        .from('verification_findings')
        .select(
          'id, candidate_id, source_support_status, precedence_status, proof_requirement, created_at, verification_run_id',
        )
        .eq('workspace_id', workspaceId)
        .in('candidate_id', candidateIds)
        .order('finding_version', { ascending: false })
    : { data: [] };
  const latest = new Map<string, FindingRow>();
  for (const finding of findings ?? [])
    if (!latest.has(finding.candidate_id)) latest.set(finding.candidate_id, finding as FindingRow);
  const findingIds = [...latest.values()].map((finding) => finding.id);
  const { data: decisions } = findingIds.length
    ? await supabase
        .from('human_review_decisions')
        .select('finding_id, decision, created_at')
        .eq('workspace_id', workspaceId)
        .in('finding_id', findingIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const reviews = new Map<string, string>();
  for (const decision of decisions ?? [])
    if (!reviews.has(decision.finding_id)) reviews.set(decision.finding_id, decision.decision);
  const sourceFilter = typeof filters.source === 'string' ? filters.source : '';
  const precedenceFilter = typeof filters.precedence === 'string' ? filters.precedence : '';
  const proofFilter = typeof filters.proof === 'string' ? filters.proof : '';
  const categoryFilter = typeof filters.category === 'string' ? filters.category : '';
  const mandatoryFilter = typeof filters.mandatory === 'string' ? filters.mandatory : '';
  const reviewFilter = typeof filters.review === 'string' ? filters.review : '';
  const queryFilter =
    typeof filters.q === 'string' ? filters.q.trim().toLowerCase().slice(0, 120) : '';
  const attentionOnly = filters.attention === 'yes';
  const rows = (candidates ?? []).filter((candidate) => {
    const finding = latest.get(candidate.id);
    const review = finding ? (reviews.get(finding.id) ?? 'pending') : 'pending';
    return (
      (!sourceFilter || finding?.source_support_status === sourceFilter) &&
      (!precedenceFilter || finding?.precedence_status === precedenceFilter) &&
      (!proofFilter || finding?.proof_requirement === proofFilter) &&
      (!categoryFilter || candidate.category === categoryFilter) &&
      (!mandatoryFilter || candidate.mandatory_class === mandatoryFilter) &&
      (!reviewFilter || review === reviewFilter) &&
      (!queryFilter ||
        candidate.title.toLowerCase().includes(queryFilter) ||
        candidate.obligation.toLowerCase().includes(queryFilter) ||
        candidate.category.toLowerCase().includes(queryFilter)) &&
      (!attentionOnly ||
        !finding ||
        finding.source_support_status !== 'supported' ||
        finding.precedence_status !== 'active' ||
        review === 'pending')
    );
  });
  const latestRun = (findings ?? [])[0]?.verification_run_id;
  const { data: verificationRun } = latestRun
    ? await supabase
        .from('verification_runs')
        .select('status, model, reasoning_effort, created_at')
        .eq('id', latestRun)
        .maybeSingle()
    : { data: null };

  const latestRows = [...latest.values()];
  const needsAttention = latestRows.filter(
    (finding) =>
      finding.source_support_status !== 'supported' || finding.precedence_status !== 'active',
  ).length;
  const companyProof = latestRows.filter(
    (finding) => finding.proof_requirement !== 'none_identified',
  ).length;
  const pendingReviews = latestRows.filter(
    (finding) => (reviews.get(finding.id) ?? 'pending') === 'pending',
  ).length;

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="requirements"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Opportunity requirements</p>
          <h1 aria-label="Requirement register" className="page-title mt-2">
            Requirements
          </h1>
          <p className="page-lede mt-3">
            Understand what the RFP requires, whether it is still current, what company evidence is
            needed, and whether your team has reviewed it.
          </p>
        </div>
        {verificationRun ? (
          <p className="analyst-only surface-panel mono px-3 py-2 text-xs text-ink-muted">
            Latest verification: {verificationRun.status} · {verificationRun.model ?? 'mock'} ·
            reasoning {verificationRun.reasoning_effort ?? 'n/a'}
          </p>
        ) : null}
      </div>

      <section
        aria-label="Requirement summary"
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Summary
          label="Requirements identified"
          value={candidates?.length ?? 0}
          note="Immutable extraction candidates"
        />
        <Summary
          label="Needs attention"
          value={needsAttention}
          note="Source or current-version issue"
          tone={needsAttention ? 'warning' : 'positive'}
        />
        <Summary
          label="Company evidence needed"
          value={companyProof}
          note="Proof remains separate from source support"
          tone={companyProof ? 'info' : 'neutral'}
        />
        <Summary
          label="Team reviews pending"
          value={pendingReviews}
          note="Machine-supported is not human-approved"
          tone={pendingReviews ? 'warning' : 'positive'}
        />
      </section>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Saved requirement views">
        <Preset
          href={`/w/${workspaceId}/requirements`}
          active={
            !attentionOnly && !sourceFilter && !precedenceFilter && !proofFilter && !reviewFilter
          }
        >
          All requirements
        </Preset>
        <Preset href={`/w/${workspaceId}/requirements?attention=yes`} active={attentionOnly}>
          Needs attention
        </Preset>
        <Preset
          href={`/w/${workspaceId}/requirements?mandatory=mandatory`}
          active={mandatoryFilter === 'mandatory'}
        >
          Mandatory
        </Preset>
        <Preset
          href={`/w/${workspaceId}/requirements?precedence=superseded`}
          active={precedenceFilter === 'superseded'}
        >
          Changed by addendum
        </Preset>
        <Preset
          href={`/w/${workspaceId}/requirements?proof=requires_company_artifact`}
          active={proofFilter === 'requires_company_artifact'}
        >
          Company evidence needed
        </Preset>
        <Preset
          href={`/w/${workspaceId}/requirements?review=pending`}
          active={reviewFilter === 'pending'}
        >
          Team review pending
        </Preset>
      </div>
      <form method="get" className="filter-bar mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="field-label sm:col-span-3 lg:col-span-6">
          Search requirements
          <span className="search-field mt-1.5 block">
            <IconSearch size={16} />
            <input
              name="q"
              defaultValue={queryFilter}
              placeholder="Form number, deadline, insurance, meeting…"
            />
          </span>
        </label>
        <Filter
          name="category"
          label="Category"
          value={categoryFilter}
          options={[...new Set((candidates ?? []).map((c) => c.category))]}
        />
        <Filter
          name="source"
          label="Source status"
          value={sourceFilter}
          options={[
            'supported',
            'partially_supported',
            'unsupported',
            'contradicted',
            'parser_uncertain',
          ]}
        />
        <Filter
          name="precedence"
          label="Precedence"
          value={precedenceFilter}
          options={['active', 'superseded', 'conflicting', 'undetermined']}
        />
        <Filter
          name="proof"
          label="Proof"
          value={proofFilter}
          options={[
            'none_identified',
            'requires_human_confirmation',
            'requires_company_artifact',
            'requires_external_validation',
            'undetermined',
          ]}
        />
        <Filter
          name="mandatory"
          label="Mandatory"
          value={mandatoryFilter}
          options={['mandatory', 'optional', 'uncertain']}
        />
        <Filter
          name="review"
          label="Review"
          value={reviewFilter}
          options={['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived']}
        />
        <div className="sm:col-span-3 lg:col-span-6 flex flex-wrap items-center gap-3">
          <button className="primary-action btn-sm">Apply filters</button>
          <Link href={`/w/${workspaceId}/requirements`} className="tertiary-action btn-sm">
            Clear
          </Link>
        </div>
      </form>
      <div className="data-frame">
        <div className="data-scroll">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                {[
                  'Requirement',
                  'Category',
                  'Mandatory',
                  'RFP status',
                  'Evidence needed',
                  'Source',
                  'Team review',
                ].map((head) => (
                  <th scope="col" key={head}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((candidate) => {
                const finding = latest.get(candidate.id);
                const review = finding ? (reviews.get(finding.id) ?? 'pending') : 'pending';
                return (
                  <tr key={candidate.id}>
                    <td className="max-w-sm">
                      <Link
                        className="cell-primary hover:text-teal-300"
                        href={`/w/${workspaceId}/requirements/${candidate.id}`}
                      >
                        {candidate.title}
                      </Link>
                      <p className="text-metadata mt-1.5 line-clamp-2">{candidate.obligation}</p>
                    </td>
                    <td className="whitespace-nowrap">{businessLabel(candidate.category)}</td>
                    <td>
                      <StatusBadge value={candidate.mandatory_class} />
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge value={finding?.source_support_status ?? 'pending'} />
                        <StatusBadge value={finding?.precedence_status ?? 'undetermined'} />
                      </div>
                    </td>
                    <td>
                      <StatusBadge value={finding?.proof_requirement ?? 'undetermined'} />
                    </td>
                    <td>
                      <span className="locator">
                        {documentNames.get(candidate.document_id) ?? 'Source document'} · page{' '}
                        {candidate.preliminary_page}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={review} />
                      <span className="analyst-only text-metadata tabular mt-1.5 block whitespace-nowrap">
                        Updated{' '}
                        {new Date(finding?.created_at ?? candidate.created_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length ? (
          <div className="empty-state border-0 bg-transparent">
            <EmptyStateArt />
            <p className="empty-state-body">No requirements match these filters.</p>
          </div>
        ) : null}
      </div>

      <section className="mt-8 grid gap-3 md:grid-cols-4" aria-label="Status guide">
        <StatusAxis
          label="RFP evidence"
          value="supported"
          help="Does the source document support this requirement?"
        />
        <StatusAxis
          label="Current version"
          value="active"
          help="Is this the instruction that currently applies after addenda?"
        />
        <StatusAxis
          label="Company evidence"
          value="requires_company_artifact"
          help="What certificate, license, or company record will the response need?"
        />
        <StatusAxis
          label="Team review"
          value="pending"
          help="Has an authorized person reviewed the machine assessment?"
        />
      </section>
    </main>
  );
}

function Filter({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="field-label">
      {label}
      <select name={name} defaultValue={value} className="mt-1.5 block w-full">
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {businessLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Summary({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  note: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'info';
}) {
  // The value stays neutral; the supporting line carries the tone so the rail of
  // summary cards reads as one calm group.
  const noteColor =
    tone === 'warning' ? 'text-warning-400' : tone === 'info' ? 'text-info-400' : '';
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className={`metric-note ${noteColor}`}>{note}</p>
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
