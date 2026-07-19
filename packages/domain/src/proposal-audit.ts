import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PROPOSAL_SECTION_PARSER_VERSION = 'proposal-section-parser-v1';
export const PROPOSAL_CLAIM_SEGMENTER_VERSION = 'proposal-claim-segmenter-v1';
export const PROPOSAL_AUDIT_SCHEMA_VERSION = 'proposal-audit-schema-v1';
export const PROPOSAL_RESPONSE_MATCHER_VERSION = 'proposal-response-matcher-v1';
export const PROPOSAL_SUPPORT_POLICY_VERSION = 'proposal-support-policy-v1';
export const PROPOSAL_CONTRADICTION_VERSION = 'proposal-contradiction-v1';
export const PROPOSAL_FINDING_SEVERITY_VERSION = 'proposal-finding-severity-v1';
export const PROPOSAL_AUDIT_EVALUATOR_VERSION = 'proposal-audit-evaluator-v1';

export const PROPOSAL_AUDIT_VERSIONS = Object.freeze({
  sectionParser: PROPOSAL_SECTION_PARSER_VERSION,
  claimSegmenter: PROPOSAL_CLAIM_SEGMENTER_VERSION,
  schema: PROPOSAL_AUDIT_SCHEMA_VERSION,
  matcher: PROPOSAL_RESPONSE_MATCHER_VERSION,
  supportPolicy: PROPOSAL_SUPPORT_POLICY_VERSION,
  contradiction: PROPOSAL_CONTRADICTION_VERSION,
  severity: PROPOSAL_FINDING_SEVERITY_VERSION,
  evaluator: PROPOSAL_AUDIT_EVALUATOR_VERSION,
});

export const RESPONSE_COVERAGE_STATUSES = [
  'addressed',
  'partially_addressed',
  'missing',
  'not_applicable',
  'parser_uncertain',
] as const;
export const responseCoverageStatusSchema = z.enum(RESPONSE_COVERAGE_STATUSES);

export const CLAIM_SUPPORT_STATUSES = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
  'requires_human_proof',
  'parser_uncertain',
] as const;
export const claimSupportStatusSchema = z.enum(CLAIM_SUPPORT_STATUSES);

export const CONSISTENCY_STATUSES = [
  'consistent',
  'inconsistent',
  'undetermined',
  'not_applicable',
] as const;
export const consistencyStatusSchema = z.enum(CONSISTENCY_STATUSES);

export const PROPOSAL_HUMAN_RESOLUTION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'needs_follow_up',
  'waived',
] as const;
export const proposalHumanResolutionStatusSchema = z.enum(PROPOSAL_HUMAN_RESOLUTION_STATUSES);

export const PROPOSAL_FINDING_WORKFLOW_STATUSES = [
  'open',
  'in_review',
  'resolved',
  'accepted_risk',
  'obsolete',
] as const;
export const proposalFindingWorkflowStatusSchema = z.enum(PROPOSAL_FINDING_WORKFLOW_STATUSES);

export const PROPOSAL_CLAIM_TYPES = [
  'requirement_response',
  'company_capability',
  'company_credential',
  'staffing_commitment',
  'insurance_claim',
  'deadline_statement',
  'pricing_statement',
  'procurement_identity',
  'descriptive',
  'unknown',
] as const;
export const proposalClaimTypeSchema = z.enum(PROPOSAL_CLAIM_TYPES);

export const PROPOSAL_FINDING_TYPES = [
  'missing_required_response',
  'partial_required_response',
  'unsupported_claim',
  'contradicted_claim',
  'date_mismatch',
  'numerical_mismatch',
  'wrong_procurement_identity',
  'copied_procurement_language',
  'parser_uncertainty',
  'prompt_injection_attempt',
  'human_proof_required',
  'unresolved_source_requirement',
  'corrected_in_revision',
] as const;
export const proposalFindingTypeSchema = z.enum(PROPOSAL_FINDING_TYPES);
export const proposalFindingSeveritySchema = z.enum([
  'critical',
  'blocking',
  'warning',
  'informational',
]);

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const proposalPageSchema = z
  .object({
    workspaceId: uuid,
    documentId: uuid,
    pageId: uuid,
    pageNumber: z.number().int().positive(),
    text: z.string(),
    textSha256: hash,
    extractionStatus: z.enum(['ok', 'empty', 'error']),
    warnings: z.array(z.string().max(500)).max(20).default([]),
  })
  .strict();
export type ProposalPage = z.infer<typeof proposalPageSchema>;

export const proposalAuditRequirementSchema = z
  .object({
    workspaceId: uuid,
    checklistItemId: uuid,
    findingId: uuid,
    candidateId: uuid,
    verificationRunId: uuid,
    title: z.string().min(1).max(500),
    obligation: z.string().min(1).max(8000),
    category: z.string().min(1).max(100),
    mandatory: z.boolean(),
    eligibilityClass: z.enum(['ordinary_active', 'review_needed', 'unresolved_risk', 'excluded']),
    lifecycleStatus: z.enum(['active', 'obsolete']),
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
    humanReviewStatus: z.enum(['pending', 'accepted', 'rejected', 'needs_follow_up', 'waived']),
    workflowStatus: z.string().min(1).max(80),
    relationshipRole: z.enum(['atomic', 'parent', 'child']),
    documentId: uuid,
    pageId: uuid,
    pageNumber: z.number().int().positive(),
    exactQuote: z.string().min(1).max(8000),
    evidenceId: uuid,
  })
  .strict();
export type ProposalAuditRequirement = z.infer<typeof proposalAuditRequirementSchema>;

export const proposalCompanyEvidenceSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    kind: z.enum(['company_artifact', 'external_validation', 'human_confirmation']),
    text: z.string().min(1).max(12000),
    documentId: uuid.nullable(),
    pageId: uuid.nullable(),
    pageNumber: z.number().int().positive().nullable(),
    exactQuote: z.string().min(1).max(8000),
    reviewed: z.boolean(),
  })
  .strict();
export type ProposalCompanyEvidence = z.infer<typeof proposalCompanyEvidenceSchema>;

export const proposalSectionSchema = z
  .object({
    stableKey: hash,
    heading: z.string().min(1).max(300),
    normalizedHeading: z.string().min(1).max(300),
    pageId: uuid,
    pageNumber: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    text: z.string(),
    parserUncertain: z.boolean(),
  })
  .strict();
export type ProposalSection = z.infer<typeof proposalSectionSchema>;

export const proposalClaimSchema = z
  .object({
    stableKey: hash,
    sectionStableKey: hash,
    claimType: proposalClaimTypeSchema,
    text: z.string().min(1).max(8000),
    normalizedText: z.string().min(1).max(8000),
    pageId: uuid,
    pageNumber: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    parserUncertain: z.boolean(),
    injectionSignals: z.array(z.string().max(100)).max(12),
  })
  .strict();
export type ProposalClaim = z.infer<typeof proposalClaimSchema>;

const extractedFactSchema = z
  .object({
    kind: z.enum(['date', 'currency', 'percentage', 'quantity', 'form_identifier']),
    role: z.string().min(1).max(100),
    raw: z.string().min(1).max(200),
    normalized: z.string().min(1).max(200),
    unit: z.string().max(100).nullable(),
    operator: z.enum(['equal', 'minimum', 'maximum', 'range', 'unknown']),
    scope: z.string().max(300).nullable(),
    ambiguous: z.boolean(),
  })
  .strict();
export type ProposalExtractedFact = z.infer<typeof extractedFactSchema>;

export const proposalClaimAssessmentSchema = z
  .object({
    claimStableKey: hash,
    matchedChecklistItemId: uuid.nullable(),
    matchScore: z.number().min(0).max(1),
    matchReason: z.string().min(1).max(500),
    supportStatus: claimSupportStatusSchema,
    consistencyStatus: consistencyStatusSchema,
    rationale: z.string().min(1).max(1000),
    proposalFacts: z.array(extractedFactSchema).max(20),
    requirementFacts: z.array(extractedFactSchema).max(20),
    evidenceIds: z.array(uuid).max(20),
    machineOnly: z.literal(true),
    humanResolutionStatus: z.literal('pending'),
  })
  .strict();
export type ProposalClaimAssessment = z.infer<typeof proposalClaimAssessmentSchema>;

export const proposalCoverageAssessmentSchema = z
  .object({
    checklistItemId: uuid,
    coverageStatus: responseCoverageStatusSchema,
    matchedClaimStableKeys: z.array(hash).max(20),
    reason: z.string().min(1).max(1000),
    machineOnly: z.literal(true),
    humanResolutionStatus: z.literal('pending'),
  })
  .strict();
export type ProposalCoverageAssessment = z.infer<typeof proposalCoverageAssessmentSchema>;

export const proposalAuditFindingSchema = z
  .object({
    stableKey: hash,
    type: proposalFindingTypeSchema,
    severity: proposalFindingSeveritySchema,
    title: z.string().min(1).max(500),
    detail: z.string().min(1).max(2000),
    checklistItemId: uuid.nullable(),
    claimStableKey: hash.nullable(),
    proposalPageId: uuid.nullable(),
    proposalPageNumber: z.number().int().positive().nullable(),
    sourceDocumentId: uuid.nullable(),
    sourcePageId: uuid.nullable(),
    sourcePageNumber: z.number().int().positive().nullable(),
    sourceQuote: z.string().max(8000).nullable(),
    machineOnly: z.literal(true),
    humanResolutionStatus: z.literal('pending'),
    workflowStatus: z.literal('open'),
    ruleVersion: z.string().min(1).max(100),
  })
  .strict();
export type ProposalAuditFinding = z.infer<typeof proposalAuditFindingSchema>;

export const proposalAuditResultSchema = z
  .object({
    inputHash: hash,
    versions: z.object({
      sectionParser: z.literal(PROPOSAL_SECTION_PARSER_VERSION),
      claimSegmenter: z.literal(PROPOSAL_CLAIM_SEGMENTER_VERSION),
      schema: z.literal(PROPOSAL_AUDIT_SCHEMA_VERSION),
      matcher: z.literal(PROPOSAL_RESPONSE_MATCHER_VERSION),
      supportPolicy: z.literal(PROPOSAL_SUPPORT_POLICY_VERSION),
      contradiction: z.literal(PROPOSAL_CONTRADICTION_VERSION),
      severity: z.literal(PROPOSAL_FINDING_SEVERITY_VERSION),
      evaluator: z.literal(PROPOSAL_AUDIT_EVALUATOR_VERSION),
    }),
    sections: z.array(proposalSectionSchema),
    claims: z.array(proposalClaimSchema),
    claimAssessments: z.array(proposalClaimAssessmentSchema),
    coverage: z.array(proposalCoverageAssessmentSchema),
    findings: z.array(proposalAuditFindingSchema),
    injectionInfluence: z.literal(false),
    machineOnly: z.literal(true),
  })
  .strict();
export type ProposalAuditResult = z.infer<typeof proposalAuditResultSchema>;

