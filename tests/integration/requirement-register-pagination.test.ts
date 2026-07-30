import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const POPULATION = 125;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let owner: SupabaseClient;
let outsider: SupabaseClient;
let admin: SupabaseClient;
let workspaceId: string;
let verificationRunId: string;

async function insertInChunks(table: string, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 100) {
    const result = await admin.from(table).insert(rows.slice(index, index + 100));
    expect(result.error).toBeNull();
  }
}

beforeAll(async () => {
  owner = await signInUser('A');
  outsider = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actorId = (await owner.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(owner, `requirement register scale ${Date.now()}`);
  const documentId = randomUUID();
  const analysisRunId = randomUUID();
  verificationRunId = randomUUID();

  expect(
    (
      await admin.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: actorId,
        document_type: 'primary_rfp',
        original_filename: 'Bounded requirement register fixture.pdf',
        normalized_filename: 'Bounded requirement register fixture.pdf',
        mime_type: 'application/pdf',
        object_key: `${workspaceId}/requirement-register/${documentId}.pdf`,
        size_bytes: 1_000,
        sha256: sha(`${workspaceId}:document`),
        status: 'parsed',
        page_count: 125,
        parser_name: 'integration',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('analysis_runs').insert({
        id: analysisRunId,
        workspace_id: workspaceId,
        document_id: documentId,
        status: 'completed',
        stage: 'complete',
        created_by: actorId,
        candidate_count: POPULATION,
        input_hash: sha(`${workspaceId}:analysis`),
        completed_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();

  const baseTime = Date.now() - POPULATION * 1_000;
  const candidates = Array.from({ length: POPULATION }, (_, index) => ({
    id: randomUUID(),
    workspace_id: workspaceId,
    analysis_run_id: analysisRunId,
    document_id: documentId,
    category:
      index % 3 === 0 ? 'mandatory_form' : index % 3 === 1 ? 'insurance' : 'technical_response',
    title: `Requirement ${String(index + 1).padStart(3, '0')}`,
    obligation: `The bidder must satisfy bounded obligation ${index + 1}.`,
    mandatory_class: index % 4 === 0 ? 'optional' : 'mandatory',
    preliminary_page: index + 1,
    evidence_quote: `The bidder must satisfy bounded obligation ${index + 1}.`,
    confidence: 0.9,
    status: 'unverified',
    prompt_version: 'integration',
    schema_version: 'candidate-v1',
    model_id: 'mock',
    created_at: new Date(baseTime + index * 1_000).toISOString(),
  }));
  await insertInChunks('requirement_candidates', candidates);

  expect(
    (
      await admin.from('verification_runs').insert({
        id: verificationRunId,
        workspace_id: workspaceId,
        analysis_run_id: analysisRunId,
        status: 'completed',
        version: 1,
        input_hash: sha(`${workspaceId}:verification`),
        prompt_version: 'verify-entailment-v7',
        schema_version: 'verification-final-assessment-v1',
        retrieval_version: 'verification-retrieval-v1',
        normalization_version: 'evidence-nfkc-v1',
        provider: 'mock',
        model: 'mock',
        reasoning_effort: 'low',
        created_by: actorId,
        candidate_count: POPULATION,
        finding_count: POPULATION,
        completed_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();

  const findings = candidates.slice(0, POPULATION - 1).map((candidate, index) => ({
    id: randomUUID(),
    workspace_id: workspaceId,
    analysis_run_id: analysisRunId,
    verification_run_id: verificationRunId,
    candidate_id: candidate.id,
    finding_version: 1,
    source_support_status: index % 10 === 0 ? 'unsupported' : 'supported',
    precedence_status: 'active',
    proof_requirement: index % 5 === 0 ? 'requires_company_artifact' : 'none_identified',
    rationale: 'Bounded integration fixture.',
    material_mismatches: [],
    deterministic_facts: [],
    parser_concerns: [],
    ambiguity_notes: [],
    prompt_version: 'verify-entailment-v7',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'mock',
  }));
  await insertInChunks('verification_findings', findings);
  await insertInChunks(
    'human_review_decisions',
    findings.slice(0, 7).map((finding) => ({
      workspace_id: workspaceId,
      finding_id: finding.id,
      reviewer_id: actorId,
      decision: 'accepted',
      note: 'Integration fixture decision.',
    })),
  );
}, 90_000);

describe('bounded requirement-register RPC', () => {
  it('returns stable bounded pages and authoritative unfiltered summary metrics', async () => {
    const first = await owner.rpc('get_requirement_register_v1', {
      p_workspace_id: workspaceId,
      p_verification_run_id: verificationRunId,
      p_page: 1,
      p_page_size: 50,
    });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      version: 'requirement-register-query-v1',
      page: 1,
      pageSize: 50,
      total: POPULATION,
      summary: {
        totalRequirements: POPULATION,
        needsAttention: 14,
        companyEvidenceRequired: 25,
        pendingReviews: 118,
      },
    });
    expect(first.data.rows).toHaveLength(50);

    const third = await owner.rpc('get_requirement_register_v1', {
      p_workspace_id: workspaceId,
      p_verification_run_id: verificationRunId,
      p_page: 3,
      p_page_size: 50,
    });
    expect(third.error).toBeNull();
    expect(third.data.rows).toHaveLength(25);
    const firstIds = new Set(first.data.rows.map((row: { id: string }) => row.id));
    expect(third.data.rows.every((row: { id: string }) => !firstIds.has(row.id))).toBe(true);
  });

  it('filters on the server and denies cross-workspace access', async () => {
    const filtered = await owner.rpc('get_requirement_register_v1', {
      p_workspace_id: workspaceId,
      p_verification_run_id: verificationRunId,
      p_source_status: 'unsupported',
      p_search: 'bounded obligation',
      p_page: 1,
      p_page_size: 10,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data.total).toBe(13);
    expect(filtered.data.rows).toHaveLength(10);
    expect(
      filtered.data.rows.every(
        (row: { sourceSupportStatus: string }) => row.sourceSupportStatus === 'unsupported',
      ),
    ).toBe(true);

    const denied = await outsider.rpc('get_requirement_register_v1', {
      p_workspace_id: workspaceId,
      p_verification_run_id: verificationRunId,
      p_page: 1,
      p_page_size: 10,
    });
    expect(denied.error?.message).toContain('authorized workspace member required');
  });
});
