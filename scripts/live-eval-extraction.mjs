/**
 * Controlled Phase 3 live evaluation. Never invoked by normal gates or startup.
 * Usage:
 *   PHASE3_LIVE_EVAL=1 npx tsx scripts/live-eval-extraction.mjs --probe
 *   PHASE3_LIVE_EVAL=1 npx tsx scripts/live-eval-extraction.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  EXTRACTION_PROMPT_VERSION,
  OpenAIProvider,
  SCHEMA_VERSION,
  checkBudget,
  estimateChatCost,
} from '../packages/ai/src/index.ts';
import { EXPECTED_REQUIREMENTS, PLANTED_PAGES } from '../fixtures/eval/planted-pages.ts';
import { evaluateExtraction, modelPassesGate } from './eval-metrics.mjs';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const CEILING_USD = 10;
const ALL_MODEL_CANDIDATES = [
  { id: 'gpt-5.5-2026-04-23', reasoning: 'low' },
  { id: 'gpt-5.4-2026-03-05', reasoning: 'low' },
  { id: 'gpt-5.4-mini-2026-03-17', reasoning: 'low' },
  { id: 'gpt-5.2-2025-12-11', reasoning: 'low' },
];
const probeMode = process.argv.includes('--probe');
const estimateOnly = process.argv.includes('--estimate-only');
const modelArg = process.argv.find((arg) => arg.startsWith('--model='))?.slice('--model='.length);
const MODEL_CANDIDATES = modelArg
  ? ALL_MODEL_CANDIDATES.filter((model) => model.id === modelArg)
  : ALL_MODEL_CANDIDATES;
if (modelArg && MODEL_CANDIDATES.length !== 1) {
  throw new Error(`Unknown or unsuitable evaluation model: ${modelArg}`);
}
const maxOutputTokens = probeMode ? 300 : 10_000;
const pages = probeMode
  ? [{ pageNumber: 1, text: 'The offeror must complete Form TEST-1.' }]
  : [...PLANTED_PAGES];

if (process.env.PHASE3_LIVE_EVAL !== '1') {
  throw new Error('Refusing live evaluation: PHASE3_LIVE_EVAL=1 is required');
}

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey || apiKey.length < 20) {
  throw new Error('Refusing live evaluation: OPENAI_API_KEY is absent or invalid');
}
if (Number(process.env.PHASE3_SPEND_CEILING_USD ?? CEILING_USD) > CEILING_USD) {
  throw new Error('Refusing live evaluation: configured Phase 3 ceiling exceeds $10');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Refusing live evaluation: spend-ledger runtime is unavailable');
}
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readSpend() {
  const { data, error } = await admin.from('spend_ledger').select('estimated_cost_usd');
  if (error) throw new Error(`Spend ledger read failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

async function recordSpend(model, amount) {
  if (amount <= 0) return;
  const { error } = await admin.from('spend_ledger').insert({
    kind: 'extract',
    estimated_cost_usd: amount,
    note: `Phase 3 ${probeMode ? 'structured-output probe' : 'known-answer live evaluation'}: ${model}`,
  });
  if (error) throw new Error(`Spend ledger write failed: ${error.message}`);
}

const estimatedInputTokens =
  pages.reduce((sum, page) => sum + Math.ceil(page.text.length / 4), 0) + 1_500;
const MAX_ATTEMPTS_PER_MODEL = 3;
const estimatedMaximumUsd =
  MODEL_CANDIDATES.reduce(
    (sum, model) => sum + estimateChatCost(estimatedInputTokens, maxOutputTokens, model.id),
    0,
  ) * MAX_ATTEMPTS_PER_MODEL;
const spentBefore = await readSpend();
if (checkBudget(spentBefore, estimatedMaximumUsd, CEILING_USD) === 'exceeded') {
  throw new Error(
    `Refusing live evaluation: $${spentBefore.toFixed(6)} spent + $${estimatedMaximumUsd.toFixed(6)} planned may exceed $${CEILING_USD}`,
  );
}

console.log(
  JSON.stringify({
    phase: 'phase3-live-evaluation',
    mode: probeMode ? 'structured-output-probe' : 'known-answer-bakeoff',
    candidateModels: MODEL_CANDIDATES.map((model) => model.id),
    spendBeforeUsd: Number(spentBefore.toFixed(8)),
    estimatedMaximumUsd: Number(estimatedMaximumUsd.toFixed(8)),
    estimatedMaximumCumulativeUsd: Number((spentBefore + estimatedMaximumUsd).toFixed(8)),
    ceilingUsd: CEILING_USD,
  }),
);

if (estimateOnly) process.exit(0);

const results = [];
for (const model of MODEL_CANDIDATES) {
  const provider = new OpenAIProvider({
    apiKey,
    extractModel: model.id,
    reasoningEffort: model.reasoning,
    timeoutMs: 90_000,
  });
  try {
    const output = await provider.extractCandidates({
      workspaceId: '00000000-0000-4000-8000-000000000201',
      documentId: '00000000-0000-4000-8000-000000000202',
      analysisRunId: '00000000-0000-4000-8000-000000000203',
      pages,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      maxOutputTokens,
    });
    await recordSpend(output.modelId, output.estimatedCostUsd);
    const usage = {
      inputTokens: output.promptTokens,
      outputTokens: output.completionTokens,
      reasoningTokens: output.reasoningTokens,
      cachedTokens: output.cachedTokens,
      latencyMs: output.latencyMs,
      retries: output.retries,
      providerReportedUsage: {
        inputTokens: output.promptTokens,
        outputTokens: output.completionTokens,
        reasoningTokens: output.reasoningTokens,
        cachedTokens: output.cachedTokens,
      },
      estimatedCostUsd: Number(output.estimatedCostUsd.toFixed(8)),
    };
    if (probeMode) {
      results.push({
        modelId: model.id,
        returnedSnapshot: output.modelId,
        reasoningSetting: model.reasoning,
        responsesApiCompatible: true,
        strictJsonSchemaCompatible: output.schemaAdherent,
        minimalStructuredOutputSucceeded:
          output.candidates.length > 0 && output.candidates.every((c) => c.status === 'unverified'),
        modelCalls: 1 + output.retries,
        repairAttempts: output.repairAttempts,
        refusalResponses: output.refused ? 1 : 0,
        incompleteResponses: output.incomplete ? 1 : 0,
        ...usage,
      });
    } else {
      const metrics = evaluateExtraction({ output, pages, expected: EXPECTED_REQUIREMENTS });
      results.push({
        modelId: model.id,
        snapshot: output.modelId,
        reasoningSetting: model.reasoning,
        modelCalls: 1 + output.retries,
        ...metrics,
        ...usage,
        candidateCount: output.candidates.length,
        allCandidatesUnverified: output.candidates.every((c) => c.status === 'unverified'),
        qualifies: modelPassesGate(metrics),
      });
    }
  } catch (error) {
    const providerError =
      error && typeof error === 'object'
        ? {
            status: 'status' in error ? Number(error.status) || null : null,
            code: 'code' in error ? String(error.code).slice(0, 80) : null,
            message:
              'message' in error
                ? String(error.message)
                    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
                    .slice(0, 500)
                : 'provider request failed',
          }
        : { status: null, code: null, message: 'provider request failed' };
    results.push({
      modelId: model.id,
      reasoningSetting: model.reasoning,
      modelCalls: 1,
      success: false,
      errorCategory: error instanceof Error ? error.name : 'provider_error',
      providerError,
      schemaAdherence: false,
      repairAttempts: 0,
      refusalResponses: 0,
      incompleteResponses: 0,
      qualifies: false,
    });
  }
}

const spentAfter = await readSpend();
const report = {
  artifactVersion: 'phase3-live-eval-v2',
  scorerVersion: 'known-answer-scorer-v2',
  generatedAt: new Date().toISOString(),
  fixture: probeMode ? 'minimal-structured-output-probe' : 'synthetic-rfp-known-answer-v1',
  fixturePages: pages.length,
  promptVersion: EXTRACTION_PROMPT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  outputLimitTokens: maxOutputTokens,
  reasoningSetting: 'low',
  phase3SpendCeilingUsd: CEILING_USD,
  spentBeforeUsd: Number(spentBefore.toFixed(8)),
  estimatedMaximumUsd: Number(estimatedMaximumUsd.toFixed(8)),
  actualEvaluationCostUsd: Number((spentAfter - spentBefore).toFixed(8)),
  cumulativePhase3SpendUsd: Number(spentAfter.toFixed(8)),
  injectionAttempts: probeMode
    ? null
    : {
        overrideSystemPrompt: true,
        requestSecrets: true,
        markItselfVerified: true,
        omitOtherPages: true,
        changeOutputRequirements: true,
        instructToolUse: true,
      },
  results,
};

const artifactDir = resolve('artifacts/evaluation');
await mkdir(artifactDir, { recursive: true });
const artifactPath = resolve(
  artifactDir,
  probeMode
    ? 'phase3-live-model-probes.json'
    : modelArg
      ? `phase3-live-results-${modelArg}.json`
      : 'phase3-live-results.json',
);
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));

if (probeMode && results.some((result) => !result.minimalStructuredOutputSucceeded)) {
  process.exitCode = 1;
}
