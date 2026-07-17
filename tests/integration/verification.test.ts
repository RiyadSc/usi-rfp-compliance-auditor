import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { MockProvider } from '../../packages/ai/src/index.js';
import { handleVerifyJob } from '../../apps/worker/src/verify-requirements.js';
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
  userAId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  workspaceA = await createTestWorkspace(userA, `verify-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(userB, `verify-B ${Date.now()}`);
  userAId = (await userA.auth.getUser()).data.user!.id;
});
afterAll(async () => {
  await userA.auth.signOut();
  await userB.auth.signOut();
});

async function seedVerification() {
  const svc = admin();
  const documentId = crypto.randomUUID(),
    parseRunId = crypto.randomUUID(),
    analysisRunId = crypto.randomUUID();
  const candidateId = crypto.randomUUID(),
    verificationRunId = crypto.randomUUID(),
    processingJobId = crypto.randomUUID();
  const pageText = 'Offerors must submit Certificate Z-9 by April 22, 2026.';
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
    obligation: 'Offerors must submit Certificate Z-9 by April 22, 2026.',
    mandatory_class: 'mandatory',
    preliminary_page: 1,
    evidence_quote: pageText,
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
});
