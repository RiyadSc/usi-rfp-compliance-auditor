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
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
}

async function createWorkspace(page: Page, name: string) {
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.describe('document ingestion', () => {
  test.describe.configure({ mode: 'serial' });

  test('upload PDF, wait for parse, show text, then delete', async ({ page }) => {
    await signIn(page, 'A');
    const name = `Docs E2E ${Date.now()}`;
    await createWorkspace(page, name);

    await page.getByRole('link', { name: /Open documents/ }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();

    const pdfPath = resolve('fixtures/demo-rfp/minimal-text.pdf');
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByText(/\bparsed\b/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('heading', { name: /Extracted text/ })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete document' }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('rejects non-pdf extension via accept attribute', async ({ page }) => {
    await signIn(page, 'A');
    await createWorkspace(page, `Limits ${Date.now()}`);
    await page.getByRole('link', { name: /Open documents/ }).click();
    await expect(page.locator('input[type="file"]')).toHaveAttribute('accept', /pdf/i);
  });

  test('rejects fake PDF renamed to .pdf', async ({ page }) => {
    await signIn(page, 'A');
    await createWorkspace(page, `Fake PDF ${Date.now()}`);
    await page.getByRole('link', { name: /Open documents/ }).click();

    await page.locator('input[type="file"]').setInputFiles(resolve('fixtures/demo-rfp/fake.pdf'));
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText(/File does not begin with PDF magic bytes/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('cross-workspace document URL shows not found', async ({ page, browser }) => {
    await signIn(page, 'A');
    await createWorkspace(page, `Iso Doc ${Date.now()}`);
    await page.getByRole('link', { name: /Open documents/ }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve('fixtures/demo-rfp/minimal-text.pdf'));
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const docUrl = page.url();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signIn(pageB, 'B');
    await pageB.goto(docUrl);
    await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await contextB.close();
  });
});
