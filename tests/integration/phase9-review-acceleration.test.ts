import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let userA: SupabaseClient;
let userB: SupabaseClient;
let admin: SupabaseClient;
let actorA: string;
let actorB: string;
let workspaceId: string;
let runId: string;
let documentId: string;

const candidateHashes = {
  routineA: sha('phase9-review-acceleration:routine-a'),
  routineB: sha('phase9-review-acceleration:routine-b'),
  routineStale: sha('phase9-review-acceleration:routine-stale'),
  critical: sha('phase9-review-acceleration:critical'),
  exception: sha('phase9-review-acceleration:exception'),
  duplicateA: sha('phase9-review-acceleration:duplicate-a'),
  duplicateB: sha('phase9-review-acceleration:duplicate-b'),
  emptyQuote: sha('phase9-review-acceleration:empty-quote'),
  electronic: sha('phase9-review-acceleration:electronic-submission'),
};

const requirements = {
  routineA: 'The contractor shall maintain an operational contact roster.',
  routineB: 'The contractor shall provide monthly service summaries.',
  routineStale: 'The contractor shall maintain training attendance records.',
  critical: 'Bid submissions are due September 1, 2027 at 2:00 PM.',
  exception: 'The contractor shall provide aerial surveillance.',
  duplicate: 'The contractor shall maintain a quality-management log.',
  emptyQuote: 'The contractor shall maintain a current escalation roster.',
  electronic: 'The bidder shall upload the proposal through the procurement portal.',
};

