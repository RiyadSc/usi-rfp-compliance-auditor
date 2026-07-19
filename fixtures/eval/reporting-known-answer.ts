import type { ReportInput } from '@usi/domain';

export const REPORTING_FIXTURE_VERSION = 'reporting-known-answer-v1';
export const REPORTING_WORKSPACE_ID = '71000000-0000-4000-8000-000000000001';
const id = (group: number, value: number) =>
  `71000000-0000-4000-${String(group).padStart(4, '0')}-${String(value).padStart(12, '0')}`;

const exactQuote = (value: number) => `Offerors must submit completed Form ${value}.`;

const requirements: ReportInput['requirements'] = Array.from({ length: 8 }, (_, index) => {
  const value = index + 1;
  if (value === 7)
    return {
      findingId: id(100, value),
      candidateId: id(101, value),
      title: 'Image-only appendix requirement',
      sourceSupportStatus: 'parser_uncertain',
      precedenceStatus: 'undetermined',
      proofRequirement: 'undetermined',
      humanReviewStatus: 'pending',
      documentId: id(102, 1),
      pageNumber: null,
      exactQuote: null,
      evidenceMatchType: null,
      parserUncertain: true,
      relationshipRole: 'atomic',
    };
  return {
    findingId: id(100, value),
    candidateId: id(101, value),
    title: value === 6 ? 'Partially supported staffing requirement' : `Mandatory Form ${value}`,
    sourceSupportStatus: value === 6 ? 'partially_supported' : 'supported',
    precedenceStatus: value === 8 ? 'superseded' : 'active',
    proofRequirement: 'none_identified',
    humanReviewStatus: value === 6 ? 'needs_follow_up' : 'accepted',
    documentId: id(102, 1),
    pageNumber: value + 1,
    exactQuote: exactQuote(value),
    evidenceMatchType: 'exact',
    parserUncertain: false,
    relationshipRole: 'atomic',
  };
});

const checklistItems: ReportInput['checklistItems'] = Array.from({ length: 10 }, (_, index) => {
  const value = index + 1;
  const workflowStatus =
    value <= 5
      ? 'blocked'
      : value <= 7
        ? 'completed'
        : value === 8
          ? 'ready_for_review'
          : value === 9
            ? 'requires_human_proof'
            : 'waived';
  const artifactState =
    value <= 5
      ? 'missing'
      : value <= 7
        ? 'reviewed'
        : value === 8
          ? 'pending_review'
          : value === 9
            ? 'requires_human_proof'
            : 'accepted_by_waiver';
  return {
    id: id(200, value),
    candidateId: id(201, value),
    findingId: id(202, value),
    title:
      value <= 5
        ? `Missing mandatory Form ${String.fromCharCode(64 + value)}-${value}`
        : `Checklist response ${value}`,
    category: value <= 5 ? 'mandatory_form' : value === 9 ? 'license' : 'attachment',
    mandatory: true,
    requiredDenominator: true,
    eligibilityClass:
      value === 8 ? 'review_needed' : value === 9 ? 'unresolved_risk' : 'ordinary_active',
    lifecycleStatus: 'active',
    workflowStatus,
    artifactState,
    owner: value % 2 === 0 ? 'Operations reviewer' : null,
    reviewer: value > 5 ? 'Compliance reviewer' : null,
    dueAt: '2027-09-30T19:00:00.000Z',
    dueTimezone: 'America/New_York',
    sourceDocumentId: id(102, 1),
    sourcePageNumber: value + 1,
    sourceQuote: exactQuote(value),
    sourceEvidenceValidated: true,
    sourceSupportStatus:
      value === 8 ? 'partially_supported' : value === 9 ? 'parser_uncertain' : 'supported',
    precedenceStatus: value === 9 ? 'undetermined' : 'active',
    proofRequirement: value === 9 ? 'requires_company_artifact' : 'none_identified',
    humanReviewStatus: value === 8 || value === 9 ? 'pending' : 'accepted',
    relationshipRole: 'atomic',
  } as const;
});

