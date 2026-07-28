import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { summarizePhase9Coverage } from '@usi/domain';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import {
  Phase9CoverageReviewControls,
  Phase9FindingReviewControls,
  PublishReviewedFindings,
} from './finding-review-controls';
import { LiveAnalysisControls } from './live-analysis-controls';

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

type CoverageBlock = {
  block_hash: string;
  source_document_id: string;
  source_document_key: string;
  page_number: number | null;
  sheet_name: string | null;
  cell_range: string | null;
  route: string;
  deterministic_signals: unknown;
};

type PagedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function loadAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(`phase9_review_load_failed:${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

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
  const env = serverEnv();
  const { data: parsedDocuments } = await supabase
    .from('documents')
    .select('id,normalized_filename,document_type,page_count')
    .eq('workspace_id', workspaceId)
    .eq('status', 'parsed')
    .is('deleted_at', null)
    .not('document_type', 'in', '("proposal_draft","expected_answer")')
    .order('created_at');
  const liveControls = (
    <LiveAnalysisControls
      workspaceId={workspaceId}
      enabled={env.PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED && Boolean(env.OPENAI_API_KEY)}
      perRunMaximumUsd={env.PHASE9_LIVE_MAX_USD_PER_RUN}
      monthlyMaximumUsd={env.PHASE9_LIVE_MONTHLY_WORKSPACE_CEILING_USD}
      documents={(parsedDocuments ?? []).map((document) => ({
        id: document.id,
        name: document.normalized_filename,
        type: document.document_type,
        pages: document.page_count,
      }))}
    />
  );
  const { data: run } = await supabase
    .from('phase9_evaluation_runs')
    .select(
      'id,status,mode,source_package_hash,document_set_hash,expected_answers_used,call_plan_hash,compatibility_fingerprint,planned_maximum_usd,requested_maximum_usd,actual_usd,provider_call_count,cache_hit_count,versions,error_category,created_at,completed_at',
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
              Select parsed RFP documents below. The application creates an exact, bounded call plan
              before any provider access and keeps every result pending human review.
            </p>
          </div>
        </div>
        {liveControls}
      </main>
    );
  }

  const [
    findings,
    candidates,
    coverage,
    usage,
    reviewDecisions,
    coverageReviewDecisions,
    bridgeRuns,
  ] = await Promise.all([
    loadAllPages<Finding>((from, to) =>
      supabase
        .from('phase9_findings')
        .select(
          'candidate_hash,source_support_status,precedence_status,proof_requirement,evidence_block_hashes,ambiguity_code,machine_only,human_review_status',
        )
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('created_at')
        .range(from, to),
    ),
    loadAllPages<{
      candidate_hash: string;
      requirement_type: string;
      obligation_text: string;
      evidence_text: string;
      discovery_route: string;
      source_block_hashes: string[];
      material_facts: unknown;
    }>((from, to) =>
      supabase
        .from('phase9_candidate_seeds')
        .select(
          'candidate_hash,requirement_type,obligation_text,evidence_text,discovery_route,source_block_hashes,material_facts',
        )
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('candidate_hash')
        .range(from, to),
    ),
    loadAllPages<CoverageBlock>((from, to) =>
      supabase
        .from('phase9_source_block_coverage')
        .select(
          'block_hash,source_document_id,source_document_key,page_number,sheet_name,cell_range,route,deterministic_signals',
        )
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('block_hash')
        .range(from, to),
    ),
    loadAllPages<{
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
      latency_ms: number;
      cost_usd: number;
    }>((from, to) =>
      supabase
        .from('phase9_provider_usage')
        .select('input_tokens,output_tokens,reasoning_tokens,latency_ms,cost_usd')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('created_at')
        .range(from, to),
    ),
    loadAllPages<{
      id: string;
      candidate_hash: string;
      decision: string;
      corrections: unknown;
      created_at: string;
    }>((from, to) =>
      supabase
        .from('phase9_finding_review_decisions')
        .select('id,candidate_hash,decision,corrections,created_at')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    loadAllPages<{
      id: string;
      source_document_id: string;
      page_number: number;
      decision: string;
      created_at: string;
    }>((from, to) =>
      supabase
        .from('phase9_coverage_review_decisions')
        .select('id,source_document_id,page_number,decision,created_at')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    loadAllPages<{
      id: string;
      verification_run_id: string;
      published_count: number;
      created_at: string;
    }>((from, to) =>
      supabase
        .from('phase9_bridge_runs')
        .select('id,verification_run_id,published_count,created_at')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', run.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
  ]);
  const { data: documentBindings } = await supabase
    .from('phase9_evaluation_documents')
    .select('document_id,page_count,ordinal')
    .eq('workspace_id', workspaceId)
    .eq('evaluation_run_id', run.id)
    .order('ordinal');
  const candidateByHash = new Map(
    (candidates ?? []).map((candidate) => [candidate.candidate_hash, candidate]),
  );
  const blocks = (coverage ?? []) as CoverageBlock[];
  const blockByHash = new Map(blocks.map((block) => [block.block_hash, block]));
  const rows = findings;
  const findingCount = findings.length;
  const totals = usage.reduce(
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
  const latestReview = new Map<
    string,
    { id: string; decision: string; corrections: unknown; created_at: string }
  >();
  for (const decision of reviewDecisions ?? [])
    if (!latestReview.has(decision.candidate_hash))
      latestReview.set(decision.candidate_hash, decision);
  const reviewedCount = latestReview.size;
  const followUpCount = [...latestReview.values()].filter(
    (decision) => decision.decision === 'needs_follow_up',
  ).length;
  const publishableCount = rows.filter(
    (finding) =>
      latestReview.get(finding.candidate_hash)?.decision === 'accepted' &&
      finding.source_support_status === 'supported' &&
      finding.precedence_status === 'active' &&
      finding.machine_only &&
      finding.evidence_block_hashes.length > 0,
  ).length;
  const findingBlockHashes = new Set(rows.flatMap((finding) => finding.evidence_block_hashes));
  const findingCandidateHashes = new Set(rows.map((finding) => finding.candidate_hash));
  const seedByBlock = new Map<string, Array<{ candidate_hash: string }>>();
  for (const candidate of candidates ?? []) {
    for (const blockHash of candidate.source_block_hashes as string[]) {
      seedByBlock.set(blockHash, [
        ...(seedByBlock.get(blockHash) ?? []),
        { candidate_hash: candidate.candidate_hash },
      ]);
    }
  }
  const coveragePages = new Map<
    string,
    {
      documentId: string;
      pageNumber: number;
      route: string;
      parserUncertain: boolean;
      hasFinding: boolean;
      hasSeedWithoutFinding: boolean;
      hasFormSignal: boolean;
      hasDeadlineSignal: boolean;
    }
  >();
  for (const block of blocks) {
    if (!block.page_number) continue;
    const key = `${block.source_document_id}:${block.page_number}`;
    const signals = Array.isArray(block.deterministic_signals)
      ? block.deterministic_signals.map(String)
      : [];
    const prior = coveragePages.get(key);
    const blockSeeds = seedByBlock.get(block.block_hash) ?? [];
    coveragePages.set(key, {
      documentId: block.source_document_id,
      pageNumber: block.page_number,
      route:
        prior?.route === 'parser_uncertain' || block.route === 'parser_uncertain'
          ? 'parser_uncertain'
          : block.route,
      parserUncertain: Boolean(prior?.parserUncertain) || block.route === 'parser_uncertain',
      hasFinding: Boolean(prior?.hasFinding) || findingBlockHashes.has(block.block_hash),
      hasSeedWithoutFinding:
        Boolean(prior?.hasSeedWithoutFinding) ||
        blockSeeds.some((seed) => !findingCandidateHashes.has(seed.candidate_hash)),
      hasFormSignal:
        Boolean(prior?.hasFormSignal) ||
        signals.some((signal) => /form|signature|attachment|schedule/i.test(signal)),
      hasDeadlineSignal:
        Boolean(prior?.hasDeadlineSignal) ||
        signals.some((signal) => /date|deadline|due|time/i.test(signal)),
    });
  }
  const expectedPages = (documentBindings ?? []).flatMap((binding) =>
    Array.from({ length: binding.page_count }, (_, index) => ({
      documentId: binding.document_id,
      pageNumber: index + 1,
    })),
  );
  const coverageSummary = summarizePhase9Coverage({
    expectedPages,
    pages: [...coveragePages.values()],
  });
  const coverageExceptions = coverageSummary.pages.filter(
    (page) =>
      page.parserUncertain ||
      page.hasSeedWithoutFinding ||
      page.route === 'missing' ||
      ((page.hasFormSignal || page.hasDeadlineSignal) && !page.hasFinding),
  );
  const latestCoverageReview = new Map<string, { decision: string; created_at: string }>();
  for (const decision of coverageReviewDecisions ?? []) {
    const key = `${decision.source_document_id}:${decision.page_number}`;
    if (!latestCoverageReview.has(key)) latestCoverageReview.set(key, decision);
  }
  const coverageReviewedCount = coverageExceptions.filter((page) =>
    latestCoverageReview.has(`${page.documentId}:${page.pageNumber}`),
  ).length;
  const coverageFollowUpCount = coverageExceptions.filter(
    (page) =>
      latestCoverageReview.get(`${page.documentId}:${page.pageNumber}`)?.decision ===
      'needs_follow_up',
  ).length;
  const orderedRows = [...rows].sort((left, right) => {
    const leftException =
      left.source_support_status !== 'supported' ||
      left.precedence_status !== 'active' ||
      Boolean(left.ambiguity_code);
    const rightException =
      right.source_support_status !== 'supported' ||
      right.precedence_status !== 'active' ||
      Boolean(right.ambiguity_code);
    return Number(rightException) - Number(leftException);
  });

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
          <h1 className="page-title mt-2">Live RFP analysis coverage</h1>
          <p className="page-lede mt-3">
            Source-grounded machine analysis only. Every finding remains separate from human review
            and does not claim bidder compliance or submission approval.
          </p>
        </div>
        <StatusBadge value={run.status} />
      </div>

      {liveControls}

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

      <section className="surface-card rail-teal mb-6 p-5" aria-label="Completeness checkpoint">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Completeness checkpoint</p>
            <h2 className="section-title mt-1.5">
              {coverageSummary.reviewedPages} of {coverageSummary.totalPages} pages accounted for
            </h2>
            <p className="section-lede mt-2 max-w-3xl">
              This proves which pages entered the bounded analysis and surfaces exceptions. It does
              not claim perfect recall; the exception queue is where a person checks possible
              omissions without rereading the whole package.
            </p>
          </div>
          <StatusBadge
            value={coverageSummary.exceptionPages ? 'needs_follow_up' : 'ready_for_review'}
          />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <CoverageMetric label="Requirement pages" value={coverageSummary.requirementPages} />
          <CoverageMetric label="No requirement found" value={coverageSummary.noRequirementPages} />
          <CoverageMetric label="Parser uncertainty" value={coverageSummary.parserUncertainPages} />
          <CoverageMetric label="Unexamined pages" value={coverageSummary.unexaminedPages} />
          <CoverageMetric label="Exception pages" value={coverageSummary.exceptionPages} />
          <CoverageMetric
            label="Seeds not assessed"
            value={
              (candidates ?? []).filter(
                (candidate) => !findingCandidateHashes.has(candidate.candidate_hash),
              ).length
            }
          />
        </dl>
        {coverageSummary.exceptionPages ? (
          <details className="disclosure mt-4">
            <summary>Review page-level exceptions</summary>
            <div className="disclosure-body">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {coverageExceptions.map((page) => (
                  <li key={`${page.documentId}:${page.pageNumber}`} className="surface-inset p-3">
                    <Link
                      className="action-link"
                      href={`/w/${workspaceId}/documents/${page.documentId}?page=${page.pageNumber}`}
                    >
                      Page {page.pageNumber}
                    </Link>
                    <p className="text-metadata mt-1">
                      {page.route === 'missing'
                        ? 'No persisted coverage record'
                        : page.parserUncertain
                          ? 'Parser uncertainty'
                          : page.hasSeedWithoutFinding
                            ? 'Candidate seed was not assessed'
                            : 'Form or deadline signal needs confirmation'}
                    </p>
                    <Phase9CoverageReviewControls
                      workspaceId={workspaceId}
                      evaluationRunId={run.id}
                      documentId={page.documentId}
                      pageNumber={page.pageNumber}
                      currentDecision={
                        latestCoverageReview.get(`${page.documentId}:${page.pageNumber}`)
                          ?.decision ?? null
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
      </section>

      <section className="surface-panel p-5">
        <h2 className="section-title">Processing and provenance</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Mode" value={run.mode} />
          <Fact
            label="Expected-answer fixture"
            value={run.expected_answers_used ? 'Used' : 'Not used'}
          />
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
          <Fact
            label="Document set"
            value={run.document_set_hash ? shortHash(run.document_set_hash) : 'Legacy run'}
          />
          <Fact label="Call plan" value={shortHash(run.call_plan_hash)} />
          <Fact label="Compatibility" value={shortHash(run.compatibility_fingerprint)} />
          <Fact
            label="Elapsed provider time"
            value={`${(totals.latency / 1000).toFixed(1)} seconds`}
          />
          {run.error_category ? <Fact label="Failure category" value={run.error_category} /> : null}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...routes.entries()].map(([route, count]) => (
            <span key={route} className="chip">
              {route.replaceAll('_', ' ')}: {count}
            </span>
          ))}
        </div>
      </section>

      {run.status === 'completed' ? (
        <section className="mt-6">
          <PublishReviewedFindings
            workspaceId={workspaceId}
            evaluationRunId={run.id}
            eligibleCount={publishableCount}
            reviewedCount={reviewedCount}
            totalCount={rows.length}
            followUpCount={followUpCount}
            coverageExceptionCount={coverageExceptions.length}
            coverageReviewedCount={coverageReviewedCount}
            coverageFollowUpCount={coverageFollowUpCount}
          />
          {bridgeRuns?.[0] ? (
            <p className="notice notice-info mt-3">
              {bridgeRuns[0].published_count} reviewed requirements were published to the register.{' '}
              <Link href={`/w/${workspaceId}/requirements`} className="action-link">
                Open requirement register
              </Link>{' '}
              or{' '}
              <Link href={`/w/${workspaceId}/checklist`} className="action-link">
                build the submission checklist
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="surface-card mt-6 overflow-hidden">
        <div className="border-b border-line-subtle px-5 py-4">
          <h2 className="section-title">Source-grounded findings</h2>
          <p className="section-lede mt-1">
            Exact evidence, native workbook cells, ambiguous locations, and review state remain
            visible.
          </p>
        </div>
        <div className="divide-y divide-line-subtle">
          {orderedRows.map((finding) => {
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
                <details className="disclosure mt-4">
                  <summary>
                    {latestReview.has(finding.candidate_hash)
                      ? 'Update team decision'
                      : 'Review this finding'}
                  </summary>
                  <div className="disclosure-body">
                    <Phase9FindingReviewControls
                      workspaceId={workspaceId}
                      evaluationRunId={run.id}
                      candidateHash={finding.candidate_hash}
                      currentDecision={latestReview.get(finding.candidate_hash)?.decision ?? null}
                    />
                  </div>
                </details>
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

function CoverageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-inset p-3">
      <dt className="metric-label">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
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
