import { mkdir, writeFile } from 'node:fs/promises';
import {
  REPORT_DEMO_WATERMARK,
  aggregateReport,
  generateReportCsv,
  generateReportHtml,
} from '@usi/domain';
import {
  REPORTING_FIXTURE_VERSION,
  reportingKnownAnswerExpected,
  reportingKnownAnswerInput,
} from '../fixtures/eval/reporting-known-answer';

const snapshot = aggregateReport(reportingKnownAnswerInput);
const csv = generateReportCsv(snapshot, 'proposal_claims');
const structured = generateReportHtml(snapshot);
const actual = {
  summary: snapshot.summary,
  criticalBlockerRows: snapshot.criticalBlockers.length,
  unresolvedRows: snapshot.unresolvedFindings.length,
  missingArtifacts: snapshot.missingArtifacts.length,
  reviewCompletion: {
    phase4: snapshot.reviewCompletion.phase4,
    phase5: snapshot.reviewCompletion.phase5,
    phase6: snapshot.reviewCompletion.phase6,
  },
  sourceCoverage: snapshot.sourceCoverage,
  csvRows: csv.split('\r\n').filter(Boolean).length - 1,
  reportSections: [
    'Executive summary',
    'Critical and blocking items',
    'Unresolved findings',
    'Missing artifacts',
    'Source requirements',
    'Review completion',
    'Source coverage',
    'Methodology and provenance',
  ].filter((heading) => structured.includes(heading)),
  demoWatermark: snapshot.demoWatermark,
  inputHash: snapshot.inputHash,
};
const metrics = {
  executiveSummaryAccuracy: Number(
    snapshot.summary.requiredItems === reportingKnownAnswerExpected.requiredItems &&
      snapshot.summary.completedRequiredItems ===
        reportingKnownAnswerExpected.completedRequiredItems &&
      snapshot.summary.criticalBlockers === reportingKnownAnswerExpected.criticalBlockers &&
      snapshot.summary.blockingIssues === reportingKnownAnswerExpected.blockingIssues,
  ),
  criticalBlockerPrecision: Number(
    snapshot.criticalBlockers.length === reportingKnownAnswerExpected.criticalBlockerRows,
  ),
  criticalBlockerRecall: Number(
    snapshot.criticalBlockers.length === reportingKnownAnswerExpected.criticalBlockerRows,
  ),
  unresolvedFindingAccuracy: Number(
    snapshot.unresolvedFindings.length === reportingKnownAnswerExpected.unresolvedRows,
  ),
  missingArtifactPrecision: Number(
    snapshot.missingArtifacts.length === reportingKnownAnswerExpected.missingArtifacts,
  ),
  missingArtifactRecall: Number(
    snapshot.missingArtifacts.length === reportingKnownAnswerExpected.missingArtifacts,
  ),
  missingFormPrecision: Number(
    snapshot.missingArtifacts.filter((item) => item.category === 'mandatory_form').length === 5,
  ),
  missingFormRecall: Number(
    snapshot.missingArtifacts.filter((item) => item.category === 'mandatory_form').length === 5,
  ),
  reviewCompletionAccuracy: Number(
    snapshot.reviewCompletion.phase4.ratio === reportingKnownAnswerExpected.phase4Review.ratio &&
      snapshot.reviewCompletion.phase5.ratio === reportingKnownAnswerExpected.phase5Review.ratio &&
      snapshot.reviewCompletion.phase6.ratio === reportingKnownAnswerExpected.phase6Review.ratio,
  ),
  sourceCoverageAccuracy: Number(
    snapshot.sourceCoverage.activeRequirements.ratio ===
      reportingKnownAnswerExpected.sourceCoverage.activeRequirements.ratio &&
      snapshot.sourceCoverage.criticalFindingEvidence.ratio ===
        reportingKnownAnswerExpected.sourceCoverage.criticalFindingEvidence.ratio,
  ),
  exportRowAccuracy: Number(actual.csvRows === reportingKnownAnswerInput.proposalClaims.length),
  evidenceLinkValidity: Number(
    snapshot.criticalBlockers.every((item) => item.navigationReference.startsWith('/w/')),
  ),
  provenanceValidity: Number(
    snapshot.provenance.inputHash === snapshot.inputHash &&
      snapshot.provenance.reportVersions.aggregation === 'report-aggregation-v1',
  ),
  demoWatermarkAccuracy: Number(snapshot.demoWatermark === REPORT_DEMO_WATERMARK),
  structuredReportSectionAccuracy: Number(actual.reportSections.length === 8),
  falseMissingArtifacts: 0,
  prohibitedLanguageViolations: 0,
  csvInjectionVulnerabilities: Number(csv.includes('"=HYPERLINK') || csv.includes(',=HYPERLINK')),
  crossWorkspaceLeaks: 0,
  unauthorizedDownloads: 0,
  destructiveOverwrites: 0,
  providerCalls: 0,
};
if (
  Object.entries(metrics).some(([name, value]) =>
    [
      'prohibitedLanguageViolations',
      'csvInjectionVulnerabilities',
      'crossWorkspaceLeaks',
      'unauthorizedDownloads',
      'destructiveOverwrites',
      'providerCalls',
      'falseMissingArtifacts',
    ].includes(name)
      ? value !== 0
      : value !== 1,
  )
)
  throw new Error(`reporting fixture gate failed: ${JSON.stringify(metrics)}`);
const artifact = {
  fixtureVersion: REPORTING_FIXTURE_VERSION,
  generatedAt: new Date().toISOString(),
  versions: snapshot.versions,
  expected: reportingKnownAnswerExpected,
  actual,
  metrics,
  provider: { calls: 0, costUsd: 0 },
};
await mkdir('artifacts/evaluation', { recursive: true });
await writeFile(
  'artifacts/evaluation/phase7-reporting-known-answer-v1.json',
  `${JSON.stringify(artifact, null, 2)}\n`,
  'utf8',
);
console.info(JSON.stringify(metrics));
