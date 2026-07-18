import type { VerificationCandidateInput, VerificationContext } from './provider';
import type { DeterministicFactEnvelope } from './verification-decision-engine';
import {
  challengeResultSchema,
  entailmentResultSchema,
  type ChallengeResult,
  type EntailmentResult,
} from './verification-v3-schemas';
import { normalizeEvidenceText, validateEvidenceQuote } from './deterministic-verification';

export type SemanticContractValidation =
  { success: true } | { success: false; normalizedError: string };

function normalized(value: string) {
  return normalizeEvidenceText(value).toLowerCase();
}

function normalizedIssues(prefix: string, issues: Array<{ path: PropertyKey[]; message: string }>) {
  return `${prefix}:${issues
    .map((issue) => `${issue.path.map(String).join('.') || 'root'}:${issue.message}`)
    .join('|')
    .slice(0, 900)}`;
}

function validateEvidenceReferences(
  stage: 'pass_a' | 'pass_b',
  contexts: VerificationContext[],
  references: Array<{ documentId: string; pageNumber: number; quote: string }>,
): SemanticContractValidation {
  for (const reference of references) {
    const context = contexts.find(
      (item) =>
        item.documentId === reference.documentId && item.pageNumber === reference.pageNumber,
    );
    if (!context)
      return {
        success: false,
        normalizedError: `semantic_contract_invalid:${stage}:evidence_page_not_supplied`,
      };
    if (
      !['exact', 'normalized_exact'].includes(
        validateEvidenceQuote(context.text, reference.quote).matchType,
      )
    )
      return {
        success: false,
        normalizedError: `semantic_contract_invalid:${stage}:evidence_quote_not_exact`,
      };
  }
  return { success: true };
}

export function validateEntailmentSemanticContract(input: {
  candidate: VerificationCandidateInput;
  contexts: VerificationContext[];
  facts: DeterministicFactEnvelope;
  result: unknown;
}): SemanticContractValidation {
  const parsed = entailmentResultSchema.safeParse(input.result);
  if (!parsed.success)
    return {
      success: false,
      normalizedError: normalizedIssues('semantic_contract_invalid:pass_a', parsed.error.issues),
    };
  if (parsed.data.candidateId !== input.candidate.id)
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:candidate_id_mismatch',
    };
  const evidenceValidation = validateEvidenceReferences('pass_a', input.contexts, [
    ...parsed.data.supportingEvidence,
    ...parsed.data.contradictingEvidence,
  ]);
  if (!evidenceValidation.success) return evidenceValidation;
  const present = new Set(parsed.data.materialQualifiersPresent.map(normalized));
  if (parsed.data.missingOrOverstatedQualifiers.some((item) => present.has(normalized(item))))
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:qualifier_present_and_missing',
    };
  if (
    parsed.data.missingOrOverstatedQualifiers.some((item) =>
      /\b(?:stylistic|synonym|wording only|additive|source word|also)\b/i.test(item),
    )
  )
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:non_material_wording_mismatch',
    };
  if (
    parsed.data.classification === 'entails' &&
    input.facts.atomicRelationship.kind === 'parent_missing_material_condition'
  )
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:missing_material_parent_condition',
    };
  const materialParentConditionApplies =
    input.facts.atomicRelationship.kind === 'parent_missing_material_condition' &&
    input.facts.parserReliable &&
    ['exact', 'normalized_exact'].includes(input.facts.candidateQuoteMatch.matchType) &&
    !input.facts.comparisons.some((comparison) => comparison.comparison === 'mismatch');
  if (materialParentConditionApplies) {
    if (parsed.data.classification !== 'partially_entails')
      return {
        success: false,
        normalizedError:
          'semantic_contract_invalid:pass_a:material_parent_condition_requires_partial',
      };
    const expectedCondition = normalized(input.facts.atomicRelationship.evidence ?? '');
    const conditionMatches = parsed.data.missingOrOverstatedQualifiers.filter(
      (item) => normalized(item) === expectedCondition,
    );
    if (
      !expectedCondition ||
      parsed.data.missingOrOverstatedQualifiers.length !== 1 ||
      conditionMatches.length !== 1
    )
      return {
        success: false,
        normalizedError:
          'semantic_contract_invalid:pass_a:material_parent_condition_requires_exactly_one_mismatch',
      };
  }
  if (
    parsed.data.classification === 'partially_entails' &&
    input.facts.atomicRelationship.kind === 'parent_with_additive_child'
  )
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_a:additive_child_is_not_parent_mismatch',
    };
  return { success: true };
}

