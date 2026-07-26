import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHASE9_WORKSPACE_PLAN_VERSION,
  buildPhase9WorkspaceProductionPlan,
  phase9StableHash,
  refinePhase9WorkspaceCandidates,
  type Phase9CandidateSeed,
} from '../../packages/ai/src';
import { classifyPhase9WorkspaceFailure } from '../../apps/worker/src/phase9-workspace-analysis';

const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const DOCUMENT = '10000000-0000-4000-8000-000000000002';
const HASH = 'a'.repeat(64);

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT,
    workspaceId: WORKSPACE,
    filename: 'Connecticut security services RFP.pdf',
    sourceHash: HASH,
    sourceFormat: 'pdf',
    documentType: 'primary_rfp',
    pages: [
      {
        pageNumber: 1,
        text: 'The contractor must submit Form CT-1 by August 12, 2027.',
        parserConfidence: 1,
        parserState: 'native' as const,
      },
      {
        pageNumber: 2,
        text: 'This page contains background about physical security operations.',
        parserConfidence: 1,
        parserState: 'native' as const,
      },
    ],
    ...overrides,
  };
}

function candidate(
  id: string,
  requirementType: Phase9CandidateSeed['requirementType'],
  obligationText: string,
): Phase9CandidateSeed {
  return {
    id: id.repeat(64),
    sourceBlockIds: ['f'.repeat(64)],
    documentId: DOCUMENT,
    requirementType,
    obligationText,
    evidenceText: obligationText,
    subject: null,
    action: null,
    condition: null,
    dateValue: null,
    numberValue: null,
    unit: null,
    formReference: null,
    deterministicSignals: ['shall'],
    discoveryRoute: 'deterministic',
    needsVerification: true,
    minerVersion: 'phase9-deterministic-miner-v1',
  };
}

