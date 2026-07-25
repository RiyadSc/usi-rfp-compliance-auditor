import { createHash } from 'node:crypto';
import { z } from 'zod';
import { estimateChatCost } from './cost';

export const PHASE9_RECOVERY_VERSION = 'phase9-live-recovery-v1';
export const PHASE9_COVERAGE_VERSION = 'phase9-source-coverage-v1';
export const PHASE9_MINER_VERSION = 'phase9-deterministic-miner-v1';
export const PHASE9_REDUCTION_VERSION = 'phase9-candidate-reduction-v1';
export const PHASE9_CALL_PLAN_VERSION = 'phase9-exact-call-plan-v1';
export const PHASE9_CACHE_VERSION = 'phase9-provider-cache-v1';
export const PHASE9_PRICING_VERSION = 'phase9-pricing-2026-07-24';
export const PHASE9_LEDGER_CEILING_USD = 3;

export const PHASE9_TIER_MODELS = {
  tier1: 'gpt-5.4-mini-2026-03-17',
  tier2: 'gpt-5.4-mini-2026-03-17',
  tier3: 'gpt-5.5-2026-04-23',
  tier4: 'gpt-5.5-2026-04-23',
} as const;

export const PHASE9_PROMPT_VERSIONS = {
  coverage: 'phase9-coverage-compact-v1',
  extraction: 'phase9-extraction-compact-v1',
  verification: 'phase9-verification-compact-v1',
  ambiguity: 'phase9-ambiguity-compact-v1',
} as const;

export const PHASE9_SCHEMA_VERSIONS = {
  coverage: 'phase9-coverage-output-v1',
  extraction: 'phase9-extraction-output-v1',
  verification: 'phase9-verification-output-v1',
  ambiguity: 'phase9-ambiguity-output-v1',
} as const;

export const coverageRouteSchema = z.enum([
  'selected_for_deterministic_candidate',
  'selected_for_ai_extraction',
  'selected_for_table_extraction',
  'selected_for_spreadsheet_extraction',
  'reviewed_and_rejected_as_non_requirement',
  'parser_uncertain',
  'duplicate_source_content',
  'excluded_with_versioned_reason',
]);
export type CoverageRoute = z.infer<typeof coverageRouteSchema>;

export const phase9SourceBlockSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceId: z.string().min(1),
  documentId: z.string().min(1),
  documentName: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  blockType: z.enum(['page_window', 'table', 'spreadsheet_cell', 'portal', 'native_block']),
  pageNumber: z.number().int().positive().nullable(),
  sheetName: z.string().nullable(),
  cellRange: z.string().nullable(),
  headingPath: z.array(z.string().max(300)).max(12),
  tableHeaders: z.array(z.string().max(300)).max(40),
  rowHeader: z.string().max(500).nullable(),
  columnHeader: z.string().max(500).nullable(),
  text: z.string().min(1).max(4000),
  parserConfidence: z.number().min(0).max(1),
  parserState: z.enum(['native', 'ocr', 'hybrid', 'partial', 'uncertain', 'failed']),
  orderIndex: z.number().int().nonnegative(),
});
export type Phase9SourceBlock = z.infer<typeof phase9SourceBlockSchema>;

export const phase9CoverageRecordSchema = z.object({
  blockId: z.string().regex(/^[a-f0-9]{64}$/),
  documentId: z.string().min(1),
  pageNumber: z.number().int().positive().nullable(),
  sheetName: z.string().nullable(),
  cellRange: z.string().nullable(),
  headingPath: z.array(z.string()),
  characterCount: z.number().int().nonnegative(),
  deterministicSignals: z.array(z.string()).max(40),
  route: coverageRouteSchema,
  processingResult: z.string().min(1).max(200),
  exclusionReason: z.string().max(300).nullable(),
  version: z.literal(PHASE9_COVERAGE_VERSION),
});
export type Phase9CoverageRecord = z.infer<typeof phase9CoverageRecordSchema>;

const requirementTypeSchema = z.enum([
  'required_form',
  'attachment',
  'signature',
  'certification',
  'insurance',
  'deadline',
  'meeting',
  'submission',
  'staffing',
  'license',
  'pricing',
  'evaluation',
  'proof',
  'contract_term',
  'other',
]);

export const phase9CandidateSeedSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBlockIds: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(8),
  documentId: z.string().min(1),
  requirementType: requirementTypeSchema,
  obligationText: z.string().min(1).max(700),
  evidenceText: z.string().min(1).max(1200),
  subject: z.string().max(200).nullable(),
  action: z.string().max(200).nullable(),
  condition: z.string().max(300).nullable(),
  dateValue: z.string().max(120).nullable(),
  numberValue: z.string().max(120).nullable(),
  unit: z.string().max(80).nullable(),
  formReference: z.string().max(160).nullable(),
  deterministicSignals: z.array(z.string()).min(1).max(40),
  discoveryRoute: z.enum([
    'deterministic',
    'table',
    'spreadsheet',
    'ai_targeted',
    'coverage_sweep',
  ]),
  needsVerification: z.literal(true),
  minerVersion: z.literal(PHASE9_MINER_VERSION),
});
export type Phase9CandidateSeed = z.infer<typeof phase9CandidateSeedSchema>;

export const phase9CoverageOutputSchema = z.object({
  decisions: z
    .array(
      z.object({
        blockId: z.string().regex(/^[a-f0-9]{64}$/),
        result: z.enum([
          'no_additional_requirement',
          'additional_candidate',
          'parser_uncertain',
          'needs_targeted_review',
        ]),
      }),
    )
    .max(60),
});

export const phase9CompactExtractionOutputSchema = z.object({
  candidates: z
    .array(
      z.object({
        sourceBlockIds: z
          .array(z.string().regex(/^[a-f0-9]{64}$/))
          .min(1)
          .max(4),
        requirementType: requirementTypeSchema,
        obligationText: z.string().min(1).max(500),
        evidenceText: z.string().min(1).max(700),
        subject: z.string().max(160).nullable(),
        action: z.string().max(160).nullable(),
        condition: z.string().max(240).nullable(),
        dateValue: z.string().max(100).nullable(),
        numberValue: z.string().max(100).nullable(),
        unit: z.string().max(60).nullable(),
        formReference: z.string().max(120).nullable(),
        needsVerification: z.literal(true),
      }),
    )
    .max(16),
});

export const phase9CompactVerificationOutputSchema = z.object({
  results: z
    .array(
      z.object({
        candidateId: z.string().regex(/^[a-f0-9]{64}$/),
        support: z.enum([
          'supported',
          'partially_supported',
          'unsupported',
          'contradicted',
          'parser_uncertain',
        ]),
        precedence: z.enum(['active', 'superseded', 'conflicting', 'undetermined']),
        proofRequirement: z.enum([
          'none_identified',
          'requires_human_confirmation',
          'requires_company_artifact',
          'requires_external_validation',
          'undetermined',
        ]),
        evidenceBlockIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(8),
        ambiguityCode: z
          .enum([
            'none',
            'evidence_location_ambiguous',
            'source_insufficient',
            'parser_uncertain',
            'precedence_uncertain',
          ])
          .nullable(),
      }),
    )
    .max(12),
});

