/**
 * Controlled browser-to-worker smoke for the general workspace live path.
 * It drives the same owner UI and server action used by the application.
 * It never creates a second run or retries a failed provider execution.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

loadEnv({ path: resolve('.env.local'), quiet: true });
loadEnv({ path: resolve('.env'), quiet: true });

const argumentSchema = z.object({
  baseUrl: z.string().url(),
  workspaceId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(40),
  maximumUsd: z.number().positive().max(3),
});

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const parsed = argumentSchema.parse({
  baseUrl: args['base-url'],
  workspaceId: args['workspace-id'],
  documentIds: String(args['document-ids'] ?? '')
    .split(',')
    .filter(Boolean),
  maximumUsd: Number(args['maximum-usd']),
});

if (process.env.PHASE9_WORKSPACE_LIVE_EXECUTION !== '1')
  throw new Error('phase9_workspace_live_execution_flag_required');
if (process.env.PHASE9_DATA_AUTHORIZED !== '1')
  throw new Error('phase9_workspace_data_authorization_required');
if (process.env.PHASE9_GENERAL_LIVE_ANALYSIS_ENABLED !== 'true')
  throw new Error('phase9_workspace_live_server_flag_required');

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`phase9_workspace_live_runtime_missing:${name}`);
  return value;
};
const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('DEMO_USER_A_EMAIL');
const password = required('DEMO_USER_A_PASSWORD');
const startedAt = new Date().toISOString();

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${parsed.baseUrl}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Opportunities' }).waitFor();
  await page.goto(`${parsed.baseUrl}/w/${parsed.workspaceId}/phase9`);
  await page
    .getByRole('heading', { name: /live rfp analysis coverage|no controlled analysis result/i })
    .waitFor();

  const documentBoxes = await page.locator('[data-testid^="phase9-document-"]').all();
  for (const checkbox of documentBoxes) await checkbox.uncheck();
  for (const documentId of parsed.documentIds) {
    const checkbox = page.getByTestId(`phase9-document-${documentId}`);
    if ((await checkbox.count()) !== 1)
      throw new Error(`phase9_workspace_document_control_missing:${documentId}`);
    await checkbox.check();
  }
  await page.getByTestId('phase9-maximum-usd').fill(parsed.maximumUsd.toFixed(2));
  await page.getByTestId('phase9-data-confirmation').check();
  await page.getByTestId('phase9-budget-confirmation').check();
  const start = page.getByTestId('phase9-start-live-analysis');
  try {
    await expect(start).toBeEnabled({ timeout: 5_000 });
  } catch {
    const state = {
      selectedDocuments: await page.locator('[data-testid^="phase9-document-"]:checked').count(),
      dataConfirmed: await page.getByTestId('phase9-data-confirmation').isChecked(),
      budgetConfirmed: await page.getByTestId('phase9-budget-confirmation').isChecked(),
      maximumUsd: await page.getByTestId('phase9-maximum-usd').inputValue(),
      liveAvailable: await page.getByText('Live analysis available', { exact: true }).count(),
      administratorDisabled: await page
        .getByText('Disabled by administrator', { exact: true })
        .count(),
      disabledReason: await start.getAttribute('data-disabled-reason'),
    };
    throw new Error(`phase9_workspace_start_control_disabled:${JSON.stringify(state)}`);
  }
  await start.click();

  const queued = page.getByText(/^Queued \d+ bounded tasks\./);
  try {
    await queued.waitFor({ state: 'visible', timeout: 90_000 });
  } catch {
    const notices = await page.locator('.notice').allTextContents();
    throw new Error(`phase9_workspace_ui_start_failed:${notices.join(' | ').slice(0, 500)}`);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let run:
    | {
        id: string;
        status: string;
        error_category: string | null;
        planned_maximum_usd: number;
        actual_usd: number | null;
        provider_call_count: number;
        cache_hit_count: number;
        document_set_hash: string;
        source_package_hash: string;
        call_plan_hash: string;
        compatibility_fingerprint: string;
      }
    | undefined;
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const result = await admin
      .from('phase9_evaluation_runs')
      .select(
        'id,status,error_category,planned_maximum_usd,actual_usd,provider_call_count,cache_hit_count,document_set_hash,source_package_hash,call_plan_hash,compatibility_fingerprint',
      )
      .eq('workspace_id', parsed.workspaceId)
      .eq('mode', 'workspace_live')
      .gte('created_at', startedAt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(`phase9_workspace_run_poll_failed:${result.error.message}`);
    run = result.data ?? undefined;
    if (run && ['completed', 'failed', 'cancelled'].includes(run.status)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
  }
  if (!run) throw new Error('phase9_workspace_run_not_observed');
  const usage = await admin
    .from('phase9_provider_usage')
    .select('input_tokens,output_tokens,reasoning_tokens,latency_ms,cost_usd,response_status')
    .eq('workspace_id', parsed.workspaceId)
    .eq('evaluation_run_id', run.id);
  const findings = await admin
    .from('phase9_findings')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', parsed.workspaceId)
    .eq('evaluation_run_id', run.id);
  const summary = {
    version: 'phase9-workspace-live-smoke-v1',
    workspaceId: parsed.workspaceId,
    documentIds: parsed.documentIds,
    evaluationRunId: run.id,
    status: run.status,
    errorCategory: run.error_category,
    plannedMaximumUsd: Number(run.planned_maximum_usd),
    actualUsd: Number(run.actual_usd ?? 0),
    providerCalls: run.provider_call_count,
    cacheHits: run.cache_hit_count,
    findings: findings.count ?? 0,
    usage: (usage.data ?? []).reduce(
      (sum, item) => ({
        inputTokens: sum.inputTokens + item.input_tokens,
        outputTokens: sum.outputTokens + item.output_tokens,
        reasoningTokens: sum.reasoningTokens + item.reasoning_tokens,
        latencyMs: sum.latencyMs + item.latency_ms,
        costUsd: sum.costUsd + Number(item.cost_usd),
      }),
      { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, latencyMs: 0, costUsd: 0 },
    ),
    hashes: {
      documentSet: run.document_set_hash,
      sourcePackage: run.source_package_hash,
      callPlan: run.call_plan_hash,
      compatibility: run.compatibility_fingerprint,
    },
  };
  console.info(JSON.stringify(summary));
  if (run.status !== 'completed')
    throw new Error(`phase9_workspace_live_failed:${run.error_category ?? run.status}`);
} finally {
  await browser.close();
}
