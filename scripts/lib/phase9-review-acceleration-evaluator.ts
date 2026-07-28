import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PHASE9_BATCH_REVIEW_POLICY_VERSION,
  PHASE9_DUPLICATE_POLICY_VERSION,
  PHASE9_REVIEW_PRIORITY_VERSION,
  assignPhase9ReviewLane,
  evaluatePhase9BatchEligibility,
  groupPhase9DeterministicDuplicates,
  phase9ReviewFindingSchema,
  type Phase9ReviewFinding,
  type Phase9ReviewLane,
} from '@usi/domain';

export const PHASE9_NJ_REVIEW_SNAPSHOT_VERSION = 'phase9-review-acceleration-snapshot-v1' as const;
export const PHASE9_NJ_REVIEW_EVALUATION_VERSION =
  'phase9-review-acceleration-new-jersey-v1' as const;

export const PHASE9_NJ_IMMUTABLE_SOURCE = {
  workspaceId: '90000000-0000-4000-8000-000000000100',
  evaluationRunId: 'e9dcb574-22c7-481e-b485-a2e85ad38433',
  documentIds: ['90000000-0000-4000-8000-000000000101'],
  sourcePackageHash: '773aa737b1a4e650654eb9a0b3cc56137c895ace5badbde774de013bc5b86f36',
  documentSetHash: 'fcadd8b5f5d54c56704852e49c4d5c4277e14a74a68ea81c69617290741551fd',
  callPlanHash: 'e661343c1ff07ad37efa5ca32b6dca6e854fa0dcfef14d2943b7a50f6e45fb6b',
  compatibilityFingerprint: 'cde596458e56407e26b6ddf7ef0d6f27b4b2182e65ce479a68b1fa4c0d0d7582',
  findingCount: 329,
  pageCount: 48,
} as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const phase9ReviewCoverageExceptionSchema = z
  .object({
    sourceDocumentId: z.string().uuid(),
    pageNumber: z.number().int().positive(),
    reasons: z
      .array(
        z.enum([
          'missing_coverage',
          'parser_uncertain',
          'seed_without_finding',
          'high_risk_signal_without_finding',
        ]),
      )
      .min(1),
  })
  .strict();

export const phase9NjReviewSnapshotSchema = z
  .object({
    artifactVersion: z.literal(PHASE9_NJ_REVIEW_SNAPSHOT_VERSION),
    source: z
      .object({
        workspaceId: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.workspaceId),
        evaluationRunId: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.evaluationRunId),
        documentIds: z.tuple([z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.documentIds[0])]),
        sourcePackageHash: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.sourcePackageHash),
        documentSetHash: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.documentSetHash),
        callPlanHash: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.callPlanHash),
        compatibilityFingerprint: z.literal(PHASE9_NJ_IMMUTABLE_SOURCE.compatibilityFingerprint),
        completedAt: z.string().datetime({ offset: true }),
        expectedAnswersUsed: z.literal(false),
      })
      .strict(),
    export: z
      .object({
        exportedAt: z.string().datetime({ offset: true }),
        databaseAccess: z.literal('read_only_selects'),
        providerCalls: z.literal(0),
        providerSpendUsd: z.literal(0),
        excludedFields: z
          .array(
            z.enum([
              'provider_payloads',
              'provider_responses',
              'tokens',
              'secrets',
              'authorization_headers',
              'workspace_member_data',
            ]),
          )
          .min(1),
      })
      .strict(),
    originalCandidateSetHash: hashSchema,
    coverageExceptions: z.array(phase9ReviewCoverageExceptionSchema),
    findings: z.array(phase9ReviewFindingSchema).length(PHASE9_NJ_IMMUTABLE_SOURCE.findingCount),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const hashes = snapshot.findings.map((finding) => finding.candidateHash);
    if (new Set(hashes).size !== hashes.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['findings'],
        message: 'New Jersey review snapshot candidate hashes must be unique.',
      });
    const actualHash = hashCandidatePopulation(hashes);
    if (actualHash !== snapshot.originalCandidateSetHash)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['originalCandidateSetHash'],
        message: 'New Jersey review snapshot candidate population hash does not match.',
      });
  });

