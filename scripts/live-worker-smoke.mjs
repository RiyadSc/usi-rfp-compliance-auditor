/** Controlled one-run smoke through the real worker extraction handler. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PLANTED_PAGES } from '../fixtures/eval/planted-pages.ts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const CEILING_USD = 10;
const SELECTED_MODEL = 'gpt-5.4-mini-2026-03-17';
if (process.env.PHASE3_LIVE_EVAL !== '1') {
  throw new Error('Refusing live worker smoke: PHASE3_LIVE_EVAL=1 is required');
}
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length < 20) {
  throw new Error('Refusing live worker smoke: OPENAI_API_KEY is absent or invalid');
}
process.env.PHASE3_SPEND_CEILING_USD = String(CEILING_USD);
process.env.OPENAI_EXTRACT_MODEL = SELECTED_MODEL;
process.env.OPENAI_EMBED_MODEL = 'text-embedding-3-small';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: spentRows, error: spendReadError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd');
if (spendReadError) throw new Error(`Spend ledger read failed: ${spendReadError.message}`);
const spentBefore = (spentRows ?? []).reduce(
  (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
  0,
);
const estimatedMaximumUsd = 0.2;
if (spentBefore + estimatedMaximumUsd > CEILING_USD) {
  throw new Error('Refusing live worker smoke: retry-inclusive reservation could exceed $10');
}
console.log(
  JSON.stringify({
    phase: 'phase3-live-worker-smoke',
    spendBeforeUsd: Number(spentBefore.toFixed(8)),
    estimatedMaximumUsd,
    estimatedMaximumCumulativeUsd: Number((spentBefore + estimatedMaximumUsd).toFixed(8)),
    ceilingUsd: CEILING_USD,
  }),
);

const { data: member, error: memberError } = await admin
  .from('workspace_members')
  .select('workspace_id, user_id')
  .limit(1)
  .maybeSingle();
if (memberError || !member) throw new Error('No workspace member is available for smoke setup');

const documentId = randomUUID();
const parseRunId = randomUUID();
const analysisRunId = randomUUID();
const processingJobId = randomUUID();
const inputText = PLANTED_PAGES.map((page) => page.text).join('\n');
const sha256 = createHash('sha256').update(inputText).digest('hex');
const objectKey = `${member.workspace_id}/phase3-live-smoke/${documentId}.pdf`;

const { error: documentError } = await admin.from('documents').insert({
  id: documentId,
  workspace_id: member.workspace_id,
  original_filename: 'phase3-synthetic-live-smoke.pdf',
  normalized_filename: 'phase3-synthetic-live-smoke.pdf',
  mime_type: 'application/pdf',
  object_key: objectKey,
  sha256,
  size_bytes: Buffer.byteLength(inputText),
  status: 'parsed',
  page_count: PLANTED_PAGES.length,
  parser_name: 'synthetic-fixture',
  parser_version: 'phase3-v1',
  created_by: member.user_id,
});
if (documentError) throw new Error(`Smoke document insert failed: ${documentError.message}`);

const { error: parseRunError } = await admin.from('parse_runs').insert({
  id: parseRunId,
  document_id: documentId,
  workspace_id: member.workspace_id,
  stage: 'parse',
  status: 'succeeded',
  attempt: 1,
  parser_name: 'synthetic-fixture',
  parser_version: 'phase3-v1',
  finished_at: new Date().toISOString(),
});
if (parseRunError) throw new Error(`Smoke parse run insert failed: ${parseRunError.message}`);

const pageRows = PLANTED_PAGES.map((page, index) => ({
  document_id: documentId,
  workspace_id: member.workspace_id,
  parse_run_id: parseRunId,
  page_number: page.pageNumber,
  pdf_page_index: index,
  text: page.text,
  text_sha256: createHash('sha256').update(page.text).digest('hex'),
  char_count: page.text.length,
  extraction_status: 'ok',
  parser_name: 'synthetic-fixture',
  parser_version: 'phase3-v1',
}));
const { error: pageError } = await admin.from('document_pages').insert(pageRows);
if (pageError) throw new Error(`Smoke page insert failed: ${pageError.message}`);

const { error: analysisError } = await admin.from('analysis_runs').insert({
  id: analysisRunId,
  workspace_id: member.workspace_id,
  document_id: documentId,
  status: 'queued',
  stage: 'index',
  created_by: member.user_id,
  input_hash: sha256,
  provider_name: 'openai',
});
if (analysisError) throw new Error(`Smoke analysis run insert failed: ${analysisError.message}`);

const { error: jobError } = await admin.from('processing_jobs').insert({
  id: processingJobId,
  workspace_id: member.workspace_id,
  document_id: documentId,
  stage: 'extract',
  status: 'queued',
  input_hash: sha256,
  max_attempts: 3,
});
if (jobError) throw new Error(`Smoke processing job insert failed: ${jobError.message}`);

const { handleExtractJob } = await import('../apps/worker/src/extract-document.ts');
await handleExtractJob({
  workspaceId: member.workspace_id,
  documentId,
  analysisRunId,
  processingJobId,
});

const [runResult, jobResult, callsResult, candidatesResult, ledgerResult] = await Promise.all([
  admin.from('analysis_runs').select('*').eq('id', analysisRunId).single(),
  admin.from('processing_jobs').select('*').eq('id', processingJobId).single(),
  admin.from('model_calls').select('*').eq('analysis_run_id', analysisRunId),
  admin.from('requirement_candidates').select('*').eq('analysis_run_id', analysisRunId),
  admin.from('spend_ledger').select('*').eq('analysis_run_id', analysisRunId),
]);
for (const result of [runResult, jobResult, callsResult, candidatesResult, ledgerResult]) {
  if (result.error) throw new Error(`Smoke verification query failed: ${result.error.message}`);
}
const run = runResult.data;
const job = jobResult.data;
const calls = callsResult.data ?? [];
const candidates = candidatesResult.data ?? [];
const ledger = ledgerResult.data ?? [];
const pageNumbers = new Set(PLANTED_PAGES.map((page) => page.pageNumber));
const allUnverified = candidates.every((candidate) => candidate.status === 'unverified');
const sourcePagesResolvable = candidates.every((candidate) =>
  pageNumbers.has(candidate.preliminary_page),
);
const smokeCostUsd = ledger.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);

const report = {
  artifactVersion: 'phase3-live-worker-smoke-v1',
  generatedAt: new Date().toISOString(),
  selectedModel: SELECTED_MODEL,
  analysisRunCreated: Boolean(run),
  analysisRunStatus: run?.status ?? null,
  workerJobStatus: job?.status ?? null,
  modelCallMetadataPersisted:
    calls.length >= 2 &&
    calls.every(
      (call) =>
        call.provider &&
        call.model &&
        call.input_tokens !== null &&
        call.estimated_cost_usd !== null,
    ),
  modelCallCount: calls.length,
  candidateCount: candidates.length,
  candidatesPersisted: candidates.length > 0,
  allCandidatesUnverified: allUnverified,
  sourcePagesResolvable,
  sourceNavigationPattern: '/w/{workspaceId}/documents/{documentId}?page={preliminaryPage}',
  spendLedgerEntries: ledger.length,
  smokeCostUsd: Number(smokeCostUsd.toFixed(8)),
  safeUiPresentation:
    allUnverified &&
    sourcePagesResolvable &&
    !candidates.some((candidate) => candidate.status !== 'unverified'),
};
const artifactDir = resolve('artifacts/evaluation');
await mkdir(artifactDir, { recursive: true });
await writeFile(
  resolve(artifactDir, 'phase3-live-worker-smoke.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));

if (
  run?.status !== 'completed' ||
  job?.status !== 'completed' ||
  !report.modelCallMetadataPersisted ||
  !report.candidatesPersisted ||
  !allUnverified ||
  !sourcePagesResolvable ||
  ledger.length === 0
) {
  process.exitCode = 1;
}
