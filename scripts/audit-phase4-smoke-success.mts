/** Read-only audit of a completed Phase 4 synthetic production-worker smoke. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  EXPECTED_DUPLICATE_PAIRS,
  FORBIDDEN_MERGE_PAIRS,
  VERIFICATION_CASES,
  VERIFICATION_FIXTURE_VERSION,
} from '../fixtures/eval/verification-cases.ts';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
} from '../packages/ai/src/phase4-qualified-config.ts';
import { computePhase4SmokeRunInputHash } from '../apps/worker/src/phase4-smoke-preflight.ts';

loadEnv({ path: '.env.local', override: false, quiet: true });

const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requiredArgument = (name: string) => {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`phase4_smoke_success_audit_missing:${name}`);
  return value;
};
const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`phase4_smoke_success_audit_runtime_missing:${name}`);
  return value;
};
const sum = (rows: Array<Record<string, unknown>>, field: string) =>
  rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
const pairKey = (left: string, right: string) => [left, right].sort().join(':');
const assertNoError = (label: string, result: { error: { message: string } | null }) => {
  if (result.error)
    throw new Error(`phase4_smoke_success_audit_database:${label}:${result.error.message}`);
};

const RUN_ID = requiredArgument('--verification-run-id');
const JOB_ID = requiredArgument('--processing-job-id');
const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const ANALYSIS_RUN_ID = '10000000-0000-4000-8000-000000000003';
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000002';
const SCOPE_ID = '40000000-0000-4000-8000-000000000001';
const EXPECTED_CANDIDATE_SET_HASH =
  '531c03afbabe79adb9a490dc0f7e9657ff0f85013bbf0aabe64b505a94a8ac6b';
const EXPECTED_DOCUMENT_SET_HASH =
  '46127bbb348db9374370921876e9adf0a1ca98971e970367e5e142188b04a44b';
const EXPECTED_ANSWERS_HASH = 'c67a347cf0c9dccabb8cb50336bd00f72b66bda9ee602e51fd98256cfbe3ba0a';
const EXPECTED_INPUT_HASH = computePhase4SmokeRunInputHash({
  analysisRunId: ANALYSIS_RUN_ID,
  candidateSetHash: EXPECTED_CANDIDATE_SET_HASH,
  compatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
});

const admin = createClient(
  requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const [
  runResult,
  jobResult,
  scopeResult,
  analysisResult,
  candidatesResult,
  findingsResult,
  evidenceResult,
  pagesResult,
  retrievalResult,
  envelopesResult,
  passesResult,
  callsResult,
  relationshipsResult,
  reviewsResult,
  auditsResult,
  ledgerResult,
] = await Promise.all([
  admin.from('verification_runs').select('*').eq('id', RUN_ID).single(),
  admin.from('processing_jobs').select('*').eq('id', JOB_ID).single(),
  admin.from('phase4_synthetic_smoke_scopes').select('*').eq('id', SCOPE_ID).single(),
  admin.from('analysis_runs').select('*').eq('id', ANALYSIS_RUN_ID).single(),
  admin
    .from('requirement_candidates')
    .select('*')
    .eq('analysis_run_id', ANALYSIS_RUN_ID)
    .order('id'),
  admin
    .from('verification_findings')
    .select('*')
    .eq('verification_run_id', RUN_ID)
    .order('candidate_id'),
  admin
    .from('verification_evidence')
    .select('*,verification_findings!inner(verification_run_id)')
    .eq('verification_findings.verification_run_id', RUN_ID),
  admin
    .from('document_pages')
    .select('id,document_id,workspace_id,page_number,text,extraction_status,warnings')
    .eq('document_id', DOCUMENT_ID),
  admin.from('verification_retrieval_chunks').select('*').eq('verification_run_id', RUN_ID),
  admin.from('verification_fact_envelopes').select('*').eq('verification_run_id', RUN_ID),
  admin.from('verification_pass_results').select('*').eq('verification_run_id', RUN_ID),
  admin.from('model_calls').select('*').eq('verification_run_id', RUN_ID),
  admin.from('requirement_relationships').select('*').eq('verification_run_id', RUN_ID),
  admin
    .from('human_review_decisions')
    .select('id,verification_findings!inner(verification_run_id)')
    .eq('verification_findings.verification_run_id', RUN_ID),
  admin.from('audit_events').select('*').eq('entity_id', RUN_ID),
  admin.from('spend_ledger').select('*'),
]);

for (const [label, result] of Object.entries({
  run: runResult,
  job: jobResult,
  scope: scopeResult,
  analysis: analysisResult,
  candidates: candidatesResult,
  findings: findingsResult,
  evidence: evidenceResult,
  pages: pagesResult,
  retrieval: retrievalResult,
  envelopes: envelopesResult,
  passes: passesResult,
  calls: callsResult,
  relationships: relationshipsResult,
  reviews: reviewsResult,
  audits: auditsResult,
  ledger: ledgerResult,
}))
  assertNoError(label, result);

const run = runResult.data as Record<string, unknown>;
const job = jobResult.data as Record<string, unknown>;
const scope = scopeResult.data as Record<string, unknown>;
const analysis = analysisResult.data as Record<string, unknown>;
const candidates = (candidatesResult.data ?? []) as Array<Record<string, unknown>>;
const findings = (findingsResult.data ?? []) as Array<Record<string, unknown>>;
const evidence = (evidenceResult.data ?? []) as Array<Record<string, unknown>>;
const pages = (pagesResult.data ?? []) as Array<Record<string, unknown>>;
const retrieval = (retrievalResult.data ?? []) as Array<Record<string, unknown>>;
const envelopes = (envelopesResult.data ?? []) as Array<Record<string, unknown>>;
const passes = (passesResult.data ?? []) as Array<Record<string, unknown>>;
const calls = (callsResult.data ?? []) as Array<Record<string, unknown>>;
const relationships = (relationshipsResult.data ?? []) as Array<Record<string, unknown>>;
const ledger = (ledgerResult.data ?? []) as Array<Record<string, unknown>>;
const smokeLedger = ledger.filter((row) => String(row.note ?? '').includes(RUN_ID));
const pagesById = new Map(pages.map((row) => [String(row.id), row]));
const findingsByCandidate = new Map(findings.map((row) => [String(row.candidate_id), row]));

const candidateResults = VERIFICATION_CASES.map((expected) => {
  const finding = findingsByCandidate.get(expected.id);
  const findingEvidence = finding
    ? evidence.filter((row) => String(row.finding_id) === String(finding.id))
    : [];
  const evidencePages = [...new Set(findingEvidence.map((row) => Number(row.page_number)))].sort(
    (left, right) => left - right,
  );
  return {
    candidateId: expected.id,
    title: expected.title,
    critical: Boolean(expected.expected.critical),
    expected: {
      sourceSupportStatus: expected.expected.sourceSupportStatus,
      precedenceStatus: expected.expected.precedenceStatus,
      proofRequirement: expected.expected.proofRequirement,
      pages: expected.expected.pages,
    },
    actual: finding
      ? {
          sourceSupportStatus: finding.source_support_status,
          precedenceStatus: finding.precedence_status,
          proofRequirement: finding.proof_requirement,
          machineStatus: finding.machine_status,
          decisionEngineVersion: finding.decision_engine_version,
          challengeStatus: finding.challenge_status,
        }
      : null,
    statusMatch:
      finding?.source_support_status === expected.expected.sourceSupportStatus &&
      finding?.precedence_status === expected.expected.precedenceStatus &&
      finding?.proof_requirement === expected.expected.proofRequirement,
    evidencePages,
    expectedPageEvidencePresent:
      expected.expected.pages.length === 0
        ? evidencePages.length === 0
        : evidencePages.some((page) => expected.expected.pages.includes(page)),
  };
});

const contextsByCandidate = Object.fromEntries(
  VERIFICATION_CASES.map((candidate) => [
    candidate.id,
    retrieval.filter((row) => row.candidate_id === candidate.id).length,
  ]),
);
const relationshipPairs = new Set(
  relationships.map((row) =>
    pairKey(String(row.source_candidate_id), String(row.target_candidate_id)),
  ),
);
const firstPassClean = calls.every(
  (row) =>
    row.status === 'succeeded' &&
    row.error_category === null &&
    row.incomplete_reason === null &&
    Number(row.repair_attempts) === 0 &&
    Number(row.retries) === 0,
);
const evidenceValid = evidence.every((row) => {
  const page = pagesById.get(String(row.document_page_id));
  return (
    row.workspace_id === WORKSPACE_ID &&
    row.document_id === DOCUMENT_ID &&
    row.validated === true &&
    ['exact', 'normalized_exact'].includes(String(row.match_type)) &&
    Boolean(page) &&
    page?.workspace_id === WORKSPACE_ID &&
    Number(page?.page_number) === Number(row.page_number) &&
    String(page?.text ?? '').includes(String(row.quote_exact ?? ''))
  );
});
const phase4Spend = sum(
  ledger.filter((row) => row.phase === 'phase4'),
  'estimated_cost_usd',
);
const remediationSpend = sum(
  ledger.filter(
    (row) => row.phase === 'phase4' && String(row.note ?? '').startsWith('phase4-remediation:'),
  ),
  'estimated_cost_usd',
);
const modelCost = sum(calls, 'estimated_cost_usd');
const ledgerCost = sum(smokeLedger, 'estimated_cost_usd');

const report = {
  reportVersion: 'phase4-production-worker-smoke-success-audit-v1',
  generatedAt: new Date().toISOString(),
  providerCallsMadeByThisAudit: 0,
  smoke: { verificationRunId: RUN_ID, processingJobId: JOB_ID },
  immutableProvenance: {
    fixtureVersion: scope.fixture_version,
    candidateSetHash: scope.candidate_set_hash,
    documentSetHash: scope.document_set_hash,
    expectedAnswersHash: scope.expected_answers_hash,
    compatibilityFingerprint: run.compatibility_fingerprint,
    requiredVerificationRunInputHash: run.input_hash,
  },
  execution: {
    runStatus: run.status,
    jobStatus: job.status,
    model: run.model,
    reasoning: run.reasoning_effort,
    findingCount: findings.length,
    envelopeCount: envelopes.length,
    evidenceCount: evidence.length,
    retrievalCount: retrieval.length,
    relationshipCount: relationships.length,
    passCounts: Object.fromEntries(
      ['entailment', 'challenge', 'duplicate'].map((type) => [
        type,
        passes.filter((row) => row.pass_type === type).length,
      ]),
    ),
    maxContextsObserved: Math.max(...Object.values(contextsByCandidate).map(Number)),
  },
  candidateResults,
  relationships: relationships.map((row) => ({
    sourceCandidateId: row.source_candidate_id,
    targetCandidateId: row.target_candidate_id,
    type: row.relationship_type,
    version: row.relationship_version,
    machineAssessment: row.machine_assessment,
    humanStatus: row.human_status,
    originalPage: row.original_page_number,
    addendumPage: row.addendum_page_number,
  })),
  gates: {
    projectExact:
      new URL(requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0] ===
      'uxmxkdjschbekkbnweby',
    scopeExact:
      scope.id === SCOPE_ID &&
      scope.workspace_id === WORKSPACE_ID &&
      scope.analysis_run_id === ANALYSIS_RUN_ID &&
      scope.fixture_version === VERIFICATION_FIXTURE_VERSION &&
      scope.synthetic_marker === 'phase4-synthetic-test-only' &&
      scope.candidate_set_hash === EXPECTED_CANDIDATE_SET_HASH &&
      scope.document_set_hash === EXPECTED_DOCUMENT_SET_HASH &&
      scope.expected_answers_hash === EXPECTED_ANSWERS_HASH &&
      scope.compatibility_fingerprint === PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
    exact24CandidateLinkage:
      candidates.length === 24 &&
      candidates.every(
        (row) =>
          row.workspace_id === WORKSPACE_ID &&
          row.analysis_run_id === ANALYSIS_RUN_ID &&
          row.document_id === DOCUMENT_ID,
      ),
    completeRunInputBinding: run.input_hash === EXPECTED_INPUT_HASH,
    runtimeMetadataExact:
      run.model === PHASE4_QUALIFIED_PRODUCTION_CONFIG.model &&
      run.reasoning_effort === PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.reasoning &&
      run.compatibility_fingerprint === PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT &&
      analysis.verification_compatibility_fingerprint === PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
    runAndJobCompleted: run.status === 'completed' && job.status === 'completed',
    all24ExpectedResultsMatch:
      candidateResults.length === 24 && candidateResults.every((item) => item.statusMatch),
    everyExpectedPageRepresented: candidateResults.every(
      (item) => item.expectedPageEvidencePresent,
    ),
    exactEvidenceAndPagesValid: evidenceValid,
    factsV4ForAllCandidates:
      envelopes.length === 24 &&
      envelopes.every((row) => row.envelope_version === 'verification-facts-v4'),
    all40PassesSucceeded:
      passes.length === 40 &&
      passes.every(
        (row) =>
          row.status === 'succeeded' && row.error_category === null && row.error_detail === null,
      ),
    firstPassSchemaAdherence: firstPassClean,
    zeroRepairRetryIncompleteRefusalTimeout: firstPassClean,
    maxTwoContexts: Object.values(contextsByCandidate).every((count) => Number(count) <= 2),
    machineOnlyAndReviewPending:
      findings.every((row) => row.machine_status === 'machine_assessment_only') &&
      (reviewsResult.data ?? []).length === 0,
    expectedDuplicatePairsPresent: EXPECTED_DUPLICATE_PAIRS.every(([left, right]) =>
      relationshipPairs.has(pairKey(left, right)),
    ),
    forbiddenMergePairsAbsent: FORBIDDEN_MERGE_PAIRS.every(
      ([left, right]) =>
        !relationships.some(
          (row) =>
            pairKey(String(row.source_candidate_id), String(row.target_candidate_id)) ===
              pairKey(left, right) &&
            ['exact_duplicate', 'semantic_duplicate', 'restatement'].includes(
              String(row.relationship_type),
            ),
        ),
    ),
    parentChildPersisted: relationships.some((row) => row.relationship_type === 'parent_child'),
    explicitSupersessionPersisted: relationships.some(
      (row) =>
        row.relationship_type === 'supersedes' &&
        row.original_page_number === 4 &&
        row.addendum_page_number === 5,
    ),
    auditEventPersisted: (auditsResult.data ?? []).some(
      (row) => row.event_type === 'verification_completed',
    ),
    providerLedgerReconciled: Math.abs(modelCost - ledgerCost) <= 0.000001,
    budgetsRespected: phase4Spend <= 15 && remediationSpend <= 12,
  },
  usage: {
    calls: calls.length,
    inputTokens: sum(calls, 'input_tokens'),
    outputTokens: sum(calls, 'output_tokens'),
    reasoningTokens: sum(calls, 'reasoning_tokens'),
    cachedTokens: sum(calls, 'cached_tokens'),
    latencyMs: sum(calls, 'latency_ms'),
    modelCallCostUsd: Number(modelCost.toFixed(6)),
    ledgerRows: smokeLedger.length,
    ledgerCostUsd: Number(ledgerCost.toFixed(6)),
    phase4SpendUsd: Number(phase4Spend.toFixed(6)),
    remediationSpendUsd: Number(remediationSpend.toFixed(6)),
    cumulativeApiSpendUsd: Number(sum(ledger, 'estimated_cost_usd').toFixed(6)),
  },
};

const failedGates = Object.entries(report.gates)
  .filter(([, passed]) => !passed)
  .map(([gate]) => gate);
await mkdir(resolve('artifacts/evaluation'), { recursive: true });
const artifactPath = resolve(
  'artifacts/evaluation',
  `phase4-production-worker-smoke-${RUN_ID}-success-audit.json`,
);
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.info(JSON.stringify({ artifactPath, failedGates, usage: report.usage }));
if (failedGates.length > 0) process.exitCode = 1;
