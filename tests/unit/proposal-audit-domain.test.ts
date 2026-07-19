import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_AUDIT_VERSIONS,
  assertProposalFindingTransition,
  auditProposalDraft,
  compareProposalAuditRevisions,
  extractProposalFacts,
  extractProposalSections,
  proposalAuditResultSchema,
  proposalClaimAssessmentSchema,
  proposalCoverageAssessmentSchema,
  proposalAuditFindingSchema,
  segmentProposalClaims,
} from '@usi/domain';
import {
  PROPOSAL_AUDIT_WORKSPACE_ID,
  PROPOSAL_DOCUMENT_ID,
  PROPOSAL_DOCUMENT_SHA,
  PROPOSAL_REVISION_DOCUMENT_ID,
  PROPOSAL_REVISION_SHA,
  proposalAuditPages,
  proposalAuditRequirements,
  proposalAuditRevisionPages,
  proposalIdentity,
} from '../../fixtures/eval/proposal-audit-known-answer';

function evaluate(
  pages = proposalAuditPages,
  documentId = PROPOSAL_DOCUMENT_ID,
  sha = PROPOSAL_DOCUMENT_SHA,
) {
  return auditProposalDraft({
    workspaceId: PROPOSAL_AUDIT_WORKSPACE_ID,
    proposalDocumentId: documentId,
    proposalDocumentSha256: sha,
    proposalIdentity,
    pages,
    requirements: proposalAuditRequirements,
  });
}

