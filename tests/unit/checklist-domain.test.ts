import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_STATES,
  CHECKLIST_CATEGORIES,
  CHECKLIST_GENERATOR_VERSION,
  CHECKLIST_WORKFLOW_STATUSES,
  assertNoProhibitedProductLanguage,
  assertWorkflowTransition,
  calculateBlockers,
  calculateReadiness,
  evaluateChecklistEligibility,
  generateChecklistItems,
  mapChecklistCategory,
  type BlockerInputItem,
  type ChecklistSource,
} from '@usi/domain';
import {
  EXPECTED_MISSING_FORM_IDS,
  FIVE_MISSING_FORM_CASES,
} from '../../fixtures/eval/checklist-five-missing-forms';

const base = (overrides: Partial<ChecklistSource> = {}): ChecklistSource => ({
  workspaceId: '50000000-0000-4000-8000-000000000001',
  analysisRunId: '50000000-0000-4000-8000-000000000002',
  verificationRunId: '50000000-0000-4000-8000-000000000003',
  findingId: '50000000-0000-4000-8001-000000000001',
  findingVersion: 1,
  candidateId: '50000000-0000-4000-8002-000000000001',
  title: 'Mandatory Form A-1',
  obligation: 'Offerors must complete and submit mandatory Form A-1.',
  sourceCategory: 'required_form',
  mandatory: true,
  sourceSupportStatus: 'supported',
  precedenceStatus: 'active',
  proofRequirement: 'none_identified',
  machineStatus: 'machine_assessment_only',
  humanReviewStatus: 'accepted',
  documentId: '50000000-0000-4000-8000-000000000004',
  documentPageId: '50000000-0000-4000-8003-000000000002',
  pageNumber: 2,
  exactQuote: 'Offerors must complete and submit mandatory Form A-1.',
  parserConfidence: 1,
  dueAt: null,
  dueTimezone: null,
  relationshipRole: 'atomic',
  verificationEvidenceId: null,
  validatedEvidence: true,
  ...overrides,
});

