import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();

type Finding = {
  candidate_hash: string;
  source_support_status: string;
  precedence_status: string;
  proof_requirement: string;
  evidence_block_hashes: string[];
  ambiguity_code: string | null;
  machine_only: boolean;
  human_review_status: string;
};

export default async function Phase9AnalysisPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!uuid.safeParse(workspaceId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!workspace) notFound();
  const { data: run } = await supabase
    .from('phase9_evaluation_runs')
    .select(
      'id,status,mode,source_package_hash,call_plan_hash,compatibility_fingerprint,planned_maximum_usd,actual_usd,provider_call_count,cache_hit_count,versions,created_at,completed_at',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) {
    return (
      <main className="page-shell">
        <WorkspaceNavigation
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          current="phase9"
        />
        <div className="page-header">
          <div>
            <p className="page-eyebrow">Analysis coverage</p>
            <h1 className="page-title mt-2">No controlled analysis result</h1>
            <p className="page-lede mt-3">
              Live provider analysis is disabled for ordinary workspaces. A protected public-fixture
              run will appear here only after its source, budget, and compatibility checks pass.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const [
    { data: findings, count: findingCount },
    { data: candidates },
    { data: coverage },
    { data: usage },
  ] = await Promise.all([
    supabase
      .from('phase9_findings')
      .select(
        'candidate_hash,source_support_status,precedence_status,proof_requirement,evidence_block_hashes,ambiguity_code,machine_only,human_review_status',
        { count: 'exact' },
      )
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', run.id)
      .order('created_at')
      .limit(200),
    supabase
      .from('phase9_candidate_seeds')
      .select('candidate_hash,requirement_type,obligation_text,evidence_text,discovery_route')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', run.id)
      .limit(2000),
    supabase
      .from('phase9_source_block_coverage')
      .select(
        'block_hash,source_document_id,source_document_key,page_number,sheet_name,cell_range,route',
      )
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', run.id),
    supabase
      .from('phase9_provider_usage')
      .select('input_tokens,output_tokens,reasoning_tokens,latency_ms,cost_usd')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', run.id),
  ]);
  const candidateByHash = new Map(
    (candidates ?? []).map((candidate) => [candidate.candidate_hash, candidate]),
  );
  const blockByHash = new Map((coverage ?? []).map((block) => [block.block_hash, block]));
  const rows = (findings ?? []) as Finding[];
  const totals = (usage ?? []).reduce(
    (sum, item) => ({
      input: sum.input + item.input_tokens,
      output: sum.output + item.output_tokens,
      reasoning: sum.reasoning + item.reasoning_tokens,
      latency: sum.latency + item.latency_ms,
      cost: sum.cost + Number(item.cost_usd),
    }),
    { input: 0, output: 0, reasoning: 0, latency: 0, cost: 0 },
  );
  const routes = new Map<string, number>();
  for (const block of coverage ?? []) routes.set(block.route, (routes.get(block.route) ?? 0) + 1);
  const humanQueue = rows.filter(
    (finding) => finding.human_review_status === 'pending' || finding.ambiguity_code,
  ).length;

  return (
    <main className="page-shell">
      <WorkspaceNavigation
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        current="phase9"
      />
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Controlled source analysis</p>
          <h1 className="page-title mt-2">FAC115 analysis coverage</h1>
          <p className="page-lede mt-3">
            Source-grounded machine analysis only. Every finding remains separate from human review
            and does not claim bidder compliance or submission approval.
          </p>
        </div>
        <StatusBadge value={run.status} />
      </div>

      <section
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Analysis summary"
      >
        <Summary label="Source blocks covered" value={coverage?.length ?? 0} />
        <Summary label="Machine findings" value={findingCount ?? rows.length} />
        <Summary label="Human review queue" value={humanQueue} />
        <Summary label="Provider calls" value={run.provider_call_count} />
        <Summary
          label="Actual provider cost"
          value={`$${Number(run.actual_usd ?? totals.cost).toFixed(4)}`}
        />
      </section>

      <section className="surface-panel p-5">
        <h2 className="section-title">Processing and provenance</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Mode" value={run.mode} />
          <Fact label="Cache reused" value={`${run.cache_hit_count} tasks`} />
          <Fact
            label="Maximum planned cost"
            value={`$${Number(run.planned_maximum_usd).toFixed(4)}`}
          />
          <Fact
            label="Input / output tokens"
            value={`${totals.input.toLocaleString()} / ${totals.output.toLocaleString()}`}
          />
          <Fact label="Source package" value={shortHash(run.source_package_hash)} />
          <Fact label="Call plan" value={shortHash(run.call_plan_hash)} />
          <Fact label="Compatibility" value={shortHash(run.compatibility_fingerprint)} />
          <Fact
            label="Elapsed provider time"
            value={`${(totals.latency / 1000).toFixed(1)} seconds`}
          />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...routes.entries()].map(([route, count]) => (
            <span key={route} className="chip">
              {route.replaceAll('_', ' ')}: {count}
            </span>
          ))}
        </div>
      </section>

      <section className="surface-card mt-6 overflow-hidden">
        <div className="border-b border-line-subtle px-5 py-4">
          <h2 className="section-title">Source-grounded findings</h2>
          <p className="section-lede mt-1">
            Exact evidence, native workbook cells, ambiguous locations, and review state remain
            visible.
          </p>
        </div>
        <div className="divide-y divide-line-subtle">
          {rows.map((finding) => {
            const candidate = candidateByHash.get(finding.candidate_hash);
            const evidence = finding.evidence_block_hashes
              .map((hash) => blockByHash.get(hash))
              .filter(Boolean);
            return (
              <article key={finding.candidate_hash} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-4xl">
                    <p className="text-micro text-ink-muted">
                      {candidate?.requirement_type?.replaceAll('_', ' ') ?? 'Requirement'}
                    </p>
                    <h3 className="mt-1 font-semibold text-ink">
                      {candidate?.obligation_text ?? 'Source-grounded requirement'}
                    </h3>
                    <blockquote className="evidence-quote mt-3">
                      {candidate?.evidence_text ?? 'Evidence retained with the source record.'}
                    </blockquote>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={finding.source_support_status} />
                    <StatusBadge value={finding.precedence_status} />
                    <StatusBadge value={finding.proof_requirement} />
                    <StatusBadge value={finding.human_review_status} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {evidence.map((block) => (
                    <Link
                      key={block!.block_hash}
                      href={`/w/${workspaceId}/documents/${block!.source_document_id}${
                        block!.page_number ? `?page=${block!.page_number}` : ''
                      }`}
                      className="locator"
                    >
                      {block!.source_document_key}
                      {block!.page_number ? ` · page ${block!.page_number}` : ''}
                      {block!.sheet_name ? ` · ${block!.sheet_name}!${block!.cell_range}` : ''}
                    </Link>
                  ))}
                </div>
                {finding.ambiguity_code ? (
                  <p className="notice notice-warning mt-3">
                    Evidence location remains ambiguous; every valid location is shown for human
                    review.
                  </p>
                ) : null}
                <p className="text-metadata mt-3">
                  Machine-generated · human review {finding.human_review_status}
                </p>
              </article>
            );
          })}
          {!rows.length ? (
            <p className="empty-state-body p-5">No persisted findings are available.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="mono mt-1 wrap-break-word text-sm text-ink-soft">{value}</dd>
    </div>
  );
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