export type Phase9NjReviewSnapshot = z.infer<typeof phase9NjReviewSnapshotSchema>;

export function hashCandidatePopulation(candidateHashes: string[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: PHASE9_NJ_REVIEW_SNAPSHOT_VERSION,
        candidateHashes: [...candidateHashes].sort(),
      }),
    )
    .digest('hex');
}

export type Phase9ReviewAccelerationEvaluation = {
  artifactVersion: typeof PHASE9_NJ_REVIEW_EVALUATION_VERSION;
  source: Phase9NjReviewSnapshot['source'];
  policy: {
    priorityVersion: typeof PHASE9_REVIEW_PRIORITY_VERSION;
    duplicateVersion: typeof PHASE9_DUPLICATE_POLICY_VERSION;
    batchVersion: typeof PHASE9_BATCH_REVIEW_POLICY_VERSION;
  };
  population: {
    totalFindings: number;
    representedFindings: number;
    originalCandidateSetHash: string;
    evaluatedCandidateSetHash: string;
    everyOriginalFindingRepresented: boolean;
    exactlyOneLanePerFinding: boolean;
  };
  lanes: Record<Phase9ReviewLane, number>;
  critical: {
    candidateHashes: string[];
    byCategory: Record<string, number>;
    officialQuestionDeadlineCritical: boolean;
    officialSubmissionDeadlineCritical: boolean;
  };
  exceptions: {
    findingCount: number;
    byReason: Record<string, number>;
    pageCoverageCount: number;
    pages: Array<{
      sourceDocumentId: string;
      pageNumber: number;
      reasons: string[];
    }>;
  };
  duplicates: {
    groupCount: number;
    nonCanonicalFindingCount: number;
    groups: Array<{
      groupKey: string;
      canonicalCandidateHash: string;
      candidateHashes: string[];
      reason: string;
    }>;
  };
  acceleratedReview: {
    batchEligibleRoutineFindings: number;
    individualReviewFindings: number;
    estimatedFindingInteractionsBefore: number;
    estimatedFindingInteractionsAfter: number;
    unchangedCoverageExceptionInteractions: number;
    estimatedTotalInteractionsBefore: number;
    estimatedTotalInteractionsAfter: number;
    estimatedReductionInIndividualFindingDecisions: number;
    zeroCriticalBatchAcceptEligible: boolean;
    zeroExceptionBatchAcceptEligible: boolean;
  };
  safety: {
    publicationRulesUnchanged: true;
    machineAcceptanceIntroduced: false;
    excludedFindings: 0;
    providerCalls: 0;
    providerSpendUsd: 0;
    precisionRecallClaimed: false;
  };
  findings: Array<{
    candidateHash: string;
    lane: Phase9ReviewLane;
    reason: string;
    category: string;
    sourcePage: number | null;
    batchAcceptEligible: boolean;
    duplicateOfCandidateHash: string | null;
  }>;
};

function withDuplicateRelationships(findings: Phase9ReviewFinding[]): {
  findings: Phase9ReviewFinding[];
  groups: ReturnType<typeof groupPhase9DeterministicDuplicates>;
} {
  const groups = groupPhase9DeterministicDuplicates(findings);
  const duplicateOf = new Map<string, string>();
  for (const group of groups)
    for (const candidateHash of group.candidateHashes)
      if (candidateHash !== group.canonicalCandidateHash)
        duplicateOf.set(candidateHash, group.canonicalCandidateHash);
  return {
    groups,
    findings: findings.map((finding) => ({
      ...finding,
      duplicateOfCandidateHash: duplicateOf.get(finding.candidateHash) ?? null,
    })),
  };
}

