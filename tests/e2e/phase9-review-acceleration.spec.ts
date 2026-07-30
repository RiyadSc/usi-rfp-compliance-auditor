import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const WORKSPACE_ID = '81000000-0000-4000-8000-000000000002';
const PHASE9_DEMO_SCOPE_ID = '81000000-0000-4000-8900-000000000001';

type ReviewQueueRow = {
  candidate_hash: string;
  review_lane: 'critical' | 'exception' | 'duplicate' | 'routine';
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Phase 9 review E2E requires ${name}`);
  return value;
}

function adminClient() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function databaseUser(which: 'A' | 'B') {
  const client = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await client.auth.signInWithPassword({
    email: required(`DEMO_USER_${which}_EMAIL`),
    password: required(`DEMO_USER_${which}_PASSWORD`),
  });
  expect(result.error).toBeNull();
  return client;
}

async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}

async function suppressFirstRunTour() {
  const client = await databaseUser('A');
  const saved = await client.rpc('save_guided_tour_state', {
    p_workspace_id: WORKSPACE_ID,
    p_tour_id: 'first-run-rfp-review',
    p_tour_version: 'guided-product-tour-v1',
    p_status: 'dismissed',
    p_last_completed_step: 0,
  });
  expect(saved.error).toBeNull();
}

async function resetPreparedReview(admin: SupabaseClient) {
  await suppressFirstRunTour();
  const phase8Scope = await admin
    .from('phase8_demo_scopes')
    .select('authorized_identity_id')
    .eq('workspace_id', WORKSPACE_ID)
    .single();
  expect(phase8Scope.error).toBeNull();
  const reset = await admin.rpc('reset_phase9_review_demo', {
    p_workspace_id: WORKSPACE_ID,
    p_demo_scope_id: PHASE9_DEMO_SCOPE_ID,
    p_actor_id: phase8Scope.data!.authorized_identity_id,
  });
  expect(reset.error).toBeNull();
  expect(reset.data).toMatchObject({ providerCalls: 0, reset: true });
  const evaluationRunId = String(reset.data.activeEvaluationRunId);
  expect(evaluationRunId).toMatch(/^[0-9a-f-]{36}$/);
  return evaluationRunId;
}

async function recordAllRequiredDecisions(
  user: SupabaseClient,
  admin: SupabaseClient,
  evaluationRunId: string,
) {
  const queue = await user.rpc('get_phase9_review_queue', {
    p_workspace_id: WORKSPACE_ID,
    p_evaluation_run_id: evaluationRunId,
    p_lane: 'all',
    p_search: '',
    p_duplicate_signature: null,
    p_page: 1,
    p_page_size: 50,
  });
  expect(queue.error).toBeNull();
  const rows = queue.data.rows as ReviewQueueRow[];
  expect(rows).toHaveLength(25);

  for (const row of rows) {
    const decision =
      row.review_lane === 'exception' || row.review_lane === 'duplicate' ? 'rejected' : 'accepted';
    const review = await user.rpc('record_phase9_finding_review', {
      p_workspace_id: WORKSPACE_ID,
      p_evaluation_run_id: evaluationRunId,
      p_candidate_hash: row.candidate_hash,
      p_decision: decision,
      p_note:
        decision === 'accepted'
          ? 'Prepared end-to-end source review.'
          : 'Prepared end-to-end exclusion review.',
      p_corrections: {},
    });
    expect(review.error).toBeNull();
  }

  const coverage = await admin
    .from('phase9_coverage_exception_pages_v1')
    .select('source_document_id,page_number')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('evaluation_run_id', evaluationRunId)
    .order('page_number');
  expect(coverage.error).toBeNull();
  expect(coverage.data).toHaveLength(3);
  for (const row of coverage.data ?? []) {
    const review = await user.rpc('record_phase9_coverage_review', {
      p_workspace_id: WORKSPACE_ID,
      p_evaluation_run_id: evaluationRunId,
      p_source_document_id: row.source_document_id,
      p_page_number: row.page_number,
      p_decision: 'accepted',
      p_note: 'Prepared end-to-end page review.',
    });
    expect(review.error).toBeNull();
  }
}

test.describe('Phase 9 accelerated source review', () => {
  test.describe.configure({ mode: 'serial' });

  let admin: SupabaseClient;
  let evaluationRunId = '';

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.beforeEach(async () => {
    evaluationRunId = await resetPreparedReview(admin);
  });

  test('prioritizes critical work, records safe individual and batch decisions, and stays locked', async ({
    page,
  }) => {
    await signIn(page, 'A');
    await page.goto(`/w/${WORKSPACE_ID}/phase9?lane=critical&q=deadline&coveragePage=999999`);
    await expect(page).toHaveURL(
      new RegExp(`/w/${WORKSPACE_ID}/phase9\\?lane=critical&q=deadline$`),
    );
    await expect(page.getByText('No page-level exceptions remain unresolved.')).toHaveCount(0);

    await page.goto(`/w/${WORKSPACE_ID}/phase9?lane=critical&q=deadline&page=999999`);
    await expect(page).toHaveURL(
      new RegExp(`/w/${WORKSPACE_ID}/phase9\\?lane=critical&q=deadline$`),
    );
    await expect(
      page.locator('section[aria-labelledby="review-queue-title"] article[data-lane="critical"]'),
    ).not.toHaveCount(0);

    await page.goto(`/w/${WORKSPACE_ID}/phase9`);

    await expect(page.getByRole('heading', { name: 'RFP review command center' })).toBeVisible();
    const executiveSummary = page.getByRole('region', { name: 'Executive review summary' });
    const reviewQueue = page.locator('section[aria-labelledby="review-queue-title"]');
    await expect(executiveSummary).toBeVisible();
    await expect(reviewQueue).toBeVisible();
    expect(
      await page.evaluate(() => {
        const summary = document.querySelector('[aria-label="Executive review summary"]');
        const queue = document.querySelector('[aria-labelledby="review-queue-title"]');
        return Boolean(
          summary &&
          queue &&
          summary.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);

    const criticalLane = page.getByRole('link', { name: /^Critical \d+$/ });
    await expect(criticalLane).toHaveAttribute('aria-current', 'page');
    await expect(reviewQueue.locator('article[data-lane="critical"]').first()).toBeVisible();
    await expect(reviewQueue.getByRole('checkbox')).toHaveCount(0);

    const publicationConfirmation = page.getByRole('checkbox', {
      name: /I understand this publishes accepted source assessments/i,
    });
    await publicationConfirmation.check();
    await expect(
      page.getByRole('button', { name: 'Publish accepted requirements' }),
    ).toBeDisabled();

    const firstCritical = reviewQueue.locator('article[data-lane="critical"]').first();
    const reviewDisclosure = firstCritical.getByText('Review this finding', { exact: true });
    await reviewDisclosure.focus();
    await page.keyboard.press('Enter');
    const recordDecision = firstCritical.getByRole('button', { name: 'Record team decision' });
    await expect(recordDecision).toBeVisible();
    await recordDecision.click();
    await expect
      .poll(async () => {
        const result = await admin
          .from('phase9_finding_review_decisions')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', WORKSPACE_ID)
          .eq('evaluation_run_id', evaluationRunId);
        return result.count;
      })
      .toBe(1);
    await expect(page.getByRole('button', { name: 'Recording…' })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''), {
        timeout: 20_000,
      })
      .toMatch(/^finding-/);
    await expect(page).toHaveURL(/\/phase9\?lane=critical/);

    await page.goto(`/w/${WORKSPACE_ID}/phase9?lane=routine`);
    const routineQueue = page.locator('section[aria-labelledby="review-queue-title"]');
    const routineSelection = routineQueue
      .getByRole('checkbox', { name: /^Select .* Routine batch review$/ })
      .first();
    await expect(routineSelection).toBeEnabled();
    await routineSelection.check();
    const routineBatchTrigger = routineQueue.getByRole('button', {
      name: 'Accept 1 selected',
    });
    await routineBatchTrigger.click();
    const routineDialog = page.getByRole('alertdialog');
    await expect(routineDialog).toContainText('Record 1 individual decisions?');
    expect(
      await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest('[role="alertdialog"]') ??
          document.activeElement?.matches('[role="alertdialog"]'),
        ),
      ),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(routineDialog).toHaveCount(0);
    await expect(routineBatchTrigger).toBeFocused();
    await routineBatchTrigger.click();
    await page.getByRole('button', { name: 'Confirm 1 decisions' }).click();
    await expect
      .poll(
        async () => {
          const status = (await page.locator('[role="status"]').allTextContents()).join(' ');
          if (/could not record batch review|rate limit|timeout/i.test(status)) {
            throw new Error(`routine batch failed in UI: ${status}`);
          }
          const result = await admin
            .from('phase9_review_batch_operations')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', WORKSPACE_ID)
            .eq('evaluation_run_id', evaluationRunId)
            .eq('action', 'accept_routine');
          return result.count;
        },
        { timeout: 60_000 },
      )
      .toBe(1);

    await page.goto(`/w/${WORKSPACE_ID}/phase9?lane=duplicate`);
    const duplicateQueue = page.locator('section[aria-labelledby="review-queue-title"]');
    await Promise.all([
      page.waitForURL(/\?lane=all&group=[0-9a-f]{64}$/),
      duplicateQueue.getByRole('link', { name: 'Open every occurrence' }).click(),
    ]);
    await expect(page.locator('section[aria-labelledby="review-queue-title"] article')).toHaveCount(
      2,
    );
    await page.goto(`/w/${WORKSPACE_ID}/phase9?lane=duplicate`);
    const duplicateSelection = page
      .locator('section[aria-labelledby="review-queue-title"]')
      .getByRole('checkbox', { name: /^Select .* Duplicates batch review$/ })
      .first();
    await duplicateSelection.check();
    await page.getByRole('button', { name: 'Reject 1 duplicate' }).click();
    await page.getByLabel('Reason').fill('Exact deterministic non-canonical duplicate.');
    await page.getByRole('button', { name: 'Confirm 1 decisions' }).click();
    await expect
      .poll(
        async () => {
          const result = await admin
            .from('phase9_review_batch_operations')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', WORKSPACE_ID)
            .eq('evaluation_run_id', evaluationRunId);
          return result.count;
        },
        { timeout: 30_000 },
      )
      .toBe(2);

    const batchRecords = await admin
      .from('phase9_review_batch_operations')
      .select('id,action,selection_count')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('evaluation_run_id', evaluationRunId)
      .order('created_at');
    expect(batchRecords.error).toBeNull();
    expect(batchRecords.data).toMatchObject([
      { action: 'accept_routine', selection_count: 1 },
      { action: 'reject_duplicate', selection_count: 1 },
    ]);
    for (const batch of batchRecords.data ?? []) {
      const decisions = await admin
        .from('phase9_finding_review_decisions')
        .select('id')
        .eq('workspace_id', WORKSPACE_ID)
        .eq('evaluation_run_id', evaluationRunId)
        .eq('batch_operation_id', batch.id);
      expect(decisions.error).toBeNull();
      expect(decisions.data).toHaveLength(batch.selection_count);
    }

    await expect(
      page.getByRole('heading', { name: /page-level checks need attention/ }),
    ).toBeVisible();
    await publicationConfirmation.check();
    await expect(
      page.getByRole('button', { name: 'Publish accepted requirements' }),
    ).toBeDisabled();
    const visibleCopy = (await page.locator('main').innerText()).toLowerCase();
    expect(visibleCopy).not.toMatch(
      /\bcompliant\b|approved for submission|safe to submit|complete bid|ai confirmed|guaranteed complete/,
    );
  });

  test('publishes only after every decision, then exposes the register and checklist handoff', async ({
    page,
  }) => {
    const user = await databaseUser('A');
    await recordAllRequiredDecisions(user, admin, evaluationRunId);

    await signIn(page, 'A');
    await page.goto(`/w/${WORKSPACE_ID}/phase9`);
    await expect(page.getByRole('link', { name: 'Reviewed' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('heading', { name: /28 of 28 required review decisions are recorded/ }),
    ).toBeVisible();
    const confirmation = page.getByRole('checkbox', {
      name: /I understand this publishes accepted source assessments/i,
    });
    const publish = page.getByRole('button', { name: 'Publish accepted requirements' });
    await expect(publish).toBeDisabled();
    await confirmation.check();
    await expect(publish).toBeEnabled();
    await publish.click();

    let bridgeData: {
      id: string;
      verification_run_id: string | null;
      published_count: number;
    } | null = null;
    await expect
      .poll(
        async () => {
          const status = (await page.locator('[role="status"]').allTextContents()).join(' ');
          if (/could not publish|rate limit|timeout/i.test(status)) {
            throw new Error(`publish failed in UI: ${status}`);
          }
          const bridge = await admin
            .from('phase9_bridge_runs')
            .select('id,verification_run_id,published_count')
            .eq('workspace_id', WORKSPACE_ID)
            .eq('evaluation_run_id', evaluationRunId)
            .maybeSingle();
          expect(bridge.error).toBeNull();
          bridgeData = bridge.data;
          return bridge.data?.published_count ?? 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    const bridgeItem = await admin
      .from('phase9_bridge_items')
      .select('requirement_candidate_id')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('bridge_run_id', bridgeData!.id)
      .limit(1)
      .single();
    expect(bridgeItem.error).toBeNull();

    await page.goto(`/w/${WORKSPACE_ID}/requirements`);
    await expect(page.getByRole('heading', { name: 'Requirement register' })).toBeVisible();
    await expect(
      page.locator(
        `a[href="/w/${WORKSPACE_ID}/requirements/${bridgeItem.data!.requirement_candidate_id}"]`,
      ),
    ).toBeVisible();

    await page.goto(`/w/${WORKSPACE_ID}/checklist`);
    await expect(
      page.getByRole('heading', { name: 'Submission checklist and blockers' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Build submission list' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Submission list .*verified requirements/ }),
    ).toBeVisible({ timeout: 30_000 });
    const generated = await admin
      .from('checklist_generation_runs')
      .select('id,status')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('verification_run_id', bridgeData!.verification_run_id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();
    expect(generated.error).toBeNull();
    expect(generated.data).toBeTruthy();
  });

  test('keeps the queue responsive, keyboard reachable, and isolated from another workspace', async ({
    page,
    browser,
  }) => {
    await signIn(page, 'A');
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 820, height: 900 },
      { width: 1_280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/w/${WORKSPACE_ID}/phase9`);
      await expect(page.getByRole('region', { name: 'Executive review summary' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Review lanes' })).toBeVisible();
      await expect(page.getByLabel('Search findings')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }

    const search = page.getByLabel('Search findings');
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Search review queue' })).toBeFocused();

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signIn(otherPage, 'B');
    await otherPage.goto(`/w/${WORKSPACE_ID}/phase9`);
    await expect(otherPage.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(otherPage.getByText('RFP review command center')).toHaveCount(0);
    await otherContext.close();
  });
});
