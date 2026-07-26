import { z } from 'zod';
import {
  PHASE9_RECOVERY_VERSION,
  buildPhase9CallPlan,
  buildPhase9PageBlocks,
  classifyPhase9Coverage,
  extractPhase9AmendmentRelationships,
  minePhase9DeterministicCandidates,
  phase9CandidateSeedSchema,
  phase9StableHash,
  reducePhase9Candidates,
  type Phase9CallPlan,
  type Phase9CandidateSeed,
  type Phase9SourceBlock,
} from './phase9-recovery';

export const PHASE9_WORKSPACE_PLAN_VERSION = 'phase9-workspace-plan-v2';
export const PHASE9_WORKSPACE_EVALUATOR_VERSION = 'phase9-workspace-evaluator-v2';
export const PHASE9_WORKSPACE_NORMALIZATION_VERSION = 'phase9-workspace-nfkc-v1';
export const PHASE9_WORKSPACE_TABLE_VERSION = 'phase9-workspace-table-v1';
export const PHASE9_WORKSPACE_REFINEMENT_VERSION = 'phase9-workspace-candidate-refinement-v1';

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const phase9WorkspaceDocumentSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  filename: z.string().min(1).max(500),
  sourceHash: sha256Schema,
  sourceFormat: z.string().min(1).max(40).nullable().default(null),
  documentType: z.string().min(1).max(80),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        text: z.string(),
        parserConfidence: z.number().min(0).max(1).default(1),
        parserState: z
          .enum(['native', 'ocr', 'hybrid', 'partial', 'uncertain', 'failed'])
          .default('native'),
      }),
    )
    .min(1),
});

export type Phase9WorkspaceDocument = z.infer<typeof phase9WorkspaceDocumentSchema>;

export type Phase9WorkspaceProductionPlan = {
  version: typeof PHASE9_WORKSPACE_PLAN_VERSION;
  recoveryVersion: typeof PHASE9_RECOVERY_VERSION;
  workspaceId: string;
  documentSetHash: string;
  sourcePackageHash: string;
  documents: Array<{
    id: string;
    filename: string;
    sourceHash: string;
    sourceFormat: string | null;
    documentType: string;
    pageCount: number;
  }>;
  blocks: Phase9SourceBlock[];
  coverage: ReturnType<typeof classifyPhase9Coverage>;
  minedCandidates: ReturnType<typeof minePhase9DeterministicCandidates>;
  refinement: Phase9WorkspaceCandidateRefinement;
  reduction: ReturnType<typeof reducePhase9Candidates>;
  amendmentRelationships: ReturnType<typeof extractPhase9AmendmentRelationships>;
  callPlan: Phase9CallPlan;
};

export type Phase9WorkspaceCandidateRefinement = {
  version: typeof PHASE9_WORKSPACE_REFINEMENT_VERSION;
  candidates: Phase9CandidateSeed[];
  rejected: Array<{
    candidateId: string;
    reason:
      | 'table_of_contents_or_navigation'
      | 'not_applicable'
      | 'historical_or_descriptive'
      | 'incomplete_fragment'
      | 'no_explicit_obligation';
  }>;
  reclassified: Array<{
    originalCandidateId: string;
    refinedCandidateId: string;
    from: Phase9CandidateSeed['requirementType'];
    to: Phase9CandidateSeed['requirementType'];
  }>;
};