describe('jurisdiction-neutral Phase 9 workspace planning', () => {
  it('builds the same versioned source plan without jurisdiction-specific input', () => {
    const plan = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [document()],
    });
    expect(plan.version).toBe(PHASE9_WORKSPACE_PLAN_VERSION);
    expect(plan.documents).toEqual([
      expect.objectContaining({ id: DOCUMENT, filename: expect.stringContaining('Connecticut') }),
    ]);
    expect(plan.coverage).toHaveLength(plan.blocks.length);
    expect(
      plan.reduction.candidates.some((candidate) => candidate.formReference === 'Form CT-1'),
    ).toBe(true);
    expect(plan.callPlan.sourcePackageHash).toBe(plan.sourcePackageHash);
  });

  it('binds source text and selected documents into stable hashes', () => {
    const first = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [document()],
    });
    const repeat = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [document()],
    });
    const changed = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [
        document({
          pages: [
            {
              pageNumber: 1,
              text: 'The contractor must submit Form CT-2 by August 12, 2027.',
              parserConfidence: 1,
              parserState: 'native',
            },
          ],
        }),
      ],
    });
    expect(repeat.documentSetHash).toBe(first.documentSetHash);
    expect(repeat.sourcePackageHash).toBe(first.sourcePackageHash);
    expect(changed.documentSetHash).not.toBe(first.documentSetHash);
    expect(first.documentSetHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate and cross-workspace documents before any call plan is usable', () => {
    expect(() =>
      buildPhase9WorkspaceProductionPlan({
        workspaceId: WORKSPACE,
        documents: [document(), document()],
      }),
    ).toThrow('phase9_workspace_plan_duplicate_document');
    expect(() =>
      buildPhase9WorkspaceProductionPlan({
        workspaceId: WORKSPACE,
        documents: [document({ workspaceId: '20000000-0000-4000-8000-000000000002' })],
      }),
    ).toThrow('phase9_workspace_plan_cross_workspace_document');
  });

  it('removes invalid NUL bytes deterministically and uses valid cache only as plan input', () => {
    const original = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [
        document({
          pages: [
            {
              pageNumber: 1,
              text: 'Bidder\u0000 must submit Form NJ-4.',
              parserConfidence: 1,
              parserState: 'native',
            },
          ],
        }),
      ],
    });
    expect(original.blocks.every((block) => !block.text.includes('\u0000'))).toBe(true);
    const cached = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [
        document({
          pages: [
            {
              pageNumber: 1,
              text: 'Bidder\u0000 must submit Form NJ-4.',
              parserConfidence: 1,
              parserState: 'native',
            },
          ],
        }),
      ],
      cachedKeys: new Set(original.callPlan.tasks.map((task) => task.cacheKey)),
    });
    expect(cached.callPlan.hardMaximumUsd).toBe(0);
    expect(phase9StableHash(cached.documents)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps expected answers out of production planner and worker sources', () => {
    for (const path of [
      'packages/ai/src/phase9-workspace-plan.ts',
      'apps/worker/src/phase9-workspace-analysis.ts',
    ]) {
      const source = readFileSync(resolve(path), 'utf8');
      expect(source).not.toMatch(/known[-_ ]answers|fixture answers/i);
    }
  });

  it('rejects New Jersey-shaped table-of-contents, descriptive, and incomplete noise', () => {
    const refinement = refinePhase9WorkspaceCandidates([
      candidate(
        '1',
        'evaluation',
        '3.4 EVALUATION OF THE BID PROPOSALS ................................................',
      ),
      candidate('2', 'signature', 'The bill was signed by the Governor on January 12, 2006.'),
      candidate(
        '3',
        'deadline',
        'The armed security term contract is presently due to expire on February 29, 2008.',
      ),
      candidate('4', 'insurance', 'Insurance coverage shall be in'),
      candidate('5', 'other', 'The contractor must substantiate'),
      candidate('6', 'meeting', 'Mandatory Pre-bid Conference Not Applicable'),
    ]);
    expect(refinement.candidates).toHaveLength(0);
    expect(refinement.rejected.map((item) => item.reason)).toEqual([
      'table_of_contents_or_navigation',
      'historical_or_descriptive',
      'no_explicit_obligation',
      'incomplete_fragment',
      'incomplete_fragment',
      'not_applicable',
    ]);
  });

  it('keeps complete obligations and assigns categories from material meaning', () => {
    const refinement = refinePhase9WorkspaceCandidates([
      candidate('1', 'other', 'Bid Submission Due Date is March 7, 2008 at 2:00 PM.'),
      candidate(
        '2',
        'license',
        'The armed guard shall permit only duly authorized persons to enter the premises.',
      ),
      candidate(
        '3',
        'other',
        'The bidder must provide proof of a valid New Jersey Detective Agency Permit with the bid proposal.',
      ),
      candidate(
        '4',
        'other',
        'The Signatory page shall be signed by an authorized representative of the bidder.',
      ),
      candidate(
        '5',
        'insurance',
        'The contractor shall provide current certificates of insurance naming the State as an Additional Insured.',
      ),
      candidate(
        '6',
        'deadline',
        'Mandatory Pre-bid Conference Not Applicable. Bid Submission Due Date is March 7, 2008 at 2:00 PM.',
      ),
    ]);
    expect(refinement.candidates.map((item) => item.requirementType)).toEqual([
      'deadline',
      'staffing',
      'license',
      'signature',
      'insurance',
      'deadline',
    ]);
    expect(refinement.rejected).toHaveLength(0);
    expect(refinement.reclassified).toHaveLength(4);
  });

  it('does not promote descriptive dates or keyword-only labels in a complete plan', () => {
    const plan = buildPhase9WorkspaceProductionPlan({
      workspaceId: WORKSPACE,
      documents: [
        document({
          pages: [
            {
              pageNumber: 1,
              text: [
                'Request for Proposal.',
                'Bid Submission Due Date is March 7, 2008 at 2:00 PM.',
                'The current contract is presently due to expire on February 29, 2008.',
                '3.4 EVALUATION OF BID PROPOSALS .......................... 30',
                'The bidder must submit the Signatory Form with the bid proposal.',
              ].join(' '),
              parserConfidence: 1,
              parserState: 'native',
            },
          ],
        }),
      ],
    });
    expect(
      plan.reduction.candidates.some((item) => item.obligationText.includes('March 7, 2008')),
    ).toBe(true);
    expect(
      plan.reduction.candidates.some((item) => item.obligationText.includes('February 29, 2008')),
    ).toBe(false);
    expect(
      plan.reduction.candidates.some((item) =>
        item.obligationText.includes('EVALUATION OF BID PROPOSALS'),
      ),
    ).toBe(false);
    expect(plan.refinement.version).toBe('phase9-workspace-candidate-refinement-v1');
  });
});

describe('Phase 9 general-live migration', () => {
  const sql = readFileSync(
    resolve('supabase/migrations/20260726000028_phase9_general_workspace_live.sql'),
    'utf8',
  );

  it('adds explicit document bindings, workspace policy, RLS, and immutable history', () => {
    expect(sql).toContain('workspace_live');
    expect(sql).toContain('public.phase9_evaluation_documents');
    expect(sql).toContain('public.phase9_live_budget_policies');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('public.is_workspace_member(workspace_id)');
    expect(sql).toContain('phase9_evaluation_documents_immutable');
  });

  it('keeps provider reservation service-only and enforces exact per-run and monthly limits', () => {
    expect(sql).toContain('phase9 workspace live analysis disabled');
    expect(sql).toContain('phase9 workspace per-run budget exceeded');
    expect(sql).toContain('phase9 workspace monthly budget exceeded');
    expect(sql).toContain('phase9 exact call plan required');
    expect(sql).toContain("auth.role()),'') <> 'service_role'");
    expect(sql).toContain('revoke all on function public.reserve_phase9_call_plan');
  });
});

describe('Phase 9 workspace failure normalization', () => {
  it('does not persist raw provider quota or rate-limit messages', () => {
    expect(
      classifyPhase9WorkspaceFailure(
        new Error('429 You exceeded your current quota, please check billing'),
      ),
    ).toBe('provider_quota_exceeded');
    expect(classifyPhase9WorkspaceFailure(new Error('429 rate limit exceeded'))).toBe(
      'provider_rate_limited',
    );
    expect(classifyPhase9WorkspaceFailure(new Error('request timed out'))).toBe('provider_timeout');
  });
});
