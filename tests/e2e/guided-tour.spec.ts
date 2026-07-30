import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const workspaceId = '81000000-0000-4000-8000-000000000002';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`guided tour requires ${name}`);
  return value;
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required('DEMO_USER_A_EMAIL'));
  await page.getByLabel('Password').fill(required('DEMO_USER_A_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}

async function expectStep(page: Page, id: string, target: string) {
  const tour = page.getByTestId('guided-tour');
  await expect(tour).toHaveAttribute('data-tour-step', id, { timeout: 20_000 });
  await expect(page.locator(`[data-tour-target="${target}"]`).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('guided-tour-spotlight')).toBeVisible({ timeout: 20_000 });
}

async function expectPanelInsideViewport(page: Page) {
  const panel = page.getByRole('dialog');
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test.beforeEach(async () => {
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const phase8Scope = await admin
    .from('phase8_demo_scopes')
    .select('authorized_identity_id')
    .eq('workspace_id', workspaceId)
    .single();
  expect(phase8Scope.error).toBeNull();
  const { data: user } = await admin.auth.admin.getUserById(
    // The prepared demo scope binds user A; resolve the identity from the scope
    // instead of encoding it in the tour definition or browser runtime.
    phase8Scope.data!.authorized_identity_id,
  );
  expect(user.user).toBeTruthy();
  const phase9Scope = await admin
    .from('phase9_review_demo_scopes')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single();
  expect(phase9Scope.error).toBeNull();
  const reset = await admin.rpc('reset_phase9_review_demo', {
    p_workspace_id: workspaceId,
    p_demo_scope_id: phase9Scope.data!.id,
    p_actor_id: user.user!.id,
  });
  expect(reset.error).toBeNull();
  expect(reset.data).toMatchObject({ providerCalls: 0, reset: true });
  const { error } = await admin
    .from('guided_tour_states')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.user!.id);
  expect(error).toBeNull();
});

test('@guided-tour first-run navigation, exit, restart, focus, and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await page.goto(`/w/${workspaceId}`);

  await expectStep(page, 'welcome', 'opportunity-overview');
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show presenter notes' })).toHaveCount(0);
  await expectPanelInsideViewport(page);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'navigation', 'opportunity-navigation');
  await page.keyboard.press('ArrowLeft');
  await expectStep(page, 'welcome', 'opportunity-overview');
  await page.keyboard.press('ArrowRight');
  await expectStep(page, 'navigation', 'opportunity-navigation');

  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: 'Your place can be resumed later' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stay in tour' }).click();
  await expectStep(page, 'navigation', 'opportunity-navigation');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exit tour' }).click();

  const launcher = page.getByText('Guided tour', { exact: true });
  await expect(launcher).toBeVisible();
  await launcher.click();
  const restart = page.getByRole('button', { name: 'Restart tour' });
  await expect(restart).toBeVisible();
  await restart.click();
  await expectStep(page, 'welcome', 'opportunity-overview');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );

  for (const step of ['navigation', 'urgent-work', 'evidence', 'human-control', 'next-action']) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByTestId('guided-tour')).toHaveAttribute('data-tour-step', step);
  }
  await page.getByRole('button', { name: 'Finish tour' }).click();
  await expect(page.getByTestId('guided-tour')).toHaveCount(0);
  await expect(restart).toBeFocused();
  await page.reload();
  await expect(page.getByTestId('guided-tour')).toHaveCount(0);
});

