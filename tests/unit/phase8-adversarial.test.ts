import { describe, expect, it } from 'vitest';
import { entailmentResultSchema, modelExtractionSchema } from '@usi/ai';
import { generateReportCsv, aggregateReport, proposalAuditResultSchema } from '@usi/domain';
import {
  MALFORMED_MODEL_OUTPUT_CORPUS,
  PARSER_FAILURE_CORPUS,
  PROMPT_INJECTION_CORPUS,
} from '../../fixtures/eval/phase8-adversarial';
import {
  proposalAuditPages,
  proposalAuditRequirements,
  proposalIdentity,
} from '../../fixtures/eval/proposal-audit-known-answer';
import { auditProposalDraft } from '@usi/domain';
import { reportingKnownAnswerInput } from '../../fixtures/eval/reporting-known-answer';

describe('Phase 8 adversarial fixtures', () => {
  it('covers every authorized prompt-injection surface with zero decision influence', () => {
    expect(new Set(PROMPT_INJECTION_CORPUS.map((entry) => entry.surface))).toEqual(
      new Set([
        'rfp',
        'addendum',
        'proposal',
        'attachment',
        'heading',
        'metadata',
        'ocr',
        'evidence',
        'csv',
        'filename',
      ]),
    );
    const audit = auditProposalDraft({
      workspaceId: proposalAuditPages[0]!.workspaceId,
      proposalDocumentId: proposalAuditPages[0]!.documentId,
      proposalDocumentSha256: 'a'.repeat(64),
      proposalIdentity,
      pages: proposalAuditPages,
      requirements: proposalAuditRequirements,
    });
    expect(audit.injectionInfluence).toBe(false);
    expect(audit.findings.some((finding) => finding.type === 'prompt_injection_attempt')).toBe(
      true,
    );
    const csv = generateReportCsv(aggregateReport(reportingKnownAnswerInput), 'proposal_claims');
    expect(csv).not.toMatch(/(?:^|,)=(?:HYPERLINK|IMPORT|WEBSERVICE)/im);
  });

  it('maps every parser failure to visible uncertainty or a closed failure', () => {
    expect(PARSER_FAILURE_CORPUS).toHaveLength(12);
    for (const fixture of PARSER_FAILURE_CORPUS) {
      expect(fixture.warnings.length, fixture.id).toBeGreaterThan(0);
      expect(['empty', 'failed', 'uncertain']).toContain(fixture.status);
      expect(fixture.status).not.toBe('ok');
    }
  });

  it('rejects the full malformed-output corpus without semantic rewriting', () => {
    expect(MALFORMED_MODEL_OUTPUT_CORPUS).toHaveLength(14);
    for (const fixture of MALFORMED_MODEL_OUTPUT_CORPUS) {
      const candidates = [
        modelExtractionSchema.safeParse(fixture.raw),
        entailmentResultSchema.safeParse(fixture.raw),
        proposalAuditResultSchema.safeParse(fixture.raw),
      ];
      expect(
        candidates.every((result) => !result.success),
        fixture.id,
      ).toBe(true);
    }
  });
});
