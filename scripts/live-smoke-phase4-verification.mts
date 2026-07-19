/** One explicitly scoped synthetic-only smoke through the production Phase 4 worker handler. */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
} from '../packages/ai/src/index.ts';
import {
  computeSyntheticCandidateSetHash,
  computeSyntheticDocumentSetHash,
  computeSyntheticExpectedAnswersHash,
  computePhase4SmokeRunInputHash,
  assertNextPhase4SyntheticSmokeRunVersion,
  validatePhase4SyntheticSmokePreflight,
  type Phase4SyntheticSmokeSnapshot,
  type SyntheticSmokeCandidate,
} from '../apps/worker/src/phase4-smoke-preflight.ts';
import {
  VERIFICATION_CASES,
  VERIFICATION_FIXTURE_VERSION,
} from '../fixtures/eval/verification-cases.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const required = (name: string) => {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`phase4_synthetic_smoke_preflight_failed:missing:${name}`);
  return value;
};

const dryRunProviderBoundary = process.argv.includes('--dry-run-provider-boundary');
const requestedVerificationVersion = Number(required('--verification-version'));
if (dryRunProviderBoundary) {
  if (process.env.PHASE4_SMOKE_DRY_RUN !== '1' || process.env.PHASE4_LIVE_SMOKE === '1')
    throw new Error('phase4_synthetic_smoke_preflight_failed:invalid_dry_run_mode');
} else if (process.env.PHASE4_LIVE_SMOKE !== '1') {
  throw new Error('Refusing Phase 4 live smoke: PHASE4_LIVE_SMOKE=1 is required');
}
const phase4Ceiling = Number(process.env.PHASE4_SPEND_CEILING_USD);
const remediationCeiling = Number(process.env.PHASE4_REMEDIATION_SPEND_CEILING_USD);
const smokeMaximum = Number(process.env.PHASE4_SMOKE_MAX_USD);
if (phase4Ceiling !== 15 || remediationCeiling !== 12 || smokeMaximum <= 0 || smokeMaximum > 0.75)
  throw new Error('phase4_synthetic_smoke_preflight_failed:invalid_budget_configuration');
if (!dryRunProviderBoundary && !process.env.OPENAI_API_KEY)
  throw new Error('phase4_synthetic_smoke_preflight_failed:openai_api_key_missing');

const request = {
  smokeScopeId: required('--smoke-scope-id'),
  workspaceId: required('--workspace-id'),
  authenticatedUserId: required('--synthetic-user-id'),
  documentIds: required('--document-ids')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  analysisRunId: required('--analysis-run-id'),
  expectedCompatibilityFingerprint: required('--expected-fingerprint'),
  expectedCandidateSetHash: required('--expected-candidate-set-hash'),
  expectedDocumentSetHash: required('--expected-document-set-hash'),
  expectedAnswersHash: required('--expected-answers-hash'),
  fixtureVersion: required('--fixture-version'),
};
if (request.expectedCompatibilityFingerprint !== PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT)
  throw new Error('phase4_synthetic_smoke_preflight_failed:unexpected_fingerprint_argument');
if (request.fixtureVersion !== VERIFICATION_FIXTURE_VERSION)
  throw new Error('phase4_synthetic_smoke_preflight_failed:unexpected_fixture_argument');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey)
  throw new Error('phase4_synthetic_smoke_preflight_failed:supabase_runtime_missing');
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [markerResult, memberResult, analysisResult, documentsResult, candidatesResult, spendResult] =
  await Promise.all([
    admin
      .from('phase4_synthetic_smoke_scopes')
      .select('*')
      .eq('id', request.smokeScopeId)
      .maybeSingle(),
    admin
      .from('workspace_members')
      .select('workspace_id,user_id')
      .eq('workspace_id', request.workspaceId)
      .eq('user_id', request.authenticatedUserId)
      .maybeSingle(),
    admin
      .from('analysis_runs')
      .select('id,workspace_id,document_id')
      .eq('id', request.analysisRunId)
      .maybeSingle(),
    admin
      .from('documents')
      .select('id,workspace_id,object_key,sha256,page_count,parser_name,parser_version,deleted_at')
      .eq('workspace_id', request.workspaceId)
      .is('deleted_at', null),
    admin
      .from('requirement_candidates')
      .select(
        'id,workspace_id,analysis_run_id,document_id,category,title,obligation,preliminary_page,evidence_quote',
      )
      .eq('analysis_run_id', request.analysisRunId),
    admin.from('spend_ledger').select('estimated_cost_usd,phase,note'),
  ]);
