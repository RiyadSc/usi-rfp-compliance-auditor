import { createHash } from 'node:crypto';
import {
  PHASE4_SELECTED_FINGERPRINT,
  PHASE8_SYNTHETIC_MARKER,
  PHASE8_VERSIONS,
  calculatePhase8CacheKey,
  sha256Canonical,
  type Phase8DemoBinding,
} from '../../packages/domain/src/hardening';
import {
  FIVE_MISSING_FORM_CASES,
  EXPECTED_MISSING_FORM_IDS,
} from '../../fixtures/eval/checklist-five-missing-forms';
import { VERIFICATION_CASES, VERIFICATION_PAGES_V2 } from '../../fixtures/eval/verification-cases';
import {
  proposalAuditExpectedCases,
  proposalAuditPages,
} from '../../fixtures/eval/proposal-audit-known-answer';
import {
  reportingKnownAnswerExpected,
  reportingKnownAnswerInput,
} from '../../fixtures/eval/reporting-known-answer';
import { calculateReportInputHash } from '../../packages/domain/src/reporting';

export const PHASE8_PROJECT_REF = 'uxmxkdjschbekkbnweby';
export const PHASE8_DEMO_SCOPE_ID = '81000000-0000-4000-8000-000000000001';
export const PHASE8_DEMO_WORKSPACE_ID = '81000000-0000-4000-8000-000000000002';
export const PHASE8_SOURCE_DOCUMENT_ID = '81000000-0000-4000-8000-000000000003';
export const PHASE8_PROPOSAL_DOCUMENT_ID = '81000000-0000-4000-8000-000000000004';
export const PHASE8_SOURCE_PARSE_RUN_ID = '81000000-0000-4000-8000-000000000005';
export const PHASE8_PROPOSAL_PARSE_RUN_ID = '81000000-0000-4000-8000-000000000006';
export const PHASE8_ANALYSIS_RUN_ID = '81000000-0000-4000-8000-000000000007';
export const PHASE8_VERIFICATION_RUN_ID = '81000000-0000-4000-8000-000000000008';
export const PHASE8_CHECKLIST_RUN_ID = '81000000-0000-4000-8000-000000000009';
export const PHASE8_READINESS_ID = '81000000-0000-4000-8000-000000000010';
export const PHASE8_PROPOSAL_DRAFT_ID = '81000000-0000-4000-8000-000000000011';
export const PHASE8_PROPOSAL_AUDIT_RUN_ID = '81000000-0000-4000-8000-000000000012';
export const PHASE8_REPORT_RUN_ID = '81000000-0000-4000-8000-000000000013';
export const PHASE8_REPORT_SNAPSHOT_ID = '81000000-0000-4000-8000-000000000014';
export const PHASE8_EXPORT_MANIFEST_ID = '81000000-0000-4000-8000-000000000015';
export const PHASE8_EXPORT_ARTIFACT_ID = '81000000-0000-4000-8000-000000000016';
export const PHASE9_REVIEW_DEMO_SCOPE_ID = '81000000-0000-4000-8900-000000000001';
export const PHASE9_REVIEW_TEMPLATE_RUN_ID = '81000000-0000-4000-8900-000000000002';
export const PHASE9_REVIEW_DEMO_MARKER = 'phase9-review-acceleration-demo-only';
export const PHASE9_REVIEW_DEMO_SCOPE_VERSION = 'phase9-review-demo-v1';

const sha256 = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');
const uuid = (group: number, index: number) =>
  `81000000-0000-4000-${String(8100 + group).slice(0, 4)}-${String(index).padStart(12, '0')}`;

export const PHASE8_SOURCE_PAGES = [
  ...VERIFICATION_PAGES_V2,
  ...FIVE_MISSING_FORM_CASES.slice(0, 5).map((entry, index) => ({
    pageNumber: 18 + index,
    text: entry.evidence,
  })),
] as const;

export const PHASE8_PROPOSAL_PAGES = proposalAuditPages.map((page) => ({
  pageNumber: page.pageNumber,
  text: page.text,
}));

