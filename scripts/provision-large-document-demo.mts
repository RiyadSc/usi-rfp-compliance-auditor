import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { estimateAnalysisCost, normalizedContentHash, stableSourceId } from '@usi/documents';
import {
  LARGE_DOCUMENT_EXPECTED,
  LARGE_DOCUMENT_FIXTURE_VERSION,
  LARGE_DOCUMENT_PAGES,
  LARGE_DOCUMENT_PDF,
  LARGE_DOCUMENT_SOURCE_HASH,
  LARGE_DOCUMENT_TABLE_PAGES,
} from '../fixtures/eval/large-document-known-answer';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`large_demo_missing_${name.toLowerCase()}`);
  return value;
};
const url = required('NEXT_PUBLIC_SUPABASE_URL');
if (!url.includes('uxmxkdjschbekkbnweby')) throw new Error('large_demo_wrong_project');
const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: users, error: userError } = await admin.auth.admin.listUsers({ perPage: 100 });
if (userError) throw userError;
const email = required('DEMO_USER_A_EMAIL').toLowerCase();
const user = users.users.find((item) => item.email?.toLowerCase() === email);
if (!user) throw new Error('large_demo_identity_missing');
const WORKSPACE_ID = '82000000-0000-4000-8000-000000000001';
const DOCUMENT_ID = '82000000-0000-4000-8000-000000000002';
const PARSE_RUN_ID = '82000000-0000-4000-8000-000000000003';
const DOCUMENT_SET_ID = '82000000-0000-4000-8000-000000000004';
const JOB_ID = '82000000-0000-4000-8000-000000000005';
const STAGE_ID = '82000000-0000-4000-8000-000000000006';
const COST_ID = '82000000-0000-4000-8000-000000000007';
const CACHE_ID = '82000000-0000-4000-8000-000000000008';
const OBJECT_KEY = `${WORKSPACE_ID}/prepared/${DOCUMENT_ID}.pdf`;
const uuid = (group: number, index: number) =>
  `82000000-0000-4000-${String(8100 + group).slice(0, 4)}-${String(index).padStart(12, '0')}`;
async function upsert(table: string, values: unknown, onConflict?: string) {
  const { error } = await admin
    .from(table)
    .upsert(values as never, { ignoreDuplicates: true, ...(onConflict ? { onConflict } : {}) });
  if (error) throw new Error(`${table}:${error.message}`);
}
const { data: existingObject } = await admin.storage
  .from('workspace-documents')
  .download(OBJECT_KEY);
