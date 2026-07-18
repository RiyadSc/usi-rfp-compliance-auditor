/** Provision the one complete, immutable, synthetic-only Phase 4 smoke scope. */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { VERIFICATION_CASES, VERIFICATION_PAGES_V2 } from '../fixtures/eval/verification-cases.ts';
import {
  phase4SyntheticManifest,
  PHASE4_SYNTHETIC_PARSER_VERSION,
  PHASE4_SYNTHETIC_PROJECT_REF,
} from './lib/phase4-complete-synthetic-scope.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const requiredArgument = (name: string) => {
  const value = process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
  if (!value) throw new Error(`phase4_scope_provision_failed:missing:${name}`);
  return value;
};
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const deterministicId = (prefix: string, number: number) =>
  `${prefix}-0000-4000-8000-${String(number).padStart(12, '0')}`;

if (process.env.PHASE4_PROVISION_SYNTHETIC_SCOPE !== '1')
  throw new Error('phase4_scope_provision_failed:explicit_flag_required');
const expectedProjectRef = requiredArgument('--expected-project-ref');
const syntheticUserId = requiredArgument('--synthetic-user-id');
if (expectedProjectRef !== PHASE4_SYNTHETIC_PROJECT_REF)
  throw new Error('phase4_scope_provision_failed:unexpected_project_argument');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('phase4_scope_provision_failed:supabase_runtime_missing');
const actualProjectRef = new URL(url).hostname.split('.')[0];
if (actualProjectRef !== expectedProjectRef)
  throw new Error('phase4_scope_provision_failed:project_ref_mismatch');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manifest = phase4SyntheticManifest();
if (manifest.candidates.length !== 24 || VERIFICATION_CASES.length !== 24)
  throw new Error('phase4_scope_provision_failed:frozen_candidate_count');
if (manifest.candidateIds.length !== new Set(manifest.candidateIds).size)
  throw new Error('phase4_scope_provision_failed:duplicate_candidate_id');

const beforeLedger = await admin.from('spend_ledger').select('estimated_cost_usd,phase,note');
if (beforeLedger.error) throw beforeLedger.error;
const spendBefore = (beforeLedger.data ?? []).reduce(
  (total, row) => total + Number(row.estimated_cost_usd ?? 0),
  0,
);

const [existingWorkspace, existingDocument, existingAnalysis, existingCandidates, existingScope] =
  await Promise.all([
    admin.from('workspaces').select('*').eq('id', manifest.workspaceId),
    admin.from('documents').select('*').eq('id', manifest.documentId),
    admin.from('analysis_runs').select('*').eq('id', manifest.analysisRunId),
    admin.from('requirement_candidates').select('id').eq('analysis_run_id', manifest.analysisRunId),
    admin.from('phase4_synthetic_smoke_scopes').select('*').eq('id', manifest.scopeId),
  ]);
for (const result of [
  existingWorkspace,
  existingDocument,
  existingAnalysis,
  existingCandidates,
  existingScope,
]) {
  if (result.error) throw result.error;
}

const targetRowsExist =
  (existingWorkspace.data?.length ?? 0) +
    (existingDocument.data?.length ?? 0) +
    (existingAnalysis.data?.length ?? 0) +
    (existingCandidates.data?.length ?? 0) >
  0;
if ((existingScope.data?.length ?? 0) === 0 && targetRowsExist)
  throw new Error('phase4_scope_provision_failed:partial_or_conflicting_target_state');

async function assertStoredPdf() {
  const download = await admin.storage.from('workspace-documents').download(manifest.objectKey);
  if (download.error) return false;
  const stored = new Uint8Array(await download.data.arrayBuffer());
  if (sha256(stored) !== manifest.document.sha256)
    throw new Error('phase4_scope_provision_failed:stored_pdf_hash_mismatch');
  return true;
}