for (const result of [
  markerResult,
  memberResult,
  analysisResult,
  documentsResult,
  candidatesResult,
  spendResult,
]) {
  if (result.error)
    throw new Error(`phase4_synthetic_smoke_preflight_failed:database:${result.error.message}`);
}
const marker = markerResult.data;
const candidates: SyntheticSmokeCandidate[] = (candidatesResult.data ?? []).map((candidate) => ({
  id: candidate.id,
  workspaceId: candidate.workspace_id,
  analysisRunId: candidate.analysis_run_id,
  documentId: candidate.document_id,
  category: candidate.category,
  title: candidate.title,
  obligation: candidate.obligation,
  preliminaryPage: candidate.preliminary_page,
  evidenceQuote: candidate.evidence_quote,
}));
const snapshot: Phase4SyntheticSmokeSnapshot = {
  marker: marker
    ? {
        id: marker.id,
        workspaceId: marker.workspace_id,
        authenticatedUserId: marker.authenticated_user_id,
        analysisRunId: marker.analysis_run_id,
        fixtureVersion: marker.fixture_version,
        compatibilityFingerprint: marker.compatibility_fingerprint,
        approvedDocumentIds: marker.approved_document_ids,
        approvedCandidateIds: marker.approved_candidate_ids,
        candidateSetHash: marker.candidate_set_hash,
        documentSetHash: marker.document_set_hash,
        expectedAnswersHash: marker.expected_answers_hash,
        scopeVersion: marker.scope_version,
        syntheticMarker: marker.synthetic_marker,
      }
    : null,
  membershipPresent: Boolean(memberResult.data),
  analysisRun: analysisResult.data
    ? {
        id: analysisResult.data.id,
        workspaceId: analysisResult.data.workspace_id,
        documentId: analysisResult.data.document_id,
      }
    : null,
  documents: (documentsResult.data ?? []).map((document) => ({
    id: document.id,
    workspaceId: document.workspace_id,
    objectKey: document.object_key,
    sha256: document.sha256,
    pageCount: document.page_count,
    parserName: document.parser_name,
    parserVersion: document.parser_version,
    deletedAt: document.deleted_at,
  })),
  candidates,
};
const allSpend = spendResult.data ?? [];
const sum = (rows: typeof allSpend) =>
  rows.reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0);
const roundedUsd = (value: number) => Number(value.toFixed(6));
const phase4SpendBefore = sum(allSpend.filter((row) => row.phase === 'phase4'));
const remediationSpendBefore = sum(
  allSpend.filter((row) => row.phase === 'phase4' && row.note?.startsWith('phase4-remediation:')),
);
if (
  phase4SpendBefore + smokeMaximum > phase4Ceiling ||
  remediationSpendBefore + smokeMaximum > remediationCeiling
) {
  throw new Error('phase4_synthetic_smoke_preflight_failed:budget_reservation');
}

const expectedIds = VERIFICATION_CASES.map((candidate) => candidate.id).sort();
if (
  JSON.stringify(candidates.map((candidate) => candidate.id).sort()) !== JSON.stringify(expectedIds)
)
  throw new Error('phase4_synthetic_smoke_preflight_failed:frozen_candidate_ids');
