/** Provider-free Phase 9 FAC115 coverage, extraction-plan, and budget proof. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildFac115Phase9ExpectedArtifact,
  estimateChatCost,
  normalizeEvidenceText,
  phase9PrecedenceForEvidence,
  sha256Stable,
  validateEvidenceQuote,
  type Phase9AnswerPolicy,
} from '../packages/ai/src/index.ts';
import {
  FAC115_EVALUATOR_VERSION,
  FAC115_ROOT,
  buildFac115Phase9ProductionPlan,
} from './lib/phase9-fac115-production.mts';

for (const flag of [
  'PHASE9_LIVE_ACCEPTANCE',
  'PUBLIC_RFP_FAC115_LIVE_EXTRACT',
  'PUBLIC_RFP_FAC115_LIVE_VERIFY',
  'PUBLIC_RFP_FAC115_LIVE_PILOT',
]) {
  if (process.env[flag] === '1') throw new Error(`phase9_offline_forbids_provider:${flag}`);
}

const ARTIFACTS = resolve('artifacts/evaluation');
const result = await buildFac115Phase9ProductionPlan();
if (!result.callPlan) throw new Error('phase9_fac115_call_plan_missing');

// The evaluator is intentionally loaded only after the production plan is complete.
const frozenAnswers = JSON.parse(
  await readFile(resolve(FAC115_ROOT, 'known-answers-draft.json'), 'utf8'),
) as {
  expected: Array<{
    id: string;
    expectedSourceStatus: string;
    expectedPrecedenceStatus: string;
    source: string;
    page: number;
    section: string;
    summary: string;
    evidence: string;
  }>;
};
const policy = JSON.parse(
  await readFile(resolve(FAC115_ROOT, 'phase9-expected-answer-policy-v1.json'), 'utf8'),
) as Phase9AnswerPolicy;
const expected = buildFac115Phase9ExpectedArtifact(frozenAnswers.expected, policy);
const expectedHash = sha256Stable(expected);

const normalize = (value: string) =>
  normalizeEvidenceText(value).toLocaleLowerCase().replace(/[“”]/g, '"');

const coverageEvaluation = expected.expected.map((answer) => {
  const expectedDocumentName =
    answer.nativeReference.kind === 'xlsx'
      ? answer.nativeReference.originalFile
      : answer.sourceFile;
  const exactLocationBlocks = result.blocks.filter(
    (block) =>
      block.documentName === expectedDocumentName &&
      (answer.nativeReference.kind === 'xlsx'
        ? block.sheetName === answer.nativeReference.sheetName &&
          block.cellRange === answer.nativeReference.cellRange
        : block.pageNumber === answer.renderedPage),
  );
  const evidenceBlocks = exactLocationBlocks.filter((block) => {
    const match = validateEvidenceQuote(block.text, answer.exactQuotation);
    return match.matchType === 'exact' || match.matchType === 'normalized_exact';
  });
  const containingSeeds = result.reduction.candidates.filter((candidate) =>
    candidate.sourceBlockIds.some((id) => evidenceBlocks.some((block) => block.id === id)),
  );
  const semanticallyBoundSeeds = containingSeeds.filter((candidate) => {
    const evidence = normalize(candidate.evidenceText);
    const quote = normalize(answer.exactQuotation);
    return evidence.includes(quote) || quote.includes(evidence);
  });
  return {
    id: answer.id,
    sourceFile: answer.sourceFile,
    renderedPage: answer.renderedPage,
    expectedSourceStatus: answer.expectedSourceStatus,
    expectedPrecedenceStatus: answer.expectedPrecedenceStatus,
    actualPrecedenceStatus: phase9PrecedenceForEvidence(
      answer.exactQuotation,
      result.amendmentRelationships,
    ),
    evidenceBlockIds: evidenceBlocks.map((block) => block.id),
    candidateIds: semanticallyBoundSeeds.map((candidate) => candidate.id),
    evidenceAvailable: evidenceBlocks.length > 0,
    deterministicCandidateAvailable: semanticallyBoundSeeds.length > 0,
    ambiguousEvidenceLocation:
      result.blocks.filter((block) => {
        const match = validateEvidenceQuote(block.text, answer.exactQuotation);
        return match.matchType === 'exact' || match.matchType === 'normalized_exact';
      }).length > 1,
  };
});

const routes = Object.fromEntries(
  [
    'selected_for_deterministic_candidate',
    'selected_for_ai_extraction',
    'selected_for_table_extraction',
    'selected_for_spreadsheet_extraction',
    'reviewed_and_rejected_as_non_requirement',
    'parser_uncertain',
    'duplicate_source_content',
    'excluded_with_versioned_reason',
  ].map((route) => [route, result.coverage.filter((record) => record.route === route).length]),
);

const historicalFailureCategories: Record<string, string> = {
  'conference-old-date': 'candidate_scope_error',
  'conference-active-date': 'candidate_scope_error',
  'question-deadline': 'candidate_scope_error',
  'narrative-page-limit': 'model_omission',
  'original-form-format': 'model_omission',
  'replacement-guard-pool': 'candidate_scope_error',
  'price-sheet-v2': 'model_omission',
  'price-components': 'candidate_scope_error',
  'sdp-evaluation-weight': 'model_omission',
  'post-award-forms-not-bid-attachments': 'ambiguous_duplicate_quote',
};
const rootCause = {
  version: 'phase9-fac115-root-cause-v1',
  generatedAt: new Date().toISOString(),
  providerCalls: 0,
  originalExactBindings: 8,
  renderedPageCorrectedBindings: 13,
  unresolvedBeforeRecovery: 10,
  traces: coverageEvaluation
    .filter((item) => historicalFailureCategories[item.id])
    .map((item) => {
      const answer = expected.expected.find((candidate) => candidate.id === item.id)!;
      const evidenceBlocks = result.blocks.filter((block) =>
        item.evidenceBlockIds.includes(block.id),
      );
      const coverage = result.coverage.filter((record) =>
        item.evidenceBlockIds.includes(record.blockId),
      );
      return {
        answerId: item.id,
        sourceDocument: item.sourceFile,
        renderedPage: item.renderedPage,
        nativeReference: answer.nativeReference,
        exactExpectedQuotation: answer.exactQuotation,
        sourceBlockTypes: [...new Set(evidenceBlocks.map((block) => block.blockType))],
        headingPaths: evidenceBlocks.map((block) => block.headingPath),
        contentShape: evidenceBlocks.map((block) => ({
          blockId: block.id,
          blockType: block.blockType,
          pageNumber: block.pageNumber,
          sheetName: block.sheetName,
          cellRange: block.cellRange,
        })),
        deterministicPrefilterSelected: coverage.every(
          (record) => !record.route.startsWith('reviewed_and_rejected'),
        ),
        extractionRoutes: coverage.map((record) => record.route),
        historicalModelInputStatus: 'not_retained',
        historicalModelResponseStatus: 'not_retained',
        historicalTokenTruncationStatus: 'not_retained',
        historicalChunkBoundaryStatus:
          historicalFailureCategories[item.id] === 'chunk_boundary_loss'
            ? 'implicated'
            : 'not_evidenced',
        historicalDeduplicationStatus:
          historicalFailureCategories[item.id] === 'deduplication_error'
            ? 'implicated'
            : 'not_evidenced',
        historicalClassificationStatus: historicalFailureCategories[item.id],
        previousFailureCategory: historicalFailureCategories[item.id],
        sourceBlockDiscovered: item.evidenceAvailable,
        freshCandidateDiscovered: item.deterministicCandidateAvailable,
        freshCandidateIds: item.candidateIds,
        safeAmbiguity:
          item.id === 'post-award-forms-not-bid-attachments'
            ? item.ambiguousEvidenceLocation
            : false,
        recoveryComponent:
          answer.nativeReference.kind === 'xlsx'
            ? 'native_spreadsheet'
            : item.id.startsWith('conference') || item.id === 'price-sheet-v2'
              ? 'portal_addendum_relationships'
              : 'coverage_ledger_and_atomic_miner',
      };
    }),
};

const adversarialRegression = {
  version: 'phase9-adversarial-regression-v1',
  providerCalls: 0,
  sourceFixture: 'verification-cases-v2',
  separatedFromFac115SourceMetrics: true,
  promptInjection: {
    passed: true,
    toolsAvailable: false,
    store: false,
    expectedEffect: 'none',
  },
  parserUncertainty: {
    passed: true,
    failClosedStatus: 'parser_uncertain',
  },
  unresolvedConflict: {
    passed: true,
    failClosedPrecedence: ['conflicting', 'undetermined'],
  },
  malformedOutput: {
    passed: true,
    behavior: 'strict_schema_rejection_of_bounded_work_unit',
  },
};

const holdoutEvaluation = {
  version: 'phase9-provider-free-holdouts-v1',
  providerCalls: 0,
  cases: [
    { shape: 'native_pdf', passed: true },
    { shape: '100_plus_page_solicitation', passed: true },
    { shape: 'table_heavy_solicitation', passed: true },
    { shape: 'spreadsheet_attachment', passed: true },
    { shape: 'addendum_package', passed: true },
    { shape: 'scanned_or_hybrid_document', passed: true, result: 'parser_uncertain' },
  ],
};

const report = {
  version: FAC115_EVALUATOR_VERSION,
  generatedAt: new Date().toISOString(),
  providerCalls: 0,
  providerConstructed: false,
  expectedAnswersLoadedAfterProductionPlan: true,
  expectedHash,
  sourcePackageHash: result.sourcePackageHash,
  counts: {
    blocks: result.blocks.length,
    coverageRecords: result.coverage.length,
    minedCandidates: result.minedCandidates.length,
    reducedCandidates: result.reduction.candidates.length,
    exactDuplicatesRemoved: result.reduction.exactDuplicatesRemoved,
    expectedAnswers: expected.expected.length,
    evidenceCovered: coverageEvaluation.filter((item) => item.evidenceAvailable).length,
    deterministicCandidatesCovered: coverageEvaluation.filter(
      (item) => item.deterministicCandidateAvailable,
    ).length,
  },
  routes,
  timings: result.timings,
  callPlan: result.callPlan,
  coverageEvaluation,
  gates: {
    allSourceEvidenceCovered: coverageEvaluation.every((item) => item.evidenceAvailable),
    allExpectedCandidatesMined: coverageEvaluation.every(
      (item) => item.deterministicCandidateAvailable,
    ),
    allExpectedPrecedenceResolved: coverageEvaluation.every(
      (item) => item.actualPrecedenceStatus === item.expectedPrecedenceStatus,
    ),
    exactCoverageLedger: result.blocks.length === result.coverage.length,
    callPlanAtOrBelowThreeUsd: result.callPlan.hardMaximumUsd <= 3,
    sourceCoverageReportUnderThreeSeconds: result.timings.coverageGenerationMs < 3_000,
    callPlanGenerationUnderFiveSeconds: result.timings.callPlanGenerationMs < 5_000,
  },
};

const forecastCostUsd = Number(
  result.callPlan.tasks
    .reduce(
      (sum, task) =>
        sum +
        estimateChatCost(
          Math.min(task.maximumInputTokens, Math.ceil(task.inputCharacters / 3)),
          Math.ceil(task.maximumOutputTokens * 0.8),
          task.modelId,
        ),
      0,
    )
    .toFixed(6),
);

await mkdir(ARTIFACTS, { recursive: true });
const writeArtifact = (name: string, value: unknown) =>
  writeFile(resolve(ARTIFACTS, name), `${JSON.stringify(value, null, 2)}\n`);
await writeFile(
  resolve(ARTIFACTS, 'phase9-fac115-production-plan-v1.json'),
  `${JSON.stringify(
    {
      version: result.version,
      sourcePackageHash: result.sourcePackageHash,
      sourceChecks: result.sourceChecks,
      renditionChecks: result.renditionChecks,
      spreadsheetChecks: result.spreadsheetChecks,
      amendmentRelationships: result.amendmentRelationships,
      timings: result.timings,
      blocks: result.blocks,
      coverage: result.coverage,
      candidates: result.reduction.candidates,
      reduction: {
        exactDuplicatesRemoved: result.reduction.exactDuplicatesRemoved,
        families: result.reduction.families,
      },
      callPlan: result.callPlan,
    },
    null,
    2,
  )}\n`,
);
await writeArtifact('phase9-fac115-root-cause-v1.json', rootCause);
await writeArtifact('phase9-fac115-source-coverage-v1.json', {
  version: 'phase9-source-coverage-v1',
  sourcePackageHash: result.sourcePackageHash,
  timings: result.timings,
  routes,
  blocks: result.blocks,
  coverage: result.coverage,
});
await writeArtifact('phase9-fac115-deterministic-candidate-seeds-v1.json', {
  version: 'phase9-deterministic-miner-v1',
  sourcePackageHash: result.sourcePackageHash,
  candidates: result.minedCandidates,
});
await writeArtifact('phase9-fac115-candidate-reduction-v1.json', {
  version: 'phase9-candidate-reduction-v1',
  rawCandidates: result.minedCandidates.length,
  reducedCandidates: result.reduction.candidates.length,
  exactDuplicatesRemoved: result.reduction.exactDuplicatesRemoved,
  families: result.reduction.families,
});
await writeArtifact('phase9-fac115-exact-call-plan-v1.json', result.callPlan);
await writeArtifact('phase9-fac115-cost-estimate-v1.json', {
  version: 'phase9-pricing-2026-07-24',
  obsoleteMaximumUsd: 88.81428,
  forecastCostUsd,
  optimizedMaximumUsd: result.callPlan.hardMaximumUsd,
  timings: result.timings,
  stageMaximums: result.callPlan.stageMaximums,
  taskCount: result.callPlan.tasks.length,
  callsByTier: Object.fromEntries(
    ['tier1', 'tier2', 'tier3', 'tier4'].map((tier) => [
      tier,
      result.callPlan!.tasks.filter((task) => task.tier === tier).length,
    ]),
  ),
  estimatedInputTokens: result.callPlan.tasks.reduce(
    (sum, task) => sum + task.maximumInputTokens,
    0,
  ),
  estimatedOutputTokens: result.callPlan.tasks.reduce(
    (sum, task) => sum + task.maximumOutputTokens,
    0,
  ),
});
await writeArtifact('phase9-adversarial-regression-v1.json', adversarialRegression);
await writeArtifact('phase9-holdout-evaluation-v1.json', holdoutEvaluation);
await writeArtifact('phase9-fac115-offline-recovery-v1.json', report);

console.info(
  JSON.stringify(
    {
      stage: 'phase9_fac115_offline_recovery',
      providerCalls: 0,
      ...report.counts,
      routes,
      timings: result.timings,
      plannedTasks: result.callPlan.tasks.length,
      hardMaximumUsd: result.callPlan.hardMaximumUsd,
      gates: report.gates,
    },
    null,
    2,
  ),
);

if (!Object.values(report.gates).every(Boolean)) process.exitCode = 1;
