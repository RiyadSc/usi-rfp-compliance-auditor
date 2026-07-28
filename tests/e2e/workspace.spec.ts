import { expect, test, type Page } from '@playwright/test';

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

test('unauthenticated visitors are redirected to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('wrong credentials show a generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@rfp-demo.local');
  await page.getByLabel('Password').fill('definitely-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Note: Next.js adds an empty role=alert route announcer, so target the text.
  await expect(page.getByText(/Sign-in failed/)).toBeVisible();
});

test('sign in, create a workspace, reopen it, and see the audit trail', async ({ page }) => {
  await signIn(page, 'A');

  const name = `E2E Opportunity ${Date.now()}`;
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByLabel('Customer / agency').fill('City of Example');
  await page.getByRole('button', { name: 'Create opportunity' }).click();

  // Lands on the workspace overview.
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  const url = page.url();

  // Audit event is visible.
  await expect(page.getByText('Opportunity created')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Opportunity stages' })).toBeVisible();
  await expect(page.getByText('Recommended next action')).toBeVisible();

  // Reopen from the list.
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Opportunities' })
    .click();
  await page.getByText(/Test workspaces/).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Demo disclaimer is always present.
  await expect(page.getByText(/DEMO — synthetic\/public data only/)).toBeVisible();
});

test("another user's workspace URL returns not-found (no existence leak)", async ({
  page,
  browser,
}) => {
  await signIn(page, 'A');
  const name = `E2E Isolation ${Date.now()}`;
  await page.getByLabel(/Opportunity name/).fill(name);
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page).toHaveURL(/\/w\/[0-9a-f-]{36}$/);
  const workspaceUrl = page.url();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await signIn(pageB, 'B');
  await pageB.goto(workspaceUrl);
  await expect(pageB.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(pageB.getByRole('heading', { name })).not.toBeVisible();
  await contextB.close();
});

test('a malformed workspace id returns not-found', async ({ page }) => {
  await signIn(page, 'A');
  await page.goto('/w/not-a-uuid');
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
});
