import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestWorkspace, signInUser, SUPABASE_URL } from './helpers';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

let user: SupabaseClient;
let admin: SupabaseClient;
let actorId: string;
let workspaceId: string;
let runId: string;
let documentId: string;
let unrelatedDocumentId: string;
let reviewCandidateHash: string;
let batchCandidateHash: string;

beforeAll(async () => {
  user = await signInUser('A');
  admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  actorId = (await user.auth.getUser()).data.user!.id;
  workspaceId = await createTestWorkspace(user, `phase9 integrity ${Date.now()}`);
  runId = randomUUID();
  documentId = randomUUID();
  unrelatedDocumentId = randomUUID();
  const parseRunId = randomUUID();
  const sourceText =
    'The contractor shall maintain a current contact roster. The contractor shall maintain a monthly service log.';
  const sourceHash = sha(sourceText);

  for (const [id, hash] of [
    [documentId, sourceHash],
    [unrelatedDocumentId, sha(`${sourceText}:unrelated-document`)],
  ] as const) {
    const document = await admin.from('documents').insert({
      id,
      workspace_id: workspaceId,
      created_by: actorId,
      document_type: 'primary_rfp',
      original_filename: `${id}.pdf`,
      normalized_filename: `${id}.pdf`,
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/phase9-integrity/${id}.pdf`,
      size_bytes: sourceText.length,
      sha256: hash,
      status: 'parsed',
      page_count: 1,
      parser_name: 'integration',
      parser_version: '1',
    });
    expect(document.error).toBeNull();
  }
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
        text: sourceText,
        text_sha256: sourceHash,
        char_count: sourceText.length,
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
        expected_answer_hash: sha(`${runId}:answers`),
        expected_answers_used: false,
        call_plan_hash: sha(`${runId}:plan`),
        compatibility_fingerprint: sha(`${runId}:compatibility`),
        versions: { purpose: 'phase9-review-integrity-integration-v1' },
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

  reviewCandidateHash = sha(`${runId}:candidate:review`);
  batchCandidateHash = sha(`${runId}:candidate:batch`);
  const candidates = [
    {
      candidateHash: reviewCandidateHash,
      blockHash: sha(`${runId}:block:review`),
      obligation: 'The contractor shall maintain a current contact roster.',
    },
    {
      candidateHash: batchCandidateHash,
      blockHash: sha(`${runId}:block:batch`),
      obligation: 'The contractor shall maintain a monthly service log.',
    },
  ];
  expect(
    (
      await admin.from('phase9_source_block_coverage').insert(
        candidates.map((candidate) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          block_hash: candidate.blockHash,
          source_document_id: documentId,
          source_document_key: `${documentId}.pdf`,
          source_hash: sourceHash,
          block_type: 'page_window',
          page_number: 1,
          heading_path: [],
          route: 'selected_for_deterministic_candidate',
          deterministic_signals: ['shall'],
          processing_result: 'candidate generated',
          coverage_version: 'phase9-source-coverage-v1',
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_candidate_seeds').insert(
        candidates.map((candidate) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: candidate.candidateHash,
          source_block_hashes: [candidate.blockHash],
          requirement_type: 'other',
          obligation_text: candidate.obligation,
          evidence_text: candidate.obligation,
          material_facts: { subject: 'contractor' },
          discovery_route: 'deterministic',
          miner_version: 'phase9-deterministic-miner-v1',
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from('phase9_findings').insert(
        candidates.map((candidate) => ({
          workspace_id: workspaceId,
          evaluation_run_id: runId,
          candidate_hash: candidate.candidateHash,
          source_support_status: 'supported',
          precedence_status: 'active',
          proof_requirement: 'none_identified',
          evidence_block_hashes: [candidate.blockHash],
          decision_version: 'phase9-deterministic-verification-v1',
        })),
      )
    ).error,
  ).toBeNull();
}, 60_000);

describe('Phase 9 review integrity hardening', () => {
  it('rejects evidence outside the run document set and findings without a seed', async () => {
    const unboundEvidence = await admin.from('phase9_source_block_coverage').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      block_hash: sha(`${runId}:block:unbound`),
      source_document_id: unrelatedDocumentId,
      source_document_key: `${unrelatedDocumentId}.pdf`,
      source_hash: sha(`${runId}:unbound-source`),
      block_type: 'page_window',
      page_number: 1,
      heading_path: [],
      route: 'selected_for_deterministic_candidate',
      deterministic_signals: [],
      processing_result: 'must be rejected',
      coverage_version: 'phase9-source-coverage-v1',
    });
    expect(unboundEvidence.error?.message).toContain(
      'phase9_source_block_coverage_run_document_fk',
    );

    const orphanFinding = await admin.from('phase9_findings').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      candidate_hash: sha(`${runId}:candidate:orphan`),
      source_support_status: 'supported',
      precedence_status: 'active',
      proof_requirement: 'none_identified',
      evidence_block_hashes: [sha(`${runId}:block:review`)],
      decision_version: 'phase9-deterministic-verification-v1',
    });
    expect(orphanFinding.error?.message).toContain('phase9_findings_candidate_seed_fk');
  });

  it('reuses only an identical accelerated finding-review request', async () => {
    const reviewSessionId = randomUUID();
    const idempotencyKey = randomUUID();
    const input = {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: reviewCandidateHash,
      p_decision: 'accepted',
      p_note: 'Exact source evidence reviewed.',
      p_corrections: {},
      p_review_session_id: reviewSessionId,
      p_idempotency_key: idempotencyKey,
    };
    const first = await user.rpc('record_phase9_finding_review_accelerated', input);
    expect(first.error).toBeNull();
    const repeat = await user.rpc('record_phase9_finding_review_accelerated', input);
    expect(repeat.error).toBeNull();
    expect(repeat.data).toBe(first.data);

    const changedPayload = await user.rpc('record_phase9_finding_review_accelerated', {
      ...input,
      p_note: 'A different decision payload must not reuse the first result.',
    });
    expect(changedPayload.error?.message).toContain(
      'accelerated finding review idempotency identity mismatch',
    );
  });

  it('serializes page decisions and makes accelerated coverage idempotency payload-aware', async () => {
    const reviewSessionId = randomUUID();
    const idempotencyKey = randomUUID();
    const input = {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: 'Page coverage reviewed.',
      p_review_session_id: reviewSessionId,
      p_idempotency_key: idempotencyKey,
    };
    const first = await user.rpc('record_phase9_coverage_review_accelerated', input);
    expect(first.error).toBeNull();
    const repeat = await user.rpc('record_phase9_coverage_review_accelerated', input);
    expect(repeat.error).toBeNull();
    expect(repeat.data).toBe(first.data);
    const changedPayload = await user.rpc('record_phase9_coverage_review_accelerated', {
      ...input,
      p_decision: 'needs_follow_up',
    });
    expect(changedPayload.error?.message).toContain(
      'accelerated coverage review idempotency identity mismatch',
    );

    const concurrent = await Promise.all([
      user.rpc('record_phase9_coverage_review_accelerated', {
        ...input,
        p_decision: 'accepted',
        p_note: 'Concurrent page decision A.',
        p_idempotency_key: randomUUID(),
      }),
      user.rpc('record_phase9_coverage_review_accelerated', {
        ...input,
        p_decision: 'needs_follow_up',
        p_note: 'Concurrent page decision B.',
        p_idempotency_key: randomUUID(),
      }),
    ]);
    const successful = concurrent.filter((result) => !result.error);
    const stale = concurrent.filter((result) => result.error);
    expect(successful.length).toBeGreaterThanOrEqual(1);
    expect(successful.length).toBeLessThanOrEqual(2);
    for (const result of stale)
      expect(result.error?.message).toContain('phase9 coverage review selection is stale');

    const chain = await user
      .from('phase9_coverage_review_decisions')
      .select('id,prior_decision_id')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .eq('source_document_id', documentId)
      .eq('page_number', 1);
    expect(chain.error).toBeNull();
    expect(chain.data).toHaveLength(1 + successful.length);
    expect(chain.data?.filter((decision) => decision.prior_decision_id === null)).toHaveLength(1);
    const nonNullPriors = (chain.data ?? [])
      .map((decision) => decision.prior_decision_id)
      .filter((value): value is string => value !== null);
    expect(new Set(nonNullPriors).size).toBe(nonNullPriors.length);
  });

  it('reuses exact legacy accelerated events and rejects semantic changes', async () => {
    const findingSessionId = randomUUID();
    const findingIdempotencyKey = randomUUID();
    const findingNote = 'Legacy finding payload reviewed exactly.';
    const findingDecision = await user.rpc('record_phase9_finding_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: reviewCandidateHash,
      p_decision: 'accepted',
      p_note: findingNote,
      p_corrections: {},
    });
    expect(findingDecision.error).toBeNull();
    const legacyFindingEvent = await admin.from('phase9_review_activity_events').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      actor_id: actorId,
      review_session_id: findingSessionId,
      idempotency_key: findingIdempotencyKey,
      event_type: 'individual_decision_recorded',
      candidate_hash: reviewCandidateHash,
      policy_version: 'phase9-review-analytics-v1',
      metadata: {
        decision: 'accepted',
        result: findingDecision.data,
      },
    });
    expect(legacyFindingEvent.error).toBeNull();
    const exactFindingRetry = await user.rpc('record_phase9_finding_review_accelerated', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: reviewCandidateHash,
      p_decision: 'accepted',
      p_note: findingNote,
      p_corrections: {},
      p_review_session_id: findingSessionId,
      p_idempotency_key: findingIdempotencyKey,
    });
    expect(exactFindingRetry.error).toBeNull();
    expect(exactFindingRetry.data).toBe(findingDecision.data);
    const changedFindingRetry = await user.rpc('record_phase9_finding_review_accelerated', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hash: reviewCandidateHash,
      p_decision: 'accepted',
      p_note: 'Changed legacy payload.',
      p_corrections: {},
      p_review_session_id: findingSessionId,
      p_idempotency_key: findingIdempotencyKey,
    });
    expect(changedFindingRetry.error?.message).toContain(
      'accelerated finding review result identity mismatch',
    );

    const coverageSessionId = randomUUID();
    const coverageIdempotencyKey = randomUUID();
    const coverageNote = 'Legacy page payload reviewed exactly.';
    const coverageDecision = await user.rpc('record_phase9_coverage_review', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: coverageNote,
    });
    expect(coverageDecision.error).toBeNull();
    const legacyCoverageEvent = await admin.from('phase9_review_activity_events').insert({
      workspace_id: workspaceId,
      evaluation_run_id: runId,
      actor_id: actorId,
      review_session_id: coverageSessionId,
      idempotency_key: coverageIdempotencyKey,
      event_type: 'coverage_exception_reviewed',
      source_document_id: documentId,
      page_number: 1,
      policy_version: 'phase9-review-analytics-v1',
      metadata: {
        decision: 'accepted',
        result: coverageDecision.data,
      },
    });
    expect(legacyCoverageEvent.error).toBeNull();
    const exactCoverageRetry = await user.rpc('record_phase9_coverage_review_accelerated', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'accepted',
      p_note: coverageNote,
      p_review_session_id: coverageSessionId,
      p_idempotency_key: coverageIdempotencyKey,
    });
    expect(exactCoverageRetry.error).toBeNull();
    expect(exactCoverageRetry.data).toBe(coverageDecision.data);
    const changedCoverageRetry = await user.rpc('record_phase9_coverage_review_accelerated', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_source_document_id: documentId,
      p_page_number: 1,
      p_decision: 'needs_follow_up',
      p_note: 'Changed legacy page payload.',
      p_review_session_id: coverageSessionId,
      p_idempotency_key: coverageIdempotencyKey,
    });
    expect(changedCoverageRetry.error?.message).toContain(
      'accelerated coverage review idempotency identity mismatch',
    );
  });

  it('uses chain chronology rather than caller timestamps for current decisions', async () => {
    const latest = await user
      .from('phase9_finding_review_decisions')
      .select('id,created_at')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .eq('candidate_hash', reviewCandidateHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(latest.error).toBeNull();
    const inserted = await admin
      .from('phase9_finding_review_decisions')
      .insert({
        workspace_id: workspaceId,
        evaluation_run_id: runId,
        candidate_hash: reviewCandidateHash,
        reviewer_id: actorId,
        decision: 'needs_follow_up',
        note: 'Caller timestamp must not control chain order.',
        corrections: {},
        prior_decision_id: latest.data!.id,
        review_version: 'phase9-finding-review-v1',
        created_at: '2000-01-01T00:00:00.000Z',
      })
      .select('id,created_at,prior_decision_id')
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.prior_decision_id).toBe(latest.data!.id);
    expect(new Date(inserted.data!.created_at).getTime()).toBeGreaterThan(
      new Date(latest.data!.created_at).getTime(),
    );
  });

  it('records truthful routine-lane metadata for a follow-up batch', async () => {
    const reviewSessionId = randomUUID();
    const batch = await user.rpc('record_phase9_review_batch_v2', {
      p_workspace_id: workspaceId,
      p_evaluation_run_id: runId,
      p_candidate_hashes: [batchCandidateHash],
      p_action: 'mark_follow_up',
      p_reason: 'Explicit team selection for follow-up.',
      p_idempotency_key: randomUUID(),
      p_review_session_id: reviewSessionId,
    });
    expect(batch.error).toBeNull();
    const activity = await user
      .from('phase9_review_activity_events')
      .select('metadata')
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', runId)
      .eq('batch_operation_id', batch.data.batchOperationId)
      .single();
    expect(activity.error).toBeNull();
    expect(activity.data?.metadata).toMatchObject({
      lane: 'routine',
      decision: 'needs_follow_up',
      selectionCount: 1,
    });
  });
});