test('@guided-tour-readiness completes the 14-step interactive demo without changing source truth', async ({
  page,
}) => {
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const demoState = await admin
    .from('phase9_review_demo_states')
    .select('active_evaluation_run_id')
    .eq('workspace_id', workspaceId)
    .single();
  expect(demoState.error).toBeNull();
  const evaluationRunId = demoState.data!.active_evaluation_run_id;
  const immutableMachineState = async () => {
    const [findings, seeds, coverage] = await Promise.all([
      admin
        .from('phase9_findings')
        .select(
          'candidate_hash,source_support_status,precedence_status,proof_requirement,evidence_block_hashes,ambiguity_code,machine_only',
        )
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', evaluationRunId)
        .order('candidate_hash'),
      admin
        .from('phase9_candidate_seeds')
        .select('candidate_hash,obligation_text,evidence_text,material_facts,source_block_hashes')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', evaluationRunId)
        .order('candidate_hash'),
      admin
        .from('phase9_source_block_coverage')
        .select('block_hash,source_document_id,page_number,processing_result,route')
        .eq('workspace_id', workspaceId)
        .eq('evaluation_run_id', evaluationRunId)
        .order('block_hash'),
    ]);
    expect(findings.error).toBeNull();
    expect(seeds.error).toBeNull();
    expect(coverage.error).toBeNull();
    return { findings: findings.data, seeds: seeds.data, coverage: coverage.data };
  };
  const before = await immutableMachineState();

  await signIn(page);
  await page.goto(`/w/${workspaceId}`);
  await expectStep(page, 'welcome', 'opportunity-overview');
  await page.getByRole('button', { name: 'Skip tour' }).click();

  await page.getByText('Guided tour', { exact: true }).click();
  await page.getByRole('button', { name: 'Start guided demo' }).click();
  await expectStep(page, 'opportunity-overview', 'opportunity-overview');
  await expect(page.getByText('Step 1 of 14')).toBeVisible();
  await expect(page.getByTestId('presenter-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show presenter notes' }).click();
  await expect(page.getByTestId('presenter-note')).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'immediate-bid-risks', 'critical-obligations');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'review-progress', 'review-progress');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'critical-queue', 'critical-review-lane');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'evidence-backed-finding', 'evidence-backed-finding');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'original-source-evidence', 'source-evidence');

  const sourceLink = page
    .locator('[data-tour-target="source-evidence"] a[href*="/documents/"]')
    .first();
  await expect(sourceLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/documents\/[0-9a-f-]+/, { timeout: 60_000 }),
    sourceLink.click(),
  ]);
  await expectStep(page, 'original-source-evidence', 'source-page-viewer');
  await expect(page.getByRole('button', { name: 'Return to review' })).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/phase9/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Return to review' }).click(),
  ]);
  await expectStep(page, 'original-source-evidence', 'source-evidence');
  const sourceNext = page.getByRole('button', { name: 'Next', exact: true });
  await expect(sourceNext).toBeEnabled({ timeout: 20_000 });
  await sourceNext.click();
  await expectStep(page, 'human-decision', 'review-decision');
  const reviewSummary = page.locator(
    '[data-tour-target="review-decision"] summary[data-tour-interaction="review-decision"]',
  );
  await reviewSummary.focus();
  await expect(reviewSummary).toBeFocused();
  await page.keyboard.press('Enter');
  const humanNext = page.getByRole('button', { name: 'Next', exact: true });
  await expect(humanNext).toBeDisabled();
  await page.getByRole('button', { name: 'Record team decision' }).first().click();
  await expect(page.getByRole('button', { name: 'Recording…' })).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(humanNext).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expectStep(page, 'accelerated-routine-review', 'batch-review');
  const batchNext = page.getByRole('button', { name: 'Next', exact: true });
  await expect(batchNext).toBeDisabled();
  await page.getByRole('button', { name: /Select \d+ eligible on this page/ }).click();
  await expect(page.locator('p').filter({ hasText: /^\d+ selected$/ })).toBeVisible();
  await page.getByRole('button', { name: /Accept \d+ selected/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expectStep(page, 'accelerated-routine-review', 'batch-review');
  await page.getByRole('button', { name: /Accept \d+ selected/ }).click();
  await page.getByRole('button', { name: /Confirm \d+ decisions/ }).click();
  await expect(batchNext).toBeEnabled({ timeout: 20_000 });
  await page.setViewportSize({ width: 820, height: 900 });
  await expectPanelInsideViewport(page);
  await batchNext.click();

  await expectStep(page, 'coverage-exceptions', 'coverage-exceptions');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'controlled-publication', 'publication-gate');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'submission-checklist', 'submission-checklist');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'proposal-review', 'proposal-audit');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'readiness-report', 'readiness-report');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectPanelInsideViewport(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectStep(page, 'closing-value', 'closing-value');
  await page.getByRole('button', { name: 'Finish tour' }).click();
  await expect(page.getByTestId('guided-tour')).toHaveCount(0);

  expect(await immutableMachineState()).toEqual(before);
  const [decisionCount, batchCount, bridgeCount] = await Promise.all([
    admin
      .from('phase9_finding_review_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', evaluationRunId),
    admin
      .from('phase9_review_batch_operations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', evaluationRunId),
    admin
      .from('phase9_bridge_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('evaluation_run_id', evaluationRunId),
  ]);
  expect(decisionCount.count).toBeGreaterThan(1);
  expect(batchCount.count).toBe(1);
  expect(bridgeCount.count).toBe(0);
});