if (marker?.candidate_set_hash !== computeSyntheticCandidateSetHash(candidates))
  throw new Error('phase4_synthetic_smoke_preflight_failed:frozen_candidate_hash');
if (marker?.document_set_hash !== computeSyntheticDocumentSetHash(snapshot.documents))
  throw new Error('phase4_synthetic_smoke_preflight_failed:frozen_document_hash');
if (marker?.expected_answers_hash !== computeSyntheticExpectedAnswersHash([...VERIFICATION_CASES]))
  throw new Error('phase4_synthetic_smoke_preflight_failed:frozen_expected_answers_hash');

const preflight = validatePhase4SyntheticSmokePreflight(
  request,
  snapshot,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
);
const inputHash = computePhase4SmokeRunInputHash({
  analysisRunId: request.analysisRunId,
  candidateSetHash: preflight.candidateSetHash,
  compatibilityFingerprint: preflight.assertedCompatibilityFingerprint,
});
const existingVersionsResult = await admin
  .from('verification_runs')
  .select('version')
  .eq('analysis_run_id', request.analysisRunId)
  .eq('input_hash', inputHash);
if (existingVersionsResult.error) {
  throw new Error(
    `phase4_synthetic_smoke_preflight_failed:database:${existingVersionsResult.error.message}`,
  );
}
const verificationVersion = assertNextPhase4SyntheticSmokeRunVersion(
  requestedVerificationVersion,
  (existingVersionsResult.data ?? []).map((row) => Number(row.version)),
);

if (dryRunProviderBoundary) {
  console.info(
    JSON.stringify({
      reportVersion: 'phase4-production-worker-smoke-dry-run-v1',
      providerConstructed: false,
      providerCalled: false,
      stoppedAt: 'final_provider_access_boundary',
      budget: {
        phase4SpendBefore: roundedUsd(phase4SpendBefore),
        remediationSpendBefore: roundedUsd(remediationSpendBefore),
        smokeMaximum,
        projectedPhase4Maximum: roundedUsd(phase4SpendBefore + smokeMaximum),
        projectedRemediationMaximum: roundedUsd(remediationSpendBefore + smokeMaximum),
        phase4Ceiling,
        remediationCeiling,
      },
      syntheticScope: {
        ...request,
        candidateCount: candidates.length,
        verificationVersion,
        assertedCandidateSetHash: preflight.candidateSetHash,
        assertedDocumentSetHash: preflight.documentSetHash,
        assertedExpectedAnswersHash: preflight.expectedAnswersHash,
      },
    }),
  );
  process.exit(0);
}

// The live worker flag is process-local and is set only after every synthetic preflight passes.
process.env.PHASE4_LIVE_VERIFICATION_ENABLED = 'true';
process.env.OPENAI_VERIFY_MODEL = PHASE4_QUALIFIED_PRODUCTION_CONFIG.model;
process.env.OPENAI_REASONING_EFFORT = PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.reasoning;
process.env.PHASE4_SPEND_CEILING_USD = String(phase4Ceiling);

const verificationRunId = randomUUID();
const processingJobId = randomUUID();
const { error: runInsertError } = await admin.from('verification_runs').insert({
  id: verificationRunId,
  workspace_id: request.workspaceId,
  analysis_run_id: request.analysisRunId,
  status: 'queued',
  version: verificationVersion,
  input_hash: inputHash,
  prompt_version: 'verify-entailment-v7+verify-challenge-v4',
  schema_version: 'verification-entailment-v5+verification-challenge-v4',
  retrieval_version: 'verify-retrieval-v2-candidate-centered',
  normalization_version: 'evidence-nfkc-v1',
  compatibility_fingerprint: preflight.assertedCompatibilityFingerprint,
  created_by: request.authenticatedUserId,
  candidate_count: candidates.length,
});
if (runInsertError) throw new Error(`phase4_smoke_setup_failed:${runInsertError.message}`);
const { error: jobInsertError } = await admin.from('processing_jobs').insert({
  id: processingJobId,
  workspace_id: request.workspaceId,
  document_id: snapshot.analysisRun!.documentId,
  stage: 'verify',
  status: 'queued',
  input_hash: inputHash,
  max_attempts: 1,
});
if (jobInsertError) throw new Error(`phase4_smoke_setup_failed:${jobInsertError.message}`);

