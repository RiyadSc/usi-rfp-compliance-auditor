/** Read-only audit of the one authorized Phase 4 production-path smoke. No provider construction. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  VERIFICATION_CASES,
  EXPECTED_DUPLICATE_PAIRS,
  FORBIDDEN_MERGE_PAIRS,
} from '../fixtures/eval/verification-cases.ts';
import {
  PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  PHASE4_QUALIFIED_PRODUCTION_CONFIG,
} from '../packages/ai/src/phase4-qualified-config.ts';
import { computePhase4SmokeRunInputHash } from '../apps/worker/src/phase4-smoke-preflight.ts';

loadEnv({ path: '.env.local', override: false, quiet: true });

const RUN_ID = 'c21e53fb-873b-4fca-aa90-43a7e0dd1d95';
const JOB_ID = '8f9efadb-a738-48d1-8bc7-302f70069fd7';
const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const ANALYSIS_RUN_ID = '10000000-0000-4000-8000-000000000003';
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000002';
const CANDIDATE_SET_HASH = '531c03afbabe79adb9a490dc0f7e9657ff0f85013bbf0aabe64b505a94a8ac6b';
const DEFECTIVE_INPUT_HASH = createHash('sha256')
  .update(`${ANALYSIS_RUN_ID}:undefined:undefined`)
  .digest('hex');
const EXPECTED_INPUT_HASH = computePhase4SmokeRunInputHash({
  analysisRunId: ANALYSIS_RUN_ID,
  candidateSetHash: CANDIDATE_SET_HASH,
  compatibilityFingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`phase4_smoke_audit_missing_runtime:${name}`);
  return value;
}
function sum(rows: Array<Record<string, unknown>>, field: string): number {
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}
function pairKey(left: string, right: string): string {
  return [left, right].sort().join(':');
}
function assertNoError(label: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`phase4_smoke_audit_database:${label}:${result.error.message}`);
}

const admin = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const [
  runResult,
  jobResult,
  analysisResult,
  candidateResult,
  findingsResult,
  evidenceResult,
  pagesResult,
  retrievalResult,
  envelopeResult,
  passResult,
  callsResult,
  relationshipsResult,
  reviewsResult,
  auditResult,
  ledgerResult,
] = await Promise.all([
  admin.from('verification_runs').select('*').eq('id', RUN_ID).single(),
  admin.from('processing_jobs').select('*').eq('id', JOB_ID).single(),
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
  admin.from('verification_evidence').select('*').eq('workspace_id', WORKSPACE_ID),
  admin
    .from('document_pages')
    .select('id,document_id,workspace_id,page_number,text,text_sha256,extraction_status,warnings')
    .eq('document_id', DOCUMENT_ID),
  admin.from('verification_retrieval_chunks').select('*').eq('verification_run_id', RUN_ID),
  admin.from('verification_fact_envelopes').select('*').eq('verification_run_id', RUN_ID),
  admin.from('verification_pass_results').select('*').eq('verification_run_id', RUN_ID),
  admin.from('model_calls').select('*').eq('verification_run_id', RUN_ID),
  admin.from('requirement_relationships').select('*').eq('verification_run_id', RUN_ID),
  admin.from('human_review_decisions').select('*').eq('workspace_id', WORKSPACE_ID),
  admin.from('audit_events').select('*').eq('entity_id', RUN_ID),
  admin.from('spend_ledger').select('*').eq('analysis_run_id', ANALYSIS_RUN_ID),
]);

for (const [label, result] of Object.entries({
  run: runResult,
  job: jobResult,
  analysis: analysisResult,
  candidates: candidateResult,
  findings: findingsResult,
  evidence: evidenceResult,
  pages: pagesResult,
  retrieval: retrievalResult,
  envelopes: envelopeResult,
  passes: passResult,
  calls: callsResult,
  relationships: relationshipsResult,
  reviews: reviewsResult,
  audits: auditResult,
  ledger: ledgerResult,
}))
  assertNoError(label, result);

const run = runResult.data as Record<string, unknown>;
const job = jobResult.data as Record<string, unknown>;
const analysis = analysisResult.data as Record<string, unknown>;
const candidates = (candidateResult.data ?? []) as Array<Record<string, unknown>>;
const findings = (findingsResult.data ?? []) as Array<Record<string, unknown>>;
const findingIds = new Set(findings.map((row) => String(row.id)));
const evidence = ((evidenceResult.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
  findingIds.has(String(row.finding_id)),
);
const pages = (pagesResult.data ?? []) as Array<Record<string, unknown>>;
const retrieval = (retrievalResult.data ?? []) as Array<Record<string, unknown>>;
const envelopes = (envelopeResult.data ?? []) as Array<Record<string, unknown>>;
const passes = (passResult.data ?? []) as Array<Record<string, unknown>>;
const calls = (callsResult.data ?? []) as Array<Record<string, unknown>>;
const relationships = (relationshipsResult.data ?? []) as Array<Record<string, unknown>>;
const smokeLedger = ((ledgerResult.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
  String(row.note ?? '').includes(RUN_ID),
);
const pagesById = new Map(pages.map((row) => [String(row.id), row]));
const findingsByCandidate = new Map(findings.map((row) => [String(row.candidate_id), row]));

const candidateResults = VERIFICATION_CASES.map((expected) => {
  const finding = findingsByCandidate.get(expected.id);
  const findingEvidence = finding
    ? evidence.filter((row) => String(row.finding_id) === String(finding.id))
    : [];
  const evidencePages = [...new Set(findingEvidence.map((row) => Number(row.page_number)))].sort(
    (a, b) => a - b,
  );
  const evidenceIntegrity = findingEvidence.map((row) => {
    const page = pagesById.get(String(row.document_page_id));
    const quote = String(row.quote_exact ?? '');
    return {
      evidenceRole: row.evidence_role,
      pageNumber: row.page_number,
      matchType: row.match_type,
      validated: row.validated,
      pageExists: Boolean(page),
      quoteOccursOnPage: Boolean(page && String(page.text ?? '').includes(quote)),
      documentMatches: row.document_id === DOCUMENT_ID && page?.document_id === DOCUMENT_ID,
    };
  });
  // Fixture pages are the allowed citation set, not a requirement to duplicate every
  // confirming/restatement/addendum page on each finding. One exact validated citation
  // on an allowed page is sufficient; zero-page negative/parser cases persist no quote.
  const expectedPageEvidencePresent =
    expected.expected.pages.length === 0
      ? evidencePages.length === 0
      : evidencePages.some((page) => expected.expected.pages.includes(page));
  return {
    candidateId: expected.id,
    title: expected.title,
    critical: Boolean(expected.expected.critical),
    expected: expected.expected,
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
    expectedPageEvidencePresent,
    evidenceIntegrity,
  };
});

const contextsByCandidate = Object.fromEntries(
  VERIFICATION_CASES.map((candidate) => [
    candidate.id,
    retrieval.filter((row) => row.candidate_id === candidate.id).length,
  ]),
);
const passCounts = Object.fromEntries(
  ['entailment', 'challenge', 'duplicate'].map((passType) => [
    passType,
    passes.filter((row) => row.pass_type === passType).length,
  ]),
);
const callCounts = Object.fromEntries(
  ['verify_entailment', 'verify_challenge', 'verify_duplicate'].map((stage) => [
    stage,
    calls.filter((row) => row.stage === stage).length,
  ]),
);
const relationshipPairs = new Set(
  relationships.map((row) =>
    pairKey(String(row.source_candidate_id), String(row.target_candidate_id)),
  ),
);
const expectedDuplicatePairsPresent = EXPECTED_DUPLICATE_PAIRS.every(([left, right]) =>
  relationshipPairs.has(pairKey(left, right)),
);
const forbiddenMergePairsAbsent = FORBIDDEN_MERGE_PAIRS.every(
  ([left, right]) =>
    !relationships.some(
      (row) =>
        pairKey(String(row.source_candidate_id), String(row.target_candidate_id)) ===
          pairKey(left, right) &&
        ['exact_duplicate', 'semantic_duplicate', 'restatement'].includes(
          String(row.relationship_type),
        ),
    ),
);
const exactMetadata = {
  model: PHASE4_QUALIFIED_PRODUCTION_CONFIG.model,
  fingerprint: PHASE4_APPROVED_COMPATIBILITY_FINGERPRINT,
  entailment: {
    prompt: PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.entailmentPromptVersion,
    schema: PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.entailmentSchemaVersion,
  },
  challenge: {
    prompt: PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.challengePromptVersion,
    schema: PHASE4_QUALIFIED_PRODUCTION_CONFIG.compatibility.challengeSchemaVersion,
  },
};
const callsMetadataExact = calls.every((row) => {
  if (
    row.model !== exactMetadata.model ||
    row.compatibility_fingerprint !== exactMetadata.fingerprint ||
    row.status !== 'succeeded' ||
    Number(row.repair_attempts) !== 0 ||
    Number(row.retries) !== 0 ||
    row.incomplete_reason !== null
  )
    return false;
  if (row.stage === 'verify_entailment')
    return (
      row.prompt_version === exactMetadata.entailment.prompt &&
      row.schema_version === exactMetadata.entailment.schema
    );
  if (row.stage === 'verify_challenge')
    return (
      row.prompt_version === exactMetadata.challenge.prompt &&
      row.schema_version === exactMetadata.challenge.schema
    );
  return row.stage === 'verify_duplicate';
});

const report = {
  reportVersion: 'phase4-production-worker-smoke-failure-trace-v1',
  generatedAt: new Date().toISOString(),
  providerCallsMadeByThisAudit: 0,
  smoke: { verificationRunId: RUN_ID, processingJobId: JOB_ID },
  failure: {
    category: 'orchestration_provenance_binding',
    providerExecutionCompleted: true,
    exactCause:
      'The harness assigned runAfterPhase4SyntheticSmokePreflight execute() output to preflight; execute returned only {passed:true}. Candidate-set and compatibility hashes were therefore undefined when the verification-run input hash was constructed and when the report checked model metadata.',
    persistedInputHash: run.input_hash,
    defectiveUndefinedMaterialHash: DEFECTIVE_INPUT_HASH,
    requiredInputHash: EXPECTED_INPUT_HASH,
    persistedHashMatchesDefect: run.input_hash === DEFECTIVE_INPUT_HASH,
    persistedHashMatchesRequiredBinding: run.input_hash === EXPECTED_INPUT_HASH,
    modelCallFingerprintActuallyComplete: callsMetadataExact,
    consequence:
      'The provider and all candidate decisions completed, but verification-run provenance is incomplete. The smoke must fail and cannot be rerun without new authorization.',
  },
  scope: {
    workspaceId: WORKSPACE_ID,
    analysisRunId: ANALYSIS_RUN_ID,
    documentId: DOCUMENT_ID,
    candidateCount: candidates.length,
    allRowsWorkspaceScoped:
      candidates.every(
        (row) => row.workspace_id === WORKSPACE_ID && row.analysis_run_id === ANALYSIS_RUN_ID,
      ) &&
      findings.every(
        (row) => row.workspace_id === WORKSPACE_ID && row.analysis_run_id === ANALYSIS_RUN_ID,
      ) &&
      evidence.every((row) => row.workspace_id === WORKSPACE_ID) &&
      retrieval.every(
        (row) => row.workspace_id === WORKSPACE_ID && row.analysis_run_id === ANALYSIS_RUN_ID,
      ),
  },
  execution: {
    runStatus: run.status,
    jobStatus: job.status,
    analysisFingerprint: analysis.verification_compatibility_fingerprint,
    runFingerprint: run.compatibility_fingerprint,
    findingCount: findings.length,
    envelopeCount: envelopes.length,
    evidenceCount: evidence.length,
    retrievalCount: retrieval.length,
    relationshipCount: relationships.length,
    passCounts,
    callCounts,
    maxContextsObserved: Math.max(...Object.values(contextsByCandidate).map(Number)),
    contextsByCandidate,
  },
  candidateResults,
  gates: {
    all24ExpectedResultsMatch:
      candidateResults.length === 24 && candidateResults.every((item) => item.statusMatch),
    everyExpectedPageRepresented: candidateResults.every(
      (item) => item.expectedPageEvidencePresent,
    ),
    everyPersistedEvidenceExactAndResolvable: evidence.every((row) => {
      const page = pagesById.get(String(row.document_page_id));
      return (
        row.validated === true &&
        ['exact', 'normalized_exact'].includes(String(row.match_type)) &&
        row.document_id === DOCUMENT_ID &&
        Boolean(page) &&
        String(page?.text ?? '').includes(String(row.quote_exact ?? ''))
      );
    }),
    factEnvelopeV4ForAllCandidates:
      envelopes.length === 24 &&
      envelopes.every((row) => row.envelope_version === 'verification-facts-v4'),
    allPassResultsSucceeded: passes.every(
      (row) => row.status === 'succeeded' && row.result?.machineOnly === true,
    ),
    exactModelCallMetadata: callsMetadataExact,
    zeroRepairRetryIncompleteRefusalTimeout: calls.every(
      (row) =>
        row.status === 'succeeded' &&
        Number(row.repair_attempts) === 0 &&
        Number(row.retries) === 0 &&
        row.incomplete_reason === null &&
        row.error_category === null,
    ),
    maxTwoContexts: Object.values(contextsByCandidate).every((count) => Number(count) <= 2),
    machineOnlyAndReviewPending:
      findings.every((row) => row.machine_status === 'machine_assessment_only') &&
      ((reviewsResult.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
        findingIds.has(String(row.finding_id)),
      ).length === 0,
    expectedDuplicatePairsPresent,
    forbiddenMergePairsAbsent,
    auditEventPersisted: ((auditResult.data ?? []) as Array<Record<string, unknown>>).some(
      (row) => row.event_type === 'verification_completed',
    ),
    persistedRunInputBindingValid: run.input_hash === EXPECTED_INPUT_HASH,
  },
  usage: {
    modelCalls: calls.length,
    inputTokens: sum(calls, 'input_tokens'),
    outputTokens: sum(calls, 'output_tokens'),
    reasoningTokens: sum(calls, 'reasoning_tokens'),
    cachedTokens: sum(calls, 'cached_tokens'),
    latencyMs: sum(calls, 'latency_ms'),
    modelCallEstimatedCostUsd: Number(sum(calls, 'estimated_cost_usd').toFixed(6)),
    ledgerRows: smokeLedger.length,
    ledgerCostUsd: Number(sum(smokeLedger, 'estimated_cost_usd').toFixed(6)),
    reconciled:
      Math.abs(sum(calls, 'estimated_cost_usd') - sum(smokeLedger, 'estimated_cost_usd')) <=
      0.000001,
  },
};

await mkdir(resolve('artifacts/evaluation'), { recursive: true });
const artifactPath = resolve(
  'artifacts/evaluation',
  `phase4-production-worker-smoke-${RUN_ID}-failure-trace.json`,
);
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.info(
  JSON.stringify({
    artifactPath,
    failure: report.failure,
    gates: report.gates,
    usage: report.usage,
  }),
);
