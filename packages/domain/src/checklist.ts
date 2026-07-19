import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CHECKLIST_ELIGIBILITY_VERSION = 'checklist-eligibility-v1';
export const CHECKLIST_CATEGORY_VERSION = 'checklist-category-v1';
export const CHECKLIST_GENERATOR_VERSION = 'checklist-generator-v1';
export const CHECKLIST_BLOCKER_VERSION = 'checklist-blockers-v1';
export const CHECKLIST_READINESS_VERSION = 'checklist-readiness-v1';
export const CHECKLIST_SCHEMA_VERSION = 'checklist-schema-v1';

export const CHECKLIST_CATEGORIES = [
  'mandatory_form',
  'submission_deadline',
  'question_deadline',
  'signature',
  'initials',
  'acknowledgment',
  'addendum_acknowledgment',
  'insurance',
  'bond',
  'certification',
  'license',
  'attestation',
  'attachment',
  'staffing_plan',
  'resume',
  'meeting',
  'pre_bid_conference',
  'site_visit',
  'pricing_form',
  'technical_response',
  'reference',
  'subcontractor_disclosure',
  'packaging_requirement',
  'delivery_method',
  'electronic_submission',
  'physical_submission',
  'copy_count',
  'file_format',
  'naming_requirement',
  'other_material_requirement',
] as const;

export const checklistCategorySchema = z.enum(CHECKLIST_CATEGORIES);
export type ChecklistCategory = z.infer<typeof checklistCategorySchema>;

export const CHECKLIST_WORKFLOW_STATUSES = [
  'not_started',
  'in_progress',
  'ready_for_review',
  'completed',
  'waived',
  'blocked',
  'not_applicable',
  'requires_human_proof',
  'unresolved',
] as const;
export const checklistWorkflowStatusSchema = z.enum(CHECKLIST_WORKFLOW_STATUSES);
export type ChecklistWorkflowStatus = z.infer<typeof checklistWorkflowStatusSchema>;

export const ARTIFACT_STATES = [
  'missing',
  'uploaded',
  'linked',
  'pending_review',
  'reviewed',
  'accepted_by_waiver',
  'requires_human_proof',
  'rejected',
  'not_applicable',
] as const;
export const artifactStateSchema = z.enum(ARTIFACT_STATES);
export type ArtifactState = z.infer<typeof artifactStateSchema>;

export const sourceSupportStatusSchema = z.enum([
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
]);
export const precedenceStatusSchema = z.enum([
  'active',
  'superseded',
  'conflicting',
  'undetermined',
]);
export const proofRequirementSchema = z.enum([
  'none_identified',
  'requires_human_confirmation',
  'requires_company_artifact',
  'requires_external_validation',
  'undetermined',
]);
export const humanReviewStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'needs_follow_up',
  'waived',
]);

export const checklistEligibilityInputSchema = z.object({
  sourceSupportStatus: sourceSupportStatusSchema,
  precedenceStatus: precedenceStatusSchema,
  proofRequirement: proofRequirementSchema,
  humanReviewStatus: humanReviewStatusSchema,
  machineStatus: z.literal('machine_assessment_only'),
  mandatory: z.boolean(),
  validatedEvidence: z.boolean().default(true),
});
export type ChecklistEligibilityInput = z.input<typeof checklistEligibilityInputSchema>;

export type EligibilityResult = {
  classification: 'ordinary_active' | 'review_needed' | 'unresolved_risk' | 'excluded';
  reason:
    | 'eligible_active_requirement'
    | 'human_review_pending'
    | 'human_review_rejected'
    | 'partial_source_support'
    | 'unsupported_source'
    | 'contradicted_source'
    | 'parser_uncertainty'
    | 'missing_validated_evidence'
    | 'superseded_requirement'
    | 'unresolved_precedence';
  contributesToRequiredTotal: boolean;
  workflowStatus: ChecklistWorkflowStatus;
  artifactState: ArtifactState;
  requiresArtifact: boolean;
};

