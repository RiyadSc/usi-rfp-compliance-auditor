import { createHash } from 'node:crypto';
import type { adminClient } from './db.js';

type Admin = ReturnType<typeof adminClient>;

export const PHASE9_PROVIDER_CEILING_USD = 3;
export const PHASE9_BUDGET_POLICY_VERSION = 'phase9-budget-v1';

export function phase9ReservationKey(input: {
  workspaceId: string;
  evaluationRunId: string;
  sourcePackageHash: string;
  callPlanHash: string;
  maximumUsd: number;
}): string {
  return createHash('sha256')
    .update(
      [
        PHASE9_BUDGET_POLICY_VERSION,
        input.workspaceId,
        input.evaluationRunId,
        input.sourcePackageHash,
        input.callPlanHash,
        input.maximumUsd.toFixed(6),
      ].join(':'),
    )
    .digest('hex');
}

export async function reservePhase9CallPlan(input: {
  admin: Admin;
  workspaceId: string;
  evaluationRunId: string;
  sourcePackageHash: string;
  callPlanHash: string;
  maximumUsd: number;
}): Promise<string> {
  if (
    !Number.isFinite(input.maximumUsd) ||
    input.maximumUsd <= 0 ||
    input.maximumUsd > PHASE9_PROVIDER_CEILING_USD
  )
    throw new Error('phase9_budget_preflight_failed');
  const { data, error } = await input.admin.rpc('reserve_phase9_call_plan', {
    p_request_key: phase9ReservationKey(input),
    p_workspace_id: input.workspaceId,
    p_evaluation_run_id: input.evaluationRunId,
    p_call_plan_hash: input.callPlanHash,
    p_requested_usd: Number(input.maximumUsd.toFixed(6)),
  });
  if (error || typeof data !== 'string') {
    throw new Error(
      `phase9_budget_preflight_failed:${error?.message ?? `unexpected_rpc_data:${typeof data}`}`,
    );
  }
  return data;
}

export async function settlePhase9CallPlan(input: {
  admin: Admin;
  reservationId: string;
  actualUsd: number;
}): Promise<void> {
  if (
    !Number.isFinite(input.actualUsd) ||
    input.actualUsd < 0 ||
    input.actualUsd > PHASE9_PROVIDER_CEILING_USD
  )
    throw new Error('phase9_usage_invalid');
  const { error } = await input.admin.rpc('settle_phase9_call_plan', {
    p_reservation_id: input.reservationId,
    p_actual_usd: Number(input.actualUsd.toFixed(6)),
  });
  if (error) throw new Error('phase9_budget_settlement_failed');
}

export async function releasePhase9CallPlan(input: {
  admin: Admin;
  reservationId: string;
}): Promise<void> {
  const { error } = await input.admin.rpc('release_phase9_call_plan', {
    p_reservation_id: input.reservationId,
  });
  if (error) throw new Error('phase9_budget_release_failed');
}
