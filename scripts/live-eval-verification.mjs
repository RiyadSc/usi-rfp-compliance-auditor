import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  OpenAIProvider,
  VERIFICATION_PROMPT_VERSION,
  VERIFICATION_SCHEMA_VERSION,
} from '../packages/ai/src/index.ts';
import {
  FIXTURE_ANALYSIS_RUN_ID,
  FIXTURE_VERIFICATION_RUN_ID,
  FIXTURE_WORKSPACE_ID,
  VERIFICATION_CONTEXTS,
  VERIFICATION_INPUT_CANDIDATES,
} from '../fixtures/eval/verification-cases.ts';
import { aggregateVerificationRuns, scoreVerificationRun } from './verification-metrics.mjs';

loadEnv({ path: resolve('.env.local') });
loadEnv({ path: resolve('.env') });

if (process.env.PHASE4_LIVE_EVAL !== '1')
  throw new Error('Refusing live verification evaluation: set PHASE4_LIVE_EVAL=1 explicitly');
const ceiling = Number(process.env.PHASE4_SPEND_CEILING_USD);
if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 10)
  throw new Error('PHASE4_SPEND_CEILING_USD must be present and no greater than 10');
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error('OPENAI_API_KEY absent for opt-in live verification evaluation');
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required)
  if (!process.env[name]) throw new Error(`${name} is required for spend ledger accounting`);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: spentRows, error: spendError } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd, phase');
if (spendError) throw spendError;
const cumulativeApiSpend = (spentRows ?? []).reduce(
  (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
  0,
);
const phase4Spend = (spentRows ?? [])
  .filter((row) => row.phase === 'phase4')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const models = ['gpt-5.5-2026-04-23', 'gpt-5.4-2026-03-05', 'gpt-5.4-mini-2026-03-17'];
const repetitions = 3;
const projectedMaximumUsd = 4.5;
console.log(
  JSON.stringify({
    cumulativeApiSpend,
    phase4Spend,
    projectedMaximumUsd,
    projectedPhase4Cumulative: phase4Spend + projectedMaximumUsd,
    ceiling,
    calls: models.length * repetitions,
    reasoning: 'medium',
  }),
);
if (phase4Spend + projectedMaximumUsd > ceiling + 1e-9)
  throw new Error('Refusing live calls: projected Phase 4 cumulative spend exceeds ceiling');

const modelResponse = await fetch('https://api.openai.com/v1/models', {
  headers: { authorization: `Bearer ${apiKey}` },
});
if (!modelResponse.ok)
  throw new Error(`Model availability enumeration failed (${modelResponse.status})`);
const accessible = new Set((await modelResponse.json()).data.map((model) => model.id));
for (const model of models)
  if (!accessible.has(model))
    throw new Error(`Required pinned verification candidate is unavailable: ${model}`);
console.log(
  JSON.stringify({ modelAvailability: models.map((model) => ({ model, available: true })) }),
);

const artifactDir = resolve('artifacts/evaluation');
await mkdir(artifactDir, { recursive: true });
const modelResults = [];
for (const model of models) {
  const runs = [];
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const provider = new OpenAIProvider({
      apiKey,
      verifyModel: model,
      verifyReasoningEffort: 'medium',
      timeoutMs: 90_000,
    });
    const output = await provider.verifyCandidates({
      workspaceId: FIXTURE_WORKSPACE_ID,
      analysisRunId: FIXTURE_ANALYSIS_RUN_ID,
      verificationRunId: FIXTURE_VERIFICATION_RUN_ID,
      candidates: VERIFICATION_INPUT_CANDIDATES,
      contexts: VERIFICATION_CONTEXTS,
      promptVersion: VERIFICATION_PROMPT_VERSION,
      schemaVersion: VERIFICATION_SCHEMA_VERSION,
      maxOutputTokens: 12_000,
    });
    const metrics = scoreVerificationRun(output);
    const ledgerNote = `phase4-live-eval:${model}:repetition-${repetition}`;
    if (metrics.estimatedCostUsd > 0) {
      const { error } = await admin.from('spend_ledger').insert({
        phase: 'phase4',
        kind: 'verify',
        estimated_cost_usd: metrics.estimatedCostUsd,
        note: ledgerNote,
      });
      if (error) throw error;
    }
    // Persist scored, non-secret metrics only. Raw provider findings and evidence text remain
    // process-local and must not be committed as evaluation artifacts.
    const run = { repetition, metrics };
    runs.push(run);
    await writeFile(
      resolve(artifactDir, `phase4-live-${model}-run-${repetition}.json`),
      JSON.stringify(run, null, 2) + '\n',
    );
    console.log(JSON.stringify({ model, repetition, metrics }));
  }
  const aggregate = aggregateVerificationRuns(runs);
  const qualifies =
    !aggregate.anyCriticalFalseSupported &&
    !aggregate.anyCriticalFalseActive &&
    !aggregate.anyMissedSupersedingAddendum &&
    !aggregate.anyIncorrectDate &&
    !aggregate.anyIncorrectNumericalThreshold &&
    !aggregate.anyInjectionInfluence &&
    aggregate.averages.schemaAdherence === 1 &&
    aggregate.averages.quoteValidityRate === 1 &&
    aggregate.averages.citationPageAccuracy === 1 &&
    aggregate.averages.falseMergeCount === 0 &&
    aggregate.averages.proofRequirementAccuracy >= 0.9 &&
    aggregate.stabilityRate >= 0.9;
  modelResults.push({ model, reasoning: 'medium', runs, aggregate, qualifies });
}
const { data: finalSpendRows } = await admin
  .from('spend_ledger')
  .select('estimated_cost_usd, phase');
const finalPhase4Spend = (finalSpendRows ?? [])
  .filter((row) => row.phase === 'phase4')
  .reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
const artifact = {
  phase: 'phase4',
  fixture: 'frozen-15-page-synthetic-rfp/verification-cases-v1',
  promptVersion: VERIFICATION_PROMPT_VERSION,
  schemaVersion: VERIFICATION_SCHEMA_VERSION,
  reasoning: 'medium',
  repetitions,
  projectedMaximumUsd,
  phase4SpendBefore: phase4Spend,
  phase4SpendAfter: finalPhase4Spend,
  models: modelResults,
};
await writeFile(
  resolve(artifactDir, 'phase4-live-verification-results.json'),
  JSON.stringify(artifact, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    completed: true,
    finalPhase4Spend,
    qualified: modelResults.filter((item) => item.qualifies).map((item) => item.model),
  }),
);
