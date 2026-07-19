import type { ReportSnapshot } from '@usi/domain';

export const PHASE8_PREPARED_WORKSPACE_ID = '81000000-0000-4000-8000-000000000002';
export const PHASE8_PREPARED_REPORT_ID = '81000000-0000-4000-8000-000000000014';
export const PHASE8_PREPARED_SOURCE_DOCUMENT_ID = '81000000-0000-4000-8000-000000000003';
export const PHASE8_PREPARED_PROPOSAL_DOCUMENT_ID = '81000000-0000-4000-8000-000000000004';
export const PHASE8_PREPARED_AUDIT_RUN_ID = '81000000-0000-4000-8000-000000000012';

const preparedId = (group: number, index: number) =>
  `81000000-0000-4000-${String(8200 + group).slice(0, 4)}-${String(index).padStart(12, '0')}`;
const candidateId = (group: number, index: number) =>
  `81000000-0000-4000-${String(8100 + group).slice(0, 4)}-${String(index).padStart(12, '0')}`;

export type PreparedDemoLinkResolver = {
  checklistId: (persistedId: string) => string;
  candidateId: (persistedId: string) => string;
  findingId: (persistedId: string) => string;
  sourceDocumentId: (persistedId: string | null) => string | null;
  proposalDocumentId: (persistedId: string | null) => string | null;
  navigationReference: (persistedReference: string) => string;
};

const identityResolver: PreparedDemoLinkResolver = {
  checklistId: (value) => value,
  candidateId: (value) => value,
  findingId: (value) => value,
  sourceDocumentId: (value) => value,
  proposalDocumentId: (value) => value,
  navigationReference: (value) => value,
};

export function createPreparedDemoLinkResolver(input: {
  workspaceId: string;
  reportId: string;
  report: ReportSnapshot;
}): PreparedDemoLinkResolver {
  if (
    input.workspaceId !== PHASE8_PREPARED_WORKSPACE_ID ||
    input.reportId !== PHASE8_PREPARED_REPORT_ID ||
    !input.report.demoWatermark
  )
    return identityResolver;

  const checklist = new Map(
    input.report.checklistItems.map((item, index) => [item.id, preparedId(3, index + 1)]),
  );
  const candidates = new Map(
    input.report.requirements.map((item, index) => [item.candidateId, candidateId(1, index + 1)]),
  );
  const findings = new Map(
    input.report.proposalFindings.map((item, index) => [item.id, preparedId(12, index + 1)]),
  );
  const checklistId = (value: string) => checklist.get(value) ?? value;
  const mappedCandidateId = (value: string) => candidates.get(value) ?? value;
  const findingId = (value: string) => findings.get(value) ?? value;

  return {
    checklistId,
    candidateId: mappedCandidateId,
    findingId,
    sourceDocumentId: (value) => (value ? PHASE8_PREPARED_SOURCE_DOCUMENT_ID : null),
    proposalDocumentId: (value) => (value ? PHASE8_PREPARED_PROPOSAL_DOCUMENT_ID : null),
    navigationReference: (value) => {
      const checklistMatch = value.match(/\/checklist\/([0-9a-f-]{36})$/i);
      if (checklistMatch?.[1])
        return `/w/${input.workspaceId}/checklist/${checklistId(checklistMatch[1])}`;
      const requirementMatch = value.match(/\/requirements\/([0-9a-f-]{36})$/i);
      if (requirementMatch?.[1])
        return `/w/${input.workspaceId}/requirements/${mappedCandidateId(requirementMatch[1])}`;
      const findingMatch = value.match(/#finding-([0-9a-f-]{36})$/i);
      if (findingMatch?.[1])
        return `/w/${input.workspaceId}/proposal-audit/${PHASE8_PREPARED_AUDIT_RUN_ID}#finding-${findingId(findingMatch[1])}`;
      throw new Error('phase8_prepared_report_navigation_reference_invalid');
    },
  };
}
