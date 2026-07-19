import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { generateChecklist } from '../../apps/web/src/lib/checklist/service.js';
import { createTestWorkspace, signInUser } from './helpers.js';

loadEnv({ path: '.env.local' });
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let userA: SupabaseClient;
let userB: SupabaseClient;
let userAId: string;
let userBId: string;
let workspaceA: string;
let workspaceB: string;
let seeded: Awaited<ReturnType<typeof seedPhase4>>;

async function seedPhase4() {
  const svc = admin();
  const documentId = crypto.randomUUID();
  const parseRunId = crypto.randomUUID();
  const pageId = crypto.randomUUID();
  const analysisRunId = crypto.randomUUID();
  const verificationRunId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const findingId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const quote = 'Offerors must complete and submit mandatory Form Z-5.';
  const { error: documentError } = await svc.from('documents').insert({
    id: documentId,
    workspace_id: workspaceA,
    created_by: userAId,
    document_type: 'primary_rfp',
    original_filename: 'phase5-synthetic.pdf',
    normalized_filename: 'phase5-synthetic.pdf',
    mime_type: 'application/pdf',
    object_key: `${workspaceA}/phase5/${documentId}.pdf`,
    size_bytes: 100,
    sha256: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    status: 'parsed',
    page_count: 1,
    parser_name: 'synthetic-fixture',
    parser_version: '1',
  });
  expect(documentError).toBeNull();
  await svc.from('parse_runs').insert({
    id: parseRunId,
    document_id: documentId,
    workspace_id: workspaceA,
    stage: 'parse',
    status: 'succeeded',
    parser_name: 'synthetic-fixture',
    parser_version: '1',
    finished_at: new Date().toISOString(),
  });
  await svc.from('document_pages').insert({
    id: pageId,
    document_id: documentId,
    workspace_id: workspaceA,
    parse_run_id: parseRunId,
    page_number: 1,
    pdf_page_index: 0,
    text: quote,
    text_sha256: 'a'.repeat(64),
    char_count: quote.length,
    extraction_status: 'ok',
    parser_name: 'synthetic-fixture',
    parser_version: '1',
  });
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
    category: 'required_form',
    title: 'Mandatory Form Z-5',
    obligation: quote,
    mandatory_class: 'mandatory',
    preliminary_page: 1,
    evidence_quote: quote,
    confidence: 1,
    status: 'unverified',
    prompt_version: 'extract-v1',
    schema_version: 'candidate-v1',
    model_id: 'mock',
  });
  await svc.from('verification_runs').insert({
    id: verificationRunId,
    workspace_id: workspaceA,
    analysis_run_id: analysisRunId,
    status: 'completed',
    version: 1,
    input_hash: crypto.randomUUID().replaceAll('-', ''),
    prompt_version: 'verify-entailment-v7+verify-challenge-v4',
    schema_version: 'verification-entailment-v5+verification-challenge-v4',
    retrieval_version: 'verify-retrieval-v2-candidate-centered',
    normalization_version: 'evidence-nfkc-v1',
    created_by: userAId,
    candidate_count: 1,
    finding_count: 1,
    completed_at: new Date().toISOString(),
  });
  await svc.from('verification_findings').insert({
    id: findingId,
    workspace_id: workspaceA,
    analysis_run_id: analysisRunId,
    verification_run_id: verificationRunId,
    candidate_id: candidateId,
    finding_version: 1,
    source_support_status: 'supported',
    precedence_status: 'active',
    proof_requirement: 'requires_company_artifact',
    machine_status: 'machine_assessment_only',
    rationale: 'Exact active source evidence supports the atomic form obligation.',
    prompt_version: 'verify-entailment-v7+verify-challenge-v4',
    schema_version: 'verification-final-assessment-v1',
    model_id: 'mock',
    decision_engine_version: 'verification-decision-v6',
    challenge_status: 'completed',
  });
  await svc.from('verification_evidence').insert({
    id: evidenceId,
    workspace_id: workspaceA,
    finding_id: findingId,
    document_id: documentId,
    document_page_id: pageId,
    page_number: 1,
    evidence_role: 'supporting',
    quote_exact: quote,
    quote_normalized: quote,
    normalization_version: 'evidence-nfkc-v1',
    match_type: 'exact',
    validated: true,
  });
  await svc.from('human_review_decisions').insert({
    workspace_id: workspaceA,
    finding_id: findingId,
    reviewer_id: userAId,
    decision: 'accepted',
    note: 'Synthetic fixture source assessment accepted.',
  });
  return {
    documentId,
    pageId,
    analysisRunId,
    verificationRunId,
    candidateId,
    findingId,
    evidenceId,
  };
}

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  userAId = (await userA.auth.getUser()).data.user!.id;
  userBId = (await userB.auth.getUser()).data.user!.id;
  workspaceA = await createTestWorkspace(userA, `phase5-A ${Date.now()}`);
  workspaceB = await createTestWorkspace(userB, `phase5-B ${Date.now()}`);
  seeded = await seedPhase4();
});

