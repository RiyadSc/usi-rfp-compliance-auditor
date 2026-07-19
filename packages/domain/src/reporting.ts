import { createHash } from 'node:crypto';
import { z } from 'zod';

export const REPORT_INPUT_VERSION = 'report-input-v1';
export const REPORT_AGGREGATION_VERSION = 'report-aggregation-v1';
export const REPORT_SCHEMA_VERSION = 'report-schema-v1';
export const EXECUTIVE_REPORT_VERSION = 'executive-readiness-report-v1';
export const EXPORT_MANIFEST_VERSION = 'export-manifest-v1';
export const REPORT_CSV_VERSION = 'report-csv-v1';
export const REPORT_HTML_VERSION = 'report-html-v1';
export const REPORT_LANGUAGE_POLICY_VERSION = 'report-language-policy-v1';
export const REPORT_DOWNLOAD_POLICY_VERSION = 'report-download-policy-v1';
export const REPORT_DOWNLOAD_EXPIRY_SECONDS = 300;
export const REPORT_DEMO_WATERMARK = 'DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION';

export const REPORT_VERSIONS = Object.freeze({
  input: REPORT_INPUT_VERSION,
  aggregation: REPORT_AGGREGATION_VERSION,
  schema: REPORT_SCHEMA_VERSION,
  executive: EXECUTIVE_REPORT_VERSION,
  manifest: EXPORT_MANIFEST_VERSION,
  csv: REPORT_CSV_VERSION,
  html: REPORT_HTML_VERSION,
  languagePolicy: REPORT_LANGUAGE_POLICY_VERSION,
  downloadPolicy: REPORT_DOWNLOAD_POLICY_VERSION,
});

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const optionalText = z.string().trim().min(1).max(2_000).nullable();

export const reportTypeSchema = z.enum([
  'executive',
  'detailed_audit',
  'findings',
  'checklist',
  'missing_artifacts',
  'source_coverage',
]);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const reportExportFormatSchema = z.enum(['csv', 'html']);
export type ReportExportFormat = z.infer<typeof reportExportFormatSchema>;

export const csvDatasetSchema = z.enum([
  'checklist_items',
  'blockers',
  'missing_artifacts',
  'proposal_findings',
  'proposal_claims',
  'review_status',
  'source_coverage',
]);
export type CsvDataset = z.infer<typeof csvDatasetSchema>;

const reportRequirementSchema = z
  .object({
    findingId: uuid,
    candidateId: uuid,
    title: z.string().min(1).max(500),
    sourceSupportStatus: z.enum([
      'supported',
      'partially_supported',
      'unsupported',
      'contradicted',
      'parser_uncertain',
    ]),
    precedenceStatus: z.enum(['active', 'superseded', 'conflicting', 'undetermined']),
    proofRequirement: z.enum([
      'none_identified',
      'requires_human_confirmation',
      'requires_company_artifact',
      'requires_external_validation',
      'undetermined',
    ]),
    humanReviewStatus: z.enum(['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived']),
    documentId: uuid.nullable(),
    pageNumber: z.number().int().positive().nullable(),
    exactQuote: optionalText,
    evidenceMatchType: z.enum(['exact', 'normalized_exact']).nullable(),
    parserUncertain: z.boolean(),
    relationshipRole: z.enum(['atomic', 'parent', 'child']),
  })
  .strict();

const reportChecklistItemSchema = z
  .object({
    id: uuid,
    candidateId: uuid,
    findingId: uuid,
    title: z.string().min(1).max(500),
    category: z.string().min(1).max(100),
    mandatory: z.boolean(),
    requiredDenominator: z.boolean(),
    eligibilityClass: z.enum(['ordinary_active', 'review_needed', 'unresolved_risk', 'excluded']),
    lifecycleStatus: z.enum(['active', 'obsolete']),
    workflowStatus: z.enum([
      'not_started',
      'in_progress',
      'ready_for_review',
      'completed',
      'waived',
      'blocked',
      'not_applicable',
      'requires_human_proof',
      'unresolved',
    ]),
    artifactState: z.enum([
      'missing',
      'uploaded',
      'linked',
      'pending_review',
      'reviewed',
      'accepted_by_waiver',
      'requires_human_proof',
      'rejected',
      'not_applicable',
    ]),
    owner: optionalText,
    reviewer: optionalText,
    dueAt: z.string().datetime().nullable(),
    dueTimezone: optionalText,
    sourceDocumentId: uuid.nullable(),
    sourcePageNumber: z.number().int().positive().nullable(),
    sourceQuote: optionalText,
    sourceEvidenceValidated: z.boolean(),
    sourceSupportStatus: reportRequirementSchema.shape.sourceSupportStatus,
    precedenceStatus: reportRequirementSchema.shape.precedenceStatus,
    proofRequirement: reportRequirementSchema.shape.proofRequirement,
    humanReviewStatus: reportRequirementSchema.shape.humanReviewStatus,
    relationshipRole: reportRequirementSchema.shape.relationshipRole,
  })
  .strict();

const reportBlockerSchema = z
  .object({
    id: uuid,
    checklistItemId: uuid,
    type: z.string().min(1).max(120),
    severity: z.enum(['critical', 'blocking', 'warning', 'informational']),
    title: z.string().min(1).max(500),
    explanation: z.string().min(1).max(2_000),
    status: z.enum(['open', 'resolved', 'reopened']),
    resolutionState: z.enum(['unresolved', 'resolved', 'reopened']),
  })
  .strict();

const reportArtifactSchema = z
  .object({
    id: uuid,
    checklistItemId: uuid,
    artifactType: z.string().min(1).max(120),
    state: reportChecklistItemSchema.shape.artifactState,
    documentId: uuid.nullable(),
    reviewed: z.boolean(),
  })
  .strict();

