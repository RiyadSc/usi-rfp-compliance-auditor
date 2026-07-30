import { describe, expect, it } from 'vitest';
import {
  GUIDED_PRODUCT_TOUR_VERSION,
  assignPhase9ReviewLane,
  estimatePhase9ReviewEffort,
  evaluatePhase9BatchEligibility,
  groupPhase9DeterministicDuplicates,
  guidedTourDefinitionSchema,
  phase9ReviewFindingSchema,
  transitionGuidedTourState,
  type Phase9ReviewFinding,
} from '@usi/domain';

const hash = (value: number) => value.toString(16).padStart(64, '0');
const documentId = '10000000-0000-4000-8000-000000000001';

function finding(overrides: Partial<Phase9ReviewFinding> = {}): Phase9ReviewFinding {
  return {
    candidateHash: hash(1),
    sourceSupportStatus: 'supported',
    precedenceStatus: 'active',
    category: 'technical_response',
    requirementType: 'technical',
    obligationText: 'Describe the transition approach.',
    evidenceText: 'The bidder shall describe the transition approach.',
    evidenceCount: 1,
    pageReferencesComplete: true,
    quoteMatchType: 'exact',
    ambiguityCode: null,
    parserUncertain: false,
    unresolvedCoverageException: false,
    machineOnly: true,
    duplicateOfCandidateHash: null,
    humanDecision: null,
    mandatoryClass: 'mandatory',
    sourceDocumentId: documentId,
    sourcePage: 8,
    sourceOrder: 8,
    deadlineIso: null,
    formReference: null,
    materialFacts: {},
    sourceBlockHashes: ['block-1'],
    ...overrides,
  };
}

describe('Phase 9 review prioritization', () => {
  it('assigns every lane and preserves exception-first precedence', () => {
    expect(assignPhase9ReviewLane(finding()).lane).toBe('routine');
    expect(assignPhase9ReviewLane(finding({ category: 'mandatory_form' })).lane).toBe('critical');
    expect(
      assignPhase9ReviewLane(
        finding({ category: 'mandatory_form', sourceSupportStatus: 'partially_supported' }),
      ).lane,
    ).toBe('exception');
    expect(assignPhase9ReviewLane(finding({ duplicateOfCandidateHash: hash(2) })).lane).toBe(
      'duplicate',
    );
  });

  it.each([
    { sourceSupportStatus: 'unsupported' as const },
    { precedenceStatus: 'superseded' as const },
    { evidenceCount: 0 },
    { pageReferencesComplete: false },
    { quoteMatchType: 'not_found' as const },
    { ambiguityCode: 'ambiguous_scope' },
    { parserUncertain: true },
    { unresolvedCoverageException: true },
    { machineOnly: false },
  ])('fails $sourceSupportStatus $precedenceStatus evidence into exception', (overrides) => {
    expect(assignPhase9ReviewLane(finding(overrides)).lane).toBe('exception');
  });

  it('rejects empty quotation text before lane assignment', () => {
    expect(() => phase9ReviewFindingSchema.parse(finding({ evidenceText: '   ' }))).toThrow();
  });

  it.each([
    'submission_deadline',
    'question_deadline',
    'mandatory_form',
    'pricing_form',
    'signature',
    'insurance',
    'bond',
    'license',
    'pre_bid_conference',
    'site_visit',
    'electronic_submission',
    'copy_count',
    'file_format',
    'packaging_requirement',
  ] as const)('classifies %s as critical', (category) => {
    expect(assignPhase9ReviewLane(finding({ category })).lane).toBe('critical');
  });

  it('keeps explicit disqualification language critical even when mandatory metadata is absent', () => {
    expect(
      assignPhase9ReviewLane(
        finding({
          mandatoryClass: 'uncertain',
          obligationText:
            'Failure to include the disclosure may result in the proposal being deemed nonresponsive.',
        }),
      ),
    ).toMatchObject({ lane: 'critical', reason: 'submission_critical' });
  });

  it.each(['bid opening', 'proposal opening'])(
    'keeps a mandatory %s instruction in individual critical review',
    (opening) => {
      expect(
        assignPhase9ReviewLane(
          finding({
            obligationText: `The ${opening} will occur at 2:00 PM.`,
          }),
        ),
      ).toMatchObject({
        lane: 'critical',
        reason: 'submission_critical',
      });
    },
  );

  it('classifies a deterministic 1,000-finding population without dropping records', () => {
    const assignments = Array.from({ length: 1_000 }, (_, index) =>
      assignPhase9ReviewLane(
        finding({
          candidateHash: hash(index + 1),
          sourceOrder: index,
          sourcePage: (index % 50) + 1,
        }),
      ),
    );
    expect(assignments).toHaveLength(1_000);
    expect(assignments.every((assignment) => assignment.lane === 'routine')).toBe(true);
  });
});

