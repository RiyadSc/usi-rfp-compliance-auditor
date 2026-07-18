import { describe, expect, it } from 'vitest';
import { runCandidateVerificationPipeline } from '../../packages/ai/src/candidate-verification-pipeline';
import { MockProvider } from '../../packages/ai/src/mock-provider';
import type {
  VerificationCandidateInput,
  VerificationContext,
} from '../../packages/ai/src/provider';
import { buildDeterministicFactEnvelope } from '../../packages/ai/src/verification-decision-engine';
import { validateEntailmentSemanticContract } from '../../packages/ai/src/verification-semantic-contract';

const documentId = 'meeting-document';
const requiredMeeting =
  'Attendance at the mandatory pre-proposal meeting on March 1, 2026 at 10:00 AM local time is required.';
const consequence = 'Failure to attend disqualifies an offeror';

function candidate(
  id: string,
  obligation: string,
  evidenceQuote: string,
): VerificationCandidateInput {
  return {
    id,
    documentId,
    category: 'mandatory_meeting',
    title: id,
    obligation,
    mandatoryClass: 'mandatory',
    preliminaryPage: 1,
    evidenceQuote,
  };
}

function context(text: string): VerificationContext {
  return {
    chunkId: 'meeting-page-1',
    documentId,
    documentType: 'primary_rfp',
    pageNumber: 1,
    text,
    extractionStatus: 'ok',
    parserWarnings: [],
    retrievalReason: 'meeting_contract_fixture',
  };
}

function reference(quote: string) {
  return { documentId, pageNumber: 1, quote };
}

function result(
  item: VerificationCandidateInput,
  classification:
    'entails' | 'partially_entails' | 'contradicts' | 'insufficient' | 'parser_uncertain',
  quote: string,
  missing: string[] = [],
) {
  return {
    candidateId: item.id,
    classification,
    rationale: 'Bounded meeting assessment.',
    supportingEvidence: ['entails', 'partially_entails'].includes(classification)
      ? [reference(quote)]
      : [],
    contradictingEvidence: classification === 'contradicts' ? [reference(quote)] : [],
    materialQualifiersPresent: [],
    missingOrOverstatedQualifiers: missing,
    parserConcerns: classification === 'parser_uncertain' ? ['Unreadable meeting text'] : [],
    descriptiveOnly: false as const,
    injectionInfluence: false as const,
    machineOnly: true as const,
  };
}

function validate(
  item: VerificationCandidateInput,
  page: VerificationContext,
  semanticResult: unknown,
) {
  return validateEntailmentSemanticContract({
    candidate: item,
    contexts: [page],
    facts: buildDeterministicFactEnvelope(item, [page]),
    result: semanticResult,
  });
}

async function run(item: VerificationCandidateInput, page: VerificationContext) {
  return runCandidateVerificationPipeline({
    provider: new MockProvider(),
    workspaceId: 'workspace',
    analysisRunId: 'analysis',
    verificationRunId: 'verification',
    candidate: item,
    availableContexts: [page],
    maxContexts: 2,
    entailmentMaxOutputTokens: 1_800,
    challengeMaxOutputTokens: 1_600,
  });
}

