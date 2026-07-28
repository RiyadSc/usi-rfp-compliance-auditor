import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let userA: SupabaseClient;
let userB: SupabaseClient;
let admin: SupabaseClient;
let actorId: string;
let workspaceId: string;
let runId: string;
let supportedHash: string;
let unsupportedHash: string;
let documentId: string;

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  actorId = (await userA.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(userA, `phase9 reviewed bridge ${Date.now()}`);
  documentId = randomUUID();
  const parseRunId = randomUUID();
  const source = 'The bidder shall submit Form NJ-7 with an authorized signature.';
  const sourceHash = sha(source);
  expect(
    (
      await admin.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: actorId,
        document_type: 'primary_rfp',
        original_filename: 'Public Security RFP.pdf',
        normalized_filename: 'Public Security RFP.pdf',
        mime_type: 'application/pdf',
        object_key: `${workspaceId}/phase9-bridge/${documentId}.pdf`,
        size_bytes: 100,
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
        text: source,
        text_sha256: sourceHash,
        char_count: source.length,
        extraction_status: 'ok',
        parser_name: 'integration',
        parser_version: '1',
      })
    ).error,
  ).toBeNull();

  runId = randomUUID();
  supportedHash = sha(`${runId}:supported`);
  unsupportedHash = sha(`${runId}:unsupported`);
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
        versions: { purpose: 'integration' },
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
  const blockHash = sha(`${runId}:block`);
  const uncertainBlockHash = sha(`${runId}:uncertain-block`);
  expect(
    (
      await admin.from('phase9_source_block_coverage').insert([
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          block_hash: blockHash,
          source_document_id: documentId,
          source_document_key: 'Public Security RFP.pdf',
          source_hash: sourceHash,
          block_type: 'page_window',
          page_number: 1,
          heading_path: [],
          route: 'selected_for_deterministic_candidate',
          deterministic_signals: ['shall', 'form'],
          processing_result: 'candidate generated',
          coverage_version: 'phase9-source-coverage-v1',
        },
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          block_hash: uncertainBlockHash,
          source_document_id: documentId,
          source_document_key: 'Public Security RFP.pdf',
          source_hash: sourceHash,
          block_type: 'page_window',
          page_number: 1,
          heading_path: [],
          route: 'parser_uncertain',
          deterministic_signals: [],
          processing_result: 'human_review_required',
          coverage_version: 'phase9-source-coverage-v1',
        },
      ])
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_candidate_seeds').insert([
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: supportedHash,
          source_block_hashes: [blockHash],
          requirement_type: 'form',
          obligation_text: source,
          evidence_text: source,
          material_facts: { formReference: 'Form NJ-7' },
          discovery_route: 'deterministic',
          miner_version: 'phase9-deterministic-miner-v1',
        },
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: unsupportedHash,
          source_block_hashes: [blockHash],
          requirement_type: 'other',
          obligation_text: 'The bidder shall provide a helicopter.',
          evidence_text: source,
          material_facts: {},
          discovery_route: 'ai_targeted',
          miner_version: 'phase9-deterministic-miner-v1',
        },
      ])
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_findings').insert([
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: supportedHash,
          source_support_status: 'supported',
          precedence_status: 'active',
          proof_requirement: 'requires_company_artifact',
          evidence_block_hashes: [blockHash],
          decision_version: 'phase9-deterministic-verification-v1',
        },
        {
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: unsupportedHash,
          source_support_status: 'unsupported',
          precedence_status: 'undetermined',
          proof_requirement: 'none_identified',
          evidence_block_hashes: [],
          decision_version: 'phase9-deterministic-verification-v1',
        },
      ])
    ).error,
  ).toBeNull();
});

