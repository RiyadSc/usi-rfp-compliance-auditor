import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  checklistCategorySchema,
  precedenceStatusSchema,
  sourceSupportStatusSchema,
  type ChecklistCategory,
} from './checklist';
import { normalizePhase9Evidence } from './phase9-bridge';

export const PHASE9_REVIEW_PRIORITY_VERSION = 'phase9-review-priority-v1';
export const PHASE9_DUPLICATE_POLICY_VERSION = 'phase9-duplicate-policy-v1';
export const PHASE9_BATCH_REVIEW_POLICY_VERSION = 'phase9-batch-review-policy-v1';
export const PHASE9_REVIEW_EFFORT_VERSION = 'phase9-review-effort-v1';
export const PHASE9_REVIEW_ANALYTICS_VERSION = 'phase9-review-analytics-v1';
export const GUIDED_PRODUCT_TOUR_VERSION = 'guided-product-tour-v1';

export const PHASE9_REVIEW_LANES = ['critical', 'exception', 'duplicate', 'routine'] as const;
export const phase9ReviewLaneSchema = z.enum(PHASE9_REVIEW_LANES);
export type Phase9ReviewLane = z.infer<typeof phase9ReviewLaneSchema>;

export const PHASE9_BATCH_ACTIONS = [
  'accept_routine',
  'reject_duplicate',
  'mark_follow_up',
] as const;
export const phase9BatchActionSchema = z.enum(PHASE9_BATCH_ACTIONS);
export type Phase9BatchAction = z.infer<typeof phase9BatchActionSchema>;

export const PHASE9_REVIEW_EVENT_TYPES = [
  'review_session_started',
  'finding_opened',
  'source_page_opened',
  'individual_decision_recorded',
  'batch_operation_completed',
  'coverage_exception_reviewed',
  'publication_attempted',
  'publication_completed',
] as const;
export const phase9ReviewEventTypeSchema = z.enum(PHASE9_REVIEW_EVENT_TYPES);

const quoteMatchSchema = z.enum(['exact', 'normalized_exact', 'fuzzy_candidate', 'not_found']);

export const phase9ReviewFindingSchema = z
  .object({
    candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceSupportStatus: sourceSupportStatusSchema,
    precedenceStatus: precedenceStatusSchema,
    category: checklistCategorySchema,
    requirementType: z.string().trim().min(1).max(120),
    obligationText: z.string().trim().min(1).max(8000),
    evidenceText: z.string().max(8000),
    evidenceCount: z.number().int().nonnegative(),
    pageReferencesComplete: z.boolean(),
    quoteMatchType: quoteMatchSchema,
    ambiguityCode: z.string().trim().min(1).max(200).nullable(),
    parserUncertain: z.boolean(),
    unresolvedCoverageException: z.boolean(),
    machineOnly: z.boolean(),
    duplicateOfCandidateHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    humanDecision: z.enum(['accepted', 'rejected', 'needs_follow_up']).nullable().default(null),
    mandatoryClass: z.enum(['mandatory', 'optional', 'uncertain']).default('uncertain'),
    sourceDocumentId: z.string().uuid(),
    sourcePage: z.number().int().positive().nullable(),
    sourceOrder: z.number().int().nonnegative().default(0),
    deadlineIso: z.string().datetime({ offset: true }).nullable().default(null),
    formReference: z.string().trim().max(160).nullable().default(null),
    materialFacts: z.record(z.string(), z.unknown()).default({}),
    sourceBlockHashes: z.array(z.string().min(1).max(160)).max(20).default([]),
  })
  .strict();
export type Phase9ReviewFinding = z.infer<typeof phase9ReviewFindingSchema>;

const CRITICAL_CATEGORIES = new Set<ChecklistCategory>([
  'submission_deadline',
  'question_deadline',
  'mandatory_form',
  'pricing_form',
  'signature',
  'initials',
  'attestation',
  'acknowledgment',
  'addendum_acknowledgment',
  'insurance',
  'bond',
  'license',
  'certification',
  'pre_bid_conference',
  'site_visit',
  'delivery_method',
  'electronic_submission',
  'physical_submission',
  'copy_count',
  'file_format',
  'naming_requirement',
  'packaging_requirement',
  'attachment',
  'subcontractor_disclosure',
]);

