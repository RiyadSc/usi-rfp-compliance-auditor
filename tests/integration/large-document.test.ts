import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { createTestWorkspace, signInUser } from './helpers.js';

loadEnv({ path: '.env.local' });
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
let userA: SupabaseClient;
let userB: SupabaseClient;
let workspaceA: string;
let workspaceB: string;
let userAId: string;
let userBId: string;
let documentA: string;
let documentB: string;
let jobId: string;
let stageId: string;
let unitId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  workspaceA = await createTestWorkspace(userA, `large-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(userB, `large-B ${Date.now()}`);
  userAId = (await userA.auth.getUser()).data.user!.id;
  userBId = (await userB.auth.getUser()).data.user!.id;
  const svc = admin();
  documentA = crypto.randomUUID();
  documentB = crypto.randomUUID();
  const hash = 'a'.repeat(64);
  expect(
    (
      await svc.from('documents').insert([
        {
          id: documentA,
          workspace_id: workspaceA,
          created_by: userAId,
          document_type: 'primary_rfp',
          original_filename: 'large.txt',
          normalized_filename: 'large.txt',
          mime_type: 'text/plain',
          source_format: 'txt',
          object_key: `${workspaceA}/large/${documentA}.txt`,
          size_bytes: 100,
          sha256: hash,
          status: 'parsed',
          page_count: 1,
        },
        {
          id: documentB,
          workspace_id: workspaceB,
          created_by: userBId,
          document_type: 'primary_rfp',
          original_filename: 'other.txt',
          normalized_filename: 'other.txt',
          mime_type: 'text/plain',
          source_format: 'txt',
          object_key: `${workspaceB}/large/${documentB}.txt`,
          size_bytes: 100,
          sha256: '1'.repeat(64),
          status: 'parsed',
          page_count: 1,
        },
      ])
    ).error,
  ).toBeNull();
  const normalizedId = 'b'.repeat(64);
  expect(
    (
      await svc.from('normalized_documents').insert([
        {
          id: normalizedId,
          workspace_id: workspaceA,
          source_document_id: documentA,
          source_format: 'txt',
          source_hash: hash,
          parser_adapter: 'test',
          parser_version: '1',
          normalization_version: 'normalized-document-v1',
          content_hash: 'c'.repeat(64),
          status: 'completed',
          statistics: {
            pageCount: 1,
            blockCount: 1,
            tableCount: 0,
            imageCount: 0,
            nativeTextPages: 1,
            ocrPages: 0,
            uncertainPages: 0,
            characterCount: 10,
          },
          warnings: [],
        },
        {
          id: '2'.repeat(64),
          workspace_id: workspaceB,
          source_document_id: documentB,
          source_format: 'txt',
          source_hash: '1'.repeat(64),
          parser_adapter: 'test',
          parser_version: '1',
          normalization_version: 'normalized-document-v1',
          content_hash: '3'.repeat(64),
          status: 'completed',
          statistics: {
            pageCount: 1,
            blockCount: 0,
            tableCount: 0,
            imageCount: 0,
            nativeTextPages: 1,
            ocrPages: 0,
            uncertainPages: 0,
            characterCount: 0,
          },
          warnings: [],
        },
      ])
    ).error,
  ).toBeNull();
  jobId = crypto.randomUUID();
  stageId = crypto.randomUUID();
  unitId = crypto.randomUUID();
  expect(
    (
      await svc.from('large_document_jobs').insert({
        id: jobId,
        workspace_id: workspaceA,
        source_document_id: documentA,
        mode: 'quick_scan',
        status: 'running',
        orchestration_version: 'large-document-jobs-v1',
        input_hash: 'd'.repeat(64),
        requested_by: userAId,
        current_stage: 'normalizing',
        progress_numerator: 0,
        progress_denominator: 1,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('processing_stage_runs').insert({
        id: stageId,
        workspace_id: workspaceA,
        job_id: jobId,
        stage: 'normalizing',
        stage_version: 'normalized-document-v1',
        input_hash: 'e'.repeat(64),
        status: 'running',
        attempt: 1,
        progress_numerator: 0,
        progress_denominator: 1,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('processing_work_units').insert({
        id: unitId,
        workspace_id: workspaceA,
        job_id: jobId,
        stage_run_id: stageId,
        unit_type: 'page_parse',
        unit_key: 'page:1',
        version: '1',
        input_hash: 'f'.repeat(64),
        status: 'queued',
        max_attempts: 3,
      })
    ).error,
  ).toBeNull();
});
beforeAll(async () => {
  expect(
    (
      await admin()
        .from('analysis_cache_entries')
        .insert({
          workspace_id: workspaceA,
          cache_key: '5'.repeat(64),
          artifact_type: 'normalized_document',
          source_document_id: documentA,
          stage: 'normalizing',
          status: 'completed',
          artifact_ref: { normalizedDocumentId: 'b'.repeat(64) },
          provenance: { test: true },
          dependency_hash: 'a'.repeat(64),
        })
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  await userA.auth.signOut();
  await userB.auth.signOut();
  const svc = admin();
  await svc.from('workspaces').delete().in('id', [workspaceA, workspaceB]);
});

describe('large-document RLS and durable work', () => {
  it('allows same-workspace reads and hides every new artifact cross-workspace', async () => {
    expect(
      (await userA.from('normalized_documents').select('id').eq('source_document_id', documentA))
        .data,
    ).toHaveLength(1);
    expect(
      (await userB.from('normalized_documents').select('id').eq('source_document_id', documentA))
        .data,
    ).toHaveLength(0);
    expect(
      (await userA.from('analysis_cache_entries').select('id').eq('source_document_id', documentA))
        .data,
    ).toHaveLength(1);
    expect(
      (await userB.from('analysis_cache_entries').select('id').eq('source_document_id', documentA))
        .data,
    ).toHaveLength(0);
    expect(
      (await userB.from('large_document_jobs').select('id').eq('id', jobId)).data,
    ).toHaveLength(0);
    expect(
      (await userB.from('processing_work_units').select('id').eq('id', unitId)).data,
    ).toHaveLength(0);
  });
  it('denies ordinary-user machine artifact fabrication and work claims', async () => {
    expect(
      (
        await userA.from('analysis_cache_entries').insert({
          workspace_id: workspaceA,
          cache_key: '1'.repeat(64),
          artifact_type: 'forged',
          stage: 'parse',
          status: 'completed',
          artifact_ref: {},
          provenance: {},
          dependency_hash: '2'.repeat(64),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await userA.rpc('claim_large_document_work_unit', {
          p_workspace_id: workspaceA,
          p_worker_id: 'forged',
          p_lease_seconds: 120,
        })
      ).error,
    ).not.toBeNull();
  });
  it('rejects cross-workspace and cross-document normalized evidence references even for service writes', async () => {
    const svc = admin();
    const sectionId = `section-${crypto.randomUUID()}`;
    expect(
      (
        await svc.from('normalized_sections').insert({
          id: sectionId,
          normalized_document_id: 'b'.repeat(64),
          workspace_id: workspaceA,
          source_document_id: documentA,
          title: 'A',
          level: 1,
          order_index: 0,
          provenance: { sourceDocumentId: documentA, sourceFormat: 'txt' },
        })
      ).error,
    ).toBeNull();
    const forged = await svc.from('normalized_blocks').insert({
      id: '4'.repeat(64),
      normalized_document_id: '2'.repeat(64),
      workspace_id: workspaceB,
      source_document_id: documentB,
      section_id: sectionId,
      block_type: 'paragraph',
      text: 'forged',
      normalized_text: 'forged',
      order_index: 0,
      confidence: 1,
      provenance: { sourceDocumentId: documentB, sourceFormat: 'txt' },
      metadata: {},
    });
    expect(forged.error?.message).toMatch(/foreign key/i);
  });
  it('claims one unit atomically and prevents a duplicate active claim', async () => {
    const svc = admin();
    const first = await svc.rpc('claim_large_document_work_unit', {
      p_workspace_id: workspaceA,
      p_worker_id: 'worker-a',
      p_lease_seconds: 120,
    });
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);
    const second = await svc.rpc('claim_large_document_work_unit', {
      p_workspace_id: workspaceA,
      p_worker_id: 'worker-b',
      p_lease_seconds: 120,
    });
    expect(second.error).toBeNull();
    expect(second.data).toHaveLength(0);
  });
  it('reclaims an expired lease after a simulated worker crash', async () => {
    const svc = admin();
    await svc
      .from('processing_work_units')
      .update({ lease_expires_at: new Date(0).toISOString() })
      .eq('id', unitId);
    const reclaimed = await svc.rpc('claim_large_document_work_unit', {
      p_workspace_id: workspaceA,
      p_worker_id: 'worker-recovery',
      p_lease_seconds: 120,
    });
    expect(reclaimed.error).toBeNull();
    expect(reclaimed.data?.[0]).toMatchObject({
      id: unitId,
      lease_owner: 'worker-recovery',
      attempts: 2,
    });
  });
});
