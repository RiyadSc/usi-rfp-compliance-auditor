import type { ChecklistSource } from '@usi/domain';

export const CHECKLIST_FIXTURE_VERSION = 'checklist-five-missing-forms-v1';
export const CHECKLIST_FIXTURE_WORKSPACE_ID = '50000000-0000-4000-8000-000000000001';
export const CHECKLIST_FIXTURE_ANALYSIS_RUN_ID = '50000000-0000-4000-8000-000000000002';
export const CHECKLIST_FIXTURE_VERIFICATION_RUN_ID = '50000000-0000-4000-8000-000000000003';
export const CHECKLIST_FIXTURE_DOCUMENT_ID = '50000000-0000-4000-8000-000000000004';

const uuid = (group: number, index: number) =>
  `50000000-0000-4000-8${String(group).padStart(3, '0')}-${String(index).padStart(12, '0')}`;

export type MissingFormFixtureCase = {
  formIdentifier: string;
  missing: boolean;
  pageNumber: number;
  evidence: string;
  source: ChecklistSource;
};

const form = (
  index: number,
  formIdentifier: string,
  pageNumber: number,
  missing: boolean,
): MissingFormFixtureCase => {
  const evidence = `Offerors must complete and submit mandatory ${formIdentifier}.`;
  return {
    formIdentifier,
    missing,
    pageNumber,
    evidence,
    source: {
      workspaceId: CHECKLIST_FIXTURE_WORKSPACE_ID,
      analysisRunId: CHECKLIST_FIXTURE_ANALYSIS_RUN_ID,
      verificationRunId: CHECKLIST_FIXTURE_VERIFICATION_RUN_ID,
      findingId: uuid(1, index),
      findingVersion: 1,
      candidateId: uuid(2, index),
      title: `Mandatory ${formIdentifier}`,
      obligation: evidence,
      sourceCategory: 'required_form',
      mandatory: true,
      sourceSupportStatus: 'supported',
      precedenceStatus: 'active',
      proofRequirement: 'requires_company_artifact',
      machineStatus: 'machine_assessment_only',
      humanReviewStatus: 'accepted',
      documentId: CHECKLIST_FIXTURE_DOCUMENT_ID,
      documentPageId: uuid(3, pageNumber),
      pageNumber,
      exactQuote: evidence,
      parserConfidence: 1,
      dueAt: null,
      dueTimezone: null,
      relationshipRole: 'atomic',
      verificationEvidenceId: null,
      validatedEvidence: true,
    },
  };
};

export const FIVE_MISSING_FORM_CASES: readonly MissingFormFixtureCase[] = [
  form(1, 'Form A-1', 2, true),
  form(2, 'Form B-2', 3, true),
  form(3, 'Form C-3', 4, true),
  form(4, 'Form D-4', 5, true),
  form(5, 'Form E-5', 6, true),
  form(6, 'Form F-6', 7, false),
  form(7, 'Form G-7', 8, false),
  form(8, 'Form H-8', 9, false),
  form(9, 'Form I-9', 10, false),
  form(10, 'Form J-10', 11, false),
] as const;

export const EXPECTED_MISSING_FORM_IDS = FIVE_MISSING_FORM_CASES.filter((item) => item.missing).map(
  (item) => item.formIdentifier,
);