export function evaluateChecklistEligibility(raw: ChecklistEligibilityInput): EligibilityResult {
  const input = checklistEligibilityInputSchema.parse(raw);
  const requiresArtifact = [
    'requires_human_confirmation',
    'requires_company_artifact',
    'requires_external_validation',
  ].includes(input.proofRequirement);
  const proofWorkflow: ChecklistWorkflowStatus = requiresArtifact
    ? 'requires_human_proof'
    : 'not_started';
  const proofArtifact: ArtifactState = requiresArtifact ? 'requires_human_proof' : 'not_applicable';

  if (input.sourceSupportStatus === 'supported' && !input.validatedEvidence)
    return {
      classification: 'review_needed',
      reason: 'missing_validated_evidence',
      contributesToRequiredTotal: input.mandatory,
      workflowStatus: 'unresolved',
      artifactState: proofArtifact,
      requiresArtifact,
    };

  if (input.sourceSupportStatus === 'parser_uncertain')
    return {
      classification: 'unresolved_risk',
      reason: 'parser_uncertainty',
      contributesToRequiredTotal: input.mandatory,
      workflowStatus: 'unresolved',
      artifactState: proofArtifact,
      requiresArtifact,
    };
  if (input.sourceSupportStatus === 'partially_supported')
    return {
      classification: 'review_needed',
      reason: 'partial_source_support',
      contributesToRequiredTotal: input.mandatory,
      workflowStatus: 'unresolved',
      artifactState: proofArtifact,
      requiresArtifact,
    };
  if (input.sourceSupportStatus === 'unsupported')
    return {
      classification: 'excluded',
      reason: 'unsupported_source',
      contributesToRequiredTotal: false,
      workflowStatus: 'not_applicable',
      artifactState: 'not_applicable',
      requiresArtifact: false,
    };
  if (input.sourceSupportStatus === 'contradicted')
    return {
      classification: 'excluded',
      reason: 'contradicted_source',
      contributesToRequiredTotal: false,
      workflowStatus: 'not_applicable',
      artifactState: 'not_applicable',
      requiresArtifact: false,
    };
  if (input.precedenceStatus === 'superseded')
    return {
      classification: 'excluded',
      reason: 'superseded_requirement',
      contributesToRequiredTotal: false,
      workflowStatus: 'not_applicable',
      artifactState: 'not_applicable',
      requiresArtifact: false,
    };
  if (input.precedenceStatus === 'conflicting' || input.precedenceStatus === 'undetermined')
    return {
      classification: 'unresolved_risk',
      reason: 'unresolved_precedence',
      contributesToRequiredTotal: input.mandatory,
      workflowStatus: 'unresolved',
      artifactState: proofArtifact,
      requiresArtifact,
    };
  if (input.humanReviewStatus === 'rejected')
    return {
      classification: 'excluded',
      reason: 'human_review_rejected',
      contributesToRequiredTotal: false,
      workflowStatus: 'not_applicable',
      artifactState: 'not_applicable',
      requiresArtifact: false,
    };
  if (input.humanReviewStatus === 'pending' || input.humanReviewStatus === 'needs_follow_up')
    return {
      classification: 'review_needed',
      reason: 'human_review_pending',
      contributesToRequiredTotal: input.mandatory,
      workflowStatus: 'unresolved',
      artifactState: proofArtifact,
      requiresArtifact,
    };
  return {
    classification: 'ordinary_active',
    reason: 'eligible_active_requirement',
    contributesToRequiredTotal: input.mandatory,
    workflowStatus: proofWorkflow,
    artifactState: proofArtifact,
    requiresArtifact,
  };
}

const includes = (value: string, pattern: RegExp) => pattern.test(value.toLowerCase());

