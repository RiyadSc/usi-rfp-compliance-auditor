import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260728000033_phase9_review_acceleration.sql'),
  'utf8',
);

describe('Phase 9 review acceleration migration contract', () => {
  it('adds only workspace-scoped review, activity, and tour state', () => {
    expect(migration).toContain('create table public.phase9_review_batch_operations');
    expect(migration).toContain('create table public.phase9_review_activity_events');
    expect(migration).toContain('create table public.guided_tour_states');
    expect(migration).toContain(
      'foreign key(evaluation_run_id,workspace_id)\n' +
        '    references public.phase9_evaluation_runs(id,workspace_id) on delete restrict',
    );
    expect(migration).not.toMatch(/\bdrop table\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(
      /create or replace function public\.publish_phase9_reviewed_findings\(/i,
    );
  });

  it('keeps batch and activity history append-only and member-readable only', () => {
    for (const table of ['phase9_review_batch_operations', 'phase9_review_activity_events']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`on public.${table} for select to authenticated`);
    }
    expect(migration).toContain('phase9_review_batch_operations_immutable');
    expect(migration).toContain('phase9_review_activity_events_immutable');
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+public\.phase9_review_(batch_operations|activity_events)/i,
    );
  });

  it('implements one atomic, idempotent batch with one append-only decision per finding', () => {
    expect(migration).toContain('create or replace function public.record_phase9_review_batch');
    expect(migration).toContain('unique(workspace_id,evaluation_run_id,idempotency_key)');
    expect(migration).toContain('batch idempotency identity mismatch');
    expect(migration).toContain('batch selection is stale or contains an ineligible finding');
    expect(migration).toMatch(/foreach v_hash in array p_candidate_hashes loop/i);
    expect(migration).toContain(
      "'phase9-finding-review-v1',v_batch_id,'phase9-batch-review-policy-v1'",
    );
    expect(migration).toContain('phase9 review selection is stale');
    expect(migration).toContain('perform pg_advisory_xact_lock');
  });

  it('never permits critical or exception findings through any batch decision path', () => {
    expect(migration).toContain("when p_action='accept_routine' then q.batch_accept_eligible");
    expect(migration).toContain(
      "when p_action='reject_duplicate' then q.batch_duplicate_reject_eligible",
    );
    expect(migration).toContain("else q.review_lane in ('routine','duplicate')");
  });

  it('requires privacy-safe, idempotent activity session identities', () => {
    expect(migration).toContain('p_review_session_id uuid');
    expect(migration).toContain('p_idempotency_key uuid');
    expect(migration).toMatch(
      /insert into public\.phase9_review_activity_events\([\s\S]*review_session_id,idempotency_key/,
    );
    expect(migration).toContain(
      "'lane','decision','selectionCount','result','source','remainingWork'",
    );
    expect(migration).toContain(
      "jsonb_typeof(entry.value) not in ('string','number','boolean','null')",
    );
    expect(migration).toContain('review activity finding is outside the workspace run');
    expect(migration).toContain('review activity source is outside the workspace run');
    expect(migration).toContain('review activity batch is outside the workspace run');
    expect(migration).toContain('review activity idempotency identity mismatch');
  });

  it('isolates persisted guided-tour completion by user, workspace, tour, and version', () => {
    expect(migration).toContain('unique(user_id,workspace_id,tour_id,tour_version)');
    expect(migration).toContain('user_id=(select auth.uid())');
    expect(migration).toContain('create or replace function public.save_guided_tour_state');
    expect(migration).toContain("p_tour_version<>'guided-product-tour-v1'");
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+public\.guided_tour_states/i,
    );
  });

  it('keeps review-queue reads bounded and authorization server-owned', () => {
    expect(migration).toContain('with (security_invoker=true)');
    expect(migration).toContain('p_page_size not between 1 and 50');
    expect(migration).toContain('authorized workspace member required');
    expect(migration).toContain('q.latest_decision_id is null');
    expect(migration).toContain("'phase9-review-priority-v1'");
    expect(migration).toContain("'phase9-batch-review-policy-v1'");
  });
});