export type Phase9CompactVerificationOutput = z.infer<typeof phase9CompactVerificationOutputSchema>;

export const phase9DeterministicAssessmentSchema = z.object({
  candidateId: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSupportStatus: z.enum([
    'supported',
    'unsupported',
    'parser_uncertain',
    'requires_semantic_verification',
  ]),
  precedenceStatus: z.enum(['active', 'superseded', 'conflicting', 'undetermined']),
  proofRequirement: z.enum([
    'none_identified',
    'requires_human_confirmation',
    'requires_company_artifact',
    'requires_external_validation',
    'undetermined',
  ]),
  evidenceBlockIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(16),
  evidenceLocations: z
    .array(
      z.object({
        documentId: z.string(),
        pageNumber: z.number().int().positive().nullable(),
        sheetName: z.string().nullable(),
        cellRange: z.string().nullable(),
      }),
    )
    .max(16),
  quoteMatchType: z.enum(['exact', 'normalized_exact', 'not_found']),
  ambiguityCode: z.enum(['evidence_location_ambiguous']).nullable(),
  machineOnly: z.literal(true),
  humanReviewStatus: z.literal('pending'),
  decisionVersion: z.literal('phase9-deterministic-verification-v1'),
});
export type Phase9DeterministicAssessment = z.infer<typeof phase9DeterministicAssessmentSchema>;

export const phase9FinalFindingSchema = z.object({
  candidateId: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSupportStatus: z.enum([
    'supported',
    'partially_supported',
    'unsupported',
    'contradicted',
    'parser_uncertain',
  ]),
  precedenceStatus: z.enum(['active', 'superseded', 'conflicting', 'undetermined']),
  proofRequirement: z.enum([
    'none_identified',
    'requires_human_confirmation',
    'requires_company_artifact',
    'requires_external_validation',
    'undetermined',
  ]),
  evidenceBlockIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(16),
  evidenceLocations: z
    .array(
      z.object({
        documentId: z.string(),
        pageNumber: z.number().int().positive().nullable(),
        sheetName: z.string().nullable(),
        cellRange: z.string().nullable(),
      }),
    )
    .max(16),
  quoteMatchType: z.enum(['exact', 'normalized_exact', 'not_found']),
  ambiguityCode: z.enum(['evidence_location_ambiguous']).nullable(),
  machineOnly: z.literal(true),
  humanReviewStatus: z.literal('pending'),
  decisionVersion: z.literal('phase9-deterministic-verification-v1'),
});
export type Phase9FinalFinding = z.infer<typeof phase9FinalFindingSchema>;

export const phase9AmendmentRelationshipSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  field: z.string().min(1).max(120),
  fromValue: z.string().max(2000),
  toValue: z.string().max(2000),
  relationshipType: z.literal('explicit_replacement'),
  evidenceText: z.string().min(1).max(4000),
  orderIndex: z.number().int().nonnegative(),
  version: z.literal('phase9-amendment-relationships-v1'),
});
export type Phase9AmendmentRelationship = z.infer<typeof phase9AmendmentRelationshipSchema>;

export const phase9CallPlanTaskSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  taskType: z.enum([
    'coverage_classification',
    'targeted_extraction',
    'independent_verification',
    'exception_review',
  ]),
  tier: z.enum(['tier1', 'tier2', 'tier3', 'tier4']),
  modelId: z.string().min(1),
  reasoning: z.literal('low'),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  sourceBlockIds: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(80),
  candidateIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(12),
  inputCharacters: z.number().int().nonnegative(),
  maximumInputTokens: z.number().int().positive(),
  maximumOutputTokens: z.number().int().positive(),
  maximumRetries: z.number().int().min(0).max(1),
  hardMaximumUsd: z.number().positive(),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  escalationReason: z.string().min(1).max(300),
});
export type Phase9CallPlanTask = z.infer<typeof phase9CallPlanTaskSchema>;

