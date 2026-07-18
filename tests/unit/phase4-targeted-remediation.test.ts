import { describe, expect, it } from 'vitest';
import {
  classifyAtomicRequirementRelationship,
  compareMaterialScope,
} from '../../packages/ai/src/deterministic-verification';
import {
  buildDeterministicFactEnvelope,
  deriveMachineAssessment,
  findDeterministicParentChildRelationships,
  selectCandidateContexts,
} from '../../packages/ai/src/verification-decision-engine';
import { validateChallengeSemanticContract } from '../../packages/ai/src/verification-semantic-contract';
import {
  challengeResultSchema,
  entailmentResultSchema,
  finalMachineAssessmentSchema,
} from '../../packages/ai/src/verification-v3-schemas';
import { didRepairChangeSemanticMeaning } from '../../packages/ai/src/openai-provider';
import {
  VERIFICATION_CONTEXTS,
  VERIFICATION_INPUT_CANDIDATES,
} from '../../fixtures/eval/verification-cases';

const candidate = (number: number) => VERIFICATION_INPUT_CANDIDATES[number - 1]!;
const bounded = (number: number) =>
  selectCandidateContexts(candidate(number), VERIFICATION_CONTEXTS, 2);

function partialEntailment(number: number) {
  const item = candidate(number);
  return {
    candidateId: item.id,
    classification: 'partially_entails' as const,
    rationale: 'The central obligation is present with one material mismatch.',
    supportingEvidence: [
      {
        documentId: item.documentId,
        pageNumber: item.preliminaryPage,
        quote: item.evidenceQuote,
      },
    ],
    contradictingEvidence: [],
    materialQualifiersPresent: [],
    missingOrOverstatedQualifiers: ['active threshold differs'],
    parserConcerns: [],
    descriptiveOnly: false,
    injectionInfluence: false as const,
    machineOnly: true as const,
  };
}

