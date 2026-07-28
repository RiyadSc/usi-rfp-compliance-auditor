import { mkdir, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { format } from 'prettier';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  mapPhase9RequirementCategory,
  phase9EvidenceMatch,
  type Phase9ReviewFinding,
} from '@usi/domain';
import {
  PHASE9_NJ_IMMUTABLE_SOURCE,
  PHASE9_NJ_REVIEW_SNAPSHOT_VERSION,
  hashCandidatePopulation,
  phase9NjReviewSnapshotSchema,
} from './lib/phase9-review-acceleration-evaluator';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

if (process.env.PHASE9_NJ_SNAPSHOT_EXPORT !== '1')
  throw new Error('phase9_nj_snapshot_export_requires_explicit_read_only_flag');
for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`phase9_nj_snapshot_export_refuses_live_flag:${flag}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) throw new Error('phase9_nj_snapshot_export_missing_supabase_environment');
if (new URL(url).hostname.split('.')[0] !== 'uxmxkdjschbekkbnweby')
  throw new Error('phase9_nj_snapshot_export_wrong_supabase_project');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PostgrestPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function readAll<T>(
  load: (from: number, to: number) => PromiseLike<PostgrestPage<T>>,
): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const response = await load(from, from + pageSize - 1);
    if (response.error) throw new Error(`phase9_nj_snapshot_read_failed:${response.error.message}`);
    result.push(...(response.data ?? []));
    if (!response.data || response.data.length < pageSize) return result;
  }
}

type RunRow = {
  id: string;
  workspace_id: string;
  status: string;
  source_package_hash: string;
  document_set_hash: string;
  call_plan_hash: string;
  compatibility_fingerprint: string;
  completed_at: string;
  expected_answers_used: boolean;
};
type DocumentBinding = {
  document_id: string;
  page_count: number;
};
type FindingRow = {
  candidate_hash: string;
  source_support_status: Phase9ReviewFinding['sourceSupportStatus'];
  precedence_status: Phase9ReviewFinding['precedenceStatus'];
  evidence_block_hashes: string[];
  ambiguity_code: string | null;
  machine_only: boolean;
};
type CandidateRow = {
  candidate_hash: string;
  requirement_type: string;
  obligation_text: string;
  evidence_text: string;
  source_block_hashes: string[];
  material_facts: unknown;
};
type CoverageRow = {
  block_hash: string;
  source_document_id: string;
  source_document_key: string;
  page_number: number | null;
  sheet_name: string | null;
  cell_range: string | null;
  route: string;
  deterministic_signals: unknown;
};
type PageRow = {
  document_id: string;
  page_number: number;
  text: string;
};
type CoverageReviewRow = {
  id: string;
  source_document_id: string;
  page_number: number;
  decision: string;
  created_at: string;
};

const exact = PHASE9_NJ_IMMUTABLE_SOURCE;
const runResponse = await admin
  .from('phase9_evaluation_runs')
  .select(
    'id,workspace_id,status,source_package_hash,document_set_hash,call_plan_hash,compatibility_fingerprint,completed_at,expected_answers_used',
  )
  .eq('id', exact.evaluationRunId)
  .eq('workspace_id', exact.workspaceId)
  .single<RunRow>();
if (runResponse.error || !runResponse.data)
  throw new Error(`phase9_nj_snapshot_run_missing:${runResponse.error?.message ?? 'not_found'}`);
const run = runResponse.data;
if (
  run.status !== 'completed' ||
  run.source_package_hash !== exact.sourcePackageHash ||
  run.document_set_hash !== exact.documentSetHash ||
  run.call_plan_hash !== exact.callPlanHash ||
  run.compatibility_fingerprint !== exact.compatibilityFingerprint ||
  run.expected_answers_used
)
  throw new Error('phase9_nj_snapshot_immutable_run_mismatch');

const [bindings, findings, candidates, coverage, pages, coverageReviews] = await Promise.all([
  readAll<DocumentBinding>((from, to) =>
    admin
      .from('phase9_evaluation_documents')
      .select('document_id,page_count')
      .eq('workspace_id', exact.workspaceId)
      .eq('evaluation_run_id', exact.evaluationRunId)
      .order('ordinal')
      .range(from, to),
  ),
  readAll<FindingRow>((from, to) =>
    admin
      .from('phase9_findings')
      .select(
        'candidate_hash,source_support_status,precedence_status,evidence_block_hashes,ambiguity_code,machine_only',
      )
      .eq('workspace_id', exact.workspaceId)
      .eq('evaluation_run_id', exact.evaluationRunId)
      .order('candidate_hash')
      .range(from, to),
  ),
  readAll<CandidateRow>((from, to) =>
    admin
      .from('phase9_candidate_seeds')
      .select(
        'candidate_hash,requirement_type,obligation_text,evidence_text,source_block_hashes,material_facts',
      )
      .eq('workspace_id', exact.workspaceId)
      .eq('evaluation_run_id', exact.evaluationRunId)
      .order('candidate_hash')
      .range(from, to),
  ),
  readAll<CoverageRow>((from, to) =>
    admin
      .from('phase9_source_block_coverage')
      .select(
        'block_hash,source_document_id,source_document_key,page_number,sheet_name,cell_range,route,deterministic_signals',
      )
      .eq('workspace_id', exact.workspaceId)
      .eq('evaluation_run_id', exact.evaluationRunId)
      .order('block_hash')
      .range(from, to),
  ),
  readAll<PageRow>((from, to) =>
    admin
      .from('document_pages')
      .select('document_id,page_number,text')
      .eq('workspace_id', exact.workspaceId)
      .in('document_id', [...exact.documentIds])
      .order('document_id')
      .order('page_number')
      .range(from, to),
  ),
  readAll<CoverageReviewRow>((from, to) =>
    admin
      .from('phase9_coverage_review_decisions')
      .select('id,source_document_id,page_number,decision,created_at')
      .eq('workspace_id', exact.workspaceId)
      .eq('evaluation_run_id', exact.evaluationRunId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  ),
]);

if (
  findings.length !== exact.findingCount ||
  bindings.length !== exact.documentIds.length ||
  bindings[0]?.document_id !== exact.documentIds[0] ||
  bindings[0]?.page_count !== exact.pageCount ||
  pages.length !== exact.pageCount
)
  throw new Error('phase9_nj_snapshot_population_mismatch');

const candidateByHash = new Map(
  candidates.map((candidate) => [candidate.candidate_hash, candidate]),
);
const coverageByHash = new Map(coverage.map((block) => [block.block_hash, block]));
const pageTextByKey = new Map(
  pages.map((page) => [`${page.document_id}:${page.page_number}`, page.text]),
);
const findingHashes = new Set(findings.map((finding) => finding.candidate_hash));
const findingBlockHashes = new Set(findings.flatMap((finding) => finding.evidence_block_hashes));
const seedsByBlock = new Map<string, CandidateRow[]>();
for (const candidate of candidates)
  for (const blockHash of candidate.source_block_hashes)
    seedsByBlock.set(blockHash, [...(seedsByBlock.get(blockHash) ?? []), candidate]);

const latestCoverageReview = new Map<string, CoverageReviewRow>();
for (const review of coverageReviews) {
  const key = `${review.source_document_id}:${review.page_number}`;
  if (!latestCoverageReview.has(key)) latestCoverageReview.set(key, review);
}

function materialFacts(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(facts: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = facts[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

const reviewFindings: Phase9ReviewFinding[] = findings.map((finding) => {
  const candidate = candidateByHash.get(finding.candidate_hash);
  if (!candidate) throw new Error(`phase9_nj_snapshot_candidate_missing:${finding.candidate_hash}`);
  const facts = materialFacts(candidate.material_facts);
  const evidenceBlocks = finding.evidence_block_hashes
    .map((hash) => coverageByHash.get(hash))
    .filter((block): block is CoverageRow => Boolean(block));
  const fallbackBlocks = candidate.source_block_hashes
    .map((hash) => coverageByHash.get(hash))
    .filter((block): block is CoverageRow => Boolean(block));
  const orderedLocations = [...(evidenceBlocks.length ? evidenceBlocks : fallbackBlocks)].sort(
    (left, right) =>
      (left.page_number ?? Number.MAX_SAFE_INTEGER) -
        (right.page_number ?? Number.MAX_SAFE_INTEGER) ||
      left.block_hash.localeCompare(right.block_hash),
  );
  const location = orderedLocations[0];
  if (!location)
    throw new Error(`phase9_nj_snapshot_source_location_missing:${finding.candidate_hash}`);
  const quoteMatches = evidenceBlocks.map((block) => {
    if (block.page_number === null) return 'not_found' as const;
    return phase9EvidenceMatch(
      candidate.evidence_text,
      pageTextByKey.get(`${block.source_document_id}:${block.page_number}`) ?? '',
    );
  });
  const quoteMatchType = quoteMatches.includes('exact')
    ? 'exact'
    : quoteMatches.includes('normalized_exact')
      ? 'normalized_exact'
      : 'not_found';
  const pageReferencesComplete =
    evidenceBlocks.length === finding.evidence_block_hashes.length &&
    evidenceBlocks.every(
      (block) =>
        block.page_number !== null || (Boolean(block.sheet_name) && Boolean(block.cell_range)),
    );
  const unresolvedCoverageException = evidenceBlocks.some(
    (block) =>
      block.page_number !== null &&
      latestCoverageReview.get(`${block.source_document_id}:${block.page_number}`)?.decision ===
        'needs_follow_up',
  );
  const formReference =
    firstString(facts, ['formReference', 'formIdentifier', 'form']) ??
    candidate.obligation_text.match(/\bform\s+([a-z0-9][a-z0-9.-]*)\b/i)?.[1] ??
    null;
  const explicitMandatory = firstString(facts, ['mandatoryClass', 'mandatory_class']);
  const mandatoryClass =
    explicitMandatory === 'mandatory' ||
    explicitMandatory === 'optional' ||
    explicitMandatory === 'uncertain'
      ? explicitMandatory
      : /\b(must|shall|required|mandatory)\b/i.test(candidate.obligation_text)
        ? 'mandatory'
        : 'uncertain';
  return {
    candidateHash: finding.candidate_hash,
    sourceSupportStatus: finding.source_support_status,
    precedenceStatus: finding.precedence_status,
    category: mapPhase9RequirementCategory({
      requirementType: candidate.requirement_type,
      obligationText: candidate.obligation_text,
      formReference,
    }),
    requirementType: candidate.requirement_type,
    obligationText: candidate.obligation_text,
    evidenceText: candidate.evidence_text,
    evidenceCount: finding.evidence_block_hashes.length,
    pageReferencesComplete,
    quoteMatchType,
    ambiguityCode: finding.ambiguity_code,
    parserUncertain: evidenceBlocks.some((block) => block.route === 'parser_uncertain'),
    unresolvedCoverageException,
    machineOnly: finding.machine_only,
    duplicateOfCandidateHash: null,
    humanDecision: null,
    mandatoryClass,
    sourceDocumentId: location.source_document_id,
    sourcePage: location.page_number,
    sourceOrder:
      (location.page_number ?? exact.pageCount + 1) * 1000 +
      Math.max(
        0,
        coverage.findIndex((block) => block.block_hash === location.block_hash),
      ),
    deadlineIso: null,
    formReference,
    materialFacts: facts,
    sourceBlockHashes: finding.evidence_block_hashes,
  };
});

const coverageExceptions = bindings
  .flatMap((binding) =>
    Array.from({ length: binding.page_count }, (_, offset) => {
      const pageNumber = offset + 1;
      const blocks = coverage.filter(
        (block) =>
          block.source_document_id === binding.document_id && block.page_number === pageNumber,
      );
      const reasons: Array<
        | 'missing_coverage'
        | 'parser_uncertain'
        | 'seed_without_finding'
        | 'high_risk_signal_without_finding'
      > = [];
      if (!blocks.length) reasons.push('missing_coverage');
      if (blocks.some((block) => block.route === 'parser_uncertain'))
        reasons.push('parser_uncertain');
      if (
        blocks.some((block) =>
          (seedsByBlock.get(block.block_hash) ?? []).some(
            (seed) => !findingHashes.has(seed.candidate_hash),
          ),
        )
      )
        reasons.push('seed_without_finding');
      const hasHighRiskSignal = blocks.some(
        (block) =>
          Array.isArray(block.deterministic_signals) &&
          block.deterministic_signals.some((signal) =>
            /(deadline|form_identifier|use_attachment|signature)/i.test(String(signal)),
          ),
      );
      const hasFinding = blocks.some((block) => findingBlockHashes.has(block.block_hash));
      if (hasHighRiskSignal && !hasFinding) reasons.push('high_risk_signal_without_finding');
      return {
        sourceDocumentId: binding.document_id,
        pageNumber,
        reasons,
      };
    }),
  )
  .filter((page) => page.reasons.length > 0);

const snapshot = phase9NjReviewSnapshotSchema.parse({
  artifactVersion: PHASE9_NJ_REVIEW_SNAPSHOT_VERSION,
  source: {
    workspaceId: run.workspace_id,
    evaluationRunId: run.id,
    documentIds: bindings.map((binding) => binding.document_id),
    sourcePackageHash: run.source_package_hash,
    documentSetHash: run.document_set_hash,
    callPlanHash: run.call_plan_hash,
    compatibilityFingerprint: run.compatibility_fingerprint,
    completedAt: run.completed_at,
    expectedAnswersUsed: run.expected_answers_used,
  },
  export: {
    exportedAt: '2026-07-28T00:00:00.000Z',
    databaseAccess: 'read_only_selects',
    providerCalls: 0,
    providerSpendUsd: 0,
    excludedFields: [
      'provider_payloads',
      'provider_responses',
      'tokens',
      'secrets',
      'authorization_headers',
      'workspace_member_data',
    ],
  },
  originalCandidateSetHash: hashCandidatePopulation(
    reviewFindings.map((finding) => finding.candidateHash),
  ),
  coverageExceptions,
  findings: reviewFindings.sort((left, right) =>
    left.candidateHash.localeCompare(right.candidateHash),
  ),
});

await mkdir('fixtures/eval', { recursive: true });
await writeFile(
  'fixtures/eval/phase9-review-acceleration-new-jersey-v1.json',
  await format(JSON.stringify(snapshot), { parser: 'json', printWidth: 100 }),
  'utf8',
);
console.info(
  JSON.stringify({
    artifactVersion: snapshot.artifactVersion,
    findings: snapshot.findings.length,
    coverageExceptions: snapshot.coverageExceptions.length,
    candidateSetHash: snapshot.originalCandidateSetHash,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);

// This exporter intentionally has no mutation helper. Keep the client type referenced so a future
// refactor cannot silently replace it with a provider gateway without TypeScript noticing.
void (admin satisfies SupabaseClient);
