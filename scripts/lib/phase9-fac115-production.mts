/**
 * Production-side FAC115 Phase 9 source preparation.
 *
 * This module deliberately has no expected-answer input and never reads an
 * evaluator artifact. It is safe to use for a fresh extraction plan.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  NORMALIZATION_VERSION,
  TABLE_MODEL_VERSION,
} from '../../packages/documents/src/normalized.ts';
import { XlsxParserAdapter } from '../../packages/documents/src/parser/adapters.ts';
import { PdfJsParserAdapter } from '../../packages/documents/src/parser/pdfjs-adapter.ts';
import {
  PHASE9_RECOVERY_VERSION,
  buildPhase9CallPlan,
  buildPhase9PageBlocks,
  classifyPhase9Coverage,
  extractPhase9AmendmentRelationships,
  minePhase9DeterministicCandidates,
  officialPortalHtmlToText,
  phase9SourceBlockSchema,
  phase9StableHash,
  reducePhase9Candidates,
  type Phase9SourceBlock,
} from '../../packages/ai/src/index.ts';

export const FAC115_ROOT = resolve(
  'fixtures/public-rfp/massachusetts-fac115-BD-22-1080-OSD03-SRC01-70375',
);
export const FAC115_WORKSPACE_ID = '80000000-0000-4000-8000-000000000100';
export const FAC115_SYNTHETIC_IDENTITY_ID = '922727a8-727b-4b9e-a0ff-6e7f7f43d82c';
export const FAC115_PARSER_VERSION = 'fac115-mixed-parser-v1';
export const FAC115_EVALUATOR_VERSION = 'phase9-fac115-evaluator-v2';

const SOURCE = resolve(FAC115_ROOT, 'source');
const RENDITIONS = resolve(FAC115_ROOT, 'renditions/pdf');

export const FAC115_DOCUMENT_IDS: Record<string, string> = {
  'FAC115_Request_for_Response_03.29.2022.pdf': '80000000-0000-4000-8000-000000000001',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.pdf': '80000000-0000-4000-8000-000000000002',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.pdf':
    '80000000-0000-4000-8000-000000000003',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.pdf': '80000000-0000-4000-8000-000000000004',
  'FAC115_Attachment_E_Prompt_Pay_Discount_Form_03.29.2022.pdf':
    '80000000-0000-4000-8000-000000000005',
  'FAC115_Creating_a_Quote_in_COMMBUYS_Job_Aid_03.29.2022.pdf':
    '80000000-0000-4000-8000-000000000006',
  'Intent_to_Bid_Notice_FAC115.pdf': '80000000-0000-4000-8000-000000000007',
  'official-solicitation-page.html': '80000000-0000-4000-8000-000000000008',
  'FAC115_Attachment_A_Bidder_Response_Form_03.29.2022.xlsx':
    '80000000-0000-4000-8000-000000000009',
  'FAC115_Attachment_B_Price_Sheet_Cost_Table_v2_04.08.2022.xlsx':
    '80000000-0000-4000-8000-000000000010',
  'FAC115_Attachment_D_SDP_Form_03.29.2022.xlsx': '80000000-0000-4000-8000-000000000011',
};

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

type SourceManifest = {
  version: string;
  sources: Array<{ file: string; sha256: string; bytes: number }>;
};

type RenditionManifest = {
  version: string;
  renditions: Array<{ file: string; sha256: string; bytes: number; kind: string }>;
};

function spreadsheetBlock(input: {
  documentId: string;
  documentName: string;
  sourceHash: string;
  sheetName: string;
  cellRange: string;
  text: string;
  rowHeader: string | null;
  columnHeader: string | null;
  orderIndex: number;
}): Phase9SourceBlock {
  const boundedRowHeader = input.rowHeader?.slice(0, 500) ?? null;
  const boundedColumnHeader = input.columnHeader?.slice(0, 300) ?? null;
  const contextualText = [
    boundedColumnHeader ? `Column: ${boundedColumnHeader}` : null,
    boundedRowHeader ? `Row: ${boundedRowHeader}` : null,
    `Cell ${input.cellRange}: ${input.text}`,
  ]
    .filter(Boolean)
    .join(' | ');
  return phase9SourceBlockSchema.parse({
    id: phase9StableHash([
      PHASE9_RECOVERY_VERSION,
      input.documentId,
      input.sheetName,
      input.cellRange,
      contextualText,
    ]),
    workspaceId: FAC115_WORKSPACE_ID,
    documentId: input.documentId,
    documentName: input.documentName,
    sourceHash: input.sourceHash,
    blockType: 'spreadsheet_cell',
    pageNumber: null,
    sheetName: input.sheetName,
    cellRange: input.cellRange,
    headingPath: [input.sheetName],
    tableHeaders: boundedColumnHeader ? [boundedColumnHeader] : [],
    rowHeader: boundedRowHeader,
    columnHeader: boundedColumnHeader,
    text: contextualText.slice(0, 4000),
    parserConfidence: 1,
    parserState: 'native',
    orderIndex: input.orderIndex,
  });
}

export async function buildFac115Phase9ProductionPlan(options?: {
  includeCallPlan?: boolean;
  cachedKeys?: Set<string>;
}) {
  const sourceManifest = JSON.parse(
    await readFile(resolve(FAC115_ROOT, 'source-manifest.json'), 'utf8'),
  ) as SourceManifest;
  const renditionManifest = JSON.parse(
    await readFile(resolve(FAC115_ROOT, 'renditions/rendition-manifest.json'), 'utf8'),
  ) as RenditionManifest;

  const sourceFiles = (await readdir(SOURCE)).sort();
  const expectedSourceFiles = sourceManifest.sources.map((item) => item.file).sort();
  if (sourceFiles.join('|') !== expectedSourceFiles.join('|'))
    throw new Error('phase9_fac115_source_set_drift');

  const sourceChecks = [];
  for (const source of sourceManifest.sources) {
    const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
    const actualHash = sha256(bytes);
    sourceChecks.push({
      file: source.file,
      expectedHash: source.sha256,
      actualHash,
      expectedBytes: source.bytes,
      actualBytes: bytes.byteLength,
      valid: source.sha256 === actualHash && source.bytes === bytes.byteLength,
    });
  }
  if (!sourceChecks.every((item) => item.valid)) throw new Error('phase9_fac115_source_hash_drift');

  const blocks: Phase9SourceBlock[] = [];
  const renditionChecks = [];
  const pdfParser = new PdfJsParserAdapter();
  for (const rendition of renditionManifest.renditions) {
    const bytes = new Uint8Array(await readFile(resolve(RENDITIONS, rendition.file)));
    const actualHash = sha256(bytes);
    if (actualHash !== rendition.sha256 || bytes.byteLength !== rendition.bytes)
      throw new Error(`phase9_fac115_rendition_drift:${rendition.file}`);
    const parsed = await pdfParser.parse(bytes, { maxPages: 200, timeoutMs: 120_000 });
    const documentId = FAC115_DOCUMENT_IDS[rendition.file];
    if (!documentId) throw new Error(`phase9_fac115_unknown_rendition:${rendition.file}`);
    blocks.push(
      ...buildPhase9PageBlocks({
        workspaceId: FAC115_WORKSPACE_ID,
        documentId,
        documentName: rendition.file,
        sourceHash: actualHash,
        pages: parsed.pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          parserConfidence: page.confidence,
          parserState: page.parserState,
        })),
      }),
    );
    renditionChecks.push({
      file: rendition.file,
      hash: actualHash,
      pages: parsed.pages.length,
      warnings: parsed.warnings.map((warning) => warning.code),
    });
  }

  const portalFile = 'official-solicitation-page.html';
  const portalBytes = new Uint8Array(await readFile(resolve(SOURCE, portalFile)));
  const portalText = officialPortalHtmlToText(new TextDecoder().decode(portalBytes));
  const amendmentRelationships = extractPhase9AmendmentRelationships(portalText);
  blocks.push(
    ...buildPhase9PageBlocks({
      workspaceId: FAC115_WORKSPACE_ID,
      documentId: FAC115_DOCUMENT_IDS[portalFile]!,
      documentName: portalFile,
      sourceHash: sha256(portalBytes),
      blockType: 'portal',
      windowCharacters: 900,
      overlapCharacters: 300,
      pages: [{ pageNumber: 1, text: portalText, parserConfidence: 1, parserState: 'native' }],
    }),
  );

  const spreadsheetChecks = [];
  for (const source of sourceManifest.sources.filter((item) => item.file.endsWith('.xlsx'))) {
    const documentId = FAC115_DOCUMENT_IDS[source.file];
    if (!documentId) throw new Error(`phase9_fac115_unknown_workbook:${source.file}`);
    const bytes = new Uint8Array(await readFile(resolve(SOURCE, source.file)));
    const parsed = await new XlsxParserAdapter().parse({
      workspaceId: FAC115_WORKSPACE_ID,
      sourceDocumentId: documentId,
      filename: source.file,
      declaredMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
    });
    let populatedCells = 0;
    for (const page of parsed.pages) {
      const cells = page.tables.flatMap((table) => table.cells);
      const nonempty = cells.filter((cell) => cell.normalizedText);
      for (const cell of nonempty) {
        const rowHeader =
          cells
            .filter(
              (candidate) =>
                candidate.rowIndex === cell.rowIndex &&
                candidate.columnIndex < cell.columnIndex &&
                candidate.normalizedText,
            )
            .sort((left, right) => left.columnIndex - right.columnIndex)[0]?.normalizedText ?? null;
        const columnHeader =
          cells
            .filter(
              (candidate) =>
                candidate.columnIndex === cell.columnIndex &&
                candidate.rowIndex < cell.rowIndex &&
                candidate.normalizedText,
            )
            .sort((left, right) => left.rowIndex - right.rowIndex)[0]?.normalizedText ?? null;
        blocks.push(
          spreadsheetBlock({
            documentId,
            documentName: source.file,
            sourceHash: source.sha256,
            sheetName: page.displayedPageLabel ?? 'Sheet',
            cellRange: cell.provenance.cellRange ?? `${cell.rowIndex}:${cell.columnIndex}`,
            text: cell.normalizedText,
            rowHeader,
            columnHeader,
            orderIndex: populatedCells,
          }),
        );
        populatedCells++;
      }
    }
    spreadsheetChecks.push({
      file: source.file,
      sourceHash: source.sha256,
      contentHash: parsed.contentHash,
      populatedCells,
      parserVersion: parsed.parserVersion,
    });
  }

  const coverageStartedAt = performance.now();
  const coverage = classifyPhase9Coverage(blocks);
  const coverageGenerationMs = performance.now() - coverageStartedAt;
  const miningStartedAt = performance.now();
  const mined = minePhase9DeterministicCandidates(blocks, coverage);
  const reduction = reducePhase9Candidates(mined);
  const candidateMiningAndReductionMs = performance.now() - miningStartedAt;
  const sourcePackageHash = phase9StableHash({
    sourceManifestVersion: sourceManifest.version,
    renditionManifestVersion: renditionManifest.version,
    sources: sourceChecks.map((item) => [item.file, item.actualHash, item.actualBytes]),
    renditions: renditionChecks.map((item) => [item.file, item.hash, item.pages]),
  });
  const callPlanStartedAt = performance.now();
  const callPlan =
    options?.includeCallPlan === false
      ? null
      : buildPhase9CallPlan({
          workspaceId: FAC115_WORKSPACE_ID,
          sourcePackageHash,
          parserVersion: FAC115_PARSER_VERSION,
          normalizationVersion: NORMALIZATION_VERSION,
          tableVersion: TABLE_MODEL_VERSION,
          evaluatorVersion: FAC115_EVALUATOR_VERSION,
          blocks,
          coverage,
          candidates: reduction.candidates,
          cachedKeys: options?.cachedKeys,
        });
  const callPlanGenerationMs = performance.now() - callPlanStartedAt;

  return {
    version: PHASE9_RECOVERY_VERSION,
    workspaceId: FAC115_WORKSPACE_ID,
    sourcePackageHash,
    sourceChecks,
    renditionChecks,
    spreadsheetChecks,
    amendmentRelationships,
    blocks,
    coverage,
    minedCandidates: mined,
    reduction,
    callPlan,
    timings: {
      coverageGenerationMs: Number(coverageGenerationMs.toFixed(3)),
      candidateMiningAndReductionMs: Number(candidateMiningAndReductionMs.toFixed(3)),
      callPlanGenerationMs: Number(callPlanGenerationMs.toFixed(3)),
    },
  };
}