if ((existingScope.data?.length ?? 0) === 0) {
  if (!(await assertStoredPdf())) {
    const upload = await admin.storage
      .from('workspace-documents')
      .upload(manifest.objectKey, manifest.pdf, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });
    if (upload.error)
      throw new Error(`phase4_scope_provision_failed:upload:${upload.error.message}`);
  }

  const workspaceInsert = await admin.from('workspaces').insert({
    id: manifest.workspaceId,
    name: 'Phase 4 Synthetic Verification Fixture v2',
    customer: 'Synthetic/Public Known Answer',
    description: 'phase4-synthetic-test-only; no confidential or user-provided data',
    status: 'active',
    owner_id: syntheticUserId,
  });
  if (workspaceInsert.error) throw workspaceInsert.error;

  const documentInsert = await admin.from('documents').insert({
    id: manifest.documentId,
    workspace_id: manifest.workspaceId,
    created_by: syntheticUserId,
    document_type: 'primary_rfp',
    original_filename: 'verification-cases-v2.pdf',
    normalized_filename: 'verification-cases-v2.pdf',
    mime_type: 'application/pdf',
    object_key: manifest.objectKey,
    size_bytes: manifest.pdf.byteLength,
    sha256: manifest.document.sha256,
    status: 'parsed',
    page_count: VERIFICATION_PAGES_V2.length,
    parser_name: 'synthetic-fixture',
    parser_version: PHASE4_SYNTHETIC_PARSER_VERSION,
    warnings: ['Page 15 is intentionally marked parser-damaged for evaluation.'],
  });
  if (documentInsert.error) throw documentInsert.error;

  const parseRunInsert = await admin.from('parse_runs').insert({
    id: manifest.parseRunId,
    document_id: manifest.documentId,
    workspace_id: manifest.workspaceId,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'synthetic-fixture',
    parser_version: PHASE4_SYNTHETIC_PARSER_VERSION,
    finished_at: new Date().toISOString(),
  });
  if (parseRunInsert.error) throw parseRunInsert.error;

  const pages = VERIFICATION_PAGES_V2.map((page) => ({
    id: deterministicId('11000000', page.pageNumber),
    document_id: manifest.documentId,
    workspace_id: manifest.workspaceId,
    parse_run_id: manifest.parseRunId,
    page_number: page.pageNumber,
    pdf_page_index: page.pageNumber - 1,
    text: page.text,
    text_sha256: sha256(page.text),
    char_count: page.text.length,
    extraction_status: page.pageNumber === 15 ? 'error' : 'ok',
    warnings: page.pageNumber === 15 ? ['Synthetic image-only/parser-damaged page'] : [],
    parser_name: 'synthetic-fixture',
    parser_version: PHASE4_SYNTHETIC_PARSER_VERSION,
  }));
  const pagesInsert = await admin.from('document_pages').insert(pages);
  if (pagesInsert.error) throw pagesInsert.error;

  const analysisInsert = await admin.from('analysis_runs').insert({
    id: manifest.analysisRunId,
    workspace_id: manifest.workspaceId,
    document_id: manifest.documentId,
    status: 'completed',
    stage: 'complete',
    created_by: syntheticUserId,
    provider_name: 'synthetic-fixture',
    extract_model: 'frozen-known-answer',
    prompt_version: 'verification-cases-v2',
    schema_version: 'synthetic-candidate-fixture-v1',
    candidate_count: 24,
    input_hash: manifest.candidateSetHash,
    verification_compatibility_fingerprint: manifest.compatibilityFingerprint,
    completed_at: new Date().toISOString(),
  });
  if (analysisInsert.error) throw analysisInsert.error;

  const chunks = VERIFICATION_PAGES_V2.map((page) => ({
    id: deterministicId('12000000', page.pageNumber),
    workspace_id: manifest.workspaceId,
    document_id: manifest.documentId,
    analysis_run_id: manifest.analysisRunId,
    page_number: page.pageNumber,
    chunk_index: 0,
    char_start: 0,
    char_end: page.text.length,
    text: page.text,
    text_sha256: sha256(page.text),
    token_estimate: Math.ceil(page.text.length / 4),
    parser_name: 'synthetic-fixture',
    parse_run_id: manifest.parseRunId,
  }));
  const chunksInsert = await admin.from('document_chunks').insert(chunks);
  if (chunksInsert.error) throw chunksInsert.error;

  const candidatesInsert = await admin.from('requirement_candidates').insert(
    VERIFICATION_CASES.map((candidate) => ({
      id: candidate.id,
      workspace_id: manifest.workspaceId,
      analysis_run_id: manifest.analysisRunId,
      document_id: manifest.documentId,
      category: candidate.category,
      title: candidate.title,
      obligation: candidate.obligation,
      mandatory_class: 'mandatory',
      preliminary_page: candidate.preliminaryPage,
      evidence_quote: candidate.evidenceQuote,
      confidence: 1,
      ambiguity_notes: [],
      status: 'unverified',
      prompt_version: 'verification-cases-v2',
      schema_version: 'synthetic-candidate-fixture-v1',
      model_id: 'synthetic-known-answer',
    })),
  );
  if (candidatesInsert.error) throw candidatesInsert.error;
}

