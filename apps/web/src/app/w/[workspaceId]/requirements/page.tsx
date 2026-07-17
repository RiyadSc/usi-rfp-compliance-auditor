import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const LABELS: Record<string, string> = {
  supported: 'Source-supported — review pending',
  partially_supported: 'Partially supported',
  unsupported: 'Unsupported',
  contradicted: 'Contradicted',
  parser_uncertain: 'Parser uncertainty',
  active: 'Active',
  superseded: 'Superseded',
  conflicting: 'Conflicting',
  undetermined: 'Precedence undetermined',
  pending: 'Review pending',
  accepted: 'Human review accepted',
  rejected: 'Human review rejected',
  needs_follow_up: 'Needs follow-up',
  waived: 'Review waived',
};

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
  const rows = (candidates ?? []).filter((candidate) => {
    const finding = latest.get(candidate.id);
    const review = finding ? (reviews.get(finding.id) ?? 'pending') : 'pending';
    return (
      (!sourceFilter || finding?.source_support_status === sourceFilter) &&
      (!precedenceFilter || finding?.precedence_status === precedenceFilter) &&
      (!proofFilter || finding?.proof_requirement === proofFilter) &&
      (!categoryFilter || candidate.category === categoryFilter) &&
      (!mandatoryFilter || candidate.mandatory_class === mandatoryFilter) &&
      (!reviewFilter || review === reviewFilter)
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href={`/w/${workspaceId}`} className="text-blue-700 hover:underline">
          ← Workspace
        </Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Requirement register</h1>
          <p className="mt-1 text-sm text-slate-600">
            Machine source assessments remain separate from human decisions. This register does not
            determine bidder compliance.
          </p>
        </div>
        {verificationRun ? (
          <p className="rounded border border-slate-200 bg-white px-3 py-2 text-xs">
            Latest verification: {verificationRun.status} · {verificationRun.model ?? 'mock'} ·
            reasoning {verificationRun.reasoning_effort ?? 'n/a'}
          </p>
        ) : null}
      </div>
      <form
        method="get"
        className="mb-5 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6"
      >
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
        <div className="sm:col-span-3 lg:col-span-6 flex gap-3">
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
            Apply filters
          </button>
          <Link
            href={`/w/${workspaceId}/requirements`}
            className="px-2 py-2 text-sm text-blue-700 hover:underline"
          >
            Clear
          </Link>
        </div>
      </form>
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              {[
                'Requirement',
                'Category',
                'Mandatory',
                'Source status',
                'Precedence',
                'Proof requirement',
                'Source',
                'Human review',
                'Last updated',
              ].map((head) => (
                <th scope="col" key={head} className="px-3 py-3">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((candidate) => {
              const finding = latest.get(candidate.id);
              const review = finding ? (reviews.get(finding.id) ?? 'pending') : 'pending';
              return (
                <tr key={candidate.id}>
                  <td className="max-w-xs px-3 py-3">
                    <Link
                      className="font-medium text-blue-800 hover:underline"
                      href={`/w/${workspaceId}/requirements/${candidate.id}`}
                    >
                      {candidate.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {candidate.obligation}
                    </p>
                  </td>
                  <td className="px-3 py-3">{candidate.category}</td>
                  <td className="px-3 py-3">{candidate.mandatory_class}</td>
                  <td className="px-3 py-3">
                    <Status value={finding?.source_support_status ?? 'pending'} />
                  </td>
                  <td className="px-3 py-3">
                    <Status value={finding?.precedence_status ?? 'undetermined'} />
                  </td>
                  <td className="px-3 py-3">{finding?.proof_requirement ?? 'undetermined'}</td>
                  <td className="px-3 py-3">
                    {documentNames.get(candidate.document_id) ?? 'Source document'} · page{' '}
                    {candidate.preliminary_page}
                  </td>
                  <td className="px-3 py-3">
                    <Status value={review} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    {new Date(finding?.created_at ?? candidate.created_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-6 text-sm text-slate-600">No requirements match these filters.</p>
        ) : null}
      </div>
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
    <label className="text-xs font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium">
      {LABELS[value] ?? value.replaceAll('_', ' ')}
    </span>
  );
}