describe('Phase 4 targeted deterministic remediation', () => {
  it('keeps meeting-date equality independent from absent party scope and preserves the consequence', () => {
    const item = candidate(4);
    const contexts = bounded(4);
    const facts = buildDeterministicFactEnvelope(item, contexts);
    const date = facts.comparisons.find((comparison) => comparison.kind === 'date');
    expect(date).toMatchObject({
      comparison: 'match',
      reason: 'all_material_fields_match',
      scopeComparison: 'unknown',
      materialScopeDifferences: [],
    });
    expect(date?.materialScopeUnknowns).toContain('party');
    expect(facts.atomicRelationship).toMatchObject({
      kind: 'parent_missing_material_condition',
    });
  });

  it('treats explicit same-scope active numerical opposition as contradiction before semantic partiality', () => {
    const item = candidate(11);
    const contexts = bounded(11);
    const facts = buildDeterministicFactEnvelope(item, contexts);
    expect(facts.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'number',
          comparison: 'mismatch',
          reason: 'normalized_value_mismatch',
          scopeComparison: 'match',
        }),
      ]),
    );
    const result = deriveMachineAssessment({
      candidate: item,
      contexts,
      facts,
      entailment: partialEntailment(11),
      challenge: null,
    });
    expect(result).toMatchObject({
      sourceSupportStatus: 'contradicted',
      precedenceStatus: 'active',
    });
    expect(finalMachineAssessmentSchema.safeParse(result).success).toBe(true);
  });

  it('does not promote unknown/partial scope or superseded values into active contradiction', () => {
    const item = candidate(11);
    const contexts = bounded(11);
    const baseFacts = buildDeterministicFactEnvelope(item, contexts);
    const unknownScopeFacts = {
      ...baseFacts,
      comparisons: baseFacts.comparisons.map((comparison) => ({
        ...comparison,
        scopeComparison: 'unknown' as const,
        materialScopeUnknowns: ['site'],
      })),
    };
    expect(
      deriveMachineAssessment({
        candidate: item,
        contexts,
        facts: unknownScopeFacts,
        entailment: partialEntailment(11),
        challenge: null,
      }).sourceSupportStatus,
    ).toBe('partially_supported');
    expect(
      deriveMachineAssessment({
        candidate: item,
        contexts,
        facts: { ...baseFacts, deterministicPrecedence: 'superseded' },
        entailment: partialEntailment(11),
        challenge: null,
      }),
    ).toMatchObject({ sourceSupportStatus: 'partially_supported', precedenceStatus: 'superseded' });
  });

  it('classifies additive child obligations without invalidating or merging the parent', () => {
    const cases = [
      [
        'Attach Exhibit C, a staffing plan.',
        'Attach Exhibit C, a staffing plan showing at least 4 full-time-equivalent staff.',
      ],
      ['Submit Form A-1.', 'Submit Form A-1 signed by an authorized representative.'],
      [
        'Maintain commercial general liability insurance.',
        'Maintain commercial general liability insurance. North Campus site-specific sublimit is $1,000,000.',
      ],
      [
        'Submit proposals through the procurement portal.',
        'Submit proposals through the procurement portal. Packaging instructions require two labeled copies.',
      ],
    ] as const;
    for (const [parent, source] of cases)
      expect(classifyAtomicRequirementRelationship(parent, source)).toMatchObject({
        kind: 'parent_with_additive_child',
        parentObligation: parent,
      });
    expect(
      classifyAtomicRequirementRelationship(
        candidate(4).obligation,
        VERIFICATION_CONTEXTS.find((context) => context.pageNumber === 7)!.text,
      ),
    ).toMatchObject({ kind: 'parent_missing_material_condition' });
  });

  it('proposes an explicit parent/child link while preserving both atomic candidates', () => {
    const parent = {
      ...candidate(15),
      id: 'parent',
      obligation: 'Attach Exhibit C, a staffing plan.',
    };
    const child = {
      ...candidate(15),
      id: 'child',
      obligation: 'Exhibit C must show at least 4 full-time-equivalent staff.',
    };
    expect(findDeterministicParentChildRelationships([parent, child])).toEqual([
      {
        sourceCandidateId: 'parent',
        targetCandidateId: 'child',
        relationshipType: 'parent_child',
        deterministicMetadata: {
          version: 'atomic-parent-child-v1',
          sharedAnchor: 'exhibit c',
          preservesAtomicRecords: true,
        },
      },
    ]);
  });

  it('does not turn unknown scope into unequal scope', () => {
    const empty = {
      site: null,
      role: null,
      party: null,
      form: null,
      section: null,
      deliverable: null,
      insuranceBasis: null,
      subject: null,
      obligationRole: null,
    } as const;
    expect(compareMaterialScope({ ...empty, party: 'Offerors' }, empty)).toBe('unknown');
    expect(compareMaterialScope({ ...empty, party: 'Offerors' }, { ...empty, party: 'City' })).toBe(
      'mismatch',
    );
  });

  it('rejects the speculative repaired Addendum 4 scope objection', () => {
    const item = candidate(24);
    const contexts = bounded(24);
    const facts = buildDeterministicFactEnvelope(item, contexts);
    expect(facts.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ comparison: 'match', scopeComparison: 'match' }),
      ]),
    );
    const result = {
      candidateId: item.id,
      assessment: 'material_qualification_missing',
      rationale: 'A scope phrase is allegedly missing.',
      objections: [
        {
          type: 'overstated_scope',
          candidateProposition: item.obligation,
          qualifierOrConflict: 'For North Campus security operations',
          materialEffect: 'Allegedly changes the covered operations.',
          evidence: [
            {
              documentId: item.documentId,
              pageNumber: 17,
              quote:
                'For North Campus security operations, commercial general liability insurance must be at least $4,000,000 per occurrence.',
            },
          ],
        },
      ],
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(challengeResultSchema.safeParse(result).success).toBe(true);
    expect(validateChallengeSemanticContract({ candidate: item, contexts, facts, result })).toEqual(
      {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:no_explicit_comparable_scope_difference',
      },
    );
  });
});