const { handleVerifyJob } = await import('../apps/worker/src/verify-requirements.ts');
await handleVerifyJob({
  workspaceId: request.workspaceId,
  analysisRunId: request.analysisRunId,
  verificationRunId,
  processingJobId,
});

const [
  runResult,
  jobResult,
  callsResult,
  findingsResult,
  evidenceResult,
  retrievalResult,
  envelopesResult,
  passesResult,
  relationshipsResult,
  reviewsResult,
  auditsResult,
  ledgerResult,
] = await Promise.all([
  admin.from('verification_runs').select('*').eq('id', verificationRunId).single(),
  admin.from('processing_jobs').select('*').eq('id', processingJobId).single(),
  admin.from('model_calls').select('*').eq('verification_run_id', verificationRunId),
  admin.from('verification_findings').select('*').eq('verification_run_id', verificationRunId),
  admin
    .from('verification_evidence')
    .select('*,verification_findings!inner(verification_run_id)')
    .eq('verification_findings.verification_run_id', verificationRunId),
  admin
    .from('verification_retrieval_chunks')
    .select('*')
    .eq('verification_run_id', verificationRunId),
  admin
    .from('verification_fact_envelopes')
    .select('*')
    .eq('verification_run_id', verificationRunId),
  admin.from('verification_pass_results').select('*').eq('verification_run_id', verificationRunId),
  admin.from('requirement_relationships').select('*').eq('verification_run_id', verificationRunId),
  admin
    .from('human_review_decisions')
    .select('id,verification_findings!inner(verification_run_id)')
    .eq('verification_findings.verification_run_id', verificationRunId),
  admin.from('audit_events').select('*').eq('entity_id', verificationRunId),
  admin.from('spend_ledger').select('*').eq('analysis_run_id', request.analysisRunId),
]);
for (const result of [
  runResult,
  jobResult,
  callsResult,
  findingsResult,
  evidenceResult,
  retrievalResult,
  envelopesResult,
  passesResult,
  relationshipsResult,
  reviewsResult,
  auditsResult,
  ledgerResult,
]) {
  if (result.error) throw new Error(`phase4_smoke_observability_failed:${result.error.message}`);
}
const findings = findingsResult.data ?? [];
const findingsByCandidate = new Map(findings.map((finding) => [finding.candidate_id, finding]));
const expectedFindingsMatch = VERIFICATION_CASES.every((candidate) => {
  const finding = findingsByCandidate.get(candidate.id);
  return (
    finding?.source_support_status === candidate.expected.sourceSupportStatus &&
    finding?.precedence_status === candidate.expected.precedenceStatus &&
    finding?.proof_requirement === candidate.expected.proofRequirement
  );
});
const calls = callsResult.data ?? [];
const smokeLedger = (ledgerResult.data ?? []).filter((row) =>
  String(row.note ?? '').includes(verificationRunId),
);
const smokeCostUsd = sum(smokeLedger);
const report = {
  reportVersion: 'phase4-production-worker-smoke-v1',
  generatedAt: new Date().toISOString(),
  syntheticScope: {
    smokeScopeId: request.smokeScopeId,
    workspaceId: request.workspaceId,
    authenticatedUserId: request.authenticatedUserId,
    documentIds: request.documentIds,
    analysisRunId: request.analysisRunId,
    fixtureVersion: request.fixtureVersion,
    verificationVersion,
    candidateSetHash: preflight.candidateSetHash,
    documentSetHash: preflight.documentSetHash,
    expectedAnswersHash: preflight.expectedAnswersHash,
  },
  verificationRunId,
  processingJobId,
  model: PHASE4_QUALIFIED_PRODUCTION_CONFIG.model,
  compatibilityFingerprint: preflight.assertedCompatibilityFingerprint,
  budget: {
    phase4SpendBefore: roundedUsd(phase4SpendBefore),
    remediationSpendBefore: roundedUsd(remediationSpendBefore),
    smokeMaximum,
    projectedPhase4Maximum: roundedUsd(phase4SpendBefore + smokeMaximum),
    projectedRemediationMaximum: roundedUsd(remediationSpendBefore + smokeMaximum),
    phase4Ceiling,
    remediationCeiling,
  },
  checks: {
    runCompleted: runResult.data.status === 'completed',
    jobCompleted: jobResult.data.status === 'completed',
    expectedFindingsMatch,
    findingCount: findings.length,
    candidateCount: candidates.length,
    modelMetadataComplete: calls.every(
      (call) =>
        call.model === PHASE4_QUALIFIED_PRODUCTION_CONFIG.model &&
        call.compatibility_fingerprint === preflight.assertedCompatibilityFingerprint,
    ),
    noRepairRetryOrIncomplete: calls.every(
      (call) =>
        call.repair_attempts === 0 &&
        call.retries === 0 &&
        call.status === 'succeeded' &&
        call.incomplete_reason === null,
    ),
    contextsBounded: (retrievalResult.data ?? []).every(
      (row, _, rows) => rows.filter((item) => item.candidate_id === row.candidate_id).length <= 2,
    ),
    factsComplete:
      (envelopesResult.data ?? []).length === candidates.length &&
      (envelopesResult.data ?? []).every((row) => row.envelope_version === 'verification-facts-v4'),
    passesPersisted: (passesResult.data ?? []).length > 0,
    evidenceValidated: (evidenceResult.data ?? []).every(
      (row) => row.validated && ['exact', 'normalized_exact'].includes(row.match_type),
    ),
    pagesResolve: (evidenceResult.data ?? []).every((row) => row.page_number >= 1),
    parentChildPersisted: (relationshipsResult.data ?? []).some(
      (row) => row.relationship_type === 'parent_child',
    ),
    machineOnly: findings.every((finding) => finding.machine_status === 'machine_assessment_only'),
    humanReviewStatusPending: (reviewsResult.data ?? []).length === 0,
    auditEventPersisted: (auditsResult.data ?? []).some(
      (event) => event.event_type === 'verification_completed',
    ),
    spendLedgerPersisted: smokeLedger.length > 0 && smokeCostUsd <= smokeMaximum,
    unsupportedNeverVerified: findings
      .filter((finding) => finding.source_support_status === 'unsupported')
      .every((finding) => finding.machine_status === 'machine_assessment_only'),
    sourceNavigationPattern: '/w/{workspaceId}/documents/{documentId}?page={pageNumber}',
  },
  usage: {
    calls: calls.length,
    inputTokens: calls.reduce((total, call) => total + Number(call.input_tokens ?? 0), 0),
    outputTokens: calls.reduce((total, call) => total + Number(call.output_tokens ?? 0), 0),
    reasoningTokens: calls.reduce((total, call) => total + Number(call.reasoning_tokens ?? 0), 0),
    cachedTokens: calls.reduce((total, call) => total + Number(call.cached_tokens ?? 0), 0),
    latencyMs: calls.reduce((total, call) => total + Number(call.latency_ms ?? 0), 0),
    costUsd: Number(smokeCostUsd.toFixed(6)),
  },
};
const artifactDir = resolve('artifacts/evaluation');
await mkdir(artifactDir, { recursive: true });
await writeFile(
  resolve(artifactDir, `phase4-production-worker-smoke-${verificationRunId}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
console.info(JSON.stringify(report));
if (
  Object.entries(report.checks).some(([key, value]) => key !== 'sourceNavigationPattern' && !value)
)
  process.exitCode = 1;
