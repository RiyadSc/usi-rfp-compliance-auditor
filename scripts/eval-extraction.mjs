/**
 * Phase 3 known-answer harness (MockProvider baseline — no live spend).
 * Run: npx tsx scripts/eval-extraction.mjs
 */
import { MockProvider, SCHEMA_VERSION } from '../packages/ai/src/index.ts';
import { EXPECTED_REQUIREMENTS, PLANTED_PAGES } from '../fixtures/eval/planted-pages.ts';
import { evaluateExtraction } from './eval-metrics.mjs';

const mock = new MockProvider();
const started = Date.now();
const out = await mock.extractCandidates({
  workspaceId: '00000000-0000-4000-8000-000000000101',
  documentId: '00000000-0000-4000-8000-000000000102',
  analysisRunId: '00000000-0000-4000-8000-000000000103',
  pages: [...PLANTED_PAGES],
  promptVersion: 'extract-v1',
  schemaVersion: SCHEMA_VERSION,
  maxOutputTokens: 2000,
});
const latencyMs = Date.now() - started;
const metrics = evaluateExtraction({
  output: out,
  pages: [...PLANTED_PAGES],
  expected: EXPECTED_REQUIREMENTS,
});

const report = {
  provider: 'mock',
  candidateCount: out.candidates.length,
  ...metrics,
  latencyMs,
  promptTokens: out.promptTokens,
  completionTokens: out.completionTokens,
  estimatedCostUsd: out.estimatedCostUsd,
  injectionNoted: Boolean(out.notes && /injection/i.test(out.notes)),
};

console.log(JSON.stringify(report, null, 2));
if (!report.schemaAdherence) {
  process.exitCode = 1;
}