if (existingObject) {
  const bytes = new Uint8Array(await existingObject.arrayBuffer());
  const { createHash } = await import('node:crypto');
  if (createHash('sha256').update(bytes).digest('hex') !== LARGE_DOCUMENT_SOURCE_HASH)
    throw new Error('large_demo_source_object_drift');
} else {
  const { error } = await admin.storage
    .from('workspace-documents')
    .upload(OBJECT_KEY, LARGE_DOCUMENT_PDF, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
}
await upsert('workspaces', {
  id: WORKSPACE_ID,
  name: 'Harbor City 420-page Large RFP Demo',
  customer: 'Synthetic/Public Fixture Only',
  description: 'Prepared large-document synthetic demonstration; no live provider output.',
  owner_id: user.id,
});
await upsert('workspace_members', { workspace_id: WORKSPACE_ID, user_id: user.id, role: 'owner' });
await upsert('documents', {
  id: DOCUMENT_ID,
  workspace_id: WORKSPACE_ID,
  created_by: user.id,
  document_type: 'primary_rfp',
  original_filename: 'harbor-city-large-security-rfp-420-pages.pdf',
  normalized_filename: 'harbor-city-large-security-rfp-420-pages.pdf',
  mime_type: 'application/pdf',
  source_format: 'pdf',
  object_key: OBJECT_KEY,
  size_bytes: LARGE_DOCUMENT_PDF.length,
  sha256: LARGE_DOCUMENT_SOURCE_HASH,
  status: 'parsed',
  page_count: 420,
  parser_name: 'prepared-large-document-fixture',
  parser_version: 'large-document-fixture-v1',
  warnings: [
    '10 pages used deterministic fixture OCR',
    'One split table and one addendum chain are planted',
  ],
});
await upsert('parse_runs', {
  id: PARSE_RUN_ID,
  document_id: DOCUMENT_ID,
  workspace_id: WORKSPACE_ID,
  stage: 'parse',
  status: 'succeeded',
  attempt: 1,
  parser_name: 'prepared-large-document-fixture',
  parser_version: 'large-document-fixture-v1',
  finished_at: new Date().toISOString(),
});
const normalizedId = stableSourceId(
  WORKSPACE_ID,
  DOCUMENT_ID,
  LARGE_DOCUMENT_SOURCE_HASH,
  'prepared-large-document-fixture',
  'large-document-fixture-v1',
);
const stats = {
  pageCount: 420,
  blockCount: 420,
  tableCount: LARGE_DOCUMENT_EXPECTED.tableCount,
  imageCount: 10,
  nativeTextPages: 410,
  ocrPages: 10,
  uncertainPages: 1,
  characterCount: LARGE_DOCUMENT_PAGES.reduce((sum, page) => sum + page.text.length, 0),
};
const contentHash = normalizedContentHash({
  fixture: LARGE_DOCUMENT_FIXTURE_VERSION,
  sourceHash: LARGE_DOCUMENT_SOURCE_HASH,
  statistics: stats,
});
await upsert(
  'normalized_documents',
  {
    id: normalizedId,
    workspace_id: WORKSPACE_ID,
    source_document_id: DOCUMENT_ID,
    source_format: 'pdf',
    source_hash: LARGE_DOCUMENT_SOURCE_HASH,
    parser_adapter: 'prepared-large-document-fixture',
    parser_version: 'large-document-fixture-v1',
    normalization_version: 'normalized-document-v1',
    content_hash: contentHash,
    status: 'completed_with_warnings',
    statistics: stats,
    warnings: [
      {
        code: 'prepared_fixture',
        message: 'Prepared synthetic processing history; no live provider call',
        severity: 'info',
      },
    ],
  },
  'workspace_id,source_document_id,content_hash',
);
for (let offset = 0; offset < LARGE_DOCUMENT_PAGES.length; offset += 100) {
  const slice = LARGE_DOCUMENT_PAGES.slice(offset, offset + 100);
  await upsert(
    'document_pages',
    slice.map((page) => ({
      id: uuid(1, page.pageNumber),
      document_id: DOCUMENT_ID,
      workspace_id: WORKSPACE_ID,
      parse_run_id: PARSE_RUN_ID,
      page_number: page.pageNumber,
      pdf_page_index: page.pageNumber - 1,
      text: page.scanned ? `[Prepared OCR] ${page.text}` : page.text,
      text_sha256: stableSourceId(page.text),
      char_count: page.text.length,
      extraction_status: 'ok',
      warnings: page.scanned ? ['Text recovered by deterministic fixture OCR'] : [],
      parser_name: 'prepared-large-document-fixture',
      parser_version: 'large-document-fixture-v1',
    })),
    'document_id,page_number',
  );
  const pageRows = slice.map((page) => ({
    id: stableSourceId(DOCUMENT_ID, 'page', page.pageNumber - 1),
    normalized_document_id: normalizedId,
    workspace_id: WORKSPACE_ID,
    source_document_id: DOCUMENT_ID,
    physical_page_index: page.pageNumber - 1,
    displayed_page_label: String(page.pageNumber),
    native_text_available: !page.scanned,
    ocr_applied: Boolean(page.scanned),
    parser_confidence: page.pageNumber === 275 ? 0.45 : page.scanned ? 0.91 : 0.98,
    parser_state: page.pageNumber === 275 ? 'uncertain' : page.scanned ? 'ocr' : 'native',
    source_artifact_id: DOCUMENT_ID,
    warnings:
      page.pageNumber === 275
        ? [
            {
              code: 'table_association_uncertain',
              message: 'Table header association requires human review',
              severity: 'warning',
            },
          ]
        : [],
  }));
  await upsert('normalized_pages', pageRows, 'normalized_document_id,physical_page_index');
  const blocks = slice.map((page) => ({
    id: stableSourceId(DOCUMENT_ID, 'block', page.pageNumber - 1),
    normalized_document_id: normalizedId,
    normalized_page_id: stableSourceId(DOCUMENT_ID, 'page', page.pageNumber - 1),
    workspace_id: WORKSPACE_ID,
    source_document_id: DOCUMENT_ID,
    block_type: (LARGE_DOCUMENT_TABLE_PAGES as readonly number[]).includes(page.pageNumber)
      ? 'table'
      : 'paragraph',
    text: page.text,
    normalized_text: page.text,
    order_index: 0,
    confidence: page.pageNumber === 275 ? 0.45 : 0.98,
    provenance: {
      sourceDocumentId: DOCUMENT_ID,
      sourceFormat: 'pdf',
      pageIndex: page.pageNumber - 1,
    },
    metadata: { preparedSynthetic: true, ocrApplied: Boolean(page.scanned) },
  }));
  await upsert('normalized_blocks', blocks, 'id');
}
await upsert('document_sets', {
  id: DOCUMENT_SET_ID,
  workspace_id: WORKSPACE_ID,
  name: 'phase8-large-document-synthetic-demo-only',
  set_hash: LARGE_DOCUMENT_SOURCE_HASH,
  classification_status: 'classified',
  version: 'document-set-v1',
  created_by: user.id,
});
await upsert(
  'document_set_members',
  {
    workspace_id: WORKSPACE_ID,
    document_set_id: DOCUMENT_SET_ID,
    document_id: DOCUMENT_ID,
    member_hash: LARGE_DOCUMENT_SOURCE_HASH,
    document_role: 'main_solicitation',
    classification_source: 'explicit',
    order_index: 0,
  },
  'document_set_id,document_id',
);
for (const [index, pageNumber] of LARGE_DOCUMENT_TABLE_PAGES.entries()) {
  const tableId = stableSourceId(DOCUMENT_ID, 'table', pageNumber);
  const blockId = stableSourceId(DOCUMENT_ID, 'block', pageNumber - 1);
  await upsert('normalized_tables', {
    id: tableId,
    normalized_document_id: normalizedId,
    normalized_page_id: stableSourceId(DOCUMENT_ID, 'page', pageNumber - 1),
    workspace_id: WORKSPACE_ID,
    source_document_id: DOCUMENT_ID,
    block_id: blockId,
    title: `Requirement table ${index + 1}`,
    header_rows: [0],
    row_count: 2,
    column_count: 3,
    confidence: 0.95,
    warnings: [],
    continuation_of_table_id: pageNumber === 51 ? stableSourceId(DOCUMENT_ID, 'table', 50) : null,
    repeated_header: pageNumber === 51,
  });
  const labels =
    index === 0 ? ['Coverage', 'Basis', 'Limit'] : ['Requirement', 'Operator', 'Value'];
  await upsert(
    'normalized_table_cells',
    labels.flatMap((label, column) => [
      {
        id: stableSourceId(tableId, 0, column),
        normalized_table_id: tableId,
        workspace_id: WORKSPACE_ID,
        source_document_id: DOCUMENT_ID,
        row_index: 0,
        column_index: column,
        row_span: 1,
        column_span: 1,
        raw_text: label,
        normalized_text: label,
        cell_role: 'header',
        confidence: 1,
        provenance: {
          sourceDocumentId: DOCUMENT_ID,
          sourceFormat: 'pdf',
          pageIndex: pageNumber - 1,
          tableId,
          rowIndex: 0,
          columnIndex: column,
        },
      },
      {
        id: stableSourceId(tableId, 1, column),
        normalized_table_id: tableId,
        workspace_id: WORKSPACE_ID,
        source_document_id: DOCUMENT_ID,
        row_index: 1,
        column_index: column,
        row_span: 1,
        column_span: 1,
        raw_text: ['General Liability', 'Per occurrence', '$2,000,000'][column] ?? '',
        normalized_text: ['General Liability', 'Per occurrence', '$2,000,000'][column] ?? '',
        cell_role: column === 0 ? 'row_header' : 'data',
        confidence: 0.95,
        provenance: {
          sourceDocumentId: DOCUMENT_ID,
          sourceFormat: 'pdf',
          pageIndex: pageNumber - 1,
          tableId,
          rowIndex: 1,
          columnIndex: column,
        },
      },
    ]),
    'id',
  );
}
const inputHash = stableSourceId(
  LARGE_DOCUMENT_FIXTURE_VERSION,
  LARGE_DOCUMENT_SOURCE_HASH,
  'large-document-jobs-v1',
);
await upsert('large_document_jobs', {
  id: JOB_ID,
  workspace_id: WORKSPACE_ID,
  document_set_id: DOCUMENT_SET_ID,
  source_document_id: DOCUMENT_ID,
  mode: 'standard_analysis',
  status: 'completed_with_warnings',
  orchestration_version: 'large-document-jobs-v1',
  input_hash: inputHash,
  requested_by: user.id,
  current_stage: 'completed',
  progress_numerator: 430,
  progress_denominator: 430,
  retryable: false,
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
});
await upsert('processing_stage_runs', {
  id: STAGE_ID,
  workspace_id: WORKSPACE_ID,
  job_id: JOB_ID,
  stage: 'normalizing',
  stage_version: 'normalized-document-v1',
  input_hash: inputHash,
  status: 'completed_with_warnings',
  attempt: 1,
  progress_numerator: 420,
  progress_denominator: 420,
  completed_at: new Date().toISOString(),
});
for (let offset = 0; offset < 420; offset += 100) {
  await upsert(
    'processing_work_units',
    Array.from({ length: Math.min(100, 420 - offset) }, (_, index) => {
      const page = offset + index + 1;
      return {
        id: uuid(2, page),
        workspace_id: WORKSPACE_ID,
        job_id: JOB_ID,
        stage_run_id: STAGE_ID,
        unit_type: 'page_parse',
        unit_key: `page:${page}`,
        version: 'large-document-fixture-v1',
        input_hash: stableSourceId(LARGE_DOCUMENT_SOURCE_HASH, page),
        status: 'completed',
        attempts: 1,
        max_attempts: 3,
        completion_artifact: {
          pageNumber: page,
          cache: 'prepared',
          ocrApplied: LARGE_DOCUMENT_PAGES[page - 1]?.scanned ?? false,
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
    }),
    'job_id,stage_run_id,unit_type,unit_key,input_hash,version',
  );
}
await upsert(
  'processing_work_units',
  LARGE_DOCUMENT_PAGES.filter((page) => page.scanned).map((page, index) => ({
    id: uuid(3, index + 1),
    workspace_id: WORKSPACE_ID,
    job_id: JOB_ID,
    stage_run_id: STAGE_ID,
    unit_type: 'ocr',
    unit_key: `page:${page.pageNumber}`,
    version: 'mock-ocr-v1',
    input_hash: stableSourceId(LARGE_DOCUMENT_SOURCE_HASH, 'ocr', page.pageNumber),
    status: 'completed',
    attempts: 1,
    max_attempts: 3,
    completion_artifact: {
      pageNumber: page.pageNumber,
      engine: 'mock-ocr',
      confidence: 0.91,
      fixtureOnly: true,
    },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  })),
  'job_id,stage_run_id,unit_type,unit_key,input_hash,version',
);
const estimate = estimateAnalysisCost({
  ocrPages: 10,
  embeddingTokens: 140000,
  classificationCalls: 28,
  extractionCalls: 12,
  verificationCalls: 18,
  ambiguityCalls: 2,
  averageInputTokens: 2200,
  outputLimits: { classification: 300, extraction: 1800, verification: 1600, ambiguity: 1800 },
  pricesPerMillion: { input: 5, output: 30, embedding: 0.02, ocrPage: 0 },
  retryAllowance: 1,
  estimatedMillisecondsPerCall: 4000,
});
await upsert('analysis_cost_estimates', {
  id: COST_ID,
  workspace_id: WORKSPACE_ID,
  job_id: JOB_ID,
  mode: 'standard_analysis',
  estimator_version: 'analysis-cost-estimator-v1',
  input_hash: inputHash,
  expected_low_usd: estimate.lowUsd,
  expected_high_usd: estimate.highUsd,
  hard_maximum_usd: estimate.hardMaximumUsd,
  estimated_calls_low: estimate.estimatedCallsLow,
  estimated_calls_high: estimate.estimatedCallsHigh,
  estimated_time_ms: estimate.estimatedTimeMs,
  largest_cost_stage: estimate.largestCostStage,
  stage_estimates: estimate.stages,
  pricing_version: 'provider-pricing-2026-07-22',
  execution_allowed: true,
});
await upsert(
  'analysis_cache_entries',
  {
    id: CACHE_ID,
    workspace_id: WORKSPACE_ID,
    cache_key: stableSourceId(inputHash, contentHash),
    artifact_type: 'normalized_document',
    source_document_id: DOCUMENT_ID,
    stage: 'normalizing',
    status: 'completed',
    artifact_ref: { normalizedDocumentId: normalizedId },
    provenance: { fixtureVersion: LARGE_DOCUMENT_FIXTURE_VERSION, providerCalls: 0 },
    dependency_hash: LARGE_DOCUMENT_SOURCE_HASH,
  },
  'workspace_id,cache_key',
);
const count = async (table: string, column: string, value: string) => {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
};
const persisted = {
  pages: await count('normalized_pages', 'source_document_id', DOCUMENT_ID),
  blocks: await count('normalized_blocks', 'source_document_id', DOCUMENT_ID),
  tables: await count('normalized_tables', 'source_document_id', DOCUMENT_ID),
  cells: await count('normalized_table_cells', 'source_document_id', DOCUMENT_ID),
  workUnits: await count('processing_work_units', 'job_id', JOB_ID),
  costEstimates: await count('analysis_cost_estimates', 'job_id', JOB_ID),
  cacheEntries: await count('analysis_cache_entries', 'source_document_id', DOCUMENT_ID),
};
if (
  persisted.pages !== 420 ||
  persisted.blocks !== 420 ||
  persisted.tables !== 8 ||
  persisted.cells !== 48 ||
  persisted.workUnits !== 430 ||
  persisted.costEstimates !== 1 ||
  persisted.cacheEntries !== 1
)
  throw new Error(`large_demo_idempotency_drift:${JSON.stringify(persisted)}`);
console.info(
  JSON.stringify({
    projectRef: 'uxmxkdjschbekkbnweby',
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    fixtureVersion: LARGE_DOCUMENT_FIXTURE_VERSION,
    pages: 420,
    nativePages: LARGE_DOCUMENT_EXPECTED.nativePages,
    ocrPages: LARGE_DOCUMENT_EXPECTED.ocrRequiredPages,
    tables: LARGE_DOCUMENT_EXPECTED.tableCount,
    persisted,
    costEstimate: estimate,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);
