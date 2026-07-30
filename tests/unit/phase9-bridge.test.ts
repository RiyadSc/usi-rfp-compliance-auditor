import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHASE9_BRIDGE_VERSION,
  evaluatePhase9Promotion,
  mapPhase9RequirementCategory,
  phase9BridgeInputHash,
  phase9CoverageReviewInputSchema,
  phase9EvidenceMatch,
  summarizePhase9Coverage,
} from '../../packages/domain/src';

describe('Phase 9 reviewed bridge', () => {
  it('publishes only accepted supported active findings with validated page evidence', () => {
    const base = {
      sourceSupportStatus: 'supported' as const,
      precedenceStatus: 'active' as const,
      proofRequirement: 'none_identified' as const,
      machineOnly: true as const,
      reviewDecision: 'accepted' as const,
      evidenceCount: 1,
      pageReferencesComplete: true,
      quoteMatchType: 'exact' as const,
    };
    expect(evaluatePhase9Promotion(base)).toEqual({
      eligible: true,
      reason: 'accepted_supported_active_with_valid_evidence',
    });
    expect(evaluatePhase9Promotion({ ...base, reviewDecision: null })).toEqual({
      eligible: false,
      reason: 'human_review_required',
    });
    expect(
      evaluatePhase9Promotion({ ...base, sourceSupportStatus: 'partially_supported' }),
    ).toEqual({ eligible: false, reason: 'source_not_supported' });
    expect(evaluatePhase9Promotion({ ...base, precedenceStatus: 'conflicting' })).toEqual({
      eligible: false,
      reason: 'precedence_not_active',
    });
    expect(evaluatePhase9Promotion({ ...base, quoteMatchType: 'not_found' })).toEqual({
      eligible: false,
      reason: 'quote_not_validated',
    });
  });

  it('validates exact and normalized-exact evidence without fuzzy promotion', () => {
    expect(phase9EvidenceMatch('Submit Form A-1.', 'Submit Form A-1.')).toBe('exact');
    expect(phase9EvidenceMatch('Submit   Form A-1.', 'Submit Form A-1.')).toBe('normalized_exact');
    expect(phase9EvidenceMatch('Submit Form B-2.', 'Submit Form A-1.')).toBe('not_found');
  });

  it('requires an explicit reason when a page exception remains unresolved', () => {
    const base = {
      workspaceId: '10000000-0000-4000-8000-000000000001',
      evaluationRunId: '10000000-0000-4000-8000-000000000002',
      documentId: '10000000-0000-4000-8000-000000000003',
      pageNumber: 7,
    };
    expect(
      phase9CoverageReviewInputSchema.safeParse({
        ...base,
        decision: 'accepted',
      }).success,
    ).toBe(true);
    expect(
      phase9CoverageReviewInputSchema.safeParse({
        ...base,
        decision: 'needs_follow_up',
        note: '',
      }).success,
    ).toBe(false);
  });

  it('accounts for every page and fails the completeness checkpoint on exceptions', () => {
    const summary = summarizePhase9Coverage({
      expectedPages: [
        { documentId: 'doc-1', pageNumber: 1 },
        { documentId: 'doc-1', pageNumber: 2 },
        { documentId: 'doc-1', pageNumber: 3 },
        { documentId: 'doc-1', pageNumber: 4 },
      ],
      pages: [
        {
          documentId: 'doc-1',
          pageNumber: 1,
          route: 'selected_for_ai_extraction',
          parserUncertain: false,
          hasFinding: true,
          hasSeedWithoutFinding: false,
          hasFormSignal: true,
          hasDeadlineSignal: false,
        },
        {
          documentId: 'doc-1',
          pageNumber: 2,
          route: 'reviewed_and_rejected_as_non_requirement',
          parserUncertain: false,
          hasFinding: false,
          hasSeedWithoutFinding: false,
          hasFormSignal: false,
          hasDeadlineSignal: false,
        },
        {
          documentId: 'doc-1',
          pageNumber: 3,
          route: 'parser_uncertain',
          parserUncertain: true,
          hasFinding: false,
          hasSeedWithoutFinding: false,
          hasFormSignal: false,
          hasDeadlineSignal: false,
        },
      ],
    });
    expect(summary).toMatchObject({
      totalPages: 4,
      reviewedPages: 3,
      requirementPages: 1,
      noRequirementPages: 1,
      parserUncertainPages: 1,
      unexaminedPages: 1,
      exceptionPages: 2,
      complete: false,
    });
  });

  it('maps material requirement meaning into the stable checklist vocabulary', () => {
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'form',
        obligationText: 'The bidder shall submit the Cost Sheet.',
        formReference: 'Cost Sheet',
      }),
    ).toBe('pricing_form');
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'deadline',
        obligationText: 'Questions are due by 5:00 PM.',
      }),
    ).toBe('question_deadline');
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'insurance',
        obligationText: 'Maintain $3 million aggregate liability insurance.',
      }),
    ).toBe('insurance');
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'other',
        obligationText: 'Acknowledge Addendum 2 with the response.',
      }),
    ).toBe('addendum_acknowledgment');
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'other',
        obligationText: 'Upload one electronic PDF through the procurement portal.',
      }),
    ).toBe('electronic_submission');
    expect(
      mapPhase9RequirementCategory({
        requirementType: 'other',
        obligationText: 'List and identify every proposed subcontractor.',
      }),
    ).toBe('subcontractor_disclosure');
  });

  it('binds the immutable decisions and source run into a stable bridge hash', () => {
    const first = phase9BridgeInputHash({
      evaluationRunId: '10000000-0000-4000-8000-000000000001',
      reviewDecisionIds: [
        '10000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000002',
      ],
      candidateHashes: ['b'.repeat(64), 'a'.repeat(64)],
    });
    const repeat = phase9BridgeInputHash({
      evaluationRunId: '10000000-0000-4000-8000-000000000001',
      reviewDecisionIds: [
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
      ],
      candidateHashes: ['a'.repeat(64), 'b'.repeat(64)],
    });
    expect(first).toBe(repeat);
    expect(PHASE9_BRIDGE_VERSION).toBe('phase9-reviewed-bridge-v1');
  });

  it('keeps the migration append-only, RLS-scoped, and fail-closed', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/20260727000029_phase9_reviewed_bridge.sql'),
      'utf8',
    );
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('phase9_finding_review_decisions_immutable');
    expect(sql).toContain('workspace owner required to publish requirements');
    expect(sql).toContain("source_support_status='supported'");
    expect(sql).toContain("precedence_status='active'");
    expect(sql).toContain('published phase9 evidence quote not found');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*authenticated/i);
    const coverageSql = readFileSync(
      resolve('supabase/migrations/20260727000031_phase9_coverage_exception_reviews.sql'),
      'utf8',
    );
    expect(coverageSql).toContain('phase9_coverage_review_decisions_immutable');
    expect(coverageSql).toContain(
      'all phase9 coverage exceptions require a team decision before publication',
    );
    expect(coverageSql).toContain("c.route='parser_uncertain'");
    expect(coverageSql).not.toMatch(/grant\s+(insert|update|delete).*authenticated/i);
    const reuseSql = readFileSync(
      resolve('supabase/migrations/20260727000032_phase9_bridge_reuse_guard.sql'),
      'utf8',
    );
    expect(reuseSql).toContain('assert_phase9_bridge_review_completion');
    expect(reuseSql).toContain('publish_phase9_reviewed_findings_unguarded');
    expect(reuseSql).toContain('phase9 coverage follow-up decisions must be resolved');
  });
});