describe('controlled Phase 9 publication', () => {
  it('denies ordinary direct writes and cross-workspace reads', async () => {
    const direct = await userA.from('phase9_finding_review_decisions').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      candidate_hash: supportedHash,
      reviewer_id: actorId,
      decision: 'accepted',
      review_version: 'phase9-finding-review-v1',
    });
    expect(direct.error).not.toBeNull();
    const foreign = await userB
      .from('phase9_finding_review_decisions')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
    const directCoverage = await userA.from('phase9_coverage_review_decisions').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      source_document_id: documentId,
      page_number: 1,
      reviewer_id: actorId,
      decision: 'accepted',
      review_version: 'phase9-coverage-review-v1',
    });
    expect(directCoverage.error).not.toBeNull();
    const foreignCoverage = await userB
      .from('phase9_coverage_review_decisions')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect(foreignCoverage.error).toBeNull();
    expect(foreignCoverage.data).toEqual([]);
  });

  it('records append-only reviews and publishes only accepted supported active evidence', async () => {
    const supported = await userA.rpc('record_phase9_finding_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: supportedHash,
      p_decision: 'accepted',
      p_note: 'Exact source evidence checked.',
      p_corrections: { title: 'Submit Form NJ-7', category: 'mandatory_form' },
    });
    expect(supported.error).toBeNull();
    const incomplete = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(incomplete.error?.message).toContain(
      'all phase9 findings require a team decision before publication',
    );
    const unsupported = await userA.rpc('record_phase9_finding_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: unsupportedHash,
      p_decision: 'accepted',
      p_note: 'Accepted as an unsupported machine assessment.',
      p_corrections: {},
    });
    expect(unsupported.error).toBeNull();

    const coverageIncomplete = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(coverageIncomplete.error?.message).toContain(
      'all phase9 coverage exceptions require a team decision before publication',
    );
    const coverageReview = await userA.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: 'Original page checked; no additional obligation is hidden by the parser warning.',
    });
    expect(coverageReview.error).toBeNull();

    const published = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ publishedCount: 1, reused: false });

    const bridgeRunId = published.data.bridgeRunId as string;
    const { data: items, error: itemsError } = await userA
      .from('phase9_bridge_items')
      .select(
        'candidate_hash,requirement_candidate_id,verification_finding_id,verification_evidence_id',
      )
      .eq('bridge_run_id', bridgeRunId);
    expect(itemsError).toBeNull();
    expect(items).toHaveLength(1);
    expect(items?.[0]?.candidate_hash).toBe(supportedHash);

    const candidateId = items![0]!.requirement_candidate_id;
    const findingId = items![0]!.verification_finding_id;
    const evidenceId = items![0]!.verification_evidence_id;
    const [{ data: candidates }, { data: findings }, { data: evidence }, { data: decisions }] =
      await Promise.all([
        userA.from('requirement_candidates').select('*').eq('id', candidateId),
        userA.from('verification_findings').select('*').eq('id', findingId),
        userA.from('verification_evidence').select('*').eq('id', evidenceId),
        userA.from('human_review_decisions').select('*').eq('finding_id', findingId),
      ]);
    expect(candidates?.[0]).toMatchObject({
      title: 'Submit Form NJ-7',
      category: 'mandatory_form',
      status: 'unverified',
    });
    expect(findings?.[0]).toMatchObject({
      source_support_status: 'supported',
      precedence_status: 'active',
      machine_status: 'machine_assessment_only',
    });
    expect(evidence?.[0]).toMatchObject({ validated: true, match_type: 'exact', page_number: 1 });
    expect(decisions?.[0]).toMatchObject({ decision: 'accepted' });

    const reopenedCoverage = await userA.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'needs_follow_up',
      p_note: 'A second reviewer wants to inspect the parser warning.',
    });
    expect(reopenedCoverage.error).toBeNull();
    const blockedReuse = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(blockedReuse.error?.message).toContain(
      'phase9 coverage follow-up decisions must be resolved before publication',
    );
    const resolvedCoverage = await userA.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: 'Second review completed; no additional obligation found.',
    });
    expect(resolvedCoverage.error).toBeNull();
    const repeat = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(repeat.error).toBeNull();
    expect(repeat.data).toMatchObject({ bridgeRunId, publishedCount: 1, reused: true });
  });

  it('keeps reviews and bridge mappings immutable', async () => {
    const update = await userA
      .from('phase9_finding_review_decisions')
      .update({ note: 'changed' })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .select('id');
    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);
  });
});
