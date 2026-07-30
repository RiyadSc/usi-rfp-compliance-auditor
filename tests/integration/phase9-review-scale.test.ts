import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const POPULATION = 1_000;

let user: SupabaseClient;
let admin: SupabaseClient;
let workspaceId: string;
let runId: string;

async function insertInChunks(table: string, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const result = await admin.from(table).insert(rows.slice(index, index + 200));
    expect(result.error).toBeNull();
  }
}

beforeAll(async () => {
  user = await signInUser('A');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actorId = (await user.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(user, `phase9 bounded scale ${Date.now()}`);
  const documentId = randomUUID();
  const parseRunId = randomUUID();
  runId = randomUUID();
  const lines = Array.from(
    { length: POPULATION },
    (_, index) => `The contractor shall submit operational report ${index + 1}.`,
  );
  const pageText = lines.join('\n');
  const sourceHash = sha(pageText);

  expect(
    (
      await admin.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: actorId,
        document_type: 'primary_rfp',
        original_filename: 'Large deterministic review fixture.pdf',
        normalized_filename: 'Large deterministic review fixture.pdf',
        mime_type: 'application/pdf',
        object_key: `${workspaceId}/phase9-scale/${documentId}.pdf`,
        size_bytes: pageText.length,
        sha256: sourceHash,
        status: 'parsed',
        page_count: 1,
        parser_name: 'integration',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('parse_runs').insert({
        id: parseRunId,
        workspace_id: workspaceId,
        document_id: documentId,
        stage: 'parse',
        status: 'succeeded',
        parser_name: 'integration',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('document_pages').insert({
        workspace_id: workspaceId,
        document_id: documentId,
        parse_run_id: parseRunId,
        page_number: 1,
        pdf_page_index: 0,
        text: pageText,
        text_sha256: sourceHash,
        char_count: pageText.length,
        extraction_status: 'ok',
        parser_name: 'integration',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_evaluation_runs').insert({
        id: runId,
        workspace_id: workspaceId,
        actor_id: actorId,
        mode: 'workspace_live',
        status: 'completed',
        source_package_hash: sha(`${runId}:source`),
        document_set_hash: sha(`${runId}:documents`),
        expected_answer_hash: sha(`${runId}:no-answers`),
        expected_answers_used: false,
        call_plan_hash: sha(`${runId}:plan`),
        compatibility_fingerprint: sha(`${runId}:compatibility`),
        versions: { purpose: 'phase9-review-bounded-scale-v1' },
        planned_maximum_usd: 0,
        requested_maximum_usd: 0.1,
        actual_usd: 0,
        completed_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_evaluation_documents').insert({
        workspace_id: workspaceId,
        evaluation_run_id: runId,
        document_id: documentId,
        source_hash: sourceHash,
        ordinal: 0,
        page_count: 1,
      })
    ).error,
  ).toBeNull();

  const records = lines.map((evidenceText, index) => {
    const candidateHash = sha(`${runId}:candidate:${index}`);
    const blockHash = sha(`${runId}:block:${index}`);
    return { evidenceText, candidateHash, blockHash, index };
  });
  await insertInChunks(
    'phase9_source_block_coverage',
    records.map(({ blockHash, index }) => ({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      block_hash: blockHash,
      source_document_id: documentId,
      source_document_key: 'Large deterministic review fixture.pdf',
      source_hash: sourceHash,
      block_type: 'page_window',
      page_number: 1,
      heading_path: [],
      route: 'selected_for_deterministic_candidate',
      deterministic_signals: ['shall'],
      processing_result: `candidate generated:${index}`,
      coverage_version: 'phase9-source-coverage-v1',
    })),
  );
  await insertInChunks(
    'phase9_candidate_seeds',
    records.map(({ evidenceText, candidateHash, blockHash, index }) => ({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      candidate_hash: candidateHash,
      source_block_hashes: [blockHash],
      requirement_type: 'technical',
      obligation_text: evidenceText,
      evidence_text: evidenceText,
      material_facts: { reportNumber: index + 1 },
      discovery_route: 'deterministic',
      miner_version: 'phase9-deterministic-miner-v1',
    })),
  );
  await insertInChunks(
    'phase9_findings',
    records.map(({ candidateHash, blockHash }) => ({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      candidate_hash: candidateHash,
      source_support_status: 'supported',
      precedence_status: 'active',
      proof_requirement: 'none_identified',
      evidence_block_hashes: [blockHash],
      decision_version: 'phase9-deterministic-verification-v1',
    })),
  );
}, 120_000);

describe('Phase 9 bounded 1,000-finding review population', () => {
  it('returns bounded stable pages without loading the full population', async () => {
    const started = performance.now();
    const first = await user.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'routine',
      p_search: '',
      p_duplicate_signature: null,
      p_page: 1,
      p_page_size: 50,
    });
    const firstDuration = performance.now() - started;
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      version: 'phase9-review-priority-v1',
      page: 1,
      pageSize: 50,
      total: POPULATION,
    });
    expect(first.data.rows).toHaveLength(50);
    expect(JSON.stringify(first.data).length).toBeLessThan(500_000);
    expect(firstDuration).toBeLessThan(15_000);

    const last = await user.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'routine',
      p_search: '',
      p_duplicate_signature: null,
      p_page: 20,
      p_page_size: 50,
    });
    expect(last.error).toBeNull();
    expect(last.data).toMatchObject({ page: 20, pageSize: 50, total: POPULATION });
    expect(last.data.rows).toHaveLength(50);
    expect(last.data.rows[0].candidate_hash).not.toBe(first.data.rows[0].candidate_hash);
  });

  it('aggregates the executive summary once and rejects pathological page offsets', async () => {
    const dashboard = await user.rpc('get_phase9_review_dashboard_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(dashboard.error).toBeNull();
    expect(dashboard.data).toMatchObject({
      totalFindings: POPULATION,
      routine: POPULATION,
      batchEligible: POPULATION,
      publicationEligible: false,
    });
    const invalid = await user.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'all',
      p_search: '',
      p_duplicate_signature: null,
      p_page: 1_000_001,
      p_page_size: 25,
    });
    expect(invalid.error?.message).toContain('invalid review queue request');
  }, 60_000);
});