async function insertFixture() {
  const source = Object.values(requirements).join('\n');
  const sourceHash = sha(source);
  documentId = randomUUID();
  const parseRunId = randomUUID();
  runId = randomUUID();

  expect(
    (
      await admin.from('documents').insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: actorA,
        document_type: 'primary_rfp',
        original_filename: 'Review acceleration public RFP.pdf',
        normalized_filename: 'Review acceleration public RFP.pdf',
        mime_type: 'application/pdf',
        object_key: `${workspaceId}/phase9-review-acceleration/${documentId}.pdf`,
        size_bytes: source.length,
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
  expect(
    (
      await admin.from('phase9_evaluation_runs').insert({
        id: runId,
        workspace_id: workspaceId,
        actor_id: actorA,
        mode: 'workspace_live',
        status: 'completed',
        source_package_hash: sha(`${runId}:source`),
        document_set_hash: sha(`${runId}:documents`),
        expected_answer_hash: sha(`${runId}:no-answers`),
        expected_answers_used: false,
        call_plan_hash: sha(`${runId}:plan`),
        compatibility_fingerprint: sha(`${runId}:compatibility`),
        versions: { purpose: 'phase9-review-acceleration-integration' },
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

  const blockHashByKey = Object.fromEntries(
    Object.keys(requirements).map((key) => [key, sha(`${runId}:block:${key}`)]),
  );
  expect(
    (
      await admin.from('phase9_source_block_coverage').insert(
        Object.entries(blockHashByKey).map(([key, blockHash]) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          block_hash: blockHash,
          source_document_id: documentId,
          source_document_key: 'Review acceleration public RFP.pdf',
          source_hash: sourceHash,
          block_type: 'page_window',
          page_number: 1,
          heading_path: [],
          route: 'selected_for_deterministic_candidate',
          deterministic_signals: ['shall'],
          processing_result: `candidate generated:${key}`,
          coverage_version: 'phase9-source-coverage-v1',
        })),
      )
    ).error,
  ).toBeNull();

  const seeds = [
    {
      hash: candidateHashes.routineA,
      key: 'routineA',
      type: 'other',
      text: requirements.routineA,
      facts: { subject: 'contractor', action: 'maintain contact roster' },
    },
    {
      hash: candidateHashes.routineB,
      key: 'routineB',
      type: 'other',
      text: requirements.routineB,
      facts: { subject: 'contractor', action: 'provide service summaries' },
    },
    {
      hash: candidateHashes.routineStale,
      key: 'routineStale',
      type: 'other',
      text: requirements.routineStale,
      facts: { subject: 'contractor', action: 'maintain training records' },
    },
    {
      hash: candidateHashes.critical,
      key: 'critical',
      type: 'deadline',
      text: requirements.critical,
      facts: { normalizedDate: '2027-09-01', subject: 'bidder' },
    },
    {
      hash: candidateHashes.exception,
      key: 'exception',
      type: 'other',
      text: requirements.exception,
      facts: { subject: 'contractor', action: 'provide aerial surveillance' },
    },
    {
      hash: candidateHashes.duplicateA,
      key: 'duplicate',
      type: 'other',
      text: requirements.duplicate,
      facts: { subject: 'contractor', action: 'maintain quality-management log' },
    },
    {
      hash: candidateHashes.duplicateB,
      key: 'duplicate',
      type: 'other',
      text: requirements.duplicate,
      facts: { subject: 'contractor', action: 'maintain quality-management log' },
    },
    {
      hash: candidateHashes.emptyQuote,
      key: 'emptyQuote',
      type: 'other',
      text: requirements.emptyQuote,
      evidence: '',
      facts: { subject: 'contractor', action: 'maintain escalation roster' },
    },
    {
      hash: candidateHashes.electronic,
      key: 'electronic',
      type: 'other',
      text: requirements.electronic,
      facts: {
        subject: 'bidder',
        action: 'upload proposal',
        submissionMethod: 'procurement portal',
      },
    },
  ];
  expect(
    (
      await admin.from('phase9_candidate_seeds').insert(
        seeds.map((seed) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: seed.hash,
          source_block_hashes: [blockHashByKey[seed.key]],
          requirement_type: seed.type,
          obligation_text: seed.text,
          evidence_text: 'evidence' in seed ? seed.evidence : seed.text,
          material_facts: seed.facts,
          discovery_route: 'deterministic',
          miner_version: 'phase9-deterministic-miner-v1',
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_findings').insert(
        seeds.map((seed) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: seed.hash,
          source_support_status: seed.key === 'exception' ? 'unsupported' : 'supported',
          precedence_status: 'active',
          proof_requirement: 'none_identified',
          evidence_block_hashes: seed.key === 'exception' ? [] : [blockHashByKey[seed.key]],
          decision_version: 'phase9-deterministic-verification-v1',
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_candidate_seeds').insert({
        workspace_id: workspaceId,
        evaluation_run_id: runId,
        candidate_hash: sha('phase9-review-acceleration:coverage-unassessed'),
        source_block_hashes: [blockHashByKey.critical],
        requirement_type: 'other',
        obligation_text: 'An intentionally unassessed coverage signal.',
        evidence_text: requirements.critical,
        material_facts: { testOnlyCoverageException: true },
        discovery_route: 'coverage_sweep',
        miner_version: 'phase9-deterministic-miner-v1',
      })
    ).error,
  ).toBeNull();
}

beforeAll(async () => {
  userA = await signInUser('A');
  userB = await signInUser('B');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  actorA = (await userA.auth.getUser()).data.user!.id;
  actorB = (await userB.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(userA, `phase9 review acceleration ${Date.now()}`);
  await insertFixture();
  const initialCoverageDecision = await userA.rpc('record_phase9_coverage_review', {
    p_workspace_id: workspaceId,
    p_evaluation_run_id: runId,
    p_source_document_id: documentId,
    p_page_number: 1,
    p_decision: 'accepted',
    p_note: 'Initial source-page coverage was reviewed for the fixture.',
  });
  expect(initialCoverageDecision.error).toBeNull();
});

describe('Phase 9 review acceleration persistence', () => {
  it('keeps queue, batch, activity, and tour records workspace scoped', async () => {
    const ownQueue = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'all',
      p_search: '',
      p_page: 1,
      p_page_size: 25,
    });
    expect(ownQueue.error).toBeNull();
    expect(ownQueue.data).toMatchObject({ total: 9, page: 1, pageSize: 25 });

    const ownDashboard = await userA.rpc('get_phase9_review_dashboard_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(ownDashboard.error).toBeNull();
    expect(ownDashboard.data).toMatchObject({
      version: 'phase9-review-priority-v1',
      totalFindings: 9,
      publicationEligible: false,
    });

    const foreignSummary = await userB.rpc('get_phase9_review_dashboard_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(foreignSummary.error?.message).toContain('authorized workspace member required');
    for (const table of [
      'phase9_review_batch_operations',
      'phase9_review_activity_events',
      'guided_tour_states',
    ]) {
      const foreign = await userB.from(table).select('id').eq('workspace_id', workspaceId);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    }
  });

  it('keeps SQL category classification aligned with review-lane business semantics', async () => {
    const cases = [
      {
        type: 'deadline',
        obligation: 'Questions must be submitted by August 12, 2027.',
        facts: {},
        expected: 'question_deadline',
      },
      {
        type: 'form',
        obligation: 'Submit the mandatory cost proposal form.',
        facts: { formReference: 'Cost-1' },
        expected: 'pricing_form',
      },
      {
        type: 'other',
        obligation: 'The bidder shall acknowledge Addendum 2.',
        facts: {},
        expected: 'addendum_acknowledgment',
      },
      {
        type: 'other',
        obligation: 'Upload the proposal through the procurement portal.',
        facts: {},
        expected: 'electronic_submission',
      },
      {
        type: 'other',
        obligation: 'Deliver three sealed hard copies.',
        facts: {},
        expected: 'physical_submission',
      },
      {
        type: 'other',
        obligation: 'Provide the required certification.',
        facts: {},
        expected: 'certification',
      },
      {
        type: 'other',
        obligation: 'List and identify every proposed subcontractor.',
        facts: {},
        expected: 'subcontractor_disclosure',
      },
    ] as const;

    for (const item of cases) {
      const result = await userA.rpc('phase9_review_category_v1', {
        p_requirement_type: item.type,
        p_obligation_text: item.obligation,
        p_material_facts: item.facts,
      });
      expect(result.error).toBeNull();
      expect(result.data).toBe(item.expected);
    }
  });

  it('fails closed when quotation evidence is empty even though its page exists', async () => {
    const queue = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'exception',
      p_search: requirements.emptyQuote,
      p_page: 1,
      p_page_size: 10,
    });
    expect(queue.error).toBeNull();
    expect(queue.data.rows).toEqual([
      expect.objectContaining({
        candidate_hash: candidateHashes.emptyQuote,
        quote_match_type: 'not_found',
        review_lane: 'exception',
        lane_reason: 'quotation_not_validated',
        batch_accept_eligible: false,
      }),
    ]);
  });

  it('records one append-only decision per selected finding under one shared batch ID', async () => {
    const idempotencyKey = randomUUID();
    const reviewSessionId = randomUUID();
    const selected = [candidateHashes.routineA, candidateHashes.routineB];
    const batchInput = {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: selected,
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: idempotencyKey,
      p_review_session_id: reviewSessionId,
    };
    // Sequential duplicate delivery under suite load: concurrent identical batch
    // RPCs can contend on the same idempotency row and hit statement_timeout.
    const first = await userA.rpc('record_phase9_review_batch_v2', batchInput);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      action: 'accept_routine',
      selectionCount: 2,
      reused: false,
    });
    const second = await userA.rpc('record_phase9_review_batch_v2', batchInput);
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({
      batchOperationId: first.data.batchOperationId,
      selectionCount: 2,
      reused: true,
    });
    const batchId = first.data.batchOperationId as string;

    const { data: decisions, error: decisionError } = await userA
      .from('phase9_finding_review_decisions')
      .select(
        'id,candidate_hash,decision,corrections,batch_operation_id,batch_policy_version,prior_decision_id',
      )
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .eq('batch_operation_id', batchId)
      .order('candidate_hash');
    expect(decisionError).toBeNull();
    expect(decisions).toHaveLength(2);
    expect(decisions?.map((decision) => decision.candidate_hash).sort()).toEqual(selected.sort());
    for (const decision of decisions ?? []) {
      expect(decision).toMatchObject({
        decision: 'accepted',
        corrections: {},
        batch_operation_id: batchId,
        batch_policy_version: 'phase9-batch-review-policy-v1',
        prior_decision_id: null,
      });
    }
    const batchRecord = await userA
      .from('phase9_review_batch_operations')
      .select('reason')
      .eq('id', batchId)
      .single();
    expect(batchRecord.error).toBeNull();
    expect(batchRecord.data?.reason).toContain('server-owned batch policy');
    const activitySummary = await userA.rpc('get_phase9_review_activity_summary', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_review_session_id: reviewSessionId,
    });
    expect(activitySummary.error).toBeNull();
    expect(activitySummary.data).toMatchObject({
      batchOperations: 1,
      batchDecisions: 2,
    });

    const repeat = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [...selected].reverse(),
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: idempotencyKey,
      p_review_session_id: reviewSessionId,
    });
    expect(repeat.error).toBeNull();
    expect(repeat.data).toMatchObject({
      batchOperationId: batchId,
      selectionCount: 2,
      reused: true,
    });
    expect(
      (
        await userA
          .from('phase9_finding_review_decisions')
          .select('id')
          .eq('batch_operation_id', batchId)
      ).data,
    ).toHaveLength(2);

    const identityMismatch = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.routineA],
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: idempotencyKey,
      p_review_session_id: reviewSessionId,
    });
    expect(identityMismatch.error?.message).toContain('batch idempotency identity mismatch');
  });

  it('rolls back an entire stale or ineligible batch and refuses critical batch follow-up', async () => {
    const mixedKey = randomUUID();
    const mixed = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.routineStale, candidateHashes.critical],
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: mixedKey,
      p_review_session_id: randomUUID(),
    });
    expect(mixed.error?.message).toContain(
      'batch selection is stale or contains an ineligible finding',
    );
    expect(
      (
        await userA
          .from('phase9_review_batch_operations')
          .select('id')
          .eq('idempotency_key', mixedKey)
      ).data,
    ).toEqual([]);
    expect(
      (
        await userA
          .from('phase9_finding_review_decisions')
          .select('candidate_hash')
          .eq('workspace_id', workspaceId)
          .eq('evaluation_run_id', runId)
          .in('candidate_hash', [candidateHashes.routineStale, candidateHashes.critical])
      ).data,
    ).toEqual([]);

    const criticalFollowUp = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.critical],
      p_action: 'mark_follow_up',
      p_reason: 'Deadline requires an individual source review.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(criticalFollowUp.error?.message).toContain(
      'batch selection is stale or contains an ineligible finding',
    );

    const individual = await userA.rpc('record_phase9_finding_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: candidateHashes.routineStale,
      p_decision: 'accepted',
      p_note: 'Reviewed individually before a stale batch attempt.',
      p_corrections: {},
    });
    expect(individual.error).toBeNull();
    const staleKey = randomUUID();
    const stale = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.routineStale],
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: staleKey,
      p_review_session_id: randomUUID(),
    });
    expect(stale.error?.message).toContain(
      'batch selection is stale or contains an ineligible finding',
    );
    expect(
      (
        await userA
          .from('phase9_review_batch_operations')
          .select('id')
          .eq('idempotency_key', staleKey)
      ).data,
    ).toEqual([]);
  });

  it('rejects only a deterministic non-canonical duplicate and preserves every source finding', async () => {
    const queue = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'duplicate',
      p_search: '',
      p_page: 1,
      p_page_size: 25,
    });
    expect(queue.error).toBeNull();
    expect(queue.data.total).toBe(1);
    const duplicateHash = queue.data.rows[0].candidate_hash as string;
    expect([candidateHashes.duplicateA, candidateHashes.duplicateB]).toContain(duplicateHash);

    const rejected = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [duplicateHash],
      p_action: 'reject_duplicate',
      p_reason: 'Exact deterministic non-canonical duplicate.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(rejected.error).toBeNull();
    const { data: decision } = await userA
      .from('phase9_finding_review_decisions')
      .select('decision,batch_operation_id')
      .eq('candidate_hash', duplicateHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(decision).toMatchObject({
      decision: 'rejected',
      batch_operation_id: rejected.data.batchOperationId,
    });
    expect(
      (
        await userA
          .from('phase9_findings')
          .select('candidate_hash')
          .eq('workspace_id', workspaceId)
          .eq('evaluation_run_id', runId)
      ).data,
    ).toHaveLength(9);
  });

  it('denies cross-workspace batches and direct or privileged history mutation', async () => {
    const foreign = await userB.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.critical],
      p_action: 'mark_follow_up',
      p_reason: 'Cross-workspace attempt must fail.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(foreign.error?.message).toContain('authorized workspace reviewer required');

    const direct = await userA.from('phase9_review_batch_operations').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      actor_id: actorA,
      action: 'accept_routine',
      selection_count: 1,
      selection_hash: sha('forged'),
      reason: '',
      idempotency_key: randomUUID(),
      priority_version: 'phase9-review-priority-v1',
      policy_version: 'phase9-batch-review-policy-v1',
    });
    expect(direct.error).not.toBeNull();

    const { data: batch } = await userA
      .from('phase9_review_batch_operations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .single();
    const privilegedBatchMutation = await admin
      .from('phase9_review_batch_operations')
      .update({ reason: 'mutated' })
      .eq('id', batch!.id);
    expect(privilegedBatchMutation.error?.message).toContain(
      'phase9 evaluation history is immutable',
    );
    const privilegedDecisionMutation = await admin
      .from('phase9_finding_review_decisions')
      .update({ note: 'mutated' })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId);
    expect(privilegedDecisionMutation.error?.message).toContain(
      'phase9 evaluation history is immutable',
    );
  });

  it('revokes the superseded broad batch and activity RPCs from authenticated users', async () => {
    const oldBatch = await userA.rpc('record_phase9_review_batch', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.critical],
      p_action: 'mark_follow_up',
      p_reason: 'The retired entry point must not remain callable.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(oldBatch.error).not.toBeNull();
    expect(oldBatch.error?.message).toMatch(/permission denied|schema cache|could not find/i);

    const oldActivity = await userA.rpc('record_phase9_review_activity', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: randomUUID(),
      p_idempotency_key: randomUUID(),
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_batch_operation_id: null,
      p_metadata: {},
    });
    expect(oldActivity.error).not.toBeNull();
    expect(oldActivity.error?.message).toMatch(/permission denied|schema cache|could not find/i);
  });

  it('keeps privacy-safe activity idempotent, isolated, and outside publication logic', async () => {
    const before = await userA.rpc('get_phase9_review_summary', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(before.error).toBeNull();
    const reviewSessionId = randomUUID();
    const idempotencyKey = randomUUID();
    const event = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: idempotencyKey,
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { lane: 'critical' },
    });
    expect(event.error).toBeNull();
    expect(typeof event.data).toBe('string');
    const repeat = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: idempotencyKey,
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { lane: 'critical' },
    });
    expect(repeat.error).toBeNull();
    expect(repeat.data).toBe(event.data);

    const identityMismatch = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: idempotencyKey,
      p_candidate_hash: candidateHashes.routineStale,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { lane: 'routine' },
    });
    expect(identityMismatch.error?.message).toContain(
      'review activity idempotency identity mismatch',
    );

    const prohibited = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: randomUUID(),
      p_idempotency_key: randomUUID(),
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { quotationText: 'must not be stored' },
    });
    expect(prohibited.error?.message).toContain('review activity metadata is not permitted');
    const fabricatedDecision = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'individual_decision_recorded',
      p_review_session_id: randomUUID(),
      p_idempotency_key: randomUUID(),
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { result: randomUUID() },
    });
    expect(fabricatedDecision.error?.message).toContain(
      'only observational review activity is permitted',
    );
    expect(
      (
        await userB
          .from('phase9_review_activity_events')
          .select('id')
          .eq('workspace_id', workspaceId)
      ).data,
    ).toEqual([]);

    const after = await userA.rpc('get_phase9_review_summary', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(after.error).toBeNull();
    expect(after.data.reviewed).toBe(before.data.reviewed);
    expect(after.data.publicationEligible).toBe(before.data.publicationEligible);
  });

  it('uses a dedicated high-volume, provider-free review workflow rate bucket', async () => {
    const result = await admin.rpc('consume_phase8_rate_limit', {
      p_operation: 'phase9_review_workflow',
      p_key_hash: sha(`phase9-review-workflow:${randomUUID()}`),
      p_workspace_id: workspaceId,
      p_actor_id: actorA,
    });
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({
      allowed: true,
      limit_value: 600,
      remaining: 599,
    });
  });

  it('keeps publication locked while any finding lacks a team decision', async () => {
    const publication = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(publication.error?.message).toContain(
      'all phase9 findings require a team decision before publication',
    );
    expect(
      (
        await userA
          .from('phase9_bridge_runs')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('evaluation_run_id', runId)
      ).data,
    ).toEqual([]);
  });

  it('moves a finding into the exception lane while its source-page follow-up is unresolved', async () => {
    const followUp = await userA.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'needs_follow_up',
      p_note: 'The source page requires an individual coverage review.',
    });
    expect(followUp.error).toBeNull();

    const duringFollowUp = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'exception',
      p_search: requirements.critical,
      p_page: 1,
      p_page_size: 10,
    });
    expect(duringFollowUp.error).toBeNull();
    expect(duringFollowUp.data.rows).toEqual([
      expect.objectContaining({
        candidate_hash: candidateHashes.critical,
        review_lane: 'exception',
        lane_reason: 'coverage_exception_unresolved',
        unresolved_coverage_exception: true,
        batch_accept_eligible: false,
      }),
    ]);

    const forbiddenBatch = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [candidateHashes.critical],
      p_action: 'mark_follow_up',
      p_reason: 'Coverage exceptions require an individual decision.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(forbiddenBatch.error?.message).toContain(
      'batch selection is stale or contains an ineligible finding',
    );

    const resolved = await userA.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: 'Coverage was reviewed against the original source page.',
    });
    expect(resolved.error).toBeNull();

    const afterResolution = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'critical',
      p_search: requirements.critical,
      p_page: 1,
      p_page_size: 10,
    });
    expect(afterResolution.error).toBeNull();
    expect(afterResolution.data.rows).toEqual([
      expect.objectContaining({
        candidate_hash: candidateHashes.critical,
        review_lane: 'critical',
        unresolved_coverage_exception: false,
        batch_accept_eligible: false,
      }),
    ]);
  });

  it('fails closed on invalid accepted evidence and records only authoritative publication activity', async () => {
    // Self-heal routine accepts if an earlier shared-suite step timed out before writing.
    for (const candidateHash of [candidateHashes.routineA, candidateHashes.routineB]) {
      const existing = await userA
        .from('phase9_finding_review_decisions')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', runId)
        .eq('candidate_hash', candidateHash)
        .limit(1);
      expect(existing.error).toBeNull();
      if ((existing.data?.length ?? 0) > 0) continue;
      const healed = await userA.rpc('record_phase9_finding_review', {
        p_workspace_id: workspaceId,
        p_evaluation_run_id: runId,
        p_candidate_hash: candidateHash,
        p_decision: 'accepted',
        p_note: 'Healed routine accept for publication gate coverage.',
        p_corrections: {},
      });
      expect(healed.error).toBeNull();
    }

    const individualDecisions = [
      [candidateHashes.critical, 'accepted', 'Deadline checked against the exact source page.'],
      [
        candidateHashes.electronic,
        'accepted',
        'Electronic submission method checked against the exact source page.',
      ],
      [
        candidateHashes.exception,
        'rejected',
        'Unsupported machine finding rejected after source review.',
      ],
      [
        candidateHashes.emptyQuote,
        'accepted',
        'Deliberately accepted to prove publication independently rejects empty evidence.',
      ],
    ] as const;
    for (const [candidateHash, decision, note] of individualDecisions) {
      const result = await userA.rpc('record_phase9_finding_review', {
        p_workspace_id: workspaceId,
        p_evaluation_run_id: runId,
        p_candidate_hash: candidateHash,
        p_decision: decision,
        p_note: note,
        p_corrections: {},
      });
      expect(result.error).toBeNull();
    }

    const remainingDuplicateCanonical = await userA.rpc('get_phase9_review_queue', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_lane: 'routine',
      p_search: requirements.duplicate,
      p_page: 1,
      p_page_size: 10,
    });
    expect(remainingDuplicateCanonical.error).toBeNull();
    expect(remainingDuplicateCanonical.data.rows).toEqual([
      expect.objectContaining({
        review_lane: 'routine',
        batch_accept_eligible: true,
      }),
    ]);
    const canonicalHash = remainingDuplicateCanonical.data.rows[0].candidate_hash as string;
    const canonicalDecision = await userA.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [canonicalHash],
      p_action: 'accept_routine',
      p_reason: '',
      p_idempotency_key: randomUUID(),
      p_review_session_id: randomUUID(),
    });
    expect(canonicalDecision.error).toBeNull();

    const invalidPublication = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(invalidPublication.error?.message).toContain(
      `accepted phase9 finding is not publishable:${candidateHashes.emptyQuote}`,
    );
    const invalidDashboard = await userA.rpc('get_phase9_review_dashboard_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(invalidDashboard.error).toBeNull();
    expect(invalidDashboard.data).toMatchObject({
      invalidAccepted: 1,
      unrepresentedFindings: 0,
      publicationEligible: false,
      nextRecommendedAction: 'review_exceptions',
    });
    expect(
      (
        await userA
          .from('phase9_bridge_runs')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('evaluation_run_id', runId)
      ).data,
    ).toEqual([]);

    const rejectInvalidEvidence = await userA.rpc('record_phase9_finding_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: candidateHashes.emptyQuote,
      p_decision: 'rejected',
      p_note: 'Empty quotation evidence cannot support publication.',
      p_corrections: {},
    });
    expect(rejectInvalidEvidence.error).toBeNull();
    const readyDashboard = await userA.rpc('get_phase9_review_dashboard_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(readyDashboard.error).toBeNull();
    expect(readyDashboard.data).toMatchObject({
      invalidAccepted: 0,
      unrepresentedFindings: 0,
      publishableAccepted: 6,
      publicationEligible: true,
      nextRecommendedAction: 'publish_reviewed_requirements',
    });

    const reviewerMembership = await admin.from('workspace_members').upsert(
      {
        workspace_id: workspaceId,
        user_id: actorB,
        role: 'reviewer',
      },
      { onConflict: 'workspace_id,user_id', ignoreDuplicates: true },
    );
    expect(reviewerMembership.error).toBeNull();
    const reviewerAttempt = await userB.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_attempted',
      p_review_session_id: randomUUID(),
      p_idempotency_key: randomUUID(),
      p_bridge_run_id: null,
    });
    expect(reviewerAttempt.error?.message).toContain(
      'workspace owner required for publication activity',
    );

    const reviewSessionId = randomUUID();
    const attemptKey = randomUUID();
    const attempted = await userA.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_attempted',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: attemptKey,
      p_bridge_run_id: null,
    });
    expect(attempted.error).toBeNull();
    const repeatedAttempt = await userA.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_attempted',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: attemptKey,
      p_bridge_run_id: null,
    });
    expect(repeatedAttempt.error).toBeNull();
    expect(repeatedAttempt.data).toBe(attempted.data);

    const attemptWithResult = await userA.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_attempted',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: randomUUID(),
      p_bridge_run_id: randomUUID(),
    });
    expect(attemptWithResult.error?.message).toContain('publication attempt cannot name a result');
    const fabricatedCompletion = await userA.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_completed',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: randomUUID(),
      p_bridge_run_id: randomUUID(),
    });
    expect(fabricatedCompletion.error?.message).toContain(
      'publication result is not authoritative',
    );

    const publication = await userA.rpc('publish_phase9_reviewed_findings', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
    });
    expect(publication.error).toBeNull();
    expect(publication.data).toMatchObject({ publishedCount: 6, reused: false });
    const bridgeRunId = publication.data.bridgeRunId as string;

    const completed = await userA.rpc('record_phase9_publication_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'publication_completed',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: randomUUID(),
      p_bridge_run_id: bridgeRunId,
    });
    expect(completed.error).toBeNull();
    const activityRows = await userA
      .from('phase9_review_activity_events')
      .select('event_type,metadata')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .in('id', [attempted.data as string, completed.data as string])
      .order('event_type');
    expect(activityRows.error).toBeNull();
    expect(activityRows.data).toEqual([
      {
        event_type: 'publication_attempted',
        metadata: { publicationState: 'attempted' },
      },
      {
        event_type: 'publication_completed',
        metadata: { publicationState: 'completed', result: bridgeRunId },
      },
    ]);

    const electronicBridge = await userA
      .from('phase9_bridge_items')
      .select('requirement_candidate_id')
      .eq('bridge_run_id', bridgeRunId)
      .eq('candidate_hash', candidateHashes.electronic)
      .single();
    expect(electronicBridge.error).toBeNull();
    const electronicRequirement = await userA
      .from('requirement_candidates')
      .select('category,evidence_quote')
      .eq('id', electronicBridge.data!.requirement_candidate_id)
      .single();
    expect(electronicRequirement.error).toBeNull();
    expect(electronicRequirement.data).toEqual({
      category: 'electronic_submission',
      evidence_quote: requirements.electronic,
    });
  });

  it('enforces the review activity cap inside the directly callable database wrapper', async () => {
    const windowStartedAt = new Date(
      Math.floor(Date.now() / 1000 / 300) * 300 * 1000,
    ).toISOString();
    const keyHash = sha(`phase8-rate-limits-v1:phase9_review_workflow:${actorA}:${workspaceId}`);
    const seeded = await admin.from('operation_rate_limit_buckets').upsert(
      {
        operation: 'phase9_review_workflow',
        key_hash: keyHash,
        workspace_id: workspaceId,
        window_started_at: windowStartedAt,
        window_seconds: 300,
        request_count: 600,
        policy_version: 'phase8-rate-limits-v1',
      },
      { onConflict: 'operation,key_hash,window_started_at' },
    );
    expect(seeded.error).toBeNull();
    const blocked = await userA.rpc('record_phase9_observational_activity_v1', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_event_type: 'finding_opened',
      p_review_session_id: randomUUID(),
      p_idempotency_key: randomUUID(),
      p_candidate_hash: candidateHashes.critical,
      p_source_document_id: null,
      p_page_number: null,
      p_metadata: { lane: 'critical' },
    });
    expect(blocked.error?.message).toContain('review activity rate limit exceeded');
  });

  it('isolates guided-tour completion per user even inside one shared workspace', async () => {
    const reviewerMembership = await admin.from('workspace_members').upsert(
      {
        workspace_id: workspaceId,
        user_id: actorB,
        role: 'reviewer',
      },
      { onConflict: 'workspace_id,user_id', ignoreDuplicates: true },
    );
    expect(reviewerMembership.error).toBeNull();

    const foreignWorkspaceId = await createTestWorkspace(
      userB,
      `phase9 guided tour foreign ${Date.now()}`,
    );
    const crossWorkspaceSave = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: foreignWorkspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'started',
      p_last_completed_step: 0,
    });
    expect(crossWorkspaceSave.error?.message).toContain('authorized workspace member required');

    const unboundPresenterTour = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'stakeholder-demo',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'started',
      p_last_completed_step: 0,
    });
    expect(unboundPresenterTour.error?.message).toContain(
      'authorized prepared demo identity required',
    );

    const savedA = await userA.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'completed',
      p_last_completed_step: 5,
    });
    expect(savedA.error).toBeNull();
    const visibleA = await userA
      .from('guided_tour_states')
      .select('user_id,status,last_completed_step')
      .eq('workspace_id', workspaceId);
    expect(visibleA.data).toEqual([
      { user_id: actorA, status: 'completed', last_completed_step: 5 },
    ]);
    const hiddenFromB = await userB
      .from('guided_tour_states')
      .select('user_id,status')
      .eq('workspace_id', workspaceId);
    expect(hiddenFromB.data).toEqual([]);

    const savedB = await userB.rpc('save_guided_tour_state', {
      p_workspace_id: workspaceId,
      p_tour_id: 'first-run-rfp-review',
      p_tour_version: 'guided-product-tour-v1',
      p_status: 'started',
      p_last_completed_step: 2,
    });
    expect(savedB.error).toBeNull();
    expect(
      (
        await userB
          .from('guided_tour_states')
          .select('user_id,status,last_completed_step')
          .eq('workspace_id', workspaceId)
      ).data,
    ).toEqual([{ user_id: actorB, status: 'started', last_completed_step: 2 }]);
    expect(
      (await userA.from('guided_tour_states').select('user_id').eq('workspace_id', workspaceId))
        .data,
    ).toEqual([{ user_id: actorA }]);

    const direct = await userA.from('guided_tour_states').insert({
      user_id: actorA,
      workspace_id: workspaceId,
      tour_id: 'forged',
      tour_version: 'guided-product-tour-v1',
      status: 'completed',
      last_completed_step: 1,
    });
    expect(direct.error).not.toBeNull();
  });
});
