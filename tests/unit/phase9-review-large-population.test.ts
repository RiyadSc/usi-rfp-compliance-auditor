import { describe, expect, it } from 'vitest';
import {
  assignPhase9ReviewLane,
  evaluatePhase9BatchEligibility,
  groupPhase9DeterministicDuplicates,
  type Phase9ReviewFinding,
} from '@usi/domain';
import {
  PHASE9_REVIEW_LARGE_PAGE_LIMIT,
  PHASE9_REVIEW_LARGE_POPULATION_SIZE,
  buildPhase9LargeReviewFixture,
  pagePhase9LargeReviewFixture,
} from '../../fixtures/eval/phase9-review-large-population';

function attachDuplicateRelationships(findings: Phase9ReviewFinding[]): Phase9ReviewFinding[] {
  const duplicateOf = new Map<string, string>();
  for (const group of groupPhase9DeterministicDuplicates(findings))
    for (const hash of group.candidateHashes)
      if (hash !== group.canonicalCandidateHash)
        duplicateOf.set(hash, group.canonicalCandidateHash);
  return findings.map((finding) => ({
    ...finding,
    duplicateOfCandidateHash: duplicateOf.get(finding.candidateHash) ?? null,
  }));
}

describe('Phase 9 1,024-finding deterministic review fixture', () => {
  it('is stable, unique, and assigns exactly one lane to every record', () => {
    const first = attachDuplicateRelationships(buildPhase9LargeReviewFixture());
    const second = attachDuplicateRelationships(buildPhase9LargeReviewFixture());
    expect(first).toEqual(second);
    expect(first).toHaveLength(PHASE9_REVIEW_LARGE_POPULATION_SIZE);
    expect(new Set(first.map((finding) => finding.candidateHash))).toHaveLength(
      PHASE9_REVIEW_LARGE_POPULATION_SIZE,
    );
    const lanes = first.map((finding) => assignPhase9ReviewLane(finding).lane);
    expect(lanes).toHaveLength(PHASE9_REVIEW_LARGE_POPULATION_SIZE);
    expect(lanes.filter((lane) => lane === 'critical')).toHaveLength(128);
    expect(lanes.filter((lane) => lane === 'exception')).toHaveLength(65);
    expect(lanes.filter((lane) => lane === 'duplicate')).toHaveLength(32);
    expect(lanes.filter((lane) => lane === 'routine')).toHaveLength(799);
  });

  it('groups only exact deterministic pairs and never conflicts or precedence variants', () => {
    const findings = buildPhase9LargeReviewFixture();
    const groups = groupPhase9DeterministicDuplicates(findings);
    expect(groups).toHaveLength(32);
    expect(groups.every((group) => group.candidateHashes.length === 2)).toBe(true);
    for (const index of [256, 257, 258, 259])
      expect(
        groups.some((group) => group.candidateHashes.includes(findings[index]!.candidateHash)),
      ).toBe(false);
  });

  it('never batch-accepts critical or exception records at large-population scale', () => {
    const findings = attachDuplicateRelationships(buildPhase9LargeReviewFixture());
    for (const finding of findings) {
      const lane = assignPhase9ReviewLane(finding).lane;
      const eligibility = evaluatePhase9BatchEligibility(finding, 'accept_routine');
      if (lane === 'critical' || lane === 'exception') expect(eligibility.eligible).toBe(false);
      if (lane === 'routine') expect(eligibility.eligible).toBe(true);
    }
  });

  it('uses bounded stable cursor pages without omission or duplication', () => {
    const findings = buildPhase9LargeReviewFixture();
    const collected: string[] = [];
    let cursor = null;
    do {
      const page = pagePhase9LargeReviewFixture(findings, {
        cursor,
        limit: PHASE9_REVIEW_LARGE_PAGE_LIMIT,
      });
      expect(page.rows.length).toBeLessThanOrEqual(PHASE9_REVIEW_LARGE_PAGE_LIMIT);
      collected.push(...page.rows.map((finding) => finding.candidateHash));
      cursor = page.nextCursor;
    } while (cursor);
    expect(collected).toHaveLength(PHASE9_REVIEW_LARGE_POPULATION_SIZE);
    expect(new Set(collected)).toHaveLength(PHASE9_REVIEW_LARGE_POPULATION_SIZE);
    expect(() =>
      pagePhase9LargeReviewFixture(findings, {
        limit: PHASE9_REVIEW_LARGE_PAGE_LIMIT + 1,
      }),
    ).toThrow('phase9_review_fixture_page_limit_invalid');
  });
});
