'use server';

import { z } from 'zod';
import { phase8PerformanceOperationSchema } from '@usi/domain';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordPerformanceEvent } from '@/lib/hardening/service';

const clientPerformanceSchema = z
  .object({
    workspaceId: z.string().uuid().nullable(),
    events: z
      .array(
        z
          .object({
            operation: phase8PerformanceOperationSchema,
            durationMs: z.number().int().min(0).max(600_000),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

export async function recordClientPerformanceAction(raw: unknown) {
  try {
    const input = clientPerformanceSchema.parse(raw);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false as const };
    if (input.workspaceId) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', input.workspaceId)
        .maybeSingle();
      if (!workspace) return { ok: false as const };
    }
    for (const event of input.events)
      await recordPerformanceEvent({
        workspaceId: input.workspaceId,
        actorId: user.id,
        event: {
          version: 'phase8-performance-v1',
          operation: event.operation,
          durationMs: event.durationMs,
          itemCount: null,
          pageCount: null,
          cacheOutcome: null,
          status: 'success',
          errorCategory: null,
        },
      });
    return { ok: true as const };
  } catch {
    // Client timing is non-authoritative and best-effort; never disclose the rejected input.
    return { ok: false as const };
  }
}
