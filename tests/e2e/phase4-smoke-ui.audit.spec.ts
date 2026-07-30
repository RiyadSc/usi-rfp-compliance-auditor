import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000002';
const MEETING_CANDIDATE_ID = '20000000-0000-4000-8000-000000000001';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Phase 4 smoke UI audit requires ${name}`);
  return value;
}

async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}

test.describe('Phase 4 completed-smoke UI audit', () => {
  test.skip(
    process.env.PHASE4_SMOKE_UI_AUDIT !== '1',
    'Opt-in read-only audit of the fixed synthetic smoke scope.',
  );

  test('renders all smoke findings, anchored source evidence, provenance, controls, and isolation', async ({
    page,
    browser,
  }) => {
    await signIn(page, 'A');
    await page.goto(`/w/${WORKSPACE_ID}/requirements`);
    await expect(page.getByRole('heading', { name: 'Requirement register' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(24);
    await expect(page.getByText('Source-supported — review pending').first()).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Partially supported', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Unsupported', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Contradicted', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Parser uncertainty', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Superseded', exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Conflicting', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/gpt-5\.5-2026-04-23.*reasoning low/)).toBeVisible();
    await expect(page.getByText(/does not determine bidder compliance/i)).toBeVisible();
    await expect(page.getByText('Human review accepted')).toHaveCount(0);
    await page.screenshot({
      path: 'artifacts/evaluation/phase4-production-worker-smoke-register.png',
      fullPage: true,
    });

    await page.goto(`/w/${WORKSPACE_ID}/requirements/${MEETING_CANDIDATE_ID}`);
    await expect(page.getByRole('heading', { name: 'Mandatory meeting' })).toBeVisible();
    await expect(page.getByText(/Machine assessment only\. Human review: pending/i)).toBeVisible();
    await expect(
      page
        .getByText(
          'Attendance at the mandatory pre-proposal meeting on March 1, 2026 at 10:00 AM local time is required.',
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(page.locator('mark')).toContainText('mandatory pre-proposal meeting');
    await expect(page.getByText('succeeded: entails')).toBeVisible();
    await expect(page.getByText('succeeded: no material objection')).toBeVisible();
    await expect(page.getByText('verification-decision-v6', { exact: true })).toBeVisible();
    await expect(page.getByText('verify-entailment-v7 / verification-entailment-v5')).toBeVisible();
    await expect(page.getByText('verify-challenge-v4 / verification-challenge-v4')).toBeVisible();
    await expect(page.getByLabel('Decision')).toBeVisible();
    await expect(page.getByLabel('Reviewer note')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record review' })).toBeVisible();
    await expect(page.getByText(/no pixel-level PDF highlight is claimed/i)).toBeVisible();
    const originalFrame = page.getByTitle('Original PDF page 7');
    await expect(originalFrame).toBeVisible();
    await expect(originalFrame).toHaveAttribute('src', /#page=7$/);
    const sourceLink = page.getByRole('link', { name: /Open source page/ });
    await expect(sourceLink).toHaveAttribute(
      'href',
      `/w/${WORKSPACE_ID}/documents/${DOCUMENT_ID}?page=7`,
    );
    await page.screenshot({
      path: 'artifacts/evaluation/phase4-production-worker-smoke-evidence.png',
      fullPage: true,
    });

    await sourceLink.click();
    await expect(page.getByRole('heading', { name: 'verification-cases-v2.pdf' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Extracted text — page 7 of 17' }),
    ).toBeVisible();
    await expect(page.getByTitle('PDF page 7')).toHaveAttribute('src', /#page=7$/);
    await expect(page.getByText(/failure to attend disqualifies an offeror/i)).toBeVisible();

    const unauthorizedContext = await browser.newContext();
    const unauthorizedPage = await unauthorizedContext.newPage();
    await signIn(unauthorizedPage, 'B');
    await unauthorizedPage.goto(`/w/${WORKSPACE_ID}/requirements/${MEETING_CANDIDATE_ID}`);
    await expect(unauthorizedPage.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await unauthorizedContext.close();
  });
});