const CRITICAL_MEANING =
  /\b(deadline|due date|bid opening|proposal opening|mandatory form|required form|pricing (?:form|sheet|submission)|signature|signed|initials?|attest(?:ation)?|acknowledg(?:e|ment)|insurance|bond|licen[cs]e|permit|pre[- ]?bid|site visit|delivery method|electronic submission|physical submission|hard cop(?:y|ies)|copy count|file (?:format|name|naming)|packag(?:e|ing)|seal(?:ed|ing)|mandatory attachment|subcontractor disclosure|failure to (?:submit|attend).*(?:reject|disqualif)|shall be rejected|will be rejected)\b/i;

export function isPhase9CriticalFinding(finding: Phase9ReviewFinding): boolean {
  const parsed = phase9ReviewFindingSchema.parse(finding);
  if (CRITICAL_CATEGORIES.has(parsed.category)) return true;
  return (
    parsed.mandatoryClass === 'mandatory' &&
    CRITICAL_MEANING.test(`${parsed.obligationText} ${parsed.formReference ?? ''}`)
  );
}

export type Phase9LaneAssignment = {
  version: typeof PHASE9_REVIEW_PRIORITY_VERSION;
  lane: Phase9ReviewLane;
  reason:
    | 'source_not_supported'
    | 'precedence_not_active'
    | 'evidence_missing'
    | 'page_reference_incomplete'
    | 'quotation_not_validated'
    | 'ambiguity_present'
    | 'parser_uncertain'
    | 'coverage_exception_unresolved'
    | 'machine_status_ineligible'
    | 'submission_critical'
    | 'deterministic_noncanonical_duplicate'
    | 'clean_routine';
};

