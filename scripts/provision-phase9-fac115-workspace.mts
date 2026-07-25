/** Provider-free, idempotent provisioning for the frozen public FAC115 fixture. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PdfJsParserAdapter } from '../packages/documents/src/parser/pdfjs-adapter.ts';
import {
  FAC115_DOCUMENT_IDS,
  FAC115_ROOT,
  FAC115_SYNTHETIC_IDENTITY_ID,
  FAC115_WORKSPACE_ID,
} from './lib/phase9-fac115-production.mts';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const PROJECT_REF = 'uxmxkdjschbekkbnweby';
if (process.env.PHASE9_PROVISION_PUBLIC_FIXTURE !== '1')
  throw new Error('phase9_provision_explicit_flag_required');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('phase9_provision_supabase_runtime_missing');
if (new URL(url).hostname.split('.')[0] !== PROJECT_REF)
  throw new Error('phase9_provision_project_ref_mismatch');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const renditionManifest = JSON.parse(
  await readFile(resolve(FAC115_ROOT, 'renditions/rendition-manifest.json'), 'utf8'),
) as {
  renditions: Array<{ file: string; sha256: string; bytes: number; kind: string }>;
};
const sourceManifest = JSON.parse(
  await readFile(resolve(FAC115_ROOT, 'source-manifest.json'), 'utf8'),
) as {
  sources: Array<{ file: string; sha256: string; bytes: number }>;
};

const { data: user, error: userError } = await admin.auth.admin.getUserById(
  FAC115_SYNTHETIC_IDENTITY_ID,
);
if (userError || !user.user) throw new Error('phase9_provision_identity_missing');
const existingWorkspace = await admin
  .from('workspaces')
  .select('id,owner_id,name')
  .eq('id', FAC115_WORKSPACE_ID)
  .maybeSingle();
if (existingWorkspace.error) throw existingWorkspace.error;
if (
  existingWorkspace.data &&
  (existingWorkspace.data.owner_id !== FAC115_SYNTHETIC_IDENTITY_ID ||
    existingWorkspace.data.name !== 'Massachusetts FAC115 Public Evaluation')
)
  throw new Error('phase9_provision_workspace_binding_mismatch');
if (!existingWorkspace.data) {
  const insert = await admin.from('workspaces').insert({
    id: FAC115_WORKSPACE_ID,
    name: 'Massachusetts FAC115 Public Evaluation',
    customer: 'Public Commonwealth of Massachusetts solicitation',
    description:
      'phase9-public-evaluation-only; frozen official public documents; no bidder or confidential data',
    status: 'active',
    owner_id: FAC115_SYNTHETIC_IDENTITY_ID,
  });
  if (insert.error) throw insert.error;
}
const membership = await admin
  .from('workspace_members')
  .select('workspace_id,user_id,role')
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .eq('user_id', FAC115_SYNTHETIC_IDENTITY_ID)
  .maybeSingle();
if (membership.error) throw membership.error;
if (membership.data && membership.data.role !== 'owner')
  throw new Error('phase9_provision_membership_binding_mismatch');
if (!membership.data) {
  const insert = await admin.from('workspace_members').insert({
    workspace_id: FAC115_WORKSPACE_ID,
    user_id: FAC115_SYNTHETIC_IDENTITY_ID,
    role: 'owner',
  });
  if (insert.error) throw insert.error;
}

type ProvisionDocument = {
  id: string;
  filename: string;
  bytes: Uint8Array;
  mime: string;
  sourceFormat: string;
  documentType: string;
  pageCount: number | null;
  pages: Array<{ pageNumber: number; text: string }>;
};
const documents: ProvisionDocument[] = [];
const parser = new PdfJsParserAdapter();
for (const rendition of renditionManifest.renditions) {
  // Keep a durable copy for storage; PdfJs may detach the ArrayBuffer it parses.
  const bytes = Uint8Array.from(
    await readFile(resolve(FAC115_ROOT, 'renditions/pdf', rendition.file)),
  );
  if (sha256(bytes) !== rendition.sha256 || bytes.byteLength !== rendition.bytes)
    throw new Error(`phase9_provision_rendition_drift:${rendition.file}`);
  const parsed = await parser.parse(bytes.slice(), { maxPages: 200, timeoutMs: 120_000 });
  documents.push({
    id: FAC115_DOCUMENT_IDS[rendition.file]!,
    filename: rendition.file,
    bytes,
    mime: 'application/pdf',
    sourceFormat: 'pdf',
    documentType:
      rendition.file === 'FAC115_Request_for_Response_03.29.2022.pdf'
        ? 'primary_rfp'
        : rendition.file === 'Intent_to_Bid_Notice_FAC115.pdf'
          ? 'addendum'
          : 'attachment',
    pageCount: parsed.pages.length,
    pages: parsed.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    })),
  });
}
for (const source of sourceManifest.sources.filter(
  (item) => item.file.endsWith('.xlsx') || item.file.endsWith('.html'),
)) {
  const bytes = new Uint8Array(await readFile(resolve(FAC115_ROOT, 'source', source.file)));
  if (sha256(bytes) !== source.sha256 || bytes.byteLength !== source.bytes)
    throw new Error(`phase9_provision_source_drift:${source.file}`);
  documents.push({
    id: FAC115_DOCUMENT_IDS[source.file]!,
    filename: source.file,
    bytes,
    mime: source.file.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/html',
    sourceFormat: source.file.endsWith('.xlsx') ? 'xlsx' : 'html',
    documentType: 'attachment',
    pageCount: null,
    pages: [],
  });
}
if (documents.length !== 11 || new Set(documents.map((item) => item.id)).size !== 11)
  throw new Error('phase9_provision_document_set_invalid');

for (const document of documents) {
  const hash = sha256(document.bytes);
  const objectKey = `${FAC115_WORKSPACE_ID}/phase9-fac115/${document.filename}`;
  const existing = await admin
    .from('documents')
    .select('id,workspace_id,sha256,object_key,status')
    .eq('id', document.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (
    existing.data &&
    (existing.data.workspace_id !== FAC115_WORKSPACE_ID ||
      existing.data.sha256 !== hash ||
      existing.data.object_key !== objectKey ||
      existing.data.status !== 'parsed')
  )
    throw new Error(`phase9_provision_document_binding_mismatch:${document.filename}`);
  const stored = await admin.storage.from('workspace-documents').download(objectKey);
  if (stored.error) {
    const upload = await admin.storage
      .from('workspace-documents')
      .upload(objectKey, document.bytes, {
        contentType: document.mime,
        cacheControl: '3600',
        upsert: false,
      });
    if (upload.error) throw new Error(`phase9_provision_storage:${upload.error.message}`);
  } else {
    const storedBytes = new Uint8Array(await stored.data.arrayBuffer());
    if (sha256(storedBytes) !== hash)
      throw new Error(`phase9_provision_storage_hash_mismatch:${document.filename}`);
  }
  if (!existing.data) {
    const insert = await admin.from('documents').insert({
      id: document.id,
      workspace_id: FAC115_WORKSPACE_ID,
      created_by: FAC115_SYNTHETIC_IDENTITY_ID,
      document_type: document.documentType,
      original_filename: document.filename,
      normalized_filename: document.filename,
      mime_type: document.mime,
      object_key: objectKey,
      size_bytes: document.bytes.byteLength,
      sha256: hash,
      status: 'parsed',
      page_count: document.pageCount,
      parser_name: 'phase9-frozen-public-fixture',
      parser_version: 'fac115-mixed-parser-v1',
      source_format: document.sourceFormat,
      warnings: [],
    });
    if (insert.error) throw insert.error;
  }
  if (document.pages.length) {
    const parseRunId = document.id.replace(/^80000000/, '81000000');
    const existingRun = await admin
      .from('parse_runs')
      .select('id')
      .eq('id', parseRunId)
      .maybeSingle();
    if (existingRun.error) throw existingRun.error;
    if (!existingRun.data) {
      const runInsert = await admin.from('parse_runs').insert({
        id: parseRunId,
        document_id: document.id,
        workspace_id: FAC115_WORKSPACE_ID,
        stage: 'parse',
        status: 'succeeded',
        parser_name: 'phase9-frozen-public-fixture',
        parser_version: 'fac115-mixed-parser-v1',
        finished_at: new Date().toISOString(),
      });
      if (runInsert.error) throw runInsert.error;
      const pageInsert = await admin.from('document_pages').insert(
        document.pages.map((page) => ({
          document_id: document.id,
          workspace_id: FAC115_WORKSPACE_ID,
          parse_run_id: parseRunId,
          page_number: page.pageNumber,
          pdf_page_index: page.pageNumber - 1,
          text: page.text,
          text_sha256: createHash('sha256').update(page.text).digest('hex'),
          char_count: page.text.length,
          extraction_status: page.text.trim() ? 'ok' : 'empty',
          warnings: [],
          parser_name: 'phase9-frozen-public-fixture',
          parser_version: 'fac115-mixed-parser-v1',
        })),
      );
      if (pageInsert.error) throw pageInsert.error;
    }
  }
}

const finalDocuments = await admin
  .from('documents')
  .select('id,sha256')
  .eq('workspace_id', FAC115_WORKSPACE_ID)
  .is('deleted_at', null);
if (finalDocuments.error) throw finalDocuments.error;
if (
  finalDocuments.data.length !== documents.length ||
  new Set(finalDocuments.data.map((item) => item.id)).size !== documents.length
)
  throw new Error('phase9_provision_extra_or_missing_document');

console.info(
  JSON.stringify({
    stage: 'phase9_fac115_workspace_provisioned',
    providerCalls: 0,
    projectRef: PROJECT_REF,
    workspaceId: FAC115_WORKSPACE_ID,
    actorId: FAC115_SYNTHETIC_IDENTITY_ID,
    documentCount: finalDocuments.data.length,
  }),
);