export function mapChecklistCategory(input: {
  sourceCategory: string;
  title: string;
  obligation: string;
}): ChecklistCategory {
  const text = `${input.sourceCategory} ${input.title} ${input.obligation}`.toLowerCase();
  if (includes(text, /question.{0,20}deadline|questions? (?:are )?due/)) return 'question_deadline';
  if (includes(text, /submission deadline|proposal.{0,15}(?:due|deadline)|response deadline/))
    return 'submission_deadline';
  if (includes(text, /addendum.{0,20}acknowledg/)) return 'addendum_acknowledgment';
  if (includes(text, /initial(?:s|ed|ing)?\b/)) return 'initials';
  if (includes(text, /signature|signed|signatory/)) return 'signature';
  if (includes(text, /acknowledg/)) return 'acknowledgment';
  if (includes(text, /pricing|price schedule|bid schedule/)) return 'pricing_form';
  if (includes(text, /bond/)) return 'bond';
  if (includes(text, /insurance/)) return 'insurance';
  if (includes(text, /licen[cs]e/)) return 'license';
  if (includes(text, /certif/)) return 'certification';
  if (includes(text, /attest/)) return 'attestation';
  if (includes(text, /resume|curriculum vitae|\bcv\b/)) return 'resume';
  if (includes(text, /staffing plan/)) return 'staffing_plan';
  if (includes(text, /pre[- ]bid conference|pre[- ]proposal conference/))
    return 'pre_bid_conference';
  if (includes(text, /site visit|walkthrough/)) return 'site_visit';
  if (includes(text, /meeting/)) return 'meeting';
  if (includes(text, /subcontractor/)) return 'subcontractor_disclosure';
  if (includes(text, /reference(?:s)?\b/)) return 'reference';
  if (includes(text, /electronic|portal|email submission/)) return 'electronic_submission';
  if (includes(text, /physical|hard cop|paper delivery|sealed package/))
    return 'physical_submission';
  if (includes(text, /copies|copy count|original and .*cop/)) return 'copy_count';
  if (includes(text, /file format|\.pdf|\.docx|format requirement/)) return 'file_format';
  if (includes(text, /file nam|naming convention/)) return 'naming_requirement';
  if (includes(text, /packag|sealed envelope|label the/)) return 'packaging_requirement';
  if (includes(text, /delivery method|deliver to|submission method/)) return 'delivery_method';
  if (includes(text, /technical response|technical proposal|narrative response/))
    return 'technical_response';
  if (includes(text, /form [a-z0-9-]+|required_form|mandatory form/)) return 'mandatory_form';
  if (includes(text, /attachment|exhibit/)) return 'attachment';
  return 'other_material_requirement';
}

export const checklistSourceSchema = z.object({
  workspaceId: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  verificationRunId: z.string().uuid(),
  findingId: z.string().uuid(),
  findingVersion: z.number().int().positive(),
  candidateId: z.string().uuid(),
  title: z.string().min(1).max(500),
  obligation: z.string().min(1).max(8000),
  sourceCategory: z.string().min(1).max(100),
  mandatory: z.boolean(),
  sourceSupportStatus: sourceSupportStatusSchema,
  precedenceStatus: precedenceStatusSchema,
  proofRequirement: proofRequirementSchema,
  machineStatus: z.literal('machine_assessment_only'),
  humanReviewStatus: humanReviewStatusSchema,
  documentId: z.string().uuid().nullable(),
  documentPageId: z.string().uuid().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  exactQuote: z.string().max(8000).nullable(),
  parserConfidence: z.number().min(0).max(1).nullable().default(null),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  dueTimezone: z.string().min(1).max(100).nullable().default(null),
  relationshipRole: z.enum(['atomic', 'parent', 'child']).default('atomic'),
  verificationEvidenceId: z.string().uuid().nullable().default(null),
  validatedEvidence: z.boolean().default(false),
});
export type ChecklistSource = z.infer<typeof checklistSourceSchema>;

export type GeneratedChecklistItem = ChecklistSource & {
  stableKey: string;
  generatorVersion: typeof CHECKLIST_GENERATOR_VERSION;
  eligibilityVersion: typeof CHECKLIST_ELIGIBILITY_VERSION;
  categoryVersion: typeof CHECKLIST_CATEGORY_VERSION;
  category: ChecklistCategory;
  eligibility: EligibilityResult['classification'];
  eligibilityReason: EligibilityResult['reason'];
  contributesToRequiredTotal: boolean;
  workflowStatus: ChecklistWorkflowStatus;
  artifactState: ArtifactState;
  requiresArtifact: boolean;
};

export function generateChecklistItems(sources: ChecklistSource[]): GeneratedChecklistItem[] {
  return sources
    .map((raw) => {
      const source = checklistSourceSchema.parse(raw);
      const eligibility = evaluateChecklistEligibility({
        sourceSupportStatus: source.sourceSupportStatus,
        precedenceStatus: source.precedenceStatus,
        proofRequirement: source.proofRequirement,
        humanReviewStatus: source.humanReviewStatus,
        machineStatus: source.machineStatus,
        mandatory: source.mandatory,
        validatedEvidence: source.validatedEvidence,
      });
      const stableKey = createHash('sha256')
        .update(
          [
            source.workspaceId,
            source.verificationRunId,
            source.findingId,
            source.findingVersion,
            source.relationshipRole,
            CHECKLIST_GENERATOR_VERSION,
          ].join(':'),
        )
        .digest('hex');
      const category = mapChecklistCategory({
        sourceCategory: source.sourceCategory,
        title: source.title,
        obligation: source.obligation,
      });
      const categoryRequiresArtifact = [
        'mandatory_form',
        'signature',
        'initials',
        'acknowledgment',
        'addendum_acknowledgment',
        'attachment',
        'pricing_form',
        'technical_response',
        'resume',
        'staffing_plan',
        'bond',
        'certification',
        'license',
      ].includes(category);
      const requiresArtifact = eligibility.requiresArtifact || categoryRequiresArtifact;
      const artifactState =
        eligibility.artifactState === 'not_applicable' && categoryRequiresArtifact
          ? 'missing'
          : eligibility.artifactState;
      return {
        ...source,
        stableKey,
        generatorVersion: CHECKLIST_GENERATOR_VERSION,
        eligibilityVersion: CHECKLIST_ELIGIBILITY_VERSION,
        categoryVersion: CHECKLIST_CATEGORY_VERSION,
        category,
        eligibility: eligibility.classification,
        eligibilityReason: eligibility.reason,
        contributesToRequiredTotal: eligibility.contributesToRequiredTotal,
        workflowStatus: eligibility.workflowStatus,
        artifactState,
        requiresArtifact,
      } satisfies GeneratedChecklistItem;
    })
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey));
}

