'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { phase8DemoModeSchema } from '@usi/domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createPhase8FallbackGrant,
  enforceRateLimit,
  loadExactPhase8DemoScope,
} from '@/lib/hardening/service';

const uuid = z.string().uuid();

async function context(workspaceIdRaw: string, scopeIdRaw: string) {
  const workspaceId = uuid.parse(workspaceIdRaw);
  const scopeId = uuid.parse(scopeIdRaw);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Demo scope unavailable');
  const admin = createSupabaseAdminClient();
  await loadExactPhase8DemoScope({ scopeId, workspaceId, actorId: user.id, admin });
  return { admin, user, workspaceId, scopeId };
}

export async function recordDemoFindingReview(input: {
  workspaceId: string;
  scopeId: string;
  findingKey: string;
}) {
  try {
    const { admin, user, workspaceId, scopeId } = await context(input.workspaceId, input.scopeId);
    await enforceRateLimit({
      operation: 'proposal_resolution',
      actorId: user.id,
      workspaceId,
      admin,
    });
    const findingKey = z.string().trim().min(3).max(100).parse(input.findingKey);
    const { data: prior } = await admin
      .from('phase8_demo_presentation_state')
      .select('state,reset_count')
      .eq('scope_id', scopeId)
      .maybeSingle();
    const state = {
      ...(prior?.state && typeof prior.state === 'object' ? prior.state : {}),
      mode: 'prepared',
      selectedFindingKey: findingKey,
      findingReviewDemonstrated: true,
    };
    const { error } = await admin.from('phase8_demo_presentation_state').upsert({
      scope_id: scopeId,
      workspace_id: workspaceId,
      mode: 'prepared',
      state,
      state_version: 'phase8-demo-reset-v1',
      reset_count: Number(prior?.reset_count ?? 0),
    });
    if (error) throw new Error('Demo state could not be updated');
    await admin.from('audit_events').insert({
      workspace_id: workspaceId,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'proposal_finding_resolved',
      entity_type: 'phase8_demo_scope',
      entity_id: scopeId,
      payload: { finding_key: findingKey, mode: 'prepared', synthetic_only: true },
    });
    revalidatePath(`/w/${workspaceId}/demo`);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Action failed' };
  }
}

export async function setPhase8DemoMode(input: {
  workspaceId: string;
  scopeId: string;
  mode: string;
}) {
  try {
    const { admin, user, workspaceId, scopeId } = await context(input.workspaceId, input.scopeId);
    await enforceRateLimit({ operation: 'demo_reset', actorId: user.id, workspaceId, admin });
    const mode = phase8DemoModeSchema.parse(input.mode);
    const { data: prior } = await admin
      .from('phase8_demo_presentation_state')
      .select('state,reset_count')
      .eq('scope_id', scopeId)
      .maybeSingle();
    const { error } = await admin.from('phase8_demo_presentation_state').upsert({
      scope_id: scopeId,
      workspace_id: workspaceId,
      mode,
      state: { ...(prior?.state as object | null), mode },
      state_version: 'phase8-demo-reset-v1',
      reset_count: Number(prior?.reset_count ?? 0),
    });
    if (error) throw new Error('Demo mode could not be changed');
    revalidatePath(`/w/${workspaceId}/demo`);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Action failed' };
  }
}

export async function requestDemoFallbackGrant(input: { workspaceId: string; scopeId: string }) {
  try {
    const { admin, user, workspaceId, scopeId } = await context(input.workspaceId, input.scopeId);
    const grant = await createPhase8FallbackGrant({
      scopeId,
      workspaceId,
      actorId: user.id,
      admin,
    });
    // Never return the bearer URL to this metadata-only rehearsal action. The ordinary report
    // control remains the authorized path when an operator actually needs the file.
    return {
      ok: true as const,
      expiresInSeconds: grant.expiresInSeconds,
      label: grant.label,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Grant failed' };
  }
}
