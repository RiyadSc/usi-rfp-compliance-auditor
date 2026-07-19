import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertWorkflowTransition,
  calculateBlockers,
  generateChecklistItems,
  type BlockerInputItem,
  type ChecklistSource,
} from '@usi/domain';

const source = (overrides: Partial<ChecklistSource> = {}): ChecklistSource => ({
  workspaceId: '51000000-0000-4000-8000-000000000001',
  analysisRunId: '51000000-0000-4000-8000-000000000002',
  verificationRunId: '51000000-0000-4000-8000-000000000003',
  findingId: '51000000-0000-4000-8000-000000000004',
  findingVersion: 1,
  candidateId: '51000000-0000-4000-8000-000000000005',
  title: 'Submission deadline',
  obligation: 'Submit by July 20, 2026 at 5:00 PM EDT.',
  sourceCategory: 'deadline',
  mandatory: true,
  sourceSupportStatus: 'supported',
  precedenceStatus: 'active',
  proofRequirement: 'none_identified',
  machineStatus: 'machine_assessment_only',
  humanReviewStatus: 'accepted',
  documentId: '51000000-0000-4000-8000-000000000006',
  documentPageId: '51000000-0000-4000-8000-000000000007',
  pageNumber: 1,
  exactQuote: 'Submit by July 20, 2026 at 5:00 PM EDT.',
  parserConfidence: 1,
  dueAt: '2026-07-20T21:00:00.000Z',
  dueTimezone: 'America/New_York',
  relationshipRole: 'atomic',
  verificationEvidenceId: '51000000-0000-4000-8000-000000000008',
  validatedEvidence: true,
  ...overrides,
});

describe('Phase 5 safety, deadline, and atomicity rules', () => {
  it('creates a missed deadline only after the exact timezone-normalized instant', () => {
    const item = generateChecklistItems([source()])[0] as BlockerInputItem;
    expect(
      calculateBlockers([item], new Date('2026-07-20T20:59:59Z')).some(
        (b) => b.type === 'missed_deadline',
      ),
    ).toBe(false);
    expect(
      calculateBlockers([item], new Date('2026-07-20T21:00:01Z')).some(
        (b) => b.type === 'missed_deadline',
      ),
    ).toBe(true);
  });

  it('does not merge similar obligations with materially distinct form, role, or deadline scope', () => {
    const items = generateChecklistItems([
      source({
        title: 'Form A-1',
        obligation: 'Project manager submits Form A-1 by July 20.',
        sourceCategory: 'required_form',
      }),
      source({
        findingId: '51000000-0000-4000-8000-000000000014',
        candidateId: '51000000-0000-4000-8000-000000000015',
        title: 'Form A-2',
        obligation: 'Site supervisor submits Form A-2 by July 21.',
        sourceCategory: 'required_form',
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.stableKey)).size).toBe(2);
  });

  it('requires a reviewed waiver before entering waived workflow state', () => {
    expect(() =>
      assertWorkflowTransition({
        from: 'in_progress',
        to: 'waived',
        sourceEligible: true,
        artifactSatisfied: false,
        reviewedWaiver: false,
      }),
    ).toThrow('reviewed_waiver_required');
    expect(() =>
      assertWorkflowTransition({
        from: 'in_progress',
        to: 'waived',
        sourceEligible: true,
        artifactSatisfied: false,
        reviewedWaiver: true,
      }),
    ).not.toThrow();
  });

  it('keeps prohibited claims out of Phase 5 UI, service, migration summaries, fixture, and evaluation artifact', () => {
    const paths = [
      'apps/web/src/app/w/[workspaceId]/checklist/page.tsx',
      'apps/web/src/app/w/[workspaceId]/checklist/[itemId]/page.tsx',
      'apps/web/src/app/w/[workspaceId]/checklist/item-controls.tsx',
      'apps/web/src/app/w/[workspaceId]/checklist/actions.ts',
      'apps/web/src/lib/checklist/service.ts',
      'supabase/migrations/20260718000017_phase5_checklist_blockers.sql',
      'fixtures/eval/checklist-five-missing-forms.ts',
      'artifacts/evaluation/phase5-five-missing-forms-v1.json',
    ];
    const prohibited = /\bcompliant\b|\bapproved\b|safe to submit|guaranteed complete/i;
    for (const path of paths) expect(readFileSync(path, 'utf8'), path).not.toMatch(prohibited);
  });
});