const ALLOWED_TRANSITIONS: Record<ChecklistWorkflowStatus, readonly ChecklistWorkflowStatus[]> = {
  not_started: [
    'in_progress',
    'ready_for_review',
    'waived',
    'blocked',
    'requires_human_proof',
    'unresolved',
  ],
  in_progress: [
    'not_started',
    'ready_for_review',
    'waived',
    'blocked',
    'requires_human_proof',
    'unresolved',
  ],
  ready_for_review: [
    'in_progress',
    'completed',
    'waived',
    'blocked',
    'requires_human_proof',
    'unresolved',
  ],
  completed: ['in_progress', 'blocked', 'unresolved'],
  waived: ['blocked', 'unresolved'],
  blocked: ['in_progress', 'ready_for_review', 'waived', 'requires_human_proof', 'unresolved'],
  not_applicable: ['unresolved'],
  requires_human_proof: ['in_progress', 'ready_for_review', 'waived', 'blocked', 'unresolved'],
  unresolved: ['in_progress', 'waived', 'blocked', 'requires_human_proof'],
};

export function assertWorkflowTransition(input: {
  from: ChecklistWorkflowStatus;
  to: ChecklistWorkflowStatus;
  sourceEligible: boolean;
  artifactSatisfied: boolean;
  reviewedWaiver: boolean;
}): void {
  if (!ALLOWED_TRANSITIONS[input.from].includes(input.to))
    throw new Error(`forbidden_workflow_transition:${input.from}:${input.to}`);
  if (!input.sourceEligible && ['completed', 'waived', 'ready_for_review'].includes(input.to))
    throw new Error('source_state_prevents_workflow_completion');
  if (input.to === 'completed' && !input.artifactSatisfied)
    throw new Error('required_artifact_not_satisfied');
  if (input.to === 'waived' && !input.reviewedWaiver) throw new Error('reviewed_waiver_required');
}

export const BLOCKER_SEVERITIES = ['critical', 'blocking', 'warning', 'informational'] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export type BlockerInputItem = Pick<
  GeneratedChecklistItem,
  | 'stableKey'
  | 'findingId'
  | 'title'
  | 'category'
  | 'mandatory'
  | 'eligibility'
  | 'eligibilityReason'
  | 'contributesToRequiredTotal'
  | 'workflowStatus'
  | 'artifactState'
  | 'proofRequirement'
  | 'precedenceStatus'
  | 'sourceSupportStatus'
  | 'dueAt'
  | 'dueTimezone'
  | 'relationshipRole'
> & {
  waiverStatus?: 'none' | 'requested' | 'accepted' | 'rejected' | 'expired';
  meetingConfirmed?: boolean;
};

export type DeterministicBlocker = {
  stableKey: string;
  itemStableKey: string;
  findingId: string;
  type: string;
  severity: BlockerSeverity;
  rule: string;
  resolutionRule: string;
  readinessImpact: boolean;
  message: string;
  engineVersion: typeof CHECKLIST_BLOCKER_VERSION;
};

function makeBlocker(
  item: BlockerInputItem,
  type: string,
  severity: BlockerSeverity,
  rule: string,
  resolutionRule: string,
  readinessImpact: boolean,
  message: string,
): DeterministicBlocker {
  return {
    stableKey: createHash('sha256')
      .update(`${item.stableKey}:${type}:${CHECKLIST_BLOCKER_VERSION}`)
      .digest('hex'),
    itemStableKey: item.stableKey,
    findingId: item.findingId,
    type,
    severity,
    rule,
    resolutionRule,
    readinessImpact,
    message,
    engineVersion: CHECKLIST_BLOCKER_VERSION,
  };
}

