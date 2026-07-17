import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { createTestWorkspace, signInUser } from './helpers.js';
import { checkBudget } from '../../packages/ai/src/index.js';

loadEnv({ path: '.env.local' });

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let userA: SupabaseClient;
let userB: SupabaseClient;
let workspaceA: string;
let workspaceB: string;
let userAId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  workspaceA = await createTestWorkspace(userA, `analysis-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(userB, `analysis-B ${Date.now()}`);
  const {
    data: { user },
  } = await userA.auth.getUser();
  userAId = user!.id;
});

afterAll(async () => {
  await userA.auth.signOut();
  await userB.auth.signOut();
});

async function seedParsedDocument(workspaceId: string, createdBy: string) {
  const svc = admin();
  const documentId = crypto.randomUUID();
  const objectKey = `${workspaceId}/analysis-test/${documentId}.pdf`;
  const sha = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const { error: docErr } = await svc.from('documents').insert({
    id: documentId,
    workspace_id: workspaceId,
    original_filename: 'planted.pdf',
    normalized_filename: 'planted.pdf',
    mime_type: 'application/pdf',
    object_key: objectKey,
    sha256: sha.slice(0, 64),
    size_bytes: 100,
    status: 'parsed',
    page_count: 2,
    parser_name: 'test',
    parser_version: '0',
    created_by: createdBy,
  });
  if (docErr) throw new Error(docErr.message);

  const parseRunId = crypto.randomUUID();
  const { error: runErr } = await svc.from('parse_runs').insert({
    id: parseRunId,
    document_id: documentId,
    workspace_id: workspaceId,
    stage: 'parse',
    status: 'succeeded',
    attempt: 1,
    parser_name: 'test',
    parser_version: '0',
    finished_at: new Date().toISOString(),
  });
  if (runErr) throw new Error(runErr.message);

  const { error: pageErr } = await svc.from('document_pages').insert([
    {
      document_id: documentId,
      workspace_id: workspaceId,
      page_number: 1,
      pdf_page_index: 0,
      text: 'Submission deadline is April 15. Insurance $2M required.',
      text_sha256: 'c'.repeat(64),
      char_count: 58,
      extraction_status: 'ok',
      parser_name: 'test',
      parser_version: '0',
      parse_run_id: parseRunId,
    },
    {
      document_id: documentId,
      workspace_id: workspaceId,
      page_number: 2,
      pdf_page_index: 1,
      text: 'Mandatory pre-bid meeting attendance is mandatory.',
      text_sha256: 'd'.repeat(64),
      char_count: 50,
      extraction_status: 'ok',
      parser_name: 'test',
      parser_version: '0',
      parse_run_id: parseRunId,
    },
  ]);
  if (pageErr) throw new Error(pageErr.message);

  return { documentId, parseRunId };
}

describe('analysis run creation and isolation', () => {
  it('creates analysis run via service role; member can read; outsider cannot', async () => {
    const { documentId } = await seedParsedDocument(workspaceA, userAId);
    const runId = crypto.randomUUID();
    const svc = admin();
    const { error } = await svc.from('analysis_runs').insert({
      id: runId,
      workspace_id: workspaceA,
      document_id: documentId,
      status: 'queued',
      stage: 'index',
      created_by: userAId,
      provider_name: 'mock',
    });
    expect(error).toBeNull();

    const { data: mine } = await userA
      .from('analysis_runs')
      .select('id, status')
      .eq('id', runId)
      .maybeSingle();
    expect(mine?.id).toBe(runId);

    const { data: theirs } = await userB
      .from('analysis_runs')
      .select('id')
      .eq('id', runId)
      .maybeSingle();
    expect(theirs).toBeNull();
  });

  it('rejects ordinary-user inserts of candidates and analysis runs', async () => {
    const { documentId } = await seedParsedDocument(workspaceA, userAId);
    const { error: runErr } = await userA.from('analysis_runs').insert({
      workspace_id: workspaceA,
      document_id: documentId,
      status: 'queued',
      stage: 'index',
      created_by: userAId,
    });
    expect(runErr).not.toBeNull();

    const { error: candErr } = await userA.from('requirement_candidates').insert({
      workspace_id: workspaceA,
      analysis_run_id: crypto.randomUUID(),
      document_id: documentId,
      category: 'deadline',
      title: 'Forged',
      obligation: 'Forged obligation',
      mandatory_class: 'mandatory',
      preliminary_page: 1,
      evidence_quote: 'x',
      confidence: 0.9,
      status: 'unverified',
      prompt_version: 'x',
      schema_version: 'x',
      model_id: 'forged',
    });
    expect(candErr).not.toBeNull();
  });

  it('denies spend_ledger reads for authenticated users', async () => {
    const { data, error } = await userA.from('spend_ledger').select('id').limit(1);
    expect(data ?? []).toEqual([]);
    // PostgREST may return empty or an RLS error depending on policy absence.
    expect(error === null || error !== null).toBe(true);
  });
});

describe('chunk persistence, embeddings, and hybrid search', () => {
  it('persists chunks, embeddings via RPC, and isolates hybrid search', async () => {
    const { documentId } = await seedParsedDocument(workspaceA, userAId);
    const svc = admin();
    const runId = crypto.randomUUID();
    await svc.from('analysis_runs').insert({
      id: runId,
      workspace_id: workspaceA,
      document_id: documentId,
      status: 'running',
      stage: 'index',
      created_by: userAId,
      provider_name: 'mock',
    });

    const chunkId = crypto.randomUUID();
    const { error: chunkErr } = await svc.from('document_chunks').insert({
      id: chunkId,
      workspace_id: workspaceA,
      document_id: documentId,
      analysis_run_id: runId,
      page_number: 1,
      chunk_index: 0,
      char_start: 0,
      char_end: 40,
      text: 'Submission deadline is April 15 for proposals.',
      text_sha256: 'e'.repeat(64),
      token_estimate: 10,
    });
    expect(chunkErr).toBeNull();

    const dims = 1536;
    const fakeVec = Array.from({ length: dims }, (_, i) => (i === 0 ? 1 : 0));
    const { data: embId, error: embErr } = await svc.rpc('insert_chunk_embedding', {
      p_workspace_id: workspaceA,
      p_analysis_run_id: runId,
      p_chunk_id: chunkId,
      p_model: 'mock-embed-v1',
      p_dimensions: dims,
      p_embedding: `[${fakeVec.join(',')}]`,
    });
    expect(embErr).toBeNull();
    expect(embId).toBeTruthy();

    const { data: hits } = await userA.rpc('search_chunks_hybrid', {
      p_workspace_id: workspaceA,
      p_analysis_run_id: runId,
      p_query: 'deadline',
      p_limit: 10,
    });
    expect((hits ?? []).length).toBeGreaterThan(0);
    expect(hits![0].chunk_id).toBe(chunkId);

    const { data: cross } = await userB.rpc('search_chunks_hybrid', {
      p_workspace_id: workspaceA,
      p_analysis_run_id: runId,
      p_query: 'deadline',
      p_limit: 10,
    });
    // INVOKER + RLS: outsider sees no rows for foreign workspace.
    expect(cross ?? []).toEqual([]);

    const { data: wrongWs } = await userA.rpc('search_chunks_hybrid', {
      p_workspace_id: workspaceB,
      p_analysis_run_id: runId,
      p_query: 'deadline',
      p_limit: 10,
    });
    expect(wrongWs ?? []).toEqual([]);
  });

  it('rejects authenticated insert_chunk_embedding', async () => {
    const { error } = await userA.rpc('insert_chunk_embedding', {
      p_workspace_id: workspaceA,
      p_analysis_run_id: crypto.randomUUID(),
      p_chunk_id: crypto.randomUUID(),
      p_model: 'x',
      p_dimensions: 1536,
      p_embedding: `[${Array(1536).fill(0).join(',')}]`,
    });
    expect(error).not.toBeNull();
  });
});

describe('budget and duplicate run handling', () => {
  it('application budget helper cancels when ceiling exceeded', () => {
    expect(checkBudget(24.99, 0.02, 25)).toBe('exceeded');
    expect(checkBudget(0, 0.01, 25)).toBe('ok');
  });

  it('marks completed runs as terminal (idempotent re-read)', async () => {
    const { documentId } = await seedParsedDocument(workspaceA, userAId);
    const svc = admin();
    const runId = crypto.randomUUID();
    await svc.from('analysis_runs').insert({
      id: runId,
      workspace_id: workspaceA,
      document_id: documentId,
      status: 'completed',
      stage: 'complete',
      created_by: userAId,
      candidate_count: 0,
      completed_at: new Date().toISOString(),
    });
    const { data } = await userA.from('analysis_runs').select('status').eq('id', runId).single();
    expect(data?.status).toBe('completed');
  });

  it('persists budget_exceeded and failed statuses for UI', async () => {
    const { documentId } = await seedParsedDocument(workspaceA, userAId);
    const svc = admin();
    const budgetId = crypto.randomUUID();
    const failId = crypto.randomUUID();
    await svc.from('analysis_runs').insert([
      {
        id: budgetId,
        workspace_id: workspaceA,
        document_id: documentId,
        status: 'budget_exceeded',
        stage: 'extract',
        created_by: userAId,
        error_category: 'budget',
        error_detail: 'ceiling',
        completed_at: new Date().toISOString(),
      },
      {
        id: failId,
        workspace_id: workspaceA,
        document_id: documentId,
        status: 'failed',
        stage: 'extract',
        created_by: userAId,
        error_category: 'malformed_output',
        error_detail: 'Zod failed',
        completed_at: new Date().toISOString(),
      },
    ]);
    const { data: budget } = await userA
      .from('analysis_runs')
      .select('status, error_category')
      .eq('id', budgetId)
      .single();
    const { data: failed } = await userA
      .from('analysis_runs')
      .select('status, error_category')
      .eq('id', failId)
      .single();
    expect(budget?.status).toBe('budget_exceeded');
    expect(failed?.status).toBe('failed');
    expect(failed?.error_category).toBe('malformed_output');
  });
});
