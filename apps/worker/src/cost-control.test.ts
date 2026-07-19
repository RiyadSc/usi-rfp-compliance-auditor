import { describe, expect, it, vi } from 'vitest';
import { constructProviderAfterBudget, providerBudgetRequestKey } from './cost-control.js';

describe('Phase 8 worker cost preflight', () => {
  it('never constructs a provider after a rejected reservation', async () => {
    const construct = vi.fn(() => ({ name: 'paid' }));
    await expect(
      constructProviderAfterBudget(async () => {
        throw new Error('provider_budget_preflight_failed');
      }, construct),
    ).rejects.toThrow('provider_budget_preflight_failed');
    expect(construct).not.toHaveBeenCalled();
  });

  it('uses one deterministic request identity to prevent duplicate reservations', () => {
    const input = {
      phase: 'phase4' as const,
      workspaceId: '82000000-0000-4000-8000-000000000001',
      actorId: '82000000-0000-4000-8000-000000000002',
      analysisRunId: '82000000-0000-4000-8000-000000000003',
      kind: 'verify' as const,
      runIdentity: '82000000-0000-4000-8000-000000000004',
    };
    expect(providerBudgetRequestKey(input)).toBe(providerBudgetRequestKey({ ...input }));
    expect(providerBudgetRequestKey(input)).toMatch(/^[0-9a-f]{64}$/);
  });
});