export function calculateBlockers(
  items: BlockerInputItem[],
  now = new Date(),
): DeterministicBlocker[] {
  const blockers: DeterministicBlocker[] = [];
  for (const item of items) {
    if (item.eligibility === 'excluded') continue;
    if (item.precedenceStatus === 'conflicting' || item.precedenceStatus === 'undetermined')
      blockers.push(
        makeBlocker(
          item,
          'unresolved_active_conflict',
          'critical',
          'active precedence is conflicting or undetermined',
          'authorized source review establishes controlling precedence',
          true,
          `Unresolved source precedence: ${item.title}`,
        ),
      );
    if (item.sourceSupportStatus === 'parser_uncertain')
      blockers.push(
        makeBlocker(
          item,
          'unresolved_parser_uncertainty',
          'blocking',
          'source page cannot be reliably assessed',
          'human review or improved parsing resolves the source uncertainty',
          true,
          `Human review required for parser uncertainty: ${item.title}`,
        ),
      );
    if (item.sourceSupportStatus === 'partially_supported')
      blockers.push(
        makeBlocker(
          item,
          'partial_source_support',
          'blocking',
          'material qualifier remains unresolved',
          'authorized review records the corrected atomic obligation',
          true,
          `Material requirement mismatch requires review: ${item.title}`,
        ),
      );
    if (item.eligibilityReason === 'human_review_pending')
      blockers.push(
        makeBlocker(
          item,
          'human_review_required',
          'blocking',
          'Phase 4 human review is pending or needs follow-up',
          'authorized reviewer accepts or policy-validly waives the assessment',
          true,
          `Human review required: ${item.title}`,
        ),
      );
    if (item.eligibilityReason === 'missing_validated_evidence')
      blockers.push(
        makeBlocker(
          item,
          'missing_validated_source_evidence',
          'critical',
          'no exact or normalized-exact validated Phase 4 evidence is linked',
          'validated same-workspace Phase 4 evidence is linked and checklist is regenerated',
          true,
          `Validated source evidence is required: ${item.title}`,
        ),
      );
    if (item.mandatory && item.category === 'mandatory_form' && item.artifactState === 'missing')
      blockers.push(
        makeBlocker(
          item,
          'missing_mandatory_form',
          'critical',
          'mandatory form artifact is missing',
          'validated form artifact is linked or a reviewed final waiver is accepted',
          true,
          `Missing mandatory form: ${item.title}`,
        ),
      );
    else if (
      item.mandatory &&
      item.artifactState === 'missing' &&
      ['attachment', 'signature', 'initials', 'acknowledgment', 'addendum_acknowledgment'].includes(
        item.category,
      )
    )
      blockers.push(
        makeBlocker(
          item,
          `missing_${item.category}`,
          'critical',
          `mandatory ${item.category} artifact is missing`,
          'required artifact is linked/reviewed or a reviewed final waiver is accepted',
          true,
          `Missing required ${item.category.replaceAll('_', ' ')}: ${item.title}`,
        ),
      );
    if (
      item.proofRequirement !== 'none_identified' &&
      ['missing', 'requires_human_proof', 'rejected'].includes(item.artifactState) &&
      item.waiverStatus !== 'accepted'
    )
      blockers.push(
        makeBlocker(
          item,
          'required_human_proof_missing',
          'blocking',
          'required company/human/external proof is not reviewed',
          'proof is linked and reviewed or a reviewed final waiver is accepted',
          true,
          `Required human proof is missing: ${item.title}`,
        ),
      );
    if (item.relationshipRole === 'child' && item.mandatory && item.workflowStatus !== 'completed')
      blockers.push(
        makeBlocker(
          item,
          'incomplete_mandatory_child',
          'blocking',
          'atomic child obligation is incomplete',
          'child obligation is completed without merging it into the parent',
          true,
          `Incomplete required child obligation: ${item.title}`,
        ),
      );
    if (['requested', 'rejected', 'expired'].includes(item.waiverStatus ?? 'none'))
      blockers.push(
        makeBlocker(
          item,
          'invalid_or_unreviewed_waiver',
          'blocking',
          'waiver is not accepted and final',
          'authorized reviewer accepts a final waiver or the item is completed',
          true,
          `Waiver does not remove this blocker: ${item.title}`,
        ),
      );
    if (
      ['meeting', 'pre_bid_conference', 'site_visit'].includes(item.category) &&
      item.mandatory &&
      !item.meetingConfirmed
    )
      blockers.push(
        makeBlocker(
          item,
          'required_meeting_unconfirmed',
          'blocking',
          'mandatory attendance is not confirmed',
          'authorized human confirms attendance evidence',
          true,
          `Mandatory attendance is not confirmed: ${item.title}`,
        ),
      );
    if (item.dueAt) {
      const due = new Date(item.dueAt);
      const remaining = due.getTime() - now.getTime();
      if (remaining < 0 && item.workflowStatus !== 'completed')
        blockers.push(
          makeBlocker(
            item,
            'missed_deadline',
            'critical',
            'explicit deadline passed before completion',
            'authorized review records the disposition; time cannot be silently changed',
            true,
            `Deadline passed: ${item.title}`,
          ),
        );
      else if (remaining >= 0 && remaining <= 72 * 60 * 60 * 1000)
        blockers.push(
          makeBlocker(
            item,
            'imminent_deadline',
            'warning',
            'explicit deadline is within 72 hours',
            'item is completed or deadline window passes into a missed-deadline blocker',
            false,
            `Deadline is within 72 hours: ${item.title}`,
          ),
        );
    }
  }
  return [...new Map(blockers.map((item) => [item.stableKey, item])).values()].sort((a, b) =>
    a.stableKey.localeCompare(b.stableKey),
  );
}