const [workspace, membership, documents, analysis, pages, candidates] = await Promise.all([
  admin
    .from('workspaces')
    .select('id,owner_id,description')
    .eq('id', manifest.workspaceId)
    .single(),
  admin
    .from('workspace_members')
    .select('workspace_id,user_id,role')
    .eq('workspace_id', manifest.workspaceId)
    .eq('user_id', syntheticUserId)
    .maybeSingle(),
  admin
    .from('documents')
    .select('id,workspace_id,object_key,sha256,page_count,parser_name,parser_version,deleted_at')
    .eq('workspace_id', manifest.workspaceId)
    .is('deleted_at', null),
  admin
    .from('analysis_runs')
    .select('id,workspace_id,document_id,candidate_count')
    .eq('id', manifest.analysisRunId)
    .single(),
  admin
    .from('document_pages')
    .select('document_id,page_number,text,text_sha256,extraction_status')
    .eq('document_id', manifest.documentId),
  admin
    .from('requirement_candidates')
    .select(
      'id,workspace_id,analysis_run_id,document_id,category,title,obligation,preliminary_page,evidence_quote,status',
    )
    .eq('analysis_run_id', manifest.analysisRunId),
]);
for (const result of [workspace, membership, documents, analysis, pages, candidates])
  if (result.error) throw result.error;
if (!membership.data || membership.data.role !== 'owner')
  throw new Error('phase4_scope_provision_failed:synthetic_identity_not_owner');
if (
  workspace.data.owner_id !== syntheticUserId ||
  workspace.data.description !== 'phase4-synthetic-test-only; no confidential or user-provided data'
)
  throw new Error('phase4_scope_provision_failed:workspace_not_exact_synthetic_fixture');
if (
  (documents.data ?? []).length !== 1 ||
  (pages.data ?? []).length !== VERIFICATION_PAGES_V2.length
)
  throw new Error('phase4_scope_provision_failed:document_set_not_exact');
if (
  analysis.data.workspace_id !== manifest.workspaceId ||
  analysis.data.document_id !== manifest.documentId ||
  analysis.data.candidate_count !== 24
)
  throw new Error('phase4_scope_provision_failed:analysis_run_not_exact');
if ((candidates.data ?? []).length !== 24)
  throw new Error('phase4_scope_provision_failed:candidate_count_not_24');
if (!(await assertStoredPdf())) throw new Error('phase4_scope_provision_failed:stored_pdf_missing');