function escapePdfText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '-')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrap(value: string, width = 88): string[] {
  const words = escapePdfText(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildPhase8Pdf(
  pages: readonly { pageNumber: number; text: string; scanned?: boolean }[],
): Buffer {
  const pageObject = (index: number) => 4 + index * 2;
  const contentObject = (index: number) => 5 + index * 2;
  const objects = new Map<number, string>();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageObject(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((page, index) => {
    const lines = page.scanned
      ? []
      : [`SYNTHETIC DEMO - PAGE ${page.pageNumber}`, ...wrap(page.text)];
    const stream = page.scanned
      ? ''
      : `BT\n/F1 9 Tf\n48 748 Td\n12 TL\n${lines
          .map((line, lineIndex) => `${lineIndex ? 'T*\n' : ''}(${line}) Tj`)
          .join('\n')}\nET`;
    objects.set(
      pageObject(index),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject(index)} 0 R >>`,
    );
    objects.set(
      contentObject(index),
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  const maxObject = 3 + pages.length * 2;
  let pdf = '%PDF-1.4\n% phase8-synthetic-only\n';
  const offsets = [0];
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(pdf);
    pdf += `${objectNumber} 0 obj\n${objects.get(objectNumber)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1)
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

export const PHASE8_SOURCE_PDF = buildPhase8Pdf(PHASE8_SOURCE_PAGES);
export const PHASE8_PROPOSAL_PDF = buildPhase8Pdf(PHASE8_PROPOSAL_PAGES);
export const PHASE8_SOURCE_SHA = sha256(PHASE8_SOURCE_PDF);
export const PHASE8_PROPOSAL_SHA = sha256(PHASE8_PROPOSAL_PDF);

const phase8Candidates = [
  ...FIVE_MISSING_FORM_CASES.slice(0, 5).map((entry, index) => ({
    key: `missing_form_${index + 1}`,
    title: `Mandatory ${entry.formIdentifier}`,
    category: 'required_form',
    obligation: entry.evidence,
    evidenceQuote: entry.evidence,
    pageNumber: 18 + index,
    sourceSupportStatus: 'supported' as const,
    precedenceStatus: 'active' as const,
    proofRequirement: 'requires_company_artifact' as const,
  })),
  ...VERIFICATION_CASES.slice(0, 19).map((entry) => ({
    key: entry.id,
    title: entry.title,
    category: entry.category,
    obligation: entry.obligation,
    evidenceQuote: entry.evidenceQuote,
    pageNumber: entry.preliminaryPage,
    sourceSupportStatus: entry.expected.sourceSupportStatus,
    precedenceStatus: entry.expected.precedenceStatus,
    proofRequirement: entry.expected.proofRequirement,
  })),
];

export const PHASE8_DEMO_CANDIDATES = phase8Candidates.map((entry, index) => ({
  ...entry,
  candidateId: uuid(1, index + 1),
  findingId: uuid(2, index + 1),
  evidenceId: uuid(3, index + 1),
  pageId: uuid(4, entry.pageNumber),
}));

const formReferenceFor = (obligation: string) =>
  obligation.match(/\b(?:Form|Schedule)\s+([A-Z0-9-]+)/i)?.[0] ?? null;

const normalizedDateFor = (key: string) => {
  if (key === '20000000-0000-4000-8000-000000000008') return '2026-04-22T14:00:00-04:00';
  if (key === '20000000-0000-4000-8000-000000000009') return '2026-04-23T14:00:00-04:00';
  if (
    key === '20000000-0000-4000-8000-000000000001' ||
    key === '20000000-0000-4000-8000-000000000004'
  )
    return '2026-03-01T10:00:00-05:00';
  return null;
};

export const PHASE9_REVIEW_DEMO_SOURCE_BLOCKS = PHASE8_SOURCE_PAGES.map((page) => {
  const blockHash = sha256Canonical({
    fixture: 'phase9-review-acceleration-demo-v1',
    documentId: PHASE8_SOURCE_DOCUMENT_ID,
    pageNumber: page.pageNumber,
    text: page.text,
  });
  const deterministicSignals = [
    ...(page.text.match(/\b(?:deadline|due)\b/i) ? ['deadline'] : []),
    ...(page.text.match(/\bform\s+[a-z0-9-]+\b/i) ? ['form_identifier'] : []),
    ...(page.text.match(/\b(?:sign|signature|signed)\b/i) ? ['signature'] : []),
    ...(page.text.match(/\b(?:must|shall|required|mandatory)\b/i) ? ['mandatory_language'] : []),
  ];
  return {
    blockHash,
    pageNumber: page.pageNumber,
    route:
      page.pageNumber === 15
        ? ('parser_uncertain' as const)
        : ('selected_for_deterministic_candidate' as const),
    deterministicSignals,
    processingResult:
      page.pageNumber === 15
        ? 'Synthetic parser uncertainty retained for human review.'
        : 'Synthetic source page reviewed and bound to deterministic evidence.',
  };
});

const phase9ReviewSourceBlockByPage = new Map(
  PHASE9_REVIEW_DEMO_SOURCE_BLOCKS.map((block) => [block.pageNumber, block]),
);

const phase9ReviewCandidate = (
  candidate: (typeof PHASE8_DEMO_CANDIDATES)[number],
  candidateHash = sha256Canonical({
    fixture: 'phase9-review-acceleration-demo-v1',
    key: candidate.key,
    obligation: candidate.obligation,
    pageNumber: candidate.pageNumber,
  }),
) => {
  const sourceBlock = phase9ReviewSourceBlockByPage.get(candidate.pageNumber);
  if (!sourceBlock) throw new Error(`phase9_demo_source_page_missing:${candidate.pageNumber}`);
  const formReference = formReferenceFor(candidate.obligation);
  const normalizedDate = normalizedDateFor(candidate.key);
  return {
    candidateHash,
    sourceBlockHashes: [sourceBlock.blockHash],
    requirementType: candidate.category,
    obligationText: candidate.obligation,
    evidenceText: candidate.evidenceQuote,
    materialFacts: {
      ...(formReference ? { formReference } : {}),
      ...(normalizedDate ? { normalizedDate } : {}),
    },
    discoveryRoute: 'deterministic' as const,
    sourceSupportStatus: candidate.sourceSupportStatus,
    precedenceStatus: candidate.precedenceStatus,
    proofRequirement: candidate.proofRequirement,
    ambiguityCode:
      candidate.sourceSupportStatus === 'parser_uncertain' ? 'parser_extraction_uncertain' : null,
  };
};

const phase9BaseReviewCandidates = PHASE8_DEMO_CANDIDATES.map((candidate) =>
  phase9ReviewCandidate(candidate),
);
const staffingPlan = PHASE8_DEMO_CANDIDATES.find(
  (candidate) => candidate.key === '20000000-0000-4000-8000-000000000015',
);
if (!staffingPlan) throw new Error('phase9_demo_staffing_plan_missing');

/** A deliberately repeated machine occurrence used to demonstrate explained duplicate review. */
const phase9DuplicateStaffingPlan = phase9ReviewCandidate(staffingPlan, 'f'.repeat(64));

export const PHASE9_REVIEW_DEMO_FINDINGS = [
  ...phase9BaseReviewCandidates,
  phase9DuplicateStaffingPlan,
] as const;

const optionalPage = PHASE8_SOURCE_PAGES.find((page) => page.pageNumber === 12);
const optionalBlock = phase9ReviewSourceBlockByPage.get(12);
if (!optionalPage || !optionalBlock) throw new Error('phase9_demo_coverage_example_missing');

/** Deliberately lacks a finding so the prepared demo has one unresolved coverage exception. */
export const PHASE9_REVIEW_DEMO_UNASSESSED_SEED = {
  candidateHash: sha256Canonical({
    fixture: 'phase9-review-acceleration-demo-v1',
    key: 'unassessed-optional-page-signal',
  }),
  sourceBlockHashes: [optionalBlock.blockHash],
  requirementType: 'other',
  obligationText: 'Review the nonbinding branding reference for applicability.',
  evidenceText: optionalPage.text,
  materialFacts: { coverageExample: true },
  discoveryRoute: 'coverage_sweep' as const,
};

export const PHASE9_REVIEW_DEMO_SEEDS = [
  ...PHASE9_REVIEW_DEMO_FINDINGS.map(
    ({
      sourceSupportStatus: _support,
      precedenceStatus: _precedence,
      proofRequirement: _proof,
      ambiguityCode: _ambiguity,
      ...seed
    }) => seed,
  ),
  PHASE9_REVIEW_DEMO_UNASSESSED_SEED,
] as const;

export const PHASE9_REVIEW_SOURCE_PACKAGE_HASH = sha256Canonical({
  fixture: 'phase9-review-acceleration-demo-v1',
  documentId: PHASE8_SOURCE_DOCUMENT_ID,
  sourceHash: PHASE8_SOURCE_SHA,
  blocks: PHASE9_REVIEW_DEMO_SOURCE_BLOCKS,
});
export const PHASE9_REVIEW_EXPECTED_ANSWER_HASH = sha256Canonical({
  fixture: 'phase9-review-acceleration-demo-v1',
  findingPopulation: PHASE9_REVIEW_DEMO_FINDINGS.map((finding) => ({
    candidateHash: finding.candidateHash,
    sourceSupportStatus: finding.sourceSupportStatus,
    precedenceStatus: finding.precedenceStatus,
    proofRequirement: finding.proofRequirement,
  })),
  expectedAnswersUsedAtRuntime: false,
});
export const PHASE9_REVIEW_CALL_PLAN_HASH = sha256Canonical({
  mode: 'provider_free_prepared_demo',
  providerCalls: 0,
  candidateCount: PHASE9_REVIEW_DEMO_FINDINGS.length,
  version: 'phase9-review-demo-call-plan-v1',
});
export const PHASE9_REVIEW_DOCUMENT_SET_HASH = sha256Canonical([
  { id: PHASE8_SOURCE_DOCUMENT_ID, sha256: PHASE8_SOURCE_SHA },
]);
export const PHASE9_REVIEW_CANDIDATE_SET_HASH = sha256(
  PHASE9_REVIEW_DEMO_SEEDS.map((seed) => seed.candidateHash)
    .sort()
    .join('\n'),
);
export const PHASE9_REVIEW_SOURCE_BLOCK_SET_HASH = sha256(
  PHASE9_REVIEW_DEMO_SOURCE_BLOCKS.map((block) => block.blockHash)
    .sort()
    .join('\n'),
);
export const PHASE9_REVIEW_DEMO_EXPECTED = Object.freeze({
  findings: 25,
  candidateSeeds: 26,
  sourceBlocks: PHASE8_SOURCE_PAGES.length,
  duplicateGroups: 1,
  nonCanonicalDuplicates: 1,
  coverageExceptions: 3,
  providerCalls: 0,
  providerSpendUsd: 0,
});

export const PHASE8_DEMO_EXPECTED = Object.freeze({
  candidateCount: 24,
  missingForms: EXPECTED_MISSING_FORM_IDS,
  proposalCases: proposalAuditExpectedCases,
  reporting: reportingKnownAnswerExpected,
  promptInjectionInfluence: 0,
});

export const PHASE8_FIXTURE_HASH = sha256Canonical({
  version: PHASE8_VERSIONS.fixture,
  candidates: PHASE8_DEMO_CANDIDATES.map(
    ({ candidateId: _c, findingId: _f, evidenceId: _e, pageId: _p, ...entry }) => entry,
  ),
  proposalPages: PHASE8_PROPOSAL_PAGES,
  expected: PHASE8_DEMO_EXPECTED,
});
export const PHASE8_DOCUMENT_SET_HASH = sha256Canonical([
  { id: PHASE8_SOURCE_DOCUMENT_ID, sha256: PHASE8_SOURCE_SHA },
  { id: PHASE8_PROPOSAL_DOCUMENT_ID, sha256: PHASE8_PROPOSAL_SHA },
]);
export const PHASE8_REPORT_INPUT_HASH = calculateReportInputHash(reportingKnownAnswerInput);

export function phase8DemoBinding(authorizedIdentityId: string): Phase8DemoBinding {
  const material = {
    scopeVersion: PHASE8_VERSIONS.demoScope,
    fixtureVersion: PHASE8_VERSIONS.fixture,
    syntheticMarker: PHASE8_SYNTHETIC_MARKER,
    workspaceId: PHASE8_DEMO_WORKSPACE_ID,
    authorizedIdentityId,
    sourceDocumentId: PHASE8_SOURCE_DOCUMENT_ID,
    proposalDocumentId: PHASE8_PROPOSAL_DOCUMENT_ID,
    analysisRunId: PHASE8_ANALYSIS_RUN_ID,
    verificationRunId: PHASE8_VERIFICATION_RUN_ID,
    checklistGenerationRunId: PHASE8_CHECKLIST_RUN_ID,
    readinessSnapshotId: PHASE8_READINESS_ID,
    proposalAuditRunId: PHASE8_PROPOSAL_AUDIT_RUN_ID,
    proposalDraftId: PHASE8_PROPOSAL_DRAFT_ID,
    reportSnapshotId: PHASE8_REPORT_SNAPSHOT_ID,
    compatibilityFingerprint: PHASE4_SELECTED_FINGERPRINT,
    documentSetHash: PHASE8_DOCUMENT_SET_HASH,
    fixtureHash: PHASE8_FIXTURE_HASH,
    reportInputHash: PHASE8_REPORT_INPUT_HASH,
    versions: {
      facts: 'verification-facts-v4' as const,
      decision: 'verification-decision-v6' as const,
      finalAssessment: 'verification-final-assessment-v1' as const,
      relationships: 'atomic-parent-child-v1' as const,
      checklistGenerator: 'checklist-generator-v1' as const,
      blockerEngine: 'checklist-blockers-v1' as const,
      readinessEngine: 'checklist-readiness-v1' as const,
      proposalAudit: 'proposal-audit-evaluator-v1' as const,
      reportInput: 'report-input-v1' as const,
      reportAggregation: 'report-aggregation-v1' as const,
      reportSchema: 'report-schema-v1' as const,
    },
  };
  return { ...material, cacheKey: calculatePhase8CacheKey(material) };
}

export function phase8DemoManifest(authorizedIdentityId: string) {
  const binding = phase8DemoBinding(authorizedIdentityId);
  return {
    projectRef: PHASE8_PROJECT_REF,
    scopeId: PHASE8_DEMO_SCOPE_ID,
    binding,
    bindingHash: sha256Canonical(binding),
    sourceObjectKey: `${PHASE8_DEMO_WORKSPACE_ID}/phase8-demo/source.pdf`,
    proposalObjectKey: `${PHASE8_DEMO_WORKSPACE_ID}/phase8-demo/proposal.pdf`,
    expected: PHASE8_DEMO_EXPECTED,
  };
}
