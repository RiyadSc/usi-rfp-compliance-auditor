import { createHash } from 'node:crypto';
import type { adminClient } from './db.js';

type Admin = ReturnType<typeof adminClient>;

export type ProviderBudgetPhase = 'phase3' | 'phase4';
export type ProviderBudgetKind = 'embed' | 'extract' | 'verify';

export async function constructProviderAfterBudget<T>(
  preflight: () => Promise<void>,
  construct: () => T,
): Promise<T> {
  await preflight();
  return construct();
}

export function providerBudgetRequestKey(input: {
  phase: ProviderBudgetPhase;
  workspaceId: string;
  actorId: string;
  analysisRunId: string;
  kind: ProviderBudgetKind;
  runIdentity: string;
}): string {
  return createHash('sha256')
    .update(
      [
        'phase8-cost-controls-v1',
        input.phase,
        input.workspaceId,
        input.actorId,
        input.analysisRunId,
        input.kind,
        input.runIdentity,
      ].join(':'),
    )
    .digest('hex');
}

/** Must complete before a paid provider constructor is evaluated. */
export async function reserveProviderBudget(input: {
  admin: Admin;
  phase: ProviderBudgetPhase;
  workspaceId: string;
  actorId: string;
  analysisRunId: string;
  kind: ProviderBudgetKind;
  runIdentity: string;
  requestedMaximumUsd: number;
}): Promise<string> {
  const { data, error } = await input.admin.rpc('reserve_provider_budget', {
    p_request_key: providerBudgetRequestKey(input),
    p_phase: input.phase,
    p_workspace_id: input.workspaceId,
    p_actor_id: input.actorId,
    p_analysis_run_id: input.analysisRunId,
    p_kind: input.kind,
    p_requested_max_usd: input.requestedMaximumUsd,
  });
  if (error || typeof data !== 'string') throw new Error('provider_budget_preflight_failed');
  return data;
}

export async function settleProviderBudget(input: {
  admin: Admin;
  reservationId: string;
  actualUsd: number;
}): Promise<void> {
  if (!Number.isFinite(input.actualUsd) || input.actualUsd < 0)
    throw new Error('provider_usage_invalid');
  const { error } = await input.admin.rpc('settle_provider_budget', {
    p_reservation_id: input.reservationId,
    p_actual_usd: Number(input.actualUsd.toFixed(6)),
  });
  if (error) throw new Error('provider_budget_settlement_failed');
}