const blockers: ReportInput['blockers'] = [
  ...Array.from({ length: 5 }, (_, index) => ({
    id: id(300, index + 1),
    checklistItemId: id(200, index + 1),
    type: 'missing_mandatory_form',
    severity: 'critical' as const,
    title: `Missing mandatory Form ${String.fromCharCode(65 + index)}-${index + 1}`,
    explanation: 'A required form artifact is missing.',
    status: 'open' as const,
    resolutionState: 'unresolved' as const,
  })),
  {
    id: id(300, 6),
    checklistItemId: id(200, 8),
    type: 'partial_source_support',
    severity: 'blocking',
    title: 'Partial response requires review',
    explanation: 'A material qualifier remains unresolved.',
    status: 'open',
    resolutionState: 'unresolved',
  },
  {
    id: id(300, 7),
    checklistItemId: id(200, 9),
    type: 'missing_human_proof',
    severity: 'blocking',
    title: 'Company license proof is missing',
    explanation: 'Reviewed company evidence has not been linked.',
    status: 'open',
    resolutionState: 'unresolved',
  },
  {
    id: id(300, 8),
    checklistItemId: id(200, 8),
    type: 'pending_waiver',
    severity: 'warning',
    title: 'Waiver review pending',
    explanation: 'The pending waiver does not resolve the item.',
    status: 'open',
    resolutionState: 'unresolved',
  },
];

const artifacts: ReportInput['artifacts'] = checklistItems.map((item, index) => ({
  id: id(400, index + 1),
  checklistItemId: item.id,
  artifactType: item.category === 'mandatory_form' ? 'required_form' : item.category,
  state: item.artifactState,
  documentId: item.artifactState === 'reviewed' ? id(401, index + 1) : null,
  reviewed: item.artifactState === 'reviewed',
}));

const proposalClaims: ReportInput['proposalClaims'] = [
  ['supported', 'consistent', 'requirement_response', 1, 1],
  ['requires_human_proof', 'undetermined', 'company_credential', 2, 0],
  ['unsupported', 'not_applicable', 'company_capability', 3, 0],
  ['contradicted', 'inconsistent', 'deadline_statement', 4, 2],
  ['contradicted', 'inconsistent', 'insurance_claim', 5, 2],
  ['contradicted', 'inconsistent', 'procurement_identity', 6, 1],
  ['partially_supported', 'undetermined', 'requirement_response', 7, 1],
  ['parser_uncertain', 'undetermined', 'unknown', 8, 0],
].map(([supportStatus, consistencyStatus, claimType, pageNumber, evidenceCount], index) => ({
  id: id(500, index + 1),
  text:
    index === 2
      ? '=HYPERLINK("https://malicious.invalid","zero incidents")'
      : `Synthetic proposal claim ${index + 1}.`,
  pageNumber: Number(pageNumber),
  claimType: String(claimType),
  supportStatus: supportStatus as ReportInput['proposalClaims'][number]['supportStatus'],
  consistencyStatus:
    consistencyStatus as ReportInput['proposalClaims'][number]['consistencyStatus'],
  parserUncertain: supportStatus === 'parser_uncertain',
  evidenceCount: Number(evidenceCount),
}));

const findingDefinitions = [
  [
    'unsupported_claim',
    'warning',
    'Unsupported company assertion',
    'unsupported',
    'not_applicable',
  ],
  [
    'date_mismatch',
    'critical',
    'Proposal date conflicts with source',
    'contradicted',
    'inconsistent',
  ],
  [
    'numerical_mismatch',
    'critical',
    'Insurance value conflicts with source',
    'contradicted',
    'inconsistent',
  ],
  [
    'wrong_procurement_identity',
    'critical',
    'Proposal references another procurement',
    'contradicted',
    'inconsistent',
  ],
  ['missing_required_response', 'blocking', 'Mandatory proposal response is missing', null, null],
  [
    'human_proof_required',
    'warning',
    'Company claim requires proof',
    'requires_human_proof',
    'undetermined',
  ],
  [
    'parser_uncertainty',
    'blocking',
    'Proposal section cannot be reliably parsed',
    'parser_uncertain',
    'undetermined',
  ],
  [
    'contradicted_claim',
    'blocking',
    'Prior contradiction resolved by evidence',
    'contradicted',
    'inconsistent',
  ],
  [
    'corrected_in_revision',
    'informational',
    'Later proposal revision corrected the claim',
    null,
    null,
  ],
] as const;

const proposalFindings: ReportInput['proposalFindings'] = findingDefinitions.map(
  (definition, index) => {
    const value = index + 1;
    const resolved = value >= 8;
    const sourceRequired = !['unsupported_claim', 'wrong_procurement_identity'].includes(
      definition[0],
    );
    return {
      id: id(600, value),
      checklistItemId: value === 5 ? id(200, 1) : null,
      claimId: value === 5 || value === 9 ? null : id(500, Math.min(value, 8)),
      type: definition[0],
      severity: definition[1],
      title: definition[2],
      detail: `Synthetic deterministic finding ${value}.`,
      workflowStatus: value === 9 ? 'obsolete' : resolved ? 'resolved' : 'open',
      humanResolutionStatus: resolved ? 'accepted' : 'pending',
      supportStatus: definition[3],
      consistencyStatus: definition[4],
      proofRequirement: value === 6 ? 'requires_company_artifact' : 'none_identified',
      proposalDocumentId: id(700, 1),
      proposalPageNumber: value === 5 || value === 9 ? null : Math.min(value + 1, 8),
      proposalQuote: value === 5 || value === 9 ? null : `Synthetic proposal claim ${value}.`,
      sourceDocumentId: sourceRequired ? id(102, 1) : null,
      sourcePageNumber: sourceRequired && value !== 7 ? value + 1 : null,
      sourceQuote: sourceRequired && value !== 7 ? exactQuote(value) : null,
      machineOnly: true,
      resolvedByRevision: value === 9,
      resolvedByEvidence: value === 8,
    };
  },
);