export const phase9CallPlanSchema = z.object({
  version: z.literal(PHASE9_CALL_PLAN_VERSION),
  sourcePackageHash: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
  normalizationVersion: z.string().min(1),
  minerVersion: z.literal(PHASE9_MINER_VERSION),
  reductionVersion: z.literal(PHASE9_REDUCTION_VERSION),
  pricingVersion: z.literal(PHASE9_PRICING_VERSION),
  ceilingUsd: z.literal(PHASE9_LEDGER_CEILING_USD),
  tasks: z.array(phase9CallPlanTaskSchema),
  stageMaximums: z.object({
    coverageClassification: z.number().nonnegative().max(0.35),
    structuredExtraction: z.number().nonnegative().max(0.9),
    independentVerification: z.number().nonnegative().max(1.25),
    exceptionalAmbiguity: z.number().nonnegative().max(0.25),
    retryReserve: z.number().nonnegative().max(0.25),
  }),
  hardMaximumUsd: z.number().nonnegative().max(PHASE9_LEDGER_CEILING_USD),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Phase9CallPlan = z.infer<typeof phase9CallPlanSchema>;

const SIGNALS: Array<[string, RegExp]> = [
  ['shall', /\bshall\b/i],
  ['must', /\bmust\b/i],
  ['will_be_required', /\bwill be required\b/i],
  ['is_required', /\bis required\b/i],
  ['should', /\bshould\b/i],
  ['strongly_suggested', /\bstrongly suggested\b/i],
  ['submit', /\bsubmit(?:ted|s|ting)?\b/i],
  ['include', /\binclude(?:d|s|ing)?\b/i],
  ['provide', /\bprovide(?:d|s|ing)?\b/i],
  ['complete', /\bcomplete(?:d|s|ing)?\b/i],
  ['sign', /\bsign(?:ed|ature|atures|ing)?\b/i],
  ['attach', /\battach(?:ed|ment|ments|ing)?\b/i],
  ['acknowledge', /\backnowledg(?:e|ed|ement|ements)\b/i],
  ['certify', /\bcertif(?:y|ies|ied|ication|ications)\b/i],
  ['demonstrate', /\bdemonstrat(?:e|ed|es|ion)\b/i],
  ['maintain', /\bmaintain(?:ed|s|ing)?\b/i],
  ['minimum', /\bminimum\b/i],
  ['maximum', /\bmaximum\b/i],
  ['no_later_than', /\bno later than\b/i],
  ['due', /\bdue\b/i],
  ['deadline', /\bdeadline\b/i],
  ['questions', /\bquestions?\b/i],
  ['conference', /\bconference\b/i],
  ['meeting', /\bmeeting\b/i],
  ['insurance', /\binsurance\b/i],
  ['bond', /\bbond\b/i],
  ['license', /\blicen[sc](?:e|es|ed|ing)\b/i],
  ['permit', /\bpermit(?:s|ted)?\b/i],
  ['form', /\bform(?:s)?\b/i],
  ['attachment', /\battachment(?:s)?\b/i],
  ['use_attachment', /\buse attachment\s+[A-Z0-9]/i],
  ['exhibit', /\bexhibit(?:s)?\b/i],
  ['pricing', /\bpric(?:e|es|ing)\b/i],
  ['staffing', /\bstaff(?:ing)?\b/i],
  ['experience', /\bexperience\b/i],
  ['references', /\breferences?\b/i],
  ['evaluation', /\bevaluat(?:e|ed|es|ion)\b/i],
  ['submission', /\bsubmission\b/i],
  ['date', /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i],
  ['time', /\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)(?:\s+[A-Z]{2,4})?\b/i],
  ['currency', /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|m|thousand|k))?\b/i],
  ['percentage', /\b\d+(?:\.\d+)?\s*%\b/],
  ['quantity', /\b(?:at least|between|minimum of|maximum of)\s+\w*\s*\(?\d+\)?\b/i],
  ['form_identifier', /\b(?:form|attachment|exhibit)\s+[A-Z0-9][A-Z0-9.-]*\b/i],
  [
    'amendment',
    /\b(?:replace[sd]?|supersede[sd]?|revis(?:e[sd]?|ion)|amend(?:ed|ment)|changed? from|updated? from)\b/i,
  ],
];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function phase9StableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function phase9Signals(text: string): string[] {
  return SIGNALS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

export function extractPhase9AmendmentRelationships(text: string): Phase9AmendmentRelationship[] {
  const normalized = normalizedEvidence(text);
  const pattern =
    /([A-Za-z][A-Za-z '&/-]{1,100})\s+changed\s+from\s+"([^"]{0,2000})"\s+to\s+"([^"]{0,2000})"/gi;
  return [...normalized.matchAll(pattern)].map((match, orderIndex) =>
    phase9AmendmentRelationshipSchema.parse({
      id: phase9StableHash([
        'phase9-amendment-relationships-v1',
        match[1],
        match[2],
        match[3],
        orderIndex,
      ]),
      field: match[1]!.trim(),
      fromValue: match[2]!,
      toValue: match[3]!,
      relationshipType: 'explicit_replacement',
      evidenceText: match[0]!,
      orderIndex,
      version: 'phase9-amendment-relationships-v1',
    }),
  );
}

function materialDateTokens(text: string): string[] {
  return [
    ...text.matchAll(
      /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4})\b/gi,
    ),
  ].map((match) => match[0]!.toLowerCase());
}

export function phase9PrecedenceForEvidence(
  evidenceText: string,
  relationships: Phase9AmendmentRelationship[],
): 'active' | 'superseded' | 'undetermined' {
  const evidence = normalizedEvidence(evidenceText)
    .replace(/^to\s+["“]/i, '')
    .replace(/["”]\.?$/i, '')
    .toLowerCase();
  const materiallyMatches = (left: string, right: string) => {
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    return shorter.length >= 12 && longer.includes(shorter);
  };
  const related = relationships.filter((relationship) => {
    const from = normalizedEvidence(relationship.fromValue).toLowerCase();
    const to = normalizedEvidence(relationship.toValue).toLowerCase();
    const whole = normalizedEvidence(relationship.evidenceText).toLowerCase();
    return (
      materiallyMatches(from, evidence) ||
      materiallyMatches(to, evidence) ||
      materiallyMatches(whole, evidence)
    );
  });
  if (!related.length) return 'active';
  const field = related.at(-1)!.field.toLowerCase();
  const chain = relationships.filter((relationship) => relationship.field.toLowerCase() === field);
  const finalValue = chain.at(-1)!.toValue;
  const evidenceDates = materialDateTokens(evidenceText);
  const finalDates = materialDateTokens(finalValue);
  if (evidenceDates.length && evidenceDates.some((date) => finalDates.includes(date)))
    return 'active';
  if (/\b(?:changed|updated|revised)\s+from\b/i.test(evidenceText)) return 'superseded';
  if (
    related.some((relationship) => {
      const from = normalizedEvidence(relationship.fromValue).toLowerCase();
      return materiallyMatches(from, evidence);
    })
  )
    return 'superseded';
  return 'active';
}

function requirementType(text: string): z.infer<typeof requirementTypeSchema> {
  if (/\b(?:deadline|due|no later than|bid opening)\b/i.test(text)) return 'deadline';
  if (/\b(?:conference|meeting|site visit)\b/i.test(text)) return 'meeting';
  if (/\b(?:insurance|coverage limit)\b/i.test(text)) return 'insurance';
  if (/\b(?:license|permit)\b/i.test(text)) return 'license';
  if (/\b(?:price|pricing|rate|discount|cost table)\b/i.test(text)) return 'pricing';
  if (/\b(?:evaluation|points|score|weight)\b/i.test(text)) return 'evaluation';
  if (/\b(?:signature|signed|initial)\b/i.test(text)) return 'signature';
  if (/\b(?:certif|attest)\b/i.test(text)) return 'certification';
  if (/\b(?:attachment|resume|organizational chart)\b/i.test(text)) return 'attachment';
  if (/\b(?:form|exhibit)\s+[A-Z0-9]/i.test(text)) return 'required_form';
  if (/\b(?:staff|guard|personnel|resources)\b/i.test(text)) return 'staffing';
  if (/\b(?:submit|submission|COMMBUYS|quote)\b/i.test(text)) return 'submission';
  if (/\b(?:proof|evidence|reference)\b/i.test(text)) return 'proof';
  if (/\b(?:contract|term|duration)\b/i.test(text)) return 'contract_term';
  return 'other';
}

function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[0] ?? null;
}

function materialNumberValue(text: string): string | null {
  const source = text.replace(/^\s*Cell\s+[A-Z]+\d+\s*:\s*/i, '');
  return (
    firstMatch(
      source,
      /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|thousand|m|k))?|\b\d+(?:\.\d+)?\s*%/i,
    ) ??
    firstMatch(
      source,
      /\b(?:at least|minimum of|maximum of|no more than|between)\s+(?:[a-z-]+\s*)?\(?\d+(?:\.\d+)?\)?(?:\s+(?:and|to)\s+(?:[a-z-]+\s*)?\(?\d+(?:\.\d+)?\)?)?/i,
    ) ??
    firstMatch(source, /\b\d[\d,]*(?:\.\d+)?\s*(?:years?|days?|pages?|references?)\b/i)
  );
}

function compactObligation(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 700) return normalized;
  return normalized.slice(0, 700).trimEnd();
}

function requirementFragments(block: Phase9SourceBlock): string[] {
  if (block.blockType === 'spreadsheet_cell' || block.blockType === 'table') return [block.text];
  const fragments = block.text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"])|\s+[•]\s+|(?=\b\d+(?:\.\d+){1,3}\s+[A-Z])/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12);
  if (!fragments.length) return [block.text];
  const adjacentPairs = fragments
    .slice(0, -1)
    .map((fragment, index) => ({ fragment, next: fragments[index + 1] ?? '' }))
    .filter(
      ({ fragment, next }) =>
        (fragment.length <= 120 &&
          (/:$/.test(fragment) || /^\d+(?:\.\d+){0,3}\s/.test(fragment))) ||
        (fragment.length <= 300 &&
          /^(?:Use|Submit|Include|Provide|Complete|Sign|Attach|Maintain)\b/i.test(next)),
    )
    .map(({ fragment, next }) => `${fragment} ${next}`)
    .filter((fragment) => fragment.length <= 700)
    .filter((fragment) => phase9Signals(fragment).length >= 2);
  const datePattern =
    /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4})(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))?)?/gi;
  const dateMatches = [...block.text.matchAll(datePattern)];
  const labeledDates =
    dateMatches.length > 1
      ? dateMatches
          .map((match, index) => {
            const previousEnd =
              index === 0
                ? Math.max(0, match.index! - 180)
                : dateMatches[index - 1]!.index! + dateMatches[index - 1]![0].length;
            return block.text.slice(previousEnd, match.index! + match[0].length).trim();
          })
          .filter((fragment) => fragment.length >= 12 && fragment.length <= 700)
      : [];
  return [...new Set([...fragments, ...adjacentPairs, ...labeledDates])];
}