/** Precedence is intentionally exception → critical → duplicate → routine. */
export function assignPhase9ReviewLane(raw: Phase9ReviewFinding): Phase9LaneAssignment {
  const finding = phase9ReviewFindingSchema.parse(raw);
  if (finding.sourceSupportStatus !== 'supported')
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'source_not_supported',
    };
  if (finding.precedenceStatus !== 'active')
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'precedence_not_active',
    };
  if (!finding.machineOnly)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'machine_status_ineligible',
    };
  if (finding.evidenceCount < 1)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'evidence_missing',
    };
  if (!finding.pageReferencesComplete)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'page_reference_incomplete',
    };
  if (!['exact', 'normalized_exact'].includes(finding.quoteMatchType))
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'quotation_not_validated',
    };
  if (finding.ambiguityCode)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'ambiguity_present',
    };
  if (finding.parserUncertain)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'parser_uncertain',
    };
  if (finding.unresolvedCoverageException)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'exception',
      reason: 'coverage_exception_unresolved',
    };
  if (isPhase9CriticalFinding(finding))
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'critical',
      reason: 'submission_critical',
    };
  if (finding.duplicateOfCandidateHash)
    return {
      version: PHASE9_REVIEW_PRIORITY_VERSION,
      lane: 'duplicate',
      reason: 'deterministic_noncanonical_duplicate',
    };
  return {
    version: PHASE9_REVIEW_PRIORITY_VERSION,
    lane: 'routine',
    reason: 'clean_routine',
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function phase9DuplicateSignature(raw: Phase9ReviewFinding): string {
  const finding = phase9ReviewFindingSchema.parse(raw);
  return createHash('sha256')
    .update(
      [
        PHASE9_DUPLICATE_POLICY_VERSION,
        normalizePhase9Evidence(finding.obligationText).toLowerCase(),
        finding.category,
        finding.sourceDocumentId,
        finding.precedenceStatus,
        stableJson(finding.materialFacts),
        normalizePhase9Evidence(finding.evidenceText).toLowerCase(),
        [...finding.sourceBlockHashes].sort().join(','),
      ].join('|'),
    )
    .digest('hex');
}

export type Phase9DuplicateGroup = {
  version: typeof PHASE9_DUPLICATE_POLICY_VERSION;
  groupKey: string;
  canonicalCandidateHash: string;
  candidateHashes: string[];
  reason: 'exact_normalized_obligation_category_source_facts_evidence_match';
};

/** Exact deterministic grouping only; materially different facts produce different signatures. */
export function groupPhase9DeterministicDuplicates(
  rawFindings: Phase9ReviewFinding[],
): Phase9DuplicateGroup[] {
  const findings = rawFindings.map((finding) => phase9ReviewFindingSchema.parse(finding));
  const groups = new Map<string, Phase9ReviewFinding[]>();
  for (const finding of findings) {
    if (finding.precedenceStatus !== 'active') continue;
    const signature = phase9DuplicateSignature(finding);
    groups.set(signature, [...(groups.get(signature) ?? []), finding]);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([groupKey, entries]) => {
      const ordered = [...entries].sort(
        (left, right) =>
          left.sourceOrder - right.sourceOrder ||
          (left.sourcePage ?? Number.MAX_SAFE_INTEGER) -
            (right.sourcePage ?? Number.MAX_SAFE_INTEGER) ||
          left.candidateHash.localeCompare(right.candidateHash),
      );
      return {
        version: PHASE9_DUPLICATE_POLICY_VERSION,
        groupKey,
        canonicalCandidateHash: ordered[0].candidateHash,
        candidateHashes: ordered.map((entry) => entry.candidateHash),
        reason: 'exact_normalized_obligation_category_source_facts_evidence_match',
      };
    })
    .sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

export type Phase9BatchEligibility = {
  version: typeof PHASE9_BATCH_REVIEW_POLICY_VERSION;
  eligible: boolean;
  reason:
    | 'eligible_routine'
    | 'eligible_noncanonical_duplicate'
    | 'eligible_explicit_follow_up'
    | 'already_reviewed'
    | 'critical_requires_individual_review'
    | 'exception_requires_individual_review'
    | 'not_routine'
    | 'not_deterministic_duplicate';
};

export function evaluatePhase9BatchEligibility(
  raw: Phase9ReviewFinding,
  action: Phase9BatchAction,
): Phase9BatchEligibility {
  const finding = phase9ReviewFindingSchema.parse(raw);
  const assignment = assignPhase9ReviewLane(finding);
  if (finding.humanDecision)
    return {
      version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
      eligible: false,
      reason: 'already_reviewed',
    };
  if (action === 'mark_follow_up')
    return {
      version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
      eligible: true,
      reason: 'eligible_explicit_follow_up',
    };
  if (assignment.lane === 'critical')
    return {
      version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
      eligible: false,
      reason: 'critical_requires_individual_review',
    };
  if (assignment.lane === 'exception')
    return {
      version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
      eligible: false,
      reason: 'exception_requires_individual_review',
    };
  if (action === 'accept_routine')
    return assignment.lane === 'routine'
      ? {
          version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
          eligible: true,
          reason: 'eligible_routine',
        }
      : {
          version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
          eligible: false,
          reason: 'not_routine',
        };
  return assignment.lane === 'duplicate' && Boolean(finding.duplicateOfCandidateHash)
    ? {
        version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
        eligible: true,
        reason: 'eligible_noncanonical_duplicate',
      }
    : {
        version: PHASE9_BATCH_REVIEW_POLICY_VERSION,
        eligible: false,
        reason: 'not_deterministic_duplicate',
      };
}

export type Phase9ReviewEffortEstimate = {
  version: typeof PHASE9_REVIEW_EFFORT_VERSION;
  minimumMinutes: number;
  maximumMinutes: number;
  basis: 'observed_and_conservative_defaults' | 'conservative_defaults';
  disclosure: string;
};

export function estimatePhase9ReviewEffort(input: {
  unresolvedIndividualItems: number;
  unresolvedDuplicateGroups: number;
  unresolvedBatchEligibleRoutineItems: number;
  observedSecondsPerIndividualDecision?: number | null;
  observedSecondsPerBatchItem?: number | null;
}): Phase9ReviewEffortEstimate {
  const individualSeconds =
    input.observedSecondsPerIndividualDecision &&
    input.observedSecondsPerIndividualDecision >= 20 &&
    input.observedSecondsPerIndividualDecision <= 600
      ? input.observedSecondsPerIndividualDecision
      : 75;
  const batchSeconds =
    input.observedSecondsPerBatchItem &&
    input.observedSecondsPerBatchItem >= 2 &&
    input.observedSecondsPerBatchItem <= 120
      ? input.observedSecondsPerBatchItem
      : 8;
  const midpointSeconds =
    Math.max(0, input.unresolvedIndividualItems) * individualSeconds +
    Math.max(0, input.unresolvedDuplicateGroups) * 45 +
    Math.max(0, input.unresolvedBatchEligibleRoutineItems) * batchSeconds;
  const minimumMinutes = midpointSeconds === 0 ? 0 : Math.max(1, Math.floor(midpointSeconds / 75));
  const maximumMinutes =
    midpointSeconds === 0 ? 0 : Math.max(minimumMinutes, Math.ceil(midpointSeconds / 45));
  const observed = Boolean(
    input.observedSecondsPerIndividualDecision || input.observedSecondsPerBatchItem,
  );
  return {
    version: PHASE9_REVIEW_EFFORT_VERSION,
    minimumMinutes,
    maximumMinutes,
    basis: observed ? 'observed_and_conservative_defaults' : 'conservative_defaults',
    disclosure:
      'This is a planning range based on remaining individual, duplicate-group, and batch-eligible work. Actual review time varies with source complexity and reviewer judgment.',
  };
}

export function sortPhase9ReviewQueue(
  left: Phase9ReviewFinding,
  right: Phase9ReviewFinding,
): number {
  const leftLane = assignPhase9ReviewLane(left).lane;
  const rightLane = assignPhase9ReviewLane(right).lane;
  const laneOrder: Record<Phase9ReviewLane, number> = {
    critical: 0,
    exception: 1,
    duplicate: 2,
    routine: 3,
  };
  return (
    Number(Boolean(left.humanDecision)) - Number(Boolean(right.humanDecision)) ||
    laneOrder[leftLane] - laneOrder[rightLane] ||
    (left.deadlineIso ? Date.parse(left.deadlineIso) : Number.MAX_SAFE_INTEGER) -
      (right.deadlineIso ? Date.parse(right.deadlineIso) : Number.MAX_SAFE_INTEGER) ||
    Number(right.mandatoryClass === 'mandatory') - Number(left.mandatoryClass === 'mandatory') ||
    left.sourceOrder - right.sourceOrder ||
    (left.sourcePage ?? Number.MAX_SAFE_INTEGER) - (right.sourcePage ?? Number.MAX_SAFE_INTEGER) ||
    left.candidateHash.localeCompare(right.candidateHash)
  );
}

export const guidedTourPlacementSchema = z.enum(['top', 'bottom', 'left', 'right']);
export const guidedTourStepSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    targetKey: z.string().regex(/^[a-z0-9-]+$/),
    route: z.string().startsWith('/'),
    title: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(320),
    preferredPlacement: guidedTourPlacementSchema,
    interactionRequirement: z.enum(['informational', 'optional_action', 'required_navigation']),
    required: z.boolean().default(true),
    presenterNote: z.string().trim().max(240).optional(),
  })
  .strict();
