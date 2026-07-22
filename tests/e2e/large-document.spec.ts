import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_ID = '82000000-0000-4000-8000-000000000001';
const DOCUMENT_ID = '82000000-0000-4000-8000-000000000002';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`E2E tests require ${name}`);
  return value;
}
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required('DEMO_USER_A_EMAIL'));
  await page.getByLabel('Password').fill(required('DEMO_USER_A_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
}

test.describe('prepared 420-page large-document demo', () => {
  test('shows exact persisted progress, bounded cost, structured table evidence, and parser uncertainty', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/w/${WORKSPACE_ID}/documents/${DOCUMENT_ID}?page=40`);
    await expect(
      page.getByRole('heading', { name: /harbor-city-large-security-rfp-420-pages\.pdf/i }),
    ).toBeVisible();
    await expect(page.getByText('420', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/430 of 430 work units/i)).toBeVisible();
    await expect(page.getByText(/Expected \$1\.90–\$2\.53 · hard maximum \$5\.07/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Structured table evidence' })).toBeVisible();
    await expect(page.getByText('General Liability', { exact: true })).toBeVisible();
    await expect(page.getByText('$2,000,000', { exact: true })).toBeVisible();
    await page.goto(`/w/${WORKSPACE_ID}/documents/${DOCUMENT_ID}?page=275`);
    await expect(page.getByText(/table header association requires human review/i)).toBeVisible();
  });
});