export const reportingKnownAnswerInput: ReportInput = {
  workspace: {
    id: REPORTING_WORKSPACE_ID,
    name: 'Harbor City Reporting Demo',
    procurementTitle: 'Harbor City Security Services',
    solicitationNumber: 'HC-2027-14',
    demo: true,
    dataClassification: 'synthetic_demo',
  },
  reportType: 'executive',
  sourceSnapshotAt: '2027-09-01T12:00:00.000Z',
  runs: {
    analysisRunId: id(800, 1),
    verificationRunId: id(800, 2),
    checklistGenerationRunId: id(800, 3),
    readinessSnapshotId: id(800, 4),
    proposalAuditRunId: id(800, 5),
    proposalDraftId: id(800, 6),
    proposalRevision: 2,
  },
  versions: {
    phase4Fingerprint: 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b',
    checklistGenerator: 'checklist-generator-v1',
    blockerEngine: 'checklist-blockers-v1',
    readinessEngine: 'checklist-readiness-v1',
    proposalParser: 'proposal-section-parser-v1',
    proposalSegmenter: 'proposal-claim-segmenter-v1',
    proposalMatcher: 'proposal-response-matcher-v1',
    proposalContradiction: 'proposal-contradiction-v1',
    proposalSeverity: 'proposal-finding-severity-v1',
    proposalEvaluator: 'proposal-audit-evaluator-v1',
  },
  providerUseStatement: 'No Phase 7 provider calls; deterministic persisted data only.',
  requirements,
  checklistItems,
  blockers,
  artifacts,
  waivers: [
    {
      id: id(900, 1),
      checklistItemId: id(200, 10),
      status: 'accepted',
      designation: 'final',
      validForReadiness: true,
    },
    {
      id: id(900, 2),
      checklistItemId: id(200, 8),
      status: 'pending',
      designation: 'temporary',
      validForReadiness: false,
    },
  ],
  exceptions: [
    {
      id: id(901, 1),
      checklistItemId: id(200, 6),
      text: 'Synthetic accepted exception.',
      status: 'accepted',
    },
  ],
  proposalClaims,
  proposalFindings,
  readiness: {
    id: id(800, 4),
    state: 'blocked',
    summary: 'Blocked by 7 required items',
    totalRequired: 10,
    completedRequired: 3,
    incompleteRequired: 7,
    blockedItems: 7,
    unresolvedItems: 2,
    humanProofItems: 1,
    informationalItems: 0,
    criticalBlockers: 5,
    warnings: 1,
    excludedItems: 0,
    createdAt: '2027-09-01T12:00:00.000Z',
  },
};

export const reportingKnownAnswerExpected = {
  requiredItems: 10,
  completedRequiredItems: 3,
  criticalBlockers: 8,
  blockingIssues: 4,
  warnings: 3,
  unresolvedRequirements: 2,
  unresolvedProposalFindings: 7,
  missingArtifacts: 6,
  humanProofCount: 2,
  humanReviewPending: 9,
  reviewedFindings: 2,
  criticalBlockerRows: 12,
  unresolvedRows: 16,
  phase4Review: { numerator: 6, denominator: 8, ratio: 0.75 },
  phase5Review: { numerator: 3, denominator: 10, ratio: 0.3 },
  phase6Review: { numerator: 2, denominator: 9, ratio: 2 / 9 },
  sourceCoverage: {
    activeRequirements: { numerator: 6, denominator: 7, ratio: 6 / 7 },
    checklistEvidence: { numerator: 10, denominator: 10, ratio: 1 },
    proposalClaimPages: { numerator: 8, denominator: 8, ratio: 1 },
    criticalFindingEvidence: { numerator: 5, denominator: 5, ratio: 1 },
    humanProofAvailability: { numerator: 0, denominator: 1, ratio: 0 },
  },
  demoWatermark: 'DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION',
} as const;