const TOC_OR_NAVIGATION =
  /(?:\.{5,}\s*(?:\d+)?\s*$|^(?:\d+(?:\.\d+){0,3}\s+)?[A-Z][A-Z '&/(),-]{3,}\s+\.{3,})/;
const INCOMPLETE_END =
  /\b(?:the|a|an|of|to|for|with|in|on|by|from|including|following|and|or|out|date|amount|source|using|submit|provide|include|substantiate|complete|attach|identify|specify|describe|list|furnish|deliver|carry|obtain)\s*[:;,]?\s*$/i;
const EXPLICIT_MODAL =
  /\b(?:must|shall|should|is required to|are required to|will be required to)\s+(?:not\s+)?[a-z][a-z-]*/i;
const EXPLICIT_IMPERATIVE =
  /(?:^|[.:]\s+)(?:submit|include|provide|complete|sign|attach|maintain|acknowledge|certify|demonstrate|use)\b/i;
const EXPLICIT_CONSEQUENCE =
  /\bfailure to\s+(?:submit|provide|include|complete|sign|attach|maintain|attend|comply)\b.{0,220}\b(?:may|will|shall)\b/i;
const OPERATIONAL_DEADLINE =
  /(?:\b(?:question|inquir|bid|proposal|response|submission|offer)[a-z ]{0,35}\b(?:due|deadline)\b|\b(?:due|deadline)\b.{0,35}\b(?:question|inquir|bid|proposal|response|submission|offer)\b|\b(?:received|submitted|delivered)\s+(?:on or )?(?:before|by|prior to)\b.{0,100}\b(?:date|time|opening)\b|\bno later than\b|\bwithin\s+(?:\w+\s+)?\(?\d+\)?\s+(?:business |working |calendar )?(?:hours?|days?|weeks?)\b)/i;
const MEETING_LANGUAGE = /\b(?:conference|meeting|site visit|attendance)\b/i;
const LICENSE_LANGUAGE =
  /\blicen[cs](?:e|ed|es|ing)\b|\b(?:valid|detective agency|security)\s+permit\b|\bpermit\s+(?:number|certificate)\b/i;
const SIGNATURE_LANGUAGE =
  /\b(?:signature|must be signed|shall be signed|signed by (?:an?|the) authorized|initial(?:ed|s)?\s+(?:price|change))\b/i;
const FORM_LANGUAGE = /\b(?:form\s+[A-Z0-9][A-Z0-9._-]*|[A-Z][A-Za-z/& -]{2,80}\s+Form)\b/i;

function normalizedCandidateText(candidate: Phase9CandidateSeed): string {
  return candidate.obligationText.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function workspaceRequirementType(
  candidate: Phase9CandidateSeed,
): Phase9CandidateSeed['requirementType'] {
  const text = normalizedCandidateText(candidate);
  if (OPERATIONAL_DEADLINE.test(text)) return 'deadline';
  if (MEETING_LANGUAGE.test(text)) return 'meeting';
  if (
    /\b(?:certificate of insurance|insurance coverage|coverage limit|additional insured|professional liability|malpractice insurance|claims-made coverage|insurance policy)\b/i.test(
      text,
    )
  )
    return 'insurance';
  if (LICENSE_LANGUAGE.test(text)) return 'license';
  if (/\b(?:price|pricing|rate|discount|cost table|prevailing wage)\b/i.test(text))
    return 'pricing';
  if (/\b(?:evaluation|points|score|weight|award criteria)\b/i.test(text)) return 'evaluation';
  if (
    SIGNATURE_LANGUAGE.test(text) ||
    (/\bsignatory page\b/i.test(text) && /\b(?:complete|submit|sign(?:ed)?)\b/i.test(text))
  )
    return 'signature';
  if (/\b(?:certif(?:y|ied|ication)|attest(?:ation)?)\b/i.test(text)) return 'certification';
  if (/\b(?:attachment|resume|organizational chart)\b/i.test(text)) return 'attachment';
  if (
    FORM_LANGUAGE.test(text) &&
    /\b(?:complete|submit|provide|include|attach|required)\b/i.test(text)
  )
    return 'required_form';
  if (/\b(?:staff(?:ing)?|guards?|personnel|resources|supervisor|officer)\b/i.test(text))
    return 'staffing';
  if (/\b(?:submit|submission|deliver|proposal copies|electronic question)\b/i.test(text))
    return 'submission';
  if (/\b(?:proof|evidence|references?|financial statements?)\b/i.test(text)) return 'proof';
  if (/\b(?:contract|term|duration|expire|renewal|performance)\b/i.test(text))
    return 'contract_term';
  return 'other';
}

function rejectionReason(
  candidate: Phase9CandidateSeed,
): Phase9WorkspaceCandidateRefinement['rejected'][number]['reason'] | null {
  const text = normalizedCandidateText(candidate);
  if (TOC_OR_NAVIGATION.test(text)) return 'table_of_contents_or_navigation';
  if (
    /\bnot applicable(?: to this procurement)?\b/i.test(text) &&
    !OPERATIONAL_DEADLINE.test(text) &&
    !EXPLICIT_MODAL.test(text)
  )
    return 'not_applicable';
  if (
    /\b(?:bill|act|statute|law)\b.{0,100}\bwas signed by\b/i.test(text) ||
    /\b(?:background|historical overview|for informational purposes only)\b/i.test(text)
  )
    return 'historical_or_descriptive';
  if (text.length < 24 || /[,;:]\s*$/.test(text) || INCOMPLETE_END.test(text))
    return 'incomplete_fragment';
  if (
    !EXPLICIT_MODAL.test(text) &&
    !EXPLICIT_IMPERATIVE.test(text) &&
    !EXPLICIT_CONSEQUENCE.test(text) &&
    !OPERATIONAL_DEADLINE.test(text) &&
    !(candidate.requirementType === 'meeting' && /\battendance is strongly suggested\b/i.test(text))
  )
    return 'no_explicit_obligation';
  return null;
}

/**
 * Precision layer used only by the jurisdiction-neutral workspace path.
 * FAC115's frozen recovery contract remains unchanged. This layer prevents
 * exact quotation alone from promoting navigation text, descriptive dates,
 * sentence fragments, or keyword-only category matches into findings.
 */
export function refinePhase9WorkspaceCandidates(
  candidates: Phase9CandidateSeed[],
): Phase9WorkspaceCandidateRefinement {
  const accepted: Phase9CandidateSeed[] = [];
  const rejected: Phase9WorkspaceCandidateRefinement['rejected'] = [];
  const reclassified: Phase9WorkspaceCandidateRefinement['reclassified'] = [];
  for (const candidate of candidates) {
    const reason = rejectionReason(candidate);
    if (reason) {
      rejected.push({ candidateId: candidate.id, reason });
      continue;
    }
    const refinedType = workspaceRequirementType(candidate);
    if (refinedType === candidate.requirementType) {
      accepted.push(candidate);
      continue;
    }
    const refinedId = phase9StableHash([
      PHASE9_WORKSPACE_REFINEMENT_VERSION,
      candidate.id,
      refinedType,
    ]);
    accepted.push(
      phase9CandidateSeedSchema.parse({
        ...candidate,
        id: refinedId,
        requirementType: refinedType,
      }),
    );
    reclassified.push({
      originalCandidateId: candidate.id,
      refinedCandidateId: refinedId,
      from: candidate.requirementType,
      to: refinedType,
    });
  }
  return {
    version: PHASE9_WORKSPACE_REFINEMENT_VERSION,
    candidates: accepted,
    rejected,
    reclassified,
  };
}

/**
 * State- and agency-neutral Phase 9 preparation. It consumes only explicitly
 * selected, already parsed workspace documents. No expected-answer material,
 * jurisdiction dictionary, or fixture identifier is accepted by this API.
 */
export function buildPhase9WorkspaceProductionPlan(input: {
  workspaceId: string;
  documents: Phase9WorkspaceDocument[];
  cachedKeys?: Set<string>;
}): Phase9WorkspaceProductionPlan {
  const documents = z
    .array(phase9WorkspaceDocumentSchema)
    .min(1)
    .max(40)
    .parse(input.documents)
    .map((document) => ({
      ...document,
      pages: document.pages
        .map((page) => ({
          ...page,
          // PostgreSQL text and JSON reject U+0000. Removing only that invalid
          // control character preserves page numbering and all visible text.
          text: page.text.replace(/\u0000/g, '').normalize('NFKC'),
        }))
        .sort((left, right) => left.pageNumber - right.pageNumber),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (documents.some((document) => document.workspaceId !== input.workspaceId)) {
    throw new Error('phase9_workspace_plan_cross_workspace_document');
  }
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new Error('phase9_workspace_plan_duplicate_document');
  }

  const documentSetHash = phase9StableHash(
    documents.map((document) => ({
      id: document.id,
      sourceHash: document.sourceHash,
      pageHashes: document.pages.map((page) =>
        phase9StableHash([page.pageNumber, page.text, page.parserState, page.parserConfidence]),
      ),
    })),
  );
  const sourcePackageHash = phase9StableHash({
    version: PHASE9_WORKSPACE_PLAN_VERSION,
    workspaceId: input.workspaceId,
    documentSetHash,
  });
  const blocks = documents.flatMap((document) =>
    buildPhase9PageBlocks({
      workspaceId: input.workspaceId,
      documentId: document.id,
      documentName: document.filename,
      sourceHash: document.sourceHash,
      pages: document.pages,
    }),
  );
  const coverage = classifyPhase9Coverage(blocks);
  if (coverage.length !== blocks.length) throw new Error('phase9_workspace_plan_coverage_gap');
  const minedCandidates = minePhase9DeterministicCandidates(blocks, coverage);
  const refinement = refinePhase9WorkspaceCandidates(minedCandidates);
  const reduction = reducePhase9Candidates(refinement.candidates);
  const amendmentRelationships = extractPhase9AmendmentRelationships(
    documents
      .flatMap((document) =>
        document.pages.map(
          (page) => `Document: ${document.filename}; page ${page.pageNumber}\n${page.text}`,
        ),
      )
      .join('\n\n'),
  );
  const callPlan = buildPhase9CallPlan({
    workspaceId: input.workspaceId,
    sourcePackageHash,
    parserVersion: PHASE9_WORKSPACE_PLAN_VERSION,
    normalizationVersion: PHASE9_WORKSPACE_NORMALIZATION_VERSION,
    tableVersion: PHASE9_WORKSPACE_TABLE_VERSION,
    evaluatorVersion: PHASE9_WORKSPACE_EVALUATOR_VERSION,
    blocks,
    coverage,
    candidates: reduction.candidates,
    ...(input.cachedKeys ? { cachedKeys: input.cachedKeys } : {}),
  });

  return {
    version: PHASE9_WORKSPACE_PLAN_VERSION,
    recoveryVersion: PHASE9_RECOVERY_VERSION,
    workspaceId: input.workspaceId,
    documentSetHash,
    sourcePackageHash,
    documents: documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      sourceHash: document.sourceHash,
      sourceFormat: document.sourceFormat,
      documentType: document.documentType,
      pageCount: document.pages.length,
    })),
    blocks,
    coverage,
    minedCandidates,
    refinement,
    reduction,
    amendmentRelationships,
    callPlan,
  };
}
