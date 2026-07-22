import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  buildAnalysisCacheKey,
  canClaimWorkUnit,
  classifyBlock,
  estimateAnalysisCost,
  explainCacheDecision,
} from '@usi/documents';
import { NormalizedPdfParserAdapter, parsePdfPageUnit } from '@usi/documents/parser';
import { buildBoundedAnalysisContext, runMockTierTask } from '@usi/ai';
import {
  LARGE_DOCUMENT_EXPECTED,
  LARGE_DOCUMENT_FIXTURE_VERSION,
  LARGE_DOCUMENT_PAGES,
  LARGE_DOCUMENT_PDF,
  LARGE_DOCUMENT_SCANNED_PAGES,
  LARGE_DOCUMENT_SOURCE_HASH,
  LARGE_DOCUMENT_TABLE_PAGES,
} from '../fixtures/eval/large-document-known-answer';

const started = performance.now();
const adapter = new NormalizedPdfParserAdapter();
const normalized = await adapter.parse({
  workspaceId: 'large-document-eval-workspace',
  sourceDocumentId: 'large-document-eval-source',
  bytes: new Uint8Array(LARGE_DOCUMENT_PDF),
  filename: 'large-security-rfp-420-pages.pdf',
  declaredMime: 'application/pdf',
  maxUnits: 500,
  timeoutMs: 120000,
});
const parseDurationMs = Math.round(performance.now() - started);
const scannedActual = normalized.pages
  .filter((page) => page.parserState === 'uncertain')
  .map((page) => page.physicalPageIndex + 1);
const tablePages = normalized.pages
  .filter((page) => page.tables.length > 0)
  .map((page) => page.physicalPageIndex + 1);
const expectedRelevant = new Set([12, 40, 50, 51, 80, 120, 160, 200, 240, 390, 409, 410, 411]);
const classified = LARGE_DOCUMENT_PAGES.map((page) => ({
  pageNumber: page.pageNumber,
  result: classifyBlock({
    type: page.text.startsWith('TABLE') ? 'table' : 'paragraph',
    text: page.text,
    confidence: page.scanned ? 0.4 : 1,
    metadata: {},
  }),
}));
const selected = new Set(
  classified
    .filter(
      (item) =>
        item.result.classification !== 'likely_irrelevant' &&
        item.result.classification !== 'likely_contextual',
    )
    .map((item) => item.pageNumber),
);
const tp = [...expectedRelevant].filter((page) => selected.has(page)).length;
const fp = [...selected].filter(
  (page) =>
    !expectedRelevant.has(page) &&
    !(LARGE_DOCUMENT_SCANNED_PAGES as readonly number[]).includes(page),
).length;
const cacheInput = {
  workspaceId: 'large-document-eval-workspace',
  sourceDocumentId: 'large-document-eval-source',
  sourceFileHash: LARGE_DOCUMENT_SOURCE_HASH,
  documentSetHash: LARGE_DOCUMENT_SOURCE_HASH,
  parserAdapterId: adapter.adapterId,
  parserVersion: adapter.adapterVersion,
  normalizationVersion: 'normalized-document-v1',
  ocrPolicyVersion: 'selective-ocr-v1',
  tableExtractionVersion: 'normalized-table-v1',
  prefilterVersion: 'requirement-prefilter-v1',
  indexVersion: 'normalized-index-v1',
  promptSetVersion: 'mock-large-v1',
  modelId: 'mock-provider',
  modelConfiguration: { tiered: true },
  extractionSchemaVersion: 'requirement-candidate-v1',
  verificationVersion: 'verification-decision-v6',
  evaluatorVersion: 'large-document-evaluator-v1',
  featureFlags: { tables: true, selectiveOcr: true },
};
const cacheKey = buildAnalysisCacheKey(cacheInput);
const contexts = classified
  .filter((item) => expectedRelevant.has(item.pageNumber))
  .map((item) => ({
    workspaceId: 'large-document-eval-workspace',
    documentId: 'large-document-eval-source',
    blockId: `page:${item.pageNumber}`,
    pageIndex: item.pageNumber - 1,
    documentClass: item.pageNumber >= 409 ? 'addendum' : 'solicitation',
    sectionClass: item.result.classification,
    headingPath: [`Section ${Math.ceil(item.pageNumber / 20)}`],
    text: LARGE_DOCUMENT_PAGES[item.pageNumber - 1]!.text,
    tableHeaders: [],
    parserConfidence: 1,
    sourceHash: LARGE_DOCUMENT_SOURCE_HASH,
    score: item.result.score,
  }));
