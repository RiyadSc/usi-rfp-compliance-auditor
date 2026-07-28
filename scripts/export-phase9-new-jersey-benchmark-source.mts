import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { format } from 'prettier';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

if (process.env.PHASE9_NJ_BENCHMARK_SOURCE_EXPORT !== '1')
  throw new Error('phase9_nj_benchmark_source_export_requires_explicit_read_only_flag');
for (const flag of [
  'PHASE3_LIVE_EVAL',
  'PHASE4_LIVE_EVAL',
  'PHASE4_LIVE_SMOKE',
  'PHASE9_LIVE_EVAL',
  'PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED',
])
  if (process.env[flag] === '1' || process.env[flag] === 'true')
    throw new Error(`phase9_nj_benchmark_source_export_refuses_live_flag:${flag}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey)
  throw new Error('phase9_nj_benchmark_source_export_missing_supabase_environment');
if (new URL(url).hostname.split('.')[0] !== 'uxmxkdjschbekkbnweby')
  throw new Error('phase9_nj_benchmark_source_export_wrong_supabase_project');

const workspaceId = '90000000-0000-4000-8000-000000000100';
const documentId = '90000000-0000-4000-8000-000000000101';
const documentSha256 = '1f08ea063bd0df93364a40ace483b22684e745472247e88e4912c05b035e15a4';
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const document = await admin
  .from('documents')
  .select(
    'id,workspace_id,document_type,normalized_filename,mime_type,sha256,size_bytes,page_count,status,parser_name,parser_version,source_format',
  )
  .eq('id', documentId)
  .eq('workspace_id', workspaceId)
  .single();
if (document.error || !document.data)
  throw new Error(`phase9_nj_benchmark_document_missing:${document.error?.message ?? 'not_found'}`);
if (
  document.data.sha256 !== documentSha256 ||
  document.data.page_count !== 48 ||
  document.data.status !== 'parsed' ||
  document.data.document_type !== 'primary_rfp'
)
  throw new Error('phase9_nj_benchmark_document_binding_mismatch');

const pages = await admin
  .from('document_pages')
  .select(
    'document_id,page_number,pdf_page_index,text,text_sha256,extraction_status,warnings,parser_name,parser_version',
  )
  .eq('document_id', documentId)
  .eq('workspace_id', workspaceId)
  .order('page_number')
  .range(0, 99);
if (pages.error || !pages.data)
  throw new Error(`phase9_nj_benchmark_pages_missing:${pages.error?.message ?? 'not_found'}`);
if (pages.data.length !== 48 || pages.data.some((page, index) => page.page_number !== index + 1))
  throw new Error('phase9_nj_benchmark_page_population_mismatch');

const sourcePackageHash = createHash('sha256')
  .update(
    JSON.stringify({
      version: 'new-jersey-08-x-39231-source-pages-v1',
      documentSha256,
      pages: pages.data.map((page) => ({
        pageNumber: page.page_number,
        textSha256: page.text_sha256,
      })),
    }),
  )
  .digest('hex');
const sourcePackage = {
  artifactVersion: 'new-jersey-08-x-39231-source-pages-v1',
  source: {
    publicSolicitation: 'New Jersey RFP 08-X-39231',
    title: 'Armed Security Guard Services for the Department of Military and Veterans Affairs',
    provenance:
      'Official public New Jersey solicitation PDF ingested into the authorized public evaluation workspace.',
    workspaceId,
    documentId,
    documentSha256,
    sourcePackageHash,
    expectedAnswersUsed: false,
    machineFindingsRead: false,
    databaseTablesRead: ['documents', 'document_pages'],
    exportedAt: '2026-07-28T00:00:00.000Z',
  },
  document: {
    normalizedFilename: document.data.normalized_filename,
    mimeType: document.data.mime_type,
    sizeBytes: document.data.size_bytes,
    pageCount: document.data.page_count,
    parserName: document.data.parser_name,
    parserVersion: document.data.parser_version,
    sourceFormat: document.data.source_format,
  },
  pages: pages.data.map((page) => ({
    pageNumber: page.page_number,
    pdfPageIndex: page.pdf_page_index,
    text: page.text,
    textSha256: page.text_sha256,
    extractionStatus: page.extraction_status,
    warnings: page.warnings,
  })),
};

await mkdir('benchmarks/new-jersey-08-x-39231', { recursive: true });
await writeFile(
  'benchmarks/new-jersey-08-x-39231/source-pages-v1.json',
  await format(JSON.stringify(sourcePackage), { parser: 'json', printWidth: 100 }),
  'utf8',
);
console.info(
  JSON.stringify({
    artifactVersion: sourcePackage.artifactVersion,
    pages: sourcePackage.pages.length,
    sourcePackageHash,
    machineFindingsRead: false,
    providerCalls: 0,
    providerSpendUsd: 0,
  }),
);