export type ReadinessResult = {
  engineVersion: typeof CHECKLIST_READINESS_VERSION;
  status: 'blocked' | 'human_review_required' | 'ready_for_final_review';
  summary: string;
  totalRequiredItems: number;
  completedRequiredItems: number;
  incompleteRequiredItems: number;
  blockedItems: number;
  unresolvedItems: number;
  itemsRequiringHumanProof: number;
  informationalItems: number;
  activeCriticalBlockers: number;
  warnings: number;
  excludedItems: number;
};

export function calculateReadiness(
  items: BlockerInputItem[],
  blockers: DeterministicBlocker[],
): ReadinessResult {
  const required = items.filter((item) => item.contributesToRequiredTotal);
  const completed = required.filter(
    (item) => item.workflowStatus === 'completed' || item.workflowStatus === 'waived',
  );
  const activeImpact = blockers.filter(
    (item) => item.readinessImpact && ['critical', 'blocking'].includes(item.severity),
  );
  const blockedItemCount = new Set(activeImpact.map((item) => item.itemStableKey)).size;
  const unresolvedItems = items.filter(
    (item) =>
      item.workflowStatus === 'unresolved' ||
      item.eligibility === 'review_needed' ||
      item.eligibility === 'unresolved_risk',
  ).length;
  const humanProof = items.filter(
    (item) =>
      item.proofRequirement !== 'none_identified' &&
      !['reviewed', 'accepted_by_waiver', 'not_applicable'].includes(item.artifactState),
  ).length;
  let status: ReadinessResult['status'];
  let summary: string;
  if (activeImpact.length > 0) {
    status = 'blocked';
    summary = `Blocked by ${blockedItemCount} required ${blockedItemCount === 1 ? 'item' : 'items'}`;
  } else if (unresolvedItems > 0 || humanProof > 0 || completed.length < required.length) {
    status = 'human_review_required';
    summary = 'Human review required';
  } else {
    status = 'ready_for_final_review';
    summary = 'Ready for final review';
  }
  return {
    engineVersion: CHECKLIST_READINESS_VERSION,
    status,
    summary,
    totalRequiredItems: required.length,
    completedRequiredItems: completed.length,
    incompleteRequiredItems: required.length - completed.length,
    blockedItems: blockedItemCount,
    unresolvedItems,
    itemsRequiringHumanProof: humanProof,
    informationalItems: blockers.filter((item) => item.severity === 'informational').length,
    activeCriticalBlockers: blockers.filter((item) => item.severity === 'critical').length,
    warnings: blockers.filter((item) => item.severity === 'warning').length,
    excludedItems: items.filter((item) => item.eligibility === 'excluded').length,
  };
}

export const PROHIBITED_PRODUCT_LANGUAGE = [
  /\bcompliant\b/i,
  /\bapproved\b/i,
  /safe to submit/i,
  /guaranteed complete/i,
] as const;

export function assertNoProhibitedProductLanguage(value: string): void {
  const violation = PROHIBITED_PRODUCT_LANGUAGE.find((pattern) => pattern.test(value));
  if (violation) throw new Error(`prohibited_product_language:${violation.source}`);
}
