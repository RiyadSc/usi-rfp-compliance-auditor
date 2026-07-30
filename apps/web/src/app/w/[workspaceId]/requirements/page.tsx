import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge, StatusAxis } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { EmptyStateArt } from '@/components/brand';
import { IconSearch } from '@/components/icons';
import { businessLabel } from '@/lib/presentation';
import {
  emptyRequirementRegister,
  loadRequirementRegister,
} from '@/lib/requirements/register-service';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const sourceStatuses = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
] as const;
const precedenceStatuses = ['active', 'superseded', 'conflicting', 'undetermined'] as const;
const proofRequirements = [
  'none_identified',
  'requires_human_confirmation',
  'requires_company_artifact',
  'requires_external_validation',
  'undetermined',
] as const;
const mandatoryClasses = ['mandatory', 'optional', 'uncertain'] as const;
const reviewStatuses = ['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived'] as const;
const registerPageSize = 50;

function allowedFilter<const Values extends readonly string[]>(
  value: string | string[] | undefined,
  allowed: Values,
): Values[number] | '' {
  if (typeof value !== 'string' || !allowed.includes(value)) return '';
  return value as Values[number];
}

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
  const sourceFilter = allowedFilter(filters.source, sourceStatuses);
  const precedenceFilter = allowedFilter(filters.precedence, precedenceStatuses);
  const proofFilter = allowedFilter(filters.proof, proofRequirements);
  const categoryFilter =
    typeof filters.category === 'string' ? filters.category.trim().slice(0, 160) : '';
  const mandatoryFilter = allowedFilter(filters.mandatory, mandatoryClasses);
  const reviewFilter = allowedFilter(filters.review, reviewStatuses);
  const queryFilter = typeof filters.q === 'string' ? filters.q.trim().slice(0, 120) : '';
  const attentionOnly = filters.attention === 'yes';
  const parsedPage = z.coerce.number().int().min(1).max(1_000_000).safeParse(filters.page);
  const page = parsedPage.success ? parsedPage.data : 1;

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: latestVerificationScope } = await supabase
    .from('verification_runs')
    .select('id,analysis_run_id,status,model,reasoning_effort,created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: latestPhase9Run } = await supabase
    .from('phase9_evaluation_runs')
    .select('id,status,created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const register = latestVerificationScope
    ? await loadRequirementRegister(supabase, {
        workspaceId,
        verificationRunId: latestVerificationScope.id,
        sourceStatus: sourceFilter,
        precedenceStatus: precedenceFilter,
        proofRequirement: proofFilter,
        category: categoryFilter,
        mandatoryClass: mandatoryFilter,
        reviewStatus: reviewFilter,
        search: queryFilter,
        attentionOnly,
        page,
        pageSize: registerPageSize,
      })
    : emptyRequirementRegister(page, registerPageSize);
  const rows = register.rows;
  const verificationRun = latestVerificationScope;
  const pageCount = Math.max(1, Math.ceil(register.total / register.pageSize));
  const requirementsHref = (targetPage: number) => {
    const search = new URLSearchParams();
    if (queryFilter) search.set('q', queryFilter);
    if (categoryFilter) search.set('category', categoryFilter);
    if (sourceFilter) search.set('source', sourceFilter);
    if (precedenceFilter) search.set('precedence', precedenceFilter);
    if (proofFilter) search.set('proof', proofFilter);
    if (mandatoryFilter) search.set('mandatory', mandatoryFilter);
    if (reviewFilter) search.set('review', reviewFilter);
    if (attentionOnly) search.set('attention', 'yes');
    if (targetPage > 1) search.set('page', String(targetPage));
    const query = search.toString();
    return `/w/${workspaceId}/requirements${query ? `?${query}` : ''}`;
  };
  if (page > pageCount) redirect(requirementsHref(pageCount));

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="requirements"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">What the solicitation requires</p>
          <h1 aria-label="Requirement register" className="page-title mt-2">
            Requirements
          </h1>
          <p className="page-lede mt-3">
            Open an obligation to see the exact RFP language it came from — then decide whether your
            team accepts that reading.
          </p>
        </div>
        {verificationRun ? (
          <p className="analyst-only surface-panel mono px-3 py-2 text-xs text-ink-muted">
            Latest verification: {verificationRun.status} · {verificationRun.model ?? 'mock'} ·
            reasoning {verificationRun.reasoning_effort ?? 'n/a'}
          </p>
        ) : null}
      </div>

      {!register.summary.totalRequirements && latestPhase9Run?.status === 'completed' ? (
        <div className="notice notice-warning mb-6">
          <strong className="notice-title">Live analysis is waiting for team review.</strong>
          <p className="mt-1">
            Machine findings do not enter this register automatically. Review the page coverage and
            source evidence, record team decisions, then publish only the accepted, source-supported
            active findings.
          </p>
          <Link href={`/w/${workspaceId}/phase9`} className="action-link mt-3 inline-flex">
            Review analysis coverage and findings →
          </Link>
        </div>
      ) : null}

      <section
        aria-label="Requirement summary"
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Summary
          label="Requirements identified"
          value={register.summary.totalRequirements}
          note="From the uploaded solicitation package"
        />
        <Summary
          label="Needs attention"
          value={register.summary.needsAttention}
          note="Source or current-version issue"
          tone={register.summary.needsAttention ? 'warning' : 'positive'}
        />
        <Summary
          label="Company evidence needed"
          value={register.summary.companyEvidenceRequired}
          note="Separate from whether the RFP backs the item"
          tone={register.summary.companyEvidenceRequired ? 'info' : 'neutral'}
        />
        <Summary
          label="Team reviews pending"
          value={register.summary.pendingReviews}
          note="Still needs a person — not submission approval"
          tone={register.summary.pendingReviews ? 'warning' : 'positive'}
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
        {attentionOnly ? <input type="hidden" name="attention" value="yes" /> : null}
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
          options={register.categories}
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
              {rows.map((candidate) => (
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
                    <StatusBadge value={candidate.mandatoryClass} />
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      <StatusBadge value={candidate.sourceSupportStatus ?? 'pending'} />
                      <StatusBadge value={candidate.precedenceStatus ?? 'undetermined'} />
                    </div>
                  </td>
                  <td>
                    <StatusBadge value={candidate.proofRequirement ?? 'undetermined'} />
                  </td>
                  <td>
                    <span className="locator">
                      {candidate.documentName ?? 'Source document'} · page{' '}
                      {candidate.preliminaryPage}
                    </span>
                  </td>
                  <td>
                    <StatusBadge value={candidate.humanReviewStatus} />
                    <span className="analyst-only text-metadata tabular mt-1.5 block whitespace-nowrap">
                      Updated{' '}
                      {new Date(candidate.findingCreatedAt ?? candidate.createdAt).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
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
      {register.total > register.pageSize ? (
        <nav
          aria-label="Requirement pages"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link className="secondary-action btn-sm" href={requirementsHref(page - 1)}>
              ← Previous
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <p className="text-metadata tabular">
            Showing {(page - 1) * register.pageSize + 1}–
            {Math.min(page * register.pageSize, register.total)} of {register.total}
          </p>
          {page < pageCount ? (
            <Link className="secondary-action btn-sm" href={requirementsHref(page + 1)}>
              Next →
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}

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