const actualCandidates = (candidates.data ?? []).map((candidate) => ({
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
const actualCandidateHash = (
  await import('../apps/worker/src/phase4-smoke-preflight.ts')
).computeSyntheticCandidateSetHash(actualCandidates);
const actualDocumentHash = (
  await import('../apps/worker/src/phase4-smoke-preflight.ts')
).computeSyntheticDocumentSetHash(
  (documents.data ?? []).map((document) => ({
    id: document.id,
    workspaceId: document.workspace_id,
    objectKey: document.object_key,
    sha256: document.sha256,
    pageCount: document.page_count,
    parserName: document.parser_name,
    parserVersion: document.parser_version,
    deletedAt: document.deleted_at,
  })),
);
if (actualCandidateHash !== manifest.candidateSetHash)
  throw new Error('phase4_scope_provision_failed:candidate_hash_mismatch');
if (actualDocumentHash !== manifest.documentSetHash)
  throw new Error('phase4_scope_provision_failed:document_hash_mismatch');
for (const expectedPage of VERIFICATION_PAGES_V2) {
  const actual = (pages.data ?? []).find((page) => page.page_number === expectedPage.pageNumber);
  if (
    !actual ||
    actual.text !== expectedPage.text ||
    actual.text_sha256 !== sha256(expectedPage.text)
  )
    throw new Error(`phase4_scope_provision_failed:page_mismatch:${expectedPage.pageNumber}`);
}

if ((existingScope.data?.length ?? 0) === 0) {
  const scopeInsert = await admin.from('phase4_synthetic_smoke_scopes').insert({
    id: manifest.scopeId,
    workspace_id: manifest.workspaceId,
    authenticated_user_id: syntheticUserId,
    analysis_run_id: manifest.analysisRunId,
    fixture_version: manifest.fixtureVersion,
    compatibility_fingerprint: manifest.compatibilityFingerprint,
    approved_document_ids: manifest.documentIds,
    approved_candidate_ids: manifest.candidateIds,
    candidate_set_hash: manifest.candidateSetHash,
    document_set_hash: manifest.documentSetHash,
    expected_answers_hash: manifest.expectedAnswersHash,
    scope_version: manifest.scopeVersion,
    synthetic_marker: manifest.syntheticMarker,
  });
  if (scopeInsert.error) throw scopeInsert.error;
}

const finalScope = await admin
  .from('phase4_synthetic_smoke_scopes')
  .select('*')
  .eq('id', manifest.scopeId)
  .single();
if (finalScope.error) throw finalScope.error;
const expectedScope = {
  workspace_id: manifest.workspaceId,
  authenticated_user_id: syntheticUserId,
  analysis_run_id: manifest.analysisRunId,
  fixture_version: manifest.fixtureVersion,
  compatibility_fingerprint: manifest.compatibilityFingerprint,
  approved_document_ids: manifest.documentIds,
  approved_candidate_ids: manifest.candidateIds,
  candidate_set_hash: manifest.candidateSetHash,
  document_set_hash: manifest.documentSetHash,
  expected_answers_hash: manifest.expectedAnswersHash,
  scope_version: manifest.scopeVersion,
  synthetic_marker: manifest.syntheticMarker,
};
for (const [key, expected] of Object.entries(expectedScope)) {
  if (JSON.stringify(finalScope.data[key]) !== JSON.stringify(expected))
    throw new Error(`phase4_scope_provision_failed:scope_binding_mismatch:${key}`);
}

const afterLedger = await admin.from('spend_ledger').select('estimated_cost_usd');
if (afterLedger.error) throw afterLedger.error;
const spendAfter = (afterLedger.data ?? []).reduce(
  (total, row) => total + Number(row.estimated_cost_usd ?? 0),
  0,
);
if (spendAfter !== spendBefore) throw new Error('phase4_scope_provision_failed:unexpected_spend');

console.info(
  JSON.stringify({
    reportVersion: 'phase4-complete-synthetic-scope-provision-v1',
    projectRef: actualProjectRef,
    scopeId: manifest.scopeId,
    workspaceId: manifest.workspaceId,
    syntheticUserId,
    analysisRunId: manifest.analysisRunId,
    documentIds: manifest.documentIds,
    candidateCount: manifest.candidates.length,
    fixtureVersion: manifest.fixtureVersion,
    scopeVersion: manifest.scopeVersion,
    candidateSetHash: manifest.candidateSetHash,
    documentSetHash: manifest.documentSetHash,
    expectedAnswersHash: manifest.expectedAnswersHash,
    compatibilityFingerprint: manifest.compatibilityFingerprint,
    syntheticMarker: manifest.syntheticMarker,
    idempotentExistingScope: (existingScope.data?.length ?? 0) === 1,
    providerCalls: 0,
    spendDeltaUsd: Number((spendAfter - spendBefore).toFixed(6)),
  }),
);
