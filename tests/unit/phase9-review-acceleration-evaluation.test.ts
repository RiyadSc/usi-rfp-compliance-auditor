import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHASE9_NJ_IMMUTABLE_SOURCE,
  evaluatePhase9NewJerseyReviewAcceleration,
  phase9NjReviewSnapshotSchema,
} from '../../scripts/lib/phase9-review-acceleration-evaluator';

const snapshot = JSON.parse(
  readFileSync('fixtures/eval/phase9-review-acceleration-new-jersey-v1.json', 'utf8'),
) as unknown;

describe('New Jersey Phase 9 review-acceleration evaluation', () => {
  it('binds to the immutable corrected public run and conserves every finding', () => {
    const result = evaluatePhase9NewJerseyReviewAcceleration(snapshot);
    expect(result.source).toMatchObject({
      workspaceId: PHASE9_NJ_IMMUTABLE_SOURCE.workspaceId,
      evaluationRunId: PHASE9_NJ_IMMUTABLE_SOURCE.evaluationRunId,
      sourcePackageHash: PHASE9_NJ_IMMUTABLE_SOURCE.sourcePackageHash,
      expectedAnswersUsed: false,
    });
    expect(result.population).toMatchObject({
      totalFindings: 329,
      representedFindings: 329,
      everyOriginalFindingRepresented: true,
      exactlyOneLanePerFinding: true,
    });
    expect(Object.values(result.lanes).reduce((sum, count) => sum + count, 0)).toBe(329);
    expect(result.safety.excludedFindings).toBe(0);
  });

  it('keeps both official operational deadlines in the critical lane', () => {
    const result = evaluatePhase9NewJerseyReviewAcceleration(snapshot);
    expect(result.critical.officialQuestionDeadlineCritical).toBe(true);
    expect(result.critical.officialSubmissionDeadlineCritical).toBe(true);
    expect(result.critical.byCategory.question_deadline).toBeGreaterThan(0);
    expect(result.critical.byCategory.submission_deadline).toBeGreaterThan(0);
  });

  it('reduces individual interactions without batching critical or exception findings', () => {
    const result = evaluatePhase9NewJerseyReviewAcceleration(snapshot);
    expect(result.acceleratedReview.zeroCriticalBatchAcceptEligible).toBe(true);
    expect(result.acceleratedReview.zeroExceptionBatchAcceptEligible).toBe(true);
    expect(result.acceleratedReview.batchEligibleRoutineFindings).toBe(result.lanes.routine);
    expect(result.acceleratedReview.estimatedFindingInteractionsAfter).toBeLessThan(
      result.acceleratedReview.estimatedFindingInteractionsBefore,
    );
    expect(result.acceleratedReview.unchangedCoverageExceptionInteractions).toBe(38);
    expect(result.safety.publicationRulesUnchanged).toBe(true);
    expect(result.safety.machineAcceptanceIntroduced).toBe(false);
  });

  it('records zero provider use and makes no unsupported precision or recall claim', () => {
    const result = evaluatePhase9NewJerseyReviewAcceleration(snapshot);
    expect(result.safety).toMatchObject({
      providerCalls: 0,
      providerSpendUsd: 0,
      precisionRecallClaimed: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/\"(?:precision|recall)\":/i);
  });

  it('rejects candidate-population drift instead of silently changing the denominator', () => {
    const parsed = phase9NjReviewSnapshotSchema.parse(snapshot);
    expect(() =>
      phase9NjReviewSnapshotSchema.parse({
        ...parsed,
        findings: parsed.findings.slice(1),
      }),
    ).toThrow();
    expect(() =>
      phase9NjReviewSnapshotSchema.parse({
        ...parsed,
        originalCandidateSetHash: '0'.repeat(64),
      }),
    ).toThrow(/population hash/i);
  });
});
