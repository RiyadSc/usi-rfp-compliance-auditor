import { expect, test, type Page } from '@playwright/test';
import {
  PHASE8_DEMO_CANDIDATES,
  PHASE8_DEMO_WORKSPACE_ID,
  PHASE8_PROPOSAL_AUDIT_RUN_ID,
  PHASE8_REPORT_SNAPSHOT_ID,
  PHASE8_SOURCE_DOCUMENT_ID,
} from '../../scripts/lib/phase8-prepared-demo';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`UX tests require ${name}`);
  return value;
};
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required('DEMO_USER_A_EMAIL'));
  await page.getByLabel('Password').fill(required('DEMO_USER_A_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('@ux-director understands readiness, top issues, and next action', async ({ page }) => {
  await page.goto(`/w/${PHASE8_DEMO_WORKSPACE_ID}`);
  await expect(
    page.getByRole('navigation', { name: 'Global navigation' }).getByRole('link'),
  ).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Opportunity health' })).toBeVisible();
  await expect(page.getByText('Recommended next action')).toBeVisible();
  await expect(page.getByText('Decision signals')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progress by stage' })).toBeVisible();
  await expect(page.getByText('Prepare final human review')).toBeVisible();
});

test('@ux-proposal-manager follows requirements, checklist, and proposal workflow', async ({
  page,
}) => {
  await page.getByLabel('Role view').selectOption('proposal-manager');
  await page.goto(`/w/${PHASE8_DEMO_WORKSPACE_ID}/requirements`);
  await expect(page.getByRole('heading', { name: 'Requirement register' })).toBeVisible();
  await expect(page.getByLabel('Search requirements')).toBeVisible();
  await page.goto(`/w/${PHASE8_DEMO_WORKSPACE_ID}/checklist`);
  await expect(
    page.getByRole('heading', { name: 'Deterministic checklist and blockers' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blocking submission' })).toBeVisible();
  await page.goto(`/w/${PHASE8_DEMO_WORKSPACE_ID}/proposal-audit`);
  await expect(page.getByRole('heading', { name: 'Proposal draft audit' })).toBeVisible();
});

test('@ux-contributor opens a focused personal queue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Role view').selectOption('contributor');
  await page.goto('/my-work');
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'My work summary' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('@ux-admin reveals technical detail without changing access', async ({ page }) => {
  await page.getByLabel('Role view').selectOption('technical');
  await page.goto(`/w/${PHASE8_DEMO_WORKSPACE_ID}/proposal-audit/${PHASE8_PROPOSAL_AUDIT_RUN_ID}`);
  await expect(page.getByText('Technical audit details')).toBeVisible();
  await expect(page.getByText(/team decisions remain separate/i)).toBeVisible();
});

test('@ux-visual captures fifteen stable role-based surfaces', async ({ page }) => {
  test.setTimeout(300_000);
  const checklistId = '81000000-0000-4000-8203-000000000001';
  const views = [
    ['01-home', '/'],
    ['02-opportunities', '/opportunities'],
    ['03-my-work', '/my-work?status=__visual_empty__'],
    ['04-search', '/search?q=Harbor%20City%20Full-Roadmap%20Synthetic%20Demo'],
    ['05-overview', `/w/${PHASE8_DEMO_WORKSPACE_ID}`],
    ['06-documents', `/w/${PHASE8_DEMO_WORKSPACE_ID}/documents`],
    ['07-requirements', `/w/${PHASE8_DEMO_WORKSPACE_ID}/requirements`],
    [
      '08-requirement-detail',
      `/w/${PHASE8_DEMO_WORKSPACE_ID}/requirements/${PHASE8_DEMO_CANDIDATES[0].candidateId}`,
    ],
    ['09-checklist', `/w/${PHASE8_DEMO_WORKSPACE_ID}/checklist`],
    ['10-checklist-detail', `/w/${PHASE8_DEMO_WORKSPACE_ID}/checklist/${checklistId}`],
    ['11-proposal-review', `/w/${PHASE8_DEMO_WORKSPACE_ID}/proposal-audit`],
    [
      '12-audit-detail',
      `/w/${PHASE8_DEMO_WORKSPACE_ID}/proposal-audit/${PHASE8_PROPOSAL_AUDIT_RUN_ID}`,
    ],
    ['13-reports', `/w/${PHASE8_DEMO_WORKSPACE_ID}/reports`],
    ['14-report-detail', `/w/${PHASE8_DEMO_WORKSPACE_ID}/reports/${PHASE8_REPORT_SNAPSHOT_ID}`],
    [
      '15-source-page',
      `/w/${PHASE8_DEMO_WORKSPACE_ID}/documents/${PHASE8_SOURCE_DOCUMENT_ID}?page=18`,
    ],
  ] as const;
  for (const [name, route] of views) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Not found' })).toHaveCount(0);
    await expect(page).toHaveScreenshot(`role-based-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      timeout: 15_000,
    });
  }
});