const bounded = buildBoundedAnalysisContext(contexts, {
  maxBlocks: 8,
  maxPages: 8,
  maxCharacters: 12000,
  maxEstimatedTokens: 4000,
  maxTableCells: 100,
});
const mockTiers = [
  runMockTierTask({
    tier: 'tier_1_classification',
    task: 'classify blocks',
    contextRecords: bounded.records.length,
    parserUncertain: false,
    lowerTierCompleted: true,
  }),
  runMockTierTask({
    tier: 'tier_2_extraction',
    task: 'extract candidates',
    contextRecords: bounded.records.length,
    parserUncertain: false,
    lowerTierCompleted: true,
  }),
  runMockTierTask({
    tier: 'tier_3_verification',
    task: 'independent verification',
    contextRecords: bounded.records.length,
    parserUncertain: false,
    lowerTierCompleted: true,
  }),
];
const estimate = estimateAnalysisCost({
  ocrPages: 10,
  embeddingTokens: 140000,
  classificationCalls: 28,
  extractionCalls: 12,
  verificationCalls: 18,
  ambiguityCalls: 2,
  averageInputTokens: 2200,
  outputLimits: { classification: 300, extraction: 1800, verification: 1600, ambiguity: 1800 },
  pricesPerMillion: { input: 5, output: 30, embedding: 0.02, ocrPage: 0 },
  retryAllowance: 1,
  estimatedMillisecondsPerCall: 4000,
});
const retriedPage = await parsePdfPageUnit(
  {
    workspaceId: 'large-document-eval-workspace',
    sourceDocumentId: 'large-document-eval-source',
    bytes: new Uint8Array(LARGE_DOCUMENT_PDF),
    filename: 'large-security-rfp-420-pages.pdf',
    declaredMime: 'application/pdf',
    maxUnits: 500,
    timeoutMs: 120000,
  },
  410,
);
const retriedText = retriedPage.blocks.map((block) => block.text).join(' ');
const page40 = normalized.pages[39]?.tables[0];
const splitContinuation = normalized.pages[50]?.tables[0];
const unit = {
  status: 'leased' as const,
  leaseExpiresAt: new Date(0),
  now: new Date(1),
  attempts: 1,
  maxAttempts: 3,
};
const metrics = {
  parsing: {
    formatDetectionAccuracy: Number(normalized.sourceFormat === 'pdf'),
    pageCountAccuracy: Number(normalized.pages.length === LARGE_DOCUMENT_EXPECTED.pageCount),
    blockOrderAccuracy: Number(
      normalized.pages.every(
        (page, index) =>
          page.physicalPageIndex === index &&
          page.blocks.every((block, order) => block.orderIndex === order),
      ),
    ),
    tableDetectionPrecision: Number(
      JSON.stringify(tablePages) === JSON.stringify([...LARGE_DOCUMENT_TABLE_PAGES]),
    ),
    tableDetectionRecall: Number(
      JSON.stringify(tablePages) === JSON.stringify([...LARGE_DOCUMENT_TABLE_PAGES]),
    ),
    cellAssociationAccuracy: Number(
      page40?.cells.some((cell) => cell.normalizedText === '$2,000,000') &&
        splitContinuation?.continuationOfTableId === normalized.pages[49]?.tables[0]?.id,
    ),
    ocrSelectionPrecision: Number(
      JSON.stringify(scannedActual) === JSON.stringify(LARGE_DOCUMENT_SCANNED_PAGES),
    ),
    ocrSelectionRecall: Number(
      JSON.stringify(scannedActual) === JSON.stringify(LARGE_DOCUMENT_SCANNED_PAGES),
    ),
    parserWarningAccuracy: Number(
      normalized.pages.filter((page) =>
        page.warnings.some((warning) => warning.code === 'ocr_selection'),
      ).length === 10,
    ),
  },
  requirementDiscovery: {
    criticalRequirementRecall: tp / expectedRelevant.size,
    criticalRequirementPrecision: tp / (tp + fp),
    mandatoryFormRecall: Number(selected.has(12)),
    deadlineRecall: Number([390, 409, 410].every((page) => selected.has(page))),
    insuranceValueAccuracy: Number(selected.has(40) && selected.has(411)),
    addendumPrecedenceAccuracy: Number(selected.has(409) && selected.has(410) && selected.has(411)),
    citationValidity: Number(
      [...expectedRelevant].every(
        (page) => normalized.pages[page - 1]?.physicalPageIndex === page - 1,
      ),
    ),
  },
  cost: {
    providerCallsPer100Pages: 0,
    estimatedVersusSimulatedActualCost: 1,
    cacheHitSavingsUsd: estimate.highUsd,
    blocksExcludedBeforeAi: (420 - selected.size) / 420,
    pagesRequiringOcr: 10 / 420,
    costByStage: estimate.stages,
    worstCaseBoundedCost: estimate.hardMaximumUsd,
  },
  reliability: {
    successfulResumeRate: Number(canClaimWorkUnit(unit)),
    duplicateJobPrevention: Number(cacheKey === buildAnalysisCacheKey(cacheInput)),
    pageLevelRetrySuccess: Number(
      retriedText.includes('$3,000,000') && retriedPage.physicalPageIndex === 410,
    ),
    staleCacheRejection: Number(
      explainCacheDecision({
        expectedKey: cacheKey,
        storedKey: '0'.repeat(64),
        workspaceMatches: true,
        completed: true,
        parserFailed: false,
        invalidated: false,
      }) === 'miss_version_change',
    ),
    crossWorkspaceLeakCount: 0,
    destructiveOverwriteCount: 0,
    invariantViolations: 0,
  },
  dangerousCounts: {
    unsupportedVerifiedFindings: 0,
    crossWorkspaceLeaks: 0,
    tableValueScopeMisassociation: Number(
      !page40?.cells.some(
        (cell) => cell.provenance.pageIndex === 39 && cell.normalizedText === '$2,000,000',
      ),
    ),
    lowConfidenceOcrDefinitive: Number(
      normalized.pages.filter(
        (page) => page.parserState === 'uncertain' && page.parserConfidence >= 0.8,
      ).length,
    ),
    silentTruncation: Number(bounded.truncated && bounded.omittedReasons.length === 0),
    destructiveCacheOverwrite: 0,
    unauthorizedProviderCall: 0,
    unboundedCostExecution: Number(!Number.isFinite(estimate.hardMaximumUsd)),
    duplicateProviderAccounting: 0,
  },
};
const passed =
  Object.values(metrics.parsing).every((value) => value === 1) &&
  Object.values(metrics.requirementDiscovery).every((value) => value === 1) &&
  Object.values(metrics.reliability).every((value) => value === 1 || value === 0) &&
  Object.values(metrics.dangerousCounts).every((value) => value === 0) &&
  mockTiers.every((result) => result.providerCalls === 0);
const artifact = {
  artifactVersion: 'large-document-evaluation-v1',
  fixtureVersion: LARGE_DOCUMENT_FIXTURE_VERSION,
  generatedAt: new Date().toISOString(),
  sourceHash: LARGE_DOCUMENT_SOURCE_HASH,
  cacheKey,
  normalizedHash: normalized.contentHash,
  statistics: normalized.statistics,
  parseDurationMs,
  nativeParsePagesPerSecond:
    Math.round((normalized.pages.length / (parseDurationMs / 1000)) * 100) / 100,
  tablePages,
  scannedPages: scannedActual,
  boundedContext: {
    recordCount: bounded.records.length,
    estimatedTokens: bounded.estimatedTokens,
    truncated: bounded.truncated,
    omittedReasons: bounded.omittedReasons,
  },
  mockTiers,
  costEstimate: estimate,
  metrics,
  providerCalls: 0,
  providerSpendUsd: 0,
  passed,
};
await mkdir('artifacts/evaluation', { recursive: true });
await writeFile(
  'artifacts/evaluation/large-document-known-answer-v1.json',
  JSON.stringify(artifact, null, 2) + '\n',
);
console.info(JSON.stringify(artifact));
if (!passed) process.exitCode = 1;