describe('Stage 1 controlled-repair regression taxonomy', () => {
  const reference = { documentId: 'document', pageNumber: 1, quote: 'Exact evidence.' };
  const base = {
    rationale: 'Concise classification.',
    supportingEvidence: [],
    contradictingEvidence: [],
    materialQualifiersPresent: [],
    missingOrOverstatedQualifiers: [],
    parserConcerns: [],
    descriptiveOnly: false,
    injectionInfluence: false,
    machineOnly: true,
  };

  it.each([
    [6, 'insufficient', 'bid bond absent'],
    [9, 'contradicts', 'wrong deadline'],
    [14, 'contradicts', 'false conflict'],
    [21, 'contradicts', 'descriptive statement'],
    [22, 'insufficient', 'malicious text'],
  ] as const)(
    'rejects repaired-call %i first-pass forbidden qualifier combination',
    (number, classification, mismatch) => {
      const invalid = {
        ...base,
        candidateId: candidate(number).id,
        classification,
        contradictingEvidence: classification === 'contradicts' ? [reference] : [],
        missingOrOverstatedQualifiers: [mismatch],
      };
      expect(entailmentResultSchema.safeParse(invalid).success).toBe(false);
      const corrected = {
        ...invalid,
        missingOrOverstatedQualifiers: [],
      };
      expect(entailmentResultSchema.safeParse(corrected).success).toBe(true);
    },
  );

  it('covers the sixth repair as a grounded-evidence/typed-scope validation failure', () => {
    const item = candidate(24);
    const contexts = bounded(24);
    const facts = buildDeterministicFactEnvelope(item, contexts);
    const repairedShape = {
      candidateId: item.id,
      assessment: 'material_qualification_missing',
      rationale: 'A scope phrase is allegedly missing.',
      objections: [
        {
          type: 'overstated_scope',
          candidateProposition: item.obligation,
          qualifierOrConflict: 'North Campus security operations',
          materialEffect: 'The scope would materially change.',
          evidence: [
            {
              documentId: item.documentId,
              pageNumber: 17,
              quote:
                'For North Campus security operations, commercial general liability insurance must be at least $4,000,000 per occurrence.',
            },
          ],
        },
      ],
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(challengeResultSchema.safeParse(repairedShape).success).toBe(true);
    expect(
      validateChallengeSemanticContract({
        candidate: item,
        contexts,
        facts,
        result: repairedShape,
      }),
    ).toMatchObject({ success: false });
  });

  it.each([
    [
      'missing required machine-only field',
      { classification: 'insufficient', supportingEvidence: [] },
      { classification: 'insufficient', supportingEvidence: [], machineOnly: true },
      false,
    ],
    [
      'forbidden qualifier combination',
      { classification: 'insufficient', missingOrOverstatedQualifiers: ['bid bond absent'] },
      { classification: 'insufficient', missingOrOverstatedQualifiers: [] },
      true,
    ],
    [
      'invalid enum correction',
      { classification: 'unsupported' },
      { classification: 'insufficient' },
      true,
    ],
    [
      'over-limit rationale shortening',
      { classification: 'entails', rationale: 'x'.repeat(500) },
      { classification: 'entails', rationale: 'Concise.' },
      false,
    ],
    [
      'evidence span correction',
      { classification: 'entails', supportingEvidence: [{ quote: 'wrong' }] },
      { classification: 'entails', supportingEvidence: [{ quote: 'exact source' }] },
      true,
    ],
    [
      'mutually inconsistent qualifier correction',
      {
        classification: 'entails',
        materialQualifiersPresent: ['deadline'],
        missingOrOverstatedQualifiers: ['deadline'],
      },
      {
        classification: 'entails',
        materialQualifiersPresent: ['deadline'],
        missingOrOverstatedQualifiers: [],
      },
      true,
    ],
  ] as const)('classifies %s repair semantics', (_name, initial, repaired, expected) => {
    expect(didRepairChangeSemanticMeaning(initial, repaired)).toBe(expected);
  });

  it('does not mistake JSON object-key ordering for a semantic repair', () => {
    expect(
      didRepairChangeSemanticMeaning(
        {
          classification: 'entails',
          supportingEvidence: [{ documentId: 'd', pageNumber: 1, quote: 'exact' }],
        },
        {
          supportingEvidence: [{ quote: 'exact', pageNumber: 1, documentId: 'd' }],
          classification: 'entails',
        },
      ),
    ).toBe(false);
  });
});
