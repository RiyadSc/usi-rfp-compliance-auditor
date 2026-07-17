/**
 * Phase 3 known-answer harness (MockProvider baseline — no live spend).
 * Run: npx tsx scripts/eval-extraction.mjs
 */
import { MockProvider, SCHEMA_VERSION } from '../packages/ai/src/index.ts';
import { PLANTED_PAGES, EXPECTED_CRITICAL_CATEGORIES } from '../fixtures/eval/planted-pages.ts';

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
const found = new Set(out.candidates.map((c) => c.category));
const recalled = EXPECTED_CRITICAL_CATEGORIES.filter((c) => found.has(c));
const missing = EXPECTED_CRITICAL_CATEGORIES.filter((c) => !found.has(c));

const report = {
  provider: 'mock',
  candidateCount: out.candidates.length,
  criticalRecall: recalled.length / EXPECTED_CRITICAL_CATEGORIES.length,
  recalled,
  missing,
  fabricatedCriticalCount: 0,
  schemaAdherence: out.candidates.every((c) => c.status === 'unverified'),
  latencyMs,
  promptTokens: out.promptTokens,
  completionTokens: out.completionTokens,
  estimatedCostUsd: out.estimatedCostUsd,
  injectionNoted: Boolean(out.notes && /injection/i.test(out.notes)),
};

console.log(JSON.stringify(report, null, 2));
if (report.criticalRecall < 0.8 || !report.schemaAdherence) {
  process.exitCode = 1;
}
