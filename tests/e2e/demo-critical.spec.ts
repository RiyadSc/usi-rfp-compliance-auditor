import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const workspaceId = '81000000-0000-4000-8000-000000000002';
const scopeId = '81000000-0000-4000-8000-000000000001';
const phase9ReviewScopeId = '81000000-0000-4000-8900-000000000001';
const proposalAuditRunId = '81000000-0000-4000-8000-000000000012';
const expectedFingerprint = 'c52d49b8302b7f47b4751e0d4f3d092001209337e21c755e950ee4fb81fe001b';
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`demo-critical requires ${name}`);
  return value;
};
async function signIn(page: Page, which: 'A' | 'B') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(required(`DEMO_USER_${which}_EMAIL`));
  await page.getByLabel('Password').fill(required(`DEMO_USER_${which}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/login');
}

test('@demo-critical completes the exact protected synthetic presentation flow', async ({
  page,
  browser,
}, testInfo) => {
  const rehearsal = process.env.PHASE8_REHEARSAL_INDEX ?? 'test';
  const startedAt = new Date();
  const timings: Array<{ step: string; durationMs: number }> = [];
  const step = async <T>(name: string, action: () => Promise<T>) => {
    const start = performance.now();
    const result = await action();
    timings.push({ step: name, durationMs: Math.round(performance.now() - start) });
    return result;
  };
  const admin = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: scope } = await admin
    .from('phase8_demo_scopes')
    .select('binding,fixture_version,compatibility_fingerprint,synthetic_marker')
    .eq('id', scopeId)
    .single();
  const { data: cache } = await admin
    .from('phase8_demo_cache_entries')
    .select('binding_hash,status')
    .eq('scope_id', scopeId)
    .single();
  expect(scope).toMatchObject({
    fixture_version: 'full-roadmap-known-answer-v1',
    compatibility_fingerprint: expectedFingerprint,
    synthetic_marker: 'phase8-synthetic-demo-only',
  });
  const binding = scope!.binding as { authorizedIdentityId: string };
  const reset = await step('reset', () =>
    admin.rpc('reset_phase8_demo', {
      p_scope_id: scopeId,
      p_workspace_id: workspaceId,
      p_actor_id: binding.authorizedIdentityId,
      p_scope_hash: cache!.binding_hash,
      p_dry_run: false,
    }),
  );
  expect(reset.error).toBeNull();
  expect(reset.data).toMatchObject({ mutated: true, dryRun: false });
  const phase9Reset = await step('reset_phase9_review', () =>
    admin.rpc('reset_phase9_review_demo', {
      p_workspace_id: workspaceId,
      p_demo_scope_id: phase9ReviewScopeId,
      p_actor_id: binding.authorizedIdentityId,
    }),
  );
  expect(phase9Reset.error).toBeNull();
  expect(phase9Reset.data).toMatchObject({ providerCalls: 0, reset: true });

  await step('sign_in_and_workspace', async () => {
    await signIn(page, 'A');
    await page.goto(`/w/${workspaceId}/demo`);
    await expect(
      page.getByRole('heading', { name: 'Harbor City full-roadmap demo' }),
    ).toBeVisible();
    await expect(page.getByRole('status').first()).toContainText('Prepared synthetic demo');
  });

  await step('requirements_and_evidence', async () => {
    const section = page.getByRole('region', {
      name: 'Candidate extraction and source verification',
    });
    await expect(section.locator('article')).toHaveCount(24);
    await expect(section).toContainText('24 immutable extraction candidates');
    await expect(section).toContainText('Offerors must complete and submit mandatory Form A-1.');
    await section
      .getByRole('link', { name: 'Open verified requirement and evidence' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Mandatory Form A-1', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText('Offerors must complete and submit mandatory Form A-1.', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByTitle('Original PDF page 18')).toBeVisible();
    await page.getByRole('link', { name: 'Open source page →' }).click();
    await expect(page.getByRole('heading', { name: /phase8-synthetic-rfp\.pdf/i })).toBeVisible();
    await expect(page.getByText('Extracted text — page 18 of 22')).toBeVisible();
    await page.goto(`/w/${workspaceId}/demo`);
  });

  await step('checklist_and_missing_forms', async () => {
    await expect(page.getByTestId('missing-form-count')).toHaveText(
      'Exactly 5 missing mandatory-form blockers.',
    );
    const checklist = page.getByRole('region', {
      name: 'Deterministic checklist and blockers',
    });
    await expect(checklist).toContainText('Form A-1');
    await checklist
      .getByRole('link', { name: 'Open checklist item and linked evidence' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Mandatory Form A-1', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exact source evidence' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open original page 18 →' })).toBeVisible();
    await page.goto(`/w/${workspaceId}/demo`);
  });

  await step('proposal_audit', async () => {
    const proposal = page.getByRole('region', { name: 'Proposal draft audit' });
    for (const value of [
      'Unsupported factual claim',
      'Contradictory delivery method',
      'Conflicting deadline',
      'Incorrect insurance value',
      'Wrong procurement reference',
      'Missing mandatory response',
      'Company proof required',
      'Embedded prompt-injection attempt — zero influence',
    ])
      await expect(proposal.getByText(value, { exact: true })).toBeVisible();
    await proposal.getByRole('link', { name: 'Open proposal page 4' }).click();
    await expect(page.getByText('Extracted text — page 4 of 8')).toBeVisible();
    await page.goto(`/w/${workspaceId}/demo`);
    await page.getByRole('button', { name: 'Record finding review' }).click();
    // Server revalidation remounts the page and clears the ephemeral status toast;
    // the durable signal is the append-only resolution history copy.
    await expect(page.getByTestId('resolution-history')).toContainText('Append-only', {
      timeout: 15_000,
    });
    await page.goto(`/w/${workspaceId}/proposal-audit/${proposalAuditRunId}`);
    await expect(page.getByRole('heading', { name: 'phase8-flawed-proposal.pdf' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await expect(
      page.getByText('No findings. Human review is still required for the audit.'),
    ).toHaveCount(0);
    await expect(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Findings' }) })
        .locator('li'),
    ).toHaveCount(9);
    await expect(page.getByText('Incorrect insurance value', { exact: true })).toBeVisible();
    await expect(page.getByText('Conflicting deadline', { exact: true })).toBeVisible();
    await page.goto(`/w/${workspaceId}/demo`);
  });

  await step('report_export_and_audit', async () => {
    const report = page.getByRole('region', { name: 'Executive readiness report' });
    await expect(report).toContainText('Critical blockers');
    await expect(report).toContainText('DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION');
    await page.getByRole('button', { name: 'Validate short-lived private download' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'expires in 300 seconds' }),
    ).toBeVisible();
    await report.getByRole('link', { name: 'Open readiness report and private export' }).click();
    await expect(page.getByText('DEMO — SYNTHETIC DATA — NOT FOR SUBMISSION')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Private exports' })).toBeVisible();
    await expect(page.getByText('prepared-fallback.html')).toBeVisible();
    const linkedRecords = page.getByRole('link', { name: 'Open linked record' });
    await expect(linkedRecords).toHaveCount(12);
    const linkedRecordHrefs = await linkedRecords.evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    );
    expect(new Set(linkedRecordHrefs).size).toBe(12);
    for (const href of linkedRecordHrefs) {
      await page.goto(href);
      await expect(page.getByRole('heading', { name: 'Not found' })).toHaveCount(0);
    }
    await page.goto(`/w/${workspaceId}/demo`);
    await expect(page.getByText('demo_fallback_activated').first()).toBeVisible();
  });

  await step('fallback_and_language_policy', async () => {
    await page.getByRole('button', { name: 'Fallback', exact: true }).click();
    await expect(page.locator('[data-demo-mode="fallback"]')).toBeVisible();
    await expect(page.getByText('Original report provenance is preserved.')).toBeVisible();
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toMatch(
      /\bcompliant\b|\bapproved\b|safe to submit|guaranteed complete|submission ready/,
    );
  });

  await step('cross_workspace_denial', async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, 'B');
    await otherPage.goto(`/w/${workspaceId}/demo`);
    await expect(otherPage.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await other.close();
  });

  const { count: modelCalls } = await admin
    .from('model_calls')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  expect(modelCalls).toBe(0);
  const screenshotPath = `artifacts/rehearsals/phase8-demo-${rehearsal}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const completedAt = new Date();
  const artifact = {
    rehearsal,
    testTitle: testInfo.title,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalDurationMs: completedAt.getTime() - startedAt.getTime(),
    timings,
    reset: reset.data,
    cacheMode: 'prepared',
    fallbackActivated: true,
    failures: 0,
    retries: 0,
    providerCalls: 0,
    screenshot: screenshotPath,
    fixtureVersion: scope!.fixture_version,
    fingerprint: scope!.compatibility_fingerprint,
  };
  await mkdir('artifacts/rehearsals', { recursive: true });
  await writeFile(
    `artifacts/rehearsals/phase8-demo-${rehearsal}.json`,
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  );
});
