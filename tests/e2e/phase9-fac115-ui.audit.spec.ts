import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_ID = '80000000-0000-4000-8000-000000000100';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Phase 9 UI audit requires ${name}`);
  return value;
}

async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'FAC115 analysis coverage' })).toBeVisible();
    await expect(page.getByText('Source-grounded machine analysis only.')).toBeVisible();
    await expect(page.getByText('Source blocks covered')).toBeVisible();
    await expect(page.getByText('Actual provider cost')).toBeVisible();
    await expect(page.getByText('Cache reused')).toBeVisible();
    await expect(page.getByText('Machine-generated').first()).toBeVisible();
    await expect(page.getByText(/human review pending/i).first()).toBeVisible();
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
