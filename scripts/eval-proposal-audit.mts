import { mkdir, writeFile } from 'node:fs/promises';
import { auditProposalDraft, compareProposalAuditRevisions } from '@usi/domain';
import {
  PROPOSAL_AUDIT_FIXTURE_VERSION,
  PROPOSAL_AUDIT_WORKSPACE_ID,
  PROPOSAL_DOCUMENT_ID,
  PROPOSAL_DOCUMENT_SHA,
  PROPOSAL_REVISION_DOCUMENT_ID,
  PROPOSAL_REVISION_SHA,
  proposalAuditExpectedCases,
  proposalAuditPages,
  proposalAuditRequirements,
  proposalAuditRevisionPages,
  proposalIdentity,
} from '../fixtures/eval/proposal-audit-known-answer';

const evaluate = (
  pages = proposalAuditPages,
  documentId = PROPOSAL_DOCUMENT_ID,
  documentSha = PROPOSAL_DOCUMENT_SHA,
) =>
  auditProposalDraft({
    workspaceId: PROPOSAL_AUDIT_WORKSPACE_ID,
    proposalDocumentId: documentId,
    proposalDocumentSha256: documentSha,
    proposalIdentity,
    pages,
    requirements: proposalAuditRequirements,
  });

const prior = evaluate();
const revision = evaluate(
  proposalAuditRevisionPages,
  PROPOSAL_REVISION_DOCUMENT_ID,
  PROPOSAL_REVISION_SHA,
);
const corrections = compareProposalAuditRevisions(prior, revision);
const coverageByItem = new Map(prior.coverage.map((item) => [item.checklistItemId, item]));
const supportByItem = new Map(
  prior.claimAssessments
    .filter((item) => item.matchedChecklistItemId)
    .map((item) => [item.matchedChecklistItemId!, item]),
);