describe('deterministic duplicate grouping', () => {
  it('chooses a stable canonical record and preserves every occurrence', () => {
    const groups = groupPhase9DeterministicDuplicates([
      finding({ candidateHash: hash(2), sourceOrder: 2 }),
      finding({ candidateHash: hash(1), sourceOrder: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      canonicalCandidateHash: hash(1),
      candidateHashes: [hash(1), hash(2)],
    });
  });

  it('does not group conflicting facts or active with superseded', () => {
    expect(
      groupPhase9DeterministicDuplicates([
        finding({ candidateHash: hash(1), materialFacts: { amount: 3_000_000 } }),
        finding({ candidateHash: hash(2), materialFacts: { amount: 4_000_000 } }),
        finding({ candidateHash: hash(3), precedenceStatus: 'superseded' }),
      ]),
    ).toHaveLength(0);
  });

  it('never lets an unsupported or evidence-missing record displace a clean canonical record', () => {
    expect(
      groupPhase9DeterministicDuplicates([
        finding({ candidateHash: hash(1), sourceSupportStatus: 'unsupported' }),
        finding({ candidateHash: hash(2) }),
      ]),
    ).toHaveLength(0);
    expect(
      assignPhase9ReviewLane(
        finding({
          sourceDocumentId: null,
          evidenceCount: 0,
          pageReferencesComplete: false,
          quoteMatchType: 'not_found',
        }),
      ).lane,
    ).toBe('exception');
  });
});

describe('batch policy and effort estimate', () => {
  it('permits only routine accept and noncanonical duplicate rejection', () => {
    expect(evaluatePhase9BatchEligibility(finding(), 'accept_routine').eligible).toBe(true);
    expect(
      evaluatePhase9BatchEligibility(finding({ category: 'mandatory_form' }), 'accept_routine')
        .eligible,
    ).toBe(false);
    expect(
      evaluatePhase9BatchEligibility(
        finding({ sourceSupportStatus: 'unsupported' }),
        'accept_routine',
      ).eligible,
    ).toBe(false);
    expect(
      evaluatePhase9BatchEligibility(
        finding({ duplicateOfCandidateHash: hash(9) }),
        'reject_duplicate',
      ).eligible,
    ).toBe(true);
    expect(
      evaluatePhase9BatchEligibility(finding({ category: 'mandatory_form' }), 'mark_follow_up'),
    ).toMatchObject({ eligible: false, reason: 'critical_requires_individual_review' });
    expect(
      evaluatePhase9BatchEligibility(
        finding({ sourceSupportStatus: 'unsupported' }),
        'mark_follow_up',
      ),
    ).toMatchObject({ eligible: false, reason: 'exception_requires_individual_review' });
    expect(evaluatePhase9BatchEligibility(finding(), 'mark_follow_up')).toMatchObject({
      eligible: true,
      reason: 'eligible_explicit_follow_up',
    });
  });

  it('refuses stale reviewed selections', () => {
    expect(
      evaluatePhase9BatchEligibility(finding({ humanDecision: 'accepted' }), 'accept_routine'),
    ).toMatchObject({ eligible: false, reason: 'already_reviewed' });
  });

  it('returns a conservative range without false precision', () => {
    expect(
      estimatePhase9ReviewEffort({
        unresolvedIndividualItems: 10,
        unresolvedDuplicateGroups: 2,
        unresolvedBatchEligibleRoutineItems: 50,
      }),
    ).toMatchObject({
      minimumMinutes: expect.any(Number),
      maximumMinutes: expect.any(Number),
      basis: 'conservative_defaults',
    });
    expect(
      estimatePhase9ReviewEffort({
        unresolvedIndividualItems: 10,
        unresolvedDuplicateGroups: 0,
        unresolvedBatchEligibleRoutineItems: 0,
        observedSecondsPerIndividualDecision: 30,
        observedIndividualDecisionCount: 1,
      }).basis,
    ).toBe('conservative_defaults');
    expect(
      estimatePhase9ReviewEffort({
        unresolvedIndividualItems: 10,
        unresolvedDuplicateGroups: 0,
        unresolvedBatchEligibleRoutineItems: 0,
        observedSecondsPerIndividualDecision: 30,
        observedIndividualDecisionCount: 5,
      }).basis,
    ).toBe('observed_and_conservative_defaults');
  });
});

describe('guided tour contract', () => {
  const definition = {
    id: 'stakeholder-demo',
    version: GUIDED_PRODUCT_TOUR_VERSION,
    audience: 'stakeholder_demo',
    demoOnly: true,
    eligibility: {
      workspaceMode: 'prepared_demo_only',
      requiredWorkspaceMarker: 'phase8-synthetic-demo',
    },
    steps: [
      {
        id: 'overview',
        order: 1,
        targetKey: 'executive-summary',
        route: '/w/:workspaceId/phase9',
        title: 'Opportunity overview',
        text: 'See the most important work first.',
        preferredPlacement: 'bottom',
        interactionRequirement: 'informational',
        precondition: 'target_available',
        completionCondition: 'manual_next',
        fallbackBehavior: 'required',
        presenterNote: 'Pause for questions.',
      },
    ],
  } as const;

  it('validates definitions and rejects duplicate targets', () => {
    expect(guidedTourDefinitionSchema.parse(definition).steps).toHaveLength(1);
    expect(() =>
      guidedTourDefinitionSchema.parse({
        ...definition,
        steps: [...definition.steps, { ...definition.steps[0], id: 'second' }],
      }),
    ).toThrow(/target keys must be unique/i);
  });

  it('supports versioned runtime transitions and missing-target fallback', () => {
    let state = transitionGuidedTourState(
      { status: 'idle', stepIndex: 0, missingTarget: null },
      'start',
      2,
    );
    state = transitionGuidedTourState(state, 'target_missing', 2, 'source-evidence');
    expect(state.missingTarget).toBe('source-evidence');
    state = transitionGuidedTourState(state, 'retry', 2);
    state = transitionGuidedTourState(state, 'next', 2);
    expect(state).toMatchObject({ status: 'active', stepIndex: 1, missingTarget: null });
    expect(transitionGuidedTourState(state, 'next', 2).status).toBe('completed');
  });
});