afterAll(async () => {
  await userA.auth.signOut();
  await userB.auth.signOut();
});

describe('Phase 5 checklist persistence, controls, and isolation', () => {
  it('generates deterministically and preserves immutable Phase 4 provenance', async () => {
    const first = await generateChecklist({
      workspaceId: workspaceA,
      verificationRunId: seeded.verificationRunId,
      actorId: userAId,
      fixtureVersion: 'phase5-integration-v1',
    });
    const second = await generateChecklist({
      workspaceId: workspaceA,
      verificationRunId: seeded.verificationRunId,
      actorId: userAId,
      fixtureVersion: 'phase5-integration-v1',
    });
    expect(first).toMatchObject({ reused: false, itemCount: 1 });
    expect(second).toMatchObject({
      reused: true,
      generationRunId: first.generationRunId,
      inputHash: first.inputHash,
    });
    const { data: items } = await userA
      .from('checklist_items')
      .select('*')
      .eq('workspace_id', workspaceA);
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({
      finding_id: seeded.findingId,
      candidate_id: seeded.candidateId,
      category: 'mandatory_form',
      machine_status: 'machine_assessment_only',
      source_support_status: 'supported',
      precedence_status: 'active',
      source_human_review_status: 'accepted',
      artifact_state: 'requires_human_proof',
    });
    const { data: sources } = await userA
      .from('checklist_item_sources')
      .select('*')
      .eq('checklist_item_id', items![0].id);
    expect(sources).toHaveLength(1);
    expect(sources![0]).toMatchObject({
      verification_evidence_id: seeded.evidenceId,
      document_id: seeded.documentId,
      document_page_id: seeded.pageId,
      page_number: 1,
      match_type: 'exact',
    });
    const { data: finding } = await userA
      .from('verification_findings')
      .select('source_support_status,machine_status')
      .eq('id', seeded.findingId)
      .single();
    expect(finding).toEqual({
      source_support_status: 'supported',
      machine_status: 'machine_assessment_only',
    });
  });

  it('denies ordinary machine-record fabrication and every cross-workspace read', async () => {
    const { data: item } = await userA
      .from('checklist_items')
      .select('*')
      .eq('workspace_id', workspaceA)
      .single();
    expect((await userB.from('checklist_items').select('*').eq('id', item!.id)).data).toEqual([]);
    expect(
      (await userB.from('checklist_blockers').select('*').eq('workspace_id', workspaceA)).data,
    ).toEqual([]);
    expect(
      (await userB.from('checklist_readiness_snapshots').select('*').eq('workspace_id', workspaceA))
        .data,
    ).toEqual([]);
    const fabricated = await userA
      .from('checklist_items')
      .insert({ ...item, id: crypto.randomUUID(), stable_key: 'f'.repeat(64) });
    expect(fabricated.error).not.toBeNull();
  });

  it('rejects cross-workspace owners, artifacts, and evidence references', async () => {
    const { data: item } = await userA
      .from('checklist_items')
      .select('id')
      .eq('workspace_id', workspaceA)
      .single();
    const assignment = await userA.rpc('assign_checklist_owner', {
      p_workspace_id: workspaceA,
      p_item_id: item!.id,
      p_owner_id: userBId,
      p_reviewer_id: null,
    });
    expect(assignment.error?.message).toMatch(/belong to workspace/i);
    const svc = admin();
    const crossSource = await svc.from('checklist_item_sources').insert({
      workspace_id: workspaceB,
      checklist_item_id: item!.id,
      finding_id: seeded.findingId,
      verification_evidence_id: seeded.evidenceId,
      document_id: seeded.documentId,
      document_page_id: seeded.pageId,
      page_number: 1,
      quote_exact: 'x',
      match_type: 'exact',
      source_version: 'x',
    });
    expect(crossSource.error).not.toBeNull();
  });

  it('records assignments, workflow, exceptions, waiver history, and blocker resolution without rewriting findings', async () => {
    const { data: item } = await userA
      .from('checklist_items')
      .select('id,workflow_status')
      .eq('workspace_id', workspaceA)
      .single();
    expect(
      (
        await userA.rpc('assign_checklist_owner', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_owner_id: userAId,
          p_reviewer_id: userAId,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'in_progress',
          p_note: 'Work begun.',
        })
      ).error,
    ).toBeNull();
    const { data: requiredArtifact } = await userA
      .from('checklist_required_artifacts')
      .select('id')
      .eq('checklist_item_id', item!.id)
      .single();
    const { data: artifactLinkId, error: linkError } = await userA.rpc('link_checklist_artifact', {
      p_workspace_id: workspaceA,
      p_item_id: item!.id,
      p_required_artifact_id: requiredArtifact!.id,
      p_document_id: seeded.documentId,
    });
    expect(linkError).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'ready_for_review',
          p_note: 'Ready after link.',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'completed',
          p_note: 'Not reviewed yet.',
        })
      ).error?.message,
    ).toMatch(/artifact is not reviewed/i);
    expect(
      (
        await userA.rpc('review_checklist_artifact', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_required_artifact_id: requiredArtifact!.id,
          p_state: 'reviewed',
          p_note: 'Synthetic artifact reviewed.',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'completed',
          p_note: 'Artifact reviewed.',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'in_progress',
          p_note: 'Reopened for waiver path.',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('create_checklist_exception', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_explanation: 'Synthetic exception note.',
          p_prior_note_id: null,
        })
      ).error,
    ).toBeNull();
    const { data: waiverId, error: waiverError } = await userA.rpc('create_checklist_waiver', {
      p_workspace_id: workspaceA,
      p_item_id: item!.id,
      p_reason: 'Synthetic policy exception.',
      p_designation: 'final',
      p_authority_note: 'Test authority',
    });
    expect(waiverError).toBeNull();
    expect(
      (
        await userA.rpc('review_checklist_waiver', {
          p_workspace_id: workspaceA,
          p_waiver_id: waiverId,
          p_status: 'accepted',
          p_note: 'Accepted for deterministic fixture.',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc('update_checklist_status', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_status: 'waived',
          p_note: 'Final reviewed waiver.',
        })
      ).error,
    ).toBeNull();
    const { data: waivers } = await userA
      .from('checklist_waivers')
      .select('status,prior_waiver_id')
      .eq('checklist_item_id', item!.id)
      .order('created_at');
    expect(waivers?.map((waiver) => waiver.status)).toEqual(['requested', 'accepted']);
    expect(waivers?.[1].prior_waiver_id).toBe(waiverId);
    const mutation = await userA
      .from('checklist_waivers')
      .update({ reason: 'rewritten' })
      .eq('id', waiverId)
      .select('id');
    expect(mutation.error).toBeNull();
    expect(mutation.data).toEqual([]);
    const privilegedMutation = await admin()
      .from('checklist_waivers')
      .update({ reason: 'rewritten' })
      .eq('id', waiverId);
    expect(privilegedMutation.error?.message).toMatch(/append-only/i);
    expect(
      (
        await userA.rpc('remove_checklist_artifact', {
          p_workspace_id: workspaceA,
          p_item_id: item!.id,
          p_link_id: artifactLinkId,
          p_reason: 'Synthetic removal history.',
        })
      ).error,
    ).toBeNull();
    const { data: openBlocker } = await userA
      .from('checklist_blockers')
      .select('id')
      .eq('checklist_item_id', item!.id)
      .in('status', ['open', 'reopened'])
      .limit(1)
      .maybeSingle();
    if (openBlocker)
      expect(
        (
          await userA.rpc('resolve_checklist_blocker', {
            p_workspace_id: workspaceA,
            p_blocker_id: openBlocker.id,
            p_action: 'resolved',
            p_reason: 'Synthetic condition reviewed and disposition recorded.',
          })
        ).error,
      ).toBeNull();
    const { data: events } = await userA
      .from('audit_events')
      .select('event_type')
      .eq('workspace_id', workspaceA)
      .eq('entity_id', item!.id);
    expect(events?.map((event) => event.event_type)).toEqual(
      expect.arrayContaining([
        'checklist_owner_assigned',
        'checklist_status_changed',
        'checklist_artifact_linked',
        'checklist_artifact_reviewed',
        'checklist_artifact_removed',
        'checklist_exception_created',
        'checklist_waiver_requested',
        'checklist_waiver_decided',
      ]),
    );
    const { data: finding } = await userA
      .from('verification_findings')
      .select('source_support_status,precedence_status')
      .eq('id', seeded.findingId)
      .single();
    expect(finding).toEqual({ source_support_status: 'supported', precedence_status: 'active' });
    const regenerated = await generateChecklist({
      workspaceId: workspaceA,
      verificationRunId: seeded.verificationRunId,
      actorId: userAId,
      fixtureVersion: 'phase5-integration-v1',
    });
    expect(regenerated.reused).toBe(true);
    const { data: preserved } = await userA
      .from('checklist_items')
      .select('owner_id,reviewer_id,workflow_status')
      .eq('id', item!.id)
      .single();
    expect(preserved).toEqual({
      owner_id: userAId,
      reviewer_id: userAId,
      workflow_status: 'waived',
    });
    expect(
      (
        await userA
          .from('checklist_exception_notes')
          .select('id', { count: 'exact' })
          .eq('checklist_item_id', item!.id)
      ).count,
    ).toBeGreaterThan(0);
  });
});
