import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AnalysisStatusPoller } from './analysis-status-poller';
import { StartVerificationButton } from '../../requirements/start-verification-button';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { businessLabel } from '@/lib/presentation';

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
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="documents"
        compact
      />
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href={`/w/${workspaceId}/documents/${run.document_id}`}
          className="quiet-link text-sm"
        >
          ← Source file
        </Link>
      </nav>

      <div className="page-header">
        <div>
          <p className="page-eyebrow">Requirement discovery</p>
          <h1 className="page-title">Extracting RFP requirements</h1>
          <p className="page-lede mt-2">
            {businessLabel(run.status)}
            {run.stage ? ` · ${businessLabel(run.stage)}` : ''}
            {active
              ? ' — this page updates while the system finds candidate obligations.'
              : ' — candidates below are suggestions until source verification finishes.'}
          </p>
          <p className="analyst-only text-metadata mt-2">
            {[run.provider_name, run.extract_model].filter(Boolean).join(' · ') ||
              'Provider detail hidden in executive view'}
          </p>
        </div>
      </div>

      <p className="notice notice-warning mb-6">
        Everything listed here is a <strong>candidate</strong>. Nothing is treated as a verified
        requirement until source evidence is checked and a person reviews it.
      </p>

      <AnalysisStatusPoller active={active} />

      {run.status === 'failed' || run.status === 'budget_exceeded' ? (
        <p role="alert" className="notice notice-critical mb-4">
          {run.status === 'budget_exceeded'
            ? 'The analysis budget for this environment was reached. Ask an operator before retrying.'
            : `Extraction failed${run.error_category ? ` (${businessLabel(run.error_category)})` : ''}. The uploaded file was kept.`}
        </p>
      ) : null}

      <section aria-labelledby="candidates-heading" className="mb-8">
        <h2 id="candidates-heading" className="section-title mb-3">
          Suggested obligations ({candidates?.length ?? 0})
        </h2>
        {candidates && candidates.length > 0 ? (
          <ul className="surface-card divide-y divide-line-subtle overflow-hidden">
            {candidates.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{c.title}</p>
                    <p className="text-metadata mt-1">
                      {businessLabel(c.category)} · {businessLabel(c.mandatory_class)} ·{' '}
                      <span className="uppercase tracking-wide text-warning-400">unverified</span>
                    </p>
                  </div>
                  <Link
                    className="locator"
                    href={`/w/${workspaceId}/documents/${run.document_id}?page=${c.preliminary_page}`}
                  >
                    Source page {c.preliminary_page}
                  </Link>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{c.obligation}</p>
                {c.evidence_quote ? (
                  <blockquote className="evidence-quote mt-2">{c.evidence_quote}</blockquote>
                ) : null}
                <p className="text-metadata mt-1">
                  Advisory confidence {c.confidence ?? 'n/a'} (not probability or truth)
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">
            {active ? 'Waiting for candidates…' : 'No candidates produced.'}
          </p>
        )}
      </section>

      {run.status === 'completed' && (candidates?.length ?? 0) > 0 ? (
        <section className="notice notice-info mb-8 p-5">
          <h2 className="section-title mb-2">Independent source verification</h2>
          <StartVerificationButton workspaceId={workspaceId} analysisRunId={runId} />
        </section>
      ) : null}
    </main>
  );
}
