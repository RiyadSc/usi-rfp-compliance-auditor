import { describe, expect, it } from 'vitest';
import { MockProvider } from '../../packages/ai/src/mock-provider';
import {
  buildChallengeSystemPrompt,
  buildEntailmentSystemPrompt,
} from '../../packages/ai/src/prompts';
import { runCandidateVerificationPipeline } from '../../packages/ai/src/candidate-verification-pipeline';
import {
  buildDeterministicFactEnvelope,
  type FinalMachineAssessment,
} from '../../packages/ai/src/verification-decision-engine';
import {
  validateChallengeSemanticContract,
  validateEntailmentSemanticContract,
} from '../../packages/ai/src/verification-semantic-contract';
import {
  challengeResultSchema,
  entailmentResultSchema,
  finalMachineAssessmentSchema,
} from '../../packages/ai/src/verification-v3-schemas';
import {
  VERIFICATION_CASES,
  VERIFICATION_CONTEXTS,
  VERIFICATION_INPUT_CANDIDATES,
} from '../../fixtures/eval/verification-cases';

const expectedContract = new Map<
  number,
  {
    passA: 'entails' | 'partially_entails' | 'insufficient';
    passB: 'no_material_objection' | null;
    final: FinalMachineAssessment['sourceSupportStatus'];
    precedence: FinalMachineAssessment['precedenceStatus'];
    mismatchPattern?: RegExp;
    prohibitedMismatchPattern?: RegExp;
  }
>([
  [
    3,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'active',
      prohibitedMismatchPattern: /sealed|paper|wording/i,
    },
  ],
  [
    4,
    {
      passA: 'partially_entails',
      passB: null,
      final: 'partially_supported',
      precedence: 'active',
      mismatchPattern: /scope|consequence|time/i,
    },
  ],
  [
    5,
    {
      passA: 'partially_entails',
      passB: null,
      final: 'partially_supported',
      precedence: 'active',
      mismatchPattern: /scope|consequence/i,
    },
  ],
  [6, { passA: 'insufficient', passB: null, final: 'unsupported', precedence: 'undetermined' }],
  [
    8,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'active',
      prohibitedMismatchPattern: /changed|context/i,
    },
  ],
  [
    12,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'superseded',
    },
  ],
  [
    15,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'active',
      prohibitedMismatchPattern: /4|staff/i,
    },
  ],
  [
    18,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'active',
      prohibitedMismatchPattern: /also|additive|word/i,
    },
  ],
  [22, { passA: 'insufficient', passB: null, final: 'unsupported', precedence: 'undetermined' }],
  [
    23,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'conflicting',
      prohibitedMismatchPattern: /security operations/i,
    },
  ],
  [
    24,
    {
      passA: 'entails',
      passB: 'no_material_objection',
      final: 'supported',
      precedence: 'conflicting',
      prohibitedMismatchPattern: /security operations/i,
    },
  ],
]);

function candidate(number: number) {
  return VERIFICATION_INPUT_CANDIDATES[number - 1]!;
}

function contexts(number: number) {
  const item = candidate(number);
  const cited = VERIFICATION_CONTEXTS.find(
    (context) =>
      context.documentId === item.documentId && context.pageNumber === item.preliminaryPage,
  )!;
  const selected = [cited];
  for (const context of VERIFICATION_CONTEXTS) {
    if (selected.length >= 2) break;
    if (context.chunkId !== cited.chunkId) selected.push(context);
  }
  return selected;
}

