/**
 * Captures full-page screenshots of every redesigned surface for design review.
 *
 * Read-only: it signs in with the prepared demo account and navigates. It never
 * mutates workspace data and never writes credentials or signed URLs to disk.
 *
 * Usage:
 *   node --import tsx scripts/capture-design-screens.mts --out artifacts/design/after
 *   node --import tsx scripts/capture-design-screens.mts --out artifacts/design/before --only 05-overview
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { chromium, type Page } from '@playwright/test';
import {
  PHASE8_DEMO_CANDIDATES,
  PHASE8_DEMO_WORKSPACE_ID,
  PHASE8_PROPOSAL_AUDIT_RUN_ID,
  PHASE8_REPORT_SNAPSHOT_ID,
  PHASE8_SOURCE_DOCUMENT_ID,
} from './lib/phase8-prepared-demo.ts';

loadEnv({ path: '.env.local' });

const CHECKLIST_ITEM_ID = '81000000-0000-4000-8203-000000000001';
const WORKSPACE = PHASE8_DEMO_WORKSPACE_ID;

type Viewport = { width: number; height: number };

const VIEWPORTS: Record<string, Viewport> = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 834, height: 1112 },
};

/** Every surface in the redesign scope, in review order. */
const SCREENS: Array<{ name: string; route: string; auth?: boolean }> = [
  { name: '00-sign-in', route: '/login', auth: false },
  { name: '01-home', route: '/' },
  { name: '02-opportunities', route: '/opportunities' },
  { name: '03-my-work', route: '/my-work' },
  { name: '03b-my-work-empty', route: '/my-work?status=__visual_empty__' },
  { name: '04-search', route: '/search?q=Harbor%20City%20Full-Roadmap%20Synthetic%20Demo' },
  { name: '04b-search-empty', route: '/search?q=zzz-no-results-expected' },
  { name: '05-overview', route: `/w/${WORKSPACE}` },
  { name: '06-documents', route: `/w/${WORKSPACE}/documents` },
  { name: '07-requirements', route: `/w/${WORKSPACE}/requirements` },
  {
    name: '08-requirement-detail',
    route: `/w/${WORKSPACE}/requirements/${PHASE8_DEMO_CANDIDATES[0].candidateId}`,
  },
  { name: '09-checklist', route: `/w/${WORKSPACE}/checklist` },
  { name: '10-checklist-detail', route: `/w/${WORKSPACE}/checklist/${CHECKLIST_ITEM_ID}` },
  { name: '11-proposal-review', route: `/w/${WORKSPACE}/proposal-audit` },
  {
    name: '12-audit-detail',
    route: `/w/${WORKSPACE}/proposal-audit/${PHASE8_PROPOSAL_AUDIT_RUN_ID}`,
  },
  { name: '13-reports', route: `/w/${WORKSPACE}/reports` },
  { name: '14-report-detail', route: `/w/${WORKSPACE}/reports/${PHASE8_REPORT_SNAPSHOT_ID}` },
  {
    name: '15-source-page',
    route: `/w/${WORKSPACE}/documents/${PHASE8_SOURCE_DOCUMENT_ID}?page=18`,
  },
  { name: '16-document-detail', route: `/w/${WORKSPACE}/documents/${PHASE8_SOURCE_DOCUMENT_ID}` },
  { name: '17-phase9', route: `/w/${WORKSPACE}/phase9` },
  { name: '18-demo-entry', route: `/w/${WORKSPACE}/demo` },
  { name: '19-reports-global', route: '/reports' },
  { name: '20-not-found', route: '/w/00000000-0000-4000-8000-000000000000' },
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`capture-design-screens requires ${name}`);
  return value;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const read = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    out: read('--out') ?? 'artifacts/design/after',
    baseUrl: read('--base-url') ?? 'http://127.0.0.1:3000',
    only: read('--only')?.split(',').filter(Boolean),
    viewports: (read('--viewports') ?? 'desktop').split(',').filter(Boolean),
  };
}

async function signIn(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(required('DEMO_USER_A_EMAIL'));
  await page.getByLabel('Password').fill(required('DEMO_USER_A_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Opportunities' }).waitFor({ timeout: 60_000 });
}

async function main() {
  const { out, baseUrl, only, viewports } = parseArgs();
  // Playwright mis-detects the host platform on recent macOS builds, so allow an
  // explicit browser binary instead of the resolved download.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({ executablePath });

  for (const viewportName of viewports) {
    const viewport = VIEWPORTS[viewportName];
    if (!viewport) throw new Error(`Unknown viewport: ${viewportName}`);
    const outDir = viewportName === 'desktop' ? out : path.join(out, viewportName);
    await mkdir(outDir, { recursive: true });

    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    // Freeze the clock-sensitive greeting and deadline copy is server-rendered;
    // disabling animations keeps captures byte-stable between runs.
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const screens = only ? SCREENS.filter((screen) => only.includes(screen.name)) : SCREENS;
    let signedIn = false;

    for (const screen of screens) {
      if (screen.auth === false) {
        await context.clearCookies();
        signedIn = false;
      } else if (!signedIn) {
        await signIn(page, baseUrl);
        signedIn = true;
      }

      await page.goto(`${baseUrl}${screen.route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({
        path: path.join(outDir, `${screen.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      process.stdout.write(`captured ${viewportName}/${screen.name}\n`);
    }

    await context.close();
  }

  await browser.close();
}

await main();
