import { describe, expect, it, vi } from 'vitest';
import {
  PHASE9_PROVIDER_CEILING_USD,
  phase9ReservationKey,
  reservePhase9CallPlan,
  settlePhase9CallPlan,
} from '../../apps/worker/src/phase9-cost-control';

const base = {
  workspaceId: 'workspace-a',
  evaluationRunId: 'run-a',
  sourcePackageHash: 'a'.repeat(64),
  callPlanHash: 'b'.repeat(64),
  maximumUsd: 0.822899,
};

describe('Phase 9 exact plan budget controls', () => {
  it('binds reservation identity to the exact plan and source package', () => {
    expect(phase9ReservationKey(base)).not.toBe(
      phase9ReservationKey({ ...base, callPlanHash: 'c'.repeat(64) }),
    );
    expect(phase9ReservationKey(base)).not.toBe(
      phase9ReservationKey({ ...base, sourcePackageHash: 'd'.repeat(64) }),
    );
  });

  it('refuses a reservation above the dedicated ceiling before RPC', async () => {
    const rpc = vi.fn();
    await expect(
      reservePhase9CallPlan({
        admin: { rpc } as never,
        ...base,
        maximumUsd: PHASE9_PROVIDER_CEILING_USD + 0.000001,
      }),
    ).rejects.toThrow('phase9_budget_preflight_failed');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reserves and settles only through dedicated Phase 9 RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 'reservation-id', error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const reservationId = await reservePhase9CallPlan({
      admin: { rpc } as never,
      ...base,
    });
    await settlePhase9CallPlan({
      admin: { rpc } as never,
      reservationId,
      actualUsd: 0.4,
    });
    expect(rpc.mock.calls[0]![0]).toBe('reserve_phase9_call_plan');
    expect(rpc.mock.calls[1]![0]).toBe('settle_phase9_call_plan');
  });
});
