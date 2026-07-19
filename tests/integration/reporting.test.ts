import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { reportSnapshotSchema } from '../../packages/domain/src/reporting.js';
import { generateChecklist } from '../../apps/web/src/lib/checklist/service.js';
import { runProposalAudit } from '../../apps/web/src/lib/proposal-audit/service.js';
import {
  createReportDownloadGrant,
  createReportExport,
  generateReport,
  revokeReportExport,
} from '../../apps/web/src/lib/reporting/service.js';
import { createTestWorkspace, signInUser } from './helpers.js';

loadEnv({ path: '.env.local' });
const FINGERPRINT = 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const hex = () => crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64);

let userA: SupabaseClient;
let userB: SupabaseClient;
let userAId = '';
let userBId = '';
let workspaceA = '';
let workspaceB = '';
let analysisRunId = '';
let verificationRunId = '';
let checklistRunId = '';
let readinessSnapshotId = '';
let proposalAuditRunId = '';
let reportSnapshotId = '';
let artifactId = '';

async function seedDocument(
  workspaceId: string,
  actorId: string,
  type: 'primary_rfp' | 'proposal_draft',
  name: string,
  text: string,
) {
  const svc = admin();
  const documentId = crypto.randomUUID(),
    parseRunId = crypto.randomUUID(),
    pageId = crypto.randomUUID();
  expect(
    (
      await svc.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: actorId,
        document_type: type,
        original_filename: name,
        normalized_filename: name,
        mime_type: 'application/pdf',
        object_key: `${workspaceId}/phase7/${documentId}.pdf`,
        size_bytes: 100,
        sha256: hex(),
        status: 'parsed',
        page_count: 1,
        parser_name: 'synthetic-fixture',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('parse_runs').insert({
        id: parseRunId,
        document_id: documentId,
        workspace_id: workspaceId,
        stage: 'parse',
        status: 'succeeded',
        parser_name: 'synthetic-fixture',
        parser_version: '1',
        finished_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('document_pages').insert({
        id: pageId,
        document_id: documentId,
        workspace_id: workspaceId,
        parse_run_id: parseRunId,
        page_number: 1,
        pdf_page_index: 0,
        text,
        text_sha256: hex(),
        char_count: text.length,
        extraction_status: 'ok',
        parser_name: 'synthetic-fixture',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();
  return { documentId, pageId };
}

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  userAId = (await userA.auth.getUser()).data.user!.id;
  userBId = (await userB.auth.getUser()).data.user!.id;
  workspaceA = await createTestWorkspace(userA, `Phase 7 A ${crypto.randomUUID()}`);
  workspaceB = await createTestWorkspace(userB, `Phase 7 B ${crypto.randomUUID()}`);
  const source = await seedDocument(
    workspaceA,
    userAId,
    'primary_rfp',
    'RFP-F7.pdf',
    'Offerors must submit completed Form F-7.',
  );
  const proposal = await seedDocument(
    workspaceA,
    userAId,
    'proposal_draft',
    'Proposal-RFP-F7.pdf',
    'Response to RFP-F7. Completed Form F-7 is attached.',
  );
  const svc = admin();
  analysisRunId = crypto.randomUUID();
  verificationRunId = crypto.randomUUID();
  const candidateId = crypto.randomUUID(),
    findingId = crypto.randomUUID(),
    evidenceId = crypto.randomUUID();
  expect(
    (
      await svc.from('analysis_runs').insert({
        id: analysisRunId,
        workspace_id: workspaceA,
        document_id: source.documentId,
        status: 'completed',
        stage: 'complete',
        created_by: userAId,
        candidate_count: 1,
        completed_at: new Date().toISOString(),
        verification_compatibility_fingerprint: FINGERPRINT,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('requirement_candidates').insert({
        id: candidateId,
        workspace_id: workspaceA,
        analysis_run_id: analysisRunId,
        document_id: source.documentId,
        category: 'required_form',
        title: 'Mandatory Form F-7',
        obligation: 'Submit completed Form F-7.',
        mandatory_class: 'mandatory',
        preliminary_page: 1,
        evidence_quote: 'Offerors must submit completed Form F-7.',
        confidence: 1,
        status: 'unverified',
        prompt_version: 'extract-v1',
        schema_version: 'candidate-v1',
        model_id: 'mock',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('verification_runs').insert({
        id: verificationRunId,
        workspace_id: workspaceA,
        analysis_run_id: analysisRunId,
        status: 'completed',
        version: 1,
        input_hash: hex(),
        prompt_version: 'verify-entailment-v7+verify-challenge-v4',
        schema_version: 'verification-entailment-v5+verification-challenge-v4',
        retrieval_version: 'verify-retrieval-v2-candidate-centered',
        normalization_version: 'evidence-nfkc-v1',
        created_by: userAId,
        candidate_count: 1,
        finding_count: 1,
        completed_at: new Date().toISOString(),
        compatibility_fingerprint: FINGERPRINT,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('verification_findings').insert({
        id: findingId,
        workspace_id: workspaceA,
        analysis_run_id: analysisRunId,
        verification_run_id: verificationRunId,
        candidate_id: candidateId,
        finding_version: 1,
        source_support_status: 'supported',
        precedence_status: 'active',
        proof_requirement: 'none_identified',
        rationale: 'Synthetic exact source.',
        prompt_version: 'verify-entailment-v7+verify-challenge-v4',
        schema_version: 'verification-final-assessment-v1',
        model_id: 'mock',
        decision_engine_version: 'verification-decision-v6',
        challenge_status: 'completed',
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await svc.from('verification_evidence').insert({
        id: evidenceId,
        workspace_id: workspaceA,
        finding_id: findingId,
        document_id: source.documentId,
        document_page_id: source.pageId,
        page_number: 1,
        evidence_role: 'supporting',
        quote_exact: 'Offerors must submit completed Form F-7.',
        quote_normalized: 'Offerors must submit completed Form F-7.',
        normalization_version: 'evidence-nfkc-v1',
        match_type: 'exact',
        validated: true,
      })
    ).error,
  ).toBeNull();
  const checklist = await generateChecklist({
    workspaceId: workspaceA,
    verificationRunId,
    actorId: userAId,
    fixtureVersion: 'phase7-integration-v1',
  });
  checklistRunId = checklist.generationRunId;
  const readiness = await svc
    .from('checklist_readiness_snapshots')
    .select('id')
    .eq('workspace_id', workspaceA)
    .eq('generation_run_id', checklistRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(readiness.error).toBeNull();
  readinessSnapshotId = readiness.data!.id;
  const proposalAudit = await runProposalAudit({
    workspaceId: workspaceA,
    documentId: proposal.documentId,
    checklistGenerationRunId: checklistRunId,
    actorId: userAId,
    fixtureVersion: 'phase7-integration-v1',
  });
  proposalAuditRunId = proposalAudit.auditRunId;
});

afterAll(async () => {
  const svc = admin();
  await svc.from('workspaces').delete().in('id', [workspaceA, workspaceB].filter(Boolean));
});

describe.sequential('Phase 7 reports, private exports, and RLS', () => {
  it('generates one strict, deterministic, provenance-linked report and reuses identical input', async () => {
    const request = {
      workspaceId: workspaceA,
      actorId: userAId,
      analysisRunId,
      verificationRunId,
      checklistGenerationRunId: checklistRunId,
      readinessSnapshotId,
      proposalAuditRunId,
      reportType: 'executive' as const,
    };
    const first = await generateReport(request);
    reportSnapshotId = first.snapshotId;
    expect(first.reused).toBe(false);
    const second = await generateReport(request);
    expect(second).toMatchObject({
      snapshotId: first.snapshotId,
      inputHash: first.inputHash,
      reused: true,
    });
    const row = await admin()
      .from('report_snapshots')
      .select('snapshot')
      .eq('id', reportSnapshotId)
      .single();
    const snapshot = reportSnapshotSchema.parse(row.data!.snapshot);
    expect(snapshot.runs).toMatchObject({
      analysisRunId,
      verificationRunId,
      checklistGenerationRunId: checklistRunId,
      readinessSnapshotId,
      proposalAuditRunId,
    });
    expect(snapshot.provenance.versions.phase4Fingerprint).toBe(FINGERPRINT);
    expect(snapshot.provenance.providerUseStatement).toContain('No Phase 7 provider calls');
    expect(snapshot.checklistItems).toHaveLength(1);
  });

  it('denies cross-workspace report reads and ordinary machine-record fabrication', async () => {
    expect(
      (await userB.from('report_snapshots').select('id').eq('id', reportSnapshotId)).data,
    ).toEqual([]);
    const deniedInsert = await userA.from('report_snapshots').insert({
      workspace_id: workspaceA,
      report_generation_run_id: crypto.randomUUID(),
      report_type: 'executive',
      report_version: 'bad',
      schema_version: 'bad',
      input_hash: hex(),
      demo: false,
      data_classification: 'internal_authorized',
      summary: {},
      snapshot: {},
      generated_by: userAId,
    });
    expect(deniedInsert.error).not.toBeNull();
    await expect(
      generateReport({
        workspaceId: workspaceA,
        actorId: userBId,
        analysisRunId,
        verificationRunId,
        checklistGenerationRunId: checklistRunId,
        readinessSnapshotId,
        proposalAuditRunId,
        reportType: 'executive',
      }),
    ).rejects.toThrow('report_actor_not_in_workspace');
  });

  it('creates an injection-safe private CSV artifact and hides object paths from ordinary clients', async () => {
    const created = await createReportExport({
      workspaceId: workspaceA,
      actorId: userAId,
      reportSnapshotId,
      format: 'csv',
      csvDataset: 'checklist_items',
      regenerate: false,
    });
    artifactId = created.artifactId;
    const artifact = await admin()
      .from('export_artifacts')
      .select('*')
      .eq('id', artifactId)
      .single();
    expect(artifact.data).toMatchObject({ bucket_id: 'workspace-exports', status: 'active' });
    const bucket = (await admin().storage.listBuckets()).data?.find(
      (row) => row.id === 'workspace-exports',
    );
    expect(bucket).toMatchObject({ public: false, file_size_limit: 10_485_760 });
    const safeRead = await userA
      .from('export_artifacts')
      .select('id,normalized_filename,status')
      .eq('id', artifactId)
      .single();
    expect(safeRead.error).toBeNull();
    const secretRead = await userA
      .from('export_artifacts')
      .select('id,object_path')
      .eq('id', artifactId);
    expect(secretRead.error).not.toBeNull();
    const ordinaryStorageList = await userA.storage.from('workspace-exports').list(workspaceA);
    expect(ordinaryStorageList.error).toBeNull();
    expect(ordinaryStorageList.data).toEqual([]);
    expect(
      (await userB.from('export_artifacts').select('id,normalized_filename').eq('id', artifactId))
        .data,
    ).toEqual([]);
  });

  it('issues only a short-lived member grant and rejects cross-workspace grants', async () => {
    const before = Date.now();
    const grant = await createReportDownloadGrant({
      workspaceId: workspaceA,
      actorId: userAId,
      artifactId,
    });
    expect(grant.signedUrl).toContain('token=');
    expect(new Date(grant.expiresAt).getTime() - before).toBeGreaterThanOrEqual(295_000);
    expect(new Date(grant.expiresAt).getTime() - before).toBeLessThanOrEqual(305_000);
    const events = await admin()
      .from('export_access_events')
      .select('event_type,detail')
      .eq('download_grant_id', grant.grantId);
    expect(events.data?.map((row) => row.event_type).sort()).toEqual([
      'download_recorded',
      'signed_url_created',
    ]);
    expect(JSON.stringify(events.data)).not.toContain('token=');
    await expect(
      createReportDownloadGrant({ workspaceId: workspaceA, actorId: userBId, artifactId }),
    ).rejects.toThrow('report_actor_not_in_workspace');
    const deniedGrant = await userA.from('export_download_grants').insert({
      workspace_id: workspaceA,
      export_artifact_id: artifactId,
      actor_id: userAId,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      policy_version: 'bad',
    });
    expect(deniedGrant.error).not.toBeNull();
  });

  it('regenerates without overwrite, revokes the prior object, and supports explicit revocation', async () => {
    const regenerated = await createReportExport({
      workspaceId: workspaceA,
      actorId: userAId,
      reportSnapshotId,
      format: 'csv',
      csvDataset: 'checklist_items',
      regenerate: true,
    });
    expect(regenerated.artifactId).not.toBe(artifactId);
    const prior = await admin()
      .from('export_artifacts')
      .select('status,revocation_reason')
      .eq('id', artifactId)
      .single();
    expect(prior.data?.status).toBe('revoked');
    const generations = await admin()
      .from('export_manifests')
      .select('regeneration_number,status')
      .eq('workspace_id', workspaceA)
      .eq('report_snapshot_id', reportSnapshotId)
      .eq('export_format', 'csv')
      .eq('csv_dataset', 'checklist_items')
      .order('regeneration_number');
    expect(generations.data).toEqual([
      { regeneration_number: 1, status: 'obsolete' },
      { regeneration_number: 2, status: 'completed' },
    ]);
    await revokeReportExport({
      workspaceId: workspaceA,
      actorId: userAId,
      artifactId: regenerated.artifactId,
      reason: 'Integration test cleanup revocation.',
    });
    expect(
      (
        await admin()
          .from('export_artifacts')
          .select('status')
          .eq('id', regenerated.artifactId)
          .single()
      ).data?.status,
    ).toBe('revoked');
  });
});
