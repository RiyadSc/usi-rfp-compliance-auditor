import { z } from 'zod';
import {
  PHASE9_RECOVERY_VERSION,
  buildPhase9CallPlan,
  buildPhase9PageBlocks,
  classifyPhase9Coverage,
  extractPhase9AmendmentRelationships,
  minePhase9DeterministicCandidates,
  phase9StableHash,
  reducePhase9Candidates,
  type Phase9CallPlan,
  type Phase9SourceBlock,
} from './phase9-recovery';

export const PHASE9_WORKSPACE_PLAN_VERSION = 'phase9-workspace-plan-v1';
export const PHASE9_WORKSPACE_EVALUATOR_VERSION = 'phase9-workspace-evaluator-v1';
export const PHASE9_WORKSPACE_NORMALIZATION_VERSION = 'phase9-workspace-nfkc-v1';
export const PHASE9_WORKSPACE_TABLE_VERSION = 'phase9-workspace-table-v1';

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
  reduction: ReturnType<typeof reducePhase9Candidates>;
  amendmentRelationships: ReturnType<typeof extractPhase9AmendmentRelationships>;
  callPlan: Phase9CallPlan;
};

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
  const reduction = reducePhase9Candidates(minedCandidates);
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
    reduction,
    amendmentRelationships,
    callPlan,
  };
}