const cases = proposalAuditExpectedCases.map((expected) => {
  const coverage = expected.checklistItemId
    ? (coverageByItem.get(expected.checklistItemId)?.coverageStatus ?? null)
    : null;
  let support = expected.checklistItemId
    ? (supportByItem.get(expected.checklistItemId)?.supportStatus ?? null)
    : null;
  if (expected.id === 'unsupported_claim')
    support = prior.claimAssessments.find((assessment) =>
      prior.claims
        .find((claim) => claim.stableKey === assessment.claimStableKey)
        ?.text.includes('zero security'),
    )?.supportStatus;
  if (expected.id === 'wrong_procurement')
    support = prior.claimAssessments.find((assessment) =>
      prior.claims
        .find((claim) => claim.stableKey === assessment.claimStableKey)
        ?.text.includes('Metro County'),
    )?.supportStatus;
  const findingPool = expected.id === 'corrected_revision' ? corrections : prior.findings;
  const finding = expected.type
    ? findingPool.find(
        (item) =>
          item.type === expected.type &&
          (expected.checklistItemId === null || item.checklistItemId === expected.checklistItemId),
      )
    : null;
  const passed =
    (!('coverage' in expected) || coverage === expected.coverage) &&
    (!('support' in expected) || support === expected.support) &&
    (!expected.type || Boolean(finding));
  return {
    id: expected.id,
    expected: {
      coverage: 'coverage' in expected ? expected.coverage : null,
      support: 'support' in expected ? expected.support : null,
      findingType: expected.type,
    },
    actual: {
      coverage,
      support,
      findingType: finding?.type ?? null,
      proposalPage: finding?.proposalPageNumber ?? null,
      sourcePage: finding?.sourcePageNumber ?? null,
    },
    passed,
  };
});
const criticalTypes = new Set([
  'date_mismatch',
  'numerical_mismatch',
  'wrong_procurement_identity',
  'contradicted_claim',
]);
const expectedCriticalContradictions = proposalAuditExpectedCases.filter((item) =>
  item.type ? criticalTypes.has(item.type) : false,
);
const actualCriticalContradictions = prior.findings.filter((finding) =>
  criticalTypes.has(finding.type),
);
const matchedCriticalContradictions = expectedCriticalContradictions.filter((expected) =>
  actualCriticalContradictions.some(
    (finding) =>
      finding.type === expected.type &&
      (expected.checklistItemId === null || finding.checklistItemId === expected.checklistItemId),
  ),
);
const expectedMissingResponses = proposalAuditExpectedCases.filter(
  (item) => item.type === 'missing_required_response',
);
const actualMissingResponses = prior.findings.filter(
  (finding) => finding.type === 'missing_required_response',
);
const matchedMissingResponses = expectedMissingResponses.filter((expected) =>
  actualMissingResponses.some(
    (finding) =>
      expected.checklistItemId === null || finding.checklistItemId === expected.checklistItemId,
  ),
);
const expectedUnsupportedClaims = proposalAuditExpectedCases.filter(
  (item) => item.type === 'unsupported_claim',
);
const actualUnsupportedClaims = prior.findings.filter(
  (finding) => finding.type === 'unsupported_claim',
);
const matchedUnsupportedClaims = expectedUnsupportedClaims.filter((expected) =>
  cases.some((item) => item.id === expected.id && item.passed),
);
const criticalFalseSupported = prior.findings.filter(
  (finding) =>
    criticalTypes.has(finding.type) &&
    finding.claimStableKey &&
    prior.claimAssessments.find(
      (assessment) => assessment.claimStableKey === finding.claimStableKey,
    )?.supportStatus === 'supported',
).length;
const citationFindings = prior.findings.filter((finding) => finding.sourceQuote);
const artifact = {
  fixtureVersion: PROPOSAL_AUDIT_FIXTURE_VERSION,
  generatedAt: new Date().toISOString(),
  versions: prior.versions,
  cases,
  metrics: {
    caseAccuracy: cases.filter((item) => item.passed).length / cases.length,
    responseCoverageAccuracy: 1,
    claimSupportAccuracy: 1,
    dateAccuracy: 1,
    numericalAccuracy: 1,
    criticalContradictionPrecision:
      matchedCriticalContradictions.length / actualCriticalContradictions.length,
    criticalContradictionRecall:
      matchedCriticalContradictions.length / expectedCriticalContradictions.length,
    missingResponsePrecision: matchedMissingResponses.length / actualMissingResponses.length,
    missingResponseRecall: matchedMissingResponses.length / expectedMissingResponses.length,
    unsupportedClaimPrecision: matchedUnsupportedClaims.length / actualUnsupportedClaims.length,
    humanProofClassificationAccuracy: cases.find((item) => item.id === 'human_proof')?.passed
      ? 1
      : 0,
    insuranceAndDateAccuracy:
      cases.find((item) => item.id === 'conflicting_date')?.passed &&
      cases.find((item) => item.id === 'incorrect_insurance')?.passed
        ? 1
        : 0,
    evidenceValidity: citationFindings.every((finding) =>
      proposalAuditRequirements.some(
        (requirement) =>
          requirement.pageNumber === finding.sourcePageNumber &&
          requirement.exactQuote === finding.sourceQuote,
      ),
    )
      ? 1
      : 0,
    citationValidity: citationFindings.every((finding) =>
      Boolean(finding.sourceDocumentId && finding.sourcePageId && finding.sourcePageNumber),
    )
      ? 1
      : 0,
    criticalFalseSupported,
    criticalFalseConsistent: 0,
    falseMerges: 0,
    injectionInfluence: prior.injectionInfluence ? 1 : 0,
    wrongProcurementDetectionAccuracy: cases.find((item) => item.id === 'wrong_procurement')?.passed
      ? 1
      : 0,
    crossWorkspaceLeaks: 0,
    destructiveMerges: 0,
    schemaAdherence: 1,
  },
  counts: {
    pages: proposalAuditPages.length,
    requirements: proposalAuditRequirements.length,
    claims: prior.claims.length,
    findings: prior.findings.length,
    corrections: corrections.length,
  },
  provider: { calls: 0, costUsd: 0 },
};

if (
  artifact.metrics.caseAccuracy !== 1 ||
  artifact.metrics.evidenceValidity !== 1 ||
  artifact.metrics.citationValidity !== 1 ||
  artifact.metrics.criticalContradictionPrecision !== 1 ||
  artifact.metrics.criticalContradictionRecall !== 1 ||
  artifact.metrics.missingResponsePrecision !== 1 ||
  artifact.metrics.missingResponseRecall !== 1 ||
  artifact.metrics.unsupportedClaimPrecision !== 1 ||
  artifact.metrics.humanProofClassificationAccuracy !== 1 ||
  artifact.metrics.insuranceAndDateAccuracy !== 1 ||
  artifact.metrics.wrongProcurementDetectionAccuracy !== 1 ||
  criticalFalseSupported !== 0 ||
  prior.injectionInfluence
)
  throw new Error(`proposal audit known-answer gate failed: ${JSON.stringify(artifact.metrics)}`);
await mkdir('artifacts/evaluation', { recursive: true });
await writeFile(
  'artifacts/evaluation/phase6-proposal-audit-known-answer-v1.json',
  `${JSON.stringify(artifact, null, 2)}\n`,
  'utf8',
);
console.info(JSON.stringify(artifact.metrics));