export function normalizeProposalText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const HEADING_PATTERN =
  /^(?:[A-Z][A-Z0-9 &/()-]{3,}|(?:\d+(?:\.\d+)*)\s+[A-Z][^.!?]{2,80}|executive summary|technical approach|staffing plan|insurance|pricing|forms and attachments|submission details|certifications|references)$/i;

export function extractProposalSections(rawPages: ProposalPage[]): ProposalSection[] {
  const pages = rawPages.map((page) => proposalPageSchema.parse(page));
  const sections: ProposalSection[] = [];
  for (const page of pages.sort((a, b) => a.pageNumber - b.pageNumber)) {
    const uncertain = page.extractionStatus !== 'ok' || page.warnings.length > 0;
    const lines = page.text.split(/\r?\n/);
    let cursor = 0;
    let activeHeading = `Page ${page.pageNumber}`;
    let activeStart = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const offset = page.text.indexOf(line, cursor);
      const safeOffset = offset >= 0 ? offset : cursor;
      if (trimmed && HEADING_PATTERN.test(trimmed) && safeOffset > activeStart) {
        const text = page.text.slice(activeStart, safeOffset).trim();
        if (text) {
          sections.push({
            stableKey: sha(`${page.pageId}:${activeStart}:${safeOffset}:${activeHeading}`),
            heading: activeHeading,
            normalizedHeading: normalizeProposalText(activeHeading).toLowerCase(),
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            startOffset: activeStart,
            endOffset: safeOffset,
            text,
            parserUncertain: uncertain,
          });
        }
        activeHeading = trimmed;
        activeStart = safeOffset + line.length;
      }
      cursor = safeOffset + line.length + 1;
    }
    const text = page.text.slice(activeStart).trim();
    if (text || page.text.length === 0) {
      sections.push({
        stableKey: sha(`${page.pageId}:${activeStart}:${page.text.length}:${activeHeading}`),
        heading: activeHeading,
        normalizedHeading: normalizeProposalText(activeHeading).toLowerCase(),
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        startOffset: Math.min(activeStart, page.text.length),
        endOffset: page.text.length,
        text,
        parserUncertain: uncertain || page.text.length === 0,
      });
    }
  }
  return sections.map((section) => proposalSectionSchema.parse(section));
}