describe('meeting-consequence Pass A contract', () => {
  it('requires partial entailment with the omitted consequence exactly once', async () => {
    const item = candidate(
      'meeting-missing-consequence',
      'Offerors must attend the March 1, 2026 pre-proposal meeting.',
      requiredMeeting,
    );
    const page = context(`${requiredMeeting} ${consequence}.`);
    const facts = buildDeterministicFactEnvelope(item, [page]);
    expect(facts.atomicRelationship).toEqual({
      kind: 'parent_missing_material_condition',
      parentObligation: item.obligation,
      childObligation: null,
      evidence: consequence,
    });
    expect(facts.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'date',
          comparison: 'match',
          scopeComparison: 'unknown',
          materialScopeDifferences: [],
          materialScopeUnknowns: ['party'],
        }),
      ]),
    );

    expect(
      validate(item, page, result(item, 'partially_entails', requiredMeeting, [consequence])),
    ).toEqual({ success: true });
    expect(validate(item, page, result(item, 'entails', requiredMeeting))).toMatchObject({
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:missing_material_parent_condition',
    });
    expect(
      validate(
        item,
        page,
        result(item, 'partially_entails', requiredMeeting, [consequence, consequence]),
      ),
    ).toMatchObject({
      success: false,
      normalizedError:
        'semantic_contract_invalid:pass_a:material_parent_condition_requires_exactly_one_mismatch',
    });
    expect(
      validate(
        item,
        page,
        result(item, 'partially_entails', requiredMeeting, ['Nonattendance causes rejection']),
      ),
    ).toMatchObject({
      success: false,
      normalizedError:
        'semantic_contract_invalid:pass_a:material_parent_condition_requires_exactly_one_mismatch',
    });
    const opposing = result(item, 'partially_entails', requiredMeeting, [consequence]);
    opposing.contradictingEvidence = [reference(consequence)];
    expect(validate(item, page, opposing)).toMatchObject({ success: false });

    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'partially_entails',
      supportingEvidence: [reference(requiredMeeting)],
      contradictingEvidence: [],
      missingOrOverstatedQualifiers: [consequence],
      descriptiveOnly: false,
    });
    expect(output.entailmentCall).toMatchObject({ repairAttempts: 0, schemaAdherent: true });
    expect(output.finalAssessment).toMatchObject({
      sourceSupportStatus: 'partially_supported',
      precedenceStatus: 'active',
    });
  });

  it('supports a meeting candidate that includes the consequence', async () => {
    const source = `${requiredMeeting} ${consequence}.`;
    const item = candidate(
      'meeting-with-consequence',
      'Attendance at the mandatory pre-proposal meeting on March 1, 2026 at 10:00 AM local time is required. Failure to attend disqualifies an offeror.',
      source,
    );
    const page = context(source);
    expect(buildDeterministicFactEnvelope(item, [page]).atomicRelationship.kind).toBe('equivalent');
    expect(validate(item, page, result(item, 'entails', source))).toEqual({ success: true });
    const forbidden = result(item, 'entails', source, [consequence]);
    expect(validate(item, page, forbidden)).toMatchObject({ success: false });
    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'entails',
      missingOrOverstatedQualifiers: [],
      contradictingEvidence: [],
    });
    expect(output.finalAssessment?.sourceSupportStatus).toBe('supported');
  });

  it('uses explicit opposing evidence for a meeting-date mismatch', async () => {
    const item = candidate(
      'meeting-date-mismatch',
      'Offerors must attend the March 2, 2026 pre-proposal meeting.',
      requiredMeeting,
    );
    const page = context(`${requiredMeeting} ${consequence}.`);
    expect(buildDeterministicFactEnvelope(item, [page]).comparisons).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'date', comparison: 'mismatch' })]),
    );
    expect(validate(item, page, result(item, 'contradicts', requiredMeeting))).toEqual({
      success: true,
    });
    const forbidden = result(item, 'contradicts', requiredMeeting, [consequence]);
    expect(validate(item, page, forbidden)).toMatchObject({ success: false });
    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'contradicts',
      supportingEvidence: [],
      missingOrOverstatedQualifiers: [],
    });
    expect(output.finalAssessment?.sourceSupportStatus).toBe('contradicted');
  });

  it('uses insufficient when bounded evidence does not establish a meeting', async () => {
    const unrelated = 'A vendor networking reception may be announced separately.';
    const item = candidate(
      'meeting-not-established',
      'Offerors must attend the March 1, 2026 pre-proposal meeting.',
      requiredMeeting,
    );
    const page = context(unrelated);
    expect(validate(item, page, result(item, 'insufficient', unrelated))).toEqual({
      success: true,
    });
    const forbidden = result(item, 'insufficient', unrelated);
    forbidden.supportingEvidence = [reference(unrelated)];
    expect(validate(item, page, forbidden)).toMatchObject({ success: false });
    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'insufficient',
      supportingEvidence: [],
      contradictingEvidence: [],
      missingOrOverstatedQualifiers: [],
    });
    expect(output.finalAssessment?.sourceSupportStatus).toBe('unsupported');
  });

  it('uses contradiction only for explicit evidence that no meeting is required', async () => {
    const noMeeting = 'No pre-proposal meeting is required.';
    const item = candidate(
      'meeting-explicitly-not-required',
      'Offerors must attend a mandatory pre-proposal meeting.',
      noMeeting,
    );
    const page = context(noMeeting);
    expect(validate(item, page, result(item, 'contradicts', noMeeting))).toEqual({ success: true });
    const forbidden = result(item, 'contradicts', noMeeting);
    forbidden.supportingEvidence = [reference(noMeeting)];
    expect(validate(item, page, forbidden)).toMatchObject({ success: false });
    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'contradicts',
      supportingEvidence: [],
      contradictingEvidence: [reference(noMeeting)],
      missingOrOverstatedQualifiers: [],
    });
    expect(output.finalAssessment?.sourceSupportStatus).toBe('contradicted');
  });

  it('does not convert unknown party scope into a mismatch when the date matches', async () => {
    const item = candidate(
      'meeting-unknown-party',
      'Offerors must attend the March 1, 2026 pre-proposal meeting.',
      requiredMeeting,
    );
    const page = context(requiredMeeting);
    const facts = buildDeterministicFactEnvelope(item, [page]);
    expect(facts.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'date',
          comparison: 'match',
          scopeComparison: 'unknown',
          materialScopeDifferences: [],
        }),
      ]),
    );
    expect(validate(item, page, result(item, 'entails', requiredMeeting))).toEqual({
      success: true,
    });
    const forbidden = result(item, 'entails', requiredMeeting, ['party scope unavailable']);
    expect(validate(item, page, forbidden)).toMatchObject({ success: false });
    const output = await run(item, page);
    expect(output.entailment).toMatchObject({
      classification: 'entails',
      missingOrOverstatedQualifiers: [],
      contradictingEvidence: [],
    });
    expect(output.finalAssessment?.sourceSupportStatus).toBe('supported');
  });
});
