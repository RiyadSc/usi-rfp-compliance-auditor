import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260729000045_phase9_review_integrity_hardening.sql',
  'utf8',
).toLowerCase();

describe('Phase 9 review integrity hardening migration', () => {
  it('binds new evidence to selected run documents without rewriting legacy evidence', () => {
    expect(sql).toContain('phase9_source_block_coverage_run_document_fk');
    expect(sql).toContain('foreign key(evaluation_run_id,source_document_id)');
    expect(sql).toContain(
      'references public.phase9_evaluation_documents(evaluation_run_id,document_id)',
    );
    expect(sql).toContain('not valid');
    expect(sql).toContain("'evidence_document_not_bound_to_run'");
    expect(sql).toContain('guarded.batch_accept_eligible and guarded.evidence_run_bound');
    expect(sql).toContain('then guarded.duplicate_rank else 1::bigint end duplicate_rank');
  });

  it('fails safely on orphan findings and enforces the finding-to-seed relationship', () => {
    expect(sql).toContain(
      'phase9 integrity migration refused: orphan finding lacks candidate seed',
    );
    expect(sql).toContain('phase9_findings_candidate_seed_fk');
    expect(sql).toContain('references public.phase9_candidate_seeds(');
    expect(sql).toContain('evaluation_run_id,candidate_hash,workspace_id');
  });

  it('serializes review and publication at the workspace/run boundary', () => {
    const lock = "'phase9-review-run-v1:'";
    expect(sql.match(new RegExp(lock, 'g'))?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain(
      'create or replace function public.enforce_phase9_review_decision_chain()',
    );
    expect(sql).toContain(
      'create function public.enforce_phase9_coverage_review_decision_chain_v1()',
    );
    expect(sql).toContain("v_latest_created_at + interval '1 microsecond'");
    expect(sql).toContain('new.created_at := greatest(');
    expect(sql).toContain('create or replace function public.publish_phase9_reviewed_findings(');
    const publication = sql.indexOf(
      'create or replace function public.publish_phase9_reviewed_findings(',
    );
    const publicationLock = sql.indexOf(lock, publication);
    const completionCheck = sql.indexOf(
      'public.assert_phase9_bridge_review_completion',
      publication,
    );
    const bridgeCall = sql.indexOf(
      'public.publish_phase9_reviewed_findings_unguarded',
      publication,
    );
    expect(publicationLock).toBeLessThan(completionCheck);
    expect(completionCheck).toBeLessThan(bridgeCall);
  });

  it('makes accelerated idempotency payload-aware and fail closed', () => {
    expect(sql).toContain('create function public.phase9_review_request_hash_v1');
    expect(sql).toContain("'phase9-accelerated-review-v2:'");
    expect(sql).toContain("'requesthash',v_request_hash");
    expect(sql).toContain("v_event.metadata ? 'requesthash'");
    expect(sql).toContain('accelerated finding review idempotency identity mismatch');
    expect(sql).toContain('accelerated coverage review idempotency identity mismatch');
    expect(sql).toContain('accelerated finding review result identity mismatch');
    expect(sql).toContain('accelerated coverage review result identity mismatch');
  });

  it('derives truthful routine, duplicate, or mixed batch activity lanes', () => {
    expect(sql).toContain('create function public.enforce_phase9_batch_activity_lane_v1()');
    expect(sql).toContain("v_lane := case when v_lane_count=1 then v_first_lane else 'mixed' end");
    expect(sql).toContain("and queue.review_lane not in ('routine','duplicate')");
    expect(sql).toContain('create trigger phase9_review_activity_batch_lane_v1');
  });

  it('keeps immutable Phase 9 populations free of migration-time rewrites', () => {
    expect(sql).not.toMatch(
      /\b(update|delete from|truncate)\s+public\.phase9_(findings|candidate_seeds|source_block_coverage|finding_review_decisions|coverage_review_decisions|bridge_runs|bridge_items)\b/,
    );
  });
});