function classifyClaimType(text: string): z.infer<typeof proposalClaimTypeSchema> {
  if (/procurement|solicitation|rfp\s*(?:no\.?|number|#)|prepared for/i.test(text))
    return 'procurement_identity';
  if (/insurance|liability|per occurrence|aggregate/i.test(text)) return 'insurance_claim';
  if (/deadline|due\b|submit(?:ted)? by|received by/i.test(text)) return 'deadline_statement';
  if (/price|pricing|fee|cost|\$\s*\d/i.test(text)) return 'pricing_statement';
  if (/staff|fte|personnel|project manager|supervisor/i.test(text)) return 'staffing_commitment';
  if (/licensed|certified|accredited|years? of experience/i.test(text)) return 'company_credential';
  if (/we (?:have|maintain|operate|possess|are)|our company|our team/i.test(text))
    return 'company_capability';
  if (/submit|include|attach|complete|sign|acknowledge|attend|provide/i.test(text))
    return 'requirement_response';
  if (/overview|background|describes|for information/i.test(text)) return 'descriptive';
  return 'unknown';
}

function injectionSignals(text: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ['override_instructions', /ignore|override|disregard.{0,20}(?:system|previous|instructions?)/i],
    ['secret_request', /api key|secret|credential|authorization header/i],
    ['self_verify', /mark.{0,20}(?:verified|approved|compliant)/i],
    ['omit_context', /omit|ignore.{0,20}(?:other|remaining).{0,20}pages?/i],
    ['change_output', /change.{0,20}(?:schema|output|format)/i],
    ['tool_request', /use|call|invoke.{0,20}(?:tool|browser|database|email|mcp)/i],
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

export function segmentProposalClaims(sections: ProposalSection[]): ProposalClaim[] {
  const claims: ProposalClaim[] = [];
  for (const rawSection of sections) {
    const section = proposalSectionSchema.parse(rawSection);
    if (!section.text.trim()) continue;
    const pattern = /[^.!?\n]+(?:[.!?]+|$)/g;
    for (const match of section.text.matchAll(pattern)) {
      const raw = match[0];
      const text = raw.trim();
      if (text.length < 4) continue;
      const localLeading = raw.indexOf(text);
      const startOffset = section.startOffset + (match.index ?? 0) + Math.max(0, localLeading);
      const endOffset = startOffset + text.length;
      const normalizedText = normalizeProposalText(text);
      claims.push(
        proposalClaimSchema.parse({
          stableKey: sha(`${section.stableKey}:${startOffset}:${normalizedText}`),
          sectionStableKey: section.stableKey,
          claimType: classifyClaimType(text),
          text,
          normalizedText,
          pageId: section.pageId,
          pageNumber: section.pageNumber,
          startOffset,
          endOffset,
          parserUncertain: section.parserUncertain,
          injectionSignals: injectionSignals(text),
        }),
      );
    }
  }
  return claims;
}

function tokens(value: string): Set<string> {
  const stop = new Set([
    'the',
    'and',
    'that',
    'with',
    'from',
    'this',
    'will',
    'shall',
    'must',
    'proposal',
    'offeror',
    'bidder',
    'required',
    'requirement',
    'provide',
    'include',
  ]);
  return new Set(
    normalizeProposalText(value)
      .toLowerCase()
      .split(/[^a-z0-9$.-]+/)
      .filter((token) => token.length > 2 && !stop.has(token)),
  );
}

function explicitIdentifiers(value: string): string[] {
  return [
    ...value.matchAll(
      /\b(?:form|attachment|exhibit|schedule|rfp)\s*(?:no\.?|number|#)?\s*[a-z0-9][a-z0-9.-]*/gi,
    ),
  ].map((match) => normalizeProposalText(match[0]).toLowerCase());
}

function matchScore(claim: ProposalClaim, requirement: ProposalAuditRequirement): number {
  const claimTokens = tokens(claim.text);
  const requirementTokens = tokens(`${requirement.title} ${requirement.obligation}`);
  const overlap = [...claimTokens].filter((token) => requirementTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(claimTokens.size, requirementTokens.size));
  let score = overlap / denominator;
  const claimIds = explicitIdentifiers(claim.text);
  const requirementIds = explicitIdentifiers(`${requirement.title} ${requirement.obligation}`);
  if (claimIds.some((identifier) => requirementIds.includes(identifier)))
    score = Math.max(score, 0.95);
  const categorySignals: Record<string, RegExp> = {
    mandatory_form: /form|attachment|schedule/,
    submission_deadline: /deadline|due|submit|received/,
    question_deadline: /question|inquir/,
    insurance: /insurance|liability|coverage/,
    meeting: /meeting|conference|site visit/,
    staffing_plan: /staff|fte|personnel/,
    signature: /sign|signature/,
    electronic_submission: /portal|electronic|upload/,
  };
  if (categorySignals[requirement.category]?.test(claim.normalizedText.toLowerCase()))
    score += 0.12;
  if (
    requirement.category === 'electronic_submission' &&
    /email|portal|electronic|upload/i.test(claim.text)
  )
    score = Math.max(score, 0.55);
  return Math.min(1, score);
}

function inferDateRole(text: string): string {
  if (/question|inquir/i.test(text)) return 'question_deadline';
  if (/meeting|conference|site visit/i.test(text)) return 'meeting_date';
  if (/submission|proposal|response|bid/i.test(text)) return 'submission_deadline';
  return 'date';
}

function inferScope(text: string): string | null {
  return (
    text.match(/\b(?:north|south|east|west) campus\b/i)?.[0]?.toLowerCase() ??
    text.match(/\b(?:per occurrence|aggregate)\b/i)?.[0]?.toLowerCase() ??
    text
      .match(/\b(?:project manager|site supervisor|security officers?|fte(?:s)?)\b/i)?.[0]
      ?.toLowerCase() ??
    null
  );
}

export function extractProposalFacts(text: string): ProposalExtractedFact[] {
  const facts: ProposalExtractedFact[] = [];
  for (const match of text.matchAll(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s+[A-Z]{2,4})?)?/gi,
  )) {
    const months: Record<string, string> = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    };
    const pieces = match[0].match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(.*)/)!;
    facts.push({
      kind: 'date',
      role: inferDateRole(text),
      raw: match[0],
      normalized: `${pieces[3]}-${months[pieces[1]!.toLowerCase()]}-${String(Number(pieces[2])).padStart(2, '0')}${normalizeProposalText(pieces[4] ?? '')}`,
      unit: null,
      operator: /no later than|by\b/i.test(text) ? 'maximum' : 'equal',
      scope: inferScope(text),
      ambiguous: false,
    });
  }
  for (const match of text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g))
    facts.push({
      kind: 'date',
      role: inferDateRole(text),
      raw: match[0],
      normalized: match[0],
      unit: null,
      operator: 'unknown',
      scope: inferScope(text),
      ambiguous: true,
    });
  for (const match of text.matchAll(/\$\s*\d[\d,]*(?:\.\d+)?\s*(?:million|m\b|thousand|k\b)?/gi)) {
    const raw = match[0];
    const numeric = Number(raw.replace(/[$,\s]|million|thousand|m\b|k\b/gi, ''));
    const scale = /million|m\b/i.test(raw) ? 1_000_000 : /thousand|k\b/i.test(raw) ? 1_000 : 1;
    facts.push({
      kind: 'currency',
      role: /aggregate/i.test(text)
        ? 'insurance_aggregate'
        : /insurance|liability|per occurrence/i.test(text)
          ? 'insurance_per_occurrence'
          : 'pricing_amount',
      raw,
      normalized: String(numeric * scale),
      unit: 'USD',
      operator: /at least|minimum|no less than/i.test(text)
        ? 'minimum'
        : /at most|maximum|no more than/i.test(text)
          ? 'maximum'
          : 'equal',
      scope: inferScope(text),
      ambiguous: false,
    });
  }
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?\s*(?:%|percent)\b/gi))
    facts.push({
      kind: 'percentage',
      role: 'percentage',
      raw: match[0],
      normalized: String(Number(match[0].replace(/%|percent|\s/gi, ''))),
      unit: 'percent',
      operator: /at least|minimum/i.test(text) ? 'minimum' : 'equal',
      scope: inferScope(text),
      ambiguous: false,
    });
  for (const match of text.matchAll(
    /\b\d+\s*(?:FTEs?|full[- ]time equivalents?|years? of experience|copies)\b/gi,
  ))
    facts.push({
      kind: 'quantity',
      role: /fte|full/i.test(match[0])
        ? 'staffing_minimum'
        : /years/i.test(match[0])
          ? 'experience_minimum'
          : 'copy_count',
      raw: match[0],
      normalized: match[0].match(/\d+/)![0],
      unit: /fte|full/i.test(match[0]) ? 'FTE' : /years/i.test(match[0]) ? 'years' : 'copies',
      operator: /at least|minimum/i.test(text) ? 'minimum' : 'equal',
      scope: inferScope(text),
      ambiguous: false,
    });
  for (const id of explicitIdentifiers(text))
    facts.push({
      kind: 'form_identifier',
      role: 'form_identifier',
      raw: id,
      normalized: id,
      unit: null,
      operator: 'equal',
      scope: null,
      ambiguous: false,
    });
  return facts.map((fact) => extractedFactSchema.parse(fact));
}

