import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RequirementCandidate } from './schemas';

export const FAC115_PHASE9_EXPECTED_VERSION = 'massachusetts-fac115-phase9-expected-v1';
export const FAC115_PHASE9_POLICY_VERSION = 'massachusetts-fac115-phase9-policy-v1';
export const FAC115_PHASE9_STAGE0_VERSION = 'massachusetts-fac115-phase9-stage0-v1';

const sourceStatusSchema = z.enum([
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'parser_uncertain',
]);
const precedenceStatusSchema = z.enum(['active', 'superseded', 'conflicting', 'undetermined']);
const proofRequirementSchema = z.enum([
  'none_identified',
  'requires_human_confirmation',
  'requires_company_artifact',
  'requires_external_validation',
  'undetermined',
]);

const materialDateSchema = z.object({
  role: z.enum([
    'submission_deadline',
    'question_deadline',
    'meeting_date',
    'performance_period',
    'issue_date',
    'addendum_date',
    'other',
  ]),
  raw: z.string().min(1),
  normalized: z.string().min(1),
  time: z.string().nullable(),
  ambiguousTime: z.boolean(),
  timezone: z.string().nullable(),
  comparisonOperator: z.enum(['equal', 'minimum', 'maximum', 'range', 'approximate']),
});

const materialNumberSchema = z.object({
  role: z.enum([
    'insurance_per_occurrence',
    'insurance_aggregate',
    'staffing_minimum',
    'experience_minimum',
    'pricing_amount',
    'percentage',
    'page_limit',
    'reference_count',
    'duration',
    'other',
  ]),
  raw: z.string().min(1),
  normalized: z.number().finite(),
  unit: z.string().min(1),
  comparisonOperator: z.enum(['equal', 'minimum', 'maximum', 'range', 'approximate']),
  scope: z.string().min(1),
});

const nativeReferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('html'),
    originalFile: z.string().min(1),
    renderedPage: z.number().int().positive(),
    location: z.string().min(1),
  }),
  z.object({
    kind: z.literal('docx'),
    originalFile: z.string().min(1),
    renditionFile: z.string().min(1),
    renderedPage: z.number().int().positive(),
    section: z.string().min(1),
  }),
  z.object({
    kind: z.literal('xlsx'),
    originalFile: z.string().min(1),
    renditionFile: z.string().min(1),
    renderedPage: z.number().int().positive(),
    sheetName: z.string().min(1),
    cellRange: z.string().regex(/^[A-Z]+\d+(?::[A-Z]+\d+)?$/),
  }),
  z.object({
    kind: z.literal('pdf'),
    originalFile: z.string().min(1),
    renderedPage: z.number().int().positive(),
  }),
]);

export const fac115Phase9ExpectedAnswerSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  expectedSourceStatus: sourceStatusSchema,
  expectedPrecedenceStatus: precedenceStatusSchema,
  expectedProofRequirement: proofRequirementSchema,
  sourceFile: z.string().min(1),
  renderedPage: z.number().int().positive(),
  section: z.string().min(1),
  exactQuotation: z.string().min(1),
  summary: z.string().min(1),
  scope: z.string().min(1),
  comparisonOperator: z
    .enum(['equal', 'minimum', 'maximum', 'range', 'approximate', 'not_applicable'])
    .default('not_applicable'),
  materialDates: z.array(materialDateSchema).default([]),
  materialNumbers: z.array(materialNumberSchema).default([]),
  nativeReference: nativeReferenceSchema,
});
export type Fac115Phase9ExpectedAnswer = z.infer<typeof fac115Phase9ExpectedAnswerSchema>;