const reportWaiverSchema = z
  .object({
    id: uuid,
    checklistItemId: uuid,
    status: z.enum(['pending', 'accepted', 'rejected', 'expired']),
    designation: z.enum(['temporary', 'final']),
    validForReadiness: z.boolean(),
  })
  .strict();

const reportExceptionSchema = z
  .object({
    id: uuid,
    checklistItemId: uuid,
    text: z.string().min(1).max(4_000),
    status: z.enum(['open', 'accepted', 'rejected', 'superseded']),
  })
  .strict();

const reportProposalClaimSchema = z
  .object({
    id: uuid,
    text: z.string().min(1).max(8_000),
    pageNumber: z.number().int().positive(),
    claimType: z.string().min(1).max(100),
    supportStatus: z.enum([
      'supported',
      'partially_supported',
      'unsupported',
      'contradicted',
      'requires_human_proof',
      'parser_uncertain',
    ]),
    consistencyStatus: z.enum(['consistent', 'inconsistent', 'undetermined', 'not_applicable']),
    parserUncertain: z.boolean(),
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict();

const reportProposalFindingSchema = z
  .object({
    id: uuid,
    checklistItemId: uuid.nullable(),
    claimId: uuid.nullable(),
    type: z.string().min(1).max(120),
    severity: z.enum(['critical', 'blocking', 'warning', 'informational']),
    title: z.string().min(1).max(500),
    detail: z.string().min(1).max(2_000),
    workflowStatus: z.enum(['open', 'in_review', 'resolved', 'accepted_risk', 'obsolete']),
    humanResolutionStatus: z.enum(['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived']),
    supportStatus: reportProposalClaimSchema.shape.supportStatus.nullable(),
    consistencyStatus: reportProposalClaimSchema.shape.consistencyStatus.nullable(),
    proofRequirement: reportRequirementSchema.shape.proofRequirement,
    proposalDocumentId: uuid,
    proposalPageNumber: z.number().int().positive().nullable(),
    proposalQuote: optionalText,
    sourceDocumentId: uuid.nullable(),
    sourcePageNumber: z.number().int().positive().nullable(),
    sourceQuote: optionalText,
    machineOnly: z.literal(true),
    resolvedByRevision: z.boolean(),
    resolvedByEvidence: z.boolean(),
  })
  .strict();

const readinessSchema = z
  .object({
    id: uuid,
    state: z.enum(['blocked', 'human_review_required', 'ready_for_final_review']),
    summary: z.string().min(1).max(500),
    totalRequired: z.number().int().nonnegative(),
    completedRequired: z.number().int().nonnegative(),
    incompleteRequired: z.number().int().nonnegative(),
    blockedItems: z.number().int().nonnegative(),
    unresolvedItems: z.number().int().nonnegative(),
    humanProofItems: z.number().int().nonnegative(),
    informationalItems: z.number().int().nonnegative(),
    criticalBlockers: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    excludedItems: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const reportInputSchema = z
  .object({
    workspace: z
      .object({
        id: uuid,
        name: z.string().min(1).max(300),
        procurementTitle: z.string().min(1).max(500),
        solicitationNumber: optionalText,
        demo: z.boolean(),
        dataClassification: z.enum(['synthetic_demo', 'public', 'internal_authorized']),
      })
      .strict(),
    reportType: reportTypeSchema,
    sourceSnapshotAt: z.string().datetime(),
    runs: z
      .object({
        analysisRunId: uuid,
        verificationRunId: uuid,
        checklistGenerationRunId: uuid,
        readinessSnapshotId: uuid,
        proposalAuditRunId: uuid,
        proposalDraftId: uuid,
        proposalRevision: z.number().int().positive(),
      })
      .strict(),
    versions: z
      .object({
        phase4Fingerprint: hash,
        checklistGenerator: z.string().min(1).max(100),
        blockerEngine: z.string().min(1).max(100),
        readinessEngine: z.string().min(1).max(100),
        proposalParser: z.string().min(1).max(100),
        proposalSegmenter: z.string().min(1).max(100),
        proposalMatcher: z.string().min(1).max(100),
        proposalContradiction: z.string().min(1).max(100),
        proposalSeverity: z.string().min(1).max(100),
        proposalEvaluator: z.string().min(1).max(100),
      })
      .strict(),
    providerUseStatement: z.literal(
      'No Phase 7 provider calls; deterministic persisted data only.',
    ),
    requirements: z.array(reportRequirementSchema).max(10_000),
    checklistItems: z.array(reportChecklistItemSchema).max(10_000),
    blockers: z.array(reportBlockerSchema).max(10_000),
    artifacts: z.array(reportArtifactSchema).max(10_000),
    waivers: z.array(reportWaiverSchema).max(10_000),
    exceptions: z.array(reportExceptionSchema).max(10_000),
    proposalClaims: z.array(reportProposalClaimSchema).max(20_000),
    proposalFindings: z.array(reportProposalFindingSchema).max(20_000),
    readiness: readinessSchema,
  })
  .strict();
export type ReportInput = z.infer<typeof reportInputSchema>;

const ratioSchema = z
  .object({
    numerator: z.number().int().nonnegative(),
    denominator: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1).nullable(),
    denominatorDescription: z.string().min(1).max(500),
  })
  .strict();

const reportedBlockerSchema = z
  .object({
    stableId: z.string().min(1),
    sourcePhase: z.enum(['phase4', 'phase5', 'phase6']),
    type: z.string(),
    severity: z.enum(['critical', 'blocking', 'warning', 'informational']),
    title: z.string(),
    explanation: z.string(),
    affectedRecordId: uuid,
    workflowState: z.string(),
    owner: optionalText,
    dueAt: z.string().datetime().nullable(),
    humanReviewState: z.string(),
    waiverState: z.string(),
    resolutionState: z.string(),
    evidenceReference: optionalText,
    navigationReference: z.string().min(1).max(500),
  })
  .strict();

const unresolvedRowSchema = z
  .object({
    stableId: z.string().min(1),
    sourcePhase: z.enum(['phase4', 'phase5', 'phase6']),
    type: z.string(),
    title: z.string(),
    machineState: z.string(),
    humanState: z.string(),
    workflowState: z.string(),
    reason: z.string(),
    navigationReference: z.string(),
  })
  .strict();

const missingArtifactRowSchema = z
  .object({
    checklistItemId: uuid,
    title: z.string(),
    artifactType: z.string(),
    category: z.string(),
    sourceDocumentId: uuid.nullable(),
    sourcePageNumber: z.number().int().positive().nullable(),
    sourceQuote: optionalText,
    artifactState: reportChecklistItemSchema.shape.artifactState,
    owner: optionalText,
    dueAt: z.string().datetime().nullable(),
    blockerState: z.string(),
    waiverState: z.string(),
    reviewState: z.string(),
  })
  .strict();

export const reportSnapshotSchema = z
  .object({
    reportType: reportTypeSchema,
    versions: z
      .object({
        input: z.literal(REPORT_INPUT_VERSION),
        aggregation: z.literal(REPORT_AGGREGATION_VERSION),
        schema: z.literal(REPORT_SCHEMA_VERSION),
        executive: z.literal(EXECUTIVE_REPORT_VERSION),
      })
      .strict(),
    inputHash: hash,
    workspace: reportInputSchema.shape.workspace,
    runs: reportInputSchema.shape.runs,
    summary: z
      .object({
        projectName: z.string(),
        procurementTitle: z.string(),
        solicitationNumber: optionalText,
        proposalRevision: z.number().int().positive(),
        analysisTimestamp: z.string().datetime(),
        readinessState: readinessSchema.shape.state,
        readinessSummary: z.string(),
        requiredItems: z.number().int().nonnegative(),
        completedRequiredItems: z.number().int().nonnegative(),
        criticalBlockers: z.number().int().nonnegative(),
        blockingIssues: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
        unresolvedRequirements: z.number().int().nonnegative(),
        unresolvedProposalFindings: z.number().int().nonnegative(),
        missingArtifacts: z.number().int().nonnegative(),
        humanProofCount: z.number().int().nonnegative(),
        humanReviewPending: z.number().int().nonnegative(),
        reviewedFindings: z.number().int().nonnegative(),
        sourceCoverage: ratioSchema,
        scope: z.string(),
      })
      .strict(),
    criticalBlockers: z.array(reportedBlockerSchema),
    unresolvedFindings: z.array(unresolvedRowSchema),
    missingArtifacts: z.array(missingArtifactRowSchema),
    reviewCompletion: z
      .object({
        phase4: ratioSchema,
        phase5: ratioSchema,
        phase6: ratioSchema,
        phase4Pending: z.number().int().nonnegative(),
        phase4Accepted: z.number().int().nonnegative(),
        phase4Rejected: z.number().int().nonnegative(),
        phase5ReadyForReview: z.number().int().nonnegative(),
        phase5Completed: z.number().int().nonnegative(),
        phase5Unresolved: z.number().int().nonnegative(),
        phase6Pending: z.number().int().nonnegative(),
        phase6Accepted: z.number().int().nonnegative(),
        phase6Rejected: z.number().int().nonnegative(),
        phase6FollowUp: z.number().int().nonnegative(),
        resolvedByRevision: z.number().int().nonnegative(),
        resolvedByEvidence: z.number().int().nonnegative(),
        acceptedExceptionsOrWaivers: z.number().int().nonnegative(),
      })
      .strict(),
    sourceCoverage: z
      .object({
        activeRequirements: ratioSchema,
        checklistEvidence: ratioSchema,
        proposalClaimPages: ratioSchema,
        criticalFindingEvidence: ratioSchema,
        humanProofAvailability: ratioSchema,
        missingSourcePages: z.number().int().nonnegative(),
        parserUncertainPages: z.number().int().nonnegative(),
        excludedSupersededSources: z.number().int().nonnegative(),
      })
      .strict(),
    requirements: reportInputSchema.shape.requirements,
    checklistItems: reportInputSchema.shape.checklistItems,
    proposalClaims: reportInputSchema.shape.proposalClaims,
    proposalFindings: reportInputSchema.shape.proposalFindings,
    provenance: z
      .object({
        versions: reportInputSchema.shape.versions,
        reportVersions: z.record(z.string()),
        sourceSnapshotAt: z.string().datetime(),
        inputHash: hash,
        providerUseStatement: reportInputSchema.shape.providerUseStatement,
        dataScopeStatement: z.string(),
        machineOnlyStatement: z.string(),
        humanReviewDisclaimer: z.string(),
      })
      .strict(),
    demoWatermark: z.string().nullable(),
  })
  .strict();
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function calculateReportInputHash(raw: ReportInput): string {
  const input = reportInputSchema.parse(raw);
  const canonical = {
    ...input,
    requirements: [...input.requirements].sort((a, b) => a.findingId.localeCompare(b.findingId)),
    checklistItems: [...input.checklistItems].sort((a, b) => a.id.localeCompare(b.id)),
    blockers: [...input.blockers].sort((a, b) => a.id.localeCompare(b.id)),
    artifacts: [...input.artifacts].sort((a, b) => a.id.localeCompare(b.id)),
    waivers: [...input.waivers].sort((a, b) => a.id.localeCompare(b.id)),
    exceptions: [...input.exceptions].sort((a, b) => a.id.localeCompare(b.id)),
    proposalClaims: [...input.proposalClaims].sort((a, b) => a.id.localeCompare(b.id)),
    proposalFindings: [...input.proposalFindings].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash('sha256').update(stableJson(canonical)).digest('hex');
}

function ratio(numerator: number, denominator: number, description: string) {
  return ratioSchema.parse({
    numerator,
    denominator,
    ratio: denominator === 0 ? null : numerator / denominator,
    denominatorDescription: description,
  });
}

function latestWaiverState(input: ReportInput, itemId: string): string {
  const rows = input.waivers.filter((item) => item.checklistItemId === itemId);
  if (rows.some((item) => item.validForReadiness)) return 'accepted_final';
  return rows.at(-1)?.status ?? 'none';
}

function findingIsUnresolved(finding: ReportInput['proposalFindings'][number]): boolean {
  return (
    !['resolved', 'obsolete'].includes(finding.workflowStatus) &&
    !['accepted', 'rejected', 'waived'].includes(finding.humanResolutionStatus)
  );
}

export function aggregateReport(raw: ReportInput): ReportSnapshot {
  const input = reportInputSchema.parse(raw);
  const inputHash = calculateReportInputHash(input);
  const itemById = new Map(input.checklistItems.map((item) => [item.id, item]));
  const activeItems = input.checklistItems.filter((item) => item.lifecycleStatus === 'active');
  const requiredItems = activeItems.filter((item) => item.requiredDenominator);
  const completedRequired = requiredItems.filter((item) =>
    ['completed', 'waived'].includes(item.workflowStatus),
  );
  const openBlockers = input.blockers.filter((item) => item.status !== 'resolved');
  const unresolvedProposal = input.proposalFindings.filter(findingIsUnresolved);

  const phase5Blockers = openBlockers
    .filter((item) => ['critical', 'blocking'].includes(item.severity))
    .map((blocker) => {
      const item = itemById.get(blocker.checklistItemId)!;
      return reportedBlockerSchema.parse({
        stableId: `phase5:${blocker.id}`,
        sourcePhase: 'phase5',
        type: blocker.type,
        severity: blocker.severity,
        title: blocker.title,
        explanation: blocker.explanation,
        affectedRecordId: item.id,
        workflowState: item.workflowStatus,
        owner: item.owner,
        dueAt: item.dueAt,
        humanReviewState: item.humanReviewStatus,
        waiverState: latestWaiverState(input, item.id),
        resolutionState: blocker.resolutionState,
        evidenceReference: item.sourceQuote,
        navigationReference: `/w/${input.workspace.id}/checklist/${item.id}`,
      });
    });
  const phase6Blockers = unresolvedProposal
    .filter((item) => ['critical', 'blocking'].includes(item.severity))
    .map((finding) =>
      reportedBlockerSchema.parse({
        stableId: `phase6:${finding.id}`,
        sourcePhase: 'phase6',
        type: finding.type,
        severity: finding.severity,
        title: finding.title,
        explanation: finding.detail,
        affectedRecordId: finding.id,
        workflowState: finding.workflowStatus,
        owner: finding.checklistItemId
          ? (itemById.get(finding.checklistItemId)?.owner ?? null)
          : null,
        dueAt: finding.checklistItemId
          ? (itemById.get(finding.checklistItemId)?.dueAt ?? null)
          : null,
        humanReviewState: finding.humanResolutionStatus,
        waiverState: finding.checklistItemId
          ? latestWaiverState(input, finding.checklistItemId)
          : 'none',
        resolutionState: finding.workflowStatus,
        evidenceReference: finding.sourceQuote ?? finding.proposalQuote,
        navigationReference: `/w/${input.workspace.id}/proposal-audit/${input.runs.proposalAuditRunId}#finding-${finding.id}`,
      }),
    );
  const criticalBlockers = [...phase5Blockers, ...phase6Blockers].sort((a, b) =>
    a.stableId.localeCompare(b.stableId),
  );

  const unresolvedPhase4 = input.requirements
    .filter(
      (item) =>
        item.precedenceStatus === 'conflicting' ||
        item.precedenceStatus === 'undetermined' ||
        item.sourceSupportStatus === 'partially_supported' ||
        item.sourceSupportStatus === 'parser_uncertain' ||
        item.humanReviewStatus === 'pending' ||
        item.humanReviewStatus === 'needs_follow_up',
    )
    .map((item) =>
      unresolvedRowSchema.parse({
        stableId: `phase4:${item.findingId}`,
        sourcePhase: 'phase4',
        type: 'requirement_source_review',
        title: item.title,
        machineState: `${item.sourceSupportStatus}/${item.precedenceStatus}/${item.proofRequirement}`,
        humanState: item.humanReviewStatus,
        workflowState: 'source_review',
        reason: item.parserUncertain
          ? 'Parser uncertainty requires human review.'
          : 'Source support or precedence remains unresolved.',
        navigationReference: `/w/${input.workspace.id}/requirements/${item.candidateId}`,
      }),
    );
  const unresolvedPhase5 = activeItems
    .filter(
      (item) =>
        item.eligibilityClass !== 'ordinary_active' ||
        ['blocked', 'unresolved', 'requires_human_proof', 'ready_for_review'].includes(
          item.workflowStatus,
        ),
    )
    .map((item) =>
      unresolvedRowSchema.parse({
        stableId: `phase5:${item.id}`,
        sourcePhase: 'phase5',
        type: item.eligibilityClass,
        title: item.title,
        machineState: `${item.sourceSupportStatus}/${item.precedenceStatus}/${item.proofRequirement}`,
        humanState: item.humanReviewStatus,
        workflowState: item.workflowStatus,
        reason: 'Checklist source or workflow requires attention.',
        navigationReference: `/w/${input.workspace.id}/checklist/${item.id}`,
      }),
    );
  const unresolvedPhase6 = unresolvedProposal.map((item) =>
    unresolvedRowSchema.parse({
      stableId: `phase6:${item.id}`,
      sourcePhase: 'phase6',
      type: item.type,
      title: item.title,
      machineState: `${item.supportStatus ?? 'not_applicable'}/${item.consistencyStatus ?? 'not_applicable'}/${item.proofRequirement}`,
      humanState: item.humanResolutionStatus,
      workflowState: item.workflowStatus,
      reason: item.detail,
      navigationReference: `/w/${input.workspace.id}/proposal-audit/${input.runs.proposalAuditRunId}#finding-${item.id}`,
    }),
  );
  const unresolvedFindings = [...unresolvedPhase4, ...unresolvedPhase5, ...unresolvedPhase6].sort(
    (a, b) => a.stableId.localeCompare(b.stableId),
  );

  const missingStates = new Set(['missing', 'rejected', 'requires_human_proof']);
  const missingArtifacts = input.artifacts
    .filter((artifact) => {
      const item = itemById.get(artifact.checklistItemId);
      return (
        item?.lifecycleStatus === 'active' &&
        missingStates.has(artifact.state) &&
        latestWaiverState(input, artifact.checklistItemId) !== 'accepted_final'
      );
    })
    .map((artifact) => {
      const item = itemById.get(artifact.checklistItemId)!;
      const blocker = openBlockers.find((entry) => entry.checklistItemId === item.id);
      return missingArtifactRowSchema.parse({
        checklistItemId: item.id,
        title: item.title,
        artifactType: artifact.artifactType,
        category: item.category,
        sourceDocumentId: item.sourceDocumentId,
        sourcePageNumber: item.sourcePageNumber,
        sourceQuote: item.sourceQuote,
        artifactState: artifact.state,
        owner: item.owner,
        dueAt: item.dueAt,
        blockerState: blocker?.status ?? 'none',
        waiverState: latestWaiverState(input, item.id),
        reviewState: item.humanReviewStatus,
      });
    })
    .sort((a, b) => a.checklistItemId.localeCompare(b.checklistItemId));

  const activeRequirements = input.requirements.filter(
    (item) => item.precedenceStatus !== 'superseded',
  );
  const coveredRequirements = activeRequirements.filter(
    (item) =>
      Boolean(item.documentId && item.pageNumber && item.exactQuote) &&
      ['exact', 'normalized_exact'].includes(item.evidenceMatchType ?? ''),
  );
  const activeChecklist = activeItems.filter((item) => item.eligibilityClass !== 'excluded');
  const checklistEvidence = activeChecklist.filter(
    (item) => item.sourceEvidenceValidated && item.sourceDocumentId && item.sourcePageNumber,
  );
  const criticalFindings = input.proposalFindings.filter(
    (item) => ['critical', 'blocking'].includes(item.severity) && findingIsUnresolved(item),
  );
  const criticalWithEvidence = criticalFindings.filter((item) => {
    const proposalEvidence = Boolean(item.proposalPageNumber && item.proposalQuote);
    const sourceEvidence = Boolean(
      item.sourceDocumentId && item.sourcePageNumber && item.sourceQuote,
    );
    if (
      ['unsupported_claim', 'wrong_procurement_identity', 'prompt_injection_attempt'].includes(
        item.type,
      )
    )
      return proposalEvidence;
    if (item.type === 'missing_required_response') return sourceEvidence;
    if (item.type === 'parser_uncertainty') return proposalEvidence;
    return proposalEvidence && sourceEvidence;
  });
  const humanProofClaims = input.proposalClaims.filter(
    (item) => item.supportStatus === 'requires_human_proof',
  );
  const humanProofWithEvidence = humanProofClaims.filter((item) => item.evidenceCount > 0);
  const sourceCoverage = {
    activeRequirements: ratio(
      coveredRequirements.length,
      activeRequirements.length,
      'All non-superseded Phase 4 requirements in the selected verification run.',
    ),
    checklistEvidence: ratio(
      checklistEvidence.length,
      activeChecklist.length,
      'All active, non-excluded checklist items in the selected generation.',
    ),
    proposalClaimPages: ratio(
      input.proposalClaims.filter((item) => item.pageNumber > 0).length,
      input.proposalClaims.length,
      'All persisted atomic claims in the selected proposal audit.',
    ),
    criticalFindingEvidence: ratio(
      criticalWithEvidence.length,
      criticalFindings.length,
      'All critical or blocking proposal findings, using evidence required by finding type.',
    ),
    humanProofAvailability: ratio(
      humanProofWithEvidence.length,
      humanProofClaims.length,
      'All proposal claims explicitly classified as requiring human proof.',
    ),
    missingSourcePages: activeRequirements.filter((item) => !item.pageNumber).length,
    parserUncertainPages: input.requirements.filter((item) => item.parserUncertain).length,
    excludedSupersededSources: input.requirements.filter(
      (item) => item.precedenceStatus === 'superseded',
    ).length,
  };

  const phase4Accepted = input.requirements.filter(
    (item) => item.humanReviewStatus === 'accepted',
  ).length;
  const phase4Rejected = input.requirements.filter(
    (item) => item.humanReviewStatus === 'rejected',
  ).length;
  const phase4Pending = input.requirements.filter((item) =>
    ['pending', 'needs_follow_up'].includes(item.humanReviewStatus),
  ).length;
  const phase5Reviewed = activeItems.filter((item) =>
    ['completed', 'waived', 'not_applicable'].includes(item.workflowStatus),
  ).length;
  const phase6Reviewed = input.proposalFindings.filter((item) =>
    ['accepted', 'rejected', 'waived'].includes(item.humanResolutionStatus),
  ).length;
  const acceptedWaivers = input.waivers.filter((item) => item.validForReadiness).length;
  const acceptedExceptions = input.exceptions.filter((item) => item.status === 'accepted').length;
  const reviewCompletion = {
    phase4: ratio(
      phase4Accepted + phase4Rejected,
      input.requirements.length,
      'All Phase 4 findings in the selected verification run.',
    ),
    phase5: ratio(
      phase5Reviewed,
      activeItems.length,
      'All active checklist items in the selected generation.',
    ),
    phase6: ratio(
      phase6Reviewed,
      input.proposalFindings.length,
      'All proposal findings in the selected audit run.',
    ),
    phase4Pending,
    phase4Accepted,
    phase4Rejected,
    phase5ReadyForReview: activeItems.filter((item) => item.workflowStatus === 'ready_for_review')
      .length,
    phase5Completed: activeItems.filter((item) => item.workflowStatus === 'completed').length,
    phase5Unresolved: activeItems.filter((item) =>
      ['blocked', 'unresolved', 'requires_human_proof'].includes(item.workflowStatus),
    ).length,
    phase6Pending: input.proposalFindings.filter((item) => item.humanResolutionStatus === 'pending')
      .length,
    phase6Accepted: input.proposalFindings.filter(
      (item) => item.humanResolutionStatus === 'accepted',
    ).length,
    phase6Rejected: input.proposalFindings.filter(
      (item) => item.humanResolutionStatus === 'rejected',
    ).length,
    phase6FollowUp: input.proposalFindings.filter(
      (item) => item.humanResolutionStatus === 'needs_follow_up',
    ).length,
    resolvedByRevision: input.proposalFindings.filter((item) => item.resolvedByRevision).length,
    resolvedByEvidence: input.proposalFindings.filter((item) => item.resolvedByEvidence).length,
    acceptedExceptionsOrWaivers: acceptedWaivers + acceptedExceptions,
  };

  const warnings = [
    ...openBlockers.filter((item) => item.severity === 'warning'),
    ...unresolvedProposal.filter((item) => item.severity === 'warning'),
  ].length;
  const humanProofCount =
    activeItems.filter((item) => item.proofRequirement !== 'none_identified').length +
    humanProofClaims.length;
  const humanReviewPending = phase4Pending + reviewCompletion.phase6Pending;
  const summary = {
    projectName: input.workspace.name,
    procurementTitle: input.workspace.procurementTitle,
    solicitationNumber: input.workspace.solicitationNumber,
    proposalRevision: input.runs.proposalRevision,
    analysisTimestamp: input.sourceSnapshotAt,
    readinessState: input.readiness.state,
    readinessSummary: input.readiness.summary,
    requiredItems: requiredItems.length,
    completedRequiredItems: completedRequired.length,
    criticalBlockers: criticalBlockers.filter((item) => item.severity === 'critical').length,
    blockingIssues: criticalBlockers.filter((item) => item.severity === 'blocking').length,
    warnings,
    unresolvedRequirements: unresolvedPhase4.length,
    unresolvedProposalFindings: unresolvedPhase6.length,
    missingArtifacts: missingArtifacts.length,
    humanProofCount,
    humanReviewPending,
    reviewedFindings: phase6Reviewed,
    sourceCoverage: sourceCoverage.activeRequirements,
    scope: `Analysis ${input.runs.analysisRunId}; verification ${input.runs.verificationRunId}; checklist ${input.runs.checklistGenerationRunId}; proposal audit ${input.runs.proposalAuditRunId}.`,
  };
  assertNoProhibitedReportLanguage(
    [summary.readinessSummary, summary.scope, input.readiness.summary].join(' '),
  );
  return reportSnapshotSchema.parse({
    reportType: input.reportType,
    versions: {
      input: REPORT_INPUT_VERSION,
      aggregation: REPORT_AGGREGATION_VERSION,
      schema: REPORT_SCHEMA_VERSION,
      executive: EXECUTIVE_REPORT_VERSION,
    },
    inputHash,
    workspace: input.workspace,
    runs: input.runs,
    summary,
    criticalBlockers,
    unresolvedFindings,
    missingArtifacts,
    reviewCompletion,
    sourceCoverage,
    requirements: [...input.requirements].sort((a, b) => a.findingId.localeCompare(b.findingId)),
    checklistItems: [...input.checklistItems].sort((a, b) => a.id.localeCompare(b.id)),
    proposalClaims: [...input.proposalClaims].sort((a, b) => a.id.localeCompare(b.id)),
    proposalFindings: [...input.proposalFindings].sort((a, b) => a.id.localeCompare(b.id)),
    provenance: {
      versions: input.versions,
      reportVersions: REPORT_VERSIONS,
      sourceSnapshotAt: input.sourceSnapshotAt,
      inputHash,
      providerUseStatement: input.providerUseStatement,
      dataScopeStatement: `Only persisted records from workspace ${input.workspace.id} are included.`,
      machineOnlyStatement: 'Machine summaries remain distinct from human decisions.',
      humanReviewDisclaimer: 'Human review is required before any submission decision.',
    },
    demoWatermark: input.workspace.demo ? REPORT_DEMO_WATERMARK : null,
  });
}

export const PROHIBITED_REPORT_LANGUAGE = [
  /\bcompliant\b/i,
  /\bapproved\b/i,
  /\bsafe\s+to\s+submit\b/i,
  /\bguaranteed\s+(?:complete|accurate)\b/i,
  /\bcertified(?:\s+complete)?\b/i,
  /\bfully\s+verified\b/i,
  /\blegally\s+sufficient\b/i,
  /\bsubmission[-\s]+ready\b/i,
] as const;

export function assertNoProhibitedReportLanguage(value: string): void {
  if (PROHIBITED_REPORT_LANGUAGE.some((pattern) => pattern.test(value)))
    throw new Error('prohibited_report_language');
}

export function neutralizeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvLine(values: readonly unknown[]): string {
  return values
    .map(neutralizeCsvCell)
    .map((value) => `"${value.replaceAll('"', '""')}"`)
    .join(',');
}

const CSV_HEADERS: Record<CsvDataset, readonly string[]> = {
  checklist_items: [
    'report_version',
    'demo_label',
    'checklist_item_id',
    'title',
    'category',
    'workflow_status',
    'artifact_state',
    'owner',
    'due_at',
    'source_document_id',
    'source_page',
    'source_quote',
  ],
  blockers: [
    'report_version',
    'demo_label',
    'stable_id',
    'source_phase',
    'type',
    'severity',
    'title',
    'workflow_state',
    'resolution_state',
    'navigation_reference',
  ],
  missing_artifacts: [
    'report_version',
    'demo_label',
    'checklist_item_id',
    'title',
    'artifact_type',
    'artifact_state',
    'owner',
    'source_page',
    'source_quote',
  ],
  proposal_findings: [
    'report_version',
    'demo_label',
    'finding_id',
    'type',
    'severity',
    'support_status',
    'consistency_status',
    'proof_requirement',
    'workflow_status',
    'human_resolution_status',
    'proposal_page',
    'proposal_quote',
    'source_page',
    'source_quote',
  ],
  proposal_claims: [
    'report_version',
    'demo_label',
    'claim_id',
    'claim_type',
    'support_status',
    'consistency_status',
    'page',
    'claim_text',
  ],
  review_status: [
    'report_version',
    'demo_label',
    'axis',
    'numerator',
    'denominator',
    'ratio',
    'denominator_description',
  ],
  source_coverage: [
    'report_version',
    'demo_label',
    'metric',
    'numerator',
    'denominator',
    'ratio',
    'denominator_description',
  ],
};

export function generateReportCsv(raw: ReportSnapshot, dataset: CsvDataset): string {
  const snapshot = reportSnapshotSchema.parse(raw);
  const kind = csvDatasetSchema.parse(dataset);
  const meta = [REPORT_CSV_VERSION, snapshot.demoWatermark ?? ''];
  let rows: unknown[][] = [];
  if (kind === 'checklist_items')
    rows = snapshot.checklistItems.map((item) => [
      ...meta,
      item.id,
      item.title,
      item.category,
      item.workflowStatus,
      item.artifactState,
      item.owner,
      item.dueAt,
      item.sourceDocumentId,
      item.sourcePageNumber,
      item.sourceQuote,
    ]);
  if (kind === 'blockers')
    rows = snapshot.criticalBlockers.map((item) => [
      ...meta,
      item.stableId,
      item.sourcePhase,
      item.type,
      item.severity,
      item.title,
      item.workflowState,
      item.resolutionState,
      item.navigationReference,
    ]);
  if (kind === 'missing_artifacts')
    rows = snapshot.missingArtifacts.map((item) => [
      ...meta,
      item.checklistItemId,
      item.title,
      item.artifactType,
      item.artifactState,
      item.owner,
      item.sourcePageNumber,
      item.sourceQuote,
    ]);
  if (kind === 'proposal_findings')
    rows = snapshot.proposalFindings.map((item) => [
      ...meta,
      item.id,
      item.type,
      item.severity,
      item.supportStatus,
      item.consistencyStatus,
      item.proofRequirement,
      item.workflowStatus,
      item.humanResolutionStatus,
      item.proposalPageNumber,
      item.proposalQuote,
      item.sourcePageNumber,
      item.sourceQuote,
    ]);
  if (kind === 'proposal_claims')
    rows = snapshot.proposalClaims.map((item) => [
      ...meta,
      item.id,
      item.claimType,
      item.supportStatus,
      item.consistencyStatus,
      item.pageNumber,
      item.text,
    ]);
  if (kind === 'review_status')
    rows = (['phase4', 'phase5', 'phase6'] as const).map((axis) => {
      const value = snapshot.reviewCompletion[axis];
      return [
        ...meta,
        axis,
        value.numerator,
        value.denominator,
        value.ratio,
        value.denominatorDescription,
      ];
    });
  if (kind === 'source_coverage')
    rows = (
      [
        'activeRequirements',
        'checklistEvidence',
        'proposalClaimPages',
        'criticalFindingEvidence',
        'humanProofAvailability',
      ] as const
    ).map((metric) => {
      const value = snapshot.sourceCoverage[metric];
      return [
        ...meta,
        metric,
        value.numerator,
        value.denominator,
        value.ratio,
        value.denominatorDescription,
      ];
    });
  const body = rows.sort((a, b) => String(a[2]).localeCompare(String(b[2]))).map(csvLine);
  return `\uFEFF${[csvLine(CSV_HEADERS[kind]), ...body].join('\r\n')}\r\n`;
}

function html(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function percent(value: z.infer<typeof ratioSchema>): string {
  return value.ratio === null ? 'Not applicable' : `${Math.round(value.ratio * 100)}%`;
}

export function generateReportHtml(raw: ReportSnapshot): string {
  const snapshot = reportSnapshotSchema.parse(raw);
  const watermark = snapshot.demoWatermark
    ? `<div class="watermark">${html(snapshot.demoWatermark)}</div>`
    : '';
  const blockerRows = snapshot.criticalBlockers
    .map(
      (item) =>
        `<tr><td>${html(item.severity)}</td><td>${html(item.sourcePhase)}</td><td>${html(item.title)}</td><td>${html(item.workflowState)}</td><td>${html(item.navigationReference)}</td></tr>`,
    )
    .join('');
  const unresolvedRows = snapshot.unresolvedFindings
    .map(
      (item) =>
        `<tr><td>${html(item.sourcePhase)}</td><td>${html(item.type)}</td><td>${html(item.title)}</td><td>${html(item.humanState)}</td><td>${html(item.navigationReference)}</td></tr>`,
    )
    .join('');
  const artifactRows = snapshot.missingArtifacts
    .map(
      (item) =>
        `<tr><td>${html(item.title)}</td><td>${html(item.artifactType)}</td><td>${html(item.artifactState)}</td><td>${html(item.sourcePageNumber)}</td></tr>`,
    )
    .join('');
  const requirementRows = snapshot.requirements
    .map(
      (item) =>
        `<tr><td>${html(item.title)}</td><td>${html(item.sourceSupportStatus)}</td><td>${html(item.precedenceStatus)}</td><td>${html(item.proofRequirement)}</td><td>${html(item.humanReviewStatus)}</td><td>${html(item.pageNumber)}</td><td>${html(item.exactQuote)}</td></tr>`,
    )
    .join('');
  const reportLabels: Record<ReportType, string> = {
    executive: 'Executive readiness report',
    detailed_audit: 'Detailed audit report',
    findings: 'Findings report',
    checklist: 'Checklist report',
    missing_artifacts: 'Missing-artifact report',
    source_coverage: 'Source-coverage report',
  };
  const title = `${snapshot.summary.projectName} — ${reportLabels[snapshot.reportType]}`;
  assertNoProhibitedReportLanguage(title);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(title)}</title><style>
body{font-family:system-ui,sans-serif;margin:32px;color:#172033;line-height:1.45}h1,h2{color:#0f172a}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{border:1px solid #cbd5e1;padding:12px}.watermark{border:2px solid #b45309;background:#fffbeb;color:#92400e;font-weight:700;padding:10px;text-align:center}footer{border-top:1px solid #cbd5e1;margin-top:32px;padding-top:12px;font-size:12px}@media print{body{margin:16mm}.watermark{break-inside:avoid}}</style></head><body>
${watermark}<header><h1>${html(title)}</h1><p>${html(snapshot.summary.procurementTitle)}${snapshot.summary.solicitationNumber ? ` · ${html(snapshot.summary.solicitationNumber)}` : ''}</p><p>Proposal revision ${snapshot.summary.proposalRevision} · source snapshot ${html(snapshot.summary.analysisTimestamp)}</p></header>
<section><h2>Executive summary</h2><div class="grid"><div class="card"><strong>Readiness</strong><br>${html(snapshot.summary.readinessSummary)}</div><div class="card"><strong>Required checklist</strong><br>${snapshot.summary.completedRequiredItems} of ${snapshot.summary.requiredItems} complete</div><div class="card"><strong>Source coverage</strong><br>${html(percent(snapshot.summary.sourceCoverage))}</div><div class="card"><strong>Critical blockers</strong><br>${snapshot.summary.criticalBlockers}</div><div class="card"><strong>Missing artifacts</strong><br>${snapshot.summary.missingArtifacts}</div><div class="card"><strong>Human review pending</strong><br>${snapshot.summary.humanReviewPending}</div></div></section>
<section><h2>Critical and blocking items</h2><table><thead><tr><th>Severity</th><th>Phase</th><th>Title</th><th>Workflow</th><th>Application reference</th></tr></thead><tbody>${blockerRows}</tbody></table></section>
<section><h2>Unresolved findings</h2><table><thead><tr><th>Phase</th><th>Type</th><th>Title</th><th>Human state</th><th>Application reference</th></tr></thead><tbody>${unresolvedRows}</tbody></table></section>
<section><h2>Missing artifacts</h2><table><thead><tr><th>Checklist item</th><th>Artifact</th><th>State</th><th>Source page</th></tr></thead><tbody>${artifactRows}</tbody></table></section>
<section><h2>Source requirements</h2><table><thead><tr><th>Requirement</th><th>Support</th><th>Precedence</th><th>Proof</th><th>Human review</th><th>Page</th><th>Exact evidence</th></tr></thead><tbody>${requirementRows}</tbody></table></section>
<section><h2>Review completion</h2><ul><li>Phase 4 source review: ${html(percent(snapshot.reviewCompletion.phase4))}</li><li>Phase 5 workflow review: ${html(percent(snapshot.reviewCompletion.phase5))}</li><li>Phase 6 finding review: ${html(percent(snapshot.reviewCompletion.phase6))}</li></ul></section>
<section><h2>Source coverage</h2><ul><li>Active requirements: ${html(percent(snapshot.sourceCoverage.activeRequirements))}</li><li>Checklist evidence: ${html(percent(snapshot.sourceCoverage.checklistEvidence))}</li><li>Proposal claim pages: ${html(percent(snapshot.sourceCoverage.proposalClaimPages))}</li><li>Critical finding evidence: ${html(percent(snapshot.sourceCoverage.criticalFindingEvidence))}</li><li>Human-proof evidence availability: ${html(percent(snapshot.sourceCoverage.humanProofAvailability))}</li></ul></section>
<section><h2>Methodology and provenance</h2><p>Input hash: ${html(snapshot.inputHash)}</p><p>${html(snapshot.provenance.providerUseStatement)}</p><p>${html(snapshot.provenance.dataScopeStatement)}</p><p>${html(snapshot.provenance.machineOnlyStatement)} ${html(snapshot.provenance.humanReviewDisclaimer)}</p></section>
<footer>${snapshot.demoWatermark ? html(snapshot.demoWatermark) : 'Restricted workspace report'} · ${REPORT_HTML_VERSION}</footer></body></html>`;
}

export function safeExportFilename(input: {
  workspaceName: string;
  reportType: ReportType;
  format: ReportExportFormat;
  demo: boolean;
}): string {
  const workspace = input.workspaceName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const label = input.demo ? 'demo-synthetic-' : '';
  const extension = input.format === 'html' ? 'html' : 'csv';
  const filename = `${label}${workspace || 'workspace'}-${input.reportType}-${REPORT_SCHEMA_VERSION}.${extension}`;
  assertNoProhibitedReportLanguage(filename);
  return filename;
}