function compareFacts(
  candidate: ProposalExtractedFact[],
  source: ProposalExtractedFact[],
): {
  status: z.infer<typeof consistencyStatusSchema>;
  reason: string;
} {
  const material = candidate.filter((fact) => fact.kind !== 'form_identifier' && !fact.ambiguous);
  if (candidate.some((fact) => fact.ambiguous))
    return { status: 'undetermined', reason: 'ambiguous_typed_fact' };
  if (!material.length) return { status: 'not_applicable', reason: 'no_material_typed_fact' };
  for (const fact of material) {
    const comparable = source.filter(
      (other) =>
        other.kind === fact.kind &&
        other.role === fact.role &&
        (!fact.scope || !other.scope || fact.scope === other.scope),
    );
    if (!comparable.length) return { status: 'undetermined', reason: `no_comparable_${fact.role}` };
    if (
      !comparable.some(
        (other) =>
          other.normalized === fact.normalized &&
          other.unit === fact.unit &&
          other.operator === fact.operator,
      )
    )
      return { status: 'inconsistent', reason: `mismatch_${fact.role}` };
  }
  return { status: 'consistent', reason: 'all_comparable_facts_match' };
}

function semanticOpposition(claim: string, requirement: string): string | null {
  const left = normalizeProposalText(claim).toLowerCase();
  const right = normalizeProposalText(requirement).toLowerCase();
  if (/email/.test(left) && /portal/.test(right) && /only|must/.test(right))
    return 'email_conflicts_with_portal_only_submission';
  if (/hard cop|paper|physical/.test(left) && /electronic|portal/.test(right) && /only/.test(right))
    return 'physical_delivery_conflicts_with_electronic_only_submission';
  if (
    /no (?:meeting|conference|site visit).{0,20}(?:required|necessary)/.test(left) &&
    /mandatory|required/.test(right) &&
    /meeting|conference|site visit/.test(right)
  )
    return 'claim_denies_required_meeting';
  if (/will not|does not|is not required/.test(left)) {
    const shared = [...tokens(left)].filter((token) => tokens(right).has(token));
    if (shared.length >= 2) return 'claim_explicitly_denies_requirement';
  }
  return null;
}

function missingMaterialTerms(claim: string, requirement: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ['signature', /\bsign(?:ed|ature|atures|ing)?\b/i],
    ['initials', /\binitial(?:s|ed|ing)?\b/i],
    ['resume', /\bresumes?\b/i],
    ['attachment', /\battachment\b/i],
    ['addendum_acknowledgment', /addendum.{0,24}acknowledg/i],
    ['disqualification_consequence', /disqualif|nonresponsive|rejected/i],
    ['packaging', /sealed|packag|envelope/i],
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(requirement) && !pattern.test(claim))
    .map(([name]) => name);
}

function findingSeverity(type: z.infer<typeof proposalFindingTypeSchema>, mandatory = false) {
  if (['date_mismatch', 'numerical_mismatch', 'wrong_procurement_identity'].includes(type))
    return 'critical' as const;
  if (
    [
      'missing_required_response',
      'contradicted_claim',
      'parser_uncertainty',
      'unresolved_source_requirement',
    ].includes(type)
  )
    return mandatory ? ('blocking' as const) : ('warning' as const);
  if (['unsupported_claim', 'partial_required_response', 'human_proof_required'].includes(type))
    return 'warning' as const;
  return 'informational' as const;
}

function makeFinding(
  input: Omit<
    ProposalAuditFinding,
    'stableKey' | 'machineOnly' | 'humanResolutionStatus' | 'workflowStatus' | 'ruleVersion'
  > & { ruleVersion?: string },
): ProposalAuditFinding {
  const ruleVersion = input.ruleVersion ?? PROPOSAL_SUPPORT_POLICY_VERSION;
  return proposalAuditFindingSchema.parse({
    ...input,
    stableKey: sha(
      [input.type, input.checklistItemId, input.claimStableKey, input.detail, ruleVersion].join(
        ':',
      ),
    ),
    machineOnly: true,
    humanResolutionStatus: 'pending',
    workflowStatus: 'open',
    ruleVersion,
  });
}

function requirementApplicability(requirement: ProposalAuditRequirement): {
  eligible: boolean;
  reason: string;
  unresolved: boolean;
} {
  if (requirement.lifecycleStatus !== 'active')
    return { eligible: false, reason: 'obsolete_checklist_item', unresolved: false };
  if (
    requirement.eligibilityClass === 'ordinary_active' &&
    requirement.sourceSupportStatus === 'supported' &&
    requirement.precedenceStatus === 'active'
  )
    return { eligible: true, reason: 'active_ordinary_requirement', unresolved: false };
  if (
    requirement.eligibilityClass === 'review_needed' ||
    requirement.eligibilityClass === 'unresolved_risk'
  )
    return { eligible: false, reason: 'upstream_requirement_unresolved', unresolved: true };
  return { eligible: false, reason: 'upstream_requirement_excluded', unresolved: false };
}