describe('Phase 4 semantic contract v5/v3', () => {
  it.each([...expectedContract])(
    'matches the frozen Stage 1 contract for candidate %i',
    async (number, expected) => {
      const item = candidate(number);
      const output = await runCandidateVerificationPipeline({
        provider: new MockProvider(),
        workspaceId: 'workspace',
        analysisRunId: 'analysis',
        verificationRunId: 'verification',
        candidate: item,
        availableContexts: VERIFICATION_CONTEXTS,
        maxContexts: 2,
        entailmentMaxOutputTokens: 1200,
        challengeMaxOutputTokens: 1000,
      });
      expect(output.entailment?.classification).toBe(expected.passA);
      expect(output.challenge?.assessment ?? null).toBe(expected.passB);
      expect(output.finalAssessment).toMatchObject({
        sourceSupportStatus: expected.final,
        precedenceStatus: expected.precedence,
        humanReviewStatus: 'pending',
        machineOnly: true,
      });
      expect(finalMachineAssessmentSchema.safeParse(output.finalAssessment).success).toBe(true);
      const mismatches = output.entailment?.missingOrOverstatedQualifiers.join(' ') ?? '';
      if (expected.passA === 'partially_entails') {
        expect(output.entailment?.missingOrOverstatedQualifiers.length).toBeGreaterThan(0);
        expect(mismatches).toMatch(expected.mismatchPattern!);
      } else {
        expect(output.entailment?.missingOrOverstatedQualifiers).toEqual([]);
      }
      if (expected.prohibitedMismatchPattern)
        expect(mismatches).not.toMatch(expected.prohibitedMismatchPattern);
      expect(output.entailmentCall?.completionTokens).toBeLessThan(400);
      expect(output.entailmentCall?.incomplete).not.toBe(true);
      expect(output.failedStage).toBeNull();
      expect(VERIFICATION_CASES[number - 1]!.expected).toMatchObject({
        sourceSupportStatus: expected.final,
        precedenceStatus: expected.precedence,
      });
    },
  );

  it('bounds Pass A output to a compact object', () => {
    const partial = {
      candidateId: 'candidate',
      classification: 'partially_entails',
      rationale: 'r'.repeat(160),
      supportingEvidence: [{ documentId: 'document', pageNumber: 1, quote: 'q'.repeat(240) }],
      contradictingEvidence: [],
      materialQualifiersPresent: ['p'.repeat(80), 'q'.repeat(80), 'r'.repeat(80)],
      missingOrOverstatedQualifiers: ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)],
      parserConcerns: [],
      descriptiveOnly: false,
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(entailmentResultSchema.safeParse(partial).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(partial))).toBeLessThanOrEqual(1_350);
  });

  it('bounds a maximum valid Pass B object below the reserved structured-answer budget', () => {
    const reference = {
      documentId: 'd'.repeat(36),
      pageNumber: 999,
      quote: 'q'.repeat(240),
    };
    const objection = {
      type: 'overstated_scope' as const,
      candidateProposition: 'c'.repeat(120),
      qualifierOrConflict: 'q'.repeat(100),
      materialEffect: 'm'.repeat(140),
      evidence: [reference],
    };
    const maximum = {
      candidateId: 'c'.repeat(36),
      assessment: 'material_qualification_missing' as const,
      rationale: 'r'.repeat(160),
      objections: [objection, { ...objection, type: 'missing_condition' as const }],
      injectionInfluence: false as const,
      machineOnly: true as const,
    };
    expect(challengeResultSchema.safeParse(maximum).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(maximum))).toBeLessThanOrEqual(1_925);
  });

  it('enforces class-dependent Pass A invariants', () => {
    const reference = { documentId: 'document', pageNumber: 1, quote: 'Exact evidence.' };
    const base = {
      candidateId: 'candidate',
      rationale: 'Concise result.',
      supportingEvidence: [reference],
      contradictingEvidence: [],
      materialQualifiersPresent: [],
      missingOrOverstatedQualifiers: [],
      parserConcerns: [],
      descriptiveOnly: false,
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(
      entailmentResultSchema.safeParse({
        ...base,
        classification: 'entails',
        missingOrOverstatedQualifiers: ['missing condition'],
      }).success,
    ).toBe(false);
    expect(
      entailmentResultSchema.safeParse({ ...base, classification: 'partially_entails' }).success,
    ).toBe(false);
    expect(
      entailmentResultSchema.safeParse({ ...base, classification: 'contradicts' }).success,
    ).toBe(false);
    expect(
      entailmentResultSchema.safeParse({
        ...base,
        classification: 'insufficient',
        supportingEvidence: [],
        contradictingEvidence: [reference],
      }).success,
    ).toBe(false);
    expect(
      entailmentResultSchema.safeParse({
        ...base,
        classification: 'parser_uncertain',
        supportingEvidence: [],
      }).success,
    ).toBe(false);
  });

  it('rejects non-material wording mismatches and fabricated Pass A evidence', () => {
    const item = candidate(18);
    const supplied = contexts(18);
    const result = {
      candidateId: item.id,
      classification: 'partially_entails',
      rationale: 'A word differs.',
      supportingEvidence: [
        { documentId: item.documentId, pageNumber: item.preliminaryPage, quote: 'fabricated' },
      ],
      contradictingEvidence: [],
      materialQualifiersPresent: [],
      missingOrOverstatedQualifiers: ['additive source word also'],
      parserConcerns: [],
      descriptiveOnly: false,
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(
      validateEntailmentSemanticContract({
        candidate: item,
        contexts: supplied,
        facts: buildDeterministicFactEnvelope(item, supplied),
        result,
      }),
    ).toEqual(expect.objectContaining({ success: false }));
  });

  it('requires grounded, materially typed Pass B objections', () => {
    const item = candidate(8);
    const supplied = VERIFICATION_CONTEXTS.filter((context) => [2, 3].includes(context.pageNumber));
    const facts = buildDeterministicFactEnvelope(item, supplied);
    const objection = {
      candidateId: item.id,
      assessment: 'material_qualification_missing',
      rationale: 'A material issue exists.',
      objections: [
        {
          type: 'wrong_deadline',
          candidateProposition: 'Proposals are due April 22, 2026 at 2:00 PM local time.',
          qualifierOrConflict: 'April 22, 2026',
          materialEffect: 'Claims the wrong deadline.',
          evidence: [
            {
              documentId: item.documentId,
              pageNumber: 3,
              quote: 'The submission deadline is changed to April 22, 2026 at 2:00 PM local time.',
            },
          ],
        },
      ],
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(challengeResultSchema.safeParse(objection).success).toBe(true);
    expect(
      validateChallengeSemanticContract({
        candidate: item,
        contexts: supplied,
        facts,
        result: objection,
      }),
    ).toEqual({
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_b:no_date_mismatch',
    });
  });

  it('fails closed with a visible normalized error for inconsistent Pass A', async () => {
    const item = candidate(8);
    const provider = new MockProvider();
    provider.assessEntailment = async () => ({
      result: {
        candidateId: item.id,
        classification: 'entails',
        rationale: 'Entails, but inconsistent.',
        supportingEvidence: [
          { documentId: item.documentId, pageNumber: 3, quote: item.evidenceQuote },
        ],
        contradictingEvidence: [],
        materialQualifiersPresent: [],
        missingOrOverstatedQualifiers: ['changed deadline context'],
        parserConcerns: [],
        descriptiveOnly: false,
        injectionInfluence: false,
        machineOnly: true,
      } as never,
      providerRequestId: 'inconsistent-pass-a',
      modelId: 'mock',
      promptTokens: 1,
      completionTokens: 1,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: 1,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
    });
    const output = await runCandidateVerificationPipeline({
      provider,
      workspaceId: 'workspace',
      analysisRunId: 'analysis',
      verificationRunId: 'verification',
      candidate: item,
      availableContexts: VERIFICATION_CONTEXTS,
      maxContexts: 2,
    });
    expect(output.finalAssessment).toBeNull();
    expect(output.failedStage).toBe('entailment');
    expect(output.entailmentCall?.schemaAdherent).toBe(false);
    expect(output.error).toMatch(/^semantic_contract_invalid:pass_a:/);
  });

  it('structurally forbids model-controlled descriptiveOnly=true', () => {
    const item = candidate(14);
    expect(
      entailmentResultSchema.safeParse({
        candidateId: item.id,
        classification: 'contradicts',
        rationale: 'The active addendum explicitly resolves the claimed conflict.',
        supportingEvidence: [],
        contradictingEvidence: [
          { documentId: item.documentId, pageNumber: 3, quote: item.evidenceQuote },
        ],
        materialQualifiersPresent: [],
        missingOrOverstatedQualifiers: [],
        parserConcerns: [],
        descriptiveOnly: true,
        injectionInfluence: false,
        machineOnly: true,
      }).success,
    ).toBe(false);
  });

  it('retains a controlled-repair failure as auditable metadata', async () => {
    const item = candidate(8);
    const provider = new MockProvider();
    provider.assessEntailment = async () => ({
      result: null,
      providerRequestId: 'repair-failed-pass-a',
      modelId: 'mock',
      promptTokens: 2,
      completionTokens: 2,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: 1,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 1,
      schemaAdherent: false,
      normalizedError: 'semantic_contract_invalid:pass_a:entails_forbids_material_mismatches',
    });
    let persistedCall: unknown;
    const output = await runCandidateVerificationPipeline({
      provider,
      workspaceId: 'workspace',
      analysisRunId: 'analysis',
      verificationRunId: 'verification',
      candidate: item,
      availableContexts: VERIFICATION_CONTEXTS,
      maxContexts: 2,
      onEntailmentCall: (call) => {
        persistedCall = call;
      },
    });
    expect(output.finalAssessment).toBeNull();
    expect(output.failedStage).toBe('entailment');
    expect(output.error).toBe(
      'semantic_contract_invalid:pass_a:entails_forbids_material_mismatches',
    );
    expect(persistedCall).toMatchObject({
      repairAttempts: 1,
      schemaAdherent: false,
      normalizedError: 'semantic_contract_invalid:pass_a:entails_forbids_material_mismatches',
    });
  });

  it('fails Pass B closed instead of applying an ungrounded objection', async () => {
    const item = candidate(8);
    const provider = new MockProvider();
    provider.challengeEntailment = async () => ({
      result: {
        candidateId: item.id,
        assessment: 'material_qualification_missing',
        rationale: 'Invented objection.',
        objections: [],
        injectionInfluence: false,
        machineOnly: true,
      } as never,
      providerRequestId: 'inconsistent-pass-b',
      modelId: 'mock',
      promptTokens: 1,
      completionTokens: 1,
      reasoningTokens: 0,
      cachedTokens: 0,
      latencyMs: 1,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: true,
    });
    const output = await runCandidateVerificationPipeline({
      provider,
      workspaceId: 'workspace',
      analysisRunId: 'analysis',
      verificationRunId: 'verification',
      candidate: item,
      availableContexts: VERIFICATION_CONTEXTS,
      maxContexts: 2,
    });
    expect(output.failedStage).toBe('challenge');
    expect(output.challengeCall?.schemaAdherent).toBe(false);
    expect(output.finalAssessment).toBeNull();
    expect(output.error).toMatch(/^semantic_contract_invalid:pass_b:/);
  });

  it('retains the provider incomplete reason without attempting semantic repair', async () => {
    const item = candidate(4);
    const provider = new MockProvider();
    provider.assessEntailment = async () => ({
      result: null,
      providerRequestId: 'incomplete-pass-a',
      modelId: 'mock',
      promptTokens: 1,
      completionTokens: 1200,
      reasoningTokens: 1000,
      cachedTokens: 0,
      latencyMs: 1,
      estimatedCostUsd: 0,
      retries: 0,
      repairAttempts: 0,
      schemaAdherent: false,
      incomplete: true,
      incompleteReason: 'max_output_tokens',
    });
    const output = await runCandidateVerificationPipeline({
      provider,
      workspaceId: 'workspace',
      analysisRunId: 'analysis',
      verificationRunId: 'verification',
      candidate: item,
      availableContexts: VERIFICATION_CONTEXTS,
      maxContexts: 2,
      entailmentMaxOutputTokens: 1200,
    });
    expect(output.failedStage).toBe('entailment');
    expect(output.entailmentCall).toMatchObject({
      incomplete: true,
      incompleteReason: 'max_output_tokens',
      repairAttempts: 0,
    });
    expect(output.finalAssessment).toBeNull();
  });

  it('rejects a Pass B claim that a qualifier present in the candidate is missing', () => {
    const item = candidate(8);
    const supplied = VERIFICATION_CONTEXTS.filter((context) => [2, 3].includes(context.pageNumber));
    const facts = buildDeterministicFactEnvelope(item, supplied);
    const result = {
      candidateId: item.id,
      assessment: 'material_qualification_missing',
      rationale: 'Claims a missing date.',
      objections: [
        {
          type: 'missing_condition',
          candidateProposition: 'Proposals are due April 22, 2026 at 2:00 PM local time.',
          qualifierOrConflict: 'April 22, 2026',
          materialEffect: 'The date would change the deadline.',
          evidence: [
            {
              documentId: item.documentId,
              pageNumber: 3,
              quote: 'The submission deadline is changed to April 22, 2026 at 2:00 PM local time.',
            },
          ],
        },
      ],
      injectionInfluence: false,
      machineOnly: true,
    };
    expect(
      validateChallengeSemanticContract({ candidate: item, contexts: supplied, facts, result }),
    ).toEqual({
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_b:claimed_missing_text_present',
    });
  });

  it('documents concise provider-neutral prompt boundaries', () => {
    const passA = buildEntailmentSystemPrompt();
    const passB = buildChallengeSystemPrompt();
    expect(passA).toMatch(/Exact wording is not required/i);
    expect(passA).toMatch(/Absence of evidence is not contradiction/i);
    expect(passA).toMatch(/Output only the strict object/i);
    expect(passA).toMatch(/Return the strict object immediately/i);
    expect(passA).toMatch(/descriptiveOnly is a reserved schema constant/i);
    expect(passB).toMatch(/Do not invent an objection/i);
    expect(passB).toMatch(/independent child requirements are not material objections/i);
    expect(passB).toMatch(/exact affected candidate proposition/i);
    expect(passB).toMatch(/choose no_material_objection immediately/i);
  });
});
