import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  REPORT_DEMO_WATERMARK,
  REPORT_DOWNLOAD_EXPIRY_SECONDS,
  REPORT_VERSIONS,
  aggregateReport,
  assertNoProhibitedReportLanguage,
  calculateReportInputHash,
  generateReportCsv,
  generateReportHtml,
  neutralizeCsvCell,
  reportInputSchema,
  reportSnapshotSchema,
  safeExportFilename,
} from '@usi/domain';
import {
  reportingKnownAnswerExpected,
  reportingKnownAnswerInput,
} from '../../fixtures/eval/reporting-known-answer';

describe('Phase 7 deterministic reporting domain', () => {
  it('publishes immutable report, export, language, and download versions', () => {
    expect(REPORT_VERSIONS).toEqual({
      input: 'report-input-v1',
      aggregation: 'report-aggregation-v1',
      schema: 'report-schema-v1',
      executive: 'executive-readiness-report-v1',
      manifest: 'export-manifest-v1',
      csv: 'report-csv-v1',
      html: 'report-html-v1',
      languagePolicy: 'report-language-policy-v1',
      downloadPolicy: 'report-download-policy-v1',
    });
    expect(REPORT_DOWNLOAD_EXPIRY_SECONDS).toBe(300);
  });

  it('strictly validates the frozen report input and snapshot', () => {
    expect(() => reportInputSchema.parse(reportingKnownAnswerInput)).not.toThrow();
    expect(() =>
      reportInputSchema.parse({ ...reportingKnownAnswerInput, complianceStatus: 'yes' }),
    ).toThrow();
    expect(() =>
      reportSnapshotSchema.parse(aggregateReport(reportingKnownAnswerInput)),
    ).not.toThrow();
  });

  it('produces the exact executive summary and critical blocker totals', () => {
    const result = aggregateReport(reportingKnownAnswerInput);
    expect(result.summary).toMatchObject({
      requiredItems: reportingKnownAnswerExpected.requiredItems,
      completedRequiredItems: reportingKnownAnswerExpected.completedRequiredItems,
      criticalBlockers: reportingKnownAnswerExpected.criticalBlockers,
      blockingIssues: reportingKnownAnswerExpected.blockingIssues,
      warnings: reportingKnownAnswerExpected.warnings,
      unresolvedRequirements: reportingKnownAnswerExpected.unresolvedRequirements,
      unresolvedProposalFindings: reportingKnownAnswerExpected.unresolvedProposalFindings,
      missingArtifacts: reportingKnownAnswerExpected.missingArtifacts,
      humanProofCount: reportingKnownAnswerExpected.humanProofCount,
      humanReviewPending: reportingKnownAnswerExpected.humanReviewPending,
      reviewedFindings: reportingKnownAnswerExpected.reviewedFindings,
    });
    expect(result.criticalBlockers).toHaveLength(reportingKnownAnswerExpected.criticalBlockerRows);
    expect(result.criticalBlockers.filter((item) => item.sourcePhase === 'phase5')).toHaveLength(7);
    expect(result.criticalBlockers.filter((item) => item.sourcePhase === 'phase6')).toHaveLength(5);
  });

  it('keeps unresolved source, checklist, and proposal axes distinct', () => {
    const result = aggregateReport(reportingKnownAnswerInput);
    expect(result.unresolvedFindings).toHaveLength(reportingKnownAnswerExpected.unresolvedRows);
    expect(new Set(result.unresolvedFindings.map((item) => item.sourcePhase))).toEqual(
      new Set(['phase4', 'phase5', 'phase6']),
    );
    const proof = result.unresolvedFindings.find((item) => item.type === 'human_proof_required');
    expect(proof?.machineState).toContain('requires_company_artifact');
    expect(proof?.reason).not.toContain('false');
  });

  it('reports exactly five missing forms plus one separate human-proof artifact', () => {
    const result = aggregateReport(reportingKnownAnswerInput);
    expect(result.missingArtifacts).toHaveLength(6);
    expect(
      result.missingArtifacts.filter((item) => item.category === 'mandatory_form'),
    ).toHaveLength(5);
    expect(
      result.missingArtifacts.filter((item) => item.artifactState === 'requires_human_proof'),
    ).toHaveLength(1);
    expect(result.missingArtifacts.every((item) => item.waiverState !== 'accepted_final')).toBe(
      true,
    );
  });

  it('uses separate explicit review denominators', () => {
    const result = aggregateReport(reportingKnownAnswerInput);
    expect(result.reviewCompletion.phase4).toMatchObject(reportingKnownAnswerExpected.phase4Review);
    expect(result.reviewCompletion.phase5).toMatchObject(reportingKnownAnswerExpected.phase5Review);
    expect(result.reviewCompletion.phase6).toMatchObject(reportingKnownAnswerExpected.phase6Review);
    expect(result.reviewCompletion.acceptedExceptionsOrWaivers).toBe(2);
    expect(result.reviewCompletion.resolvedByRevision).toBe(1);
    expect(result.reviewCompletion.resolvedByEvidence).toBe(1);
  });

  it('calculates every source coverage denominator without hiding unresolved records', () => {
    const result = aggregateReport(reportingKnownAnswerInput);
    expect(result.sourceCoverage).toMatchObject(reportingKnownAnswerExpected.sourceCoverage);
    expect(result.sourceCoverage.missingSourcePages).toBe(1);
    expect(result.sourceCoverage.parserUncertainPages).toBe(1);
    expect(result.sourceCoverage.excludedSupersededSources).toBe(1);
  });

  it('hashes identical inputs identically and source changes differently', () => {
    expect(calculateReportInputHash(reportingKnownAnswerInput)).toBe(
      calculateReportInputHash(structuredClone(reportingKnownAnswerInput)),
    );
    expect(
      calculateReportInputHash({
        ...reportingKnownAnswerInput,
        sourceSnapshotAt: '2027-09-01T12:00:01.000Z',
      }),
    ).not.toBe(calculateReportInputHash(reportingKnownAnswerInput));
    expect(
      calculateReportInputHash({
        ...reportingKnownAnswerInput,
        blockers: [...reportingKnownAnswerInput.blockers].reverse(),
        proposalFindings: [...reportingKnownAnswerInput.proposalFindings].reverse(),
      }),
    ).toBe(calculateReportInputHash(reportingKnownAnswerInput));
  });

  it.each(['=1+1', ' +SUM(A1:A2)', '-2+3', '@IMPORTXML("x")'])(
    'neutralizes CSV formula cell %s',
    (value) => expect(neutralizeCsvCell(value)).toBe(`'${value}`),
  );

  it('exports deterministic RFC-compatible CSV with formula neutralization', () => {
    const csv = generateReportCsv(aggregateReport(reportingKnownAnswerInput), 'proposal_claims');
    expect(csv.startsWith('\uFEFF"report_version","demo_label"')).toBe(true);
    expect(csv).toContain('\'=HYPERLINK(""https://malicious.invalid"",""zero incidents"")');
    expect(csv).toContain(REPORT_DEMO_WATERMARK);
    expect(csv.split('\r\n')).toHaveLength(reportingKnownAnswerInput.proposalClaims.length + 2);
  });

  it('produces escaped self-contained HTML without signed or private storage URLs', () => {
    const report = aggregateReport(reportingKnownAnswerInput);
    const output = generateReportHtml(report);
    expect(output).toContain(REPORT_DEMO_WATERMARK);
    expect(output).toContain('Executive readiness report');
    expect(output).toContain('Blocked by 7 required items');
    expect(output).not.toContain('workspace-exports/');
    expect(output).not.toContain('token=');
    expect(output).not.toContain('<script');
  });

  it.each([
    'The proposal is compliant',
    'APPROVED',
    'Safe to submit',
    'Guaranteed complete',
    'certified complete',
    'fully verified',
    'legally sufficient',
    'submission-ready',
  ])('rejects prohibited report conclusion %s', (value) => {
    expect(() => assertNoProhibitedReportLanguage(value)).toThrow('prohibited_report_language');
  });

  it('allows factual workflow language', () => {
    expect(() =>
      assertNoProhibitedReportLanguage(
        'Ready for final review. Blocked by 5 required items. Human review required.',
      ),
    ).not.toThrow();
  });

  it('creates normalized demo filenames without forbidden labels', () => {
    expect(
      safeExportFilename({
        workspaceName: 'Harbor City / Security',
        reportType: 'executive',
        format: 'html',
        demo: true,
      }),
    ).toBe('demo-synthetic-harbor-city-security-executive-report-schema-v1.html');
  });

  it('keeps prohibited conclusions out of Phase 7 surfaces, exports, and artifacts', () => {
    const paths = [
      'apps/web/src/app/w/[workspaceId]/reports/page.tsx',
      'apps/web/src/app/w/[workspaceId]/reports/[reportId]/page.tsx',
      'apps/web/src/app/w/[workspaceId]/reports/report-controls.tsx',
      'apps/web/src/app/w/[workspaceId]/reports/actions.ts',
      'apps/web/src/lib/reporting/service.ts',
      'supabase/migrations/20260718000021_phase7_reporting_exports.sql',
      'fixtures/eval/reporting-known-answer.ts',
      'artifacts/evaluation/phase7-reporting-known-answer-v1.json',
    ];
    const prohibited = /\bcompliant\b|\bapproved\b|safe to submit|guaranteed complete/i;
    for (const path of paths) expect(readFileSync(path, 'utf8'), path).not.toMatch(prohibited);
  });

  it('keeps focused report types on the same aggregate input hash', () => {
    const hashes = [
      'executive',
      'findings',
      'checklist',
      'missing_artifacts',
      'source_coverage',
    ].map(
      (reportType) =>
        aggregateReport({
          ...reportingKnownAnswerInput,
          reportType: reportType as typeof reportingKnownAnswerInput.reportType,
        }).inputHash,
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