export type GuidedTourStep = z.infer<typeof guidedTourStepSchema>;

export const guidedTourDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: z.literal(GUIDED_PRODUCT_TOUR_VERSION),
    audience: z.enum(['first_run', 'presenter']),
    demoOnly: z.boolean(),
    steps: z.array(guidedTourStepSchema).min(1).max(24),
  })
  .strict()
  .superRefine((value, context) => {
    const stepIds = new Set<string>();
    const targetIds = new Set<string>();
    for (const [index, step] of value.steps.entries()) {
      if (stepIds.has(step.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'id'],
          message: 'Tour step IDs must be unique.',
        });
      stepIds.add(step.id);
      if (targetIds.has(step.targetKey))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'targetKey'],
          message: 'Tour target keys must be unique.',
        });
      targetIds.add(step.targetKey);
    }
  });
export type GuidedTourDefinition = z.infer<typeof guidedTourDefinitionSchema>;

export type GuidedTourRuntimeState = {
  status: 'idle' | 'active' | 'completed' | 'dismissed';
  stepIndex: number;
  missingTarget: string | null;
};

export function transitionGuidedTourState(
  state: GuidedTourRuntimeState,
  event: 'start' | 'next' | 'back' | 'exit' | 'skip' | 'finish' | 'target_missing' | 'retry',
  stepCount: number,
  targetKey?: string,
): GuidedTourRuntimeState {
  if (event === 'start') return { status: 'active', stepIndex: 0, missingTarget: null };
  if (event === 'exit' || event === 'skip')
    return { ...state, status: 'dismissed', missingTarget: null };
  if (event === 'finish')
    return {
      status: 'completed',
      stepIndex: Math.max(0, stepCount - 1),
      missingTarget: null,
    };
  if (event === 'target_missing') return { ...state, missingTarget: targetKey ?? 'unknown-target' };
  if (event === 'retry') return { ...state, missingTarget: null };
  if (state.status !== 'active') return state;
  if (event === 'back')
    return { ...state, stepIndex: Math.max(0, state.stepIndex - 1), missingTarget: null };
  if (event === 'next') {
    if (state.stepIndex >= stepCount - 1)
      return {
        status: 'completed',
        stepIndex: Math.max(0, stepCount - 1),
        missingTarget: null,
      };
    return { ...state, stepIndex: state.stepIndex + 1, missingTarget: null };
  }
  return state;
}
