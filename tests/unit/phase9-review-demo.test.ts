import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHASE8_DEMO_CANDIDATES,
  PHASE8_SOURCE_PAGES,
  PHASE9_REVIEW_DEMO_EXPECTED,
  PHASE9_REVIEW_DEMO_FINDINGS,
  PHASE9_REVIEW_DEMO_MARKER,
  PHASE9_REVIEW_DEMO_SEEDS,
  PHASE9_REVIEW_DEMO_SOURCE_BLOCKS,
  PHASE9_REVIEW_CANDIDATE_SET_HASH,
  PHASE9_REVIEW_DOCUMENT_SET_HASH,
  PHASE9_REVIEW_EXPECTED_ANSWER_HASH,
  PHASE9_REVIEW_SOURCE_PACKAGE_HASH,
  PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH,
} from '../../scripts/lib/phase8-prepared-demo';

const migration = readFileSync(
  resolve('supabase/migrations/20260728000034_phase9_review_demo_scope.sql'),
  'utf8',
);
const resetScript = readFileSync(resolve('scripts/reset-phase8-demo.mts'), 'utf8');

describe('prepared Phase 9 review-acceleration demo', () => {
  it('has one immutable, provider-free complete source population', () => {
    expect(PHASE8_DEMO_CANDIDATES).toHaveLength(24);
    expect(PHASE9_REVIEW_DEMO_FINDINGS).toHaveLength(PHASE9_REVIEW_DEMO_EXPECTED.findings);
    expect(PHASE9_REVIEW_DEMO_SEEDS).toHaveLength(PHASE9_REVIEW_DEMO_EXPECTED.candidateSeeds);
    expect(PHASE9_REVIEW_DEMO_SOURCE_BLOCKS).toHaveLength(PHASE9_REVIEW_DEMO_EXPECTED.sourceBlocks);
    expect(PHASE9_REVIEW_DEMO_SOURCE_BLOCKS).toHaveLength(PHASE8_SOURCE_PAGES.length);
    expect(PHASE9_REVIEW_DEMO_EXPECTED.providerCalls).toBe(0);
    expect(PHASE9_REVIEW_DEMO_EXPECTED.providerSpendUsd).toBe(0);
    for (const hash of [
      PHASE9_REVIEW_SOURCE_PACKAGE_HASH,
      PHASE9_REVIEW_EXPECTED_ANSWER_HASH,
      PHASE9_REVIEW_DOCUMENT_SET_HASH,
      PHASE9_REVIEW_CANDIDATE_SET_HASH,
      PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH,
    ])
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retains exact evidence, exception examples, and one explained duplicate pair', () => {
    const blocks = new Set(PHASE9_REVIEW_DEMO_SOURCE_BLOCKS.map((block) => block.blockHash));
    expect(blocks.size).toBe(PHASE9_REVIEW_DEMO_SOURCE_BLOCKS.length);
    for (const finding of PHASE9_REVIEW_DEMO_FINDINGS) {
      expect(finding.sourceBlockHashes).toHaveLength(1);
      expect(blocks.has(finding.sourceBlockHashes[0]!)).toBe(true);
    }
    expect(
      PHASE9_REVIEW_DEMO_FINDINGS.filter((finding) => finding.sourceSupportStatus !== 'supported')
        .length,
    ).toBeGreaterThan(0);
    expect(
      PHASE9_REVIEW_DEMO_FINDINGS.filter((finding) => finding.precedenceStatus !== 'active').length,
    ).toBeGreaterThan(0);

    const duplicate = PHASE9_REVIEW_DEMO_FINDINGS.at(-1)!;
    const matches = PHASE9_REVIEW_DEMO_FINDINGS.filter(
      (finding) =>
        finding.obligationText === duplicate.obligationText &&
        finding.evidenceText === duplicate.evidenceText &&
        finding.requirementType === duplicate.requirementType &&
        JSON.stringify(finding.materialFacts) === JSON.stringify(duplicate.materialFacts),
    );
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((finding) => finding.candidateHash)).size).toBe(2);
  });

  it('has the expected unresolved page-coverage examples without omitting a page', () => {
    const findingHashes = new Set(
      PHASE9_REVIEW_DEMO_FINDINGS.flatMap((finding) => finding.sourceBlockHashes),
    );
    const findingCandidates = new Set(
      PHASE9_REVIEW_DEMO_FINDINGS.map((finding) => finding.candidateHash),
    );
    const exceptionBlocks = PHASE9_REVIEW_DEMO_SOURCE_BLOCKS.filter((block) => {
      const unassessedSeed = PHASE9_REVIEW_DEMO_SEEDS.some(
        (seed) =>
          seed.sourceBlockHashes.includes(block.blockHash) &&
          !findingCandidates.has(seed.candidateHash),
      );
      const highRiskWithoutFinding =
        block.deterministicSignals.some((signal) =>
          ['deadline', 'form_identifier', 'use_attachment', 'signature'].includes(signal),
        ) && !findingHashes.has(block.blockHash);
      return block.route === 'parser_uncertain' || unassessedSeed || highRiskWithoutFinding;
    });
    expect(exceptionBlocks).toHaveLength(PHASE9_REVIEW_DEMO_EXPECTED.coverageExceptions);
    expect(exceptionBlocks.map((block) => block.pageNumber)).toEqual([2, 12, 15]);
  });

  it('creates an immutable scoped template and service-owned deterministic reset', () => {
    expect(migration).toContain('create table public.phase9_review_demo_scopes');
    expect(migration).toContain('create table public.phase9_review_demo_states');
    expect(migration).toContain(`check (synthetic_marker='${PHASE9_REVIEW_DEMO_MARKER}')`);
    expect(migration).toContain('phase9_review_demo_scopes_immutable');
    expect(migration).toContain('phase9_review_demo_scopes_validate');
    expect(migration).toContain('prepared phase9 review candidate population mismatch');
    expect(migration).toContain('prepared phase9 review source population mismatch');
    expect(migration).toContain('prepared phase9 review provenance is incomplete');
    expect(migration).toContain('on delete restrict');
    expect(migration).not.toMatch(/\bdrop table\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).toContain("coalesce((select auth.role()),'') <> 'service_role'");
    expect(migration).toContain('prepared demo identity binding mismatch');
    expect(migration).toContain(
      'grant execute on function public.reset_phase9_review_demo(uuid,uuid,uuid)',
    );
    expect(migration).toContain('to service_role');
    expect(migration).toContain(
      'alter table public.phase9_review_demo_scopes enable row level security',
    );
    expect(migration).toContain(
      'alter table public.phase9_review_demo_states enable row level security',
    );
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+public\.phase9_review_demo_/i,
    );
    expect(migration).toContain('provider_call_count=0');
    expect(migration).toContain('delete from public.guided_tour_states');
  });

  it('copies immutable source, seed, and finding rows without provider artifacts', () => {
    for (const table of [
      'phase9_evaluation_documents',
      'phase9_source_block_coverage',
      'phase9_candidate_seeds',
      'phase9_findings',
    ])
      expect(migration).toContain(`insert into public.${table}`);
    expect(migration).not.toContain('insert into public.phase9_provider_usage');
    expect(migration).not.toContain('insert into public.phase9_call_plans');
  });

  it('resets the review demo only for an explicit execute request and records zero spend', () => {
    expect(resetScript).toContain("const execute = process.argv.includes('--execute')");
    expect(resetScript).toMatch(
      /if \(execute\) \{[\s\S]*admin\.rpc\([\s\S]*'reset_phase9_review_demo'/,
    );
    expect(resetScript).toContain('p_actor_id: scope.authorized_identity_id');
    expect(resetScript).toContain('providerCalls: 0');
    expect(resetScript).toContain('providerSpendUsd: 0');
  });
});
