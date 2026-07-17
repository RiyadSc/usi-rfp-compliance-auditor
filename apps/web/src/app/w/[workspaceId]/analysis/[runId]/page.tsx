import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AnalysisStatusPoller } from './analysis-status-poller';
import { StartVerificationButton } from '../../requirements/start-verification-button';

const uuidSchema = z.string().uuid();

export default async function AnalysisRunPage({
  params,
}: {
  params: Promise<{ workspaceId: string; runId: string }>;
}) {
  const { workspaceId, runId } = await params;
  if (!uuidSchema.safeParse(workspaceId).success || !uuidSchema.safeParse(runId).success) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: run } = await supabase
    .from('analysis_runs')
    .select(
      'id, status, stage, document_id, provider_name, extract_model, embed_model, prompt_version, schema_version, candidate_count, estimated_cost_usd, error_category, error_detail, created_at, completed_at',
    )
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!run) notFound();

  const { data: candidates } = await supabase
    .from('requirement_candidates')
    .select(
      'id, category, title, obligation, mandatory_class, preliminary_page, evidence_quote, confidence, status, ambiguity_notes',
    )
    .eq('analysis_run_id', runId)
    .eq('workspace_id', workspaceId)
    .order('preliminary_page', { ascending: true });

  const active = run.status === 'queued' || run.status === 'running';

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link
          href={`/w/${workspaceId}/documents/${run.document_id}`}
          className="text-blue-700 hover:underline"
        >
          ← Document
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold mb-2">Candidate extraction</h1>
      <p className="text-sm text-slate-600 mb-4">
        status <span className="font-medium capitalize">{run.status}</span>
        {run.stage ? ` · stage ${run.stage}` : ''}
        {run.provider_name ? ` · provider ${run.provider_name}` : ''}
        {run.extract_model ? ` · model ${run.extract_model}` : ''}
      </p>
      <p className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        All extracted requirements are <strong>candidate / unverified</strong>. Extraction cannot
        create verified findings.
      </p>

      <AnalysisStatusPoller active={active} />

      {run.status === 'failed' || run.status === 'budget_exceeded' ? (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {run.status === 'budget_exceeded'
            ? 'Phase 3 spend ceiling reached. Request approval before continuing.'
            : `Extraction failed${run.error_category ? ` (${run.error_category})` : ''}.`}
        </p>
      ) : null}

      <section aria-labelledby="candidates-heading" className="mb-8">
        <h2 id="candidates-heading" className="text-base font-medium mb-3">
          Candidates ({candidates?.length ?? 0})
        </h2>
        {candidates && candidates.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {candidates.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-sm text-slate-600">
                      {c.category} · {c.mandatory_class} ·{' '}
                      <span className="uppercase tracking-wide text-amber-800">unverified</span>
                    </p>
                  </div>
                  <Link
                    className="text-sm text-blue-700 hover:underline"
                    href={`/w/${workspaceId}/documents/${run.document_id}?page=${c.preliminary_page}`}
                  >
                    Source page {c.preliminary_page}
                  </Link>
                </div>
                <p className="mt-2 text-sm text-slate-800">{c.obligation}</p>
                {c.evidence_quote ? (
                  <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm text-slate-600">
                    {c.evidence_quote}
                  </blockquote>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Advisory confidence {c.confidence ?? 'n/a'} (not probability or truth)
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">
            {active ? 'Waiting for candidates…' : 'No candidates produced.'}
          </p>
        )}
      </section>

      {run.status === 'completed' && (candidates?.length ?? 0) > 0 ? (
        <section className="mb-8 rounded border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-2 text-base font-medium">Independent source verification</h2>
          <StartVerificationButton workspaceId={workspaceId} analysisRunId={runId} />
        </section>
      ) : null}
    </main>
  );
}
