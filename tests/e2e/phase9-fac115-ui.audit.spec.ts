import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_ID = '80000000-0000-4000-8000-000000000100';
const NEW_JERSEY_WORKSPACE_ID = '90000000-0000-4000-8000-000000000100';
const NEW_JERSEY_DOCUMENT_ID = '90000000-0000-4000-8000-000000000101';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Phase 9 UI audit requires ${name}`);
  return value;
}

test('shows the general workspace control but keeps default Playwright provider-free', async ({
  page,
}) => {
  await signIn(page, 'A');
  await page.goto(`/w/${NEW_JERSEY_WORKSPACE_ID}/phase9`);
  await expect(page.getByRole('heading', { name: 'RFP review command center' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Executive review summary' })).toBeVisible();
  await page.getByText('Analyst details and source-analysis provenance', { exact: true }).click();
  await expect(page.getByText('Disabled by administrator', { exact: true })).toBeVisible();
  await expect(page.getByTestId(`phase9-document-${NEW_JERSEY_DOCUMENT_ID}`)).toBeChecked();
  await expect(page.getByTestId('phase9-start-live-analysis')).toBeDisabled();
  await expect(page.getByText(/machine-only with human review pending/i)).toBeVisible();
});

async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}

test.describe('Phase 9 stored FAC115 result', () => {
  test.skip(
    process.env.PHASE9_UI_AUDIT !== '1',
    'Read-only audit requires the separately controlled completed public acceptance run.',
  );

  test('shows coverage, exact provenance, ambiguity, cost, cache, and isolation', async ({
    page,
    browser,
  }) => {
    await signIn(page, 'A');
    await page.goto(`/w/${WORKSPACE_ID}/phase9`);
    await expect(page.getByRole('heading', { name: 'RFP review command center' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Executive review summary' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Review progress' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Review lanes' })).toBeVisible();
    await page.getByText('Analyst details and source-analysis provenance', { exact: true }).click();
    await expect(page.getByText('Analysis mode', { exact: true })).toBeVisible();
    await expect(page.getByText('Actual cost', { exact: true })).toBeVisible();
    await expect(page.getByText('Provider calls', { exact: true })).toBeVisible();
    await expect(page.getByText(/machine-only with human review pending/i)).toBeVisible();
    await expect(page.getByText(/compliant/i)).toHaveCount(0);
    await expect(page.getByText(/approved for submission/i)).toHaveCount(0);

    const sourceLink = page
      .getByRole('link')
      .filter({ hasText: /FAC115_Request_for_Response.*page/i })
      .first();
    await expect(sourceLink).toBeVisible();
    await sourceLink.click();
    await expect(page.getByRole('heading', { name: /FAC115_Request_for_Response/i })).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, 'B');
    await otherPage.goto(`/w/${WORKSPACE_ID}/phase9`);
    await expect(otherPage.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await other.close();
  });
});