export function buildPhase9PageBlocks(input: {
  workspaceId: string;
  documentId: string;
  documentName: string;
  sourceHash: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    parserConfidence?: number;
    parserState?: Phase9SourceBlock['parserState'];
  }>;
  blockType?: Phase9SourceBlock['blockType'];
  windowCharacters?: number;
  overlapCharacters?: number;
}): Phase9SourceBlock[] {
  const max = input.windowCharacters ?? 900;
  const overlap = input.overlapCharacters ?? 250;
  if (overlap >= max) throw new Error('phase9_invalid_block_overlap');
  const blocks: Phase9SourceBlock[] = [];
  for (const page of input.pages) {
    const normalized = page.text.normalize('NFKC').replace(/\s+/g, ' ').trim();
    let offset = 0;
    let order = 0;
    while (offset < normalized.length) {
      let end = Math.min(normalized.length, offset + max);
      if (end < normalized.length) {
        const boundary = normalized.lastIndexOf(' ', end);
        if (boundary > offset + Math.floor(max * 0.65)) end = boundary;
      }
      const text = normalized.slice(offset, end).trim();
      if (text) {
        const headingMatches = [
          ...text.matchAll(/\b(\d+(?:\.\d+){1,3})\s+([A-Z][A-Za-z][^.!?]{2,100})/g),
        ];
        const headingPath = headingMatches
          .slice(0, 3)
          .map((match) => `${match[1]} ${match[2]}`.trim());
        blocks.push(
          phase9SourceBlockSchema.parse({
            id: phase9StableHash([
              PHASE9_COVERAGE_VERSION,
              input.documentId,
              page.pageNumber,
              offset,
              text,
            ]),
            workspaceId: input.workspaceId,
            documentId: input.documentId,
            documentName: input.documentName,
            sourceHash: input.sourceHash,
            blockType: input.blockType ?? 'page_window',
            pageNumber: page.pageNumber,
            sheetName: null,
            cellRange: null,
            headingPath,
            tableHeaders: [],
            rowHeader: null,
            columnHeader: null,
            text,
            parserConfidence: page.parserConfidence ?? 0.95,
            parserState: page.parserState ?? 'native',
            orderIndex: order++,
          }),
        );
      }
      if (end >= normalized.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return blocks;
}

export function classifyPhase9Coverage(blocks: Phase9SourceBlock[]): Phase9CoverageRecord[] {
  const seen = new Map<string, string>();
  return blocks.map((block) => {
    const signals = phase9Signals(block.text);
    const textHash = phase9StableHash(block.text.toLowerCase());
    let route: CoverageRoute;
    let result: string;
    let exclusionReason: string | null = null;
    if (
      block.parserState === 'failed' ||
      block.parserState === 'uncertain' ||
      block.parserConfidence < 0.6
    ) {
      route = 'parser_uncertain';
      result = 'human_review_required';
    } else if (seen.has(textHash)) {
      route = 'duplicate_source_content';
      result = `duplicate_of:${seen.get(textHash)}`;
    } else if (block.blockType === 'spreadsheet_cell' && signals.length) {
      route = 'selected_for_spreadsheet_extraction';
      result = 'native_cell_candidate';
    } else if (block.blockType === 'table' && signals.length) {
      route = 'selected_for_table_extraction';
      result = 'structured_table_candidate';
    } else if (
      signals.some((signal) =>
        [
          'shall',
          'must',
          'is_required',
          'should',
          'strongly_suggested',
          'submit',
          'include',
          'provide',
          'complete',
          'deadline',
          'form_identifier',
          'use_attachment',
          'amendment',
        ].includes(signal),
      )
    ) {
      route = 'selected_for_deterministic_candidate';
      result = 'strong_requirement_signal';
    } else if (signals.length) {
      route = 'selected_for_ai_extraction';
      result = 'coverage_sweep_then_targeted_extraction';
    } else {
      route = 'reviewed_and_rejected_as_non_requirement';
      result = 'no_requirement_signal';
      exclusionReason = 'phase9_no_requirement_signal_v1';
    }
    seen.set(textHash, block.id);
    return phase9CoverageRecordSchema.parse({
      blockId: block.id,
      documentId: block.documentId,
      pageNumber: block.pageNumber,
      sheetName: block.sheetName,
      cellRange: block.cellRange,
      headingPath: block.headingPath,
      characterCount: block.text.length,
      deterministicSignals: signals,
      route,
      processingResult: result,
      exclusionReason,
      version: PHASE9_COVERAGE_VERSION,
    });
  });
}

export function minePhase9DeterministicCandidates(
  blocks: Phase9SourceBlock[],
  coverage: Phase9CoverageRecord[],
): Phase9CandidateSeed[] {
  const coverageById = new Map(coverage.map((item) => [item.blockId, item]));
  const seeds: Phase9CandidateSeed[] = [];
  for (const block of blocks) {
    const record = coverageById.get(block.id);
    if (
      !record ||
      ![
        'selected_for_deterministic_candidate',
        'selected_for_ai_extraction',
        'selected_for_table_extraction',
        'selected_for_spreadsheet_extraction',
      ].includes(record.route)
    )
      continue;
    for (const fragment of requirementFragments(block)) {
      const fragmentSignals = phase9Signals(fragment);
      if (
        block.blockType !== 'spreadsheet_cell' &&
        block.blockType !== 'table' &&
        !fragmentSignals.length
      )
        continue;
      const signals = fragmentSignals.length
        ? fragmentSignals
        : [block.blockType === 'spreadsheet_cell' ? 'spreadsheet_cell' : 'structured_table'];
      const text = compactObligation(fragment);
      const seed = {
        id: phase9StableHash([
          PHASE9_MINER_VERSION,
          block.documentId,
          block.id,
          requirementType(text),
          text,
        ]),
        sourceBlockIds: [block.id],
        documentId: block.documentId,
        requirementType: requirementType(text),
        obligationText: text,
        evidenceText: text,
        subject: null,
        action: firstMatch(
          text,
          /\b(?:submit|include|provide|complete|sign|attach|maintain|must|shall)\b/i,
        ),
        condition: firstMatch(
          text,
          /\b(?:if|when|unless|prior to|no later than|at least|between)\b[^.;]{0,180}/i,
        ),
        dateValue: firstMatch(
          text,
          /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT))?)?/i,
        ),
        numberValue: materialNumberValue(text),
        unit: firstMatch(
          text,
          /\b(?:percent|%|years?|days?|pages?|references?|per occurrence|aggregate)\b/i,
        ),
        formReference: firstMatch(text, /\b(?:form|attachment|exhibit)\s+[A-Z0-9][A-Z0-9._-]*/i),
        deterministicSignals: signals,
        discoveryRoute:
          block.blockType === 'spreadsheet_cell'
            ? ('spreadsheet' as const)
            : block.blockType === 'table'
              ? ('table' as const)
              : record.route === 'selected_for_ai_extraction'
                ? ('coverage_sweep' as const)
                : ('deterministic' as const),
        needsVerification: true as const,
        minerVersion: PHASE9_MINER_VERSION as typeof PHASE9_MINER_VERSION,
      };
      seeds.push(phase9CandidateSeedSchema.parse(seed));
    }
  }
  return seeds;
}

