import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import {
  MockProvider,
  type CandidateAssessmentInput,
  type ChallengeInput,
  type DuplicatePairInput,
} from '../../packages/ai/src/index.js';
import { handleVerifyJob } from '../../apps/worker/src/verify-requirements.js';
import {
  PHASE4_SYNTHETIC_MARKER,
  computeSyntheticCandidateSetHash,
} from '../../apps/worker/src/phase4-smoke-preflight.js';
import { createTestWorkspace, signInUser } from './helpers.js';

loadEnv({ path: '.env.local' });
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let userA: SupabaseClient,
  userB: SupabaseClient,
  workspaceA: string,
  workspaceB: string,
  userAId: string,
  userBId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  workspaceA = await createTestWorkspace(userA, `verify-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(userB, `verify-B ${Date.now()}`);
  userAId = (await userA.auth.getUser()).data.user!.id;
  userBId = (await userB.auth.getUser()).data.user!.id;
});
afterAll(async () => {
  await userA.auth.signOut();
  await userB.auth.signOut();
});

async function seedVerification(options?: {
  pageText?: string;
  obligation?: string;
  evidenceQuote?: string;
}) {
  const svc = admin();
  const documentId = crypto.randomUUID(),
    parseRunId = crypto.randomUUID(),
    analysisRunId = crypto.randomUUID();
  const candidateId = crypto.randomUUID(),
    verificationRunId = crypto.randomUUID(),
    processingJobId = crypto.randomUUID();
  const pageText = options?.pageText ?? 'Offerors must submit Certificate Z-9 by April 22, 2026.';
  const objectKey = `${workspaceA}/verify-test/${documentId}.pdf`;
  await svc.from('documents').insert({
    id: documentId,
    workspace_id: workspaceA,
    created_by: userAId,
    document_type: 'primary_rfp',
    original_filename: 'verify.pdf',
    normalized_filename: 'verify.pdf',
    mime_type: 'application/pdf',
    object_key: objectKey,
    size_bytes: 100,
    sha256: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    status: 'parsed',
    page_count: 1,
    parser_name: 'test',
    parser_version: '1',
  });
  await svc.from('parse_runs').insert({
    id: parseRunId,
    document_id: documentId,
    workspace_id: workspaceA,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'test',
    parser_version: '1',
    finished_at: new Date().toISOString(),
  });
  const { data: page } = await svc
    .from('document_pages')
    .insert({
      document_id: documentId,
      workspace_id: workspaceA,
      parse_run_id: parseRunId,
      page_number: 1,
      pdf_page_index: 0,
      text: pageText,
      text_sha256: 'a'.repeat(64),
      char_count: pageText.length,
      extraction_status: 'ok',
      parser_name: 'test',
      parser_version: '1',
    })
    .select('id')
    .single();
  await svc.from('analysis_runs').insert({
    id: analysisRunId,
    workspace_id: workspaceA,
    document_id: documentId,
    status: 'completed',
    stage: 'complete',
    created_by: userAId,
    candidate_count: 1,
    completed_at: new Date().toISOString(),
  });
  await svc.from('requirement_candidates').insert({
    id: candidateId,
    workspace_id: workspaceA,
    analysis_run_id: analysisRunId,
    document_id: documentId,
    category: 'certification',
    title: 'Certificate Z-9',
    obligation: options?.obligation ?? 'Offerors must submit Certificate Z-9 by April 22, 2026.',
    mandatory_class: 'mandatory',
    preliminary_page: 1,
    evidence_quote: options?.evidenceQuote ?? pageText,
    confidence: 0.8,
    status: 'unverified',
    prompt_version: 'extract-v1',
    schema_version: 'candidate-v1',
    model_id: 'mock',
  });
  await svc.from('document_chunks').insert({
    workspace_id: workspaceA,
    document_id: documentId,
    analysis_run_id: analysisRunId,
    page_number: 1,
    chunk_index: 0,
    char_start: 0,
    char_end: pageText.length,
    text: pageText,
    text_sha256: 'a'.repeat(64),
    token_estimate: 15,
  });
  await svc.from('verification_runs').insert({
    id: verificationRunId,
    workspace_id: workspaceA,
    analysis_run_id: analysisRunId,
    status: 'queued',
    version: 1,
    input_hash: crypto.randomUUID().replaceAll('-', ''),
    prompt_version: 'verify-v1',
    schema_version: 'verification-finding-v1',
    retrieval_version: 'verify-retrieval-v1',
    normalization_version: 'evidence-nfkc-v1',
    created_by: userAId,
    candidate_count: 1,
  });
  await svc.from('processing_jobs').insert({
    id: processingJobId,
    workspace_id: workspaceA,
    document_id: documentId,
    stage: 'verify',
    status: 'queued',
    input_hash: crypto.randomUUID().replaceAll('-', ''),
    max_attempts: 3,
  });
  return {
    documentId,
    analysisRunId,
    candidateId,
    verificationRunId,
    processingJobId,
    pageId: page!.id,
    pageText,
  };
}

describe('Phase 4 verification persistence and isolation', () => {
  it('binds the provisioned complete synthetic scope and denies ordinary-user mutation', async () => {
    const scopeId = '40000000-0000-4000-8000-000000000001';
    const svc = admin();
    const { data: scope, error } = await svc
      .from('phase4_synthetic_smoke_scopes')
      .select('*')
      .eq('id', scopeId)
      .single();
    expect(error).toBeNull();
    expect(scope).toMatchObject({
      workspace_id: '10000000-0000-4000-8000-000000000001',
      authenticated_user_id: '922727a8-727b-4b9e-a0ff-6e7f7f43d82c',
      analysis_run_id: '10000000-0000-4000-8000-000000000003',
      fixture_version: 'verification-cases-v2',
      scope_version: 'phase4-complete-scope-v1',
      compatibility_fingerprint: 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b',
      synthetic_marker: 'phase4-synthetic-test-only',
    });
    expect(scope.approved_candidate_ids).toHaveLength(24);
    expect(scope.approved_document_ids).toEqual(['10000000-0000-4000-8000-000000000002']);
    expect(scope.candidate_set_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(scope.document_set_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(scope.expected_answers_hash).toMatch(/^[a-f0-9]{64}$/);

    expect(
      (await userA.from('phase4_synthetic_smoke_scopes').select('id').eq('id', scopeId)).data,
    ).toEqual([]);
    const ordinaryUpdate = await userA
      .from('phase4_synthetic_smoke_scopes')
      .update({ fixture_version: 'changed' })
      .eq('id', scopeId)
      .select('id');
    expect(ordinaryUpdate.error).toBeNull();
    expect(ordinaryUpdate.data).toEqual([]);
    const ordinaryDelete = await userA
      .from('phase4_synthetic_smoke_scopes')
      .delete()
      .eq('id', scopeId)
      .select('id');
    expect(ordinaryDelete.error).toBeNull();
    expect(ordinaryDelete.data).toEqual([]);
    expect(
      (
        await svc
          .from('phase4_synthetic_smoke_scopes')
          .update({ document_set_hash: 'f'.repeat(64) })
          .eq('id', scopeId)
      ).error?.message,
    ).toMatch(/immutable|append-only/i);
    expect(
      (await svc.from('phase4_synthetic_smoke_scopes').delete().eq('id', scopeId)).error?.message,
    ).toMatch(/immutable|append-only/i);
  });

  it('enforces immutable service-only synthetic smoke scopes and workspace ownership', async () => {
    const seed = await seedVerification();
    const svc = admin();
    await svc
      .from('documents')
      .update({ parser_name: 'synthetic-fixture' })
      .eq('id', seed.documentId);
    const candidate = {
      id: seed.candidateId,
      workspaceId: workspaceA,
      analysisRunId: seed.analysisRunId,
      documentId: seed.documentId,
      category: 'certification',
      title: 'Certificate Z-9',
      obligation: 'Offerors must submit Certificate Z-9 by April 22, 2026.',
      preliminaryPage: 1,
      evidenceQuote: seed.pageText,
    };
    const scopeId = crypto.randomUUID();
    const valid = await svc.from('phase4_synthetic_smoke_scopes').insert({
      id: scopeId,
      workspace_id: workspaceA,
      authenticated_user_id: userAId,
      analysis_run_id: seed.analysisRunId,
      fixture_version: 'verification-cases-v2',
      compatibility_fingerprint: 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b',
      approved_document_ids: [seed.documentId],
      approved_candidate_ids: [seed.candidateId],
      candidate_set_hash: computeSyntheticCandidateSetHash([candidate]),
      synthetic_marker: PHASE4_SYNTHETIC_MARKER,
    });
    expect(valid.error).toBeNull();
    expect(
      (await userA.from('phase4_synthetic_smoke_scopes').select('id').eq('id', scopeId)).data,
    ).toEqual([]);
    expect(
      (
        await svc
          .from('phase4_synthetic_smoke_scopes')
          .update({ fixture_version: 'changed' })
          .eq('id', scopeId)
      ).error,
    ).not.toBeNull();
    const wrongIdentity = await svc.from('phase4_synthetic_smoke_scopes').insert({
      workspace_id: workspaceA,
      authenticated_user_id: userBId,
      analysis_run_id: seed.analysisRunId,
      fixture_version: 'verification-cases-v2',
      compatibility_fingerprint: 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b',
      approved_document_ids: [seed.documentId],
      approved_candidate_ids: [seed.candidateId],
      candidate_set_hash: computeSyntheticCandidateSetHash([candidate]),
      synthetic_marker: PHASE4_SYNTHETIC_MARKER,
    });
    expect(wrongIdentity.error?.message).toMatch(/identity lacks workspace access/i);
    const foreignDocumentId = crypto.randomUUID();
    await svc.from('documents').insert({
      id: foreignDocumentId,
      workspace_id: workspaceB,
      created_by: userBId,
      document_type: 'primary_rfp',
      original_filename: 'synthetic-denial.pdf',
      normalized_filename: 'synthetic-denial.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceB}/synthetic-denial/${foreignDocumentId}.pdf`,
      size_bytes: 10,
      sha256: 'b'.repeat(64),
      status: 'parsed',
      page_count: 1,
      parser_name: 'synthetic-fixture',
      parser_version: '1',
    });
    const foreignDocument = await svc.from('phase4_synthetic_smoke_scopes').insert({
      workspace_id: workspaceA,
      authenticated_user_id: userAId,
      analysis_run_id: seed.analysisRunId,
      fixture_version: 'verification-cases-v2',
      compatibility_fingerprint: 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b',
      approved_document_ids: [foreignDocumentId],
      approved_candidate_ids: [seed.candidateId],
      candidate_set_hash: computeSyntheticCandidateSetHash([candidate]),
      synthetic_marker: PHASE4_SYNTHETIC_MARKER,
    });
    expect(foreignDocument.error?.message).toMatch(/cross-workspace synthetic smoke document/i);
  });

  it('binds the production worker to the qualified context/output limits and persists its fingerprint', async () => {
    const seed = await seedVerification();
    const secondCandidateId = crypto.randomUUID();
    await admin().from('requirement_candidates').insert({
      id: secondCandidateId,
      workspace_id: workspaceA,
      analysis_run_id: seed.analysisRunId,
      document_id: seed.documentId,
      category: 'certification',
      title: 'Certificate Z-9',
      obligation: 'Offerors must submit Certificate Z-9 by April 22, 2026.',
      mandatory_class: 'mandatory',
      preliminary_page: 1,
      evidence_quote: seed.pageText,
      confidence: 0.8,
      status: 'unverified',
      prompt_version: 'extract-v1',
      schema_version: 'candidate-v1',
      model_id: 'mock',
    });
    const observed = {
      entailment: [] as Array<{ contexts: number; maxOutputTokens: number }>,
      challenge: [] as Array<{ contexts: number; maxOutputTokens: number }>,
      duplicate: [] as number[],
    };
    class RecordingProvider extends MockProvider {
      override async assessEntailment(input: CandidateAssessmentInput) {
        observed.entailment.push({
          contexts: input.contexts.length,
          maxOutputTokens: input.maxOutputTokens,
        });
        return super.assessEntailment(input);
      }
      override async challengeEntailment(input: ChallengeInput) {
        observed.challenge.push({
          contexts: input.contexts.length,
          maxOutputTokens: input.maxOutputTokens,
        });
        return super.challengeEntailment(input);
      }
      override async classifyDuplicatePair(input: DuplicatePairInput) {
        observed.duplicate.push(input.maxOutputTokens);
        return super.classifyDuplicatePair(input);
      }
    }
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new RecordingProvider(),
    );
    expect(observed.entailment.length).toBe(2);
    expect(observed.entailment.every((item) => item.contexts <= 2)).toBe(true);
    expect(observed.entailment.every((item) => item.maxOutputTokens === 1800)).toBe(true);
    expect(observed.challenge.every((item) => item.contexts <= 2)).toBe(true);
    expect(observed.challenge.every((item) => item.maxOutputTokens === 1600)).toBe(true);
    expect(observed.duplicate).toContain(600);
    const fingerprint = 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';
    const [{ data: run }, { data: analysis }, { data: calls }] = await Promise.all([
      admin()
        .from('verification_runs')
        .select('compatibility_fingerprint')
        .eq('id', seed.verificationRunId)
        .single(),
      admin()
        .from('analysis_runs')
        .select('verification_compatibility_fingerprint')
        .eq('id', seed.analysisRunId)
        .single(),
      admin()
        .from('model_calls')
        .select('compatibility_fingerprint')
        .eq('verification_run_id', seed.verificationRunId),
    ]);
    expect(run?.compatibility_fingerprint).toBe(fingerprint);
    expect(analysis?.verification_compatibility_fingerprint).toBe(fingerprint);
    expect(calls?.length).toBeGreaterThan(0);
    expect(calls?.every((call) => call.compatibility_fingerprint === fingerprint)).toBe(true);
  });

  it('runs the mock worker path and persists linked, versioned machine findings and exact evidence', async () => {
    const seed = await seedVerification();
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new MockProvider(),
    );
    const { data: run } = await userA
      .from('verification_runs')
      .select('status, finding_count')
      .eq('id', seed.verificationRunId)
      .single();
    expect(run).toMatchObject({ status: 'completed', finding_count: 1 });
    const { data: finding } = await userA
      .from('verification_findings')
      .select('*')
      .eq('candidate_id', seed.candidateId)
      .single();
    expect(finding).toMatchObject({
      source_support_status: 'supported',
      machine_status: 'machine_assessment_only',
      finding_version: 1,
    });
    const { data: evidence } = await userA
      .from('verification_evidence')
      .select('match_type, validated, document_page_id')
      .eq('finding_id', finding!.id)
      .single();
    expect(evidence).toMatchObject({
      match_type: 'exact',
      validated: true,
      document_page_id: seed.pageId,
    });
    const { data: outsiderFinding } = await userB
      .from('verification_findings')
      .select('id')
      .eq('id', finding!.id)
      .maybeSingle();
    expect(outsiderFinding).toBeNull();
  });

  it('denies ordinary-user machine finding creation/modification and cross-workspace evidence references', async () => {
    const seed = await seedVerification();
    const forged = await userA.from('verification_findings').insert({
      workspace_id: workspaceA,
      analysis_run_id: seed.analysisRunId,
      verification_run_id: seed.verificationRunId,
      candidate_id: seed.candidateId,
      finding_version: 1,
      source_support_status: 'supported',
      precedence_status: 'active',
      proof_requirement: 'none_identified',
      rationale: 'forged',
      prompt_version: 'x',
      schema_version: 'x',
      model_id: 'x',
    });
    expect(forged.error).not.toBeNull();
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new MockProvider(),
    );
    const svc = admin();
    const { data: finding } = await svc
      .from('verification_findings')
      .select('id')
      .eq('candidate_id', seed.candidateId)
      .single();
    const deniedUpdate = await userA
      .from('verification_findings')
      .update({ source_support_status: 'contradicted' })
      .eq('id', finding!.id)
      .select('id');
    expect(deniedUpdate.data ?? []).toEqual([]);
    expect(
      (
        await svc
          .from('verification_findings')
          .select('source_support_status')
          .eq('id', finding!.id)
          .single()
      ).data?.source_support_status,
    ).toBe('supported');
    const foreignDoc = crypto.randomUUID(),
      foreignParse = crypto.randomUUID();
    const userBId = (await userB.auth.getUser()).data.user!.id;
    await svc.from('documents').insert({
      id: foreignDoc,
      workspace_id: workspaceB,
      created_by: userBId,
      original_filename: 'b.pdf',
      normalized_filename: 'b.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceB}/${foreignDoc}.pdf`,
      size_bytes: 1,
      status: 'parsed',
      page_count: 1,
    });
    await svc.from('parse_runs').insert({
      id: foreignParse,
      document_id: foreignDoc,
      workspace_id: workspaceB,
      stage: 'parse',
      status: 'succeeded',
      parser_name: 'test',
      parser_version: '1',
    });
    const { data: foreignPage } = await svc
      .from('document_pages')
      .insert({
        document_id: foreignDoc,
        workspace_id: workspaceB,
        parse_run_id: foreignParse,
        page_number: 1,
        pdf_page_index: 0,
        text: 'foreign',
        text_sha256: 'b'.repeat(64),
        char_count: 7,
        extraction_status: 'ok',
        parser_name: 'test',
        parser_version: '1',
      })
      .select('id')
      .single();
    const cross = await svc.from('verification_evidence').insert({
      workspace_id: workspaceA,
      finding_id: finding!.id,
      document_id: foreignDoc,
      document_page_id: foreignPage!.id,
      page_number: 1,
      evidence_role: 'supporting',
      quote_exact: 'foreign',
      quote_normalized: 'foreign',
      normalization_version: 'v1',
      match_type: 'exact',
      validated: true,
    });
    expect(cross.error?.message).toMatch(/cross-workspace/i);

    const sameWorkspaceOtherDocument = crypto.randomUUID();
    await svc.from('documents').insert({
      id: sameWorkspaceOtherDocument,
      workspace_id: workspaceA,
      created_by: userAId,
      original_filename: 'other.pdf',
      normalized_filename: 'other.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceA}/${sameWorkspaceOtherDocument}.pdf`,
      size_bytes: 1,
      status: 'parsed',
      page_count: 0,
    });
    const mismatchedDocumentPage = await svc.from('verification_evidence').insert({
      workspace_id: workspaceA,
      finding_id: finding!.id,
      document_id: sameWorkspaceOtherDocument,
      document_page_id: seed.pageId,
      page_number: 1,
      evidence_role: 'supporting',
      quote_exact: seed.pageText,
      quote_normalized: seed.pageText,
      normalization_version: 'v1',
      match_type: 'exact',
      validated: true,
    });
    expect(mismatchedDocumentPage.error?.message).toMatch(/document-mismatched/i);
  });

  it('records authorized append-only human decisions, revisions, and audit events; rejects outsiders', async () => {
    const seed = await seedVerification();
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new MockProvider(),
    );
    const { data: finding } = await userA
      .from('verification_findings')
      .select('id')
      .eq('candidate_id', seed.candidateId)
      .single();
    const first = await userA.rpc('record_human_review_decision', {
      p_workspace_id: workspaceA,
      p_finding_id: finding!.id,
      p_decision: 'accepted',
      p_note: 'Evidence reviewed',
      p_corrected_values: {},
      p_relationship_id: null,
    });
    expect(first.error).toBeNull();
    const second = await userA.rpc('record_human_review_decision', {
      p_workspace_id: workspaceA,
      p_finding_id: finding!.id,
      p_decision: 'needs_follow_up',
      p_note: 'Confirm signatory',
      p_corrected_values: { signer: 'pending' },
      p_relationship_id: null,
    });
    expect(second.error).toBeNull();
    const { data: decisions } = await userA
      .from('human_review_decisions')
      .select('id, prior_decision_id, decision')
      .eq('finding_id', finding!.id)
      .order('created_at');
    expect(decisions).toHaveLength(2);
    expect(decisions![1].prior_decision_id).toBe(decisions![0].id);
    const deniedRevision = await userA
      .from('human_review_decisions')
      .update({ note: 'rewrite' })
      .eq('id', decisions![0].id)
      .select('id');
    expect(deniedRevision.data ?? []).toEqual([]);
    expect(
      (
        await userB.rpc('record_human_review_decision', {
          p_workspace_id: workspaceA,
          p_finding_id: finding!.id,
          p_decision: 'accepted',
          p_note: 'outsider',
          p_corrected_values: {},
          p_relationship_id: null,
        })
      ).error,
    ).not.toBeNull();
    const { data: audits } = await userA
      .from('audit_events')
      .select('event_type, entity_id')
      .eq('entity_id', finding!.id)
      .eq('event_type', 'verification_reviewed');
    expect(audits).toHaveLength(2);
  });

  it('treats duplicate delivery as idempotent and persists parser uncertainty visibly', async () => {
    const seed = await seedVerification();
    const payload = {
      workspaceId: workspaceA,
      analysisRunId: seed.analysisRunId,
      verificationRunId: seed.verificationRunId,
      processingJobId: seed.processingJobId,
    };
    await handleVerifyJob(payload, new MockProvider());
    await handleVerifyJob(payload, new MockProvider());
    const { count } = await admin()
      .from('verification_findings')
      .select('id', { count: 'exact', head: true })
      .eq('verification_run_id', seed.verificationRunId);
    expect(count).toBe(1);
    const svc = admin();
    const { data: page } = await svc
      .from('document_pages')
      .select('id')
      .eq('document_id', seed.documentId)
      .single();
    await svc.from('document_pages').update({ extraction_status: 'error' }).eq('id', page!.id);
    // Existing finding remains immutable; parser state changes cannot rewrite it.
    expect(
      (
        await svc
          .from('verification_findings')
          .update({ source_support_status: 'parser_uncertain' })
          .eq('verification_run_id', seed.verificationRunId)
      ).error,
    ).not.toBeNull();
  });

  it('keeps malformed/refused/incomplete/timeout/rate-limit/unavailable Pass A failures pending', async () => {
    for (const mode of [
      'refusal',
      'incomplete',
      'timeout',
      'rate_limit',
      'unavailable',
      'repair_failure',
    ] as const) {
      const seed = await seedVerification();
      class PassAFailureProvider extends MockProvider {
        override async assessEntailment(input: CandidateAssessmentInput) {
          if (mode === 'timeout') throw new Error('provider timeout');
          if (mode === 'rate_limit') throw new Error('rate limit exceeded');
          if (mode === 'unavailable') throw new Error('provider unavailable');
          if (mode === 'repair_failure')
            throw new Error('strict schema validation failed after controlled repair');
          const base = await super.assessEntailment(input);
          return {
            ...base,
            result: null,
            ...(mode === 'refusal' ? { refused: true } : { incomplete: true }),
          };
        }
      }
      await handleVerifyJob(
        {
          workspaceId: workspaceA,
          analysisRunId: seed.analysisRunId,
          verificationRunId: seed.verificationRunId,
          processingJobId: seed.processingJobId,
        },
        new PassAFailureProvider(),
      );
      const { data: run } = await admin()
        .from('verification_runs')
        .select('status')
        .eq('id', seed.verificationRunId)
        .single();
      expect(run?.status).toBe('failed');
      const { count } = await admin()
        .from('verification_findings')
        .select('id', { count: 'exact', head: true })
        .eq('verification_run_id', seed.verificationRunId);
      expect(count).toBe(0);
      const { data: pass } = await admin()
        .from('verification_pass_results')
        .select('pass_type,status')
        .eq('verification_run_id', seed.verificationRunId)
        .single();
      expect(pass).toMatchObject({
        pass_type: 'entailment',
        status: mode === 'refusal' ? 'refused' : mode === 'incomplete' ? 'incomplete' : 'failed',
      });
    }
  });

  it('persists one controlled schema repair when the repaired Pass A succeeds', async () => {
    const seed = await seedVerification();
    class RepairSuccessProvider extends MockProvider {
      override async assessEntailment(input: CandidateAssessmentInput) {
        const base = await super.assessEntailment(input);
        return { ...base, repairAttempts: 1 };
      }
    }
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new RepairSuccessProvider(),
    );
    const { data: call } = await admin()
      .from('model_calls')
      .select('repair_attempts,status')
      .eq('verification_run_id', seed.verificationRunId)
      .eq('stage', 'verify_entailment')
      .single();
    expect(call).toMatchObject({ repair_attempts: 1, status: 'succeeded' });
  });

  it('rejects an internally inconsistent Pass A with a visible semantic-contract failure', async () => {
    const seed = await seedVerification();
    class InconsistentPassAProvider extends MockProvider {
      override async assessEntailment(input: CandidateAssessmentInput) {
        const base = await super.assessEntailment(input);
        return {
          ...base,
          result: {
            ...base.result!,
            classification: 'entails' as const,
            missingOrOverstatedQualifiers: ['additive source word also'],
          },
        };
      }
    }
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new InconsistentPassAProvider(),
    );
    const { data: pass } = await admin()
      .from('verification_pass_results')
      .select('status,error_category,error_detail')
      .eq('verification_run_id', seed.verificationRunId)
      .single();
    expect(pass).toMatchObject({
      status: 'failed',
      error_category: 'semantic_contract',
    });
    expect(pass?.error_detail).toMatch(/^semantic_contract_invalid:pass_a:/);
    const { count } = await admin()
      .from('verification_findings')
      .select('id', { count: 'exact', head: true })
      .eq('verification_run_id', seed.verificationRunId);
    expect(count).toBe(0);
  });

  it('cancels before provider execution when the Phase 4 ledger is over budget', async () => {
    const seed = await seedVerification();
    const adjustmentId = crypto.randomUUID();
    const svc = admin();
    await svc.from('spend_ledger').insert({
      id: adjustmentId,
      phase: 'phase4',
      kind: 'adjustment',
      estimated_cost_usd: 10,
      note: 'temporary integration budget guard',
    });
    try {
      await handleVerifyJob(
        {
          workspaceId: workspaceA,
          analysisRunId: seed.analysisRunId,
          verificationRunId: seed.verificationRunId,
          processingJobId: seed.processingJobId,
        },
        new MockProvider(),
      );
      const { data: run } = await svc
        .from('verification_runs')
        .select('status')
        .eq('id', seed.verificationRunId)
        .single();
      expect(run?.status).toBe('budget_exceeded');
      const { count } = await svc
        .from('model_calls')
        .select('id', { count: 'exact', head: true })
        .eq('verification_run_id', seed.verificationRunId);
      expect(count).toBe(0);
    } finally {
      await svc.from('spend_ledger').delete().eq('id', adjustmentId);
    }
  });

  it('rejects stale candidate/run linkage for deterministic envelopes', async () => {
    const first = await seedVerification();
    const second = await seedVerification();
    const result = await admin()
      .from('verification_fact_envelopes')
      .insert({
        workspace_id: workspaceA,
        analysis_run_id: first.analysisRunId,
        verification_run_id: first.verificationRunId,
        candidate_id: second.candidateId,
        envelope_version: 'verification-facts-v4',
        context_hash: 'a'.repeat(64),
        payload: { machineOnly: true },
      });
    expect(result.error).not.toBeNull();
  });

  it('cannot persist supported when Pass B fails after a possible positive', async () => {
    const seed = await seedVerification();
    class ChallengeFailureProvider extends MockProvider {
      override async challengeEntailment(_input: ChallengeInput): Promise<never> {
        throw new Error('challenge provider unavailable');
      }
    }
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new ChallengeFailureProvider(),
    );
    const { data: finding } = await admin()
      .from('verification_findings')
      .select('source_support_status, challenge_status')
      .eq('verification_run_id', seed.verificationRunId)
      .single();
    expect(finding).toMatchObject({
      source_support_status: 'unsupported',
      challenge_status: 'failed',
    });
    const { data: run } = await admin()
      .from('verification_runs')
      .select('status')
      .eq('id', seed.verificationRunId)
      .single();
    expect(run?.status).toBe('failed');
  });

  it('records deterministic/model disagreement and chooses the conservative value result', async () => {
    const source = 'The contractor must maintain $3,000,000 per occurrence.';
    const seed = await seedVerification({
      pageText: source,
      obligation: 'The contractor must maintain $4,000,000 per occurrence.',
      evidenceQuote: source,
    });
    class UnsafeAgreementProvider extends MockProvider {
      override async assessEntailment(input: CandidateAssessmentInput) {
        const base = await super.assessEntailment(input);
        return {
          ...base,
          result: {
            ...base.result!,
            classification: 'entails' as const,
            supportingEvidence: [
              { documentId: input.candidate.documentId, pageNumber: 1, quote: source },
            ],
            contradictingEvidence: [],
          },
        };
      }
      override async challengeEntailment(input: ChallengeInput) {
        const base = await super.challengeEntailment(input);
        return {
          ...base,
          result: {
            ...base.result!,
            assessment: 'no_material_objection' as const,
            objections: [],
          },
        };
      }
    }
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new UnsafeAgreementProvider(),
    );
    const { data: finding } = await admin()
      .from('verification_findings')
      .select('source_support_status, deterministic_model_disagreement, decision_engine_version')
      .eq('verification_run_id', seed.verificationRunId)
      .single();
    expect(finding?.source_support_status).toBe('contradicted');
    expect(finding?.deterministic_model_disagreement).not.toEqual([]);
    expect(finding?.decision_engine_version).toBe('verification-decision-v6');
  });

  it('persists a reviewable parent/child proposal without merging either candidate', async () => {
    const source =
      'Attach Exhibit C, a staffing plan showing at least 4 full-time-equivalent staff.';
    const seed = await seedVerification({
      pageText: source,
      obligation: 'Attach Exhibit C, a staffing plan.',
      evidenceQuote: source,
    });
    const childId = crypto.randomUUID();
    await admin().from('requirement_candidates').insert({
      id: childId,
      workspace_id: workspaceA,
      analysis_run_id: seed.analysisRunId,
      document_id: seed.documentId,
      category: 'staffing_requirement',
      title: 'Exhibit C staffing minimum',
      obligation: 'Exhibit C must show at least 4 full-time-equivalent staff.',
      mandatory_class: 'mandatory',
      preliminary_page: 1,
      evidence_quote: source,
      confidence: 0.8,
      status: 'unverified',
      prompt_version: 'extract-v1',
      schema_version: 'candidate-v1',
      model_id: 'mock',
    });
    await handleVerifyJob(
      {
        workspaceId: workspaceA,
        analysisRunId: seed.analysisRunId,
        verificationRunId: seed.verificationRunId,
        processingJobId: seed.processingJobId,
      },
      new MockProvider(),
    );
    const { data: relationship } = await admin()
      .from('requirement_relationships')
      .select(
        'source_candidate_id,target_candidate_id,relationship_type,relationship_version,deterministic_metadata',
      )
      .eq('verification_run_id', seed.verificationRunId)
      .eq('relationship_type', 'parent_child')
      .maybeSingle();
    expect(relationship).toMatchObject({
      source_candidate_id: seed.candidateId,
      target_candidate_id: childId,
      relationship_type: 'parent_child',
      relationship_version: 'atomic-parent-child-v1',
      deterministic_metadata: { preservesAtomicRecords: true },
    });
    const { count } = await admin()
      .from('verification_findings')
      .select('id', { count: 'exact', head: true })
      .eq('verification_run_id', seed.verificationRunId);
    expect(count).toBe(2);
  });
});