function hasOfficialDeadline(
  findings: Phase9ReviewFinding[],
  laneByHash: Map<string, Phase9ReviewLane>,
  kind: 'question' | 'submission',
): boolean {
  const pattern =
    kind === 'question' ? /february\s+15,\s*2008|2008-02-15/i : /march\s+7,\s*2008|2008-03-07/i;
  const expectedCategory = kind === 'question' ? 'question_deadline' : 'submission_deadline';
  return findings.some(
    (finding) =>
      finding.category === expectedCategory &&
      laneByHash.get(finding.candidateHash) === 'critical' &&
      pattern.test(
        `${finding.obligationText} ${finding.evidenceText} ${String(
          finding.materialFacts.normalizedDate ?? '',
        )}`,
      ),
  );
}

export function evaluatePhase9NewJerseyReviewAcceleration(
  rawSnapshot: unknown,
): Phase9ReviewAccelerationEvaluation {
  const snapshot = phase9NjReviewSnapshotSchema.parse(rawSnapshot);
  const duplicateResult = withDuplicateRelationships(snapshot.findings);
  const assignments = duplicateResult.findings.map((finding) => ({
    finding,
    assignment: assignPhase9ReviewLane(finding),
  }));
  const laneByHash = new Map(
    assignments.map(({ finding, assignment }) => [finding.candidateHash, assignment.lane]),
  );
  const lanes: Record<Phase9ReviewLane, number> = {
    critical: 0,
    exception: 0,
    duplicate: 0,
    routine: 0,
  };
  for (const { assignment } of assignments) lanes[assignment.lane] += 1;

  const batchEligibleRoutine = assignments.filter(
    ({ finding }) => evaluatePhase9BatchEligibility(finding, 'accept_routine').eligible,
  );
  const individualReview = assignments.filter(
    ({ assignment }) => assignment.lane === 'critical' || assignment.lane === 'exception',
  );
  const duplicateGroups = duplicateResult.groups.length;
  const routineBatchConfirmations = batchEligibleRoutine.length
    ? Math.ceil(batchEligibleRoutine.length / 500)
    : 0;
  const estimatedFindingInteractionsAfter =
    individualReview.length + duplicateGroups + routineBatchConfirmations;
  const estimatedFindingInteractionsBefore = assignments.length;
  const coverageInteractions = snapshot.coverageExceptions.length;
  const criticalBatchEligible = assignments.filter(
    ({ finding, assignment }) =>
      assignment.lane === 'critical' &&
      evaluatePhase9BatchEligibility(finding, 'accept_routine').eligible,
  ).length;
  const exceptionBatchEligible = assignments.filter(
    ({ finding, assignment }) =>
      assignment.lane === 'exception' &&
      evaluatePhase9BatchEligibility(finding, 'accept_routine').eligible,
  ).length;
  const evaluatedCandidateSetHash = hashCandidatePopulation(
    assignments.map(({ finding }) => finding.candidateHash),
  );

  const evaluation: Phase9ReviewAccelerationEvaluation = {
    artifactVersion: PHASE9_NJ_REVIEW_EVALUATION_VERSION,
    source: snapshot.source,
    policy: {
      priorityVersion: PHASE9_REVIEW_PRIORITY_VERSION,
      duplicateVersion: PHASE9_DUPLICATE_POLICY_VERSION,
      batchVersion: PHASE9_BATCH_REVIEW_POLICY_VERSION,
    },
    population: {
      totalFindings: snapshot.findings.length,
      representedFindings: assignments.length,
      originalCandidateSetHash: snapshot.originalCandidateSetHash,
      evaluatedCandidateSetHash,
      everyOriginalFindingRepresented:
        evaluatedCandidateSetHash === snapshot.originalCandidateSetHash,
      exactlyOneLanePerFinding:
        Object.values(lanes).reduce((sum, count) => sum + count, 0) === assignments.length,
    },
    lanes,
    critical: {
      candidateHashes: assignments
        .filter(({ assignment }) => assignment.lane === 'critical')
        .map(({ finding }) => finding.candidateHash)
        .sort(),
      byCategory: Object.fromEntries(
        [
          ...new Set(
            assignments
              .filter(({ assignment }) => assignment.lane === 'critical')
              .map(({ finding }) => finding.category),
          ),
        ]
          .sort()
          .map((category) => [
            category,
            assignments.filter(
              ({ finding, assignment }) =>
                assignment.lane === 'critical' && finding.category === category,
            ).length,
          ]),
      ),
      officialQuestionDeadlineCritical: hasOfficialDeadline(
        duplicateResult.findings,
        laneByHash,
        'question',
      ),
      officialSubmissionDeadlineCritical: hasOfficialDeadline(
        duplicateResult.findings,
        laneByHash,
        'submission',
      ),
    },
    exceptions: {
      findingCount: lanes.exception,
      byReason: Object.fromEntries(
        [
          ...new Set(
            assignments
              .filter(({ assignment }) => assignment.lane === 'exception')
              .map(({ assignment }) => assignment.reason),
          ),
        ]
          .sort()
          .map((reason) => [
            reason,
            assignments.filter(
              ({ assignment }) => assignment.lane === 'exception' && assignment.reason === reason,
            ).length,
          ]),
      ),
      pageCoverageCount: snapshot.coverageExceptions.length,
      pages: snapshot.coverageExceptions,
    },
    duplicates: {
      groupCount: duplicateResult.groups.length,
      nonCanonicalFindingCount: lanes.duplicate,
      groups: duplicateResult.groups,
    },
    acceleratedReview: {
      batchEligibleRoutineFindings: batchEligibleRoutine.length,
      individualReviewFindings: individualReview.length,
      estimatedFindingInteractionsBefore,
      estimatedFindingInteractionsAfter,
      unchangedCoverageExceptionInteractions: coverageInteractions,
      estimatedTotalInteractionsBefore: estimatedFindingInteractionsBefore + coverageInteractions,
      estimatedTotalInteractionsAfter: estimatedFindingInteractionsAfter + coverageInteractions,
      estimatedReductionInIndividualFindingDecisions:
        estimatedFindingInteractionsBefore === 0
          ? 0
          : (estimatedFindingInteractionsBefore - estimatedFindingInteractionsAfter) /
            estimatedFindingInteractionsBefore,
      zeroCriticalBatchAcceptEligible: criticalBatchEligible === 0,
      zeroExceptionBatchAcceptEligible: exceptionBatchEligible === 0,
    },
    safety: {
      publicationRulesUnchanged: true,
      machineAcceptanceIntroduced: false,
      excludedFindings: snapshot.findings.length - assignments.length,
      providerCalls: 0,
      providerSpendUsd: 0,
      precisionRecallClaimed: false,
    },
    findings: assignments
      .map(({ finding, assignment }) => ({
        candidateHash: finding.candidateHash,
        lane: assignment.lane,
        reason: assignment.reason,
        category: finding.category,
        sourcePage: finding.sourcePage,
        batchAcceptEligible: evaluatePhase9BatchEligibility(finding, 'accept_routine').eligible,
        duplicateOfCandidateHash: finding.duplicateOfCandidateHash,
      }))
      .sort((left, right) => left.candidateHash.localeCompare(right.candidateHash)),
  };

  if (!evaluation.population.everyOriginalFindingRepresented)
    throw new Error('phase9_review_acceleration_population_conservation_failed');
  if (!evaluation.population.exactlyOneLanePerFinding)
    throw new Error('phase9_review_acceleration_lane_conservation_failed');
  if (!evaluation.critical.officialQuestionDeadlineCritical)
    throw new Error('phase9_review_acceleration_question_deadline_not_critical');
  if (!evaluation.critical.officialSubmissionDeadlineCritical)
    throw new Error('phase9_review_acceleration_submission_deadline_not_critical');
  if (
    !evaluation.acceleratedReview.zeroCriticalBatchAcceptEligible ||
    !evaluation.acceleratedReview.zeroExceptionBatchAcceptEligible
  )
    throw new Error('phase9_review_acceleration_unsafe_batch_eligibility');
  if (evaluation.safety.excludedFindings !== 0)
    throw new Error('phase9_review_acceleration_finding_excluded');
  return evaluation;
}