function candidateFamilyKey(candidate: Phase9CandidateSeed): string {
  const normalized = candidate.obligationText
    .toLowerCase()
    .replace(/\bpage\s+\d+\b/g, '')
    .replace(/[^a-z0-9$%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return phase9StableHash([
    candidate.requirementType,
    normalized,
    candidate.dateValue,
    candidate.numberValue,
    candidate.formReference,
  ]);
}

export function reducePhase9Candidates(candidates: Phase9CandidateSeed[]): {
  candidates: Phase9CandidateSeed[];
  exactDuplicatesRemoved: number;
  families: Array<{ familyKey: string; canonicalId: string; contributingIds: string[] }>;
} {
  const groups = new Map<string, Phase9CandidateSeed[]>();
  for (const candidate of candidates) {
    const key = candidateFamilyKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const reduced: Phase9CandidateSeed[] = [];
  const families = [];
  for (const [familyKey, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const canonical = ordered[0]!;
    const sourceBlockIds = [...new Set(ordered.flatMap((item) => item.sourceBlockIds))].sort();
    const merged = phase9CandidateSeedSchema.parse({
      ...canonical,
      sourceBlockIds: sourceBlockIds.slice(0, 8),
    });
    reduced.push(merged);
    families.push({
      familyKey,
      canonicalId: canonical.id,
      contributingIds: ordered.map((item) => item.id),
    });
  }
  return {
    candidates: reduced,
    exactDuplicatesRemoved: candidates.length - reduced.length,
    families,
  };
}

function normalizedEvidence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function phase9ProofRequirement(
  candidate: Phase9CandidateSeed,
): Phase9DeterministicAssessment['proofRequirement'] {
  const text = candidate.obligationText;
  if (
    candidate.requirementType === 'evaluation' ||
    candidate.requirementType === 'deadline' ||
    candidate.requirementType === 'meeting'
  )
    return 'none_identified';
  if (
    /\b(?:original formats?|electronically|indicate|remain in effect|pool of|coverage area)\b/i.test(
      text,
    ) ||
    candidate.requirementType === 'signature' ||
    candidate.requirementType === 'staffing' ||
    candidate.requirementType === 'contract_term'
  )
    return 'requires_human_confirmation';
  if (
    candidate.requirementType === 'license' ||
    candidate.requirementType === 'proof' ||
    candidate.requirementType === 'pricing' ||
    candidate.requirementType === 'certification' ||
    candidate.requirementType === 'attachment' ||
    candidate.requirementType === 'required_form' ||
    /\b(?:references?|experience|license|attachment|form|SDP|commitment)\b/i.test(text)
  )
    return 'requires_company_artifact';
  return 'none_identified';
}

/**
 * Independent deterministic source assessment for a source-derived seed.
 * It never rewrites the extraction candidate and never claims human approval.
 */
export function assessPhase9DeterministicCandidate(input: {
  candidate: Phase9CandidateSeed;
  blocks: Phase9SourceBlock[];
}): Phase9DeterministicAssessment {
  const candidateBlocks = input.candidate.sourceBlockIds
    .map((id) => input.blocks.find((block) => block.id === id))
    .filter(Boolean) as Phase9SourceBlock[];
  if (
    candidateBlocks.some(
      (block) =>
        block.parserState === 'failed' ||
        block.parserState === 'uncertain' ||
        block.parserConfidence < 0.6,
    )
  ) {
    return phase9DeterministicAssessmentSchema.parse({
      candidateId: input.candidate.id,
      sourceSupportStatus: 'parser_uncertain',
      precedenceStatus: 'undetermined',
      proofRequirement: 'undetermined',
      evidenceBlockIds: candidateBlocks.map((block) => block.id),
      evidenceLocations: candidateBlocks.map((block) => ({
        documentId: block.documentId,
        pageNumber: block.pageNumber,
        sheetName: block.sheetName,
        cellRange: block.cellRange,
      })),
      quoteMatchType: 'not_found',
      ambiguityCode: null,
      machineOnly: true,
      humanReviewStatus: 'pending',
      decisionVersion: 'phase9-deterministic-verification-v1',
    });
  }
  const exactBlocks = candidateBlocks.filter((block) =>
    block.text.includes(input.candidate.evidenceText),
  );
  const normalizedBlocks = candidateBlocks.filter((block) =>
    normalizedEvidence(block.text).includes(normalizedEvidence(input.candidate.evidenceText)),
  );
  const evidenceBlocks = exactBlocks.length ? exactBlocks : normalizedBlocks;
  if (!evidenceBlocks.length) {
    return phase9DeterministicAssessmentSchema.parse({
      candidateId: input.candidate.id,
      sourceSupportStatus: 'unsupported',
      precedenceStatus: 'undetermined',
      proofRequirement: phase9ProofRequirement(input.candidate),
      evidenceBlockIds: [],
      evidenceLocations: [],
      quoteMatchType: 'not_found',
      ambiguityCode: null,
      machineOnly: true,
      humanReviewStatus: 'pending',
      decisionVersion: 'phase9-deterministic-verification-v1',
    });
  }
  const allLocations = new Map<string, Phase9SourceBlock>();
  for (const block of input.blocks) {
    if (!normalizedEvidence(block.text).includes(normalizedEvidence(input.candidate.evidenceText)))
      continue;
    const key = [block.documentId, block.pageNumber, block.sheetName, block.cellRange].join(':');
    allLocations.set(key, block);
  }
  const sourceSupportStatus =
    input.candidate.discoveryRoute === 'ai_targeted' ||
    input.candidate.discoveryRoute === 'coverage_sweep' ||
    !phase9DeterministicSupportEligible(input.candidate)
      ? 'requires_semantic_verification'
      : 'supported';
  return phase9DeterministicAssessmentSchema.parse({
    candidateId: input.candidate.id,
    sourceSupportStatus,
    precedenceStatus: 'active',
    proofRequirement: phase9ProofRequirement(input.candidate),
    evidenceBlockIds: [...allLocations.values()].map((block) => block.id).slice(0, 16),
    evidenceLocations: [...allLocations.values()]
      .map((block) => ({
        documentId: block.documentId,
        pageNumber: block.pageNumber,
        sheetName: block.sheetName,
        cellRange: block.cellRange,
      }))
      .slice(0, 16),
    quoteMatchType: exactBlocks.length ? 'exact' : 'normalized_exact',
    ambiguityCode: allLocations.size > 1 ? 'evidence_location_ambiguous' : null,
    machineOnly: true,
    humanReviewStatus: 'pending',
    decisionVersion: 'phase9-deterministic-verification-v1',
  });
}

/**
 * This allowlist is intentionally narrower than candidate discovery. Discovery
 * is high recall; deterministic support is granted only to explicit obligation
 * language or a native structured requirement cell. Descriptive and merely
 * suggestive text stays unverified for semantic or human review.
 */
export function phase9DeterministicSupportEligible(candidate: Phase9CandidateSeed): boolean {
  if (candidate.discoveryRoute === 'spreadsheet')
    return candidate.sourceBlockIds.length > 0 && candidate.evidenceText.length > 0;
  const strong = new Set([
    'shall',
    'must',
    'will_be_required',
    'is_required',
    'submit',
    'include',
    'provide',
    'complete',
    'sign',
    'attach',
    'acknowledge',
    'certify',
    'demonstrate',
    'maintain',
    'no_later_than',
    'due',
    'deadline',
    'use_attachment',
    'amendment',
  ]);
  return candidate.deterministicSignals.some((signal) => strong.has(signal));
}

export function finalizePhase9Finding(input: {
  candidate: Phase9CandidateSeed;
  blocks: Phase9SourceBlock[];
  semanticResult?: Phase9CompactVerificationOutput['results'][number];
  precedenceStatus?: Phase9FinalFinding['precedenceStatus'];
}): Phase9FinalFinding | null {
  const deterministic = assessPhase9DeterministicCandidate(input);
  if (deterministic.sourceSupportStatus === 'requires_semantic_verification') {
    if (!input.semanticResult) return null;
    if (input.semanticResult.candidateId !== input.candidate.id)
      throw new Error('phase9_semantic_candidate_mismatch');
    if (
      input.semanticResult.support === 'supported' &&
      (deterministic.quoteMatchType === 'not_found' ||
        input.semanticResult.evidenceBlockIds.length === 0)
    )
      throw new Error('phase9_semantic_support_without_validated_evidence');
    return phase9FinalFindingSchema.parse({
      ...deterministic,
      sourceSupportStatus: input.semanticResult.support,
      precedenceStatus: input.precedenceStatus ?? deterministic.precedenceStatus,
      proofRequirement: input.semanticResult.proofRequirement,
      evidenceBlockIds: input.semanticResult.evidenceBlockIds,
    });
  }
  return phase9FinalFindingSchema.parse({
    ...deterministic,
    precedenceStatus: input.precedenceStatus ?? deterministic.precedenceStatus,
  });
}

export function phase9ProviderCacheKey(input: {
  workspaceId: string;
  sourcePackageHash: string;
  sourceBlockHashes: string[];
  parserVersion: string;
  normalizationVersion: string;
  tableVersion: string;
  promptVersion: string;
  schemaVersion: string;
  taskType: Phase9CallPlanTask['taskType'];
  modelId: string;
  reasoning: 'low';
  evaluatorVersion: string;
}): string {
  return phase9StableHash({
    version: PHASE9_CACHE_VERSION,
    ...input,
    sourceBlockHashes: [...input.sourceBlockHashes].sort(),
  });
}

export function phase9IncrementalInvalidation(input: {
  changedDocumentIds: string[];
  blocks: Phase9SourceBlock[];
  candidates: Phase9CandidateSeed[];
}) {
  const changedDocuments = new Set(input.changedDocumentIds);
  const changedBlockIds = new Set(
    input.blocks.filter((block) => changedDocuments.has(block.documentId)).map((block) => block.id),
  );
  const affectedCandidateIds = new Set(
    input.candidates
      .filter((candidate) =>
        candidate.sourceBlockIds.some((blockId) => changedBlockIds.has(blockId)),
      )
      .map((candidate) => candidate.id),
  );
  return {
    version: 'phase9-incremental-invalidation-v1',
    changedDocumentIds: [...changedDocuments].sort(),
    changedBlockIds: [...changedBlockIds].sort(),
    affectedCandidateIds: [...affectedCandidateIds].sort(),
    unchangedBlockCount: input.blocks.length - changedBlockIds.size,
    unchangedCandidateCount: input.candidates.length - affectedCandidateIds.size,
  };
}

type PlanTaskInput = Omit<
  Phase9CallPlanTask,
  'id' | 'hardMaximumUsd' | 'cacheKey' | 'maximumInputTokens'
> & {
  sourceBlockHashes: string[];
  parserVersion: string;
  normalizationVersion: string;
  tableVersion: string;
  evaluatorVersion: string;
  sourcePackageHash: string;
  workspaceId: string;
  inputTokenPadding?: number;
};

function buildTask(input: PlanTaskInput): Phase9CallPlanTask {
  // Reserve for JSON keys, source metadata, strict-schema instructions, and
  // the system prompt as well as the visible source text. Provider access must
  // never reveal an input-size underestimate after the plan is approved.
  const maximumInputTokens =
    Math.ceil(input.inputCharacters / 2) + (input.inputTokenPadding ?? 200);
  const singleAttempt = estimateChatCost(
    maximumInputTokens,
    input.maximumOutputTokens,
    input.modelId,
  );
  const hardMaximumUsd = Number((singleAttempt * (1 + input.maximumRetries)).toFixed(6));
  const cacheKey = phase9ProviderCacheKey({
    workspaceId: input.workspaceId,
    sourcePackageHash: input.sourcePackageHash,
    sourceBlockHashes: input.sourceBlockHashes,
    parserVersion: input.parserVersion,
    normalizationVersion: input.normalizationVersion,
    tableVersion: input.tableVersion,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    taskType: input.taskType,
    modelId: input.modelId,
    reasoning: 'low',
    evaluatorVersion: input.evaluatorVersion,
  });
  return phase9CallPlanTaskSchema.parse({
    id: phase9StableHash([
      PHASE9_CALL_PLAN_VERSION,
      input.taskType,
      input.sourceBlockIds,
      input.candidateIds,
      cacheKey,
    ]),
    taskType: input.taskType,
    tier: input.tier,
    modelId: input.modelId,
    reasoning: 'low',
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    sourceBlockIds: input.sourceBlockIds,
    candidateIds: input.candidateIds,
    inputCharacters: input.inputCharacters,
    maximumInputTokens,
    maximumOutputTokens: input.maximumOutputTokens,
    maximumRetries: input.maximumRetries,
    hardMaximumUsd,
    cacheKey,
    escalationReason: input.escalationReason,
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

export function phase9ProviderInputCharacters(input: {
  taskType: Phase9CallPlanTask['taskType'];
  blocks: Phase9SourceBlock[];
  candidates: Phase9CandidateSeed[];
}): number {
  const payload = {
    taskId: '0'.repeat(64),
    taskType: input.taskType,
    sources: input.blocks.map((block) => ({
      blockId: block.id,
      documentId: block.documentId,
      documentName: block.documentName,
      blockType: block.blockType,
      pageNumber: block.pageNumber,
      sheetName: block.sheetName,
      cellRange: block.cellRange,
      headingPath: block.headingPath,
      parserState: block.parserState,
      parserConfidence: block.parserConfidence,
      text: block.text,
    })),
    candidates: input.candidates.map((candidate) => ({
      candidateId: candidate.id,
      requirementType: candidate.requirementType,
      obligationText: candidate.obligationText,
      evidenceText: candidate.evidenceText,
      sourceBlockIds: candidate.sourceBlockIds,
      facts: {
        dateValue: candidate.dateValue,
        numberValue: candidate.numberValue,
        unit: candidate.unit,
        formReference: candidate.formReference,
      },
    })),
  };
  // Includes the compact system prompt and strict-schema envelope. The token
  // plan then uses a conservative two-characters-per-token upper estimate.
  return JSON.stringify(payload).length + 2_000;
}

export function buildPhase9CallPlan(input: {
  workspaceId: string;
  sourcePackageHash: string;
  parserVersion: string;
  normalizationVersion: string;
  tableVersion: string;
  evaluatorVersion: string;
  blocks: Phase9SourceBlock[];
  coverage: Phase9CoverageRecord[];
  candidates: Phase9CandidateSeed[];
  cachedKeys?: Set<string>;
}): Phase9CallPlan {
  const blockById = new Map(input.blocks.map((block) => [block.id, block]));
  const tasks: Phase9CallPlanTask[] = [];
  const unselected = input.coverage.filter(
    (record) => record.route === 'selected_for_ai_extraction',
  );
  for (const batch of chunks(unselected, 24)) {
    const blocks = batch
      .map((record) => blockById.get(record.blockId))
      .filter(Boolean) as Phase9SourceBlock[];
    tasks.push(
      buildTask({
        workspaceId: input.workspaceId,
        sourcePackageHash: input.sourcePackageHash,
        parserVersion: input.parserVersion,
        normalizationVersion: input.normalizationVersion,
        tableVersion: input.tableVersion,
        evaluatorVersion: input.evaluatorVersion,
        taskType: 'coverage_classification',
        tier: 'tier1',
        modelId: PHASE9_TIER_MODELS.tier1,
        reasoning: 'low',
        promptVersion: PHASE9_PROMPT_VERSIONS.coverage,
        schemaVersion: PHASE9_SCHEMA_VERSIONS.coverage,
        sourceBlockIds: blocks.map((block) => block.id),
        candidateIds: [],
        sourceBlockHashes: blocks.map((block) => phase9StableHash(block.text)),
        inputCharacters: phase9ProviderInputCharacters({
          taskType: 'coverage_classification',
          blocks,
          candidates: [],
        }),
        maximumOutputTokens: Math.min(900, 80 + blocks.length * 24),
        maximumRetries: 0,
        escalationReason: 'coverage_sweep_for_non_targeted_blocks',
      }),
    );
  }

  const extractionCoverage = input.coverage.filter((record) =>
    [
      'selected_for_deterministic_candidate',
      'selected_for_ai_extraction',
      'selected_for_table_extraction',
      'selected_for_spreadsheet_extraction',
    ].includes(record.route),
  );
  for (const batch of chunks(extractionCoverage, 10)) {
    const blocks = batch
      .map((record) => blockById.get(record.blockId))
      .filter(Boolean) as Phase9SourceBlock[];
    tasks.push(
      buildTask({
        workspaceId: input.workspaceId,
        sourcePackageHash: input.sourcePackageHash,
        parserVersion: input.parserVersion,
        normalizationVersion: input.normalizationVersion,
        tableVersion: input.tableVersion,
        evaluatorVersion: input.evaluatorVersion,
        taskType: 'targeted_extraction',
        tier: 'tier2',
        modelId: PHASE9_TIER_MODELS.tier2,
        reasoning: 'low',
        promptVersion: PHASE9_PROMPT_VERSIONS.extraction,
        schemaVersion: PHASE9_SCHEMA_VERSIONS.extraction,
        sourceBlockIds: blocks.map((block) => block.id),
        candidateIds: [],
        sourceBlockHashes: blocks.map((block) => phase9StableHash(block.text)),
        inputCharacters: phase9ProviderInputCharacters({
          taskType: 'targeted_extraction',
          blocks,
          candidates: [],
        }),
        maximumOutputTokens: Math.min(1300, 180 + blocks.length * 95),
        maximumRetries: 0,
        escalationReason: 'targeted_requirement_bearing_blocks',
      }),
    );
  }

  const semanticVerificationCandidates = input.candidates.filter(
    (candidate) =>
      candidate.discoveryRoute === 'ai_targeted' || candidate.discoveryRoute === 'coverage_sweep',
  );
  for (const batch of chunks(semanticVerificationCandidates, 12)) {
    const blockIds = [...new Set(batch.flatMap((candidate) => candidate.sourceBlockIds))].slice(
      0,
      80,
    );
    const blocks = blockIds.map((id) => blockById.get(id)).filter(Boolean) as Phase9SourceBlock[];
    tasks.push(
      buildTask({
        workspaceId: input.workspaceId,
        sourcePackageHash: input.sourcePackageHash,
        parserVersion: input.parserVersion,
        normalizationVersion: input.normalizationVersion,
        tableVersion: input.tableVersion,
        evaluatorVersion: input.evaluatorVersion,
        taskType: 'independent_verification',
        tier: 'tier3',
        modelId: PHASE9_TIER_MODELS.tier3,
        reasoning: 'low',
        promptVersion: PHASE9_PROMPT_VERSIONS.verification,
        schemaVersion: PHASE9_SCHEMA_VERSIONS.verification,
        sourceBlockIds: blockIds,
        candidateIds: batch.map((candidate) => candidate.id),
        sourceBlockHashes: blocks.map((block) => phase9StableHash(block.text)),
        inputCharacters: phase9ProviderInputCharacters({
          taskType: 'independent_verification',
          blocks,
          candidates: batch,
        }),
        maximumOutputTokens: 180 + batch.length * 90,
        maximumRetries: 0,
        escalationReason: 'independent_semantic_source_support',
      }),
    );
  }

  const ambiguous = input.candidates.filter((candidate) => {
    const locations = new Set(
      candidate.sourceBlockIds
        .map((id) => blockById.get(id))
        .filter(Boolean)
        .map((block) =>
          [block!.documentId, block!.pageNumber, block!.sheetName, block!.cellRange].join(':'),
        ),
    );
    return locations.size > 1;
  });
  for (const batch of chunks(ambiguous, 6)) {
    const blockIds = [...new Set(batch.flatMap((candidate) => candidate.sourceBlockIds))].slice(
      0,
      80,
    );
    const blocks = blockIds.map((id) => blockById.get(id)).filter(Boolean) as Phase9SourceBlock[];
    tasks.push(
      buildTask({
        workspaceId: input.workspaceId,
        sourcePackageHash: input.sourcePackageHash,
        parserVersion: input.parserVersion,
        normalizationVersion: input.normalizationVersion,
        tableVersion: input.tableVersion,
        evaluatorVersion: input.evaluatorVersion,
        taskType: 'exception_review',
        tier: 'tier4',
        modelId: PHASE9_TIER_MODELS.tier4,
        reasoning: 'low',
        promptVersion: PHASE9_PROMPT_VERSIONS.ambiguity,
        schemaVersion: PHASE9_SCHEMA_VERSIONS.ambiguity,
        sourceBlockIds: blockIds,
        candidateIds: batch.map((candidate) => candidate.id),
        sourceBlockHashes: blocks.map((block) => phase9StableHash(block.text)),
        inputCharacters: phase9ProviderInputCharacters({
          taskType: 'exception_review',
          blocks,
          candidates: batch,
        }),
        maximumOutputTokens: 160 + batch.length * 70,
        maximumRetries: 0,
        escalationReason: 'multiple_valid_evidence_locations',
      }),
    );
  }

  const uncached = tasks.filter((task) => !input.cachedKeys?.has(task.cacheKey));
  const sumStage = (taskType: Phase9CallPlanTask['taskType']) =>
    Number(
      uncached
        .filter((task) => task.taskType === taskType)
        .reduce((sum, task) => sum + task.hardMaximumUsd, 0)
        .toFixed(6),
    );
  const stageMaximums = {
    coverageClassification: sumStage('coverage_classification'),
    structuredExtraction: sumStage('targeted_extraction'),
    independentVerification: sumStage('independent_verification'),
    exceptionalAmbiguity: sumStage('exception_review'),
    retryReserve: 0,
  };
  const hardMaximumUsd = Number(
    Object.values(stageMaximums)
      .reduce((sum, value) => sum + value, 0)
      .toFixed(6),
  );
  const base = {
    version: PHASE9_CALL_PLAN_VERSION as typeof PHASE9_CALL_PLAN_VERSION,
    sourcePackageHash: input.sourcePackageHash,
    parserVersion: input.parserVersion,
    normalizationVersion: input.normalizationVersion,
    minerVersion: PHASE9_MINER_VERSION as typeof PHASE9_MINER_VERSION,
    reductionVersion: PHASE9_REDUCTION_VERSION as typeof PHASE9_REDUCTION_VERSION,
    pricingVersion: PHASE9_PRICING_VERSION as typeof PHASE9_PRICING_VERSION,
    ceilingUsd: PHASE9_LEDGER_CEILING_USD as typeof PHASE9_LEDGER_CEILING_USD,
    tasks,
    stageMaximums,
    hardMaximumUsd,
  };
  if (
    stageMaximums.coverageClassification > 0.35 ||
    stageMaximums.structuredExtraction > 0.9 ||
    stageMaximums.independentVerification > 1.25 ||
    stageMaximums.exceptionalAmbiguity > 0.25 ||
    hardMaximumUsd > PHASE9_LEDGER_CEILING_USD
  ) {
    throw new Error(
      `phase9_call_plan_exceeds_stage_caps:${JSON.stringify({
        taskCount: tasks.length,
        coverageRecords: input.coverage.length,
        candidates: input.candidates.length,
        stageMaximums,
        hardMaximumUsd,
      })}`,
    );
  }
  return phase9CallPlanSchema.parse({ ...base, planHash: phase9StableHash(base) });
}

export function assertPhase9PlannedProviderCall(input: {
  plan: Phase9CallPlan;
  taskId: string;
  modelId: string;
  reasoning: string;
  inputTokens: number;
  outputLimit: number;
  toolsEnabled: boolean;
  store: boolean;
}): Phase9CallPlanTask {
  if (input.plan.hardMaximumUsd > PHASE9_LEDGER_CEILING_USD)
    throw new Error('phase9_call_plan_over_ceiling');
  const task = input.plan.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) throw new Error('phase9_unplanned_provider_call');
  if (
    task.modelId !== input.modelId ||
    input.reasoning !== 'low' ||
    input.inputTokens > task.maximumInputTokens ||
    input.outputLimit !== task.maximumOutputTokens ||
    input.toolsEnabled ||
    input.store
  )
    throw new Error('phase9_provider_call_incompatible_with_plan');
  return task;
}

export function phase9CompatibilityFingerprint(): string {
  return phase9StableHash({
    recoveryVersion: PHASE9_RECOVERY_VERSION,
    coverageVersion: PHASE9_COVERAGE_VERSION,
    minerVersion: PHASE9_MINER_VERSION,
    reductionVersion: PHASE9_REDUCTION_VERSION,
    callPlanVersion: PHASE9_CALL_PLAN_VERSION,
    cacheVersion: PHASE9_CACHE_VERSION,
    pricingVersion: PHASE9_PRICING_VERSION,
    models: PHASE9_TIER_MODELS,
    prompts: PHASE9_PROMPT_VERSIONS,
    schemas: PHASE9_SCHEMA_VERSIONS,
    reasoning: 'low',
    store: false,
    tools: false,
  });
}
