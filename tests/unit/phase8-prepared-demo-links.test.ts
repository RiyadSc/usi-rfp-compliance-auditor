import { describe, expect, it } from 'vitest';
import { aggregateReport } from '@usi/domain';
import { reportingKnownAnswerInput } from '../../fixtures/eval/reporting-known-answer';
import {
  PHASE8_PREPARED_AUDIT_RUN_ID,
  PHASE8_PREPARED_REPORT_ID,
  PHASE8_PREPARED_SOURCE_DOCUMENT_ID,
  PHASE8_PREPARED_WORKSPACE_ID,
  createPreparedDemoLinkResolver,
} from '../../apps/web/src/lib/reporting/prepared-demo-links';

describe('Phase 8 prepared-demo report links', () => {
  const report = aggregateReport(reportingKnownAnswerInput);
  const links = createPreparedDemoLinkResolver({
    workspaceId: PHASE8_PREPARED_WORKSPACE_ID,
    reportId: PHASE8_PREPARED_REPORT_ID,
    report,
  });

  it('maps fixture checklist, requirement, finding, and document identities to prepared rows', () => {
    expect(links.checklistId(report.checklistItems[0]!.id)).toBe(
      '81000000-0000-4000-8203-000000000001',
    );
    expect(links.candidateId(report.requirements[0]!.candidateId)).toBe(
      '81000000-0000-4000-8101-000000000001',
    );
    expect(links.findingId(report.proposalFindings[0]!.id)).toBe(
      '81000000-0000-4000-8212-000000000001',
    );
    expect(links.sourceDocumentId(report.requirements[0]!.documentId)).toBe(
      PHASE8_PREPARED_SOURCE_DOCUMENT_ID,
    );
  });

  it('rewrites every persisted report navigation reference into the authorized workspace', () => {
    for (const row of [...report.criticalBlockers, ...report.unresolvedFindings]) {
      const href = links.navigationReference(row.navigationReference);
      expect(href).toMatch(new RegExp(`^/w/${PHASE8_PREPARED_WORKSPACE_ID}/`));
      expect(href).not.toContain(reportingKnownAnswerInput.workspace.id);
    }
    expect(
      links.navigationReference(
        report.criticalBlockers.find((row) => row.sourcePhase === 'phase6')!.navigationReference,
      ),
    ).toContain(`/proposal-audit/${PHASE8_PREPARED_AUDIT_RUN_ID}#finding-`);
  });

  it('fails closed for an unexpected prepared-demo navigation target', () => {
    expect(() => links.navigationReference('https://example.invalid')).toThrow(
      'phase8_prepared_report_navigation_reference_invalid',
    );
  });

  it('does not rewrite ordinary report identities', () => {
    const ordinary = createPreparedDemoLinkResolver({
      workspaceId: reportingKnownAnswerInput.workspace.id,
      reportId: '71000000-0000-4000-7000-000000000001',
      report,
    });
    expect(ordinary.navigationReference(report.criticalBlockers[0]!.navigationReference)).toBe(
      report.criticalBlockers[0]!.navigationReference,
    );
  });
});