describe('Phase 6 proposal audit domain', () => {
  it('publishes immutable versioned engines and separated strict axes', () => {
    expect(PROPOSAL_AUDIT_VERSIONS).toEqual({
      sectionParser: 'proposal-section-parser-v1',
      claimSegmenter: 'proposal-claim-segmenter-v1',
      schema: 'proposal-audit-schema-v1',
      matcher: 'proposal-response-matcher-v1',
      supportPolicy: 'proposal-support-policy-v1',
      contradiction: 'proposal-contradiction-v1',
      severity: 'proposal-finding-severity-v1',
      evaluator: 'proposal-audit-evaluator-v1',
    });
    expect(() =>
      proposalClaimAssessmentSchema.parse({
        claimStableKey: 'a'.repeat(64),
        matchedChecklistItemId: null,
        matchScore: 0,
        matchReason: 'none',
        supportStatus: 'unsupported',
        consistencyStatus: 'not_applicable',
        rationale: 'no evidence',
        proposalFacts: [],
        requirementFacts: [],
        evidenceIds: [],
        machineOnly: true,
        humanResolutionStatus: 'accepted',
      }),
    ).toThrow();
  });

  it('extracts page-anchored sections and bounded atomic claims without executing injections', () => {
    const sections = extractProposalSections(proposalAuditPages);
    const claims = segmentProposalClaims(sections);
    expect(sections.length).toBeGreaterThanOrEqual(8);
    expect(claims.every((claim) => claim.endOffset > claim.startOffset)).toBe(true);
    const hostile = claims.find((claim) => claim.injectionSignals.length > 0);
    expect(hostile?.injectionSignals).toEqual(
      expect.arrayContaining(['secret_request', 'self_verify', 'change_output']),
    );
  });

  it('extracts typed dates, currency, percentages, quantities and form identifiers', () => {
    const facts = extractProposalFacts(
      'Submit Form B-2 by September 30, 2027 at 3:00 PM ET with at least $3 million per occurrence, 4 FTEs, and 5 percent.',
    );
    expect(facts.map((fact) => fact.kind)).toEqual(
      expect.arrayContaining(['date', 'currency', 'quantity', 'percentage', 'form_identifier']),
    );
    expect(facts.find((fact) => fact.kind === 'currency')).toMatchObject({
      normalized: '3000000',
      unit: 'USD',
      operator: 'minimum',
    });
  });

  it('evaluates the frozen known-answer cases with fail-closed axes', () => {
    const result = evaluate();
    expect(() => proposalAuditResultSchema.parse(result)).not.toThrow();
    const coverage = new Map(result.coverage.map((item) => [item.checklistItemId, item]));
    expect(coverage.get(proposalAuditRequirements[0]!.checklistItemId)?.coverageStatus).toBe(
      'addressed',
    );
    expect(coverage.get(proposalAuditRequirements[1]!.checklistItemId)?.coverageStatus).toBe(
      'partially_addressed',
    );
    expect(coverage.get(proposalAuditRequirements[3]!.checklistItemId)?.coverageStatus).toBe(
      'partially_addressed',
    );
    expect(coverage.get(proposalAuditRequirements[6]!.checklistItemId)?.coverageStatus).toBe(
      'missing',
    );
    expect(coverage.get(proposalAuditRequirements[7]!.checklistItemId)?.coverageStatus).toBe(
      'parser_uncertain',
    );

    const findingTypes = result.findings.map((finding) => finding.type);
    expect(findingTypes).toEqual(
      expect.arrayContaining([
        'date_mismatch',
        'numerical_mismatch',
        'partial_required_response',
        'contradicted_claim',
        'human_proof_required',
        'missing_required_response',
        'unresolved_source_requirement',
        'unsupported_claim',
        'wrong_procurement_identity',
        'prompt_injection_attempt',
      ]),
    );
    expect(result.injectionInfluence).toBe(false);
    expect(result.findings.every((finding) => finding.machineOnly)).toBe(true);
    expect(result.findings.every((finding) => finding.humanResolutionStatus === 'pending')).toBe(
      true,
    );
    expect(result.findings.filter((finding) => finding.type === 'unsupported_claim')).toHaveLength(
      1,
    );
    const correctIdentity = result.claimAssessments.find((assessment) =>
      result.claims
        .find((claim) => claim.stableKey === assessment.claimStableKey)
        ?.text.includes('Harbor City Procurement RFP HC-2027-14'),
    );
    expect(correctIdentity).toMatchObject({
      supportStatus: 'supported',
      rationale: 'proposal identity matches the immutable audit procurement identity',
    });
  });

  it('keeps company proof separate and accepts only reviewed workspace evidence', () => {
    const withoutProof = evaluate();
    const license = withoutProof.claimAssessments.find(
      (assessment) =>
        assessment.matchedChecklistItemId === proposalAuditRequirements[5]!.checklistItemId,
    );
    expect(license?.supportStatus).toBe('requires_human_proof');

    const withProof = auditProposalDraft({
      workspaceId: PROPOSAL_AUDIT_WORKSPACE_ID,
      proposalDocumentId: PROPOSAL_DOCUMENT_ID,
      proposalDocumentSha256: PROPOSAL_DOCUMENT_SHA,
      proposalIdentity,
      pages: proposalAuditPages,
      requirements: proposalAuditRequirements,
      companyEvidence: [
        {
          id: '61000000-0000-4000-8700-000000000001',
          workspaceId: PROPOSAL_AUDIT_WORKSPACE_ID,
          kind: 'company_artifact',
          text: 'Active state security license certificate for our company.',
          documentId: '61000000-0000-4000-8700-000000000002',
          pageId: '61000000-0000-4000-8700-000000000003',
          pageNumber: 1,
          exactQuote: 'Active state security license certificate',
          reviewed: true,
        },
      ],
    });
    expect(
      withProof.claimAssessments.find(
        (assessment) =>
          assessment.matchedChecklistItemId === proposalAuditRequirements[5]!.checklistItemId,
      )?.supportStatus,
    ).toBe('supported');
  });

  it('rejects workspace-crossing pages, requirements and proof', () => {
    expect(() =>
      auditProposalDraft({
        workspaceId: PROPOSAL_AUDIT_WORKSPACE_ID,
        proposalDocumentId: PROPOSAL_DOCUMENT_ID,
        proposalDocumentSha256: PROPOSAL_DOCUMENT_SHA,
        proposalIdentity,
        pages: [{ ...proposalAuditPages[0]!, workspaceId: '62000000-0000-4000-8000-000000000001' }],
        requirements: proposalAuditRequirements,
      }),
    ).toThrow('cross_workspace_proposal_audit_input');
  });

  it('creates deterministic correction findings without rewriting the prior audit', () => {
    const prior = evaluate();
    const current = evaluate(
      proposalAuditRevisionPages,
      PROPOSAL_REVISION_DOCUMENT_ID,
      PROPOSAL_REVISION_SHA,
    );
    const corrections = compareProposalAuditRevisions(prior, current);
    expect(corrections.some((finding) => finding.type === 'corrected_in_revision')).toBe(true);
    expect(prior.findings.some((finding) => finding.type === 'date_mismatch')).toBe(true);
    expect(current.findings.some((finding) => finding.type === 'date_mismatch')).toBe(false);
  });

  it.each([
    ['open', 'in_review'],
    ['in_review', 'resolved'],
    ['resolved', 'obsolete'],
    ['open', 'accepted_risk'],
  ] as const)('allows audited workflow transition %s → %s', (from, to) => {
    expect(() => assertProposalFindingTransition(from, to)).not.toThrow();
  });

  it.each([
    ['open', 'obsolete'],
    ['resolved', 'open'],
    ['obsolete', 'open'],
  ] as const)('rejects forbidden workflow transition %s → %s', (from, to) => {
    expect(() => assertProposalFindingTransition(from, to)).toThrow(
      'forbidden_proposal_finding_transition',
    );
  });

  it('strictly validates coverage and finding schemas', () => {
    expect(() =>
      proposalCoverageAssessmentSchema.parse({
        checklistItemId: proposalAuditRequirements[0]!.checklistItemId,
        coverageStatus: 'addressed',
        matchedClaimStableKeys: [],
        reason: 'matched',
        machineOnly: true,
        humanResolutionStatus: 'pending',
        verificationStatus: 'approved',
      }),
    ).toThrow();
    expect(() =>
      proposalAuditFindingSchema.parse({ type: 'unsupported_claim', severity: 'warning' }),
    ).toThrow();
  });
});