export function validateChallengeSemanticContract(input: {
  candidate: VerificationCandidateInput;
  contexts: VerificationContext[];
  facts: DeterministicFactEnvelope;
  result: unknown;
}): SemanticContractValidation {
  const parsed = challengeResultSchema.safeParse(input.result);
  if (!parsed.success)
    return {
      success: false,
      normalizedError: normalizedIssues('semantic_contract_invalid:pass_b', parsed.error.issues),
    };
  if (parsed.data.candidateId !== input.candidate.id)
    return {
      success: false,
      normalizedError: 'semantic_contract_invalid:pass_b:candidate_id_mismatch',
    };
  const candidateText = normalized(input.candidate.obligation);
  for (const objection of parsed.data.objections) {
    if (!candidateText.includes(normalized(objection.candidateProposition)))
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:candidate_proposition_not_exact',
      };
    const evidenceValidation = validateEvidenceReferences(
      'pass_b',
      input.contexts,
      objection.evidence,
    );
    if (!evidenceValidation.success) return evidenceValidation;
    const qualifier = normalized(objection.qualifierOrConflict);
    const evidenceText = normalized(objection.evidence[0]!.quote);
    if (
      ['missing_condition', 'omitted_exception'].includes(objection.type) &&
      candidateText.includes(qualifier)
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:claimed_missing_text_present',
      };
    if (
      [
        'missing_condition',
        'overstated_scope',
        'wrong_party',
        'wrong_form',
        'omitted_exception',
      ].includes(objection.type) &&
      !evidenceText.includes(qualifier)
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:qualifier_not_grounded',
      };
    if (
      [
        'missing_condition',
        'overstated_scope',
        'wrong_party',
        'wrong_form',
        'omitted_exception',
      ].includes(objection.type)
    ) {
      const explicitScopeDifferences = input.facts.comparisons.flatMap(
        (comparison) => comparison.materialScopeDifferences,
      );
      const requiredDifference =
        objection.type === 'wrong_party'
          ? 'party'
          : objection.type === 'wrong_form'
            ? 'form'
            : null;
      const hasTypedDifference = requiredDifference
        ? explicitScopeDifferences.includes(requiredDifference)
        : explicitScopeDifferences.length > 0;
      const hasMaterialParentCondition =
        input.facts.atomicRelationship.kind === 'parent_missing_material_condition';
      if (!hasTypedDifference && !hasMaterialParentCondition)
        return {
          success: false,
          normalizedError:
            'semantic_contract_invalid:pass_b:no_explicit_comparable_scope_difference',
        };
    }
    if (
      objection.type === 'wrong_deadline' &&
      !input.facts.comparisons.some(
        (comparison) => comparison.kind === 'date' && comparison.comparison === 'mismatch',
      )
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:no_date_mismatch',
      };
    if (
      objection.type === 'wrong_amount_or_unit' &&
      !input.facts.comparisons.some(
        (comparison) => comparison.kind === 'number' && comparison.comparison === 'mismatch',
      )
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:no_number_mismatch',
      };
    if (
      objection.type === 'superseding_addendum' &&
      input.facts.deterministicPrecedence !== 'superseded'
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:no_supersession',
      };
    if (
      objection.type === 'unresolved_conflict' &&
      input.facts.deterministicPrecedence !== 'conflicting'
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:no_unresolved_conflict',
      };
    if (objection.type === 'parser_quality' && input.facts.parserReliable)
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:parser_is_reliable',
      };
    if (
      objection.type === 'descriptive_not_obligatory' &&
      !input.facts.descriptiveOrInjectionLanguage
    )
      return {
        success: false,
        normalizedError: 'semantic_contract_invalid:pass_b:not_descriptive_or_injection_text',
      };
  }
  return { success: true };
}

export function asEntailmentResult(result: unknown): EntailmentResult | null {
  const parsed = entailmentResultSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export function asChallengeResult(result: unknown): ChallengeResult | null {
  const parsed = challengeResultSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}
