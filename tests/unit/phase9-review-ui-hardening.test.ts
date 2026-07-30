import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const controls = readFileSync(
  'apps/web/src/app/w/[workspaceId]/phase9/finding-review-controls.tsx',
  'utf8',
);
const queue = readFileSync('apps/web/src/app/w/[workspaceId]/phase9/review-queue.tsx', 'utf8');
const page = readFileSync('apps/web/src/app/w/[workspaceId]/phase9/page.tsx', 'utf8');

describe('Phase 9 review UI fail-closed hardening', () => {
  it('uses the authoritative publication gate and explains invalid populations', () => {
    expect(controls).toContain(
      'disabled={!confirmed || eligibleCount === 0 || !publicationEligible || pending}',
    );
    expect(controls).toContain('{invalidAcceptedCount');
    expect(controls).toContain('{unrepresentedFindingCount');
    expect(page).toContain('publicationEligible={summary.publicationEligible}');
    expect(page).toContain('invalidAcceptedCount={summary.invalidAccepted}');
    expect(page).toContain('unrepresentedFindingCount={summary.unrepresentedFindings}');
  });

  it('records source-opening analytics without intercepting navigation', () => {
    const sourceLinkStart = queue.indexOf("eventType: 'source_page_opened'");
    expect(sourceLinkStart).toBeGreaterThan(-1);
    const sourceLink = queue.slice(sourceLinkStart - 500, sourceLinkStart + 700);
    expect(sourceLink).toContain('void recordPhase9ReviewActivityAction({');
    expect(sourceLink).toContain('.catch(() => undefined)');
    expect(sourceLink).not.toContain('await recordPhase9ReviewActivityAction');
    expect(sourceLink).not.toContain('preventDefault');

    const coverageLinkStart = controls.indexOf("eventType: 'source_page_opened'");
    expect(coverageLinkStart).toBeGreaterThan(-1);
    const coverageLink = controls.slice(coverageLinkStart - 450, coverageLinkStart + 550);
    expect(coverageLink).toContain('void recordPhase9ReviewActivityAction({');
    expect(coverageLink).not.toContain('await recordPhase9ReviewActivityAction');
    expect(coverageLink).not.toContain('preventDefault');
  });

  it('redirects out-of-range pages and preserves active review context', () => {
    expect(page).toContain('if (page > queuePageCount)');
    expect(page).toContain('if (coveragePage > coveragePageCount)');
    expect(page).not.toContain('queue.total > 0 && page > queuePageCount');
    expect(page).not.toContain('coverage.total > 0 && coveragePage > coveragePageCount');
    expect(page).toContain('redirect(phase9Href(coveragePage, queuePageCount));');
    expect(page).toContain('redirect(phase9Href(coveragePageCount));');
    expect(page).toContain('const next = new URLSearchParams({ lane: selectedLane });');
    expect(page).toContain("if (search) next.set('q', search);");
    expect(page).toContain("if (duplicateSignature) next.set('group', duplicateSignature);");
    expect(page).toContain("if (nextQueuePage > 1) next.set('page', String(nextQueuePage));");
    expect(page).toContain(
      "if (nextCoveragePage > 1) next.set('coveragePage', String(nextCoveragePage));",
    );
    expect(page).toContain("if (focusFirstUnresolved) next.set('focus', 'first-unresolved');");
    expect(page).toContain('{coverage.total === 0 ? (');
  });
});