describe('Phase 5 deterministic checklist contract', () => {
  it('publishes the complete stable category, workflow and artifact vocabularies', () => {
    expect(CHECKLIST_CATEGORIES).toHaveLength(30);
    expect(CHECKLIST_CATEGORIES).toContain('other_material_requirement');
    expect(CHECKLIST_WORKFLOW_STATUSES).toEqual([
      'not_started',
      'in_progress',
      'ready_for_review',
      'completed',
      'waived',
      'blocked',
      'not_applicable',
      'requires_human_proof',
      'unresolved',
    ]);
    expect(ARTIFACT_STATES).toContain('accepted_by_waiver');
  });

  it.each([
    ['supported', 'active', 'accepted', 'ordinary_active', 'eligible_active_requirement'],
    ['supported', 'active', 'pending', 'review_needed', 'human_review_pending'],
    ['supported', 'active', 'rejected', 'excluded', 'human_review_rejected'],
    ['partially_supported', 'active', 'accepted', 'review_needed', 'partial_source_support'],
    ['unsupported', 'undetermined', 'accepted', 'excluded', 'unsupported_source'],
    ['contradicted', 'active', 'accepted', 'excluded', 'contradicted_source'],
    ['parser_uncertain', 'undetermined', 'accepted', 'unresolved_risk', 'parser_uncertainty'],
    ['supported', 'superseded', 'accepted', 'excluded', 'superseded_requirement'],
    ['supported', 'conflicting', 'accepted', 'unresolved_risk', 'unresolved_precedence'],
  ] as const)(
    'maps %s/%s/%s to %s',
    (sourceSupportStatus, precedenceStatus, humanReviewStatus, classification, reason) => {
      expect(
        evaluateChecklistEligibility({
          sourceSupportStatus,
          precedenceStatus,
          proofRequirement: 'none_identified',
          humanReviewStatus,
          machineStatus: 'machine_assessment_only',
          mandatory: true,
        }),
      ).toMatchObject({ classification, reason });
    },
  );

  it('keeps proof separate from active source eligibility', () => {
    expect(
      evaluateChecklistEligibility({
        sourceSupportStatus: 'supported',
        precedenceStatus: 'active',
        proofRequirement: 'requires_company_artifact',
        humanReviewStatus: 'accepted',
        machineStatus: 'machine_assessment_only',
        mandatory: true,
      }),
    ).toMatchObject({
      classification: 'ordinary_active',
      workflowStatus: 'requires_human_proof',
      artifactState: 'requires_human_proof',
      requiresArtifact: true,
    });
  });

  it('fails closed when a supported finding lacks validated exact evidence', () => {
    expect(
      evaluateChecklistEligibility({
        sourceSupportStatus: 'supported',
        precedenceStatus: 'active',
        proofRequirement: 'none_identified',
        humanReviewStatus: 'accepted',
        machineStatus: 'machine_assessment_only',
        mandatory: true,
        validatedEvidence: false,
      }),
    ).toMatchObject({
      classification: 'review_needed',
      reason: 'missing_validated_evidence',
      workflowStatus: 'unresolved',
    });
  });

  it.each([
    ['required_form', 'Form A-1', 'mandatory form', 'mandatory_form'],
    ['deadline', 'Questions due', 'Questions are due April 1', 'question_deadline'],
    ['deadline', 'Proposal deadline', 'Proposals are due April 2', 'submission_deadline'],
    ['signature', 'Signature', 'Authorized signature required', 'signature'],
    ['initials', 'Initials', 'Initial each page', 'initials'],
    [
      'addendum',
      'Addendum acknowledgment',
      'Acknowledge every addendum',
      'addendum_acknowledgment',
    ],
    ['acknowledgment', 'Receipt acknowledgment', 'Acknowledge receipt', 'acknowledgment'],
    ['insurance', 'Insurance evidence', 'Provide insurance limits', 'insurance'],
    ['bond', 'Bid bond', 'Submit the bid bond', 'bond'],
    ['certification', 'Certification', 'Provide certification', 'certification'],
    ['license', 'License', 'Provide current license', 'license'],
    ['attestation', 'Attestation', 'Attest to accuracy', 'attestation'],
    ['attachment', 'Attachment', 'Include the required attachment', 'attachment'],
    ['staffing', 'Staffing plan', 'Submit staffing plan', 'staffing_plan'],
    ['resume', 'Resumes', 'Include resumes', 'resume'],
    ['meeting', 'Pre-bid conference', 'Attend pre-bid conference', 'pre_bid_conference'],
    ['meeting', 'Site visit', 'Mandatory site visit', 'site_visit'],
    ['meeting', 'Kickoff meeting', 'Attend the meeting', 'meeting'],
    ['pricing', 'Price schedule', 'Complete price schedule', 'pricing_form'],
    ['technical', 'Technical response', 'Submit technical response', 'technical_response'],
    ['reference', 'References', 'Provide three references', 'reference'],
    ['subcontractor', 'Subcontractors', 'Disclose each subcontractor', 'subcontractor_disclosure'],
    ['packaging', 'Sealed envelope', 'Use a sealed envelope', 'packaging_requirement'],
    ['delivery', 'Delivery method', 'Follow the delivery method', 'delivery_method'],
    [
      'submission',
      'Portal delivery',
      'Submit electronically through the portal',
      'electronic_submission',
    ],
    ['submission', 'Paper delivery', 'Provide paper delivery', 'physical_submission'],
    ['submission', 'Copy count', 'Provide three copies', 'copy_count'],
    ['submission', 'PDF format', 'Files must use .pdf', 'file_format'],
    ['submission', 'File naming', 'Follow the file naming convention', 'naming_requirement'],
    [
      'other',
      'Unknown material duty',
      'Provide the required response',
      'other_material_requirement',
    ],
  ])('maps %s/%s to %s', (sourceCategory, title, obligation, expected) => {
    expect(mapChecklistCategory({ sourceCategory, title, obligation })).toBe(expected);
  });

  it('creates a missing artifact state for an active mandatory form without conflating proof', () => {
    const item = generateChecklistItems([base()])[0];
    expect(item.category).toBe('mandatory_form');
    expect(item.requiresArtifact).toBe(true);
    expect(item.artifactState).toBe('missing');
    expect(item.proofRequirement).toBe('none_identified');
  });

  it('generates stable idempotent items and preserves separate parent/child atoms', () => {
    const parent = base({ relationshipRole: 'parent' });
    const child = base({
      findingId: '50000000-0000-4000-8001-000000000002',
      candidateId: '50000000-0000-4000-8002-000000000002',
      title: 'Form A-1 signature',
      obligation: 'An authorized representative must sign Form A-1.',
      sourceCategory: 'signature',
      relationshipRole: 'child',
    });
    const first = generateChecklistItems([parent, child]);
    const second = generateChecklistItems([child, parent]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(new Set(first.map((item) => item.stableKey)).size).toBe(2);
    expect(first.every((item) => item.generatorVersion === CHECKLIST_GENERATOR_VERSION)).toBe(true);
  });

  it('validates workflow transitions without changing source state', () => {
    expect(() =>
      assertWorkflowTransition({
        from: 'ready_for_review',
        to: 'completed',
        sourceEligible: true,
        artifactSatisfied: true,
        reviewedWaiver: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertWorkflowTransition({
        from: 'ready_for_review',
        to: 'completed',
        sourceEligible: true,
        artifactSatisfied: false,
        reviewedWaiver: false,
      }),
    ).toThrow('required_artifact_not_satisfied');
    expect(() =>
      assertWorkflowTransition({
        from: 'blocked',
        to: 'completed',
        sourceEligible: false,
        artifactSatisfied: true,
        reviewedWaiver: false,
      }),
    ).toThrow('forbidden_workflow_transition');
  });

  it('detects exactly five planted missing mandatory forms with perfect evidence linkage', () => {
    const generated = generateChecklistItems(FIVE_MISSING_FORM_CASES.map((item) => item.source));
    const fixtureByFinding = new Map(
      FIVE_MISSING_FORM_CASES.map((item) => [item.source.findingId, item]),
    );
    const blockerInputs: BlockerInputItem[] = generated.map((item) => ({
      ...item,
      artifactState: fixtureByFinding.get(item.findingId)!.missing ? 'missing' : 'reviewed',
      workflowStatus: fixtureByFinding.get(item.findingId)!.missing ? 'not_started' : 'completed',
      waiverStatus: 'none',
    }));
    const blockers = calculateBlockers(blockerInputs, new Date('2026-01-01T00:00:00Z'));
    const missing = blockers.filter((item) => item.type === 'missing_mandatory_form');
    const actual = missing
      .map((blocker) => generated.find((item) => item.stableKey === blocker.itemStableKey)!.title)
      .map((title) => title.replace('Mandatory ', ''))
      .sort();
    expect(actual).toEqual([...EXPECTED_MISSING_FORM_IDS].sort());
    expect(missing).toHaveLength(5);
    expect(missing.every((item) => item.severity === 'critical')).toBe(true);
    expect(
      generated.every(
        (item) => item.documentId && item.documentPageId && item.pageNumber && item.exactQuote,
      ),
    ).toBe(true);
    const readiness = calculateReadiness(blockerInputs, blockers);
    expect(readiness).toMatchObject({
      status: 'blocked',
      totalRequiredItems: 10,
      completedRequiredItems: 5,
      incompleteRequiredItems: 5,
      blockedItems: 5,
    });
  });

  it('creates deterministic deadline, proof, conflict, parser and child blockers', () => {
    const [generated] = generateChecklistItems([
      base({
        sourceSupportStatus: 'supported',
        precedenceStatus: 'conflicting',
        proofRequirement: 'requires_company_artifact',
        dueAt: '2026-01-02T12:00:00-05:00',
        dueTimezone: 'America/New_York',
        relationshipRole: 'child',
      }),
    ]);
    const blockers = calculateBlockers(
      [
        {
          ...generated,
          artifactState: 'missing',
          workflowStatus: 'unresolved',
          waiverStatus: 'requested',
        },
      ],
      new Date('2026-01-03T00:00:00Z'),
    );
    expect(blockers.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'unresolved_active_conflict',
        'missing_mandatory_form',
        'required_human_proof_missing',
        'incomplete_mandatory_child',
        'invalid_or_unreviewed_waiver',
        'missed_deadline',
      ]),
    );
  });

  it('calculates explainable readiness without compliance or approval claims', () => {
    const [item] = generateChecklistItems([base()]);
    const result = calculateReadiness(
      [{ ...item, workflowStatus: 'completed', artifactState: 'not_applicable' }],
      [],
    );
    expect(result.status).toBe('ready_for_final_review');
    expect(result.summary).toBe('Ready for final review');
    expect(() => assertNoProhibitedProductLanguage(result.summary)).not.toThrow();
  });

  it.each(['Compliant', 'Approved', 'Safe to submit', 'Guaranteed complete'])(
    'rejects prohibited product language: %s',
    (value) => expect(() => assertNoProhibitedProductLanguage(value)).toThrow(),
  );
});
