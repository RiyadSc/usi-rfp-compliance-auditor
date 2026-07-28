import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`E2E tests require ${name} in .env.local`);
  return value;
}

async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible({
    timeout: 30_000,
  });
}

async function createWorkspace(page: Page, name: string) {
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/, { timeout: 30_000 });
}

test.describe('candidate extraction', () => {
  test.describe.configure({ mode: 'serial' });

  test('start extraction, show states, and keep any candidates unverified', async ({ page }) => {
    await signIn(page, 'A');
    await createWorkspace(page, `Extract E2E ${Date.now()}`);
    await page.getByRole('link', { name: 'Documents', exact: true }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve('fixtures/demo-rfp/minimal-text.pdf'));
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Start candidate extraction/i })).toBeEnabled({
      timeout: 120_000,
    });

    await page.getByRole('button', { name: /Start candidate extraction/i }).click();
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByText(/Everything listed here is a candidate/i)).toBeVisible();
    await expect(page.getByText(/(Queued|Running|Completed).*Extract/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/\bcompleted\b/i).first()).toBeVisible({ timeout: 120_000 });
    const source = page.getByRole('link', { name: /Source page/i }).first();
    if (await source.isVisible().catch(() => false)) {
      await expect(page.getByText(/unverified/i).first()).toBeVisible();
      await source.click();
      await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
    } else {
      await expect(page.getByText('No candidates produced.')).toBeVisible();
    }
  });

  test('budget_exceeded and failed analysis states render alerts', async ({ page }) => {
    // Seed via service role (browser cannot forge analysis rows under RLS).
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await signIn(page, 'A');
    await createWorkspace(page, `Extract States ${Date.now()}`);
    const workspaceId = page.url().match(/\/w\/([0-9a-f-]{36})/)?.[1];
    expect(workspaceId).toBeTruthy();

    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ perPage: 100 });
    const email = required('DEMO_USER_A_EMAIL');
    const user = users.find((u) => u.email === email);
    expect(user).toBeTruthy();

    const documentId = crypto.randomUUID();
    await admin.from('documents').insert({
      id: documentId,
      workspace_id: workspaceId!,
      original_filename: 'state.pdf',
      normalized_filename: 'state.pdf',
      mime_type: 'application/pdf',
      object_key: `${workspaceId}/e2e/${documentId}.pdf`,
      sha256: 'f'.repeat(64),
      size_bytes: 10,
      status: 'parsed',
      page_count: 1,
      parser_name: 'test',
      parser_version: '0',
      created_by: user!.id,
    });

    const budgetId = crypto.randomUUID();
    const failId = crypto.randomUUID();
    await admin.from('analysis_runs').insert([
      {
        id: budgetId,
        workspace_id: workspaceId!,
        document_id: documentId,
        status: 'budget_exceeded',
        stage: 'extract',
        created_by: user!.id,
        error_category: 'budget',
        error_detail: 'ceiling',
        completed_at: new Date().toISOString(),
      },
      {
        id: failId,
        workspace_id: workspaceId!,
        document_id: documentId,
        status: 'failed',
        stage: 'extract',
        created_by: user!.id,
        error_category: 'malformed_output',
        error_detail: 'fixture',
        completed_at: new Date().toISOString(),
      },
    ]);

    await page.goto(`/w/${workspaceId}/analysis/${budgetId}`);
    await expect(page.getByText(/analysis budget for this environment was reached/i)).toBeVisible();
    await page.goto(`/w/${workspaceId}/analysis/${failId}`);
    await expect(page.getByText(/Extraction failed/i)).toBeVisible();
  });

  test('cross-workspace analysis URL shows not found', async ({ page, browser }) => {
    await signIn(page, 'A');
    await createWorkspace(page, `Extract Iso ${Date.now()}`);
    await page.getByRole('link', { name: 'Documents', exact: true }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve('fixtures/demo-rfp/minimal-text.pdf'));
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Start candidate extraction/i })).toBeEnabled({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: /Start candidate extraction/i }).click();
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const analysisUrl = page.url();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signIn(pageB, 'B');
    await pageB.goto(analysisUrl);
    await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await ctxB.close();
  });
});