export function auditProposalDraft(input: {
  workspaceId: string;
  proposalDocumentId: string;
  proposalDocumentSha256: string;
  proposalIdentity: { procurementName: string; procurementNumber: string; customer: string };
  pages: ProposalPage[];
  requirements: ProposalAuditRequirement[];
  companyEvidence?: ProposalCompanyEvidence[];
}): ProposalAuditResult {
  uuid.parse(input.workspaceId);
  uuid.parse(input.proposalDocumentId);
  hash.parse(input.proposalDocumentSha256);
  const pages = input.pages.map((page) => proposalPageSchema.parse(page));
  const requirements = input.requirements.map((requirement) =>
    proposalAuditRequirementSchema.parse(requirement),
  );
  const evidence = (input.companyEvidence ?? []).map((item) =>
    proposalCompanyEvidenceSchema.parse(item),
  );
  if (
    pages.some((page) => page.workspaceId !== input.workspaceId) ||
    requirements.some((item) => item.workspaceId !== input.workspaceId) ||
    evidence.some((item) => item.workspaceId !== input.workspaceId)
  )
    throw new Error('cross_workspace_proposal_audit_input');
  const sections = extractProposalSections(pages);
  const claims = segmentProposalClaims(sections);
  const assessments: ProposalClaimAssessment[] = [];
  const findings: ProposalAuditFinding[] = [];
  const matchedByRequirement = new Map<string, ProposalClaim[]>();
  for (const claim of claims) {
    if (claim.injectionSignals.length)
      findings.push(
        makeFinding({
          type: 'prompt_injection_attempt',
          severity: 'informational',
          title: 'Untrusted document instruction detected',
          detail: `Ignored hostile instruction signals: ${claim.injectionSignals.join(', ')}`,
          checklistItemId: null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: null,
          sourcePageId: null,
          sourcePageNumber: null,
          sourceQuote: null,
        }),
      );
    let best: { requirement: ProposalAuditRequirement; score: number } | null = null;
    for (const requirement of requirements) {
      const score = matchScore(claim, requirement);
      if (!best || score > best.score) best = { requirement, score };
    }
    const requirement = best && best.score >= 0.34 ? best.requirement : null;
    if (requirement)
      matchedByRequirement.set(requirement.checklistItemId, [
        ...(matchedByRequirement.get(requirement.checklistItemId) ?? []),
        claim,
      ]);
    const proposalFacts = extractProposalFacts(claim.text);
    const requirementFacts = requirement
      ? extractProposalFacts(
          `${requirement.title}. ${requirement.obligation}. ${requirement.exactQuote}`,
        )
      : [];
    const comparison = compareFacts(proposalFacts, requirementFacts);
    let supportStatus: z.infer<typeof claimSupportStatusSchema> = 'unsupported';
    let rationale = 'no permitted supporting evidence';
    const evidenceIds: string[] = [];
    if (claim.parserUncertain) {
      supportStatus = 'parser_uncertain';
      rationale = 'proposal page parsing is uncertain';
    } else if (requirement) {
      const applicability = requirementApplicability(requirement);
      const opposition = semanticOpposition(
        claim.text,
        `${requirement.title}. ${requirement.obligation}. ${requirement.exactQuote}`,
      );
      const omitted = missingMaterialTerms(
        claim.text,
        `${requirement.title}. ${requirement.obligation}. ${requirement.exactQuote}`,
      );
      if (comparison.status === 'inconsistent') {
        supportStatus = 'contradicted';
        rationale = comparison.reason;
      } else if (opposition) {
        supportStatus = 'contradicted';
        rationale = opposition;
      } else if (!applicability.eligible) {
        supportStatus = applicability.unresolved ? 'partially_supported' : 'unsupported';
        rationale = applicability.reason;
      } else if (
        ['company_capability', 'company_credential'].includes(claim.claimType) ||
        requirement.proofRequirement !== 'none_identified'
      ) {
        const matchingEvidence = evidence.filter(
          (item) =>
            item.reviewed &&
            tokens(item.text).size > 0 &&
            [...tokens(claim.text)].filter((token) => tokens(item.text).has(token)).length >= 2,
        );
        if (matchingEvidence.length) {
          supportStatus = 'supported';
          rationale = 'reviewed workspace company evidence supports the claim';
          evidenceIds.push(...matchingEvidence.map((item) => item.id));
        } else {
          supportStatus = 'requires_human_proof';
          rationale = 'company assertion requires separate reviewed proof';
        }
      } else if (omitted.length) {
        supportStatus = 'partially_supported';
        rationale = `material terms omitted: ${omitted.join(', ')}`;
        evidenceIds.push(requirement.evidenceId);
      } else {
        supportStatus = 'supported';
        rationale = 'active verified requirement supports this response commitment';
        evidenceIds.push(requirement.evidenceId);
      }
    }
    const normalized = claim.normalizedText.toLowerCase();
    const expectedIdentity = [
      input.proposalIdentity.procurementName,
      input.proposalIdentity.procurementNumber,
      input.proposalIdentity.customer,
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    const requiredIdentityParts = [
      input.proposalIdentity.procurementNumber,
      input.proposalIdentity.customer,
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    if (
      claim.claimType === 'procurement_identity' &&
      requiredIdentityParts.length > 0 &&
      requiredIdentityParts.every((value) => normalized.includes(value))
    ) {
      supportStatus = 'supported';
      rationale = 'proposal identity matches the immutable audit procurement identity';
    }
    if (
      claim.claimType === 'procurement_identity' &&
      /prepared for|rfp|solicitation/i.test(claim.text) &&
      expectedIdentity.every((value) => !normalized.includes(value))
    ) {
      supportStatus = 'contradicted';
      findings.push(
        makeFinding({
          type: 'wrong_procurement_identity',
          severity: 'critical',
          title: 'Proposal references a different procurement',
          detail: 'The proposal identity does not match the workspace procurement identity.',
          checklistItemId: requirement?.checklistItemId ?? null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement?.documentId ?? null,
          sourcePageId: requirement?.pageId ?? null,
          sourcePageNumber: requirement?.pageNumber ?? null,
          sourceQuote: requirement?.exactQuote ?? null,
          ruleVersion: PROPOSAL_CONTRADICTION_VERSION,
        }),
      );
      findings.push(
        makeFinding({
          type: 'copied_procurement_language',
          severity: 'blocking',
          title: 'Possible copied procurement language',
          detail: 'A procurement identity from another solicitation appears in the draft.',
          checklistItemId: null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: null,
          sourcePageId: null,
          sourcePageNumber: null,
          sourceQuote: null,
          ruleVersion: PROPOSAL_CONTRADICTION_VERSION,
        }),
      );
    }
    if (comparison.status === 'inconsistent' && requirement) {
      const type = proposalFacts.some((fact) => fact.kind === 'date')
        ? 'date_mismatch'
        : 'numerical_mismatch';
      findings.push(
        makeFinding({
          type,
          severity: findingSeverity(type, requirement.mandatory),
          title:
            type === 'date_mismatch'
              ? 'Proposal date conflicts with requirement'
              : 'Proposal value conflicts with requirement',
          detail: `Deterministic ${comparison.reason.replaceAll('_', ' ')}.`,
          checklistItemId: requirement.checklistItemId,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement.documentId,
          sourcePageId: requirement.pageId,
          sourcePageNumber: requirement.pageNumber,
          sourceQuote: requirement.exactQuote,
          ruleVersion: PROPOSAL_CONTRADICTION_VERSION,
        }),
      );
    } else if (supportStatus === 'contradicted' && requirement) {
      findings.push(
        makeFinding({
          type: 'contradicted_claim',
          severity: findingSeverity('contradicted_claim', requirement.mandatory),
          title: 'Proposal claim conflicts with the active requirement',
          detail: rationale,
          checklistItemId: requirement.checklistItemId,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement.documentId,
          sourcePageId: requirement.pageId,
          sourcePageNumber: requirement.pageNumber,
          sourceQuote: requirement.exactQuote,
          ruleVersion: PROPOSAL_CONTRADICTION_VERSION,
        }),
      );
    } else if (supportStatus === 'requires_human_proof')
      findings.push(
        makeFinding({
          type: 'human_proof_required',
          severity: 'warning',
          title: 'Company evidence requires human review',
          detail: rationale,
          checklistItemId: requirement?.checklistItemId ?? null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement?.documentId ?? null,
          sourcePageId: requirement?.pageId ?? null,
          sourcePageNumber: requirement?.pageNumber ?? null,
          sourceQuote: requirement?.exactQuote ?? null,
        }),
      );
    else if (supportStatus === 'parser_uncertain')
      findings.push(
        makeFinding({
          type: 'parser_uncertainty',
          severity: 'blocking',
          title: 'Proposal claim cannot be reliably parsed',
          detail: rationale,
          checklistItemId: requirement?.checklistItemId ?? null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement?.documentId ?? null,
          sourcePageId: requirement?.pageId ?? null,
          sourcePageNumber: requirement?.pageNumber ?? null,
          sourceQuote: requirement?.exactQuote ?? null,
        }),
      );
    else if (
      supportStatus === 'unsupported' &&
      claim.claimType !== 'descriptive' &&
      !claim.injectionSignals.length
    )
      findings.push(
        makeFinding({
          type: 'unsupported_claim',
          severity: 'warning',
          title: 'Claim lacks permitted supporting evidence',
          detail: rationale,
          checklistItemId: requirement?.checklistItemId ?? null,
          claimStableKey: claim.stableKey,
          proposalPageId: claim.pageId,
          proposalPageNumber: claim.pageNumber,
          sourceDocumentId: requirement?.documentId ?? null,
          sourcePageId: requirement?.pageId ?? null,
          sourcePageNumber: requirement?.pageNumber ?? null,
          sourceQuote: requirement?.exactQuote ?? null,
        }),
      );
    assessments.push(
      proposalClaimAssessmentSchema.parse({
        claimStableKey: claim.stableKey,
        matchedChecklistItemId: requirement?.checklistItemId ?? null,
        matchScore: best?.score ?? 0,
        matchReason: requirement
          ? 'bounded deterministic requirement match'
          : 'no bounded requirement match',
        supportStatus,
        consistencyStatus: comparison.status,
        rationale,
        proposalFacts,
        requirementFacts,
        evidenceIds,
        machineOnly: true,
        humanResolutionStatus: 'pending',
      }),
    );
  }
  const coverage: ProposalCoverageAssessment[] = [];
  for (const requirement of requirements) {
    const applicability = requirementApplicability(requirement);
    const matches = matchedByRequirement.get(requirement.checklistItemId) ?? [];
    let coverageStatus: z.infer<typeof responseCoverageStatusSchema> = 'not_applicable';
    let reason = applicability.reason;
    if (applicability.unresolved) {
      coverageStatus = 'parser_uncertain';
      reason = 'upstream source state requires human resolution';
      findings.push(
        makeFinding({
          type: 'unresolved_source_requirement',
          severity: findingSeverity('unresolved_source_requirement', requirement.mandatory),
          title: 'Source requirement is unresolved',
          detail: reason,
          checklistItemId: requirement.checklistItemId,
          claimStableKey: null,
          proposalPageId: null,
          proposalPageNumber: null,
          sourceDocumentId: requirement.documentId,
          sourcePageId: requirement.pageId,
          sourcePageNumber: requirement.pageNumber,
          sourceQuote: requirement.exactQuote,
        }),
      );
    } else if (applicability.eligible && !matches.length) {
      coverageStatus = 'missing';
      reason = 'no proposal claim matched the active requirement';
      findings.push(
        makeFinding({
          type: 'missing_required_response',
          severity: findingSeverity('missing_required_response', requirement.mandatory),
          title: `Missing response: ${requirement.title}`,
          detail: reason,
          checklistItemId: requirement.checklistItemId,
          claimStableKey: null,
          proposalPageId: null,
          proposalPageNumber: null,
          sourceDocumentId: requirement.documentId,
          sourcePageId: requirement.pageId,
          sourcePageNumber: requirement.pageNumber,
          sourceQuote: requirement.exactQuote,
        }),
      );
    } else if (applicability.eligible) {
      const linked = assessments.filter(
        (assessment) => assessment.matchedChecklistItemId === requirement.checklistItemId,
      );
      const partial = linked.some((assessment) =>
        ['partially_supported', 'contradicted', 'parser_uncertain'].includes(
          assessment.supportStatus,
        ),
      );
      coverageStatus = partial ? 'partially_addressed' : 'addressed';
      reason = partial
        ? 'matched response contains a material gap or conflict'
        : 'matched atomic response found';
      if (partial)
        findings.push(
          makeFinding({
            type: 'partial_required_response',
            severity: 'warning',
            title: `Partial response: ${requirement.title}`,
            detail: reason,
            checklistItemId: requirement.checklistItemId,
            claimStableKey: matches[0]?.stableKey ?? null,
            proposalPageId: matches[0]?.pageId ?? null,
            proposalPageNumber: matches[0]?.pageNumber ?? null,
            sourceDocumentId: requirement.documentId,
            sourcePageId: requirement.pageId,
            sourcePageNumber: requirement.pageNumber,
            sourceQuote: requirement.exactQuote,
          }),
        );
    }
    coverage.push(
      proposalCoverageAssessmentSchema.parse({
        checklistItemId: requirement.checklistItemId,
        coverageStatus,
        matchedClaimStableKeys: matches.map((claim) => claim.stableKey),
        reason,
        machineOnly: true,
        humanResolutionStatus: 'pending',
      }),
    );
  }
  const inputHash = sha(
    JSON.stringify({
      workspaceId: input.workspaceId,
      proposalDocumentId: input.proposalDocumentId,
      proposalDocumentSha256: input.proposalDocumentSha256,
      pages: pages.map((page) => [page.pageId, page.textSha256, page.extractionStatus]),
      requirements: requirements.map((item) => [
        item.checklistItemId,
        item.findingId,
        item.sourceSupportStatus,
        item.precedenceStatus,
        item.humanReviewStatus,
        item.workflowStatus,
      ]),
      evidence: evidence.map((item) => [item.id, item.reviewed]),
      versions: PROPOSAL_AUDIT_VERSIONS,
    }),
  );
  return proposalAuditResultSchema.parse({
    inputHash,
    versions: PROPOSAL_AUDIT_VERSIONS,
    sections,
    claims,
    claimAssessments: assessments,
    coverage,
    findings,
    injectionInfluence: false,
    machineOnly: true,
  });
}

export const PROPOSAL_FINDING_TRANSITIONS: Record<
  z.infer<typeof proposalFindingWorkflowStatusSchema>,
  readonly z.infer<typeof proposalFindingWorkflowStatusSchema>[]
> = {
  open: ['in_review', 'resolved', 'accepted_risk'],
  in_review: ['open', 'resolved', 'accepted_risk'],
  resolved: ['in_review', 'obsolete'],
  accepted_risk: ['in_review', 'obsolete'],
  obsolete: [],
};

export function assertProposalFindingTransition(
  from: z.infer<typeof proposalFindingWorkflowStatusSchema>,
  to: z.infer<typeof proposalFindingWorkflowStatusSchema>,
): void {
  if (!PROPOSAL_FINDING_TRANSITIONS[from].includes(to))
    throw new Error(`forbidden_proposal_finding_transition:${from}:${to}`);
}

export function compareProposalAuditRevisions(
  prior: ProposalAuditResult,
  current: ProposalAuditResult,
): ProposalAuditFinding[] {
  proposalAuditResultSchema.parse(prior);
  proposalAuditResultSchema.parse(current);
  const currentSignatures = new Set(
    current.findings.map((finding) => `${finding.type}:${finding.checklistItemId ?? ''}`),
  );
  return prior.findings
    .filter(
      (finding) =>
        finding.type !== 'prompt_injection_attempt' &&
        !currentSignatures.has(`${finding.type}:${finding.checklistItemId ?? ''}`),
    )
    .map((finding) =>
      makeFinding({
        type: 'corrected_in_revision',
        severity: 'informational',
        title: `Corrected in revision: ${finding.title}`,
        detail: 'The prior deterministic finding is absent from the current immutable revision.',
        checklistItemId: finding.checklistItemId,
        claimStableKey: null,
        proposalPageId: null,
        proposalPageNumber: null,
        sourceDocumentId: finding.sourceDocumentId,
        sourcePageId: finding.sourcePageId,
        sourcePageNumber: finding.sourcePageNumber,
        sourceQuote: finding.sourceQuote,
        ruleVersion: PROPOSAL_AUDIT_EVALUATOR_VERSION,
      }),
    );
}
