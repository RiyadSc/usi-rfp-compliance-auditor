'use server';

import { z } from 'zod';
import { GUIDED_PRODUCT_TOUR_VERSION } from '@/lib/guided-tour/definitions';
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
