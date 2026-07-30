import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  PHASE8_DEMO_SCOPE_ID,
  PHASE8_DEMO_WORKSPACE_ID,
  PHASE8_PROPOSAL_AUDIT_RUN_ID,
  PHASE8_REPORT_RUN_ID,
  PHASE8_SOURCE_DOCUMENT_ID,
  PHASE9_REVIEW_CANDIDATE_SET_HASH,
  PHASE9_REVIEW_DEMO_EXPECTED,
  PHASE9_REVIEW_DEMO_MARKER,
  PHASE9_REVIEW_DEMO_SCOPE_ID,
  PHASE9_REVIEW_DEMO_SCOPE_VERSION,
  PHASE9_REVIEW_DOCUMENT_SET_HASH,
  PHASE9_REVIEW_EXPECTED_ANSWER_HASH,
  PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH,
  PHASE9_REVIEW_SOURCE_PACKAGE_HASH,
} from './lib/phase8-prepared-demo';
import { evaluateGuidedTourStaticReadiness } from './lib/guided-tour-readiness';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`guided_tour_readiness_refuses_live_flag:${flag}`);

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const demoEmail = process.env.DEMO_USER_A_EMAIL?.trim();
const demoPassword = process.env.DEMO_USER_A_PASSWORD?.trim();
if (!url || !serviceRoleKey || !anonKey || !demoEmail || !demoPassword)
  throw new Error('guided_tour_connected_runtime_missing');