export const fac115Phase9ExpectedArtifactSchema = z.object({
  version: z.literal(FAC115_PHASE9_EXPECTED_VERSION),
  policyVersion: z.literal(FAC115_PHASE9_POLICY_VERSION),
  fixtureVersion: z.literal('massachusetts-fac115-category1-public-rfp-v1'),
  solicitationId: z.literal('BD-22-1080-OSD03-SRC01-70375'),
  publicOnly: z.literal(true),
  frozenBeforePhase9ProviderAccess: z.literal(true),
  expected: z.array(fac115Phase9ExpectedAnswerSchema).min(1),
  coverage: z.object({
    genuineUnresolvedConflictCaseIds: z.array(z.string()),
    parserUncertainCaseIds: z.array(z.string()),
    promptInjectionCaseIds: z.array(z.string()),
  }),
});
export type Fac115Phase9ExpectedArtifact = z.infer<typeof fac115Phase9ExpectedArtifactSchema>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Stable(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export type FrozenAnswerInput = {
  id: string;
  expectedSourceStatus: string;
  expectedPrecedenceStatus: string;
  source: string;
  page: number;
  section: string;
  summary: string;
  evidence: string;
};

export type Phase9AnswerPolicy = {
  version: string;
  proofById: Record<string, z.infer<typeof proofRequirementSchema>>;
  scopeById: Record<string, string>;
  datesById: Record<string, z.infer<typeof materialDateSchema>[]>;
  numbersById: Record<string, z.infer<typeof materialNumberSchema>[]>;
  supplementalExpected: Fac115Phase9ExpectedAnswer[];
  pilotAnswerIds: string[];
  coverage: Fac115Phase9ExpectedArtifact['coverage'];
};

function originalOfficeSource(rendered: string): string {
  if (rendered === 'FAC115_Request_for_Response_03.29.2022.pdf')
    return 'FAC115_Request_for_Response_03.29.2022.docx';
  if (rendered === 'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf')
    return 'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.docx';
  if (rendered === 'Intent_to_Bid_Notice_FAC115.pdf') return 'Intent_to_Bid_Notice_FAC115.docx';
  return rendered;
}

export function buildFac115Phase9ExpectedArtifact(
  frozen: FrozenAnswerInput[],
  policyInput: Phase9AnswerPolicy,
): Fac115Phase9ExpectedArtifact {
  if (policyInput.version !== FAC115_PHASE9_POLICY_VERSION)
    throw new Error(`Unexpected Phase 9 policy version: ${policyInput.version}`);
  const expected = frozen.map((answer) => {
    const proof = policyInput.proofById[answer.id];
    const scope = policyInput.scopeById[answer.id];
    if (!proof || !scope) throw new Error(`Missing Phase 9 policy for ${answer.id}`);
    const original = originalOfficeSource(answer.source);
    const nativeReference =
      answer.source === 'official-solicitation-page.html'
        ? {
            kind: 'html' as const,
            originalFile: answer.source,
            renderedPage: answer.page,
            location: answer.section,
          }
        : answer.source.endsWith('.pdf') && original.endsWith('.docx')
          ? {
              kind: 'docx' as const,
              originalFile: original,
              renditionFile: answer.source,
              renderedPage: answer.page,
              section: answer.section,
            }
          : {
              kind: 'pdf' as const,
              originalFile: original,
              renderedPage: answer.page,
            };
    return {
      id: answer.id,
      candidateId: `fac115-phase9-${answer.id}`,
      expectedSourceStatus: sourceStatusSchema.parse(answer.expectedSourceStatus),
      expectedPrecedenceStatus: precedenceStatusSchema.parse(answer.expectedPrecedenceStatus),
      expectedProofRequirement: proof,
      sourceFile: answer.source,
      renderedPage: answer.page,
      section: answer.section,
      exactQuotation: answer.evidence,
      summary: answer.summary,
      scope,
      comparisonOperator:
        policyInput.datesById[answer.id]?.[0]?.comparisonOperator ??
        policyInput.numbersById[answer.id]?.[0]?.comparisonOperator ??
        ('not_applicable' as const),
      materialDates: policyInput.datesById[answer.id] ?? [],
      materialNumbers: policyInput.numbersById[answer.id] ?? [],
      nativeReference,
    };
  });
  return fac115Phase9ExpectedArtifactSchema.parse({
    version: FAC115_PHASE9_EXPECTED_VERSION,
    policyVersion: FAC115_PHASE9_POLICY_VERSION,
    fixtureVersion: 'massachusetts-fac115-category1-public-rfp-v1',
    solicitationId: 'BD-22-1080-OSD03-SRC01-70375',
    publicOnly: true,
    frozenBeforePhase9ProviderAccess: true,
    expected: [...expected, ...policyInput.supplementalExpected],
    coverage: policyInput.coverage,
  });
}

export type HistoricalCandidateBinding = {
  answerId: string;
  expectedCandidateId: string;
  historicalCandidateIds: string[];
  exactBinding: boolean;
  reason: 'exact_document_page_quote' | 'not_extracted_or_page_mismatch';
};

/** Maps only exact document + rendered page + quotation bindings. It never fuzzy-rebases pages. */
export function mapFac115HistoricalCandidates(input: {
  answers: Fac115Phase9ExpectedAnswer[];
  candidates: RequirementCandidate[];
  acceptedCandidateIds: string[];
  documentIdBySourceFile: Record<string, string>;
}): HistoricalCandidateBinding[] {
  const accepted = new Set(input.acceptedCandidateIds);
  const normalized = (value: string) =>
    value.normalize('NFKC').toLowerCase().replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  return input.answers.map((answer) => {
    const expectedDocumentId = input.documentIdBySourceFile[answer.sourceFile];
    const quotation = normalized(answer.exactQuotation);
    const ids = input.candidates
      .filter(
        (candidate) =>
          accepted.has(candidate.id) &&
          candidate.documentId === expectedDocumentId &&
          candidate.preliminaryPage === answer.renderedPage,
      )
      .filter((candidate) => {
        const candidateQuote = normalized(candidate.evidenceQuote);
        return quotation.includes(candidateQuote) || candidateQuote.includes(quotation);
      })
      .map((candidate) => candidate.id)
      .sort();
    return {
      answerId: answer.id,
      expectedCandidateId: answer.candidateId,
      historicalCandidateIds: ids,
      exactBinding: ids.length > 0,
      reason: ids.length
        ? ('exact_document_page_quote' as const)
        : ('not_extracted_or_page_mismatch' as const),
    };
  });
}

export function assertNoPhase9ProviderFlags(environment: NodeJS.ProcessEnv): void {
  const forbidden = [
    'PUBLIC_RFP_FAC115_LIVE_EXTRACT',
    'PUBLIC_RFP_FAC115_LIVE_VERIFY',
    'PUBLIC_RFP_FAC115_LIVE_PILOT',
  ];
  const enabled = forbidden.filter((name) => environment[name] === '1');
  if (enabled.length) throw new Error(`Stage 0 forbids provider flags: ${enabled.join(', ')}`);
}
