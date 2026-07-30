'use server';

import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { GUIDED_PRODUCT_TOUR_VERSION } from '@/lib/guided-tour/definitions';
import { enforceRateLimit } from '@/lib/hardening/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const guidedTourStateInputSchema = z.object({
  workspaceId: z.string().uuid(),
  tourId: z.string().regex(/^[a-z0-9-]+$/),
  tourVersion: z.literal(GUIDED_PRODUCT_TOUR_VERSION),
  status: z.enum(['started', 'completed', 'dismissed']),
  lastCompletedStep: z.number().int().nonnegative(),
});

export async function saveGuidedTourStateAction(rawInput: {
  workspaceId: string;
  tourId: string;
  tourVersion: string;
  status: string;
  lastCompletedStep: number;
}): Promise<{ ok: true; stateId: string } | { ok: false; error: string }> {
  try {
    const input = guidedTourStateInputSchema.parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in to save guided-tour progress.');
    const { data, error } = await supabase.rpc('save_guided_tour_state', {
      p_workspace_id: input.workspaceId,
      p_tour_id: input.tourId,
      p_tour_version: input.tourVersion,
      p_status: input.status,
      p_last_completed_step: input.lastCompletedStep,
    });
    if (error) throw error;
    return { ok: true, stateId: z.string().uuid().parse(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Tour progress could not be saved.',
    };
  }
}

export async function prepareGuidedDemoAction(rawInput: {
  workspaceId: string;
  reset: boolean;
}): Promise<
  | { ok: true; pristine: true; activeEvaluationRunId: string; reset: boolean }
  | { ok: false; error: string; resetRequired?: boolean }
> {
  try {
    const input = z
      .object({ workspaceId: z.string().uuid(), reset: z.boolean() })
      .strict()
      .parse(rawInput);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in to prepare the guided demo.');
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership || membership.role !== 'owner')
      throw new Error('Only the prepared demo owner can reset the walkthrough.');

    const admin = createSupabaseAdminClient();
    const [phase8Scope, phase9Scope, demoState] = await Promise.all([
      admin
        .from('phase8_demo_scopes')
        .select('id,authorized_identity_id')
        .eq('workspace_id', input.workspaceId)
        .eq('synthetic_marker', 'phase8-synthetic-demo-only')
        .maybeSingle(),
      admin
        .from('phase9_review_demo_scopes')
        .select('id')
        .eq('workspace_id', input.workspaceId)
        .eq('synthetic_marker', 'phase9-review-acceleration-demo-only')
        .maybeSingle(),
      admin
        .from('phase9_review_demo_states')
        .select('active_evaluation_run_id')
        .eq('workspace_id', input.workspaceId)
        .maybeSingle(),
    ]);
    if (
      phase8Scope.error ||
      phase9Scope.error ||
      demoState.error ||
      !phase8Scope.data ||
      !phase9Scope.data ||
      !demoState.data ||
      phase8Scope.data.authorized_identity_id !== user.id
    )
      throw new Error('The immutable prepared demo binding is unavailable.');

    if (input.reset) {
      await enforceRateLimit({
        operation: 'demo_reset',
        actorId: user.id,
        workspaceId: input.workspaceId,
      });
      const { data, error } = await admin.rpc('reset_phase9_review_demo', {
        p_workspace_id: input.workspaceId,
        p_demo_scope_id: phase9Scope.data.id,
        p_actor_id: user.id,
      });
      if (error) throw error;
      const reset = z
        .object({
          activeEvaluationRunId: z.string().uuid(),
          providerCalls: z.literal(0),
          reset: z.literal(true),
        })
        .parse(data);
      return {
        ok: true,
        pristine: true,
        activeEvaluationRunId: reset.activeEvaluationRunId,
        reset: true,
      };
    }

    const evaluationRunId = demoState.data.active_evaluation_run_id;
    const [findingDecisions, coverageDecisions, publications] = await Promise.all([
      admin
        .from('phase9_finding_review_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', input.workspaceId)
        .eq('evaluation_run_id', evaluationRunId),
      admin
        .from('phase9_coverage_review_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', input.workspaceId)
        .eq('evaluation_run_id', evaluationRunId),
      admin
        .from('phase9_bridge_runs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', input.workspaceId)
        .eq('evaluation_run_id', evaluationRunId),
    ]);
    if (findingDecisions.error || coverageDecisions.error || publications.error)
      throw new Error('The prepared demo state could not be checked.');
    if (
      (findingDecisions.count ?? 0) > 0 ||
      (coverageDecisions.count ?? 0) > 0 ||
      (publications.count ?? 0) > 0
    )
      return {
        ok: false,
        resetRequired: true,
        error:
          'This walkthrough has prior team decisions. Choose “Reset demo walkthrough” to create a fresh provider-free demo run.',
      };
    return {
      ok: true,
      pristine: true,
      activeEvaluationRunId: evaluationRunId,
      reset: false,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The guided demo could not be prepared.',
    };
  }
}