if (new URL(url).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('guided_tour_connected_project_mismatch');

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const member = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signIn = await member.auth.signInWithPassword({
  email: demoEmail,
  password: demoPassword,
});
if (signIn.error || !signIn.data.user)
  throw new Error('guided_tour_connected_synthetic_identity_failed');
const staticReadiness = evaluateGuidedTourStaticReadiness();

const { data: scope, error: scopeError } = await admin
  .from('phase9_review_demo_scopes')
  .select('*')
  .eq('id', PHASE9_REVIEW_DEMO_SCOPE_ID)
  .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
  .maybeSingle();
if (scopeError || !scope) throw new Error('guided_tour_demo_scope_missing');

const { data: phase8Scope, error: phase8ScopeError } = await admin
  .from('phase8_demo_scopes')
  .select('authorized_identity_id')
  .eq('id', PHASE8_DEMO_SCOPE_ID)
  .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
  .maybeSingle();
if (phase8ScopeError || !phase8Scope)
  throw new Error('guided_tour_connected_identity_scope_missing');

const { error: resetError } = await admin.rpc('reset_phase9_review_demo', {
  p_workspace_id: PHASE8_DEMO_WORKSPACE_ID,
  p_demo_scope_id: PHASE9_REVIEW_DEMO_SCOPE_ID,
  p_actor_id: phase8Scope.authorized_identity_id,
});
if (resetError) throw new Error(`guided_tour_connected_reset_failed:${resetError.message}`);

const { data: state, error: stateError } = await admin
  .from('phase9_review_demo_states')
  .select('active_evaluation_run_id,state_version')
  .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
  .eq('demo_scope_id', PHASE9_REVIEW_DEMO_SCOPE_ID)
  .maybeSingle();
if (stateError || !state) throw new Error('guided_tour_demo_state_missing');
const runId = String(state.active_evaluation_run_id);

const [
  runResult,
  documentResult,
  seedResult,
  findingResult,
  blockResult,
  queueResult,
  coverageResult,
  proposalResult,
  reportResult,
  sourcePageResult,
] = await Promise.all([
  admin
    .from('phase9_evaluation_runs')
    .select(
      'id,status,source_package_hash,document_set_hash,expected_answer_hash,compatibility_fingerprint,actual_usd,provider_call_count,expected_answers_used',
    )
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('id', runId)
    .maybeSingle(),
  admin
    .from('phase9_evaluation_documents')
    .select('document_id,source_hash,page_count,ordinal')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('evaluation_run_id', runId),
  admin
    .from('phase9_candidate_seeds')
    .select('candidate_hash')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('evaluation_run_id', runId),
  admin
    .from('phase9_findings')
    .select('candidate_hash')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('evaluation_run_id', runId),
  admin
    .from('phase9_source_block_coverage')
    .select('block_hash')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('evaluation_run_id', runId),
  member.rpc('get_phase9_review_queue', {
    p_workspace_id: PHASE8_DEMO_WORKSPACE_ID,
    p_evaluation_run_id: runId,
    p_lane: 'all',
    p_search: '',
    p_duplicate_signature: null,
    p_page: 1,
    p_page_size: 50,
  }),
  member
    .from('phase9_coverage_exception_pages_v1')
    .select('source_document_id,page_number,exception_reason')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('evaluation_run_id', runId),
  admin
    .from('proposal_audit_runs')
    .select('id,status')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('id', PHASE8_PROPOSAL_AUDIT_RUN_ID)
    .maybeSingle(),
  admin
    .from('report_generation_runs')
    .select('id,status')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('id', PHASE8_REPORT_RUN_ID)
    .maybeSingle(),
  admin
    .from('document_pages')
    .select('document_id,page_number,text')
    .eq('workspace_id', PHASE8_DEMO_WORKSPACE_ID)
    .eq('document_id', PHASE8_SOURCE_DOCUMENT_ID)
    .eq('page_number', 18)
    .maybeSingle(),
]);

for (const [name, result] of Object.entries({
  runResult,
  documentResult,
  seedResult,
  findingResult,
  blockResult,
  queueResult,
  coverageResult,
  proposalResult,
  reportResult,
  sourcePageResult,
}))
  if (result.error) throw new Error(`guided_tour_${name}_failed:${result.error.message}`);

const shaSet = (values: string[]) =>
  createHash('sha256')
    .update([...values].sort().join('\n'))
    .digest('hex');
const queuePayload = queueResult.data as {
  total?: number;
  rows?: Array<{
    candidate_hash: string;
    review_lane: string;
    batch_accept_eligible: boolean;
    batch_duplicate_reject_eligible: boolean;
    source_document_id: string | null;
    page_number: number | null;
    quote_match_type: string;
  }>;
} | null;
const queue = queuePayload?.rows ?? [];
const checks = {
  staticReadiness: staticReadiness.passed,
  immutableScope:
    scope.synthetic_marker === PHASE9_REVIEW_DEMO_MARKER &&
    scope.scope_version === PHASE9_REVIEW_DEMO_SCOPE_VERSION,
  exactScopeBinding:
    scope.source_package_hash === PHASE9_REVIEW_SOURCE_PACKAGE_HASH &&
    scope.document_set_hash === PHASE9_REVIEW_DOCUMENT_SET_HASH &&
    scope.expected_answer_hash === PHASE9_REVIEW_EXPECTED_ANSWER_HASH &&
    scope.candidate_set_hash === PHASE9_REVIEW_CANDIDATE_SET_HASH &&
    scope.source_block_set_hash === PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH,
  activeRunProviderFree:
    runResult.data?.status === 'completed' &&
    Number(runResult.data?.actual_usd) === 0 &&
    runResult.data?.provider_call_count === 0 &&
    runResult.data?.expected_answers_used === false,
  exactDocumentPopulation:
    documentResult.data?.length === 1 &&
    documentResult.data[0]?.document_id === PHASE8_SOURCE_DOCUMENT_ID,
  exactCandidatePopulation:
    seedResult.data?.length === PHASE9_REVIEW_DEMO_EXPECTED.candidateSeeds &&
    shaSet((seedResult.data ?? []).map((row) => row.candidate_hash)) ===
      PHASE9_REVIEW_CANDIDATE_SET_HASH,
  exactFindingPopulation:
    findingResult.data?.length === PHASE9_REVIEW_DEMO_EXPECTED.findings &&
    queuePayload?.total === PHASE9_REVIEW_DEMO_EXPECTED.findings,
  exactSourcePopulation:
    blockResult.data?.length === PHASE9_REVIEW_DEMO_EXPECTED.sourceBlocks &&
    shaSet((blockResult.data ?? []).map((row) => row.block_hash)) ===
      PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH,
  requiredReviewExamples:
    queue.some((row) => row.review_lane === 'critical') &&
    queue.some((row) => row.review_lane === 'routine' && row.batch_accept_eligible) &&
    queue.some((row) => row.review_lane === 'duplicate' && row.batch_duplicate_reject_eligible),
  exactCoverageExamples:
    coverageResult.data?.length === PHASE9_REVIEW_DEMO_EXPECTED.coverageExceptions,
  sourceCitationAvailable:
    Boolean(sourcePageResult.data?.text) &&
    sourcePageResult.data?.document_id === PHASE8_SOURCE_DOCUMENT_ID,
  proposalAuditAvailable: proposalResult.data?.status === 'completed',
  readinessReportAvailable: reportResult.data?.status === 'completed',
  stateVersionValid: state.state_version === 'phase9-review-demo-state-v1',
};

const result = {
  version: 'guided-tour-connected-readiness-v1',
  providerRequired: false,
  projectRef: PROJECT_REF,
  workspaceId: PHASE8_DEMO_WORKSPACE_ID,
  demoScopeId: PHASE9_REVIEW_DEMO_SCOPE_ID,
  activeEvaluationRunId: runId,
  counts: {
    documents: documentResult.data?.length ?? 0,
    candidateSeeds: seedResult.data?.length ?? 0,
    findings: findingResult.data?.length ?? 0,
    sourceBlocks: blockResult.data?.length ?? 0,
    coverageExceptions: coverageResult.data?.length ?? 0,
  },
  checks,
  passed: Object.values(checks).every(Boolean),
};
console.info(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
